const express = require('express');
const crypto = require('crypto');
const fs = require('fs');

function randomString(length) {
    let result           = '';
    let characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

class DB {
    constructor(fileName, defaultData = {counts: {}, latest: {}}) {
        try {
            const dbFile = fs.readFileSync(fileName).toString();
            this.data = JSON.parse(dbFile);
        } catch (e) {
            this.data = defaultData;
        } finally {
            this.fileName = fileName;
        }
    }

    hashString(string) {
        return crypto.createHash('sha256').update(string).digest('hex');
    }

    refreshRandom() {
        // clear votes, new random
        this.data.latest = {};

        this.random = randomString(20);
    }

    save() {
        fs.writeFileSync(this.fileName, JSON.stringify(this.data));
    }

    addVote(site = "", voteIp="", vote = "1") {
        if (!this.data.latest[site]) {
            this.data.latest[site] = {}
        }

        if (!this.data.counts[site]) {
            this.data.counts[site] = [0, 0]
        }

        const id = this.hashString(this.random + voteIp);

        if (this.data.latest[site][id] === "-1") {
            this.data.counts[site][1] -= 1
        }

        if (this.data.latest[site][id] === "1") {
            this.data.counts[site][0] -= 1
        }

        if (vote === "1") {
            this.data.counts[site][0] += 1;
        }

        if (vote === "-1") {
            this.data.counts[site][1] += 1;
        }

        this.data.latest[site][id] = vote;
    }
}

const db = new DB("./db.json");

// only works when there is no task running
// because we have a server always listening port, this handler will NEVER execute
process.on("beforeExit", (code) => {
    console.log("Saving DB");
    saveAndCleanup();
    console.log("Process beforeExit event with code: ", code);
});

// only works when the process normally exits
// on windows, ctrl-c will not trigger this handler (it is unnormal)
// unless you listen on 'SIGINT'
process.on("exit", (code) => {
    console.log("Saving DB");
    saveAndCleanup();
    console.log("Process exit event with code: ", code);
});

// just in case some user like using "kill"
process.on("SIGTERM", () => {
    console.log("Saving DB");
    saveAndCleanup();
    process.exit(0);
});

// catch ctrl-c, so that event 'exit' always works
process.on("SIGINT", () => {
    console.log("Saving DB");
    saveAndCleanup();
    process.exit(0);
});

// what about errors
// try remove/comment this handler, 'exit' event still works
process.on("uncaughtException", () => {
    console.log("Saving DB");
    saveAndCleanup();
    process.exit(1);
});


const app = express();

// load votes from file

app.post('/votes/:site/:vote', (req, res) => {
    const site = req.params.site;
    const vote = req.params.vote;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!vote in ["1", "0", "-1"]) {
        return res.json({success: false});
    }

    db.addVote(site, ip, vote);

    return res.json({success: true, percent: getPercent(site)});
});

function getPercent(site) {
    if (!db.data.counts[site]) {
        db.data.counts[site] = [0,0];
    }

    let counts = db.data.counts[site];

    // get vote percentage
    let percent = (counts[0]-counts[1]) / (counts[0]+counts[1]);

    if (isNaN(percent)) percent = 0;

    percent = Math.floor(percent * 100);

    return percent;
}

app.get('/votes/:site', (req, res) => {
    const site = req.params.site;

    return res.json({percent: getPercent(site), success: true});
});

function saveAndCleanup() {
    db.refreshRandom();
    db.save();
}

setInterval(saveAndCleanup, 86400000)

try {
    app.listen(3000, () => {
        console.log('App listening on port 3000!');
    });
} catch (e) {
    console.log("Saving DB");
    saveAndCleanup();
}
