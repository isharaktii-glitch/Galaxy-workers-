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

// 🗄️ NEON DATABASE INITIALIZATION WITH COLUMN AUTO-MIGRATION
async function initDb() {
    try {
        await sql(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL
        )`);

        try {
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contact VARCHAR(20)`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_numeric NUMERIC(10,2) DEFAULT 0.0`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS earnings_percentage NUMERIC(5,2) DEFAULT 100.0`);
        } catch (migrationErr) {
            console.log("Migration columns check note:", migrationErr.message);
        }

        await sql(`CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            task_name VARCHAR(100) NOT NULL,
            proof_data TEXT,
            amount NUMERIC(10,2) DEFAULT 0.50,
            status VARCHAR(20) NOT NULL,
            timestamp VARCHAR(50) NOT NULL
        )`);

        await sql(`CREATE TABLE IF NOT EXISTS cpa_configs (
            id SERIAL PRIMARY KEY,
            network_name VARCHAR(100) NOT NULL,
            instructions_en TEXT,
            instructions_si TEXT,
            instructions_ta TEXT,
            is_active INTEGER DEFAULT 1
        )`);

        await sql(`CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT
        )`);

        await sql(`INSERT INTO system_settings (key, value) VALUES ('global_earnings_percentage', '100') ON CONFLICT (key) DO NOTHING`);
        await sql(`INSERT INTO system_settings (key, value) VALUES ('google_sheet_config', '') ON CONFLICT (key) DO NOTHING`);

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
        cpaTitle: "🔗 Internal Galaxy Portal Tasks Setup", taskInstr: "Task Steps & Guidelines",
        notifTitle: "🔔 Notification Center & Alert Feeds"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "ලබාගත හැකි විශ්වාසවන්ත සරල වැඩ (Tasks) 👇",
        subText: "පහත දැක්වෙන Galaxy පද්ධති පියවර සම්පූර්ණ කරන්න. තහවුරු කිරීමට නිවැරදි සාක්ෂි (Proofs) ඇතුළත් කරන්න.", logout: "ඉවත් වන්න (Logout)",
        forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න",
        cpaTitle: "🔗 Galaxy පද්ධති අභ්‍යන්තර Tasks සැකසුම්", taskInstr: "වැඩසටහනේ පියවර සහ උපදෙස්",
        notifTitle: "🔔 පණිවිඩ සහ නිවේදන පුවරුව"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழ்ய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் சான்றுகளையும் சமர்ப்பிக்கவும்.", logout: "வெளியேறு (Logout)",
        forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்",
        cpaTitle: "🔗 CPA நெட்வொர்க் இணைப்பு அமைப்புகள்", taskInstr: "பணி வழிமுறைகள்",
        notifTitle: "🔔 அறிவிப்பு மையம்"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:15px;margin:0;} 
        .container{max-width:850px;margin:20px auto;background:#1f2833;padding:20px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;box-sizing:border-box;}
        
        .header-block { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #45a29e; padding-bottom: 15px; flex-wrap: wrap; gap: 10px; }
        .header-title { color:#66fcf1; margin: 0; font-size: 24px; font-weight: bold; }
        .header-actions { display: flex; align-items: center; gap: 10px; }

        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 6px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        input, textarea, select.form-input {width:100%; padding:10px; margin:8px 0; border-radius:5px; border:1px solid #45a29e; background:#0b0c10; color:#fff; box-sizing: border-box;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;}
        button:hover{background:#66fcf1;}
        
        .user-row{background:#0b0c10;padding:15px;margin:12px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;box-sizing:border-box;}
        
        a{color:#66fcf1;text-decoration:none;} 
        .logout-btn{background:#ff4d4d;color:#fff;padding:6px 14px;font-size:13px;font-weight:bold;border-radius:4px;text-decoration:none;border:none;cursor:pointer;}
        .logout-btn:hover{background:#cc3333;}
        
        .galaxy-secure-node-wrapper { background: #111a24; padding: 20px; border-radius: 8px; border: 2px solid #45a29e; margin: 15px 0; box-sizing: border-box; text-align: center; }
        
        .navbar { display: flex; background: #0b0c10; border: 1px solid #45a29e; border-radius: 5px; margin-bottom: 20px; flex-wrap: wrap; }
        .nav-tab { flex: 1; min-width: 120px; text-align: center; padding: 12px; color: #c5c6c7; font-weight: bold; cursor: pointer; background: #0b0c10; border: none; transition: 0.3s; font-size:13px; }
        .nav-tab:hover { background: #1f2833; color: #66fcf1; }
        .nav-tab.active { background: #45a29e; color: #0b0c10; }
        
        .dashboard-section { display: none; }
        .dashboard-section.active { display: block; }
        
        .stats-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; width: 100%; box-sizing: border-box; }
        .stat-card { flex: 1; min-width: calc(33.333% - 12px); background: #0b0c10; border: 1px solid #45a29e; padding: 15px; border-radius: 8px; text-align: center; box-sizing: border-box; }
        
        .stat-card h3 { margin: 5px 0; color: #66fcf1; font-size: 20px; word-wrap: break-word; }
        .stat-card p { margin: 0; color: #a5a6a7; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; }

        .proof-form { background: #0b0c10; padding: 12px; border-radius: 5px; margin-top: 10px; border: 1px dashed #45a29e; text-align: left; }
        
        .notif-box { background: #141d26; border: 1px solid #45a29e; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 14px; color: #fff; line-height: 1.4; border-left: 5px solid #66fcf1;}
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
    <div class="header-block">
        <h2 class="header-title">${t.title}</h2>
        <div class="header-actions">
            <div class="lang-selector">
                <select onchange="window.location.href='/change-lang?lang=' + this.value}">
                    <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
                    <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
                    <option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option>
                </select>
            </div>
            <a href="/logout" class="logout-btn">${t.logout}</a>
        </div>
    </div>
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
    `));
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
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
            // Admin Logic remains unchanged
            res.send("Admin Dashboard View Placeholder");
        } else {
            // WORKER VIEW
            const userRow = await sql(`SELECT * FROM users WHERE username = $1`, [username]);
            const user = userRow[0];
            const cpas = await sql(`SELECT * FROM cpa_configs WHERE is_active = 1`);
            const logs = await sql(`SELECT * FROM task_logs WHERE username = $1`, [username]);
            const systemNotifs = await sql(`SELECT * FROM notifications WHERE target_user = $1 OR target_user = 'all' ORDER BY id DESC LIMIT 8`, [username]);

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
            cpas.forEach(c => {
                let instructions = (lang === 'si' ? c.instructions_si : (lang === 'ta' ? c.instructions_ta : c.instructions_en));
                cpaTasksHtml += `
                <div class="galaxy-secure-node-wrapper">
                    <h4 style="color:#66fcf1; margin:0 0 5px 0; text-align:left;">🌐 Core System Node: ${c.network_name}</h4>
                    <p style="font-size:14px; color:#45a29e; text-align:left;">📋 <strong>Execution Instructions:</strong> ${instructions}</p>
                    <div class="proof-form">
                        <form action="/submit-task-proof" method="POST">
                            <input type="hidden" name="task_name" value="${c.network_name}">
                            <label style="font-size:12px; color:#45a29e;"><strong>Submit Verification Tracking Code/Identity:</strong></label>
                            <input type="text" name="proof_data" placeholder="Type your confirmation identifier string here..." required>
                            <button type="submit" style="padding:10px; font-size:14px; background:#66fcf1; color:#0b0c10;">Transmit Verification Token</button>
                        </form>
                    </div>
                </div>`;
            });

            res.send(htmlWrapper(req, 'Worker Dashboard', `
                <h3 style="margin-top:0;">Welcome System Worker, ${username}!</h3>
                ${statsHtml}
                <div id="worker-tasks">${cpaTasksHtml}</div>
            `));
        }
    } catch (err) {
        res.status(500).send("Dashboard Failure Mode.");
    }
});

app.post('/submit-task-proof', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { task_name, proof_data } = req.body;
    try {
        const user = req.session.user;
        const timeStr = new Date().toLocaleString();
        await sql(`INSERT INTO task_logs (username, task_name, proof_data, amount, status, timestamp) 
                   VALUES ($1, $2, $3, 0.50, 'Pending', $4)`, [user, task_name, proof_data, timeStr]);
        res.send("<script>alert('Task proof transmitted successfully.'); window.location.href='/dashboard';</script>");
    } catch(e) { res.redirect('/dashboard'); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Galaxy Platform running on port ${PORT}`); });
