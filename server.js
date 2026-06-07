const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('./galaxy.db'); // ගොනුව folder එකේම තබා ගන්න (Permanent)

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// DATABASE SETUP
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, email TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS cpa_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, network_name TEXT, embed_code TEXT, instructions_en TEXT, instructions_si TEXT, instructions_ta TEXT, is_active INTEGER DEFAULT 1)");
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000')");
});

const translations = {
    en: { title: "GALAXY WORKERS", btnPay: "Pay & Reset", btnRemove: "Remove", logout: "Logout", total: "Total Earnings" },
    si: { title: "GALAXY WORKERS", btnPay: "ගෙවා ශේෂය බිංදු කරන්න", btnRemove: "ඉවත් කරන්න", logout: "ඉවත් වන්න", total: "මුළු උපයනය" },
    ta: { title: "GALAXY WORKERS", btnPay: "பணம் செலுத்தி பூஜ்ஜியமாக்கு", btnRemove: "நீக்கு", logout: "வெளியேறு", total: "மொத்த வருவாய்" }
};

const htmlWrapper = (req, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
        body{background:#0b0c10;color:#fff;font-family:sans-serif;padding:20px;}
        .container{max-width:800px;margin:auto;background:#1f2833;padding:20px;border-radius:10px;}
        .user-row{background:#000;padding:15px;margin:10px 0;border-left:5px solid #66fcf1;}
        button{padding:8px;cursor:pointer;background:#45a29e;border:none;color:#fff;border-radius:4px;}
        .rem{background:#ff4d4d;}
    </style></head><body><div class="container">
    <div style="text-align:right;"><a href="/logout" style="color:red;">${t.logout}</a></div>
    ${content}</div></body></html>`;
};

// ADMIN ACTIONS
app.post('/admin/pay-user', (req, res) => {
    if (req.session.user?.username !== 'admin') return res.redirect('/');
    db.run("UPDATE users SET balance = 0 WHERE username = ?", [req.body.username], () => res.redirect('/dashboard'));
});

app.post('/admin/remove-user', (req, res) => {
    if (req.session.user?.username !== 'admin') return res.redirect('/');
    db.run("DELETE FROM users WHERE username = ? AND username != 'admin'", [req.body.username], () => res.redirect('/dashboard'));
});

// DASHBOARD
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const t = translations[req.session.lang || 'en'];
    
    if (req.session.user.username === 'admin') {
        db.all("SELECT * FROM users WHERE username != 'admin'", [], (err, users) => {
            let list = users.map(u => `
                <div class="user-row">
                    <strong>${u.username}</strong> | Balance: $${u.balance.toFixed(4)}
                    <form action="/admin/pay-user" method="POST" style="display:inline;"><input type="hidden" name="username" value="${u.username}"><button>${t.btnPay}</button></form>
                    <form action="/admin/remove-user" method="POST" style="display:inline;"><input type="hidden" name="username" value="${u.username}"><button class="rem">${t.btnRemove}</button></form>
                </div>`).join('');
            res.send(htmlWrapper(req, `<h2>🛠️ ADMIN PANEL</h2>${list}`));
        });
    } else {
        db.get("SELECT balance FROM users WHERE username = ?", [req.session.user.username], (err, row) => {
            res.send(htmlWrapper(req, `<h2>Welcome, ${req.session.user.username}</h2><p>${t.total}: $${row.balance.toFixed(4)}</p>`));
        });
    }
});

app.post('/login', (req, res) => {
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [req.body.username, req.body.password], (err, row) => {
        if (row) { req.session.user = row; res.redirect('/dashboard'); }
        else res.send("Login Failed");
    });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.get('/', (req, res) => res.send('<h3>Login Page</h3><form action="/login" method="POST"><input name="username"><input name="password" type="password"><button>Login</button></form>'));

app.listen(3000, () => console.log('Server running on port 3000'));
