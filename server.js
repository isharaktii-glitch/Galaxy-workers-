const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();

// Database path (Vercel සඳහා /tmp භාවිතා කිරීම)
const dbPath = path.join('/tmp', 'galaxy.db');
const db = new sqlite3.Database(dbPath);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'galaxy-2026-super-secret', 
    resave: false, 
    saveUninitialized: true 
}));

// DATABASE INITIALIZATION
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, email TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000')");
});

// Translations Object (ඔබේ original එකම පාවිච්චි කරන්න)
const translations = { /* ... මෙහි පෙර තිබූ translations කොටස ඇතුළත් කරන්න ... */ };
const en = { title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration", user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number", btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here", backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Micro Tasks 👇", subText: "Complete the tasks below. Your earnings will automatically add to your balance.", logout: "Logout", forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER" };
const si = { title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය", user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය", btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න", backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "කිරීමට ඇති සරල වැඩ (Tasks) 👇", subText: "පහත ඇති Tasks සම්පූර්ණ කරන්න. ඔබ උපයන මුදල් ස්වයංක්‍රීයවම ගිණුමට එකතු වේ.", logout: "ඉවත් වන්න (Logout)", forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න" };
const ta = { title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு", user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்", btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்", backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇", subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் வருவாய் தானாகவே உங்கள் கணக்கில் சேர்க்கப்படும்.", logout: "வெளியேறு (Logout)", forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்" };

const getLangData = (req) => {
    const lang = req.session.lang || 'en';
    const dict = { en, si, ta };
    return dict[lang] || en;
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = getLangData(req);
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} .container{max-width:800px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;} input{width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;cursor:pointer;} .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-left:5px solid #45a29e;}</style></head><body><div class="container"><h2 style="text-align:center;color:#66fcf1;">${t.title}</h2>${content}</div></body></html>`;
};

// Routes
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    const t = getLangData(req);
    res.send(htmlWrapper(req, 'Login', `<h3>${t.login}</h3><form action="/login" method="POST"><input type="text" name="username" placeholder="${t.user}" required><input type="password" name="password" placeholder="${t.pass}" required><button type="submit">${t.btnLog}</button></form>`));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) { req.session.user = row; res.redirect('/dashboard'); }
        else res.send("Invalid Login");
    });
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    // Dashboard logic...
    res.send("Welcome to Dashboard");
});

module.exports = app;
