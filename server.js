const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

const translations = {
    en: { title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration", user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number", btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here", backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Micro Tasks 👇", subText: "Complete the tasks below. Your earnings will automatically add to your balance.", logout: "Logout", forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER", cpaTitle: "🔗 CPA Networks Integration Settings", taskInstr: "Task Instructions" },
    si: { title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය", user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය", btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න", backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "කිරීමට ඇති සරල වැඩ (Tasks) 👇", subText: "පහත ඇති Tasks සම්පූර්ණ කරන්න. ඔබ උපයන මුදල් ස්වයංක්‍රීයවම ගිණුමට එකතු වේ.", logout: "ඉවත් වන්න (Logout)", forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න", cpaTitle: "🔗 CPA ජාල සහ සබැඳි සැකසුම් (Integration)", taskInstr: "වැඩසටහනේ උපදෙස් (Instructions)" },
    ta: { title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு", user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்", btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்", backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇", subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் வருவாய் தானாகவே உங்கள் கணக்கில் சேர்க்கப்படும்.", logout: "வெளியேறு (Logout)", forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்", cpaTitle: "🔗 CPA நெட்வொர்க் இணைப்பு அமைப்புகள்", taskInstr: "பணி வழிமுறைகள்" }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} .container{max-width:850px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;} .lang-selector { position: absolute; top: 15px; right: 15px; } .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; } input, textarea, select.form-input {width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;} button:hover{background:#66fcf1;} .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;position:relative;} a{color:#66fcf1;text-decoration:none;} .logout-btn{background:#ff4d4d;color:#fff;width:auto;padding:5px 10px;font-size:12px;float:right;border-radius:3px;margin-left:5px;} .remove-btn{background:#ff4d4d;color:white;border:none;padding:5px 10px;font-size:11px;cursor:pointer;border-radius:3px;float:right;margin-top:-20px;} .cpa-box{background:#111a24; padding:15px; border:1px solid #66fcf1; border-radius:5px; margin-top:15px; text-align:left;} .navbar { display: flex; background: #0b0c10; border: 1px solid #45a29e; border-radius: 5px; margin-bottom: 20px; overflow: hidden; } .nav-tab { flex: 1; text-align: center; padding: 12px; color: #c5c6c7; font-weight: bold; cursor: pointer; background: #0b0c10; border: none; transition: 0.3s; } .nav-tab:hover { background: #1f2833; color: #66fcf1; } .nav-tab.active { background: #45a29e; color: #0b0c10; } .dashboard-section { display: none; } .dashboard-section.active { display: block; } .badge-fail { background: #ff4d4d; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; } .badge-success { background: #45a29e; color: #0b0c10; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }</style>
    <script>function switchSection(sectionId) { document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active')); document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active')); document.getElementById(sectionId).classList.add('active'); event.target.classList.add('active'); }</script>
    </head><body><div class="container">
    <div class="lang-selector"><select onchange="window.location.href='/change-lang?lang=' + this.value"><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option><option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option><option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option></select></div>
    <h2 style="text-align:center;color:#66fcf1;margin-top:15px;">${t.title}</h2>${content}</div></body></html>`;
};

app.get('/change-lang', (req, res) => {
    if (['en', 'si', 'ta'].includes(req.query.lang)) req.session.lang = req.query.lang;
    res.redirect(req.get('referer') || '/');
});

app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Login', `<h3>${t.login}</h3><form action="/login" method="POST"><input type="text" name="username" placeholder="${t.user}" required><input type="password" name="password" placeholder="${t.pass}" required><button type="submit">${t.btnLog}</button></form><p style="text-align:center; margin-top:15px;">${t.noAcc} <a href="/register">${t.regHere}</a><br><br><a href="/forgot-password" style="color:#ff4d4d; font-size:14px;">${t.forgot}</a></p>`));
});

app.post('/register', async (req, res) => {
    const { username, password, email, address, contact } = req.body;
    try {
        const check = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
        if (check.rows.length > 0) return res.send("<script>alert('Username already exists!'); window.location.href='/register';</script>");
        await pool.query('INSERT INTO users (username, password, email, address, contact) VALUES ($1, $2, $3, $4, $5)', [username, password, email, address, contact]);
        res.send("<script>alert('Registration Successful!'); window.location.href='/';</script>");
    } catch (e) { res.send("Error"); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) { req.session.user = username; res.redirect('/dashboard'); }
        else res.send("<script>alert('Invalid Credentials'); window.location.href='/';</script>");
    } catch (e) { res.send("Error"); }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

module.exports = app;
