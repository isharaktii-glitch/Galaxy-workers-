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
            embed_code TEXT NOT NULL,
            instructions_en TEXT,
            instructions_si TEXT,
            instructions_ta TEXT,
            is_active INTEGER DEFAULT 1
        )`);

        await sql(`CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT
        )`);

        await sql(`CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            target_user VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            timestamp VARCHAR(50) NOT NULL,
            is_read INTEGER DEFAULT 0
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

// Translation Object
const translations = {
    en: {
        title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration",
        user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number",
        btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here",
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Premium Tasks 👇",
        subText: "Complete tasks below. Submit accurate proof data for fast validation.", logout: "Logout",
        forgot: "Forgot Password?", notifTitle: "🔔 Notifications"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය", pass: "මුරපදය", email: "ඊමේල් ලිපිනය", addr: "ලිපිනය", phone: "දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "ලබාගත හැකි කාර්යයන් 👇",
        subText: "පහත දැක්වෙන කාර්යයන් සම්පූර්ණ කරන්න. නිවැරදි සාක්ෂි ඇතුළත් කරන්න.", logout: "ඉවත් වන්න",
        forgot: "මුරපදය අමතකද?", notifTitle: "🔔 නිවේදන"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர்", pass: "கடவுச்சொல்", email: "மின்னஞ்சல்", addr: "முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "பணிகளை முடிக்கவும். உங்கள் சான்றுகளைச் சமர்ப்பிக்கவும்.", logout: "வெளியேறு",
        forgot: "கடவுச்சொல் மறந்துவிட்டதா?", notifTitle: "🔔 அறிவிப்புகள்"
    }
};

const htmlWrapper = (req, title, content, notifCount = 0) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    const notifBadge = notifCount > 0 ? `<span style="background:#ff4d4d; color:white; padding:2px 6px; border-radius:10px; font-size:12px;">${notifCount}</span>` : '';
    
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:15px;} 
        .container{max-width:800px;margin:auto;background:#1f2833;padding:20px;border-radius:10px;border:1px solid #45a29e;}
        .galaxy-task-card{background:#ffffff;color:#333;padding:20px;border-radius:10px;margin:15px 0;text-align:center;}
        .galaxy-start-btn{display:block;width:100%;padding:15px;background:#2ecc71;color:white;text-decoration:none;font-weight:bold;border-radius:5px;margin-top:10px;}
        .notif-box{background:#0b0c10;padding:10px;margin:5px 0;border-left:4px solid #66fcf1;}
    </style>
    </head><body><div class="container">
        <div style="display:flex; justify-content:space-between;"><h2>${t.title}</h2><a href="/logout" style="color:red;">${t.logout}</a></div>
        <div style="margin-bottom:10px;">Notifications: ${notifBadge}</div>
        ${content}
    </div></body></html>`;
};

// Routes
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = req.session.user;
    
    if (user === 'admin') {
        res.send(htmlWrapper(req, 'Admin', `<h3>Admin Panel</h3><a href="/dashboard">Refresh</a><hr>
        <form action="/send-notification" method="POST">
            <input type="text" name="target_user" placeholder="Username or all" required>
            <input type="text" name="message" placeholder="Message" required>
            <button type="submit">Send</button>
        </form>`));
    } else {
        const notifs = await sql(`SELECT * FROM notifications WHERE (target_user = $1 OR target_user = 'all') AND is_read = 0`, [user]);
        const tasks = await sql(`SELECT * FROM cpa_configs WHERE is_active = 1`);
        
        let taskHtml = tasks.map(t => `
            <div class="galaxy-task-card">
                <h4>${t.network_name}</h4>
                <a href="${t.embed_code}" target="_blank" class="galaxy-start-btn">⚡ START TASK</a>
                <form action="/submit-task-proof" method="POST">
                    <input type="hidden" name="task_name" value="${t.network_name}">
                    <input type="text" name="proof_data" placeholder="Enter Proof" required style="margin-top:10px; width:90%;">
                    <button type="submit" style="display:block; width:100%; margin-top:5px;">Submit</button>
                </form>
            </div>`).join('');

        let notifHtml = notifs.map(n => `<div class="notif-box">${n.message}</div>`).join('');
        
        // Mark as read
        await sql(`UPDATE notifications SET is_read = 1 WHERE target_user = $1`, [user]);

        res.send(htmlWrapper(req, 'Dashboard', `<h3>${taskHtml}</h3><hr><h3>Notifications</h3>${notifHtml}`, notifs.length));
    }
});

app.post('/send-notification', async (req, res) => {
    await sql(`INSERT INTO notifications (target_user, message, timestamp) VALUES ($1, $2, $3)`, 
              [req.body.target_user, req.body.message, new Date().toLocaleString()]);
    res.redirect('/dashboard');
});

app.post('/submit-task-proof', async (req, res) => {
    await sql(`INSERT INTO task_logs (username, task_name, proof_data, status, timestamp) VALUES ($1, $2, $3, 'Pending', $4)`, 
              [req.session.user, req.body.task_name, req.body.proof_data, new Date().toLocaleString()]);
    res.redirect('/dashboard');
});

// Admin Approve/Reject (With automatic notifications)
app.get('/approve-task', async (req, res) => {
    const log = await sql(`SELECT * FROM task_logs WHERE id = $1`, [req.query.id]);
    await sql(`UPDATE task_logs SET status = 'Success' WHERE id = $1`, [req.query.id]);
    await sql(`UPDATE users SET balance_numeric = balance_numeric + 0.50 WHERE username = $1`, [log[0].username]);
    await sql(`INSERT INTO notifications (target_user, message, timestamp) VALUES ($1, $2, $3)`, 
              [log[0].username, `🎉 Your task ${log[0].task_name} approved! $0.50 credited.`, new Date().toLocaleString()]);
    res.redirect('/dashboard');
});

app.listen(3000, () => console.log("Server running"));
