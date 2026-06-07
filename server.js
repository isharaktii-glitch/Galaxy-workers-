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
    db.run("CREATE TABLE IF NOT EXISTS cpa_offers (id INTEGER PRIMARY KEY AUTOINCREMENT, network_name TEXT, offer_title TEXT, offer_link TEXT, payout REAL, instruction_en TEXT, status TEXT DEFAULT 'active')");
    db.run("CREATE TABLE IF NOT EXISTS offerwall_settings (id INTEGER PRIMARY KEY, wall_name TEXT, wall_url TEXT)");
    
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000')");
    
    db.run("INSERT OR IGNORE INTO offerwall_settings (id, wall_name, wall_url) VALUES (1, 'Galaxy Core', '')");
    db.run("INSERT OR IGNORE INTO offerwall_settings (id, wall_name, wall_url) VALUES (2, 'Galaxy Premium', '')");
    db.run("INSERT OR IGNORE INTO offerwall_settings (id, wall_name, wall_url) VALUES (3, 'Galaxy Exclusive', '')");
});

const translations = {
    en: { title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration", user: "Username", pass: "Password", btnLog: "LOG IN", btnReg: "REGISTER", logout: "Logout", welcome: "Welcome", total: "Total Earnings", tasks: "Available Tasks 👇", cpaTasks: "🔥 Bonus Tasks", instructionTitle: "Instructions:" },
    si: { title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය", user: "පරිශීලක නාමය", pass: "මුරපදය", btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", logout: "ඉවත් වන්න", welcome: "ආයුබෝවන්", total: "මුළු උපයනය", tasks: "GALAXY නිල කාර්යයන් 👇", cpaTasks: "🔥 විශේෂ කාර්යයන්", instructionTitle: "උපදෙස්:" },
    ta: { title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு", user: "பயனர் பெயர்", pass: "கடவுச்சொல்", btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", logout: "வெளியேறு", welcome: "வரவேற்கிறோம்", total: "மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇", cpaTasks: "🔥 போனஸ் பணிகள்", instructionTitle: "வழிமுறைகள்:" }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;} 
        .container{max-width:800px;margin:auto;background:#1f2833;padding:20px;border-radius:10px;border:1px solid #45a29e;}
        input, select, textarea {width:95%;padding:10px;margin:5px 0;background:#0b0c10;color:#fff;border:1px solid #45a29e;} 
        button{width:100%;padding:10px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;cursor:pointer;}
        .wall-tab-container { display: flex; gap: 5px; margin-top: 20px; }
        .wall-tab { background: #0b0c10; border: 1px solid #45a29e; padding: 10px; cursor: pointer; flex: 1; text-align: center; }
        .wall-tab.active { background: #45a29e; color: #fff; }
        .user-row{background:#0b0c10;padding:10px;margin:5px 0;border-left:5px solid #45a29e;}
    </style></head><body><div class="container">${content}</div></body></html>`;
};

// ROUTES
app.get('/', (req, res) => { res.redirect('/dashboard'); });

app.post('/admin/update-walls', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    const { w1, w2, w3 } = req.body;
    db.run("UPDATE offerwall_settings SET wall_url = ? WHERE id = 1", [w1]);
    db.run("UPDATE offerwall_settings SET wall_url = ? WHERE id = 2", [w2]);
    db.run("UPDATE offerwall_settings SET wall_url = ? WHERE id = 3", [w3], () => res.redirect('/dashboard'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = req.session.user.username;
    const t = translations[req.session.lang || 'en'];

    db.all("SELECT * FROM offerwall_settings", [], (err, walls) => {
        let adminSection = (user === 'admin') ? `
            <h3 style="color:#ff4d4d;">⚙️ ADMIN WALL MANAGER</h3>
            <form action="/admin/update-walls" method="POST">
                <input type="text" name="w1" placeholder="Wall 1 URL" value="${walls[0].wall_url}">
                <input type="text" name="w2" placeholder="Wall 2 URL" value="${walls[1].wall_url}">
                <input type="text" name="w3" placeholder="Wall 3 URL" value="${walls[2].wall_url}">
                <button type="submit">💾 SAVE & PREVIEW</button>
            </form><hr>` : "";

        let tabs = `
            <div class="wall-tab-container">
                <div class="wall-tab active" onclick="s('w1', this)">Wall 1</div>
                <div class="wall-tab" onclick="s('w2', this)">Wall 2</div>
                <div class="wall-tab" onclick="s('w3', this)">Wall 3</div>
            </div>
            <div id="w1" class="w-wrap"><iframe src="${walls[0].wall_url.includes('?') ? walls[0].wall_url+'&subid='+user : walls[0].wall_url+'?subid='+user}" width="100%" height="500px"></iframe></div>
            <div id="w2" class="w-wrap" style="display:none;"><iframe src="${walls[1].wall_url.includes('?') ? walls[1].wall_url+'&subid='+user : walls[1].wall_url+'?subid='+user}" width="100%" height="500px"></iframe></div>
            <div id="w3" class="w-wrap" style="display:none;"><iframe src="${walls[2].wall_url.includes('?') ? walls[2].wall_url+'&subid='+user : walls[2].wall_url+'?subid='+user}" width="100%" height="500px"></iframe></div>
            <script>
                function s(id, el){
                    document.querySelectorAll('.w-wrap').forEach(i => i.style.display='none');
                    document.querySelectorAll('.wall-tab').forEach(i => i.classList.remove('active'));
                    document.getElementById(id).style.display='block';
                    el.classList.add('active');
                }
            </script>`;

        res.send(htmlWrapper(req, 'Dashboard', `${adminSection} ${tabs}`));
    });
});

app.get('/postback', (req, res) => {
    const { subid, reward } = req.query;
    db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [parseFloat(reward)*0.7, subid]);
    res.send('OK');
});

module.exports = app;
