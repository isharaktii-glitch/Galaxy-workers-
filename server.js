const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

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
    en: {
        title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration",
        user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number",
        btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here",
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Micro Tasks 👇",
        subText: "Complete the tasks below. Your earnings will automatically add to your balance.", logout: "Logout",
        forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER",
        changePass: "Change Password", btnUpdate: "UPDATE PASSWORD", currentPass: "Current Password", newPass: "New Password",
        cpaTitle: "🔗 CPA Networks Integration", taskInstr: "Task Instructions", btnPay: "Pay & Reset", btnRemove: "Remove"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "කිරීමට ඇති සරල වැඩ (Tasks) 👇",
        subText: "පහත ඇති Tasks සම්පූර්ණ කරන්න. ඔබ උපයන මුදල් ස්වයංක්‍රීයවම ගිණුමට එකතු වේ.", logout: "ඉවත් වන්න (Logout)",
        forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න",
        changePass: "මුරපදය වෙනස් කරන්න", btnUpdate: "මුරපදය යාවත්කාලීන කරන්න", currentPass: "වත්මන් මුරපදය", newPass: "නව මුරපදය",
        cpaTitle: "🔗 CPA ජාල සැකසුම්", taskInstr: "වැඩසටහනේ උපදෙස්", btnPay: "ගෙවා ශේෂය බිංදු කරන්න", btnRemove: "ඉවත් කරන්න"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் வருவாய் தானாகவே உங்கள் கணக்கில் சேர்க்கப்படும்.", logout: "வெளியேறு (Logout)",
        forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்",
        changePass: "கடவுச்சொல்லை மாற்றவும்", btnUpdate: "கடவுச்சொல்லைப் புதுப்பி", currentPass: "தற்போதைய கடவுச்சொல்", newPass: "புதிய கடவுச்சொல்",
        cpaTitle: "🔗 CPA நெட்வொர்க் இணைப்பு", taskInstr: "பணி வழிமுறைகள்", btnPay: "பணம் செலுத்தி பூஜ்ஜியமாக்கு", btnRemove: "நீக்கு"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} 
        .container{max-width:850px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;}
        .lang-selector { position: absolute; top: 15px; right: 15px; }
        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        input, textarea {width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} 
        button{padding:10px 15px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;border-radius:5px;cursor:pointer;margin-top:5px;}
        .user-row{background:#0b0c10;padding:15px;margin:10px 0;border-radius:5px;border-left:5px solid #66fcf1;text-align:left;}
        .btn-pay{background:#66fcf1;color:#0b0c10;} .btn-rem{background:#ff4d4d;color:#fff;}
        .logout-btn{background:#ff4d4d;color:#fff;padding:5px 10px;float:right;border-radius:3px;text-decoration:none;}
    </style></head><body><div class="container">
    <div class="lang-selector">
        <select onchange="window.location.href='/change-lang?lang=' + this.value}">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
            <option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option>
        </select>
    </div><h2 style="text-align:center;color:#66fcf1;">${translations[lang].title}</h2>${content}</div></body></html>`;
};

app.get('/change-lang', (req, res) => {
    const selectedLang = req.query.lang;
    if (['en', 'si', 'ta'].includes(selectedLang)) req.session.lang = selectedLang;
    res.redirect(req.get('referer') || '/');
});

// ADMIN ACTIONS: PAY & REMOVE
app.post('/admin/pay-user', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    db.run("UPDATE users SET balance = 0 WHERE username = ?", [req.body.username], () => res.redirect('/dashboard'));
});

app.post('/admin/remove-user', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    db.run("DELETE FROM users WHERE username = ? AND username != 'admin'", [req.body.username], () => res.redirect('/dashboard'));
});

// DASHBOARD
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = req.session.user.username;
    const t = translations[req.session.lang || 'en'];

    if (user === 'admin') {
        db.all("SELECT * FROM users WHERE username != 'admin'", [], (err, users) => {
            let list = users.map(u => `
                <div class="user-row">
                    <strong>Worker:</strong> ${u.username} | <strong>Balance:</strong> $${u.balance.toFixed(4)} <br>
                    <form action="/admin/pay-user" method="POST" style="display:inline;">
                        <input type="hidden" name="username" value="${u.username}">
                        <button type="submit" class="btn-pay">${t.btnPay}</button>
                    </form>
                    <form action="/admin/remove-user" method="POST" style="display:inline;" onsubmit="return confirm('Confirm remove?');">
                        <input type="hidden" name="username" value="${u.username}">
                        <button type="submit" class="btn-rem">${t.btnRemove}</button>
                    </form>
                </div>
            `).join('');
            res.send(htmlWrapper(req, 'Admin', `<a href="/logout" class="logout-btn">${t.logout}</a><h2>🛠️ CONTROL PANEL</h2>${list}`));
        });
    } else {
        db.get("SELECT balance FROM users WHERE username = ?", [user], (err, row) => {
            res.send(htmlWrapper(req, 'Dashboard', `
                <a href="/logout" class="logout-btn">${t.logout}</a>
                <h2>${t.welcome}, ${user}!</h2>
                <div style="font-size:20px;">${t.total}: <strong>$${row ? row.balance.toFixed(4) : '0.0000'}</strong></div>
            `));
        });
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) { req.session.user = row; res.redirect('/dashboard'); }
        else res.send(htmlWrapper(req, 'Error', '<h3>Invalid Login</h3>'));
    });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

module.exports = app;
