const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');

// Neon Database Connection
const sql = neon(process.env.DATABASE_URL);

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🗄️ NEON DATABASE INITIALIZATION (Fixed SQL Syntax Error)
async function initDb() {
    try {
        // Users Table (Removed UNIQUEIDENTIFIER syntax error)
        await sql(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL,
            address TEXT,
            contact VARCHAR(20),
            balance_numeric NUMERIC(10,2) DEFAULT 0.0,
            earnings_percentage NUMERIC(5,2) DEFAULT 100.0
        )`);

        // Admin Account
        const adminCheck = await sql(`SELECT * FROM users WHERE username = 'admin'`);
        if (adminCheck.length === 0) {
            await sql(`INSERT INTO users (username, password, email, balance_numeric, address, contact, earnings_percentage) 
                       VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000', 100.0)`);
        }

        // Task Logs Table
        await sql(`CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            task_name VARCHAR(100) NOT NULL,
            amount NUMERIC(10,2) DEFAULT 0.0,
            status VARCHAR(20) NOT NULL,
            timestamp VARCHAR(50) NOT NULL
        )`);

        // CPA Configs Table
        await sql(`CREATE TABLE IF NOT EXISTS cpa_configs (
            id SERIAL PRIMARY KEY,
            network_name VARCHAR(100) NOT NULL,
            embed_code TEXT NOT NULL,
            instructions_en TEXT,
            instructions_si TEXT,
            instructions_ta TEXT,
            is_active INTEGER DEFAULT 1
        )`);

        // System Settings Table
        await sql(`CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT
        )`);

        await sql(`INSERT INTO system_settings (key, value) VALUES ('global_earnings_percentage', '100') ON CONFLICT (key) DO NOTHING`);
        await sql(`INSERT INTO system_settings (key, value) VALUES ('google_sheet_config', '') ON CONFLICT (key) DO NOTHING`);

        // Notifications Table
        await sql(`CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            target_user VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            timestamp VARCHAR(50) NOT NULL
        )`);

        console.log("Neon Database Tables Initialized Successfully!");
    } catch (err) {
        console.error("Database Init Error:", err);
    }
}

// ⚠️ Middleware to ensure DB tables exist before handling requests safely on Vercel
let dbInitialized = false;
app.use(async (req, res, next) => {
    if (!dbInitialized) {
        await initDb();
        dbInitialized = true;
    }
    next();
});

// Settings Helper Functions
async function dbGetSetting(key) {
    const rows = await sql(`SELECT value FROM system_settings WHERE key = $1`, [key]);
    return rows.length > 0 ? { key, value: rows[0].value } : null;
}

async function dbSaveSetting(key, value) {
    await sql(`INSERT INTO system_settings (key, value) VALUES ($1, $2) 
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
}

async function backupToGoogleSheet(username, email, balance, taskCount) {
    const row = await dbGetSetting('google_sheet_config');
    if (!row || !row.value) return; 
    try {
        const config = JSON.parse(row.value); 
        if(!config.client_email || !config.private_key || !config.spreadsheet_id) return;

        const auth = new google.auth.JWT(config.client_email, null, config.private_key.replace(/\\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
        const sheets = google.sheets({ version: 'v4', auth });
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: config.spreadsheet_id,
            range: 'Sheet1!A:E',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[new Date().toISOString(), username, email, balance, taskCount]] }
        });
    } catch (e) { console.error("Google Sheet Backup Error:", e); }
}

const translations = {
    en: {
        title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration",
        user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number",
        btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here",
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Micro Tasks 👇",
        subText: "Complete the tasks below. Your earnings will automatically add to your balance.", logout: "Logout",
        forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER",
        cpaTitle: "🔗 CPA Networks Integration Settings", taskInstr: "Task Instructions"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "කිරීමට ඇති සරල වැඩ (Tasks) 👇",
        subText: "පහත ඇති Tasks සම්පූර්ණ කරන්න. ඔබ උපයන මුදල් ස්වයංක්‍රීයවම ගිණුමට එකතු වේ.", logout: "ඉවත් වන්න (Logout)",
        forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න",
        cpaTitle: "🔗 CPA ජාල සහ සබැඳි සැකසුම් (Integration)", taskInstr: "වැඩසටහනේ උපදෙස් (Instructions)"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் வருவாய் தானாகவே உங்கள் கணக்கில் சேர்க்கப்படும்.", logout: "வெளியேறு (Logout)",
        forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்",
        cpaTitle: "🔗 CPA நெட்வொர்க் இணைப்பு அமைப்புகள்", taskInstr: "பணி வழிமுறைகள்"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} 
        .container{max-width:850px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;}
        .lang-selector { position: absolute; top: 15px; right: 15px; }
        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        input, textarea, select.form-input {width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;}
        button:hover{background:#66fcf1;}
        .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;position:relative;}
        a{color:#66fcf1;text-decoration:none;} .logout-btn{background:#ff4d4d;color:#fff;width:auto;padding:5px 10px;font-size:12px;float:right;border-radius:3px;margin-left:5px;}
        .remove-btn{background:#ff4d4d;color:white;border:none;padding:5px 10px;font-size:11px;cursor:pointer;border-radius:3px;float:right;margin-top:-20px;}
        iframe { width: 100%; height: 600px; border: none; border-radius: 8px; margin-top: 15px; }
        .cpa-box{background:#111a24; padding:15px; border:1px solid #66fcf1; border-radius:5px; margin-top:15px; text-align:left;}
        .navbar { display: flex; background: #0b0c10; border: 1px solid #45a29e; border-radius: 5px; margin-bottom: 20px; overflow: hidden; }
        .nav-tab { flex: 1; text-align: center; padding: 12px; color: #c5c6c7; font-weight: bold; cursor: pointer; background: #0b0c10; border: none; transition: 0.3s; }
        .nav-tab:hover { background: #1f2833; color: #66fcf1; }
        .nav-tab.active { background: #45a29e; color: #0b0c10; }
        .dashboard-section { display: none; }
        .dashboard-section.active { display: block; }
        .badge-fail { background: #ff4d4d; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .badge-success { background: #45a29e; color: #0b0c10; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
    </style>
    <script>
        function switchSection(sectionId) {
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
            event.target.classList.add('active');
        }
    </script>
</head><body><div class="container">
    <div class="lang-selector">
        <select onchange="window.location.href='/change-lang?lang=' + this.value}">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
            <option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option>
        </select>
    </div>
    <h2 style="text-align:center;color:#66fcf1;margin-top:15px;">${t.title}</h2>
    ${content}
</div></body></html>`;
};

app.get('/change-lang', (req, res) => {
    const selectedLang = req.query.lang;
    if (['en', 'si', 'ta'].includes(selectedLang)) {
        req.session.lang = selectedLang;
    }
    res.redirect(req.get('referer') || '/');
});

// LOGIN PAGE
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
        <p style="text-align:center; margin-top:15px;">
            ${t.noAcc} <a href="/register">${t.regHere}</a> <br><br>
            <a href="/forgot-password" style="color:#ff4d4d; font-size:14px;">${t.forgot}</a>
        </p>
    `));
});

// REGISTER PAGE
app.get('/register', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Register', `
        <h3>${t.reg}</h3>
        <form action="/register" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <input type="password" name="password" placeholder="${t.pass}" required>
            <input type="email" name="email" placeholder="${t.email}" required>
            <input type="text" name="address" placeholder="${t.addr}" required>
            <input type="text" name="contact" placeholder="${t.phone}" required>
            <button type="submit">${t.btnReg}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

// REGISTER POST ACTION
app.post('/register', async (req, res) => {
    const { username, password, email, address, contact } = req.body;
    try {
        const exists = await sql(`SELECT * FROM users WHERE LOWER(username) = $1`, [username.toLowerCase()]);
        if (exists.length > 0) {
            return res.send("<script>alert('Username already exists!'); window.location.href='/register';</script>");
        }
        await sql(`INSERT INTO users (username, password, email, address, contact, balance_numeric, earnings_percentage) 
                   VALUES ($1, $2, $3, $4, $5, 0.0, 100.0)`, [username, password, email, address, contact]);
        
        await backupToGoogleSheet(username, email, 0.0, 0); 
        res.send("<script>alert('Registration Successful!'); window.location.href='/';</script>");
    } catch (err) {
        console.error(err);
        res.send(`<script>alert('Error registering user.'); window.location.href='/register';</script>`);
    }
});

// LOGIN POST ACTION
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = await sql(`SELECT * FROM users WHERE username = $1 AND password = $2`, [username, password]);
        if (users.length > 0) {
            req.session.user = users[0].username;
            res.redirect('/dashboard');
        } else {
            res.send("<script>alert('Invalid Credentials'); window.location.href='/';</script>");
        }
    } catch (err) {
        res.send("<script>alert('Database Error'); window.location.href='/';</script>");
    }
});

// FORGOT PASSWORD
app.get('/forgot-password', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Forgot Password', `
        <h3>${t.recoverTitle}</h3>
        <form action="/forgot-password" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <button type="submit">${t.btnRecover}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

app.post('/forgot-password', async (req, res) => {
    const { username } = req.body;
    try {
        const users = await sql(`SELECT password FROM users WHERE username = $1`, [username]);
        if (users.length > 0) {
            res.send(htmlWrapper(req, 'Recovered', `<h3>Your Password is: <span style="color:#66fcf1;">${users[0].password}</span></h3><p><a href="/">Back to Login</a></p>`));
        } else {
            res.send("<script>alert('User not found!'); window.location.href='/forgot-password';</script>");
        }
    } catch(err) {
        res.send("<script>alert('Error!'); window.location.href='/forgot-password';</script>");
    }
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// DASHBOARD
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const username = req.session.user;
    const lang = req.session.lang || 'en';
    const t = translations[lang];

    try {
        if (username === 'admin') {
            const users = await sql(`SELECT * FROM users WHERE username != 'admin'`);
            const cpas = await sql(`SELECT * FROM cpa_configs`);
            const globalPctRow = await dbGetSetting('global_earnings_percentage');
            let globalPct = globalPctRow ? globalPctRow.value : '100';

            let searchUser = req.query.search_user || '';
            let filteredUsers = users;
            if(searchUser) {
                filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchUser.toLowerCase()));
            }

            let usersHtml = `
            <form method="GET" action="/dashboard" style="margin-bottom:20px;">
                <input type="text" name="search_user" value="${searchUser}" placeholder="🔍 Search User by Username..." style="width:75%; display:inline-block;">
                <button type="submit" style="width:20%; display:inline-block; margin-top:0; margin-left:10px;">Search</button>
            </form>
            <h3>Registered Workers Details & Earnings Metric</h3>`;
            
            filteredUsers.forEach(u => {
                let userBal = u.balance_numeric ? parseFloat(u.balance_numeric) : 0.0;
                usersHtml += `
                <div class="user-row">
                    <strong>User:</strong> ${u.username} | <strong>Pass:</strong> ${u.password} | <strong>Email:</strong> ${u.email}<br>
                    <strong>Contact:</strong> ${u.contact} | <strong>Address:</strong> ${u.address}<br>
                    <strong>Current Balance:</strong> $${userBal.toFixed(2)}<br>
                    <form action="/update-user-percentage" method="POST" style="margin:5px 0; display:inline-block;">
                        <input type="hidden" name="username" value="${u.username}">
                        <label>Custom Pay: </label>
                        <input type="number" name="percentage" value="${u.earnings_percentage || 100}" style="width:60px; padding:2px; margin:0;"> % 
                        <button type="submit" style="width:auto; padding:3px 8px; font-size:11px; display:inline-block; margin:0;">Set</button>
                    </form>
                    <a href="/remove-user?id=${u.id}" class="remove-btn" onclick="return confirm('Are you sure you want to remove this user?')">REMOVE USER</a>
                </div>`;
            });

            let cpaHtml = `<h3>${t.cpaTitle}</h3>`;
            cpas.forEach(c => {
                cpaHtml += `
                <div class="user-row">
                    <strong>${c.network_name}</strong> (Active: ${c.is_active ? 'Yes' : 'No'})
                    <a href="/remove-cpa?id=${c.id}" class="remove-btn">Remove</a>
                    <br><small>Embed Code length: ${c.embed_code.length} chars</small>
                </div>`;
            });

            let livePreviewHtml = `
            <div style="background:#111a24; padding:20px; border-radius:8px; border:2px solid #45a29e; margin-top:15px;">
                <h3 style="color:#66fcf1;">${t.tasks}</h3>
                <p>${t.subText}</p>`;
            
            const activeCpasForAdmin = cpas.filter(c => c.is_active === 1);
            if(activeCpasForAdmin.length === 0) {
                livePreviewHtml += `<p style="color:#ff4d4d; text-align:center;">No active CPA Networks linked yet.</p>`;
            } else {
                activeCpasForAdmin.forEach(c => {
                    let customInstructions = c.instructions_en;
                    if (lang === 'si') customInstructions = c.instructions_si;
                    if (lang === 'ta') customInstructions = c.instructions_ta;
                    livePreviewHtml += `
                    <div class="cpa-box" style="border-color:#45a29e;">
                        <h4>🎯 ${c.network_name} - ${t.taskInstr}</h4>
                        <p style="color:#66fcf1; font-size:14px;">${customInstructions}</p>
                        <div style="background: #fff; padding: 5px; border-radius: 5px;">${c.embed_code}</div>
                    </div>`;
                });
            }
            livePreviewHtml += `
                <div class="user-row" style="background:#1f2833; padding:15px; margin:15px 0; border-radius:8px; border-left:5px solid #66fcf1;">
                    <h4 style="color:#66fcf1; margin-top:0;">🎁 Special Daily Bonus Task</h4>
                    <a href="https://www.mobilerewards.link/unlock/M6Pv" target="_blank" style="display:inline-block; padding:10px 20px; background:#45a29e; color:#0b0c10; font-weight:bold; border-radius:5px; text-decoration:none;">COMPLETE TASK NOW</a>
                </div>
            </div>`;

            res.send(htmlWrapper(req, 'Admin Dashboard', `
                <h2>Welcome Admin <a href="/logout" class="logout-btn">${t.logout}</a></h2>
                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('admin-panel')">⚙️ Admin Control Panel</button>
                    <button class="nav-tab" onclick="switchSection('user-metrics')">👥 User Details & Metrics</button>
                    <button class="nav-tab" onclick="switchSection('live-view')">👁️ Live Task Dashboard Preview</button>
                </div>
                <div id="admin-panel" class="dashboard-section active">
                    <h3>📢 Broadcast Notifications</h3>
                    <form action="/send-notification" method="POST" style="background:#111a24; padding:15px; border-radius:5px; border:1px solid #45a29e;">
                        <select name="target_user" class="form-input" style="width:100%;"><option value="all">📢 Broadcast to All</option>${users.map(u => `<option value="${u.username}">👤 ${u.username}</option>`).join('')}</select>
                        <input type="text" name="message" placeholder="Message..." required>
                        <button type="submit">Send</button>
                    </form>
                    <hr>
                    <h3>⚙️ Global Settings</h3>
                    <form action="/update-global-percentage" method="POST">
                        <input type="number" name="global_percentage" value="${globalPct}" required>
                        <button type="submit">Update Global Payout</button>
                    </form>
                    <hr>
                    <h3>➕ Add CPA Network</h3>
                    <form action="/add-cpa" method="POST">
                        <input type="text" name="network_name" placeholder="Name" required>
                        <textarea name="embed_code" placeholder="Embed Code" rows="3" required></textarea>
                        <input type="text" name="instructions_en" placeholder="Inst (EN)" required>
                        <input type="text" name="instructions_si" placeholder="Inst (SI)" required>
                        <input type="text" name="instructions_ta" placeholder="Inst (TA)" required>
                        <button type="submit">Integrate</button>
                    </form>
                    ${cpaHtml}
                </div>
                <div id="user-metrics" class="dashboard-section">${usersHtml}</div>
                <div id="live-view" class="dashboard-section">${livePreviewHtml}</div>
            `));
        } else {
            const userRow = await sql(`SELECT * FROM users WHERE username = $1`, [username]);
            const user = userRow[0];
            const cpas = await sql(`SELECT * FROM cpa_configs WHERE is_active = 1`);
            const logs = await sql(`SELECT * FROM task_logs WHERE username = $1`, [username]);
            const myNotifications = await sql(`SELECT * FROM notifications WHERE target_user = 'all' OR target_user = $1`, [username]);

            let notificationBarHtml = '';
            if (myNotifications.length > 0) {
                notificationBarHtml = `<div class="notification-bar"><h4>🔔 Notifications</h4>`;
                myNotifications.reverse().forEach(n => {
                    notificationBarHtml += `<div class="notification-item">• ${n.message}</div>`;
                });
                notificationBarHtml += `</div>`;
            }

            let logsHtml = `<h4>Tasks Log</h4>`;
            logs.forEach(l => {
                let statusBadge = l.status === 'Success' ? `<span class="badge-success">SUCCESS</span>` : `<span class="badge-fail">FAILED</span>`;
                logsHtml += `<div>• ${l.task_name} | ${statusBadge}</div>`;
            });

            let cpaTasksHtml = '';
            cpas.forEach(c => {
                let instructions = (lang === 'si' ? c.instructions_si : (lang === 'ta' ? c.instructions_ta : c.instructions_en));
                cpaTasksHtml += `<div class="cpa-box"><h4>🎯 ${c.network_name}</h4><p>${instructions}</p>${c.embed_code}</div>`;
            });

            let currentBal = user.balance_numeric ? parseFloat(user.balance_numeric) : 0.0;

            res.send(htmlWrapper(req, 'Worker Dashboard', `
                <h2>${t.welcome}, ${username}! <a href="/logout" class="logout-btn">${t.logout}</a></h2>
                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('worker-tasks')">🎯 Tasks</button>
                    <button class="nav-tab" onclick="switchSection('worker-logs')">📊 Logs</button>
                </div>
                ${notificationBarHtml}
                <div id="worker-tasks" class="dashboard-section active">
                    <h3>Balance: $${currentBal.toFixed(2)}</h3>
                    ${cpaTasksHtml}
                </div>
                <div id="worker-logs" class="dashboard-section">${logsHtml}</div>
            `));
            await backupToGoogleSheet(user.username, user.email, currentBal, logs.length);
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Dashboard Error occurred.");
    }
});

// API ROUTES
app.post('/send-notification', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { target_user, message } = req.body;
    try {
        await sql(`INSERT INTO notifications (target_user, message, timestamp) VALUES ($1, $2, $3)`, 
                   [target_user, message, new Date().toISOString()]);
        res.send("<script>alert('Sent!'); window.location.href='/dashboard';</script>");
    } catch(err) { res.redirect('/dashboard'); }
});

app.get('/remove-user', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await sql(`DELETE FROM users WHERE id = $1`, [parseInt(req.query.id)]);
        res.redirect('/dashboard');
    } catch(err) { res.redirect('/dashboard'); }
});

app.post('/update-user-percentage', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await sql(`UPDATE users SET earnings_percentage = $1 WHERE username = $2`, 
                   [parseFloat(req.body.percentage), req.body.username]);
        res.redirect('/dashboard');
    } catch(err) { res.redirect('/dashboard'); }
});

app.post('/update-global-percentage', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await dbSaveSetting('global_earnings_percentage', req.body.global_percentage);
        res.redirect('/dashboard');
    } catch(err) { res.redirect('/dashboard'); }
});

app.post('/save-sheet-config', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await dbSaveSetting('google_sheet_config', req.body.sheet_config);
        res.redirect('/dashboard');
    } catch(err) { res.redirect('/dashboard'); }
});

app.post('/add-cpa', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { network_name, embed_code, instructions_en, instructions_si, instructions_ta } = req.body;
    try {
        await sql(`INSERT INTO cpa_configs (network_name, embed_code, instructions_en, instructions_si, instructions_ta, is_active) 
                   VALUES ($1, $2, $3, $4, $5, 1)`, [network_name, embed_code, instructions_en, instructions_si, instructions_ta]);
        res.redirect('/dashboard');
    } catch(err) { res.redirect('/dashboard'); }
});

app.get('/remove-cpa', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await sql(`DELETE FROM cpa_configs WHERE id = $1`, [parseInt(req.query.id)]);
        res.redirect('/dashboard');
    } catch(err) { res.redirect('/dashboard'); }
});

module.exports = app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Galaxy Server running on port ${PORT}`);
});
