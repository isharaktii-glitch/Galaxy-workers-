const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch'); // Webhook දත්ත යැවීමට

const app = express();
const db = new sqlite3.Database('/tmp/galaxy.db'); 

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, email TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS cpa_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, network_name TEXT, embed_code TEXT, instructions_en TEXT, instructions_si TEXT, instructions_ta TEXT, is_active INTEGER DEFAULT 1)");
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000')");
});

const translations = {
    en: { title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration", user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number", btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here", backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Micro Tasks 👇", subText: "Complete the tasks below.", logout: "Logout", forgot: "Forgot Password?", cpaTitle: "Available Tasks" },
    si: { title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය", user: "පරිශීලක නාමය", pass: "මුරපදය", email: "ඊමේල් ලිපිනය", addr: "සම්පූර්ණ ලිපිනය", phone: "දුරකථන අංකය", btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න", backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "කිරීමට ඇති සරල වැඩ 👇", subText: "පහත ඇති Tasks සම්පූර්ණ කරන්න.", logout: "ඉවත් වන්න", forgot: "මුරපදය අමතකද?", cpaTitle: "කිරීමට ඇති වැඩ" },
    ta: { title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு", user: "பயனர் பெயர்", pass: "கடவுச்சொல்", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்", btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்", backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇", subText: "பணிகளை முடிக்கவும்.", logout: "வெளியேறு", forgot: "கடவுச்சொல் மறந்துவிட்டதா?", cpaTitle: "கிடைக்கக்கூடிய பணிகள்" }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;} 
        .container{max-width:850px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;}
        input, select{width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;cursor:pointer;}
        .user-row{background:#0b0c10;padding:10px;margin:5px 0;border-left:5px solid #45a29e;}
        .remove-btn{background:#ff4d4d;color:white;border:none;padding:5px;cursor:pointer;}
    </style></head><body><div class="container"><h2 style="text-align:center;color:#66fcf1;">${translations[lang].title}</h2>${content}</div></body></html>`;
};

// Admin Dashboard - User Management
app.get('/admin', (req, res) => {
    if (req.session.username !== 'admin') return res.redirect('/');
    db.all("SELECT * FROM users WHERE username != 'admin'", [], (err, rows) => {
        let rowsHtml = rows.map(u => `<div class="user-row">${u.username} | ${u.email} <form action="/admin/delete" method="POST" style="display:inline;"><input type="hidden" name="id" value="${u.id}"><button class="remove-btn">Remove</button></form></div>`).join('');
        res.send(htmlWrapper(req, 'Admin', `<h3>Worker List</h3>${rowsHtml}<a href="/dashboard">Back</a>`));
    });
});

app.post('/admin/delete', (req, res) => {
    if (req.session.username !== 'admin') return res.redirect('/');
    db.run("DELETE FROM users WHERE id = ?", [req.body.id], () => res.redirect('/admin'));
});

// Worker Dashboard - CPA Embed only
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const t = translations[req.session.lang || 'en'];
    db.all("SELECT embed_code FROM cpa_configs WHERE is_active = 1", [], (err, rows) => {
        let tasks = rows.map(r => `<div class="cpa-box">${r.embed_code}</div>`).join('');
        res.send(htmlWrapper(req, 'Dashboard', `<h3>${t.welcome}, ${req.session.user}</h3>${tasks}<a href="/logout">Logout</a>`));
    });
});

// Google Sheet Webhook Example (ඔබේ make.com URL එක මෙතන දාන්න)
async function sendToGoogleSheet(data) {
    const webhookUrl = 'YOUR_MAKE_COM_WEBHOOK_URL_HERE';
    await fetch(webhookUrl, { method: 'POST', body: JSON.stringify(data), headers: {'Content-Type': 'application/json'} });
}

// ... ಉಳಿದ login/register routes පෙර පරිදිම පවතී ...

app.listen(3000, () => console.log('Server running on port 3000'));
