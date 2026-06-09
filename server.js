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

        // Task Logs Table
        await sql(`CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            task_name VARCHAR(100) NOT NULL,
            proof_data TEXT,
            amount NUMERIC(10,2) DEFAULT 0.50,
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

        console.log("Neon Database Tables Initialized/Reset Successfully!");
    } catch (err) {
        console.error("Database Init Error:", err);
    }
}

let dbInitialized = false;
app.use(async (req, res, next) => {
    if (!dbInitialized) {
        await initDb();
        dbInitialized = true;
    }
    next();
});

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
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Premium Micro Tasks 👇",
        subText: "Complete the verified Galaxy system tasks below. Submit accurate proof data for fast validation.", logout: "Logout",
        forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER",
        cpaTitle: "🔗 Internal Galaxy Portal Tasks Setup", taskInstr: "Task Steps & Guidelines"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "ලබාගත හැකි විශ්වාසවන්ත සරල වැඩ (Tasks) 👇",
        subText: "පහත දැක්වෙන Galaxy පද්ධති පියවර සම්පූර්ණ කරන්න. තහවුරු කිරීමට නිවැරදි සාක්ෂි (Proofs) ඇතුළත් කරන්න.", logout: "ඉවත් වන්න (Logout)",
        forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න",
        cpaTitle: "🔗 Galaxy පද්ධති අභ්‍යන්තර Tasks සැකසුම්", taskInstr: "වැඩසටහනේ පියවර සහ උපදෙස්"
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
        
        /* Fixed layout alignment for User rows to prevent overlap */
        .user-row{background:#0b0c10;padding:15px;margin:12px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;position:relative;display:block;clear:both;}
        .user-meta-block { margin-bottom: 10px; line-height: 1.5; color:#c5c6c7; }
        .user-history-block { background:#141d26; padding:8px; border-radius:4px; margin: 8px 0; font-size:12px; border: 1px solid #233142; }
        
        a{color:#66fcf1;text-decoration:none;} .logout-btn{background:#ff4d4d;color:#fff;width:auto;padding:5px 10px;font-size:12px;float:right;border-radius:3px;margin-left:5px;}
        
        /* Clean design for remove button below the text details */
        .action-container-block { margin-top: 12px; display: flex; justify-content: flex-end; gap: 10px; }
        .remove-btn-styled { background:#ff4d4d; color:white; padding:6px 12px; font-size:12px; font-weight:bold; cursor:pointer; border-radius:4px; text-decoration:none; text-align:center; display:inline-block; border:none; }
        .remove-btn-styled:hover { background: #cc3333; }

        /* White Label Secure Container - Masking all external signs */
        .galaxy-secure-node-wrapper { background: #111a24; padding: 10px; border-radius: 8px; border: 2px solid #45a29e; margin: 12px 0; }
        .galaxy-secure-frame-container { background: #fff; padding: 5px; border-radius: 6px; border: 1px solid #66fcf1; max-height: 520px; overflow: auto; position: relative;}
        .galaxy-secure-frame-container iframe { width: 100%; height: 420px; border: none; }
        
        .cpa-box{background:#111a24; padding:15px; border:1px solid #66fcf1; border-radius:5px; margin-top:15px; text-align:left;}
        .navbar { display: flex; background: #0b0c10; border: 1px solid #45a29e; border-radius: 5px; margin-bottom: 20px; overflow: hidden; }
        .nav-tab { flex: 1; text-align: center; padding: 12px; color: #c5c6c7; font-weight: bold; cursor: pointer; background: #0b0c10; border: none; transition: 0.3s; font-size:13px; }
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
    if (['en', 'si', 'ta'].includes(selectedLang)) { req.session.lang = selectedLang; }
    res.redirect(req.get('referer') || '/');
});

// LOGIN & REGISTER GATEWAYS
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

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// MAIN DASHBOARD ROUTE
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const username = req.session.user;
    const lang = req.session.lang || 'en';
    const t = translations[lang];

    try {
        if (username === 'admin') {
            // ADMIN VIEW
            let users = []; try { users = await sql(`SELECT * FROM users WHERE username != 'admin'`); } catch(e){}
            let cpas = []; try { cpas = await sql(`SELECT * FROM cpa_configs`); } catch(e){}
            let allLogs = []; try { allLogs = await sql(`SELECT * FROM task_logs ORDER BY id DESC`); } catch(e){}
            
            const globalPctRow = await dbGetSetting('global_earnings_percentage');
            let globalPct = globalPctRow ? globalPctRow.value : '100';

            // Universal Search filter implementation
            let searchKeyword = req.query.search_keyword || '';
            let filteredUsers = users;
            if(searchKeyword.trim() !== '') {
                let kw = searchKeyword.toLowerCase();
                filteredUsers = users.filter(u => 
                    u.username.toLowerCase().includes(kw) || 
                    u.email.toLowerCase().includes(kw) || 
                    (u.contact && u.contact.toLowerCase().includes(kw)) ||
                    (u.address && u.address.toLowerCase().includes(kw))
                );
            }

            // Task Verifications Block
            let logsReviewHtml = `<h3>👥 Submissions Audits Panel</h3>`;
            let pendingSubmissions = allLogs.filter(x => x.status === 'Pending');
            if(pendingSubmissions.length === 0) {
                logsReviewHtml += `<p style="color:#aaa;">No pending submissions to audit.</p>`;
            } else {
                pendingSubmissions.forEach(l => {
                    logsReviewHtml += `
                    <div class="user-row" style="border-left-color: #f0ad4e">
                        <strong>Worker Name:</strong> ${l.username} <br>
                        <strong>Target Node:</strong> ${l.task_name} <br>
                        <strong>Submitted Proof Code/Data:</strong> <span style="color:#66fcf1; font-weight:bold;">${l.proof_data}</span> <br>
                        <strong>Time Sent:</strong> ${l.timestamp} <br><br>
                        <a href="/approve-task?id=${l.id}" style="background:#45a29e; color:#000; padding:4px 10px; font-weight:bold; border-radius:4px; font-size:12px; margin-right:8px; text-decoration:none;">APPROVE & PAY</a>
                        <a href="/reject-task?id=${l.id}" style="background:#ff4d4d; color:#fff; padding:4px 10px; font-weight:bold; border-radius:4px; font-size:12px; text-decoration:none;">REJECT PROOF</a>
                    </div>`;
                });
            }

            // Worker Details & Metrics Builder with Inner Task History Log
            let usersHtml = `
            <h3>👥 Workers Metrics & Registration Database</h3>
            <form method="GET" action="/dashboard" style="margin-bottom:15px;">
                <input type="text" name="search_keyword" value="${searchKeyword}" placeholder="🔍 Search worker by username, email, phone, address..." style="width:75%; display:inline-block; padding:8px;">
                <button type="submit" style="width:20%; display:inline-block; margin-top:0; margin-left:10px; padding:8px 0; font-size:14px;">Search</button>
            </form>`;

            if(filteredUsers.length === 0) {
                usersHtml += `<p style="color:#ff4d4d;">No matching system workers found.</p>`;
            } else {
                filteredUsers.forEach(u => {
                    let userApprovedLogs = allLogs.filter(l => l.username === u.username && l.status === 'Success');
                    let userPendingCount = allLogs.filter(l => l.username === u.username && l.status === 'Pending').length;
                    
                    let historySubLogsHtml = '';
                    if(userApprovedLogs.length === 0) {
                        historySubLogsHtml = `<span style="color:#aaa;">No approved tasks yet.</span>`;
                    } else {
                        userApprovedLogs.forEach(al => {
                            historySubLogsHtml += `• ${al.task_name} (Earned: $${parseFloat(al.amount).toFixed(2)})<br>`;
                        });
                    }

                    usersHtml += `
                    <div class="user-row">
                        <div class="user-meta-block">
                            <strong>👤 Username:</strong> <span style="color:#66fcf1; font-size:16px;">${u.username}</span><br>
                            <strong>🔑 Password:</strong> ${u.password} <br>
                            <strong>📧 Email Address:</strong> ${u.email} <br>
                            <strong>📞 Contact / WhatsApp:</strong> ${u.contact || 'N/A'} <br>
                            <strong>📍 Full Address:</strong> ${u.address || 'N/A'} <br>
                            <strong>💰 Available Balance:</strong> $${parseFloat(u.balance_numeric || 0).toFixed(2)} | <strong>⏳ Pending Tasks:</strong> ${userPendingCount}
                        </div>
                        
                        <div class="user-history-block">
                            <strong>📊 Completed Tasks History (${userApprovedLogs.length}):</strong><br>
                            ${historySubLogsHtml}
                        </div>

                        <div class="action-container-block">
                            <a href="/remove-user?id=${u.id}" class="remove-btn-styled" onclick="return confirm('Permanently remove worker account ${u.username}?')">REMOVE WORKER ACCOUNT</a>
                        </div>
                    </div>`;
                });
            }

            // Admin Task Deployment & Simulation Panel
            let adminTaskSectionHtml = `
            <h3>🎯 Deploy & Preview Active Tasks Containers</h3>
            <p style="color:#a5a6a7; font-size:14px;">You can view and test-execute the active tasks inside your secure node matrix below.</p>`;
            
            if(cpas.length === 0) {
                adminTaskSectionHtml += `<p style="color:#ff4d4d;">No active network structures deployed.</p>`;
            } else {
                cpas.forEach(c => {
                    adminTaskSectionHtml += `
                    <div class="galaxy-secure-node-wrapper">
                        <h4 style="color:#66fcf1; margin:0 0 5px 0;">🌐 Active Security Node: ${c.network_name}</h4>
                        <p style="font-size:13px; color:#45a29e; margin:0 0 10px 0;">📋 Instructions Template: ${c.instructions_en}</p>
                        <div class="galaxy-secure-frame-container">
                            ${c.embed_code}
                        </div>
                        <div style="text-align:right; margin-top:8px;">
                            <a href="/remove-cpa?id=${c.id}" style="color:#ff4d4d; font-size:12px; font-weight:bold;">[Delete Container Node]</a>
                        </div>
                    </div>`;
                });
            }

            res.send(htmlWrapper(req, 'Admin Dashboard', `
                <h2>Welcome Chief Admin <a href="/logout" class="logout-btn">${t.logout}</a></h2>
                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('admin-panel')">⚙️ Task Setup & Controls</button>
                    <button class="nav-tab" onclick="switchSection('task-reviews')">📩 Submissions Logs (${pendingSubmissions.length})</button>
                    <button class="nav-tab" onclick="switchSection('user-metrics')">👥 Workers Database Metrics</button>
                    <button class="nav-tab" onclick="switchSection('admin-tasks')">🎯 View & Execute Tasks</button>
                </div>
                
                <div id="admin-panel" class="dashboard-section active">
                    <h3>📢 Broadcast Notification</h3>
                    <form action="/send-notification" method="POST">
                        <select name="target_user" class="form-input"><option value="all">Broadcast to All Workers</option>${users.map(u => `<option value="${u.username}">${u.username}</option>`).join('')}</select>
                        <input type="text" name="message" placeholder="Type administrative notification text here..." required>
                        <button type="submit">Broadcast Message</button>
                    </form>
                    <hr style="border-color:#45a29e; margin:20px 0;">
                    <h3>➕ Add Native Micro-Task Container</h3>
                    <form action="/add-cpa" method="POST">
                        <input type="text" name="network_name" placeholder="Container Channel Name (e.g., Galaxy Server Data System 01)" required>
                        <textarea name="embed_code" placeholder="Paste Inner Container Execution Code or Frame URL Here" rows="3" required></textarea>
                        <input type="text" name="instructions_en" placeholder="System Guidelines Instructions (English)" required>
                        <input type="text" name="instructions_si" placeholder="System Guidelines Instructions (Sinhala)" required>
                        <input type="text" name="instructions_ta" placeholder="System Guidelines Instructions (Tamil)" required>
                        <button type="submit">Deploy Native Task Unit</button>
                    </form>
                </div>
                
                <div id="task-reviews" class="dashboard-section">${logsReviewHtml}</div>
                <div id="user-metrics" class="dashboard-section">${usersHtml}</div>
                <div id="admin-tasks" class="dashboard-section">${adminTaskSectionHtml}</div>
            `));
        } else {
            // WORKER VIEW (100% White-Labeled System)
            const userRow = await sql(`SELECT * FROM users WHERE username = $1`, [username]);
            const user = userRow[0];
            const cpas = await sql(`SELECT * FROM cpa_configs WHERE is_active = 1`);
            const logs = await sql(`SELECT * FROM task_logs WHERE username = $1`, [username]);
            const myNotifications = await sql(`SELECT * FROM notifications WHERE target_user = 'all' OR target_user = $1`, [username]);

            let currentBal = user ? parseFloat(user.balance_numeric || 0) : 0.0;
            let pendingCount = logs.filter(l => l.status === 'Pending').length;
            let completedCount = logs.filter(l => l.status === 'Success').length;

            let statsHtml = `
            <div class="stats-grid">
                <div class="stat-card"><h3>$${currentBal.toFixed(2)}</h3><p>AVAILABLE BALANCE</p></div>
                <div class="stat-card"><h3>${pendingCount}</h3><p>PENDING REVIEW</p></div>
                <div class="stat-card"><h3>${completedCount}</h3><p>APPROVED SECURE TASKS</p></div>
            </div>`;

            let cpaTasksHtml = `<h3>${t.tasks}</h3><p>${t.subText}</p>`;
            if(cpas.length === 0) {
                cpaTasksHtml += `<p style="text-align:center; color:#ff4d4d; margin:30px 0;">No system data verification lines open right now. Refresh shortly!</p>`;
            } else {
                cpas.forEach(c => {
                    let instructions = (lang === 'si' ? c.instructions_si : (lang === 'ta' ? c.instructions_ta : c.instructions_en));
                    cpaTasksHtml += `
                    <div class="galaxy-secure-node-wrapper">
                        <h4 style="color:#66fcf1; margin:0 0 5px 0;">🌐 Secure System Port: ${c.network_name}</h4>
                        <p style="font-size:14px; margin-top:0; color:#45a29e;">📋 <strong>Execution Instructions:</strong> ${instructions}</p>
                        
                        <div class="galaxy-secure-frame-container">
                            ${c.embed_code}
                        </div>
                        
                        <div class="proof-form">
                            <form action="/submit-task-proof" method="POST">
                                <input type="hidden" name="task_name" value="${c.network_name}">
                                <label style="font-size:12px; color:#45a29e;"><strong>Submit Complete Proof Code/Email Identity to Verify Payment:</strong></label>
                                <input type="text" name="proof_data" placeholder="Type your confirmation string or verified text identifier here..." required style="width:92%; padding:8px; font-size:13px; margin:5px 0;">
                                <button type="submit" style="padding:8px; font-size:13px; width:auto; margin-top:5px; background:#66fcf1; color:#0b0c10;">Transmit Verification Token</button>
                            </form>
                        </div>
                    </div>`;
                });
            }

            let logsHtml = `<h3>Activity Verifications Logs</h3>`;
            if(logs.length === 0) {
                logsHtml += `<p>No local node interactions recorded.</p>`;
            } else {
                logs.forEach(l => {
                    let badge = `<span class="badge-pending">PENDING AUDIT</span>`;
                    if(l.status === 'Success') badge = `<span class="badge-success">CREDITED</span>`;
                    if(l.status === 'Failed') badge = `<span class="badge-fail">INVALID PROOF</span>`;
                    logsHtml += `<div class="user-row">• <strong>${l.task_name}</strong> - ${badge} <br><small style="color:#aaa;">Tracking Token: ${l.proof_data} | Timestamp: ${l.timestamp}</small></div>`;
                });
            }

            let withdrawHtml = `
            <h3>💳 Local Settlement Settlement Outlets</h3>
            <p style="font-size:14px; color:#a5a6a7;">Request a standard direct balance translation payout immediately upon hitting the minimum <strong>$5.00</strong> target.</p>
            <div class="cpa-box" style="border-color:#45a29e;">
                <form onsubmit="alert('Transaction Recorded. Galaxy Clearing House will process the balance allocation into your designated terminal within 24 business hours.'); return false;">
                    <label>Terminal Method:</label>
                    <select class="form-input" style="width:100%; margin:8px 0;" required>
                        <option value="bank">Local Core Banking (BOC / Sampath / Commercial / HNB)</option>
                        <option value="mobile">Dialog eZ Cash / Mobitel mCash Interface</option>
                        <option value="crypto">Binance Pay Protocol (USDT Secure Network)</option>
                    </select>
                    <input type="text" placeholder="Enter Full Banking Account Number, Phone Matrix, or Crypto ID Destination" required>
                    <input type="number" step="0.01" min="5" max="${currentBal}" placeholder="Total payout translation volume ($)" required>
                    <button type="submit" ${currentBal < 5 ? 'disabled style="background:#555; color:#aaa; cursor:not-allowed;"' : ''}>
                        ${currentBal < 5 ? 'Threshold Limit Unreached ($5.00 minimum)' : 'Initiate Secure Settlement'}
                    </button>
                </form>
            </div>`;

            res.send(htmlWrapper(req, 'Worker Dashboard', `
                <h2>Welcome System Worker, ${username}! <a href="/logout" class="logout-btn">${t.logout}</a></h2>
                
                ${statsHtml}

                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('worker-tasks')">🎯 Core Portal Tasks</button>
                    <button class="nav-tab" onclick="switchSection('worker-logs')">📊 Interaction Logs</button>
                    <button class="nav-tab" onclick="switchSection('worker-withdraw')">💳 Settlement Port</button>
                </div>

                <div id="worker-tasks" class="dashboard-section active">${cpaTasksHtml}</div>
                <div id="worker-logs" class="dashboard-section">${logsHtml}</div>
                <div id="worker-withdraw" class="dashboard-section">${withdrawHtml}</div>
            `));
            if(user) await backupToGoogleSheet(user.username, user.email, currentBal, logs.length).catch(e=>'');
        }
    } catch (err) {
        res.status(500).send("Dashboard Failure Mode Triggered.");
    }
});

// SYSTEM INTERACTION ENDPOINTS
app.post('/submit-task-proof', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { task_name, proof_data } = req.body;
    try {
        await sql(`INSERT INTO task_logs (username, task_name, proof_data, amount, status, timestamp) 
                   VALUES ($1, $2, $3, 0.50, 'Pending', $4)`, 
                   [req.session.user, task_name, proof_data, new Date().toLocaleString()]);
        res.send("<script>alert('Task data transmitted to validation matrix. Processing confirmation queue.'); window.location.href='/dashboard';</script>");
    } catch(e) { res.redirect('/dashboard'); }
});

app.get('/approve-task', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const logId = parseInt(req.query.id);
    try {
        const logRow = await sql(`SELECT * FROM task_logs WHERE id = $1`, [logId]);
        if(logRow.length > 0 && logRow[0].status === 'Pending') {
            const task = logRow[0];
            await sql(`UPDATE task_logs SET status = 'Success' WHERE id = $1`, [logId]);
            await sql(`UPDATE users SET balance_numeric = balance_numeric + $1 WHERE username = $2`, [task.amount, task.username]);
        }
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

app.get('/reject-task', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await sql(`UPDATE task_logs SET status = 'Failed' WHERE id = $1`, [parseInt(req.query.id)]);
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

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

app.get('/remove-cpa', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    try {
        await sql(`DELETE FROM cpa_configs WHERE id = $1`, [parseInt(req.query.id)]);
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

module.exports = app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Galaxy Platform running on port ${PORT}`); });
