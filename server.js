const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('./galaxy.db'); // ස්ථිරව දත්ත සුරැකීමට

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🗄️ DATABASE SETUP
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, email TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT, commission_rate REAL DEFAULT 100.0)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS cpa_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, network_name TEXT, api_token TEXT, embed_code TEXT, is_active INTEGER DEFAULT 1)");
    
    // Admin ගිණුම
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact, commission_rate) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000', 100.0)");
});

const translations = {
    en: { title: "GALAXY WORKERS", login: "Worker Login", user: "Username", pass: "Password", btnLog: "LOG IN", tasks: "Available Tasks", logout: "Logout" },
    si: { title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", user: "පරිශීලක නාමය", pass: "මුරපදය", btnLog: "ඇතුල් වන්න", tasks: "කිරීමට ඇති වැඩ", logout: "ඉවත් වන්න" },
    ta: { title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", user: "பயனர் பெயர்", pass: "கடவுச்சொல்", btnLog: "உள்நுழைக", tasks: "கிடைக்கக்கூடிய பணிகள்", logout: "வெளியேறு" }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;}
    .container{max-width:800px;margin:auto;background:#1f2833;padding:20px;border-radius:10px;}
    input, button, textarea{width:100%;padding:10px;margin:10px 0;border-radius:5px;}
    button{background:#45a29e;border:none;color:#fff;cursor:pointer;}
    .user-row{background:#0b0c10;padding:10px;margin:10px 0;border-left:5px solid #66fcf1;}</style></head>
    <body><div class="container"><h2>${translations[lang].title}</h2>${content}</div></body></html>`;
};

// --- LOGIN & DASHBOARD ---
app.get('/', (req, res) => {
    if (req.session.user === 'admin') return res.redirect('/admin');
    if (req.session.user) return res.redirect('/dashboard');
    res.send(htmlWrapper(req, 'Login', `
        <form action="/login" method="POST">
            <input type="text" name="username" placeholder="Username" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">LOGIN</button>
        </form>`));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
        if (user) {
            req.session.user = username;
            res.redirect(username === 'admin' ? '/admin' : '/dashboard');
        } else res.send("Login Failed");
    });
});

// --- ADMIN PANEL ---
app.get('/admin', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    db.all("SELECT * FROM users", [], (err, users) => {
        let userList = users.map(u => `
            <div class="user-row">
                ${u.username} | Bal: ${u.balance} | Rate: ${u.commission_rate}% 
                <form action="/admin/delete-user" method="POST" style="display:inline;">
                    <input type="hidden" name="username" value="${u.username}">
                    <button style="width:auto;background:red;">Delete</button>
                </form>
            </div>`).join('');
        
        res.send(htmlWrapper(req, 'Admin', `
            <h3>Admin Panel</h3>
            <a href="/admin/cpa">CPA Configs</a><hr>
            ${userList}
        `));
    });
});

// User Delete කිරීම
app.post('/admin/delete-user', (req, res) => {
    db.run("DELETE FROM users WHERE username = ? AND username != 'admin'", [req.body.username], () => res.redirect('/admin'));
});

// CPA Configs (Admin)
app.get('/admin/cpa', (req, res) => {
    res.send(htmlWrapper(req, 'CPA Settings', `
        <h3>Add CPA Network</h3>
        <form action="/admin/cpa-save" method="POST">
            <input type="text" name="network_name" placeholder="Network Name">
            <input type="text" name="api_token" placeholder="API Token/Key">
            <textarea name="embed_code" placeholder="Embed Code"></textarea>
            <button type="submit">SAVE</button>
        </form>`));
});

app.post('/admin/cpa-save', (req, res) => {
    const { network_name, api_token, embed_code } = req.body;
    db.run("INSERT INTO cpa_configs (network_name, api_token, embed_code) VALUES (?, ?, ?)", [network_name, api_token, embed_code], () => res.redirect('/admin'));
});

// --- USER DASHBOARD ---
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    db.get("SELECT * FROM users WHERE username = ?", [req.session.user], (err, user) => {
        db.all("SELECT * FROM cpa_configs", [], (err, cpas) => {
            let tasks = cpas.map(c => `
                <div class="user-row">
                    <h4>${c.network_name}</h4>
                    ${c.embed_code}
                </div>`).join('');
            res.send(htmlWrapper(req, 'Dashboard', `<h3>Welcome ${user.username}</h3><p>Earnings: ${user.balance}</p>${tasks}`));
        });
    });
});

app.listen(3000, () => console.log('Server started on port 3000'));
