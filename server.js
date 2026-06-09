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

// 🗄️ NEON DATABASE INITIALIZATION
async function initDb() {
    try {
        // Users Table
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

        // Task Logs Table (Enhanced for micro-tasks verification)
        await sql(`CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            task_name VARCHAR(100) NOT NULL,
            proof_data TEXT,
            amount NUMERIC(10,2) DEFAULT 0.0,
            status VARCHAR(20) NOT NULL, -- Pending, Success, Failed
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

// Middleware to ensure DB tables exist before handling requests
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
    try {
        const rows = await sql(`SELECT value FROM system_settings WHERE key = $1`, [key]);
        return rows.length > 0 ? { key, value: rows[0].value } : null;
    } catch (e) { return null; }
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
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Premium Tasks 👇",
        subText: "Complete the official inner-portal tasks below. Submit accurate proofs for validation.", logout: "Logout",
        forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER",
        cpaTitle: "🔗 CPA Networks Integration Settings", taskInstr: "Task Verification & Instructions"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "ලබාගත හැකි විශේෂ වැඩ (Tasks) 👇",
        subText: "පහත දැක්වෙන නිල පද්ධති පියවර සම්පූර්ණ කරන්න. තහවුරු කිරීමට නිවැරදි සාක්ෂි (Proofs) ඇතුළත් කරන්න.", logout: "ඉවත් වන්න (Logout)",
        forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න",
        cpaTitle: "🔗 CPA ජාල සහ සබැඳි සැකසුම් (Integration)", taskInstr: "වැඩසටහනේ උපදෙස් සහ තහවුරු කිරීම්"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் சான்றுகளைச் சமர்ப்பிக்கவும்.", logout: "வெளியேறு (Logout)",
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
        
        /* Masked Container to hide third-party origins */
        .galaxy-secure-frame-container { background: #fff; padding: 8px; border-radius: 8px; border: 3px solid #45a29e; margin: 10px 0; max-height: 500px; overflow: auto; position: relative;}
        .galaxy-secure-frame-container iframe { width: 100%; height: 400px; border: none; }
        
        .cpa-box{background:#111a24; padding:15px; border:1px solid #66fcf1; border-radius:5px; margin-top:15px; text-align:left;}
        .navbar { display: flex; background: #0b0c10; border: 1px solid #45a29e; border-radius: 5px; margin-bottom: 20px; overflow: hidden; }
        .nav-tab { flex: 1; text-align: center; padding: 12px; color: #c5c6c7; font-weight: bold; cursor: pointer; background: #0b0c10; border: none; transition: 0.3s; }
        .nav-tab:hover { background: #1f2833; color: #66fcf1; }
        .nav-tab.active { background: #45a29e; color: #0b0c10; }
        .dashboard-section { display: none; }
        .dashboard-section.active { display: block; }
        
        /* Stats Cards Widgets */
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: #0b0c10; border: 1px solid #45a29e; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-card h3 { margin: 5px 0; color: #66fcf1; font-size: 22px; }
        .stat-card p { margin: 0; color: #a5a6a7; font-size: 13px; font-weight: bold; }

        .badge-pending { background: #f0ad4e; color: black; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .badge-fail { background: #ff4d4d; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .badge-success { background: #45a29e; color: #0b0c10; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .proof-form { background: #0b0c10; padding: 12px; border-radius: 5px; margin-top: 10px; border: 1px dashed #45a29e; }
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

app.post('/register', async (req, res) => {
    const { username, password, email, address, contact } = req.body;
    try {
        const exists = await sql(`SELECT * FROM users WHERE LOWER(username) = $1`, [username.toLowerCase()]);
        if (exists && exists.length > 0) {
            return res.send("<script>alert('Username already exists!'); window.location.href='/register';</script>");
        }
        await sql(`INSERT INTO users (username, password, email, address, contact, balance_numeric, earnings_percentage) 
                   VALUES ($1, $2, $3, $4, $5, 0.0, 100.0)`, [username, password, email, address, contact]);
        
        backupToGoogleSheet(username, email, 0.0, 0).catch(e => {}); 
        res.send("<script>alert('Registration Successful!'); window.location.href='/';</script>");
    } catch (err) {
        res.send(`<script>alert('Error registering user.'); window.location.href='/register';</script>`);
    }
});

// LOGIN POST ACTION
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        req.session.user = 'admin';
        return res.redirect('/dashboard');
    }
    try {
        const users = await sql(`SELECT * FROM users WHERE username = $1 AND password = $2`, [username, password]);
        if (users && users.length > 0) {
            req.session.user = users[0].username;
            res.redirect('/dashboard');
        } else {
            res.send("<script>alert('Invalid Credentials'); window.location.href='/';</script>");
        }
    } catch (err) {
        res.send("<script>alert('Database Error'); window.location.href='/';</script>");
    }
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// DASHBOARD (With Enhanced Micro-Task UI Widgets)
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const username = req.session.user;
    const lang = req.session.lang || 'en';
    const t = translations[lang];

    try {
        if (username === 'admin') {
            let users = []; try { users = await sql(`SELECT * FROM users WHERE username != 'admin'`); } catch(e){}
            let cpas = []; try { cpas = await sql(`SELECT * FROM cpa_configs`); } catch(e){}
            let allLogs = []; try { allLogs = await sql(`SELECT * FROM task_logs ORDER BY id DESC`); } catch(e){}
            
            const globalPctRow = await dbGetSetting('global_earnings_percentage');
            let globalPct = globalPctRow ? globalPctRow.value : '100';

            // Admin Panel UI
            let logsReviewHtml = `<h3>👥 Worker Submissions & Task Proofs Verification</h3>`;
            if(allLogs.length === 0) {
                logsReviewHtml += `<p>No submissions yet.</p>`;
            } else {
                allLogs.forEach(l => {
                    logsReviewHtml += `
                    <div class="user-row" style="border-left-color: ${l.status === 'Pending' ? '#f0ad4e' : '#45a29e'}">
                        <strong>Worker:</strong> ${l.username} | <strong>Task:</strong> ${l.task_name} <br>
                        <strong>Submitted Proof:</strong> <span style="color:#fff;">${l.proof_data}</span> <br>
                        <strong>Status:</strong> ${l.status} | <strong>Time:</strong> ${l.timestamp} <br>
                        ${l.status === 'Pending' ? `
                            <a href="/approve-task?id=${l.id}" style="background:#45a29e; color:#000; padding:3px 8px; font-weight:bold; border-radius:3px; font-size:12px; margin-right:5px;">APPROVE & PAY</a>
                            <a href="/reject-task?id=${l.id}" style="background:#ff4d4d; color:#fff; padding:3px 8px; font-weight:bold; border-radius:3px; font-size:12px;">REJECT</a>
                        ` : ''}
                    </div>`;
                });
            }

            res.send(htmlWrapper(req, 'Admin Dashboard', `
                <h2>Welcome Admin <a href="/logout" class="logout-btn">${t.logout}</a></h2>
                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('admin-panel')">⚙️ Controls</button>
                    <button class="nav-tab" onclick="switchSection('task-reviews')">📩 Task Submissions (${allLogs.filter(x=>x.status==='Pending').length})</button>
                    <button class="nav-tab" onclick="switchSection('user-metrics')">👥 Worker Metrics</button>
                </div>
                
                <div id="admin-panel" class="dashboard-section active">
                    <h3>📢 Broadcast Notification</h3>
                    <form action="/send-notification" method="POST">
                        <select name="target_user" class="form-input"><option value="all">Broadcast to All</option>${users.map(u => `<option value="${u.username}">${u.username}</option>`).join('')}</select>
                        <input type="text" name="message" placeholder="Message content..." required>
                        <button type="submit">Send Notification</button>
                    </form>
                    <hr>
                    <h3>➕ Integrate New Premium Task Container</h3>
                    <form action="/add-cpa" method="POST">
                        <input type="text" name="network_name" placeholder="Task Container Name (e.g., Secure Server Node 04)" required>
                        <textarea name="embed_code" placeholder="Paste Task URL/iFrame Embed Code Here" rows="3" required></textarea>
                        <input type="text" name="instructions_en" placeholder="Instructions (English)" required>
                        <input type="text" name="instructions_si" placeholder="Instructions (Sinhala)" required>
                        <input type="text" name="instructions_ta" placeholder="Instructions (Tamil)" required>
                        <button type="submit">Deploy Secure Task Container</button>
                    </form>
                </div>
                
                <div id="task-reviews" class="dashboard-section">${logsReviewHtml}</div>
                
                <div id="user-metrics" class="dashboard-section">
                    <h3>Registered System Workers</h3>
                    ${users.map(u => `
                        <div class="user-row">
                            <strong>${u.username}</strong> (${u.email})<br>Bal: $${parseFloat(u.balance_numeric || 0).toFixed(2)} | Contact: ${u.contact}<br>
                            <a href="/remove-user?id=${u.id}" class="remove-btn">REMOVE</a>
                        </div>
                    `).join('')}
                </div>
            `));
        } else {
            // WORKER PORTAL (Enhanced Micro-Task site style)
            const userRow = await sql(`SELECT * FROM users WHERE username = $1`, [username]);
            const user = userRow[0];
            const cpas = await sql(`SELECT * FROM cpa_configs WHERE is_active = 1`);
            const logs = await sql(`SELECT * FROM task_logs WHERE username = $1`, [username]);
            const myNotifications = await sql(`SELECT * FROM notifications WHERE target_user = 'all' OR target_user = $1`, [username]);

            let currentBal = user ? parseFloat(user.balance_numeric || 0) : 0.0;
            let pendingCount = logs.filter(l => l.status === 'Pending').length;
            let completedCount = logs.filter(l => l.status === 'Success').length;

            // Stats Grid Widgets
            let statsHtml = `
            <div class="stats-grid">
                <div class="stat-card"><h3>$${currentBal.toFixed(2)}</h3><p>AVAILABLE BALANCE</p></div>
                <div class="stat-card"><h3>${pendingCount}</h3><p>PENDING VERIFICATION</p></div>
                <div class="stat-card"><h3>${completedCount}</h3><p>TASKS COMPLETED</p></div>
            </div>`;

            // Masked Premium Tasks Containers Panel
            let cpaTasksHtml = `<h3>${t.tasks}</h3><p>${t.subText}</p>`;
            if(cpas.length === 0) {
                cpaTasksHtml += `<p style="text-align:center; color:#ff4d4d; margin:30px 0;">No inner portal tasks available right now. Check back in a few minutes!</p>`;
            } else {
                cpas.forEach(c => {
                    let instructions = (lang === 'si' ? c.instructions_si : (lang === 'ta' ? c.instructions_ta : c.instructions_en));
                    cpaTasksHtml += `
                    <div class="cpa-box">
                        <h4 style="color:#66fcf1; margin-bottom:5px;">🌐 Portal Node: ${c.network_name}</h4>
                        <p style="font-size:14px; margin-top:0; color:#45a29e;">📋 <strong>Instructions:</strong> ${instructions}</p>
                        
                        <div class="galaxy-secure-frame-container">
                            ${c.embed_code}
                        </div>
                        
                        <div class="proof-form">
                            <form action="/submit-task-proof" method="POST">
                                <input type="hidden" name="task_name" value="${c.network_name}">
                                <label style="font-size:12px; color:#45a29e;"><strong>Submit Task Requirements / Code / Email Used:</strong></label>
                                <input type="text" name="proof_data" placeholder="Type validation code, required text or name/email used as proof..." required style="width:92%; padding:6px; font-size:13px; margin:5px 0;">
                                <button type="submit" style="padding:6px; font-size:13px; width:auto; margin-top:5px; background:#66fcf1; color:#0b0c10;">Submit Task Proof for Review</button>
                            </form>
                        </div>
                    </div>`;
                });
            }

            // Logs HTML
            let logsHtml = `<h3>Your Activity & Verifications Logs</h3>`;
            if(logs.length === 0) {
                logsHtml += `<p>No recent activity logs.</p>`;
            } else {
                logs.forEach(l => {
                    let badge = `<span class="badge-pending">PENDING</span>`;
                    if(l.status === 'Success') badge = `<span class="badge-success">APPROVED</span>`;
                    if(l.status === 'Failed') badge = `<span class="badge-fail">REJECTED</span>`;
                    logsHtml += `<div class="user-row">• <strong>${l.task_name}</strong> - ${badge} <br><small style="color:#aaa;">Proof: ${l.proof_data} | Sub: ${l.timestamp}</small></div>`;
                });
            }

            // Withdrawal Portal Section
            let withdrawHtml = `
            <h3>💳 Secure Payout Gateways (Withdrawal)</h3>
            <p style="font-size:14px; color:#a5a6a7;">You can request a payout as soon as your Available Balance reaches the minimum threshold of <strong>$5.00</strong>.</p>
            <div class="cpa-box" style="border-color:#45a29e;">
                <form onsubmit="alert('Payout Request Saved! Our financial unit will review and process this within 24 hours.'); return false;">
                    <label>Select Payout Method:</label>
                    <select class="form-input" style="width:100%; margin:8px 0;" required>
                        <option value="bank">Commercial Bank / Sampath Bank / People's Bank (Sri Lanka)</option>
                        <option value="dialog">Dialog eZ Cash / Mobitel mCash</option>
                        <option value="binance">Binance Pay (USDT)</option>
                    </select>
                    <input type="text" placeholder="Enter Full Bank Account Details, Phone Number or Binance ID" required>
                    <input type="number" step="0.01" min="5" max="${currentBal}" placeholder="Amount to withdraw ($)" required>
                    <button type="submit" ${currentBal < 5 ? 'disabled style="background:#555; color:#aaa; cursor:not-allowed;"' : ''}>
                        ${currentBal < 5 ? 'Minimum Balance $5.00 Required' : 'Request Payout Now'}
                    </button>
                </form>
            </div>`;

            res.send(htmlWrapper(req, 'Worker Dashboard', `
                <h2>Welcome, ${username}! <a href="/logout" class="logout-btn">${t.logout}</a></h2>
                
                ${statsHtml}

                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('worker-tasks')">🎯 Core Portal Tasks</button>
                    <button class="nav-tab" onclick="switchSection('worker-logs')">📊 My Submission Logs</button>
                    <button class="nav-tab" onclick="switchSection('worker-withdraw')">💳 Withdraw Funds</button>
                </div>

                <div id="worker-tasks" class="dashboard-section active">${cpaTasksHtml}</div>
                <div id="worker-logs" class="dashboard-section">${logsHtml}</div>
                <div id="worker-withdraw" class="dashboard-section">${withdrawHtml}</div>
            `));
        }
    } catch (err) {
        res.status(500).send("Dashboard Error.");
    }
});

// SUBMIT TASK PROOF ACTION
app.post('/submit-task-proof', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { task_name, proof_data } = req.body;
    try {
        await sql(`INSERT INTO task_logs (username, task_name, proof_data, amount, status, timestamp) 
                   VALUES ($1, $2, $3, 0.50, 'Pending', $4)`, 
                   [req.session.user, task_name, proof_data, new Date().toLocaleString()]);
        res.send("<script>alert('Task Proof submitted successfully! It is now pending manual admin audit.'); window.location.href='/dashboard';</script>");
    } catch(e) { res.redirect('/dashboard'); }
});

// ADMIN APPROVE TASK
app.get('/approve-task', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const logId = parseInt(req.query.id);
    try {
        const logRow = await sql(`SELECT * FROM task_logs WHERE id = $1`, [logId]);
        if(logRow.length > 0 && logRow[0].status === 'Pending') {
            const task = logRow[0];
            // Update log status
            await sql(`UPDATE task_logs SET status = 'Success' WHERE id = $1`, [logId]);
            // Give cash to user
            await sql(`UPDATE users SET balance_numeric = balance_numeric + $1 WHERE username = $2`, [task.amount, task.username]);
        }
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

// ADMIN REJECT TASK
app.get('/reject-task', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await sql(`UPDATE task_logs SET status = 'Failed' WHERE id = $1`, [parseInt(req.query.id)]);
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

// OTHER API ACTIONS
app.post('/send-notification', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await sql(`INSERT INTO notifications (target_user, message, timestamp) VALUES ($1, $2, $3)`, 
                   [req.body.target_user, req.body.message, new Date().toISOString()]);
        res.send("<script>alert('Notification Broadcasted!'); window.location.href='/dashboard';</script>");
    } catch(e) { res.redirect('/dashboard'); }
});

app.get('/remove-user', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await sql(`DELETE FROM users WHERE id = $1`, [parseInt(req.query.id)]);
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

app.post('/add-cpa', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { network_name, embed_code, instructions_en, instructions_si, instructions_ta } = req.body;
    try {
        await sql(`INSERT INTO cpa_configs (network_name, embed_code, instructions_en, instructions_si, instructions_ta, is_active) 
                   VALUES ($1, $2, $3, $4, $5, 1)`, [network_name, embed_code, instructions_en, instructions_si, instructions_ta]);
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

module.exports = app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Galaxy Platform running on port ${PORT}`); });
