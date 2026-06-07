const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('/tmp/galaxy.db'); 

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🗄️ DATABASE SETUP
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, email TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000')");
});

const translations = {
    en: {
        title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration",
        user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number",
        btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here",
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Tasks 👇",
        subText: "Complete the tasks below. Earnings will be added to your balance.", logout: "Logout",
        forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය", pass: "මුරපදය", email: "ඊමේල්", addr: "ලිපිනය", phone: "දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "කිරීමට ඇති වැඩ (Tasks) 👇",
        subText: "පහත ඇති Tasks සම්පූර්ණ කරන්න. මුදල් ගිණුමට එකතු වේ.", logout: "ඉවත් වන්න",
        forgot: "මුරපදය අමතකද?", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "පෙන්වන්න"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர்", pass: "கடவுச்சொல்", email: "மின்னஞ்சல்", addr: "முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "பணிகளை முடிக்கவும். உங்கள் வருவாய் கணக்கில் சேர்க்கப்படும்.", logout: "வெளியேறு",
        forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;}
        .container{max-width:800px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;}
        input{width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;}
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;cursor:pointer;border-radius:5px;}
        .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-left:5px solid #45a29e;}
    </style></head><body><div class="container"><h2 style="text-align:center;color:#66fcf1;">${translations[lang].title}</h2>${content}</div></body></html>`;
};

// 🔎 MULTI-NETWORK POSTBACK HANDLER
app.get('/postback/:network', (req, res) => {
    const network = req.params.network;
    const { subid, reward, task_name, amount, clickid, s1, payout } = req.query;

    // විවිධ ජාලවල පරාමිතීන් එකම Username එකට ගැනීම
    const username = subid || s1 || clickid; 
    const earnings = parseFloat(reward || amount || payout || 0);

    if (username && earnings > 0) {
        const workerReward = earnings * 0.70; // 30% කපා ගැනීම
        db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [workerReward, username]);
        db.run("INSERT INTO task_logs (username, task_name, amount) VALUES (?, ?, ?)", [username, `${network.toUpperCase()} - ${task_name || 'Offer'}`, workerReward]);
        res.status(200).send('OK');
    } else {
        res.status(400).send('Invalid Parameters');
    }
});

// LOGIN, REGISTER, DASHBOARD කොටස් මෙතැන් සිට...
// (ඔබේ කලින් තිබූ කෝඩ් එකම මෙතනට භාවිතා කරන්න, Dashboard එකේ පමණක් පහත වෙනස කරන්න)

app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = req.session.user.username;
    const t = translations[req.session.lang || 'en'];

    if (user === 'admin') {
        // Admin Dashboard එකේ ලින්ක් සහ දත්ත පෙන්වීම
        res.send(htmlWrapper(req, 'Admin', `...`)); 
    } else {
        // සේවකයින්ට පෙන්විය යුතු Offer Wall Tab එක
        const offerWalls = `
            <h3>${t.tasks}</h3>
            <div id="tab-btns">
                <button onclick="document.getElementById('frame').src='YOUR_CPAGRIP_LINK?subid=${user}'">CPA Grip</button>
                <button onclick="document.getElementById('frame').src='YOUR_CPALEAD_LINK?subid=${user}'">CPA Lead</button>
                <button onclick="document.getElementById('frame').src='YOUR_MAXBOUNTY_LINK?s1=${user}'">MaxBounty</button>
            </div>
            <iframe id="frame" src="" width="100%" height="600px" style="background:#fff; margin-top:20px;"></iframe>
        `;
        res.send(htmlWrapper(req, 'Dashboard', offerWalls));
    }
});

// ... ඉතිරි කොටස් (Logout, Login logic ආදිය) එලෙසම තබන්න.
