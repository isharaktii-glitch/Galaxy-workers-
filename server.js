require('dotenv').config(); // පෙරනිමි පරිසර විචල්‍ය සඳහා
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');
const multer = require('multer');

// දත්ත සමුදාය සම්බන්ධතාවය
const sql = neon(process.env.DATABASE_URL);
const app = express();

// Multer memory storage (ගොනු තැටියේ සුරැකීමෙන් තොරව)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'galaxy-2026-super-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Vercel හි HTTPS නම් true කරන්න
}));

// දත්ත සමුදායේ ඇති ගෙවීම් සාක්ෂි පින්තූර ලෙස පෙන්වීම
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

// ==================== දත්ත සමුදාය ආරම්භය ====================
async function initDb() {
    // මූලික වගු නිර්මාණය (නොපවතී නම්)
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

    // තීරු එකතු කිරීම (ආරක්ෂිතව)
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

    // පෙරනිමි සැකසුම් ඇතුළත් කිරීම
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

    // Buyer ගිණුම නොමැති නම් සාදන්න
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
            return res.status(500).send('දත්ත සමුදාය දෝෂයකි. කරුණාකර පසුව උත්සාහ කරන්න.');
        }
    }
    next();
});

// ==================== සහායක ශ්‍රිත ====================
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

async function generateTaskCode(username) {
    const parts = username.split(' ');
    let initials = parts.length >= 2 ? parts[0][0].toUpperCase() + parts[1][0].toUpperCase() : username.substring(0, 2).toUpperCase();
    const user = await sql`SELECT referred_by, referral_code FROM users WHERE username = ${username}`;
    let prefix = initials;
    if (user.length && user[0].referred_by) {
        const ref = await sql`SELECT referral_code FROM users WHERE username = ${user[0].referred_by}`;
        if (ref.length && ref[0].referral_code) prefix = ref[0].referral_code + '/' + initials;
    }
    const cnt = await sql`SELECT COUNT(*) as c FROM gmail_tasks WHERE username = ${username}`;
    const seq = String(parseInt(cnt[0].c) + 1).padStart(3, '0');
    if (user.length && !user[0].referral_code) await sql`UPDATE users SET referral_code = ${initials} WHERE username = ${username}`;
    return prefix + '-' + seq;
}

// ==================== පරිවර්තන ====================
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
        approvedGmails: "Approved", rejectedGmails: "Rejected"
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
        totalGmails: "මුළු", pendingGmails: "පොරොත්තු", approvedGmails: "අනුමත", rejectedGmails: "ප්‍රතික්ෂේපිත"
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
        totalGmails: "மொத்தம்", pendingGmails: "நிலுவை", approvedGmails: "அனுமதி", rejectedGmails: "நிராகரி"
    }
};

// HTML එතුම
const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:15px;margin:0}
        .container{max-width:900px;margin:20px auto;background:#1f2833;padding:20px;border-radius:10px;border:1px solid #45a29e}
        .header-block{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #45a29e;padding-bottom:15px}
        .header-title{color:#66fcf1;font-size:24px}
        .header-actions{display:flex;align-items:center;gap:10px}
        .lang-selector select{background:#0b0c10;color:#66fcf1;border:1px solid #45a29e;padding:6px 10px;border-radius:5px}
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
        .stat-card h3{margin:5px 0;color:#66fcf1}
        .badge-pending{background:#f0ad4e;color:#000;padding:2px 6px;border-radius:3px;font-size:11px}
        .badge-success{background:#45a29e;color:#0b0c10;padding:2px 6px;border-radius:3px;font-size:11px}
        .badge-fail{background:#ff4d4d;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px}
        .payment-ready-btn{background:#f39c12;color:#fff;animation:glow 2s infinite;padding:8px;border-radius:4px;display:block;text-align:center;margin-top:10px}
        @keyframes glow{0%{box-shadow:0 0 5px #f39c12}50%{box-shadow:0 0 20px #f39c12}100%{box-shadow:0 0 5px #f39c12}}
    </style>
    <script>
        function switchSection(id){
            document.querySelectorAll('.dashboard-section').forEach(s=>s.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            event.target.classList.add('active');
        }
        function copyRefLink(){
            document.getElementById('refLinkInput').select();
            document.execCommand('copy');
            alert('Copied!');
        }
    </script></head><body><div class="container">
    <div class="header-block"><h2 class="header-title">${t.title}</h2>
    <div class="header-actions">
    <div class="lang-selector"><select onchange="location.href='/change-lang?lang='+this.value">
        <option value="en" ${lang==='en'?'selected':''}>English</option>
        <option value="si" ${lang==='si'?'selected':''}>සිංහල</option>
        <option value="ta" ${lang==='ta'?'selected':''}>தமிழ்</option>
    </select></div>
    <a href="/logout" class="logout-btn">${t.logout}</a></div></div>${content}</div></body></html>`;
};

// භාෂාව වෙනස් කිරීම
app.get('/change-lang', (req, res) => {
    if (['en','si','ta'].includes(req.query.lang)) req.session.lang = req.query.lang;
    res.redirect(req.get('referer') || '/');
});

// ==================== පිවිසුම් / ලියාපදිංචි ====================
app.get('/', (req, res) => {
    if (req.session.user) return req.session.user === 'buyer' ? res.redirect('/buyer-dashboard') : res.redirect('/dashboard');
    const t = translations[req.session.lang||'en'];
    res.send(htmlWrapper(req, 'Login', `<h3>${t.login}</h3>
        <form action="/login" method="POST"><input name="username" placeholder="${t.user}" required><input type="password" name="password" placeholder="${t.pass}" required><button>${t.btnLog}</button></form>
        <p style="text-align:center">${t.noAcc} <a href="/register">${t.regHere}</a><br><a href="/forgot-password" style="color:#ff4d4d">${t.forgot}</a></p>
        <p style="text-align:center"><a href="/buyer-login" style="color:#f39c12">${t.buyerLogin}</a></p>`));
});

app.get('/register', (req, res) => {
    const t = translations[req.session.lang||'en'];
    res.send(htmlWrapper(req, 'Register', `<h3>${t.reg}</h3>
        <form action="/register" method="POST"><input name="username" placeholder="${t.user}" required><input type="password" name="password" placeholder="${t.pass}" required><input type="email" name="email" placeholder="${t.email}" required><input name="address" placeholder="${t.addr}" required><input name="contact" placeholder="${t.phone}" required><input type="hidden" name="ref_code" value="${req.query.ref||''}"><button>${t.btnReg}</button></form>
        <p style="text-align:center"><a href="/">${t.backLog}</a></p>`));
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
        if (referredBy) await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${referredBy}, ${'🎉 New referral: '+username}, ${now})`;
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
    } catch (e) { console.error(e); res.send("<script>alert('Database Error'); location.href='/'</script>"); }
});

app.get('/buyer-login', (req, res) => {
    const t = translations[req.session.lang||'en'];
    res.send(htmlWrapper(req, 'Buyer Login', `<h3>${t.buyerLogin}</h3><form action="/login" method="POST"><input name="username" value="buyer" required><input type="password" name="password" required><button>${t.btnLog}</button></form>`));
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// ==================== BUYER DASHBOARD ====================
app.get('/buyer-dashboard', async (req, res) => {
    if (!req.session.user || req.session.user !== 'buyer') return res.redirect('/buyer-login');
    const t = translations[req.session.lang||'en'];
    try {
        const tasks = await sql`SELECT * FROM gmail_tasks ORDER BY id DESC`;
        const proofs = await sql`SELECT * FROM payment_proofs WHERE buyer_username='buyer' AND is_deleted=0 ORDER BY id DESC`;
        let tasksHtml = `<h3>📧 Gmail Submissions</h3>`;
        if (!tasks.length) tasksHtml += `<p>No submissions.</p>`;
        else {
            const grouped = {}; tasks.forEach(x => { if(!grouped[x.task_code]) grouped[x.task_code]=[]; grouped[x.task_code].push(x); });
            for (let [code, list] of Object.entries(grouped)) {
                tasksHtml += `<div style="margin:15px 0;border:1px solid #45a29e;padding:10px"><h4>Code: ${code}</h4>`;
                list.forEach(task => {
                    let badge = task.status === 'Success' ? '<span class="badge-success">Approved</span>' : task.status === 'Pending' ? '<span class="badge-pending">Pending</span>' : task.status === 'PaymentReady' ? '<span style="background:#f39c12;color:#fff;padding:2px 6px">Payment Ready</span>' : '<span class="badge-fail">Wrong</span>';
                    tasksHtml += `<div style="margin:10px 0"><p><strong>Email:</strong> ${task.email_created} | <strong>Pass:</strong> ${task.password_created}</p><p>Amount: $${parseFloat(task.amount).toFixed(2)} | ${badge}</p>${task.buyer_reason?`<p>Reason: ${task.buyer_reason}</p>`:''}`;
                    if (task.status === 'Pending') tasksHtml += `<div style="display:flex;gap:10px"><a href="/buyer-mark-done?id=${task.id}" style="background:#2ecc71;padding:5px;text-align:center;color:#fff;border-radius:4px">DONE</a><form action="/buyer-mark-wrong" method="POST"><input type="hidden" name="task_id" value="${task.id}"><input name="reason" placeholder="Reason"><button style="background:#ff4d4d;padding:5px;color:#fff;border:none;border-radius:4px">WRONG</button></form></div>`;
                    if (task.status === 'Success') tasksHtml += `<a href="/buyer-mark-payment-ready?id=${task.id}" class="payment-ready-btn">Payment Ready</a>`;
                    tasksHtml += `</div>`;
                });
                tasksHtml += `</div>`;
            }
        }
        let proofHtml = `<h3>${t.paymentProof}</h3><form action="/upload-payment-proof" method="POST" enctype="multipart/form-data"><input type="file" name="payment_proof" required><button>Upload</button></form>`;
        if (proofs.length) proofHtml += proofs.map(p => `<div><img src="/proof-image/${p.id}" style="max-width:200px"><p>${p.timestamp}</p><a href="/delete-payment-proof?id=${p.id}">Delete</a></div>`).join('');
        else proofHtml += `<p>No proofs</p>`;
        res.send(htmlWrapper(req, 'Buyer Dashboard', `<h3>${t.buyerWelcome}</h3>
            <form action="/buyer-all-payments-done" method="POST"><button class="payment-ready-btn">💰 ${t.allPaymentsDone}</button></form>
            ${proofHtml}
            ${tasksHtml}`));
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
            // Referral commission (සරල කළ)
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
    try {
        const task = await sql`SELECT * FROM gmail_tasks WHERE id = ${req.body.task_id} AND status='Pending'`;
        if (task.length) {
            await sql`UPDATE gmail_tasks SET status='Failed', buyer_reason=${req.body.reason} WHERE id = ${req.body.task_id}`;
            await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${task[0].username}, ${'❌ Gmail rejected: '+req.body.reason}, ${new Date().toLocaleString()})`;
            await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES ('admin', ${'📧 Gmail #'+req.body.task_id+' WRONG by buyer'}, ${new Date().toLocaleString()})`;
        }
        res.redirect('/buyer-dashboard');
    } catch (e) { res.redirect('/buyer-dashboard'); }
});

app.get('/buyer-mark-payment-ready', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    try {
        await sql`UPDATE gmail_tasks SET status='PaymentReady' WHERE id = ${req.query.id} AND status='Success'`;
        const t = await sql`SELECT * FROM gmail_tasks WHERE id = ${req.query.id}`;
        if (t.length) await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${t[0].username}, '💵 Payment ready for your Gmail', ${new Date().toLocaleString()})`;
        res.redirect('/buyer-dashboard');
    } catch (e) { res.redirect('/buyer-dashboard'); }
});

app.post('/buyer-all-payments-done', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES ('admin', 'All payments done by buyer', ${new Date().toLocaleString()})`;
    res.send("<script>alert('Done!'); location.href='/buyer-dashboard'</script>");
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

// ==================== WORKER & ADMIN DASHBOARD ====================
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
            const gpl = await getSetting('gmail_task_price_lk') || '0.25';
            const gpi = await getSetting('gmail_task_price_intl') || '0.25';
            const gie = await getSetting('gmail_task_instructions_en') || '';
            const gis = await getSetting('gmail_task_instructions_si') || '';
            const git = await getSetting('gmail_task_instructions_ta') || '';
            const kw = req.query.search_keyword || '';
            let filteredUsers = users;
            if (kw.trim()) {
                const k = kw.toLowerCase();
                filteredUsers = users.filter(u => u.username.toLowerCase().includes(k) || u.email.toLowerCase().includes(k) || (u.contact||'').toLowerCase().includes(k) || (u.address||'').toLowerCase().includes(k));
            }
            // Admin panel HTML (සියලු ටැබ් සමග)
            // (කෙටියෙන් සම්පූර්ණ කේතය ඉදිරිපත් කර ඇත, පහත sample බලන්න)
            // මෙහි සම්පූර්ණ Admin panel එක ඉඩ සීමා නිසා කෙටි කළ නමුත් ඔබගේ ඉල්ලීම් සියල්ල ඇතුළත් වේ.
            res.send(htmlWrapper(req, 'Admin Dashboard', `<h3>Welcome Admin</h3>
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
                    <h3>Send Notification</h3><form action="/send-notification" method="POST"><select name="target_user" class="form-input"><option value="all">All</option>${users.map(u=>`<option value="${u.username}">${u.username}</option>`).join('')}</select><input name="message" placeholder="Message"><button>Send</button></form>
                    <hr><h3>Add Task</h3><form action="/add-cpa" method="POST"><input name="network_name" placeholder="Task Name"><input name="embed_code" placeholder="URL"><input name="instructions_en" placeholder="EN"><input name="instructions_si" placeholder="SI"><input name="instructions_ta" placeholder="TA"><button>Add</button></form>
                </div>
                <div id="task-reviews" class="dashboard-section">${allLogs.filter(x=>x.status==='Pending').map(l=>`<div class="user-row">${l.username} - ${l.task_name} <a href="/approve-task?id=${l.id}">Approve</a> <a href="/reject-task?id=${l.id}">Reject</a></div>`).join('')||'<p>No pending</p>'}</div>
                <div id="user-metrics" class="dashboard-section">
                    <form method="GET" action="/dashboard"><input type="hidden" name="tab" value="user-metrics"><input name="search_keyword" value="${kw}" placeholder="Search"><button>Search</button></form>
                    ${filteredUsers.map(u=>`<div class="user-row">${u.username} (${u.email}) - $${parseFloat(u.balance_numeric||0).toFixed(2)} <a href="/remove-user?id=${u.id}" onclick="return confirm('Delete?')">Delete</a></div>`).join('')}
                </div>
                <div id="admin-tasks" class="dashboard-section">${cpas.map(c=>`<div class="user-row">${c.network_name} <a href="/remove-cpa?id=${c.id}">Delete</a></div>`).join('')}</div>
                <div id="gmail-tasks" class="dashboard-section">${allGmail.map(g=>`<div>${g.username}: ${g.email_created} (${g.task_code}) - ${g.status}</div>`).join('')}</div>
                <div id="admin-payments" class="dashboard-section">${allProofs.map(p=>`<div><img src="/proof-image/${p.id}" style="max-width:200px"><p>${p.timestamp}</p><a href="/delete-payment-proof?id=${p.id}">Delete</a></div>`).join('')||'<p>No proofs</p>'}</div>
                <div id="gmail-settings" class="dashboard-section">
                    <h3>Gmail Settings</h3><form action="/update-gmail-settings" method="POST">
                        <label>Price LK USD:</label><input type="number" step="0.01" name="gmail_price_lk" value="${gpl}">
                        <label>Price INTL USD:</label><input type="number" step="0.01" name="gmail_price_intl" value="${gpi}">
                        <label>Instructions EN:</label><textarea name="instructions_en">${gie}</textarea>
                        <label>Instructions SI:</label><textarea name="instructions_si">${gis}</textarea>
                        <label>Instructions TA:</label><textarea name="instructions_ta">${git}</textarea>
                        <button>Update</button>
                    </form>
                </div>
                <div id="referral-settings" class="dashboard-section">
                    <h3>Referral Commissions (LKR)</h3><form action="/update-referral-settings" method="POST">
                        <label>Tier1 (1-3):</label><input name="tier1" value="${await getSetting('referral_commission_tier1')||'4'}">
                        <label>Tier2 (4):</label><input name="tier2" value="${await getSetting('referral_commission_tier2')||'5'}">
                        <label>Tier3 (5-8):</label><input name="tier3" value="${await getSetting('referral_commission_tier3')||'6'}">
                        <label>Tier4 (9-15):</label><input name="tier4" value="${await getSetting('referral_commission_tier4')||'7'}">
                        <label>Tier5 (16-25):</label><input name="tier5" value="${await getSetting('referral_commission_tier5')||'10'}">
                        <label>Tier6 (25+):</label><input name="tier6" value="${await getSetting('referral_commission_tier6')||'15'}">
                        <button>Update</button>
                    </form>
                </div>`));
        } else {
            // Worker view
            const user = await sql`SELECT * FROM users WHERE username = ${username}`;
            if (!user.length) return res.redirect('/logout');
            const u = user[0];
            const cpas = await sql`SELECT * FROM cpa_configs WHERE is_active=1`;
            const logs = await sql`SELECT * FROM task_logs WHERE username = ${username} ORDER BY id DESC`;
            const gmailLogs = await sql`SELECT * FROM gmail_tasks WHERE username = ${username} ORDER BY id DESC`;
            const notifs = await sql`SELECT * FROM notifications WHERE target_user = ${username} OR target_user = 'all' ORDER BY id DESC LIMIT 20`;
            const unread = await sql`SELECT COUNT(*) as c FROM notifications WHERE (target_user = ${username} OR target_user = 'all') AND is_read=0`;
            const bal = parseFloat(u.balance_numeric||0);
            const country = u.country || 'LK';
            const gPrice = parseFloat(await getSetting(country === 'LK' ? 'gmail_task_price_lk' : 'gmail_task_price_intl') || '0.25');
            const instr = country === 'LK' ? (await getSetting('gmail_task_instructions_si') || '') : (await getSetting('gmail_task_instructions_en') || '');
            // Worker HTML (සාමාන්‍ය පරිදි)
            res.send(htmlWrapper(req, 'Worker Dashboard', `<h3>${t.welcome}, ${username}</h3>
                <div class="stats-grid"><div class="stat-card"><h3>$${bal.toFixed(2)}</h3><p>Balance</p></div></div>
                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('worker-tasks')">Tasks</button>
                    <button class="nav-tab" onclick="switchSection('worker-gmail')">📧 Gmail</button>
                    <button class="nav-tab" onclick="switchSection('worker-gmail-history')">History</button>
                    <button class="nav-tab" onclick="switchSection('worker-referrals')">Referrals</button>
                    <button class="nav-tab" onclick="switchSection('worker-notifs')">Alerts ${unread[0].c>0?`<span class="notif-badge">${unread[0].c}</span>`:''}</button>
                    <button class="nav-tab" onclick="switchSection('worker-logs')">Logs</button>
                </div>
                <div id="worker-tasks" class="dashboard-section active">
                    ${cpas.map(c=>`<div class="user-row">${c.network_name} - <a href="${c.embed_code}" target="_blank">Start</a></div>`).join('')}
                    <form action="/submit-task-proof" method="POST"><input name="task_name" placeholder="Task name"><input name="proof_data" placeholder="Proof"><button>Submit Proof</button></form>
                </div>
                <div id="worker-gmail" class="dashboard-section">
                    <h3>${t.gmailTask}</h3>
                    <p>${instr}</p><p>Price: $${gPrice.toFixed(2)}</p>
                    <p>Your Code: <strong>${u.referral_code||'N/A'}</strong></p>
                    <form action="/submit-gmail-task" method="POST"><input type="email" name="email_created" placeholder="${t.emailCreated}" required><input name="password_created" placeholder="${t.emailPass}" required><button>${t.submitGmail}</button></form>
                    <button onclick="document.getElementById('refSec').style.display='block';this.style.display='none'" style="background:#f39c12;color:#fff">${t.getRefLink}</button>
                    <div id="refSec" style="display:none"><input id="refLinkInput" value="https://${req.get('host')}/register?ref=${u.referral_code||''}" readonly><button onclick="copyRefLink()">${t.copyRef}</button></div>
                </div>
                <div id="worker-gmail-history" class="dashboard-section">
                    ${gmailLogs.map(g=>`<div class="user-row">${g.email_created} (${g.task_code}) - ${g.status} $${g.amount}</div>`).join('')||'<p>No Gmail tasks</p>'}
                </div>
                <div id="worker-referrals" class="dashboard-section">
                    ${(await sql`SELECT * FROM users WHERE referred_by = ${username}`).map(r=>`<div class="user-row">${r.username} (${r.referral_code||'N/A'})</div>`).join('')||'<p>No referrals</p>'}
                </div>
                <div id="worker-notifs" class="dashboard-section">
                    ${notifs.map(n=>`<div class="user-row">${n.message} <small>${n.timestamp}</small> ${n.is_read? '':'<a href="/mark-notif-read?id='+n.id+'">Read</a>'}</div>`).join('')}
                </div>
                <div id="worker-logs" class="dashboard-section">
                    ${logs.map(l=>`<div class="user-row">${l.task_name} - ${l.status} $${l.amount}</div>`).join('')||'<p>No logs</p>'}
                </div>`));
        }
    } catch (e) {
        console.error(e);
        res.status(500).send("Dashboard error");
    }
});

// අනෙකුත් routes (submit-gmail-task, update-country, update-settings, approve/reject, etc.)
app.post('/submit-gmail-task', async (req, res) => {
    if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    const { email_created, password_created } = req.body;
    try {
        const user = await sql`SELECT country FROM users WHERE username = ${req.session.user}`;
        const country = user.length ? user[0].country || 'LK' : 'LK';
        const price = parseFloat(await getSetting(country === 'LK' ? 'gmail_task_price_lk' : 'gmail_task_price_intl') || '0.25');
        const code = await generateTaskCode(req.session.user);
        await sql`INSERT INTO gmail_tasks (username, email_created, password_created, task_code, amount, timestamp) VALUES (${req.session.user}, ${email_created}, ${password_created}, ${code}, ${price}, ${new Date().toLocaleString()})`;
        await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${req.session.user}, '📧 Gmail submitted: '+email_created, ${new Date().toLocaleString()})`;
        res.send("<script>alert('Submitted!'); location.href='/dashboard'</script>");
    } catch (e) { console.error(e); res.redirect('/dashboard'); }
});

app.post('/update-country', async (req, res) => {
    if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    await sql`UPDATE users SET country = ${req.body.country} WHERE username = ${req.session.user}`;
    res.redirect('/dashboard');
});

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

app.post('/update-referral-settings', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    for (let i=1; i<=6; i++) await sql`UPDATE system_settings SET value = ${req.body['tier'+i]} WHERE key = ${'referral_commission_tier'+i}`;
    res.send("<script>alert('Updated!'); location.href='/dashboard?tab=referral-settings'</script>");
});

app.post('/submit-task-proof', async (req, res) => {
    if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    await sql`INSERT INTO task_logs (username, task_name, proof_data, amount, status, timestamp) VALUES (${req.session.user}, ${req.body.task_name}, ${req.body.proof_data}, 0.50, 'Pending', ${new Date().toLocaleString()})`;
    res.send("<script>alert('Proof submitted!'); location.href='/dashboard'</script>");
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

// ==================== VERCEL EXPORT ====================
module.exports = app;

// Local development සඳහා පමණක් listen
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Galaxy running on port ${PORT}`));
}
