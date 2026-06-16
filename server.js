require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');
const multer = require('multer');

// Neon Database Connection
const sql = neon(process.env.DATABASE_URL);
const app = express();

// Multer memory storage (no disk write)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'galaxy-2026-super-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Serve payment proof images from database
app.get('/proof-image/:id', async (req, res) => {
    try {
        const rows = await sql`SELECT file_data FROM payment_proofs WHERE id = ${req.params.id}`;
        if (rows.length > 0 && rows[0].file_data) {
            const img = Buffer.from(rows[0].file_data, 'base64');
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(img);
        } else {
            res.status(404).send('Not found');
        }
    } catch (e) {
        res.status(500).send('Error');
    }
});

// ===================== DATABASE INITIALIZATION =====================
async function initDb() {
    // Create tables if not exist
    await sql`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS task_logs (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        task_name VARCHAR(100) NOT NULL,
        proof_data TEXT,
        amount NUMERIC(10,2) DEFAULT 0.50,
        status VARCHAR(20) NOT NULL,
        timestamp VARCHAR(50) NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS cpa_configs (
        id SERIAL PRIMARY KEY,
        network_name VARCHAR(100) NOT NULL,
        embed_code TEXT NOT NULL,
        instructions_en TEXT,
        instructions_si TEXT,
        instructions_ta TEXT,
        is_active INTEGER DEFAULT 1
    )`;
    await sql`CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT
    )`;
    await sql`CREATE TABLE IF NOT EXISTS gmail_tasks (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        email_created VARCHAR(100) NOT NULL,
        password_created VARCHAR(50) NOT NULL,
        task_code VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        amount NUMERIC(10,2) DEFAULT 0.25,
        referral_commission_paid INTEGER DEFAULT 0,
        buyer_reason TEXT,
        timestamp VARCHAR(50) NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS payment_proofs (
        id SERIAL PRIMARY KEY,
        buyer_username VARCHAR(50) NOT NULL,
        file_data TEXT,
        original_name VARCHAR(255),
        timestamp VARCHAR(50) NOT NULL,
        is_deleted INTEGER DEFAULT 0
    )`;
    await sql`CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        target_user VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        timestamp VARCHAR(50) NOT NULL,
        is_read INTEGER DEFAULT 0
    )`;

    // Safe column additions
    await sql`
        DO $$ BEGIN
            ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS contact VARCHAR(20);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_numeric NUMERIC(10,2) DEFAULT 0.0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS earnings_percentage NUMERIC(5,2) DEFAULT 100.0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'LK';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50);
        END $$;
    `;
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read INTEGER DEFAULT 0`;

    // Default settings
    const settings = [
        ['global_earnings_percentage', '100'],
        ['google_sheet_config', ''],
        ['gmail_task_price_lk', '0.25'],
        ['gmail_task_price_intl', '0.25'],
        ['gmail_task_instructions_en', 'Create a new Gmail account and submit credentials.'],
        ['gmail_task_instructions_si', 'නව Gmail ගිණුමක් සාදා විස්තර ඇතුළත් කරන්න.'],
        ['gmail_task_instructions_ta', 'புதிய Gmail கணக்கை உருவாக்கி விவரங்களைச் சமர்ப்பிக்கவும்.'],
        ['referral_commission_tier1', '4'],
        ['referral_commission_tier2', '5'],
        ['referral_commission_tier3', '6'],
        ['referral_commission_tier4', '7'],
        ['referral_commission_tier5', '10'],
        ['referral_commission_tier6', '15']
    ];
    for (const [key, value] of settings) {
        await sql`INSERT INTO system_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO NOTHING`;
    }

    // Default buyer account
    const buyer = await sql`SELECT id FROM users WHERE username = 'buyer'`;
    if (!buyer.length) {
        await sql`INSERT INTO users (username, password, email, address, contact, balance_numeric) VALUES ('buyer', 'buyer123', 'buyer@galaxy.com', 'Buyer Address', '000000', 0)`;
    }

    console.log('Database initialized');
}

let dbReady = false;
app.use(async (req, res, next) => {
    if (!dbReady) {
        try {
            await initDb();
            dbReady = true;
        } catch (e) {
            console.error('DB init failed:', e);
            return res.status(500).send('Database connection error');
        }
    }
    next();
});

// ===================== HELPERS =====================
async function getSetting(key) {
    try {
        const rows = await sql`SELECT value FROM system_settings WHERE key = ${key}`;
        return rows.length ? rows[0].value : null;
    } catch (e) { return null; }
}

async function backupSheet(username, email, balance, taskCount) {
    const cfg = await getSetting('google_sheet_config');
    if (!cfg) return;
    try {
        const config = JSON.parse(cfg);
        if (!config.client_email || !config.private_key || !config.spreadsheet_id) return;
        const auth = new google.auth.JWT(config.client_email, null, config.private_key.replace(/\\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
        const sheets = google.sheets({ version: 'v4', auth });
        await sheets.spreadsheets.values.append({
            spreadsheetId: config.spreadsheet_id,
            range: 'Sheet1!A:E',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[new Date().toISOString(), username, email, balance, taskCount]] }
        });
    } catch (e) { console.error("Sheet backup error:", e); }
}

// Generate Gmail Task Code (user permanent code)
function getUserInitials(username) {
    const parts = username.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    } else {
        return username.substring(0, 2).toUpperCase();
    }
}

async function generateUserCode(username, referredBy) {
    const initials = getUserInitials(username);
    if (!referredBy) {
        // No referrer, first user in the whole system? We need a global sequential number.
        // We'll use the count of users who have no referral code? Simpler: just generate HH-001 based on count of existing codes.
        // To get a unique number, we could count all users with a referral_code (including those generated) + 1.
        const maxNum = await sql`SELECT MAX(CAST(SUBSTRING(referral_code FROM '([0-9]+)') AS INTEGER)) as max_val FROM users WHERE referral_code IS NOT NULL AND referral_code LIKE '%-%' AND referral_code NOT LIKE '%/%'`;
        const nextNum = (maxNum[0]?.max_val || 0) + 1;
        const code = initials + '-' + String(nextNum).padStart(3, '0');
        await sql`UPDATE users SET referral_code = ${code} WHERE username = ${username}`;
        return code;
    } else {
        // Get referrer's code
        const refUser = await sql`SELECT referral_code FROM users WHERE username = ${referredBy}`;
        if (!refUser.length || !refUser[0].referral_code) {
            // Fallback: treat as original
            const nextNum = (await sql`SELECT MAX(CAST(SUBSTRING(referral_code FROM '([0-9]+)') AS INTEGER)) as max_val FROM users WHERE referral_code IS NOT NULL AND referral_code NOT LIKE '%/%'`)[0]?.max_val || 0;
            const code = initials + '-' + String(nextNum + 1).padStart(3, '0');
            await sql`UPDATE users SET referral_code = ${code} WHERE username = ${username}`;
            return code;
        }
        const refCode = refUser[0].referral_code;
        if (!refCode.includes('/')) {
            // Direct referral from original user
            const newCode = refCode + '/' + initials;
            await sql`UPDATE users SET referral_code = ${newCode} WHERE username = ${username}`;
            return newCode;
        } else {
            // Referral from a non-original user
            const dashIndex = refCode.indexOf('-');
            const slashIndex = refCode.indexOf('/');
            const numStr = refCode.substring(dashIndex + 1, slashIndex);
            const num = parseInt(numStr);
            const newNum = num + 1;
            const referrerInitials = refCode.substring(refCode.lastIndexOf('/') + 1);
            const newCode = referrerInitials + '-' + String(newNum).padStart(3, '0') + '/' + initials;
            await sql`UPDATE users SET referral_code = ${newCode} WHERE username = ${username}`;
            return newCode;
        }
    }
}

// ===================== TRANSLATIONS =====================
const translations = {
    en: {
        title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration",
        user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number",
        btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "No account?", regHere: "Register here",
        backLog: "Back to Login", welcome: "Welcome", total: "Total Earnings", tasks: "Available Tasks 👇",
        subText: "Complete the tasks below.", logout: "Logout", forgot: "Forgot Password?",
        notifTitle: "🔔 Notifications", gmailTask: "📧 Gmail Task",
        gmailInstr: "Create a Gmail and submit.", emailCreated: "Email", emailPass: "Password",
        submitGmail: "Submit", yourCode: "Your Code", getRefLink: "Referral Link",
        refLink: "Your Referral Link", copyRef: "Copy", selectCountry: "Select Country",
        countryLK: "Sri Lanka 🇱🇰", countryINTL: "International 🌍", gmailPrice: "Price/Gmail",
        gmailHistory: "Gmail History", referralEarnings: "Referral Earnings",
        buyerLogin: "Buyer Login", buyerDashboard: "Buyer Dashboard", buyerWelcome: "Welcome",
        allPaymentsDone: "ALL PAID", paymentProof: "Proof Upload", uploadProof: "Upload",
        done: "DONE", wrong: "WRONG", reason: "Reason", submitReason: "Send",
        paymentReady: "Pay Ready", totalGmails: "Total", pendingGmails: "Pending",
        approvedGmails: "Approved", rejectedGmails: "Rejected", search: "Search",
        viewGmails: "📧 View Gmails", hideGmails: "Hide", deleteTask: "Delete"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "ලියාපදිංචිය",
        user: "පරිශීලක නාමය", pass: "මුරපදය", email: "ඊමේල්", addr: "ලිපිනය", phone: "දුරකථන",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නැද්ද?", regHere: "ලියාපදිංචි වන්න",
        backLog: "ආපසු", welcome: "ආයුබෝවන්", total: "මුළු ඉපැයීම", tasks: "කාර්යයන් 👇",
        subText: "කාර්යයන් සම්පූර්ණ කරන්න.", logout: "ඉවත් වන්න", forgot: "මුරපදය අමතකද?",
        notifTitle: "🔔 දැනුම්දීම්", gmailTask: "📧 Gmail කාර්යය",
        gmailInstr: "Gmail ගිණුමක් සාදන්න.", emailCreated: "ඊමේල්", emailPass: "මුරපදය",
        submitGmail: "යොමු කරන්න", yourCode: "ඔබේ කේතය", getRefLink: "Referral Link",
        refLink: "ඔබේ Link", copyRef: "Copy", selectCountry: "රට තෝරන්න",
        countryLK: "ශ්‍රී ලංකාව 🇱🇰", countryINTL: "විදෙස් 🌍", gmailPrice: "Gmail මිල",
        gmailHistory: "ඉතිහාසය", referralEarnings: "Referral", buyerLogin: "ගැනුම්කරු",
        buyerDashboard: "Buyer", buyerWelcome: "ආයුබෝවන්", allPaymentsDone: "සියලු ගෙවීම්",
        paymentProof: "ගෙවීම් සාක්ෂි", uploadProof: "Upload", done: "හරි", wrong: "වැරදි",
        reason: "හේතුව", submitReason: "යවන්න", paymentReady: "ගෙවීම් සූදානම්",
        totalGmails: "මුළු", pendingGmails: "පොරොත්තු", approvedGmails: "අනුමත", rejectedGmails: "ප්‍රතික්ෂේපිත",
        search: "සොයන්න", viewGmails: "📧 Gmails බලන්න", hideGmails: "සඟවන්න", deleteTask: "මකන්න"
    },
    ta: {
        title: "GALAXY WORKERS", login: "உள்நுழைவு", reg: "பதிவு",
        user: "பயனர்பெயர்", pass: "கடவுச்சொல்", email: "மின்னஞ்சல்", addr: "முகவரி", phone: "தொலைபேசி",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "பதிவு செய்க",
        backLog: "திரும்ப", welcome: "வரவேற்கிறோம்", total: "மொத்தம்", tasks: "பணிகள் 👇",
        subText: "பணிகளை முடிக்கவும்.", logout: "வெளியேறு", forgot: "மறந்துவிட்டதா?",
        notifTitle: "🔔 அறிவிப்புகள்", gmailTask: "📧 Gmail பணி",
        gmailInstr: "Gmail உருவாக்கு.", emailCreated: "மின்னஞ்சல்", emailPass: "கடவுச்சொல்",
        submitGmail: "சமர்ப்பி", yourCode: "உங்கள் குறியீடு", getRefLink: "பரிந்துரை இணைப்பு",
        refLink: "உங்கள் இணைப்பு", copyRef: "நகலெடு", selectCountry: "நாடு தேர்வு",
        countryLK: "இலங்கை 🇱🇰", countryINTL: "சர்வதேச 🌍", gmailPrice: "விலை",
        gmailHistory: "வரலாறு", referralEarnings: "பரிந்துரை", buyerLogin: "வாங்குபவர்",
        buyerDashboard: "Buyer", buyerWelcome: "வரவேற்கிறோம்", allPaymentsDone: "அனைத்தும் முடிந்தது",
        paymentProof: "கட்டணச் சான்று", uploadProof: "பதிவேற்று", done: "சரி", wrong: "தவறு",
        reason: "காரணம்", submitReason: "அனுப்பு", paymentReady: "கட்டணம் தயார்",
        totalGmails: "மொத்தம்", pendingGmails: "நிலுவை", approvedGmails: "அனுமதி", rejectedGmails: "நிராகரி",
        search: "தேடு", viewGmails: "📧 Gmails காண்க", hideGmails: "மறை", deleteTask: "நீக்கு"
    }
};

// HTML Wrapper
const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:15px}
        .container{max-width:1000px;margin:20px auto;background:#1f2833;padding:20px;border-radius:10px;border:1px solid #45a29e}
        .header-block{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #45a29e;padding-bottom:15px}
        .header-title{color:#66fcf1;font-size:24px}
        .lang-selector select{background:#0b0c10;color:#66fcf1;border:1px solid #45a29e;padding:6px 10px;border-radius:5px;cursor:pointer}
        input,textarea,select{width:100%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;box-sizing:border-box}
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px}
        button:hover{background:#66fcf1}
        .user-row{background:#0b0c10;padding:15px;margin:12px 0;border-radius:5px;border-left:5px solid #45a29e}
        a{color:#66fcf1;text-decoration:none}
        .logout-btn{background:#ff4d4d;color:#fff;padding:6px 14px;font-size:13px;border-radius:4px}
        .navbar{display:flex;background:#0b0c10;border:1px solid #45a29e;border-radius:5px;margin-bottom:20px;flex-wrap:wrap}
        .nav-tab{flex:1;min-width:100px;text-align:center;padding:12px;color:#c5c6c7;font-weight:bold;cursor:pointer;background:#0b0c10;border:none;font-size:13px}
        .nav-tab.active{background:#45a29e;color:#0b0c10}
        .dashboard-section{display:none}
        .dashboard-section.active{display:block}
        .stats-grid{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
        .stat-card{flex:1;min-width:calc(33% - 12px);background:#0b0c10;border:1px solid #45a29e;padding:15px;border-radius:8px;text-align:center}
        @media(max-width:600px){.stat-card{min-width:100%}}
        .badge-pending{background:#f0ad4e;color:#000;padding:2px 6px;border-radius:3px;font-size:11px}
        .badge-success{background:#45a29e;color:#0b0c10;padding:2px 6px;border-radius:3px;font-size:11px}
        .badge-fail{background:#ff4d4d;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px}
        .payment-ready-btn{background:#f39c12;color:#fff;animation:glow 2s infinite;padding:8px;border-radius:4px;display:inline-block;margin-top:10px}
        @keyframes glow{0%{box-shadow:0 0 5px #f39c12}50%{box-shadow:0 0 20px #f39c12}100%{box-shadow:0 0 5px #f39c12}}
        .btn-done{background:#2ecc71;color:#fff;padding:5px 10px;border-radius:4px;display:inline-block}
        .btn-wrong{background:#ff4d4d;color:#fff;padding:5px 10px;border-radius:4px}
        .search-form{margin-bottom:15px;display:flex;gap:10px}
        .search-form input{flex:1}
        .search-form button{width:auto;margin:0}
        .gmail-detail{font-size:12px;color:#aaa; margin-left:20px}
    </style>
    <script>
        function switchSection(id){
            document.querySelectorAll('.dashboard-section').forEach(s=>s.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            event.target.classList.add('active');
        }
        function toggleGmails(uid){
            const div = document.getElementById('gmail-'+uid);
            if(div.style.display==='none') div.style.display='block';
            else div.style.display='none';
        }
        function copyRefLink(){
            const inp = document.getElementById('refLinkInput');
            inp.select();
            document.execCommand('copy');
            alert('Copied!');
        }
    </script></head><body><div class="container">
    <div class="header-block"><h2 class="header-title">${t.title}</h2>
    <div style="display:flex;gap:10px;align-items:center">
        <div class="lang-selector"><select onchange="location.href='/change-lang?lang='+this.value">
            <option value="en" ${lang==='en'?'selected':''}>English</option>
            <option value="si" ${lang==='si'?'selected':''}>සිංහල</option>
            <option value="ta" ${lang==='ta'?'selected':''}>தமிழ்</option>
        </select></div>
        <a href="/logout" class="logout-btn">${t.logout}</a></div></div>${content}</div></body></html>`;
};

app.get('/change-lang', (req, res) => {
    if (['en','si','ta'].includes(req.query.lang)) req.session.lang = req.query.lang;
    res.redirect(req.get('referer') || '/');
});

// ===================== AUTH ROUTES =====================
app.get('/', (req, res) => {
    if (req.session.user) return req.session.user === 'buyer' ? res.redirect('/buyer-dashboard') : res.redirect('/dashboard');
    const t = translations[req.session.lang||'en'];
    res.send(htmlWrapper(req, 'Login', `
        <h3>${t.login}</h3>
        <form action="/login" method="POST">
            <input name="username" placeholder="${t.user}" required>
            <input type="password" name="password" placeholder="${t.pass}" required>
            <button>${t.btnLog}</button>
        </form>
        <p style="text-align:center; margin-top:15px;">${t.noAcc} <a href="/register">${t.regHere}</a><br><a href="/forgot-password" style="color:#ff4d4d">${t.forgot}</a></p>
    `));
});

app.get('/register', (req, res) => {
    const t = translations[req.session.lang||'en'];
    const ref = req.query.ref || '';
    res.send(htmlWrapper(req, 'Register', `
        <h3>${t.reg}</h3>
        <form action="/register" method="POST">
            <input name="username" placeholder="${t.user}" required>
            <input type="password" name="password" placeholder="${t.pass}" required>
            <input type="email" name="email" placeholder="${t.email}" required>
            <input name="address" placeholder="${t.addr}" required>
            <input name="contact" placeholder="${t.phone}" required>
            <input type="hidden" name="ref_code" value="${ref}">
            <button>${t.btnReg}</button>
        </form>
        <p style="text-align:center"><a href="/">${t.backLog}</a></p>
    `));
});

app.post('/register', async (req, res) => {
    const { username, password, email, address, contact, ref_code } = req.body;
    try {
        const exists = await sql`SELECT id FROM users WHERE LOWER(username) = ${username.toLowerCase()}`;
        if (exists.length) return res.send("<script>alert('Username already exists!'); location.href='/register'</script>");
        let referredBy = null;
        if (ref_code?.trim()) {
            const ref = await sql`SELECT username FROM users WHERE referral_code = ${ref_code.trim()}`;
            if (ref.length) referredBy = ref[0].username;
        }
        await sql`INSERT INTO users (username, password, email, address, contact, balance_numeric, referred_by) VALUES (${username}, ${password}, ${email}, ${address}, ${contact}, 0, ${referredBy})`;
        const now = new Date().toLocaleString();
        await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${username}, '👋 Welcome to Galaxy Workers!', ${now})`;
        if (referredBy) {
            await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${referredBy}, ${'🎉 New referral: '+username}, ${now})`;
        }
        backupSheet(username, email, 0, 0).catch(()=>{});
        res.send("<script>alert('Registration Successful!'); location.href='/'</script>");
    } catch (e) { console.error(e); res.send("<script>alert('Error'); location.href='/register'</script>"); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') { req.session.user = 'admin'; return res.redirect('/dashboard'); }
    if (username === 'buyer' && password === 'buyer123') { req.session.user = 'buyer'; return res.redirect('/buyer-dashboard'); }
    try {
        const users = await sql`SELECT username FROM users WHERE username = ${username} AND password = ${password}`;
        if (users.length) { req.session.user = users[0].username; res.redirect('/dashboard'); }
        else res.send("<script>alert('Invalid Credentials'); location.href='/'</script>");
    } catch (e) { console.error(e); res.send("<script>alert('Error'); location.href='/'</script>"); }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// ===================== BUYER DASHBOARD =====================
app.get('/buyer-dashboard', async (req, res) => {
    if (!req.session.user || req.session.user !== 'buyer') return res.redirect('/');
    const t = translations[req.session.lang||'en'];
    try {
        const search = req.query.search || '';
        let tasks;
        if (search.trim()) {
            const q = '%' + search.toLowerCase() + '%';
            tasks = await sql`SELECT * FROM gmail_tasks WHERE LOWER(email_created) LIKE ${q} OR LOWER(password_created) LIKE ${q} OR LOWER(task_code) LIKE ${q} ORDER BY id DESC`;
        } else {
            tasks = await sql`SELECT * FROM gmail_tasks ORDER BY id DESC`;
        }
        const proofs = await sql`SELECT * FROM payment_proofs WHERE buyer_username='buyer' AND is_deleted=0 ORDER BY id DESC`;

        let tasksHtml = `<h3>📧 Gmail Submissions</h3>
        <form class="search-form" method="GET" action="/buyer-dashboard">
            <input name="search" placeholder="${t.search}..." value="${search}">
            <button>${t.search}</button>
        </form>`;
        if (!tasks.length) tasksHtml += `<p>No submissions.</p>`;
        else {
            const grouped = {}; tasks.forEach(x => { if(!grouped[x.task_code]) grouped[x.task_code]=[]; grouped[x.task_code].push(x); });
            for (let [code, list] of Object.entries(grouped)) {
                tasksHtml += `<div style="margin:15px 0;border:1px solid #45a29e;padding:10px"><h4>Code: ${code}</h4>`;
                list.forEach(task => {
                    let badge = task.status === 'Success' ? '<span class="badge-success">Approved</span>' : task.status === 'Pending' ? '<span class="badge-pending">Pending</span>' : task.status === 'PaymentReady' ? '<span style="background:#f39c12;color:#fff;padding:2px 6px">Payment Ready</span>' : '<span class="badge-fail">Wrong</span>';
                    tasksHtml += `<div style="margin:10px 0;border-bottom:1px solid #333;padding-bottom:10px">
                        <p><strong>📧 Email:</strong> ${task.email_created}</p>
                        <p><strong>🔑 Password:</strong> ${task.password_created}</p>
                        <p><strong>💰 Amount:</strong> $${parseFloat(task.amount).toFixed(2)} | ${badge}</p>
                        <p><strong>📅 Date:</strong> ${task.timestamp}</p>
                        ${task.buyer_reason ? `<p><strong>Reason:</strong> ${task.buyer_reason}</p>` : ''}`;
                    if (task.status === 'Pending') tasksHtml += `
                        <div style="display:flex;gap:10px;margin-top:5px">
                            <a href="/buyer-mark-done?id=${task.id}" class="btn-done">${t.done}</a>
                            <form action="/buyer-mark-wrong" method="POST" style="margin:0">
                                <input type="hidden" name="task_id" value="${task.id}">
                                <input name="reason" placeholder="${t.reason}" required style="width:150px; display:inline-block">
                                <button class="btn-wrong" style="width:auto">${t.wrong}</button>
                            </form>
                        </div>`;
                    if (task.status === 'Success') tasksHtml += `<a href="/buyer-mark-payment-ready?id=${task.id}" class="payment-ready-btn">${t.paymentReady}</a>`;
                    tasksHtml += `</div>`;
                });
                tasksHtml += `</div>`;
            }
        }

        let proofHtml = `<h3>${t.paymentProof}</h3>
        <form action="/upload-payment-proof" method="POST" enctype="multipart/form-data">
            <input type="file" name="payment_proof" required><button>${t.uploadProof}</button>
        </form>`;
        if (proofs.length) {
            proofHtml += proofs.map(p => `<div style="margin:10px 0"><img src="/proof-image/${p.id}" style="max-width:300px"><p>${p.timestamp}</p><a href="/delete-payment-proof?id=${p.id}">Delete</a></div>`).join('');
        } else proofHtml += `<p>No proofs yet.</p>`;

        res.send(htmlWrapper(req, 'Buyer Dashboard', `
            <h3>${t.buyerWelcome}</h3>
            <form action="/buyer-all-payments-done" method="POST"><button class="payment-ready-btn">💰 ${t.allPaymentsDone}</button></form>
            ${proofHtml}
            ${tasksHtml}
        `));
    } catch (e) { console.error(e); res.status(500).send("Error"); }
});

app.get('/buyer-mark-done', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    try {
        const task = await sql`SELECT * FROM gmail_tasks WHERE id = ${req.query.id} AND status='Pending'`;
        if (task.length) {
            const t = task[0];
            await sql`UPDATE gmail_tasks SET status='Success' WHERE id = ${req.query.id}`;
            await sql`UPDATE users SET balance_numeric = balance_numeric + ${t.amount} WHERE username = ${t.username}`;
            // Referral commission (simplified)
            if (t.referral_commission_paid === 0) {
                const user = await sql`SELECT referred_by FROM users WHERE username = ${t.username}`;
                if (user.length && user[0].referred_by) {
                    const cnt = await sql`SELECT COUNT(*) as c FROM gmail_tasks WHERE username = ${t.username} AND status IN ('Success','PaymentReady')`;
                    let amt = 4;
                    const c = parseInt(cnt[0].c);
                    if (c > 25) amt = 15;
                    else if (c > 15) amt = 10;
                    else if (c > 8) amt = 7;
                    else if (c > 4) amt = 6;
                    else if (c > 3) amt = 5;
                    const usd = amt / 300;
                    await sql`UPDATE users SET balance_numeric = balance_numeric + ${usd} WHERE username = ${user[0].referred_by}`;
                    await sql`UPDATE gmail_tasks SET referral_commission_paid=1 WHERE id = ${req.query.id}`;
                    await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${user[0].referred_by}, ${'💰 Referral commission $'+usd.toFixed(2)+' from '+t.username}, ${new Date().toLocaleString()})`;
                }
            }
            await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${t.username}, ${'🎉 Gmail approved! +$'+parseFloat(t.amount).toFixed(2)}, ${new Date().toLocaleString()})`;
        }
        res.redirect('/buyer-dashboard');
    } catch (e) { res.redirect('/buyer-dashboard'); }
});

app.post('/buyer-mark-wrong', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    const { task_id, reason } = req.body;
    try {
        const task = await sql`SELECT * FROM gmail_tasks WHERE id = ${task_id} AND status='Pending'`;
        if (task.length) {
            await sql`UPDATE gmail_tasks SET status='Failed', buyer_reason=${reason} WHERE id = ${task_id}`;
            await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${task[0].username}, ${'❌ Gmail rejected: '+reason}, ${new Date().toLocaleString()})`;
            await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES ('admin', ${'📧 Gmail #'+task_id+' WRONG by buyer'}, ${new Date().toLocaleString()})`;
        }
        res.redirect('/buyer-dashboard');
    } catch (e) { res.redirect('/buyer-dashboard'); }
});

app.get('/buyer-mark-payment-ready', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    try {
        const task = await sql`UPDATE gmail_tasks SET status='PaymentReady' WHERE id = ${req.query.id} AND status='Success' RETURNING *`;
        if (task.length) {
            await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${task[0].username}, '💵 Payment ready for your Gmail', ${new Date().toLocaleString()})`;
        }
        res.redirect('/buyer-dashboard');
    } catch (e) { res.redirect('/buyer-dashboard'); }
});

app.post('/buyer-all-payments-done', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    const now = new Date().toLocaleString();
    await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES ('admin', ${'💰 All payments done by buyer at '+now}, ${now})`;
    res.send("<script>alert('All payments marked as done!'); location.href='/buyer-dashboard'</script>");
});

app.post('/upload-payment-proof', upload.single('payment_proof'), async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    try {
        const b64 = req.file.buffer.toString('base64');
        await sql`INSERT INTO payment_proofs (buyer_username, file_data, original_name, timestamp) VALUES ('buyer', ${b64}, ${req.file.originalname}, ${new Date().toLocaleString()})`;
        res.redirect('/buyer-dashboard');
    } catch (e) { res.redirect('/buyer-dashboard'); }
});

app.get('/delete-payment-proof', async (req, res) => {
    if (!['buyer','admin'].includes(req.session.user)) return res.redirect('/');
    await sql`UPDATE payment_proofs SET is_deleted=1 WHERE id = ${req.query.id}`;
    res.redirect(req.session.user === 'admin' ? '/dashboard?tab=admin-payments' : '/buyer-dashboard');
});

// ===================== WORKER & ADMIN DASHBOARD =====================
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const username = req.session.user;
    const lang = req.session.lang || 'en';
    const t = translations[lang];

    try {
        if (username === 'admin') {
            const users = await sql`SELECT * FROM users WHERE username NOT IN ('admin','buyer')`;
            const cpas = await sql`SELECT * FROM cpa_configs`;
            const allLogs = await sql`SELECT * FROM task_logs ORDER BY id DESC`;
            const allGmail = await sql`SELECT * FROM gmail_tasks ORDER BY id DESC`;
            const allProofs = await sql`SELECT * FROM payment_proofs WHERE is_deleted=0 ORDER BY id DESC`;
            const kw = req.query.search_keyword || '';
            let filteredUsers = users;
            if (kw.trim()) {
                const k = kw.toLowerCase();
                filteredUsers = users.filter(u => u.username.toLowerCase().includes(k) || u.email.toLowerCase().includes(k) || (u.contact||'').toLowerCase().includes(k) || (u.address||'').toLowerCase().includes(k));
            }
            // Admin panel with tabbed sections
            res.send(htmlWrapper(req, 'Admin Dashboard', `
                <h3>Welcome Chief Admin</h3>
                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('admin-panel')">⚙️ Panel</button>
                    <button class="nav-tab" onclick="switchSection('task-reviews')">📩 Subs</button>
                    <button class="nav-tab" onclick="switchSection('user-metrics')">👥 Workers</button>
                    <button class="nav-tab" onclick="switchSection('admin-tasks')">🎯 Tasks</button>
                    <button class="nav-tab" onclick="switchSection('gmail-tasks')">📧 Gmails</button>
                    <button class="nav-tab" onclick="switchSection('admin-payments')">💳 Proofs</button>
                    <button class="nav-tab" onclick="switchSection('gmail-settings')">⚙️ Gmail</button>
                    <button class="nav-tab" onclick="switchSection('referral-settings')">💰 Referral</button>
                </div>
                <div id="admin-panel" class="dashboard-section active">
                    <h3>📢 Send Notification</h3>
                    <form action="/send-notification" method="POST">
                        <select name="target_user" class="form-input">
                            <option value="all">📢 All Workers</option>
                            ${users.map(u => `<option value="${u.username}">👤 ${u.username}</option>`).join('')}
                        </select>
                        <input name="message" placeholder="Message..." required>
                        <button>Send</button>
                    </form>
                    <hr><h3>➕ Add Task</h3>
                    <form action="/add-cpa" method="POST">
                        <input name="network_name" placeholder="Task Name" required>
                        <input name="embed_code" placeholder="URL" required>
                        <input name="instructions_en" placeholder="EN Instructions" required>
                        <input name="instructions_si" placeholder="SI Instructions" required>
                        <input name="instructions_ta" placeholder="TA Instructions" required>
                        <button>Add Task</button>
                    </form>
                </div>
                <div id="task-reviews" class="dashboard-section">
                    <h3>📩 Pending Submissions</h3>
                    ${allLogs.filter(x=>x.status==='Pending').map(l=>`<div class="user-row" style="border-left-color:#f0ad4e">${l.username} - ${l.task_name}<br>Proof: ${l.proof_data}<br>${l.timestamp}<br><a href="/approve-task?id=${l.id}">APPROVE</a> | <a href="/reject-task?id=${l.id}">REJECT</a></div>`).join('') || '<p>No pending</p>'}
                </div>
                <div id="user-metrics" class="dashboard-section">
                    <h3>👥 Workers</h3>
                    <form method="GET" action="/dashboard" class="search-form">
                        <input type="hidden" name="tab" value="user-metrics">
                        <input name="search_keyword" value="${kw}" placeholder="Search worker...">
                        <button>${t.search}</button>
                    </form>
                    ${filteredUsers.map(u => {
                        const gmailCounts = allGmail.filter(g => g.username === u.username);
                        const pendingG = gmailCounts.filter(g => g.status === 'Pending').length;
                        const doneG = gmailCounts.filter(g => g.status === 'Success' || g.status === 'PaymentReady').length;
                        const wrongG = gmailCounts.filter(g => g.status === 'Failed').length;
                        const gmailDetails = gmailCounts.map(g => `<div style="margin:5px 0;font-size:12px">📧 ${g.email_created} (${g.task_code}) - ${g.status} $${g.amount}</div>`).join('');
                        return `<div class="user-row">
                            <strong>👤 ${u.username}</strong> | 📧 ${u.email} | 📞 ${u.contact || 'N/A'}<br>
                            🏠 ${u.address || 'N/A'} | 🌍 ${u.country || 'LK'}<br>
                            💰 Balance: $${parseFloat(u.balance_numeric||0).toFixed(2)}<br>
                            <button onclick="toggleGmails('${u.username}')" style="width:auto;background:#45a29e;color:#000;padding:5px 10px">📧 Gmails (${pendingG} pending, ${doneG} done, ${wrongG} wrong)</button>
                            <div id="gmail-${u.username}" style="display:none; margin-top:10px">${gmailDetails || 'No Gmails yet.'}</div>
                            <a href="/remove-user?id=${u.id}" onclick="return confirm('Delete?')" class="logout-btn" style="display:inline-block;margin-top:10px">⚠️ Delete</a>
                        </div>`;
                    }).join('')}
                </div>
                <div id="admin-tasks" class="dashboard-section">
                    <h3>🎯 Active Tasks</h3>
                    ${cpas.map(c => `<div class="user-row">${c.network_name} - ${c.embed_code} <a href="/remove-cpa?id=${c.id}">Delete</a></div>`).join('')}
                </div>
                <div id="gmail-tasks" class="dashboard-section">
                    <h3>📧 All Gmail Submissions</h3>
                    ${allGmail.map(g => `<div style="font-size:12px;margin:5px 0">${g.username}: ${g.email_created} (${g.task_code}) - ${g.status}</div>`).join('') || 'No Gmails yet.'}
                </div>
                <div id="admin-payments" class="dashboard-section">
                    <h3>💳 Payment Proofs</h3>
                    ${allProofs.map(p => `<div><img src="/proof-image/${p.id}" style="max-width:300px"><p>${p.timestamp}</p><a href="/delete-payment-proof?id=${p.id}">Delete</a></div>`).join('') || '<p>No proofs.</p>'}
                </div>
                <div id="gmail-settings" class="dashboard-section">
                    <h3>⚙️ Gmail Settings</h3>
                    <form action="/update-gmail-settings" method="POST">
                        <label>Price LK USD:</label><input type="number" step="0.01" name="gmail_price_lk" value="${await getSetting('gmail_task_price_lk')||'0.25'}">
                        <label>Price INTL USD:</label><input type="number" step="0.01" name="gmail_price_intl" value="${await getSetting('gmail_task_price_intl')||'0.25'}">
                        <label>Instructions EN:</label><textarea name="instructions_en">${await getSetting('gmail_task_instructions_en')||''}</textarea>
                        <label>Instructions SI:</label><textarea name="instructions_si">${await getSetting('gmail_task_instructions_si')||''}</textarea>
                        <label>Instructions TA:</label><textarea name="instructions_ta">${await getSetting('gmail_task_instructions_ta')||''}</textarea>
                        <button>Update</button>
                    </form>
                </div>
                <div id="referral-settings" class="dashboard-section">
                    <h3>💰 Referral Commissions (LKR)</h3>
                    <form action="/update-referral-settings" method="POST">
                        <label>Tier1 (1-3):</label><input name="tier1" value="${await getSetting('referral_commission_tier1')||'4'}">
                        <label>Tier2 (4):</label><input name="tier2" value="${await getSetting('referral_commission_tier2')||'5'}">
                        <label>Tier3 (5-8):</label><input name="tier3" value="${await getSetting('referral_commission_tier3')||'6'}">
                        <label>Tier4 (9-15):</label><input name="tier4" value="${await getSetting('referral_commission_tier4')||'7'}">
                        <label>Tier5 (16-25):</label><input name="tier5" value="${await getSetting('referral_commission_tier5')||'10'}">
                        <label>Tier6 (25+):</label><input name="tier6" value="${await getSetting('referral_commission_tier6')||'15'}">
                        <button>Update</button>
                    </form>
                </div>
            `));
        } else {
            // Worker dashboard
            const user = await sql`SELECT * FROM users WHERE username = ${username}`;
            if (!user.length) return res.redirect('/logout');
            const u = user[0];
            // Ensure user has a code; generate if missing
            if (!u.referral_code) {
                await generateUserCode(username, u.referred_by);
                const updated = await sql`SELECT referral_code FROM users WHERE username = ${username}`;
                u.referral_code = updated[0].referral_code;
            }
            const cpas = await sql`SELECT * FROM cpa_configs WHERE is_active=1`;
            const logs = await sql`SELECT * FROM task_logs WHERE username = ${username} ORDER BY id DESC`;
            const gmailLogs = await sql`SELECT * FROM gmail_tasks WHERE username = ${username} ORDER BY id DESC`;
            const notifs = await sql`SELECT * FROM notifications WHERE target_user = ${username} OR target_user = 'all' ORDER BY id DESC LIMIT 20`;
            const unread = await sql`SELECT COUNT(*) as c FROM notifications WHERE (target_user = ${username} OR target_user = 'all') AND is_read=0`;
            const bal = parseFloat(u.balance_numeric||0);
            const country = u.country || 'LK';
            const gPrice = parseFloat(await getSetting(country === 'LK' ? 'gmail_task_price_lk' : 'gmail_task_price_intl') || '0.25');
            const instr = country === 'LK' ? (await getSetting('gmail_task_instructions_si') || '') : (await getSetting('gmail_task_instructions_en') || '');

            const gmailHistoryHtml = gmailLogs.length === 0 ? '<p>No Gmail tasks yet.</p>' : gmailLogs.map(g => {
                const delBtn = g.status === 'Pending' ? `<a href="/delete-gmail-task?id=${g.id}" onclick="return confirm('Delete this task?')" style="color:#ff4d4d;font-size:12px">${t.deleteTask}</a>` : '';
                return `<div class="user-row" style="border-left-color: ${g.status==='Success'||g.status==='PaymentReady'?'#45a29e':g.status==='Pending'?'#f0ad4e':'#ff4d4d'}">
                    📧 ${g.email_created} | 🔑 ${g.password_created} | Code: ${g.task_code}<br>
                    Status: ${g.status} | Amount: $${parseFloat(g.amount).toFixed(2)} | ${g.timestamp}
                    ${g.buyer_reason ? `<br>Reason: ${g.buyer_reason}` : ''}
                    ${delBtn}
                </div>`;
            }).join('');

            res.send(htmlWrapper(req, 'Worker Dashboard', `
                <h3>${t.welcome}, ${username}</h3>
                <div class="stats-grid"><div class="stat-card"><h3>$${bal.toFixed(2)}</h3><p>${t.total}</p></div></div>
                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('worker-tasks')">🎯 Tasks</button>
                    <button class="nav-tab" onclick="switchSection('worker-gmail')">📧 Gmail</button>
                    <button class="nav-tab" onclick="switchSection('worker-gmail-history')">📋 Gmail History</button>
                    <button class="nav-tab" onclick="switchSection('worker-referrals')">🔗 Refs</button>
                    <button class="nav-tab" onclick="switchSection('worker-notifs')">🔔 Alerts ${unread[0].c>0 ? `<span class="notif-badge">${unread[0].c}</span>` : ''}</button>
                    <button class="nav-tab" onclick="switchSection('worker-logs')">📊 Logs</button>
                </div>
                <div id="worker-tasks" class="dashboard-section active">
                    ${cpas.map(c => {
                        const embed = c.embed_code.trim();
                        return `<div class="user-row"><strong>${c.network_name}</strong><br>${(lang==='si'?c.instructions_si:lang==='ta'?c.instructions_ta:c.instructions_en)}<br>
                        <a href="${embed}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#45a29e;color:#0b0c10;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold;">🚀 Start Task</a>
                        </div>`;
                    }).join('')}
                    <h4>Submit Proof</h4>
                    <form action="/submit-task-proof" method="POST">
                        <input name="task_name" placeholder="Task name"><input name="proof_data" placeholder="Proof"><button>Submit</button>
                    </form>
                </div>
                <div id="worker-gmail" class="dashboard-section">
                    <h3>${t.gmailTask}</h3>
                    <p>${instr}</p><p><strong>${t.gmailPrice}:</strong> $${gPrice.toFixed(2)}</p>
                    <p><strong>${t.yourCode}:</strong> ${u.referral_code || 'N/A'}</p>
                    <form action="/submit-gmail-task" method="POST">
                        <input type="email" name="email_created" placeholder="${t.emailCreated}" required>
                        <input name="password_created" placeholder="${t.emailPass}" required>
                        <button>${t.submitGmail}</button>
                    </form>
                    <button onclick="document.getElementById('refSec').style.display='block';this.style.display='none'" style="background:#f39c12;color:#fff">${t.getRefLink}</button>
                    <div id="refSec" style="display:none">
                        <input id="refLinkInput" value="https://${req.get('host')}/register?ref=${u.referral_code}" readonly>
                        <button onclick="copyRefLink()">${t.copyRef}</button>
                    </div>
                </div>
                <div id="worker-gmail-history" class="dashboard-section">${gmailHistoryHtml}</div>
                <div id="worker-referrals" class="dashboard-section">
                    ${(await sql`SELECT * FROM users WHERE referred_by = ${username}`).map(r => `<div class="user-row">👤 ${r.username} (${r.referral_code||'N/A'})</div>`).join('') || '<p>No referrals yet.</p>'}
                </div>
                <div id="worker-notifs" class="dashboard-section">
                    ${notifs.map(n => `<div class="user-row">${n.message} <small>${n.timestamp}</small> ${n.is_read? '':'<a href="/mark-notif-read?id='+n.id+'">Read</a>'}</div>`).join('')}
                </div>
                <div id="worker-logs" class="dashboard-section">
                    ${logs.map(l => `<div class="user-row">${l.task_name} - ${l.status} $${l.amount}</div>`).join('') || '<p>No logs</p>'}
                </div>
            `));
        }
    } catch (e) {
        console.error(e);
        res.status(500).send("Dashboard error");
    }
});

// Gmail Task submission
app.post('/submit-gmail-task', async (req, res) => {
    if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    const { email_created, password_created } = req.body;
    try {
        const user = await sql`SELECT country, referral_code, referred_by FROM users WHERE username = ${req.session.user}`;
        if (!user.length) return res.redirect('/logout');
        const u = user[0];
        let code = u.referral_code;
        if (!code) {
            code = await generateUserCode(req.session.user, u.referred_by);
        }
        const country = u.country || 'LK';
        const price = parseFloat(await getSetting(country === 'LK' ? 'gmail_task_price_lk' : 'gmail_task_price_intl') || '0.25');
        await sql`INSERT INTO gmail_tasks (username, email_created, password_created, task_code, amount, timestamp) VALUES (${req.session.user}, ${email_created}, ${password_created}, ${code}, ${price}, ${new Date().toLocaleString()})`;
        await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${req.session.user}, ${'📧 Gmail submitted: '+email_created}, ${new Date().toLocaleString()})`;
        res.send("<script>alert('Gmail submitted!'); location.href='/dashboard?tab=worker-gmail-history'</script>");
    } catch (e) { console.error(e); res.redirect('/dashboard'); }
});

// Delete Gmail task (by worker, only if pending)
app.get('/delete-gmail-task', async (req, res) => {
    if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    const id = parseInt(req.query.id);
    try {
        const task = await sql`SELECT * FROM gmail_tasks WHERE id = ${id} AND username = ${req.session.user} AND status = 'Pending'`;
        if (task.length) {
            await sql`DELETE FROM gmail_tasks WHERE id = ${id}`;
        }
        res.redirect('/dashboard?tab=worker-gmail-history');
    } catch (e) { res.redirect('/dashboard'); }
});

// Country update
app.post('/update-country', async (req, res) => {
    if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    await sql`UPDATE users SET country = ${req.body.country} WHERE username = ${req.session.user}`;
    res.redirect('/dashboard');
});

// Admin: Update Gmail settings
app.post('/update-gmail-settings', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { gmail_price_lk, gmail_price_intl, instructions_en, instructions_si, instructions_ta } = req.body;
    await sql`UPDATE system_settings SET value = ${gmail_price_lk} WHERE key = 'gmail_task_price_lk'`;
    await sql`UPDATE system_settings SET value = ${gmail_price_intl} WHERE key = 'gmail_task_price_intl'`;
    await sql`UPDATE system_settings SET value = ${instructions_en} WHERE key = 'gmail_task_instructions_en'`;
    await sql`UPDATE system_settings SET value = ${instructions_si} WHERE key = 'gmail_task_instructions_si'`;
    await sql`UPDATE system_settings SET value = ${instructions_ta} WHERE key = 'gmail_task_instructions_ta'`;
    res.send("<script>alert('Updated!'); location.href='/dashboard?tab=gmail-settings'</script>");
});

// Admin: Update Referral settings
app.post('/update-referral-settings', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    for (let i=1; i<=6; i++) await sql`UPDATE system_settings SET value = ${req.body['tier'+i]} WHERE key = ${'referral_commission_tier'+i}`;
    res.send("<script>alert('Updated!'); location.href='/dashboard?tab=referral-settings'</script>");
});

// Submit proof for other tasks
app.post('/submit-task-proof', async (req, res) => {
    if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    try {
        await sql`INSERT INTO task_logs (username, task_name, proof_data, amount, status, timestamp) VALUES (${req.session.user}, ${req.body.task_name}, ${req.body.proof_data}, 0.50, 'Pending', ${new Date().toLocaleString()})`;
        res.send("<script>alert('Proof submitted!'); location.href='/dashboard'</script>");
    } catch (e) { res.redirect('/dashboard'); }
});

app.get('/mark-notif-read', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    await sql`UPDATE notifications SET is_read=1 WHERE id = ${req.query.id} AND (target_user = ${req.session.user} OR target_user = 'all')`;
    res.redirect('/dashboard');
});

app.get('/approve-task', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const log = await sql`SELECT * FROM task_logs WHERE id = ${req.query.id} AND status='Pending'`;
    if (log.length) {
        await sql`UPDATE task_logs SET status='Success' WHERE id = ${req.query.id}`;
        await sql`UPDATE users SET balance_numeric = balance_numeric + ${log[0].amount} WHERE username = ${log[0].username}`;
    }
    res.redirect('/dashboard?tab=task-reviews');
});

app.get('/reject-task', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    await sql`UPDATE task_logs SET status='Failed' WHERE id = ${req.query.id} AND status='Pending'`;
    res.redirect('/dashboard?tab=task-reviews');
});

app.post('/send-notification', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${req.body.target_user}, ${req.body.message}, ${new Date().toLocaleString()})`;
    res.send("<script>alert('Sent!'); location.href='/dashboard'</script>");
});

app.get('/remove-user', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const usr = await sql`SELECT username FROM users WHERE id = ${req.query.id}`;
    if (usr.length) {
        await sql`DELETE FROM task_logs WHERE username = ${usr[0].username}`;
        await sql`DELETE FROM gmail_tasks WHERE username = ${usr[0].username}`;
        await sql`DELETE FROM notifications WHERE target_user = ${usr[0].username}`;
        await sql`DELETE FROM users WHERE id = ${req.query.id}`;
    }
    res.redirect('/dashboard?tab=user-metrics');
});

app.post('/add-cpa', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { network_name, embed_code, instructions_en, instructions_si, instructions_ta } = req.body;
    await sql`INSERT INTO cpa_configs (network_name, embed_code, instructions_en, instructions_si, instructions_ta, is_active) VALUES (${network_name}, ${embed_code}, ${instructions_en}, ${instructions_si}, ${instructions_ta}, 1)`;
    res.redirect('/dashboard');
});

app.get('/remove-cpa', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    await sql`DELETE FROM cpa_configs WHERE id = ${req.query.id}`;
    res.redirect('/dashboard?tab=admin-tasks');
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Galaxy running on port ${PORT}`));
}
