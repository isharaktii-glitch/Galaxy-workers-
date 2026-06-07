const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('/tmp/galaxy.db'); 

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🛠️ DATABASE SETUP: Admin එකවුන්ට් එක හැමවිටම ඔටෝ හැදෙන කෑල්ල ඇතුළත් කර ඇත!
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    
    // Admin එක නැත්නම් විතරක් ඔටෝ හදනවා (Password: admin123)
    db.run("INSERT OR IGNORE INTO users (username, password, balance, address, contact) VALUES ('admin', 'admin123', 0.0, 'Headquarters', '0000000000')");
});

// බහුභාෂා පරිවර්තන (Translations)
const translations = {
    en: {
        title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration",
        user: "Username", pass: "Password", addr: "Full Address", phone: "Contact Number",
        btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here",
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Micro Tasks 👇",
        subText: "Complete the tasks below. Your earnings will automatically add to your balance.", logout: "Logout"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "කිරීමට ඇති සරල වැඩ (Tasks) 👇",
        subText: "පහත ඇති Tasks සම්පූර්ණ කරන්න. ඔබ උපයන මුදල් ස්වයංක්‍රීයවම ගිණුමට එකතු වේ.", logout: "ඉවත් වන්න (Logout)"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", addr: "முழு முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் வருவாய் தானாகவே உங்கள் கணக்கில் சேர்க்கப்படும்.", logout: "வெளியேறு (Logout)"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} 
        .container{max-width:800px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;}
        .lang-selector { position: absolute; top: 15px; right: 15px; }
        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        input{width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;}
        button:hover{background:#66fcf1;}
        .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;}
        a{color:#66fcf1;text-decoration:none;} .logout-btn{background:#ff4d4d;color:#fff;width:auto;padding:5px 10px;font-size:12px;float:right;}
    </style></head><body><div class="container">
    <div class="lang-selector">
        <select onchange="window.location.href='/change-lang?lang=' + this.value}">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
            <option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option>
        </select>
    </div><h2 style="text-align:center;color:#66fcf1;margin-top:15px;">${translations[lang].title}</h2>${content}</div></body></html>`;
};

app.get('/change-lang', (req, res) => {
    const selectedLang = req.query.lang;
    if (['en', 'si', 'ta'].includes(selectedLang)) req.session.lang = selectedLang;
    res.redirect('back');
});

// 1. LOGIN PAGE
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Login', `
        <h3>${t.login}</h3>
        <form action="/login" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <input type="password" name="password" placeholder="${t.pass}" required>
            <button type="submit">${t.btnLog}</button>
        </form>
        <p style="text-align:center;">${t.noAcc} <a href="/register">${t.regHere}</a></p>
    `));
});

// 2. REGISTER PAGE
app.get('/register', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Register', `
        <h3>${t.reg}</h3>
        <form action="/register" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <input type="password" name="password" placeholder="${t.pass}" required>
            <input type="text" name="address" placeholder="${t.addr}" required>
            <input type="text" name="contact" placeholder="${t.phone}" required>
            <button type="submit">${t.btnReg}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

app.post('/register', (req, res) => {
    const { username, password, address, contact } = req.body;
    db.run("INSERT INTO users (username, password, address, contact) VALUES (?, ?, ?, ?)", [username, password, address, contact], (err) => {
        if (err) return res.send(htmlWrapper(req, 'Error', `<h3>Username already exists!</h3><a href="/register">Try again</a>`));
        res.redirect('/');
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) { 
            req.session.user = row; 
            res.redirect('/dashboard'); 
        } else {
            res.send(htmlWrapper(req, 'Error', `<div style="border:1px solid #ff4d4d; padding:20px; border-radius:5px;"><h3>Invalid Username or Password!</h3><a href="/">Try again</a></div>`));
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 3. DASHBOARD & ADMIN CONTROL PANEL
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = req.session.user.username;
    const t = translations[req.session.lang || 'en'];

    if (user === 'admin') {
        db.all("SELECT * FROM users WHERE username != 'admin'", [], (err, users) => {
            let list = users.map(u => `
                <div class="user-row">
                    <strong>Worker:</strong> ${u.username} | <strong>Balance:</strong> $${u.balance.toFixed(4)} <br>
                    <strong>Password:</strong> <span style="color:#66fcf1;">${u.password}</span> (Recovery) <br>
                    <strong>Address:</strong> ${u.address} | <strong>Contact:</strong> ${u.contact}
                </div>
            `).join('');
            
            res.send(htmlWrapper(req, 'Owner Control Panel', `
                <a href="/logout" class="logout-btn">${t.logout}</a>
                <h2 style="color:#ff4d4d;text-align:left;">🛠️ OWNER CONTROL PANEL</h2>
                <p>Welcome back, Boss! Registered workers tracking panel:</p>
                <hr style="border-color:#45a29e;">
                ${list || '<p style="text-align:center;color:#888;">No workers registered yet.</p>'}
                <hr style="border-color:#45a29e;">
                <h3 style="margin-top:20px;"><a href="/admin/logs">📊 View Detailed Task Logs</a></h3>
            `));
        });
    } else {
        db.get("SELECT balance FROM users WHERE username = ?", [user], (err, row) => {
            const currentBalance = row ? row.balance.toFixed(4) : '0.0000';
            res.send(htmlWrapper(req, 'Dashboard', `
                <a href="/logout" class="logout-btn">${t.logout}</a>
                <h2>${t.welcome}, ${user}! ✨</h2>
                <div style="background:#0b0c10; padding:15px; border-radius:5px; margin-bottom:20px; border:1px solid #45a29e;">
                    <span style="font-size:18px;">${t.total}:</span> 
                    <span style="font-size:24px; color:#66fcf1; font-weight:bold; float:right;">$${currentBalance}</span>
                </div>
                <h3 style="color:#66fcf1; margin-bottom:10px; text-align:left;">${t.tasks}</h3>
                <p style="font-size:13px; color:#aaa; text-align:left;">${t.subText}</p>
                
                <iframe src="https://timewall.io/embed/your-widget-id-here" width="100%" height="600px" frameborder="0" style="border-radius:8px; background:#fff; margin-top:15px;"></iframe>
            `));
        });
    }
});

// 4. ADMIN DETAILED TASK LOGS
app.get('/admin/logs', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    
    db.all("SELECT * FROM task_logs ORDER BY timestamp DESC", [], (err, logs) => {
        let logList = logs.map(l => `
            <div class="user-row" style="border-left-color: #66fcf1;">
                <strong>Worker:</strong> ${l.username} <br>
                <strong>Task Details:</strong> ${l.task_name} <br>
                <strong>Earned (After 30% Profit Cut):</strong> <span style="color:#66fcf1;">$${l.amount.toFixed(4)}</span> <br>
                <small style="color:#aaa;">Time: ${l.timestamp}</small>
            </div>
        `).join('');
        
        res.send(htmlWrapper(req, 'Task Logs', `
            <a href="/dashboard" style="font-size:14px;"><- Back to Control Panel</a>
            <h2 style="color:#66fcf1; margin-top:15px;">Completed Task Logs</h2>
            ${logList || '<p style="text-align:center;color:#888;">No tasks completed yet.</p>'}
        `));
    });
});

// 5. AUTOMATIC TIMEWALL POSTBACK (30% Profit Deduction)
app.get('/postback', (req, res) => {
    const { subid, reward, task_name } = req.query;
    if (subid && reward) {
        const workerReward = parseFloat(reward) * 0.70; // 30% Profit Cut
        db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [workerReward, subid]);
        db.run("INSERT INTO task_logs (username, task_name, amount) VALUES (?, ?, ?)", [subid, task_name || 'Micro Task', workerReward]);
        res.send('OK');
    } else {
        res.status(400).send('Invalid Parameters');
    }
});

module.exports = app;
