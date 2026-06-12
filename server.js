require('dotenv').config(); // Ensure DATABASE_URL is loaded from .env if running locally
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');
const multer = require('multer');

// Neon Database Connection
const sql = neon(process.env.DATABASE_URL);

const app = express();

// Multer setup - Memory Storage (No disk writing)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// Serve proof images stored in database as base64
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
        console.error(e);
        res.status(500).send('Error');
    }
});

// 🗄️ NEON DATABASE INITIALIZATION WITH SAFE MIGRATIONS
async function initDb() {
    try {
        // Create base tables if not exists
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

        // Safe column migrations using DO blocks
        // Add missing columns to users table
        await sql`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='address') THEN
                    ALTER TABLE users ADD COLUMN address TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='contact') THEN
                    ALTER TABLE users ADD COLUMN contact VARCHAR(20);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='balance_numeric') THEN
                    ALTER TABLE users ADD COLUMN balance_numeric NUMERIC(10,2) DEFAULT 0.0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='earnings_percentage') THEN
                    ALTER TABLE users ADD COLUMN earnings_percentage NUMERIC(5,2) DEFAULT 100.0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='country') THEN
                    ALTER TABLE users ADD COLUMN country VARCHAR(10) DEFAULT 'LK';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='referral_code') THEN
                    ALTER TABLE users ADD COLUMN referral_code VARCHAR(20);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='referred_by') THEN
                    ALTER TABLE users ADD COLUMN referred_by VARCHAR(50);
                END IF;
            END$$;
        `;

        // Add is_read column to notifications if missing
        await sql`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='is_read') THEN
                    ALTER TABLE notifications ADD COLUMN is_read INTEGER DEFAULT 0;
                END IF;
            END$$;
        `;

        // Insert default settings if not exists
        await sql`INSERT INTO system_settings (key, value) VALUES ('global_earnings_percentage', '100') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('google_sheet_config', '') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('gmail_task_price_lk', '0.25') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('gmail_task_price_intl', '0.25') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('gmail_task_instructions_en', 'Create a new Gmail account and submit credentials.') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('gmail_task_instructions_si', 'නව Gmail ගිණුමක් සාදා විස්තර ඇතුළත් කරන්න.') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('gmail_task_instructions_ta', 'புதிய Gmail கணக்கை உருவாக்கி விவரங்களைச் சமர்ப்பிக்கவும்.') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('referral_commission_tier1', '4') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('referral_commission_tier2', '5') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('referral_commission_tier3', '6') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('referral_commission_tier4', '7') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('referral_commission_tier5', '10') ON CONFLICT (key) DO NOTHING`;
        await sql`INSERT INTO system_settings (key, value) VALUES ('referral_commission_tier6', '15') ON CONFLICT (key) DO NOTHING`;

        // Create default buyer account if not exists
        const buyerExists = await sql`SELECT * FROM users WHERE username = 'buyer'`;
        if (!buyerExists.length) {
            await sql`INSERT INTO users (username, password, email, address, contact, balance_numeric) VALUES ('buyer', 'buyer123', 'buyer@galaxy.com', 'Buyer Address', '000000', 0)`;
        }

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
        const rows = await sql`SELECT value FROM system_settings WHERE key = ${key}`;
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

async function generateTaskCode(username) {
    const nameParts = username.split(' ');
    let initials = '';
    if (nameParts.length >= 2) {
        initials = nameParts[0].charAt(0).toUpperCase() + nameParts[1].charAt(0).toUpperCase();
    } else {
        initials = username.substring(0, 2).toUpperCase();
    }
    
    const userRow = await sql`SELECT referred_by, referral_code FROM users WHERE username = ${username}`;
    let prefixCode = initials;
    
    if (userRow.length && userRow[0].referred_by) {
        const referrerRow = await sql`SELECT referral_code FROM users WHERE username = ${userRow[0].referred_by}`;
        if (referrerRow.length && referrerRow[0].referral_code) {
            prefixCode = referrerRow[0].referral_code + '/' + initials;
        }
    }
    
    const countRow = await sql`SELECT COUNT(*) as count FROM gmail_tasks WHERE username = ${username}`;
    const count = parseInt(countRow[0].count) + 1;
    const sequenceNum = String(count).padStart(3, '0');
    const taskCode = prefixCode + '-' + sequenceNum;
    
    if (userRow.length && !userRow[0].referral_code) {
        await sql`UPDATE users SET referral_code = ${initials} WHERE username = ${username}`;
    }
    
    return taskCode;
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
        notifTitle: "🔔 Notification Center & Alert Feeds",
        gmailTask: "📧 Gmail Creation Task",
        gmailInstr: "Create a new Gmail account and submit the credentials below.",
        emailCreated: "Created Email",
        emailPass: "Email Password",
        submitGmail: "Submit Gmail",
        yourCode: "Your Task Code",
        getRefLink: "Get Referral Link",
        refLink: "Your Referral Link",
        copyRef: "Copy Link",
        selectCountry: "Select Your Country",
        countryLK: "Sri Lanka 🇱🇰",
        countryINTL: "International 🌍",
        gmailPrice: "Price per Gmail",
        gmailHistory: "Gmail Task History",
        referralEarnings: "Referral Earnings",
        buyerLogin: "Buyer Login",
        buyerDashboard: "Buyer Dashboard",
        buyerWelcome: "Welcome Buyer",
        allPaymentsDone: "ALL PAYMENTS DONE",
        paymentProof: "Payment Proof Upload",
        uploadProof: "Upload Screenshot",
        done: "DONE",
        wrong: "WRONG",
        reason: "Reason",
        submitReason: "Submit Reason",
        paymentReady: "Payment Ready",
        totalGmails: "Total Gmails",
        pendingGmails: "Pending",
        approvedGmails: "Approved",
        rejectedGmails: "Rejected"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "ලබාගත හැකි විශ්වාසවන්ත සරල වැඩ (Tasks) 👇",
        subText: "පහත දැක්වෙන Galaxy පද්ධති පියවර සම්පූර්ණ කරන්න. තහවුරු කිරීමට නිවැරදි සාක්ෂි (Proofs) ඇතුළත් කරන්න.", logout: "ඉවත් වන්න (Logout)",
        forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න",
        cpaTitle: "🔗 Galaxy පද්ධති අභ්‍යන්තර Tasks සැකසුම්", taskInstr: "වැඩසටහනේ පියවර සහ උපදෙස්",
        notifTitle: "🔔 පණිවිඩ සහ නිවේදන පුවරුව",
        gmailTask: "📧 Gmail සෑදීමේ කාර්යය",
        gmailInstr: "නව Gmail ගිණුමක් සාදා පහත විස්තර ඇතුළත් කරන්න.",
        emailCreated: "සාදන ලද ඊමේල්",
        emailPass: "ඊමේල් මුරපදය",
        submitGmail: "Gmail යොමු කරන්න",
        yourCode: "ඔබේ කාර්ය කේතය",
        getRefLink: "Referral Link ලබා ගන්න",
        refLink: "ඔබේ Referral Link",
        copyRef: "Link එක Copy කරන්න",
        selectCountry: "ඔබේ රට තෝරන්න",
        countryLK: "ශ්‍රී ලංකාව 🇱🇰",
        countryINTL: "ජාත්‍යන්තර 🌍",
        gmailPrice: "Gmail එකක මිල",
        gmailHistory: "Gmail කාර්ය ඉතිහාසය",
        referralEarnings: "Referral ඉපැයීම්",
        buyerLogin: "ගැනුම්කරු ඇතුල්වීම",
        buyerDashboard: "ගැනුම්කරු Dashboard",
        buyerWelcome: "සාදරයෙන් පිළිගනිමු",
        allPaymentsDone: "සියලු ගෙවීම් අවසන්",
        paymentProof: "ගෙවීම් සාක්ෂි උඩුගත කරන්න",
        uploadProof: "Screenshot උඩුගත කරන්න",
        done: "සම්පූර්ණයි",
        wrong: "වැරදියි",
        reason: "හේතුව",
        submitReason: "හේතුව යොමු කරන්න",
        paymentReady: "ගෙවීම සූදානම්",
        totalGmails: "මුළු Gmails",
        pendingGmails: "පොරොත්තු",
        approvedGmails: "අනුමත",
        rejectedGmails: "ප්‍රතික්ෂේපිත"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழ்ய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் சான்றுகளையும் சமர்ப்பிக்கவும்.", logout: "வெளியேறு (Logout)",
        forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்",
        cpaTitle: "🔗 CPA நெட்வொர்க் இணைப்பு அமைப்புகள்", taskInstr: "பணி வழிமுறைகள்",
        notifTitle: "🔔 அறிவிப்பு மையம்",
        gmailTask: "📧 Gmail உருவாக்கும் பணி",
        gmailInstr: "புதிய Gmail கணக்கை உருவாக்கி கீழே உள்ள விவரங்களைச் சமர்ப்பிக்கவும்.",
        emailCreated: "உருவாக்கிய மின்னஞ்சல்",
        emailPass: "மின்னஞ்சல் கடவுச்சொல்",
        submitGmail: "Gmail சமர்ப்பிக்கவும்",
        yourCode: "உங்கள் பணி குறியீடு",
        getRefLink: "Referral Link பெறவும்",
        refLink: "உங்கள் Referral Link",
        copyRef: "Link நகலெடு",
        selectCountry: "உங்கள் நாட்டைத் தேர்ந்தெடுக்கவும்",
        countryLK: "இலங்கை 🇱🇰",
        countryINTL: "சர்வதேசம் 🌍",
        gmailPrice: "Gmail ஒன்றின் விலை",
        gmailHistory: "Gmail பணி வரலாறு",
        referralEarnings: "Referral வருவாய்",
        buyerLogin: "வாங்குபவர் உள்நுழைவு",
        buyerDashboard: "வாங்குபவர் Dashboard",
        buyerWelcome: "வரவேற்கிறோம்",
        allPaymentsDone: "அனைத்து கட்டணங்களும் முடிந்தது",
        paymentProof: "கட்டணச் சான்று பதிவேற்றம்",
        uploadProof: "Screenshot பதிவேற்று",
        done: "முடிந்தது",
        wrong: "தவறு",
        reason: "காரணம்",
        submitReason: "காரணத்தைச் சமர்ப்பிக்கவும்",
        paymentReady: "கட்டணம் தயார்",
        totalGmails: "மொத்த Gmails",
        pendingGmails: "நிலுவையில்",
        approvedGmails: "அனுமதிக்கப்பட்டது",
        rejectedGmails: "நிராகரிக்கப்பட்டது"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:15px;margin:0;} 
        .container{max-width:900px;margin:20px auto;background:#1f2833;padding:20px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;box-sizing:border-box;}
        
        .header-block { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #45a29e; padding-bottom: 15px; flex-wrap: wrap; gap: 10px; }
        .header-title { color:#66fcf1; margin: 0; font-size: 24px; font-weight: bold; }
        .header-actions { display: flex; align-items: center; gap: 10px; }

        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 6px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        input, textarea, select.form-input {width:100%; padding:10px; margin:8px 0; border-radius:5px; border:1px solid #45a29e; background:#0b0c10; color:#fff; box-sizing: border-box;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;}
        button:hover{background:#66fcf1;}
        
        .user-row{background:#0b0c10;padding:15px;margin:12px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;box-sizing:border-box;}
        .user-meta-block { line-height: 1.6; color:#c5c6c7; word-break: break-all; }
        .user-history-block { background:#141d26; padding:10px; border-radius:4px; margin: 10px 0; font-size:13px; border: 1px solid #233142; }
        
        a{color:#66fcf1;text-decoration:none;} 
        .logout-btn{background:#ff4d4d;color:#fff;padding:6px 14px;font-size:13px;font-weight:bold;border-radius:4px;text-decoration:none;border:none;cursor:pointer;}
        .logout-btn:hover{background:#cc3333;}
        
        .action-container-block { margin-top: 12px; display: flex; justify-content: flex-end; }
        .remove-btn-styled { background:#ff4d4d; color:white; padding:8px 14px; font-size:12px; font-weight:bold; cursor:pointer; border-radius:4px; text-decoration:none; border:none; display:inline-block; margin-top:10px;}
        .remove-btn-styled:hover { background: #cc3333; }

        .galaxy-secure-node-wrapper { background: #111a24; padding: 20px; border-radius: 8px; border: 2px solid #45a29e; margin: 25px 0; box-sizing: border-box; text-align: center; box-shadow: 0px 4px 10px rgba(0,0,0,0.3); }
        
        .galaxy-task-card-white { background: #ffffff; color: #333333; padding: 25px; border-radius: 8px; border: 1px solid #dddddd; margin: 15px auto; max-width: 500px; text-align: center; box-shadow: 0px 4px 10px rgba(0,0,0,0.1); }
        .galaxy-task-card-white h4 { color: #1f2833; margin: 0 0 10px 0; font-size: 18px; font-weight: bold; }
        .galaxy-task-card-white p { color: #555555; font-size: 14px; margin-bottom: 20px; line-height: 1.5; }
        .galaxy-start-btn { display: inline-block; width: 85%; padding: 12px; background: #2ecc71; color: #ffffff; font-weight: bold; text-decoration: none; border-radius: 5px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(46,204,113,0.2); transition: 0.2s; }
        .galaxy-start-btn:hover { background: #27ae60; color: #fff; }

        .navbar { display: flex; background: #0b0c10; border: 1px solid #45a29e; border-radius: 5px; margin-bottom: 20px; flex-wrap: wrap; }
        .nav-tab { flex: 1; min-width: 100px; text-align: center; padding: 12px; color: #c5c6c7; font-weight: bold; cursor: pointer; background: #0b0c10; border: none; transition: 0.3s; font-size:13px; position: relative; }
        .nav-tab:hover { background: #1f2833; color: #66fcf1; }
        .nav-tab.active { background: #45a29e; color: #0b0c10; }
        
        .notif-badge { background: #ff4d4d; color: white; border-radius: 50%; padding: 2px 7px; font-size: 11px; font-weight: bold; position: absolute; top: 4px; right: 8px; box-shadow: 0 0 5px rgba(255,77,77,0.5); }
        
        .dashboard-section { display: none; }
        .dashboard-section.active { display: block; }
        
        .stats-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; width: 100%; box-sizing: border-box; }
        .stat-card { flex: 1; min-width: calc(33.333% - 12px); background: #0b0c10; border: 1px solid #45a29e; padding: 15px; border-radius: 8px; text-align: center; box-sizing: border-box; }
        @media (max-width: 600px) {
            .stat-card { min-width: calc(100% - 4px); }
            .header-block { flex-direction: column; align-items: flex-start; }
            .header-actions { width: 100%; justify-content: space-between; }
        }
        
        .stat-card h3 { margin: 5px 0; color: #66fcf1; font-size: 20px; word-wrap: break-word; }
        .stat-card p { margin: 0; color: #a5a6a7; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; }

        .badge-pending { background: #f0ad4e; color: black; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .badge-fail { background: #ff4d4d; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .badge-success { background: #45a29e; color: #0b0c10; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .proof-form { background: #0b0c10; padding: 12px; border-radius: 5px; margin-top: 10px; border: 1px dashed #45a29e; text-align: left; }
        
        .notif-box { background: #141d26; border: 1px solid #45a29e; padding: 15px; border-radius: 6px; margin-bottom: 15px; font-size: 14px; color: #fff; line-height: 1.4; border-left: 5px solid #66fcf1; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .notif-box.read { border-left-color: #555; opacity: 0.6; }
        .notif-content { flex: 1; }
        .notif-time { font-size: 11px; color: #888; display: block; margin-top: 5px; }
        .notif-btn { background: #45a29e; color: #0b0c10; font-size: 12px; font-weight: bold; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; width: auto; margin-top: 0; }
        .notif-btn:hover { background: #66fcf1; }

        .search-container { margin-bottom: 15px; display: flex; gap: 10px; }
        .search-input { flex: 1; padding: 10px; background: #0b0c10; color: #fff; border: 1px solid #45a29e; border-radius: 5px; }
        .search-btn { width: auto; padding: 10px 20px; margin-top: 0; }

        .gmail-card { background: #0b0c10; padding: 15px; border-radius: 8px; border: 1px solid #45a29e; margin: 10px 0; }
        .gmail-card h4 { color: #66fcf1; margin: 0 0 10px 0; }
        .ref-link-box { background: #141d26; padding: 10px; border-radius: 5px; margin: 10px 0; display: flex; gap: 10px; align-items: center; }
        .ref-link-box input { flex: 1; margin: 0; }
        .ref-link-box button { width: auto; margin: 0; padding: 10px 20px; }
        
        .buyer-action-btns { display: flex; gap: 10px; margin-top: 10px; }
        .buyer-action-btns a, .buyer-action-btns form { flex: 1; text-align: center; }
        .btn-done { background: #2ecc71; color: #fff; padding: 8px; border-radius: 4px; text-decoration: none; display: inline-block; }
        .btn-wrong { background: #ff4d4d; color: #fff; padding: 8px; border-radius: 4px; border: none; cursor: pointer; }
        .payment-ready-btn { background: #f39c12; color: #fff; animation: glow 2s infinite; padding: 8px; border-radius: 4px; text-decoration: none; display: inline-block; }
        @keyframes glow {
            0% { box-shadow: 0 0 5px #f39c12; }
            50% { box-shadow: 0 0 20px #f39c12; }
            100% { box-shadow: 0 0 5px #f39c12; }
        }
    </style>
    <script>
        function switchSection(sectionId) {
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            const targetSec = document.getElementById(sectionId);
            if(targetSec) targetSec.classList.add('active');
            if(event && event.target) event.target.classList.add('active');
        }
        function copyRefLink() {
            const refInput = document.getElementById('refLinkInput');
            refInput.select();
            document.execCommand('copy');
            alert('Referral link copied to clipboard!');
        }
        window.onload = function() {
            const urlParams = new URLSearchParams(window.location.search);
            if(urlParams.get('tab')) {
                const tabName = urlParams.get('tab');
                const btn = document.getElementById('btn-' + tabName);
                if(btn) btn.click();
            }
        }
    </script>
</head><body><div class="container">
    <div class="header-block">
        <h2 class="header-title">${t.title}</h2>
        <div class="header-actions">
            <div class="lang-selector">
                <select onchange="window.location.href='/change-lang?lang=' + this.value">
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
    if (req.session.user) return req.session.user === 'buyer' ? res.redirect('/buyer-dashboard') : res.redirect('/dashboard');
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
        <p style="text-align:center; margin-top:10px;">
            <a href="/buyer-login" style="color:#f39c12;">${t.buyerLogin}</a>
        </p>
    `));
});

app.get('/register', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    const refCode = req.query.ref || '';
    res.send(htmlWrapper(req, 'Register', `
        <h3>${t.reg}</h3>
        <form action="/register" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <input type="password" name="password" placeholder="${t.pass}" required>
            <input type="email" name="email" placeholder="${t.email}" required>
            <input type="text" name="address" placeholder="${t.addr}" required>
            <input type="text" name="contact" placeholder="${t.phone}" required>
            <input type="hidden" name="ref_code" value="${refCode}">
            <button type="submit">${t.btnReg}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

app.post('/register', async (req, res) => {
    const { username, password, email, address, contact, ref_code } = req.body;
    try {
        const lowerUser = username.toLowerCase();
        const exists = await sql`SELECT * FROM users WHERE LOWER(username) = ${lowerUser}`;
        if (exists && exists.length > 0) {
            return res.send("<script>alert('Username already exists!'); window.location.href='/register';</script>");
        }
        
        let referredBy = null;
        if (ref_code && ref_code.trim() !== '') {
            const referrerRow = await sql`SELECT username FROM users WHERE referral_code = ${ref_code.trim()}`;
            if (referrerRow && referrerRow.length > 0) {
                referredBy = referrerRow[0].username;
            }
        }
        
        await sql`INSERT INTO users (username, password, email, address, contact, balance_numeric, earnings_percentage, referred_by) 
                   VALUES (${username}, ${password}, ${email}, ${address}, ${contact}, 0.0, 100.0, ${referredBy})`;
        
        const timeStr = new Date().toLocaleString();
        await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${username}, ${'👋 Welcome to Galaxy Workers Platform! Start completing premium portal tasks and withdraw instantly.'}, ${timeStr}, 0)`;

        if (referredBy) {
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${referredBy}, ${'🎉 New referral registered: ' + username + ' has joined using your referral link!'}, ${timeStr}, 0)`;
        }

        backupToGoogleSheet(username, email, 0.0, 0).catch(e => {}); 
        res.send("<script>alert('Registration Successful!'); window.location.href='/';</script>");
    } catch (err) {
        console.error(err);
        res.send(`<script>alert('Error registering user.'); window.location.href='/register';</script>`);
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        req.session.user = 'admin';
        return res.redirect('/dashboard');
    }
    if (username === 'buyer' && password === 'buyer123') {
        req.session.user = 'buyer';
        return res.redirect('/buyer-dashboard');
    }
    try {
        const users = await sql`SELECT * FROM users WHERE username = ${username} AND password = ${password}`;
        if (users && users.length > 0) {
            req.session.user = users[0].username;
            res.redirect('/dashboard');
        } else {
            res.send("<script>alert('Invalid Credentials'); window.location.href='/';</script>");
        }
    } catch (err) {
        console.error(err);
        res.send("<script>alert('Database Error'); window.location.href='/';</script>");
    }
});

app.get('/buyer-login', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Buyer Login', `
        <h3>${t.buyerLogin}</h3>
        <form action="/login" method="POST">
            <input type="text" name="username" placeholder="Username" value="buyer" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">${t.btnLog}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// BUYER DASHBOARD
app.get('/buyer-dashboard', async (req, res) => {
    if (!req.session.user || req.session.user !== 'buyer') return res.redirect('/buyer-login');
    const lang = req.session.lang || 'en';
    const t = translations[lang];

    try {
        const gmailTasks = await sql`SELECT * FROM gmail_tasks ORDER BY id DESC`;
        const grouped = {};
        gmailTasks.forEach(task => {
            if (!grouped[task.task_code]) grouped[task.task_code] = [];
            grouped[task.task_code].push(task);
        });

        let gmailTasksHtml = `<h3>📧 Gmail Submissions</h3>`;
        if (gmailTasks.length === 0) {
            gmailTasksHtml += `<p style="color:#aaa;">No Gmail submissions yet.</p>`;
        } else {
            for (const [code, tasks] of Object.entries(grouped)) {
                gmailTasksHtml += `<div style="margin-bottom: 20px; border: 1px solid #45a29e; padding: 15px; border-radius: 8px;">
                    <h4 style="color:#66fcf1;">📋 Worker Code: ${code}</h4>`;
                
                tasks.forEach(task => {
                    let statusBadge = task.status === 'Success' ? `<span class="badge-success">Approved</span>` : 
                                     (task.status === 'Pending' ? `<span class="badge-pending">Pending</span>` : 
                                     (task.status === 'PaymentReady' ? `<span style="background:#f39c12;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;">Payment Ready</span>` :
                                     `<span class="badge-fail">Wrong</span>`));
                    
                    gmailTasksHtml += `
                    <div class="gmail-card">
                        <p><strong>📧 Email:</strong> ${task.email_created}</p>
                        <p><strong>🔑 Password:</strong> ${task.password_created}</p>
                        <p><strong>💰 Amount:</strong> $${parseFloat(task.amount).toFixed(2)}</p>
                        <p><strong>Status:</strong> ${statusBadge}</p>
                        <p><strong>Time:</strong> ${task.timestamp}</p>
                        ${task.buyer_reason ? `<p style="color:#ff4d4d;"><strong>Reason:</strong> ${task.buyer_reason}</p>` : ''}
                        
                        ${task.status === 'Pending' ? `
                        <div class="buyer-action-btns">
                            <a href="/buyer-mark-done?id=${task.id}" class="btn-done">${t.done}</a>
                            <form action="/buyer-mark-wrong" method="POST" style="flex:1;margin:0;">
                                <input type="hidden" name="task_id" value="${task.id}">
                                <input type="text" name="reason" placeholder="${t.reason}" required style="width:100%;margin:0 0 5px 0;">
                                <button type="submit" class="btn-wrong">${t.wrong}</button>
                            </form>
                        </div>
                        ` : ''}
                        
                        ${task.status === 'Success' ? `
                        <a href="/buyer-mark-payment-ready?id=${task.id}" class="payment-ready-btn" style="width:100%;">${t.paymentReady}</a>
                        ` : ''}
                    </div>`;
                });
                gmailTasksHtml += `</div>`;
            }
        }

        const paymentProofs = await sql`SELECT * FROM payment_proofs WHERE buyer_username = 'buyer' AND is_deleted = 0 ORDER BY id DESC`;
        let paymentProofsHtml = `<h3>${t.paymentProof}</h3>
        <form action="/upload-payment-proof" method="POST" enctype="multipart/form-data" style="margin-bottom:20px;">
            <input type="file" name="payment_proof" accept="image/*" required>
            <button type="submit">${t.uploadProof}</button>
        </form>`;
        
        if (paymentProofs.length === 0) {
            paymentProofsHtml += `<p style="color:#aaa;">No payment proofs uploaded yet.</p>`;
        } else {
            paymentProofs.forEach(proof => {
                paymentProofsHtml += `
                <div style="background:#0b0c10;padding:10px;border-radius:5px;margin:10px 0;border:1px solid #45a29e;">
                    <img src="/proof-image/${proof.id}" style="max-width:100%;border-radius:5px;">
                    <p style="font-size:12px;color:#888;">${proof.timestamp}</p>
                    <a href="/delete-payment-proof?id=${proof.id}" style="color:#ff4d4d;font-size:12px;">Delete</a>
                </div>`;
            });
        }

        const allPaymentsBtn = `
        <form action="/buyer-all-payments-done" method="POST" style="margin-bottom:20px;">
            <button type="submit" class="payment-ready-btn">💰 ${t.allPaymentsDone}</button>
        </form>`;

        const totalGmails = gmailTasks.length;
        const pendingGmails = gmailTasks.filter(t => t.status === 'Pending').length;
        const approvedGmails = gmailTasks.filter(t => t.status === 'Success' || t.status === 'PaymentReady').length;
        const rejectedGmails = gmailTasks.filter(t => t.status === 'Failed').length;

        res.send(htmlWrapper(req, 'Buyer Dashboard', `
            <h3>${t.buyerWelcome}</h3>
            <div class="stats-grid">
                <div class="stat-card"><h3>${totalGmails}</h3><p>${t.totalGmails}</p></div>
                <div class="stat-card"><h3>${pendingGmails}</h3><p>${t.pendingGmails}</p></div>
                <div class="stat-card"><h3>${approvedGmails}</h3><p>${t.approvedGmails}</p></div>
                <div class="stat-card"><h3>${rejectedGmails}</h3><p>${t.rejectedGmails}</p></div>
            </div>
            ${allPaymentsBtn}
            ${paymentProofsHtml}
            ${gmailTasksHtml}
        `));
    } catch (err) {
        console.error(err);
        res.status(500).send("Buyer Dashboard Error.");
    }
});

// Buyer actions
app.get('/buyer-mark-done', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    const taskId = parseInt(req.query.id);
    try {
        const taskRow = await sql`SELECT * FROM gmail_tasks WHERE id = ${taskId}`;
        if (taskRow.length > 0 && taskRow[0].status === 'Pending') {
            const task = taskRow[0];
            const timeStr = new Date().toLocaleString();
            
            await sql`UPDATE gmail_tasks SET status = 'Success' WHERE id = ${taskId}`;
            await sql`UPDATE users SET balance_numeric = balance_numeric + ${task.amount} WHERE username = ${task.username}`;
            
            if (task.referral_commission_paid === 0) {
                const userRow = await sql`SELECT referred_by FROM users WHERE username = ${task.username}`;
                if (userRow.length > 0 && userRow[0].referred_by) {
                    const referrer = userRow[0].referred_by;
                    const successCountRow = await sql`SELECT COUNT(*) as count FROM gmail_tasks WHERE username = ${task.username} AND status IN ('Success', 'PaymentReady')`;
                    const successCount = successCountRow[0].count;
                    
                    let commissionAmount = 0;
                    const tier1 = parseFloat((await dbGetSetting('referral_commission_tier1'))?.value || 4);
                    const tier2 = parseFloat((await dbGetSetting('referral_commission_tier2'))?.value || 5);
                    const tier3 = parseFloat((await dbGetSetting('referral_commission_tier3'))?.value || 6);
                    const tier4 = parseFloat((await dbGetSetting('referral_commission_tier4'))?.value || 7);
                    const tier5 = parseFloat((await dbGetSetting('referral_commission_tier5'))?.value || 10);
                    const tier6 = parseFloat((await dbGetSetting('referral_commission_tier6'))?.value || 15);
                    
                    if (successCount <= 3) commissionAmount = tier1;
                    else if (successCount <= 4) commissionAmount = tier2;
                    else if (successCount <= 8) commissionAmount = tier3;
                    else if (successCount <= 15) commissionAmount = tier4;
                    else if (successCount <= 25) commissionAmount = tier5;
                    else commissionAmount = tier6;
                    
                    const commissionUSD = commissionAmount / 300;
                    
                    await sql`UPDATE users SET balance_numeric = balance_numeric + ${commissionUSD} WHERE username = ${referrer}`;
                    await sql`UPDATE gmail_tasks SET referral_commission_paid = 1 WHERE id = ${taskId}`;
                    
                    await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${referrer}, ${'💰 Referral commission of $' + commissionUSD.toFixed(2) + ' credited from ' + task.username + "'s Gmail task!"}, ${timeStr}, 0)`;
                }
            }
            
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${task.username}, ${'🎉 Your Gmail [' + task.email_created + '] has been approved! $' + parseFloat(task.amount).toFixed(2) + ' credited.'}, ${timeStr}, 0)`;
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES ('admin', ${'📧 Gmail task #' + taskId + ' by ' + task.username + ' was marked DONE by buyer.'}, ${timeStr}, 0)`;
        }
        res.redirect('/buyer-dashboard');
    } catch(e) { res.redirect('/buyer-dashboard'); }
});

app.post('/buyer-mark-wrong', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    const { task_id, reason } = req.body;
    try {
        const taskRow = await sql`SELECT * FROM gmail_tasks WHERE id = ${task_id}`;
        if (taskRow.length > 0 && taskRow[0].status === 'Pending') {
            const task = taskRow[0];
            const timeStr = new Date().toLocaleString();
            
            await sql`UPDATE gmail_tasks SET status = 'Failed', buyer_reason = ${reason} WHERE id = ${task_id}`;
            
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${task.username}, ${'❌ Your Gmail [' + task.email_created + '] was rejected. Reason: ' + reason}, ${timeStr}, 0)`;
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES ('admin', ${'📧 Gmail task #' + task_id + ' by ' + task.username + ' was marked WRONG by buyer. Reason: ' + reason}, ${timeStr}, 0)`;
        }
        res.redirect('/buyer-dashboard');
    } catch(e) { res.redirect('/buyer-dashboard'); }
});

app.get('/buyer-mark-payment-ready', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    const taskId = parseInt(req.query.id);
    try {
        const taskRow = await sql`SELECT * FROM gmail_tasks WHERE id = ${taskId}`;
        if (taskRow.length > 0 && taskRow[0].status === 'Success') {
            const task = taskRow[0];
            const timeStr = new Date().toLocaleString();
            
            await sql`UPDATE gmail_tasks SET status = 'PaymentReady' WHERE id = ${taskId}`;
            
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${task.username}, ${'💵 Payment ready for your Gmail [' + task.email_created + ']!'}, ${timeStr}, 0)`;
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES ('admin', ${'💰 Payment marked ready for Gmail task #' + taskId + ' by ' + task.username}, ${timeStr}, 0)`;
        }
        res.redirect('/buyer-dashboard');
    } catch(e) { res.redirect('/buyer-dashboard'); }
});

app.post('/buyer-all-payments-done', async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    const timeStr = new Date().toLocaleString();
    try {
        await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES ('admin', ${'💰 Buyer has marked ALL PAYMENTS DONE at ' + timeStr + '.'}, ${timeStr}, 0)`;
        res.send("<script>alert('All payments marked as done! Admin notified.'); window.location.href='/buyer-dashboard';</script>");
    } catch(e) { res.redirect('/buyer-dashboard'); }
});

app.post('/upload-payment-proof', upload.single('payment_proof'), async (req, res) => {
    if (req.session.user !== 'buyer') return res.redirect('/');
    const timeStr = new Date().toLocaleString();
    try {
        const b64 = req.file.buffer.toString('base64');
        await sql`INSERT INTO payment_proofs (buyer_username, file_data, original_name, timestamp) VALUES ('buyer', ${b64}, ${req.file.originalname}, ${timeStr})`;
        await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES ('admin', ${'💳 Buyer uploaded a new payment proof at ' + timeStr + '.'}, ${timeStr}, 0)`;
        res.redirect('/buyer-dashboard');
    } catch(e) { res.redirect('/buyer-dashboard'); }
});

app.get('/delete-payment-proof', async (req, res) => {
    if (req.session.user !== 'buyer' && req.session.user !== 'admin') return res.redirect('/');
    const proofId = parseInt(req.query.id);
    try {
        await sql`UPDATE payment_proofs SET is_deleted = 1 WHERE id = ${proofId}`;
        if (req.session.user === 'admin') {
            res.redirect('/dashboard?tab=admin-payments');
        } else {
            res.redirect('/buyer-dashboard');
        }
    } catch(e) { res.redirect('/dashboard'); }
});

// MAIN DASHBOARD ROUTE
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const username = req.session.user;
    const lang = req.session.lang || 'en';
    const t = translations[lang];

    try {
        if (username === 'admin') {
            let users = []; try { users = await sql`SELECT * FROM users WHERE username NOT IN ('admin', 'buyer')`; } catch(e){}
            let cpas = []; try { cpas = await sql`SELECT * FROM cpa_configs`; } catch(e){}
            let allLogs = []; try { allLogs = await sql`SELECT * FROM task_logs ORDER BY id DESC`; } catch(e){}
            let allGmailTasks = []; try { allGmailTasks = await sql`SELECT * FROM gmail_tasks ORDER BY id DESC`; } catch(e){}
            let allPaymentProofs = []; try { allPaymentProofs = await sql`SELECT * FROM payment_proofs WHERE is_deleted = 0 ORDER BY id DESC`; } catch(e){}

            const gmailPriceLK = (await dbGetSetting('gmail_task_price_lk'))?.value || '0.25';
            const gmailPriceIntl = (await dbGetSetting('gmail_task_price_intl'))?.value || '0.25';
            const gmailInstrEn = (await dbGetSetting('gmail_task_instructions_en'))?.value || 'Create a new Gmail account.';
            const gmailInstrSi = (await dbGetSetting('gmail_task_instructions_si'))?.value || 'නව Gmail ගිණුමක් සාදන්න.';
            const gmailInstrTa = (await dbGetSetting('gmail_task_instructions_ta'))?.value || 'புதிய Gmail கணக்கை உருவாக்கவும்.';

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

            let logsReviewHtml = `<h3>📩 Worker Submissions & Task Proofs Verification</h3>`;
            let pendingSubmissions = allLogs.filter(x => x.status === 'Pending');
            if(pendingSubmissions.length === 0) {
                logsReviewHtml += `<p style="color:#aaa;">No pending submissions to audit.</p>`;
            } else {
                pendingSubmissions.forEach(l => {
                    logsReviewHtml += `
                    <div class="user-row" style="border-left-color: #f0ad4e">
                        <strong>Worker Name:</strong> ${l.username} <br>
                        <strong>Target Task:</strong> ${l.task_name} <br>
                        <strong>Submitted Proof Code/Data:</strong> <span style="color:#66fcf1; font-weight:bold;">${l.proof_data}</span> <br>
                        <strong>Time Sent:</strong> ${l.timestamp} <br><br>
                        <a href="/approve-task?id=${l.id}" style="background:#45a29e; color:#000; padding:5px 12px; font-weight:bold; border-radius:4px; font-size:12px; margin-right:8px; text-decoration:none; display:inline-block;">APPROVE & PAY</a>
                        <a href="/reject-task?id=${l.id}" style="background:#ff4d4d; color:#fff; padding:5px 12px; font-weight:bold; border-radius:4px; font-size:12px; text-decoration:none; display:inline-block;">REJECT PROOF</a>
                    </div>`;
                });
            }

            let usersHtml = `<h3>👥 Workers Metrics & Registration Database</h3>`;
            usersHtml += `
            <form method="GET" action="/dashboard" class="search-container">
                <input type="hidden" name="tab" value="user-metrics">
                <input type="text" name="search_keyword" value="${searchKeyword}" placeholder="Search via Username, Email, Phone, Address..." class="search-input">
                <button type="submit" class="search-btn">Search Worker</button>
            </form>`;

            if(filteredUsers.length === 0) {
                usersHtml += `<p style="color:#ff4d4d;">No matching workers found in registry.</p>`;
            } else {
                filteredUsers.forEach(u => {
                    let userSpecificLogs = allLogs.filter(log => log.username === u.username);
                    let userGmailLogs = allGmailTasks.filter(g => g.username === u.username);
                    let taskBreakdownHtml = '';
                    
                    if(userSpecificLogs.length === 0 && userGmailLogs.length === 0) {
                        taskBreakdownHtml = `<span style="color:#888; font-size:12px;">No historical activities tracked for this node.</span>`;
                    } else {
                        userSpecificLogs.forEach(lg => {
                            let statusBadge = lg.status === 'Success' ? `<span class="badge-success">Success</span>` : (lg.status === 'Pending' ? `<span class="badge-pending">Pending</span>` : `<span class="badge-fail">Failed</span>`);
                            taskBreakdownHtml += `<div style="font-size:12px; margin:4px 0; color:#b0b5bc;">• ${lg.task_name} -> Earned: <strong>$${parseFloat(lg.amount || 0).toFixed(2)}</strong> | ${statusBadge} <span style="font-size:11px; color:#666;">(${lg.timestamp})</span></div>`;
                        });
                        userGmailLogs.forEach(g => {
                            let statusBadge = g.status === 'Success' ? `<span class="badge-success">Success</span>` : (g.status === 'Pending' ? `<span class="badge-pending">Pending</span>` : (g.status === 'PaymentReady' ? `<span style="background:#f39c12;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;">Payment Ready</span>` : `<span class="badge-fail">Failed</span>`));
                            taskBreakdownHtml += `<div style="font-size:12px; margin:4px 0; color:#b0b5bc;">📧 Gmail: ${g.email_created} | Code: ${g.task_code} | ${statusBadge} <span style="font-size:11px; color:#666;">(${g.timestamp})</span></div>`;
                        });
                    }

                    usersHtml += `
                    <div class="user-row" style="border-left-color: #66fcf1;">
                        <div class="user-meta-block">
                            <strong>👤 Username Account:</strong> <span style="color:#66fcf1; font-weight:bold;">${u.username}</span> <br>
                            <strong>🔑 Account Password String:</strong> <span style="color:#aaa;">${u.password}</span> <br>
                            <strong>📧 Registered Email:</strong> ${u.email} <br>
                            <strong>📞 Contact Channel/WhatsApp:</strong> ${u.contact || 'N/A'} <br>
                            <strong>🏠 Domestic physical Address:</strong> ${u.address || 'N/A'} <br>
                            <strong>🌍 Country:</strong> ${u.country || 'LK'} <br>
                            <strong>🔗 Referral Code:</strong> ${u.referral_code || 'N/A'} <br>
                            <strong>👤 Referred By:</strong> ${u.referred_by || 'N/A'} <br>
                            <strong>💰 Current Ledger Balance:</strong> <span style="color:#2ecc71; font-weight:bold;">$${parseFloat(u.balance_numeric || 0).toFixed(2)}</span>
                        </div>
                        <div class="user-history-block">
                            <strong>🎯 Verification Log Tracks & Financial Breakdowns:</strong>
                            <div style="margin-top:6px;">${taskBreakdownHtml}</div>
                        </div>
                        <div style="text-align:right;">
                            <a href="/remove-user?id=${u.id}" onclick="return confirm('Are you sure you want to permanently delete user ${u.username}? This wipe cannot be undone.');" class="remove-btn-styled">⚠️ DELETE WORKER ACCOUNT</a>
                        </div>
                    </div>`;
                });
            }

            let gmailAdminHtml = `<h3>📧 Gmail Tasks Overview</h3>`;
            if (allGmailTasks.length === 0) {
                gmailAdminHtml += `<p style="color:#aaa;">No Gmail tasks submitted yet.</p>`;
            } else {
                allGmailTasks.forEach(task => {
                    let statusBadge = task.status === 'Success' ? `<span class="badge-success">Approved</span>` : 
                                     (task.status === 'Pending' ? `<span class="badge-pending">Pending</span>` : 
                                     (task.status === 'PaymentReady' ? `<span style="background:#f39c12;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;">Payment Ready</span>` :
                                     `<span class="badge-fail">Wrong</span>`));
                    gmailAdminHtml += `
                    <div class="gmail-card">
                        <p><strong>Worker:</strong> ${task.username}</p>
                        <p><strong>Code:</strong> ${task.task_code}</p>
                        <p><strong>Email:</strong> ${task.email_created}</p>
                        <p><strong>Password:</strong> ${task.password_created}</p>
                        <p><strong>Amount:</strong> $${parseFloat(task.amount).toFixed(2)}</p>
                        <p><strong>Status:</strong> ${statusBadge}</p>
                        <p><strong>Time:</strong> ${task.timestamp}</p>
                        ${task.buyer_reason ? `<p style="color:#ff4d4d;"><strong>Reason:</strong> ${task.buyer_reason}</p>` : ''}
                    </div>`;
                });
            }

            let paymentProofsAdminHtml = `<h3>💳 Payment Proofs from Buyer</h3>`;
            if (allPaymentProofs.length === 0) {
                paymentProofsAdminHtml += `<p style="color:#aaa;">No payment proofs uploaded yet.</p>`;
            } else {
                allPaymentProofs.forEach(proof => {
                    paymentProofsAdminHtml += `
                    <div style="background:#0b0c10;padding:10px;border-radius:5px;margin:10px 0;border:1px solid #45a29e;">
                        <img src="/proof-image/${proof.id}" style="max-width:100%;border-radius:5px;">
                        <p style="font-size:12px;color:#888;">${proof.timestamp}</p>
                        <a href="/delete-payment-proof?id=${proof.id}" style="color:#ff4d4d;font-size:12px;">Delete</a>
                    </div>`;
                });
            }

            let gmailSettingsHtml = `<h3>⚙️ Gmail Task Settings</h3>
            <form action="/update-gmail-settings" method="POST">
                <label>Price per Gmail (Sri Lanka) in USD:</label>
                <input type="number" step="0.01" name="gmail_price_lk" value="${gmailPriceLK}" required>
                <label>Price per Gmail (International) in USD:</label>
                <input type="number" step="0.01" name="gmail_price_intl" value="${gmailPriceIntl}" required>
                <label>Instructions (English):</label>
                <textarea name="instructions_en" rows="3">${gmailInstrEn}</textarea>
                <label>Instructions (Sinhala):</label>
                <textarea name="instructions_si" rows="3">${gmailInstrSi}</textarea>
                <label>Instructions (Tamil):</label>
                <textarea name="instructions_ta" rows="3">${gmailInstrTa}</textarea>
                <button type="submit">Update Gmail Task Settings</button>
            </form>`;

            const refTier1 = (await dbGetSetting('referral_commission_tier1'))?.value || '4';
            const refTier2 = (await dbGetSetting('referral_commission_tier2'))?.value || '5';
            const refTier3 = (await dbGetSetting('referral_commission_tier3'))?.value || '6';
            const refTier4 = (await dbGetSetting('referral_commission_tier4'))?.value || '7';
            const refTier5 = (await dbGetSetting('referral_commission_tier5'))?.value || '10';
            const refTier6 = (await dbGetSetting('referral_commission_tier6'))?.value || '15';

            let referralSettingsHtml = `<h3>💰 Referral Commission Settings (in LKR)</h3>
            <form action="/update-referral-settings" method="POST">
                <label>Tier 1 (1-3 tasks/day):</label>
                <input type="number" name="tier1" value="${refTier1}" required>
                <label>Tier 2 (4 tasks/day):</label>
                <input type="number" name="tier2" value="${refTier2}" required>
                <label>Tier 3 (5-8 tasks/day):</label>
                <input type="number" name="tier3" value="${refTier3}" required>
                <label>Tier 4 (9-15 tasks/day):</label>
                <input type="number" name="tier4" value="${refTier4}" required>
                <label>Tier 5 (16-25 tasks/day):</label>
                <input type="number" name="tier5" value="${refTier5}" required>
                <label>Tier 6 (25+ tasks/day):</label>
                <input type="number" name="tier6" value="${refTier6}" required>
                <button type="submit">Update Referral Commissions</button>
            </form>`;

            let adminTaskSectionHtml = `<h3>🎯 Live Tasks Checker (Admin View)</h3>`;
            cpas.forEach(c => {
                adminTaskSectionHtml += `
                <div class="galaxy-secure-node-wrapper">
                    <h4 style="color:#66fcf1;">🌐 Active Security Node: ${c.network_name}</h4>
                    <p style="color:#fff;">Link: ${c.embed_code}</p>
                    <a href="/remove-cpa?id=${c.id}" style="color:#ff4d4d;">Delete Task</a>
                </div>`;
            });

            res.send(htmlWrapper(req, 'Admin Dashboard', `
                <h3>Welcome Chief Admin</h3>
                <div class="navbar">
                    <button id="btn-admin-panel" class="nav-tab active" onclick="switchSection('admin-panel')">⚙️ Controls Panel</button>
                    <button id="btn-task-reviews" class="nav-tab" onclick="switchSection('task-reviews')">📩 Task Submissions (${pendingSubmissions.length})</button>
                    <button id="btn-user-metrics" class="nav-tab" onclick="switchSection('user-metrics')">👥 Worker Metrics</button>
                    <button id="btn-admin-tasks" class="nav-tab" onclick="switchSection('admin-tasks')">🎯 View Tasks</button>
                    <button id="btn-gmail-tasks" class="nav-tab" onclick="switchSection('gmail-tasks')">📧 Gmail Tasks</button>
                    <button id="btn-admin-payments" class="nav-tab" onclick="switchSection('admin-payments')">💳 Payments</button>
                    <button id="btn-gmail-settings" class="nav-tab" onclick="switchSection('gmail-settings')">⚙️ Gmail Settings</button>
                    <button id="btn-referral-settings" class="nav-tab" onclick="switchSection('referral-settings')">💰 Referral</button>
                </div>
                
                <div id="admin-panel" class="dashboard-section active">
                    <h3>📢 Send Broadcast / Personal Notification</h3>
                    <form action="/send-notification" method="POST">
                        <select name="target_user" class="form-input">
                            <option value="all">📢 Broadcast to All Workers</option>
                            ${users.map(u => `<option value="${u.username}">👤 Personal: ${u.username}</option>`).join('')}
                        </select>
                        <input type="text" name="message" placeholder="Type notification message here..." required>
                        <button type="submit">Deploy System Notification</button>
                    </form>
                    <hr style="border-color:#45a29e; margin:20px 0;">
                    <h3>➕ Upload New Premium Task Container</h3>
                    <form action="/add-cpa" method="POST">
                        <input type="text" name="network_name" placeholder="Task Name (e.g., Complete Survey 01)" required>
                        <input type="text" name="embed_code" placeholder="Paste ONLY the CPALead Offer URL Link here" required>
                        <input type="text" name="instructions_en" placeholder="Guidelines Instructions (English)" required>
                        <input type="text" name="instructions_si" placeholder="Guidelines Instructions (Sinhala)" required>
                        <input type="text" name="instructions_ta" placeholder="Guidelines Instructions (Tamil)" required>
                        <button type="submit">Deploy Native Task Unit</button>
                    </form>
                </div>
                
                <div id="task-reviews" class="dashboard-section">${logsReviewHtml}</div>
                <div id="user-metrics" class="dashboard-section">${usersHtml}</div>
                <div id="admin-tasks" class="dashboard-section">${adminTaskSectionHtml}</div>
                <div id="gmail-tasks" class="dashboard-section">${gmailAdminHtml}</div>
                <div id="admin-payments" class="dashboard-section">${paymentProofsAdminHtml}</div>
                <div id="gmail-settings" class="dashboard-section">${gmailSettingsHtml}</div>
                <div id="referral-settings" class="dashboard-section">${referralSettingsHtml}</div>
            `));
        } else {
            // WORKER VIEW
            const userRow = await sql`SELECT * FROM users WHERE username = ${username}`;
            if (!userRow || userRow.length === 0) return res.redirect('/logout');
            const user = userRow[0];
            const cpas = await sql`SELECT * FROM cpa_configs WHERE is_active = 1`;
            const logs = await sql`SELECT * FROM task_logs WHERE username = ${username} ORDER BY id DESC`;
            const gmailLogs = await sql`SELECT * FROM gmail_tasks WHERE username = ${username} ORDER BY id DESC`;
            const systemNotifs = await sql`SELECT * FROM notifications WHERE target_user = ${username} OR target_user = 'all' ORDER BY id DESC LIMIT 20`;
            
            const unreadCountRow = await sql`SELECT COUNT(*) as unread FROM notifications WHERE (target_user = ${username} OR target_user = 'all') AND is_read = 0`;
            const unreadCount = unreadCountRow[0].unread || 0;

            let currentBal = user ? parseFloat(user.balance_numeric || 0) : 0.0;
            let pendingCount = logs.filter(l => l.status === 'Pending').length + gmailLogs.filter(g => g.status === 'Pending').length;
            let completedCount = logs.filter(l => l.status === 'Success').length + gmailLogs.filter(g => g.status === 'Success' || g.status === 'PaymentReady').length;

            const userCountry = user.country || 'LK';
            const gmailPrice = userCountry === 'LK' ? 
                parseFloat((await dbGetSetting('gmail_task_price_lk'))?.value || 0.25) : 
                parseFloat((await dbGetSetting('gmail_task_price_intl'))?.value || 0.25);
            
            const gmailInstrEn = (await dbGetSetting('gmail_task_instructions_en'))?.value || 'Create a new Gmail account.';
            const gmailInstrSi = (await dbGetSetting('gmail_task_instructions_si'))?.value || 'නව Gmail ගිණුමක් සාදන්න.';
            const gmailInstrTa = (await dbGetSetting('gmail_task_instructions_ta'))?.value || 'புதிய Gmail கணக்கை உருவாக்கவும்.';
            const gmailInstr = lang === 'si' ? gmailInstrSi : (lang === 'ta' ? gmailInstrTa : gmailInstrEn);

            let statsHtml = `
            <div class="stats-grid">
                <div class="stat-card"><h3>$${currentBal.toFixed(2)}</h3><p>AVAILABLE BALANCE</p></div>
                <div class="stat-card"><h3>${pendingCount}</h3><p>PENDING REVIEW</p></div>
                <div class="stat-card"><h3>${completedCount}</h3><p>APPROVED SECURE TASKS</p></div>
            </div>`;

            let userNotifFeedHtml = `<h3>${t.notifTitle}</h3>`;
            if (systemNotifs.length === 0) {
                userNotifFeedHtml += `<p style="color:#aaa;">No notifications available.</p>`;
            } else {
                systemNotifs.forEach(n => {
                    let typeTag = n.target_user === 'all' ? '📢 [BROADCAST]' : '🔒 [PERSONAL]';
                    let isReadClass = n.is_read === 1 ? 'read' : '';
                    let actionBtn = n.is_read === 0 ? `<button class="notif-btn" onclick="window.location.href='/mark-notif-read?id=${n.id}'">Mark as Read</button>` : '';
                    
                    userNotifFeedHtml += `
                    <div class="notif-box ${isReadClass}">
                        <div class="notif-content">
                            <strong>${typeTag}</strong> ${n.message}
                            <span class="notif-time">${n.timestamp}</span>
                        </div>
                        ${actionBtn}
                    </div>`;
                });
            }

            let cpaTasksHtml = `<h3>${t.tasks}</h3><p>${t.subText}</p>`;
            if(cpas.length === 0) {
                cpaTasksHtml += `<p style="text-align:center; color:#ff4d4d;">No system verification lines open right now.</p>`;
            } else {
                cpas.forEach(c => {
                    let instructions = (lang === 'si' ? c.instructions_si : (lang === 'ta' ? c.instructions_ta : c.instructions_en));
                    cpaTasksHtml += `
                    <div class="galaxy-secure-node-wrapper">
                        <h4 style="color:#66fcf1; margin:0 0 5px 0; text-align:left;">🌐 Core System Node: ${c.network_name}</h4>
                        <p style="font-size:14px; color:#45a29e; text-align:left;">📋 <strong>Execution Instructions:</strong> ${instructions}</p>
                        
                        <div class="galaxy-task-card-white">
                            <h4>Galaxy Verification Protocol</h4>
                            <p>To securely register your interaction and auto-credit $0.50 into your balance ledger, click the button below and follow the security checkpoint verification step.</p>
                            <a href="${c.embed_code}" target="_blank" class="galaxy-start-btn">⚡ START VERIFICATION TASK</a>
                        </div>
                        
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
            }

            let gmailTaskHtml = `<h3>${t.gmailTask}</h3>
            <div class="galaxy-secure-node-wrapper">
                <h4 style="color:#66fcf1;">📧 ${t.gmailTask}</h4>
                <p style="color:#fff;">${gmailInstr}</p>
                <p style="color:#2ecc71; font-weight:bold;">💰 ${t.gmailPrice}: $${gmailPrice.toFixed(2)}</p>
                
                <div class="gmail-card">
                    <p style="color:#66fcf1;"><strong>${t.yourCode}:</strong> ${user.referral_code || 'N/A'}</p>
                </div>
                
                <form action="/submit-gmail-task" method="POST">
                    <input type="email" name="email_created" placeholder="${t.emailCreated}" required>
                    <input type="text" name="password_created" placeholder="${t.emailPass}" required>
                    <button type="submit">${t.submitGmail}</button>
                </form>
                
                <hr style="border-color:#45a29e; margin: 15px 0;">
                
                <button onclick="document.getElementById('refLinkSection').style.display='block'; this.style.display='none';" style="background:#f39c12; color:#fff;">${t.getRefLink}</button>
                
                <div id="refLinkSection" style="display:none;">
                    <div class="ref-link-box">
                        <input type="text" id="refLinkInput" value="https://${req.get('host')}/register?ref=${user.referral_code || ''}" readonly>
                        <button onclick="copyRefLink()">${t.copyRef}</button>
                    </div>
                </div>
            </div>`;

            let countrySelectorHtml = `
            <div class="galaxy-secure-node-wrapper" style="margin-bottom:15px;">
                <h4 style="color:#66fcf1;">🌍 ${t.selectCountry}</h4>
                <form action="/update-country" method="POST">
                    <select name="country" class="form-input" onchange="this.form.submit()">
                        <option value="LK" ${userCountry === 'LK' ? 'selected' : ''}>${t.countryLK}</option>
                        <option value="INTL" ${userCountry === 'INTL' ? 'selected' : ''}>${t.countryINTL}</option>
                    </select>
                </form>
            </div>`;

            let gmailHistoryHtml = `<h3>${t.gmailHistory}</h3>`;
            if (gmailLogs.length === 0) {
                gmailHistoryHtml += `<p style="color:#aaa;">No Gmail tasks submitted yet.</p>`;
            } else {
                gmailLogs.forEach(g => {
                    let statusBadge = g.status === 'Success' ? `<span class="badge-success">Approved</span>` : 
                                     (g.status === 'Pending' ? `<span class="badge-pending">Pending</span>` : 
                                     (g.status === 'PaymentReady' ? `<span style="background:#f39c12;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;">Payment Ready</span>` :
                                     `<span class="badge-fail">Wrong</span>`));
                    gmailHistoryHtml += `
                    <div class="user-row" style="border-left-color: ${g.status==='Success'||g.status==='PaymentReady'?'#45a29e':g.status==='Pending'?'#f0ad4e':'#ff4d4d'}">
                        <strong>📧 Email:</strong> ${g.email_created} <br>
                        <strong>🔑 Code:</strong> ${g.task_code} <br>
                        <strong>💰 Amount:</strong> $${parseFloat(g.amount).toFixed(2)} <br>
                        <strong>🚦 Status:</strong> ${statusBadge} <br>
                        <strong>🕒 Time:</strong> ${g.timestamp}
                        ${g.buyer_reason ? `<br><strong style="color:#ff4d4d;">❌ Reason:</strong> ${g.buyer_reason}` : ''}
                    </div>`;
                });
            }

            let referralEarningsHtml = `<h3>${t.referralEarnings}</h3>`;
            if (user.referral_code) {
                const referrals = await sql`SELECT * FROM users WHERE referred_by = ${username}`;
                if (referrals.length === 0) {
                    referralEarningsHtml += `<p style="color:#aaa;">No referrals yet. Share your referral link to earn more!</p>`;
                } else {
                    referrals.forEach(ref => {
                        referralEarningsHtml += `
                        <div class="user-row">
                            <strong>👤 ${ref.username}</strong> | Code: ${ref.referral_code || 'N/A'}
                        </div>`;
                    });
                }
            } else {
                referralEarningsHtml += `<p style="color:#aaa;">Complete a Gmail task to generate your referral code.</p>`;
            }

            let logsHtml = `<h3>📊 Interaction Logs & Tracking Reports</h3>`;
            if (logs.length === 0) {
                logsHtml += `<p style="color:#aaa;">No historical interaction traces found for your node account.</p>`;
            } else {
                logs.forEach(l => {
                    let statusLabel = '';
                    if(l.status === 'Success') statusLabel = `<span class="badge-success">Approved</span>`;
                    else if(l.status === 'Pending') statusLabel = `<span class="badge-pending">Pending Audit</span>`;
                    else statusLabel = `<span class="badge-fail">Rejected</span>`;
                    
                    logsHtml += `
                    <div class="user-row" style="border-left-color: ${l.status==='Success'?'#45a29e':l.status==='Pending'?'#f0ad4e':'#ff4d4d'}">
                        <strong>🎯 Task Container:</strong> ${l.task_name} <br>
                        <strong>🔑 Proof Value Submitted:</strong> <span style="color:#66fcf1;">${l.proof_data}</span> <br>
                        <strong>🕒 Timestamp Matrix:</strong> ${l.timestamp} <br>
                        <strong>🚦 Current Pipeline Status:</strong> ${statusLabel} | <strong>💰 Value:</strong> $${parseFloat(l.amount || 0.50).toFixed(2)}
                    </div>`;
                });
            }

            res.send(htmlWrapper(req, 'Worker Dashboard', `
                <h3 style="margin-top:0;">Welcome System Worker, ${username}!</h3>
                ${statsHtml}
                ${countrySelectorHtml}
                <div class="navbar">
                    <button class="nav-tab active" onclick="switchSection('worker-tasks')">🎯 Core Portal Tasks</button>
                    <button class="nav-tab" onclick="switchSection('worker-gmail')">📧 Gmail Task</button>
                    <button class="nav-tab" onclick="switchSection('worker-gmail-history')">📋 Gmail History</button>
                    <button class="nav-tab" onclick="switchSection('worker-referrals')">🔗 Referrals</button>
                    <button class="nav-tab" onclick="switchSection('worker-notifs')">🔔 Alerts Center ${unreadCount > 0 ? `<span class="notif-badge">${unreadCount}</span>` : ''}</button>
                    <button class="nav-tab" onclick="switchSection('worker-logs')">📊 Interaction Logs</button>
                </div>
                <div id="worker-tasks" class="dashboard-section active">${cpaTasksHtml}</div>
                <div id="worker-gmail" class="dashboard-section">${gmailTaskHtml}</div>
                <div id="worker-gmail-history" class="dashboard-section">${gmailHistoryHtml}</div>
                <div id="worker-referrals" class="dashboard-section">${referralEarningsHtml}</div>
                <div id="worker-notifs" class="dashboard-section">${userNotifFeedHtml}</div>
                <div id="worker-logs" class="dashboard-section">${logsHtml}</div>
            `));
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Dashboard Failure Mode Triggered.");
    }
});

// Gmail Task submission
app.post('/submit-gmail-task', async (req, res) => {
    if (!req.session.user || req.session.user === 'admin' || req.session.user === 'buyer') return res.redirect('/');
    const { email_created, password_created } = req.body;
    const username = req.session.user;
    const timeStr = new Date().toLocaleString();
    
    try {
        const userRow = await sql`SELECT * FROM users WHERE username = ${username}`;
        if (!userRow || userRow.length === 0) return res.redirect('/logout');
        
        const userCountry = userRow[0].country || 'LK';
        const gmailPriceSetting = userCountry === 'LK' ? 'gmail_task_price_lk' : 'gmail_task_price_intl';
        const gmailPrice = parseFloat((await dbGetSetting(gmailPriceSetting))?.value || 0.25);
        
        const taskCode = await generateTaskCode(username);
        
        await sql`INSERT INTO gmail_tasks (username, email_created, password_created, task_code, status, amount, timestamp) 
                   VALUES (${username}, ${email_created}, ${password_created}, ${taskCode}, 'Pending', ${gmailPrice}, ${timeStr})`;
        
        await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${username}, ${'📧 Your Gmail task [' + email_created + '] has been submitted with code ' + taskCode + '. Pending buyer review.'}, ${timeStr}, 0)`;
        await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES ('admin', ${'📧 New Gmail submission from ' + username + ': ' + email_created + ' (Code: ' + taskCode + ')'}, ${timeStr}, 0)`;
        await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES ('buyer', ${'📧 New Gmail from ' + username + ': ' + email_created + ' (Code: ' + taskCode + ')'}, ${timeStr}, 0)`;
        
        res.send("<script>alert('Gmail task submitted successfully!'); window.location.href='/dashboard';</script>");
    } catch(e) { 
        console.error(e);
        res.redirect('/dashboard'); 
    }
});

// Update country
app.post('/update-country', async (req, res) => {
    if (!req.session.user || req.session.user === 'admin' || req.session.user === 'buyer') return res.redirect('/');
    const { country } = req.body;
    try {
        await sql`UPDATE users SET country = ${country} WHERE username = ${req.session.user}`;
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

// Admin: Update Gmail settings
app.post('/update-gmail-settings', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { gmail_price_lk, gmail_price_intl, instructions_en, instructions_si, instructions_ta } = req.body;
    try {
        await sql`UPDATE system_settings SET value = ${gmail_price_lk} WHERE key = 'gmail_task_price_lk'`;
        await sql`UPDATE system_settings SET value = ${gmail_price_intl} WHERE key = 'gmail_task_price_intl'`;
        await sql`UPDATE system_settings SET value = ${instructions_en} WHERE key = 'gmail_task_instructions_en'`;
        await sql`UPDATE system_settings SET value = ${instructions_si} WHERE key = 'gmail_task_instructions_si'`;
        await sql`UPDATE system_settings SET value = ${instructions_ta} WHERE key = 'gmail_task_instructions_ta'`;
        res.send("<script>alert('Gmail task settings updated!'); window.location.href='/dashboard?tab=gmail-settings';</script>");
    } catch(e) { res.redirect('/dashboard'); }
});

// Admin: Update Referral settings
app.post('/update-referral-settings', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { tier1, tier2, tier3, tier4, tier5, tier6 } = req.body;
    try {
        await sql`UPDATE system_settings SET value = ${tier1} WHERE key = 'referral_commission_tier1'`;
        await sql`UPDATE system_settings SET value = ${tier2} WHERE key = 'referral_commission_tier2'`;
        await sql`UPDATE system_settings SET value = ${tier3} WHERE key = 'referral_commission_tier3'`;
        await sql`UPDATE system_settings SET value = ${tier4} WHERE key = 'referral_commission_tier4'`;
        await sql`UPDATE system_settings SET value = ${tier5} WHERE key = 'referral_commission_tier5'`;
        await sql`UPDATE system_settings SET value = ${tier6} WHERE key = 'referral_commission_tier6'`;
        res.send("<script>alert('Referral commission settings updated!'); window.location.href='/dashboard?tab=referral-settings';</script>");
    } catch(e) { res.redirect('/dashboard'); }
});

// SYSTEM INTERACTION ENDPOINTS
app.post('/submit-task-proof', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { task_name, proof_data } = req.body;
    try {
        const user = req.session.user;
        const timeStr = new Date().toLocaleString();
        await sql`INSERT INTO task_logs (username, task_name, proof_data, amount, status, timestamp) 
                   VALUES (${user}, ${task_name}, ${proof_data}, 0.50, 'Pending', ${timeStr})`;
        
        await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${user}, ${'⏳ Your proof verification data for [' + task_name + '] has been submitted and is currently pending audit.'}, ${timeStr}, 0)`;

        res.send("<script>alert('Task proof transmitted successfully.'); window.location.href='/dashboard';</script>");
    } catch(e) { res.redirect('/dashboard'); }
});

app.get('/mark-notif-read', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const notifId = parseInt(req.query.id);
    try {
        await sql`UPDATE notifications SET is_read = 1 WHERE id = ${notifId} AND (target_user = ${req.session.user} OR target_user = 'all')`;
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

app.get('/approve-task', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const logId = parseInt(req.query.id);
    try {
        const logRow = await sql`SELECT * FROM task_logs WHERE id = ${logId}`;
        if(logRow.length > 0 && logRow[0].status === 'Pending') {
            const task = logRow[0];
            const timeStr = new Date().toLocaleString();
            
            await sql`UPDATE task_logs SET status = 'Success' WHERE id = ${logId}`;
            await sql`UPDATE users SET balance_numeric = balance_numeric + ${task.amount} WHERE username = ${task.username}`;
            
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${task.username}, ${'🎉 Congratulations! Your proof for the task [' + task.task_name + '] was approved. $' + parseFloat(task.amount).toFixed(2) + ' has been successfully credited to your balance ledger.'}, ${timeStr}, 0)`;
        }
        res.redirect('/dashboard?tab=task-reviews');
    } catch(e) { res.redirect('/dashboard'); }
});

app.get('/reject-task', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const logId = parseInt(req.query.id);
    try {
        const logRow = await sql`SELECT * FROM task_logs WHERE id = ${logId}`;
        if(logRow.length > 0 && logRow[0].status === 'Pending') {
            const task = logRow[0];
            const timeStr = new Date().toLocaleString();

            await sql`UPDATE task_logs SET status = 'Failed' WHERE id = ${logId}`;
            
            await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${task.username}, ${'❌ Access Verification Refused: Your proof submission for [' + task.task_name + '] was audited and rejected. Please re-submit valid info.'}, ${timeStr}, 0)`;
        }
        res.redirect('/dashboard?tab=task-reviews');
    } catch(e) { res.redirect('/dashboard'); }
});

app.post('/send-notification', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { target_user, message } = req.body;
    try {
        const timeStr = new Date().toLocaleString();
        await sql`INSERT INTO notifications (target_user, message, timestamp, is_read) VALUES (${target_user}, ${message}, ${timeStr}, 0)`;
        res.send("<script>alert('Notification deployed!'); window.location.href='/dashboard';</script>");
    } catch(e) { res.redirect('/dashboard'); }
});

app.get('/remove-user', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const userId = parseInt(req.query.id);
    try {
        const targetUsrRow = await sql`SELECT username FROM users WHERE id = ${userId}`;
        if(targetUsrRow.length > 0){
            const tgtName = targetUsrRow[0].username;
            await sql`DELETE FROM task_logs WHERE username = ${tgtName}`;
            await sql`DELETE FROM gmail_tasks WHERE username = ${tgtName}`;
            await sql`DELETE FROM notifications WHERE target_user = ${tgtName}`;
        }
        await sql`DELETE FROM users WHERE id = ${userId}`;
        res.redirect('/dashboard?tab=user-metrics');
    } catch(e) { res.redirect('/dashboard'); }
});

app.post('/add-cpa', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { network_name, embed_code, instructions_en, instructions_si, instructions_ta } = req.body;
    try {
        await sql`INSERT INTO cpa_configs (network_name, embed_code, instructions_en, instructions_si, instructions_ta, is_active) 
                   VALUES (${network_name}, ${embed_code}, ${instructions_en}, ${instructions_si}, ${instructions_ta}, 1)`;
        res.redirect('/dashboard');
    } catch(e) { res.redirect('/dashboard'); }
});

app.get('/remove-cpa', async (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const cpaId = parseInt(req.query.id);
    try {
        await sql`DELETE FROM cpa_configs WHERE id = ${cpaId}`;
        res.redirect('/dashboard?tab=admin-tasks');
    } catch(e) { res.redirect('/dashboard'); }
});

module.exports = app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Galaxy Platform running on port ${PORT}`); });
