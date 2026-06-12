const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');
const multer = require('multer');

// Neon Database Connection
const sql = neon(process.env.DATABASE_URL);

const app = express();

// Multer Memory Storage - No disk needed
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// Serve proof images from database
app.get('/proof-image/:id', async (req, res) => {
    try {
        const rows = await sql(`SELECT file_data FROM payment_proofs WHERE id = $1`, [req.params.id]);
        if (rows.length > 0 && rows[0].file_data) {
            const img = Buffer.from(rows[0].file_data, 'base64');
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(img);
        } else {
            res.status(404).send('Not found');
        }
    } catch(e) { res.status(500).send('Error'); }
});

// DB Init
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
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'LK'`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50)`);
        } catch(e) { console.log("Migration note:", e.message); }

        await sql(`CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY, username VARCHAR(50), task_name VARCHAR(100),
            proof_data TEXT, amount NUMERIC(10,2) DEFAULT 0.50, status VARCHAR(20), timestamp VARCHAR(50)
        )`);
        await sql(`CREATE TABLE IF NOT EXISTS cpa_configs (
            id SERIAL PRIMARY KEY, network_name VARCHAR(100), embed_code TEXT,
            instructions_en TEXT, instructions_si TEXT, instructions_ta TEXT, is_active INTEGER DEFAULT 1
        )`);
        await sql(`CREATE TABLE IF NOT EXISTS system_settings (key VARCHAR(100) PRIMARY KEY, value TEXT)`);
        await sql(`INSERT INTO system_settings VALUES ('global_earnings_percentage','100') ON CONFLICT DO NOTHING`);
        await sql(`INSERT INTO system_settings VALUES ('google_sheet_config','') ON CONFLICT DO NOTHING`);
        await sql(`INSERT INTO system_settings VALUES ('gmail_task_price_lk','0.25') ON CONFLICT DO NOTHING`);
        await sql(`INSERT INTO system_settings VALUES ('gmail_task_price_intl','0.25') ON CONFLICT DO NOTHING`);
        await sql(`INSERT INTO system_settings VALUES ('gmail_task_instructions_en','Create a new Gmail account using unique username and strong password.') ON CONFLICT DO NOTHING`);
        await sql(`INSERT INTO system_settings VALUES ('gmail_task_instructions_si','නව Gmail ගිණුමක් සාදන්න.') ON CONFLICT DO NOTHING`);
        await sql(`INSERT INTO system_settings VALUES ('gmail_task_instructions_ta','புதிய Gmail கணக்கை உருவாக்கவும்.') ON CONFLICT DO NOTHING`);
        for(let i=1; i<=6; i++) await sql(`INSERT INTO system_settings VALUES ('referral_commission_tier${i}','${[4,5,6,7,10,15][i-1]}') ON CONFLICT DO NOTHING`);

        await sql(`CREATE TABLE IF NOT EXISTS gmail_tasks (
            id SERIAL PRIMARY KEY, username VARCHAR(50), email_created VARCHAR(100),
            password_created VARCHAR(50), task_code VARCHAR(50), status VARCHAR(20) DEFAULT 'Pending',
            amount NUMERIC(10,2) DEFAULT 0.25, referral_commission_paid INTEGER DEFAULT 0,
            buyer_reason TEXT, timestamp VARCHAR(50)
        )`);
        await sql(`CREATE TABLE IF NOT EXISTS payment_proofs (
            id SERIAL PRIMARY KEY, buyer_username VARCHAR(50), file_data TEXT,
            original_name VARCHAR(255), timestamp VARCHAR(50), is_deleted INTEGER DEFAULT 0
        )`);
        await sql(`CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY, target_user VARCHAR(50), message TEXT,
            timestamp VARCHAR(50), is_read INTEGER DEFAULT 0
        )`);
        try { await sql(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read INTEGER DEFAULT 0`); } catch(e) {}

        const b = await sql(`SELECT * FROM users WHERE username='buyer'`);
        if(!b.length) await sql(`INSERT INTO users(username,password,email,address,contact,balance_numeric) VALUES('buyer','buyer123','buyer@galaxy.com','-','-',0)`);
        console.log("DB Initialized");
    } catch(e) { console.error("DB Error:", e); }
}

let init = false;
app.use(async (req,res,next)=>{ if(!init){ await initDb(); init=true; } next(); });

async function getSetting(k){ try{ const r=await sql`SELECT value FROM system_settings WHERE key=${k}`; return r.length?r[0].value:null; }catch(e){return null;} }

async function backupSheet(u,e,b,t){ 
    const s=await getSetting('google_sheet_config'); if(!s) return;
    try{
        const c=JSON.parse(s); if(!c.client_email||!c.private_key||!c.spreadsheet_id) return;
        const a=new google.auth.JWT(c.client_email,null,c.private_key.replace(/\\n/g,'\n'),['https://www.googleapis.com/auth/spreadsheets']);
        const sh=google.sheets({version:'v4',auth:a});
        await sh.spreadsheets.values.append({spreadsheetId:c.spreadsheet_id,range:'Sheet1!A:E',valueInputOption:'USER_ENTERED',resource:{values:[[new Date().toISOString(),u,e,b,t]]}});
    }catch(e){}
}

async function genCode(uname){
    const p=uname.split(' '); let ini=(p.length>=2?p[0][0]+p[1][0]:uname.substring(0,2)).toUpperCase();
    const ur=await sql`SELECT referred_by,referral_code FROM users WHERE username=${uname}`;
    let pre=ini;
    if(ur.length&&ur[0].referred_by){
        const rr=await sql`SELECT referral_code FROM users WHERE username=${ur[0].referred_by}`;
        if(rr.length&&rr[0].referral_code) pre=rr[0].referral_code+'/'+ini;
    }
    const cr=await sql`SELECT COUNT(*) as c FROM gmail_tasks WHERE username=${uname}`;
    const seq=String(parseInt(cr[0].c)+1).padStart(3,'0');
    if(ur.length&&!ur[0].referral_code) await sql`UPDATE users SET referral_code=${ini} WHERE username=${uname}`;
    return pre+'-'+seq;
}

const t = {
    en:{title:"GALAXY WORKERS",login:"Worker Login",reg:"Worker Registration",user:"Username",pass:"Password",email:"Email Address",addr:"Full Address",phone:"Contact Number",btnLog:"LOG IN",btnReg:"REGISTER",noAcc:"No account?",regHere:"Register here",backLog:"Back to Login",welcome:"Welcome",total:"Total Earnings",tasks:"Available Tasks 👇",subText:"Complete tasks below.",logout:"Logout",forgot:"Forgot?",recoverTitle:"Recover",btnRecover:"RECOVER",notifTitle:"Notifications",gmailTask:"📧 Gmail Task",gmailInstr:"Create Gmail & submit.",emailCreated:"Email",emailPass:"Password",submitGmail:"Submit",yourCode:"Your Code",getRefLink:"Get Referral Link",refLink:"Your Referral Link",copyRef:"Copy",selectCountry:"Select Country",countryLK:"Sri Lanka 🇱🇰",countryINTL:"International 🌍",gmailPrice:"Price/Gmail",gmailHistory:"Gmail History",referralEarnings:"Referral Earnings",buyerLogin:"Buyer Login",buyerDashboard:"Buyer Panel",buyerWelcome:"Welcome",allPaymentsDone:"ALL PAID",paymentProof:"Proof Upload",uploadProof:"Upload",done:"DONE",wrong:"WRONG",reason:"Reason",submitReason:"Send",paymentReady:"Pay Ready",totalGmails:"Total",pendingGmails:"Pending",approvedGmails:"Done",rejectedGmails:"Wrong"},
    si:{title:"GALAXY WORKERS",login:"සේවක ඇතුල්වීම",reg:"ලියාපදිංචිය",user:"පරිශීලක නාමය",pass:"මුරපදය",email:"ඊමේල්",addr:"ලිපිනය",phone:"දුරකථන",btnLog:"ඇතුල් වන්න",btnReg:"ලියාපදිංචි වන්න",noAcc:"ගිණුමක් නැද්ද?",regHere:"ලියාපදිංචි වන්න",backLog:"ආපසු",welcome:"ආයුබෝවන්",total:"මුළු ඉපැයීම",tasks:"Tasks 👇",subText:"පහත tasks කරන්න.",logout:"ඉවත් වන්න",forgot:"මුරපදය අමතකද?",recoverTitle:"මුරපදය ලබාගන්න",btnRecover:"ලබාගන්න",notifTitle:"දැනුම්දීම්",gmailTask:"📧 Gmail Task",gmailInstr:"Gmail සාදන්න.",emailCreated:"ඊමේල්",emailPass:"මුරපදය",submitGmail:"යොමු කරන්න",yourCode:"කේතය",getRefLink:"Referral Link",refLink:"ඔබේ Link",copyRef:"Copy",selectCountry:"රට තෝරන්න",countryLK:"ලංකාව 🇱🇰",countryINTL:"විදෙස් 🌍",gmailPrice:"මිල",gmailHistory:"ඉතිහාසය",referralEarnings:"Referral",buyerLogin:"ගැනුම්කරු",buyerDashboard:"Buyer",buyerWelcome:"ආයුබෝවන්",allPaymentsDone:"සියලු ගෙවීම්",paymentProof:"ගෙවීම් සාක්ෂි",uploadProof:"Upload",done:"හරි",wrong:"වැරදි",reason:"හේතුව",submitReason:"යවන්න",paymentReady:"ගෙවීම් සූදානම්",totalGmails:"මුළු",pendingGmails:"පොරොත්තු",approvedGmails:"අනුමත",rejectedGmails:"ප්රතික්ෂේපිත"},
    ta:{title:"GALAXY WORKERS",login:"உள்நுழைவு",reg:"பதிவு",user:"பயனர்பெயர்",pass:"கடவுச்சொல்",email:"மின்னஞ்சல்",addr:"முகவரி",phone:"தொலைபேசி",btnLog:"உள்நுழைக",btnReg:"பதிவு செய்க",noAcc:"கணக்கு இல்லையா?",regHere:"பதிவு செய்க",backLog:"திரும்ப",welcome:"வரவேற்கிறோம்",total:"மொத்தம்",tasks:"பணிகள் 👇",subText:"பணிகளை முடிக்கவும்.",logout:"வெளியேறு",forgot:"மறந்துவிட்டதா?",recoverTitle:"மீட்டெடு",btnRecover:"மீட்டெடு",notifTitle:"அறிவிப்புகள்",gmailTask:"📧 Gmail",gmailInstr:"Gmail உருவாக்கு.",emailCreated:"மின்னஞ்சல்",emailPass:"கடவுச்சொல்",submitGmail:"சமர்ப்பி",yourCode:"குறியீடு",getRefLink:"பரிந்துரை இணைப்பு",refLink:"உங்கள் இணைப்பு",copyRef:"நகலெடு",selectCountry:"நாடு தேர்வு",countryLK:"இலங்கை 🇱🇰",countryINTL:"சர்வதேச 🌍",gmailPrice:"விலை",gmailHistory:"வரலாறு",referralEarnings:"பரிந்துரை",buyerLogin:"வாங்குபவர்",buyerDashboard:"Buyer",buyerWelcome:"வரவேற்கிறோம்",allPaymentsDone:"அனைத்தும் செலுத்தப்பட்டது",paymentProof:"சான்று",uploadProof:"பதிவேற்று",done:"சரி",wrong:"தவறு",reason:"காரணம்",submitReason:"அனுப்பு",paymentReady:"கட்டணம் தயார்",totalGmails:"மொத்தம்",pendingGmails:"நிலுவை",approvedGmails:"ஒப்புதல்",rejectedGmails:"நிராகரிப்பு"}
};

const wrap = (req,title,body)=>{
    const l=req.session.lang||'en'; const tr=t[l];
    return `<!DOCTYPE html><html lang="${l}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title><style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:15px;margin:0}
        .container{max-width:900px;margin:20px auto;background:#1f2833;padding:20px;border-radius:10px;border:1px solid #45a29e;box-sizing:border-box}
        .header-block{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #45a29e;padding-bottom:15px;flex-wrap:wrap;gap:10px}
        .header-title{color:#66fcf1;margin:0;font-size:24px;font-weight:bold}
        .header-actions{display:flex;align-items:center;gap:10px}
        .lang-selector select{background:#0b0c10;color:#66fcf1;border:1px solid #45a29e;padding:6px 10px;border-radius:5px;cursor:pointer;font-weight:bold}
        input,textarea,select.form-input{width:100%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;box-sizing:border-box}
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px}
        button:hover{background:#66fcf1}
        .user-row{background:#0b0c10;padding:15px;margin:12px 0;border-radius:5px;border-left:5px solid #45a29e}
        a{color:#66fcf1;text-decoration:none}
        .logout-btn{background:#ff4d4d;color:#fff;padding:6px 14px;font-size:13px;font-weight:bold;border-radius:4px;text-decoration:none;border:none;cursor:pointer}
        .logout-btn:hover{background:#cc3333}
        .remove-btn-styled{background:#ff4d4d;color:white;padding:8px 14px;font-size:12px;font-weight:bold;cursor:pointer;border-radius:4px;text-decoration:none;border:none;display:inline-block;margin-top:10px}
        .remove-btn-styled:hover{background:#cc3333}
        .galaxy-secure-node-wrapper{background:#111a24;padding:20px;border-radius:8px;border:2px solid #45a29e;margin:25px 0;box-sizing:border-box;text-align:center}
        .galaxy-task-card-white{background:#fff;color:#333;padding:25px;border-radius:8px;border:1px solid #ddd;margin:15px auto;max-width:500px;text-align:center}
        .galaxy-task-card-white h4{color:#1f2833;margin:0 0 10px 0;font-size:18px}
        .galaxy-start-btn{display:inline-block;width:85%;padding:12px;background:#2ecc71;color:#fff;font-weight:bold;text-decoration:none;border-radius:5px;font-size:15px}
        .navbar{display:flex;background:#0b0c10;border:1px solid #45a29e;border-radius:5px;margin-bottom:20px;flex-wrap:wrap}
        .nav-tab{flex:1;min-width:100px;text-align:center;padding:12px;color:#c5c6c7;font-weight:bold;cursor:pointer;background:#0b0c10;border:none;font-size:12px;position:relative}
        .nav-tab:hover{background:#1f2833;color:#66fcf1}
        .nav-tab.active{background:#45a29e;color:#0b0c10}
        .notif-badge{background:#ff4d4d;color:#fff;border-radius:50%;padding:2px 7px;font-size:11px;position:absolute;top:4px;right:8px}
        .dashboard-section{display:none}
        .dashboard-section.active{display:block}
        .stats-grid{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
        .stat-card{flex:1;min-width:calc(33%-12px);background:#0b0c10;border:1px solid #45a29e;padding:15px;border-radius:8px;text-align:center}
        @media(max-width:600px){.stat-card{min-width:100%}}
        .stat-card h3{margin:5px 0;color:#66fcf1;font-size:20px}
        .stat-card p{margin:0;color:#a5a6a7;font-size:11px}
        .badge-pending{background:#f0ad4e;color:#000;padding:2px 6px;border-radius:3px;font-size:11px}
        .badge-fail{background:#ff4d4d;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px}
        .badge-success{background:#45a29e;color:#0b0c10;padding:2px 6px;border-radius:3px;font-size:11px}
        .proof-form{background:#0b0c10;padding:12px;border-radius:5px;margin-top:10px;border:1px dashed #45a29e;text-align:left}
        .notif-box{background:#141d26;border:1px solid #45a29e;padding:15px;border-radius:6px;margin-bottom:15px;font-size:14px;color:#fff;border-left:5px solid #66fcf1;display:flex;justify-content:space-between;align-items:center;gap:10px}
        .notif-box.read{border-left-color:#555;opacity:.6}
        .notif-time{font-size:11px;color:#888;display:block;margin-top:5px}
        .notif-btn{background:#45a29e;color:#0b0c10;font-size:12px;font-weight:bold;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;width:auto;margin-top:0}
        .search-container{margin-bottom:15px;display:flex;gap:10px}
        .search-input{flex:1;padding:10px;background:#0b0c10;color:#fff;border:1px solid #45a29e;border-radius:5px}
        .search-btn{width:auto;padding:10px 20px;margin-top:0}
        .gmail-card{background:#0b0c10;padding:15px;border-radius:8px;border:1px solid #45a29e;margin:10px 0}
        .ref-link-box{background:#141d26;padding:10px;border-radius:5px;margin:10px 0;display:flex;gap:10px;align-items:center}
        .ref-link-box input{flex:1;margin:0}
        .ref-link-box button{width:auto;margin:0;padding:10px 20px}
        .buyer-action-btns{display:flex;gap:10px;margin-top:10px}
        .buyer-action-btns a,.buyer-action-btns form{flex:1}
        .btn-done{background:#2ecc71;color:#fff;padding:8px;border-radius:4px;text-decoration:none;display:block;text-align:center}
        .btn-wrong{background:#ff4d4d;color:#fff;padding:8px;border:none;border-radius:4px;cursor:pointer;width:100%}
        .payment-ready-btn{background:#f39c12;color:#fff;animation:glow 2s infinite;padding:8px;border-radius:4px;text-decoration:none;display:block;text-align:center}
        @keyframes glow{0%{box-shadow:0 0 5px #f39c12}50%{box-shadow:0 0 20px #f39c12}100%{box-shadow:0 0 5px #f39c12}}
    </style><script>
        function switchSection(id){
            document.querySelectorAll('.dashboard-section').forEach(s=>s.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            event.target.classList.add('active');
        }
        function copyRef(){document.getElementById('refLinkInput').select();document.execCommand('copy');alert('Copied!');}
        window.onload=function(){const p=new URLSearchParams(window.location.search);if(p.get('tab'))document.getElementById('btn-'+p.get('tab'))?.click();}
    </script></head><body><div class="container">
    <div class="header-block"><h2 class="header-title">${tr.title}</h2>
    <div class="header-actions">
    <div class="lang-selector"><select onchange="location.href='/change-lang?lang='+this.value">
        <option value="en" ${l==='en'?'selected':''}>English</option>
        <option value="si" ${l==='si'?'selected':''}>සිංහල</option>
        <option value="ta" ${l==='ta'?'selected':''}>தமிழ்</option>
    </select></div><a href="/logout" class="logout-btn">${tr.logout}</a></div></div>${body}</div></body></html>`;
};

app.get('/change-lang',(req,res)=>{ if(['en','si','ta'].includes(req.query.lang)) req.session.lang=req.query.lang; res.redirect(req.get('referer')||'/'); });

// AUTH ROUTES
app.get('/',(req,res)=>{
    if(req.session.user) return req.session.user==='buyer'?res.redirect('/buyer-dashboard'):res.redirect('/dashboard');
    const tr=t[req.session.lang||'en'];
    res.send(wrap(req,'Login',`<h3>${tr.login}</h3><form action="/login" method="POST">
        <input name="username" placeholder="${tr.user}" required>
        <input type="password" name="password" placeholder="${tr.pass}" required>
        <button>${tr.btnLog}</button></form>
        <p style="text-align:center;margin-top:15px">${tr.noAcc} <a href="/register">${tr.regHere}</a><br><br>
        <a href="/forgot-password" style="color:#ff4d4d">${tr.forgot}</a></p>
        <p style="text-align:center"><a href="/buyer-login" style="color:#f39c12">${tr.buyerLogin}</a></p>`));
});

app.get('/register',(req,res)=>{
    const tr=t[req.session.lang||'en']; const ref=req.query.ref||'';
    res.send(wrap(req,'Register',`<h3>${tr.reg}</h3><form action="/register" method="POST">
        <input name="username" placeholder="${tr.user}" required>
        <input type="password" name="password" placeholder="${tr.pass}" required>
        <input type="email" name="email" placeholder="${tr.email}" required>
        <input name="address" placeholder="${tr.addr}" required>
        <input name="contact" placeholder="${tr.phone}" required>
        <input type="hidden" name="ref_code" value="${ref}"><button>${tr.btnReg}</button></form>
        <p style="text-align:center"><a href="/">${tr.backLog}</a></p>`));
});

app.post('/register',async(req,res)=>{
    const {username,password,email,address,contact,ref_code}=req.body;
    try{
        const ex=await sql`SELECT * FROM users WHERE LOWER(username)=${username.toLowerCase()}`;
        if(ex.length) return res.send("<script>alert('Username exists!');location.href='/register'</script>");
        let refBy=null;
        if(ref_code?.trim()){ const r=await sql`SELECT username FROM users WHERE referral_code=${ref_code.trim()}`; if(r.length) refBy=r[0].username; }
        await sql`INSERT INTO users(username,password,email,address,contact,balance_numeric,earnings_percentage,referred_by) VALUES(${username},${password},${email},${address},${contact},0,100,${refBy})`;
        const ts=new Date().toLocaleString();
        await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${username},'👋 Welcome to Galaxy!',${ts},0)`;
        if(refBy) await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${refBy},'🎉 New referral: ${username} joined!',${ts},0)`;
        backupSheet(username,email,0,0).catch(()=>{});
        res.send("<script>alert('Registered!');location.href='/'</script>");
    }catch(e){console.error(e);res.send("<script>alert('Error');location.href='/register'</script>");}
});

app.post('/login',async(req,res)=>{
    const {username,password}=req.body;
    if(username==='admin'&&password==='admin123'){ req.session.user='admin'; return res.redirect('/dashboard'); }
    if(username==='buyer'&&password==='buyer123'){ req.session.user='buyer'; return res.redirect('/buyer-dashboard'); }
    try{
        const u=await sql`SELECT * FROM users WHERE username=${username} AND password=${password}`;
        if(u.length){ req.session.user=u[0].username; res.redirect('/dashboard'); }
        else res.send("<script>alert('Invalid!');location.href='/'</script>");
    }catch(e){res.send("<script>alert('Error');location.href='/'</script>");}
});

app.get('/buyer-login',(req,res)=>{
    const tr=t[req.session.lang||'en'];
    res.send(wrap(req,'Buyer Login',`<h3>${tr.buyerLogin}</h3><form action="/login" method="POST">
        <input name="username" value="buyer" required><input type="password" name="password" required>
        <button>${tr.btnLog}</button></form><p style="text-align:center"><a href="/">${tr.backLog}</a></p>`));
});

app.get('/logout',(req,res)=>{ req.session.destroy(); res.redirect('/'); });

// BUYER DASHBOARD
app.get('/buyer-dashboard',async(req,res)=>{
    if(!req.session.user||req.session.user!=='buyer') return res.redirect('/buyer-login');
    const tr=t[req.session.lang||'en'];
    try{
        const gmailTasks=await sql`SELECT * FROM gmail_tasks ORDER BY id DESC`;
        const grouped={}; gmailTasks.forEach(t=>{ if(!grouped[t.task_code]) grouped[t.task_code]=[]; grouped[t.task_code].push(t); });
        let html=`<h3>📧 Gmail Submissions</h3>`;
        if(!gmailTasks.length) html+=`<p style="color:#aaa">No submissions yet.</p>`;
        else for(const [code,tasks] of Object.entries(grouped)){
            html+=`<div style="margin-bottom:20px;border:1px solid #45a29e;padding:15px;border-radius:8px"><h4 style="color:#66fcf1">📋 Code: ${code}</h4>`;
            tasks.forEach(task=>{
                const sb=task.status==='Success'?'<span class="badge-success">Approved</span>':task.status==='Pending'?'<span class="badge-pending">Pending</span>':task.status==='PaymentReady'?'<span style="background:#f39c12;color:#fff;padding:2px 6px;border-radius:3px">Pay Ready</span>':'<span class="badge-fail">Wrong</span>';
                html+=`<div class="gmail-card"><p><strong>📧 Email:</strong> ${task.email_created}</p><p><strong>🔑 Password:</strong> ${task.password_created}</p><p><strong>💰 Amount:</strong> $${parseFloat(task.amount).toFixed(2)}</p><p><strong>Status:</strong> ${sb}</p><p><strong>Time:</strong> ${task.timestamp}</p>${task.buyer_reason?`<p style="color:#ff4d4d"><strong>Reason:</strong> ${task.buyer_reason}</p>`:''}`;
                if(task.status==='Pending') html+=`<div class="buyer-action-btns"><a href="/buyer-mark-done?id=${task.id}" class="btn-done">${tr.done}</a><form action="/buyer-mark-wrong" method="POST"><input type="hidden" name="task_id" value="${task.id}"><input name="reason" placeholder="${tr.reason}" required style="width:100%;margin:0 0 5px"><button class="btn-wrong">${tr.wrong}</button></form></div>`;
                if(task.status==='Success') html+=`<a href="/buyer-mark-payment-ready?id=${task.id}" class="payment-ready-btn">${tr.paymentReady}</a>`;
                html+=`</div>`;
            });
            html+=`</div>`;
        }
        const proofs=await sql`SELECT * FROM payment_proofs WHERE buyer_username='buyer' AND is_deleted=0 ORDER BY id DESC`;
        let pHtml=`<h3>${tr.paymentProof}</h3><form action="/upload-payment-proof" method="POST" enctype="multipart/form-data"><input type="file" name="payment_proof" accept="image/*" required><button>${tr.uploadProof}</button></form>`;
        if(!proofs.length) pHtml+=`<p style="color:#aaa">No proofs.</p>`;
        else proofs.forEach(p=>{ pHtml+=`<div style="background:#0b0c10;padding:10px;border-radius:5px;margin:10px 0;border:1px solid #45a29e"><img src="/proof-image/${p.id}" style="max-width:100%;border-radius:5px"><p style="font-size:12px;color:#888">${p.timestamp}</p><a href="/delete-payment-proof?id=${p.id}" style="color:#ff4d4d;font-size:12px">Delete</a></div>`; });
        const tot=gmailTasks.length,pen=gmailTasks.filter(t=>t.status==='Pending').length,app=gmailTasks.filter(t=>t.status==='Success'||t.status==='PaymentReady').length,rej=gmailTasks.filter(t=>t.status==='Failed').length;
        res.send(wrap(req,'Buyer Dashboard',`<h3>${tr.buyerWelcome}</h3>
        <div class="stats-grid"><div class="stat-card"><h3>${tot}</h3><p>${tr.totalGmails}</p></div><div class="stat-card"><h3>${pen}</h3><p>${tr.pendingGmails}</p></div><div class="stat-card"><h3>${app}</h3><p>${tr.approvedGmails}</p></div><div class="stat-card"><h3>${rej}</h3><p>${tr.rejectedGmails}</p></div></div>
        <form action="/buyer-all-payments-done" method="POST"><button class="payment-ready-btn">💰 ${tr.allPaymentsDone}</button></form>
        ${pHtml}${html}`));
    }catch(e){console.error(e);res.status(500).send("Error");}
});

app.get('/buyer-mark-done',async(req,res)=>{
    if(req.session.user!=='buyer') return res.redirect('/');
    try{
        const tr=await sql`SELECT * FROM gmail_tasks WHERE id=${req.query.id}`;
        if(tr.length&&tr[0].status==='Pending'){
            const ts=new Date().toLocaleString();
            await sql`UPDATE gmail_tasks SET status='Success' WHERE id=${req.query.id}`;
            await sql`UPDATE users SET balance_numeric=balance_numeric+${tr[0].amount} WHERE username=${tr[0].username}`;
            if(tr[0].referral_commission_paid===0){
                const ur=await sql`SELECT referred_by FROM users WHERE username=${tr[0].username}`;
                if(ur.length&&ur[0].referred_by){
                    const cr=await sql`SELECT COUNT(*) as c FROM gmail_tasks WHERE username=${tr[0].username} AND status IN('Success','PaymentReady')`;
                    const c=parseInt(cr[0].c); let amt=4;
                    if(c>25) amt=15; else if(c>15) amt=10; else if(c>8) amt=7; else if(c>4) amt=6; else if(c>3) amt=5;
                    const usd=amt/300;
                    await sql`UPDATE users SET balance_numeric=balance_numeric+${usd} WHERE username=${ur[0].referred_by}`;
                    await sql`UPDATE gmail_tasks SET referral_commission_paid=1 WHERE id=${req.query.id}`;
                    await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${ur[0].referred_by},'💰 Commission $${usd.toFixed(2)} from ${tr[0].username}',${ts},0)`;
                }
            }
            await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${tr[0].username},'🎉 Gmail approved! +$${parseFloat(tr[0].amount).toFixed(2)}',${ts},0)`;
            await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES('admin','📧 Gmail #${req.query.id} DONE by buyer',${ts},0)`;
        }
        res.redirect('/buyer-dashboard');
    }catch(e){res.redirect('/buyer-dashboard');}
});

app.post('/buyer-mark-wrong',async(req,res)=>{
    if(req.session.user!=='buyer') return res.redirect('/');
    try{
        const tr=await sql`SELECT * FROM gmail_tasks WHERE id=${req.body.task_id}`;
        if(tr.length&&tr[0].status==='Pending'){
            const ts=new Date().toLocaleString();
            await sql`UPDATE gmail_tasks SET status='Failed',buyer_reason=${req.body.reason} WHERE id=${req.body.task_id}`;
            await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${tr[0].username},'❌ Gmail rejected: ${req.body.reason}',${ts},0)`;
            await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES('admin','📧 Gmail #${req.body.task_id} WRONG by buyer',${ts},0)`;
        }
        res.redirect('/buyer-dashboard');
    }catch(e){res.redirect('/buyer-dashboard');}
});

app.get('/buyer-mark-payment-ready',async(req,res)=>{
    if(req.session.user!=='buyer') return res.redirect('/');
    try{
        const tr=await sql`SELECT * FROM gmail_tasks WHERE id=${req.query.id}`;
        if(tr.length&&tr[0].status==='Success'){
            const ts=new Date().toLocaleString();
            await sql`UPDATE gmail_tasks SET status='PaymentReady' WHERE id=${req.query.id}`;
            await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${tr[0].username},'💵 Payment ready for ${tr[0].email_created}',${ts},0)`;
            await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES('admin','💰 Payment ready #${req.query.id}',${ts},0)`;
        }
        res.redirect('/buyer-dashboard');
    }catch(e){res.redirect('/buyer-dashboard');}
});

app.post('/buyer-all-payments-done',async(req,res)=>{
    if(req.session.user!=='buyer') return res.redirect('/');
    await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES('admin','💰 Buyer marked ALL PAYMENTS DONE',${new Date().toLocaleString()},0)`;
    res.send("<script>alert('Done!');location.href='/buyer-dashboard'</script>");
});

app.post('/upload-payment-proof',upload.single('payment_proof'),async(req,res)=>{
    if(req.session.user!=='buyer') return res.redirect('/');
    try{
        const b64=req.file.buffer.toString('base64');
        await sql`INSERT INTO payment_proofs(buyer_username,file_data,original_name,timestamp) VALUES('buyer',${b64},${req.file.originalname},${new Date().toLocaleString()})`;
        await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES('admin','💳 New payment proof uploaded',${new Date().toLocaleString()},0)`;
        res.redirect('/buyer-dashboard');
    }catch(e){res.redirect('/buyer-dashboard');}
});

app.get('/delete-payment-proof',async(req,res)=>{
    if(!['buyer','admin'].includes(req.session.user)) return res.redirect('/');
    await sql`UPDATE payment_proofs SET is_deleted=1 WHERE id=${req.query.id}`;
    res.redirect(req.session.user==='admin'?'/dashboard?tab=admin-payments':'/buyer-dashboard');
});

// WORKER DASHBOARD
app.get('/dashboard',async(req,res)=>{
    if(!req.session.user) return res.redirect('/');
    const uname=req.session.user; const l=req.session.lang||'en'; const tr=t[l];
    try{
        if(uname==='admin'){
            const users=await sql`SELECT * FROM users WHERE username NOT IN('admin','buyer')`;
            const cpas=await sql`SELECT * FROM cpa_configs`;
            const allLogs=await sql`SELECT * FROM task_logs ORDER BY id DESC`;
            const allGmail=await sql`SELECT * FROM gmail_tasks ORDER BY id DESC`;
            const allProofs=await sql`SELECT * FROM payment_proofs WHERE is_deleted=0 ORDER BY id DESC`;
            const gpl=await getSetting('gmail_task_price_lk')||'0.25';
            const gpi=await getSetting('gmail_task_price_intl')||'0.25';
            const gie=await getSetting('gmail_task_instructions_en')||'';
            const gis=await getSetting('gmail_task_instructions_si')||'';
            const git=await getSetting('gmail_task_instructions_ta')||'';
            const kw=req.query.search_keyword||'';
            let fu=users;
            if(kw.trim()){ const k=kw.toLowerCase(); fu=users.filter(u=>u.username.toLowerCase().includes(k)||u.email.toLowerCase().includes(k)||(u.contact||'').toLowerCase().includes(k)||(u.address||'').toLowerCase().includes(k)); }
            
            let logsHtml=`<h3>📩 Pending Submissions</h3>`;
            const pend=allLogs.filter(x=>x.status==='Pending');
            if(!pend.length) logsHtml+=`<p style="color:#aaa">None.</p>`;
            else pend.forEach(l=>{ logsHtml+=`<div class="user-row" style="border-left-color:#f0ad4e"><strong>${l.username}</strong> | ${l.task_name}<br>Proof: <span style="color:#66fcf1">${l.proof_data}</span><br>${l.timestamp}<br><a href="/approve-task?id=${l.id}" style="background:#45a29e;color:#000;padding:5px 12px;border-radius:4px;font-size:12px">APPROVE</a> <a href="/reject-task?id=${l.id}" style="background:#ff4d4d;color:#fff;padding:5px 12px;border-radius:4px;font-size:12px">REJECT</a></div>`; });

            let uHtml=`<h3>👥 Workers</h3><form method="GET" action="/dashboard" class="search-container"><input type="hidden" name="tab" value="user-metrics"><input name="search_keyword" value="${kw}" placeholder="Search..." class="search-input"><button class="search-btn">Search</button></form>`;
            fu.forEach(u=>{
                const ul=allLogs.filter(l=>l.username===u.username);
                const ug=allGmail.filter(g=>g.username===u.username);
                let tb='';
                ul.forEach(lg=>{ const sb=lg.status==='Success'?'<span class="badge-success">OK</span>':lg.status==='Pending'?'<span class="badge-pending">Pend</span>':'<span class="badge-fail">Fail</span>'; tb+=`<div style="font-size:12px">• ${lg.task_name} $${parseFloat(lg.amount||0).toFixed(2)} ${sb}</div>`; });
                ug.forEach(g=>{ const sb=g.status==='Success'?'<span class="badge-success">OK</span>':g.status==='Pending'?'<span class="badge-pending">Pend</span>':g.status==='PaymentReady'?'<span style="background:#f39c12;color:#fff;padding:2px 6px;border-radius:3px">Ready</span>':'<span class="badge-fail">Fail</span>'; tb+=`<div style="font-size:12px">📧 ${g.email_created} (${g.task_code}) ${sb}</div>`; });
                uHtml+=`<div class="user-row" style="border-left-color:#66fcf1"><div class="user-meta-block"><strong>👤 ${u.username}</strong><br>🔑 ${u.password}<br>📧 ${u.email}<br>📞 ${u.contact||'N/A'}<br>🏠 ${u.address||'N/A'}<br>🌍 ${u.country||'LK'}<br>🔗 Ref: ${u.referral_code||'N/A'}<br>👤 By: ${u.referred_by||'N/A'}<br>💰 $${parseFloat(u.balance_numeric||0).toFixed(2)}</div><div class="user-history-block">${tb||'<span style="color:#888">No activity</span>'}</div><a href="/remove-user?id=${u.id}" onclick="return confirm('Delete?')" class="remove-btn-styled">⚠️ DELETE</a></div>`;
            });

            let gHtml=`<h3>📧 Gmail Tasks</h3>`;
            if(!allGmail.length) gHtml+=`<p style="color:#aaa">None.</p>`;
            else allGmail.forEach(t=>{ const sb=t.status==='Success'?'<span class="badge-success">OK</span>':t.status==='Pending'?'<span class="badge-pending">Pend</span>':t.status==='PaymentReady'?'<span style="background:#f39c12;color:#fff;padding:2px 6px">Ready</span>':'<span class="badge-fail">Fail</span>'; gHtml+=`<div class="gmail-card"><p><strong>${t.username}</strong> | Code: ${t.task_code}</p><p>📧 ${t.email_created} | 🔑 ${t.password_created}</p><p>$${parseFloat(t.amount).toFixed(2)} | ${sb}</p>${t.buyer_reason?`<p style="color:#ff4d4d">Reason: ${t.buyer_reason}</p>`:''}<p style="font-size:11px;color:#888">${t.timestamp}</p></div>`; });

            let pHtml=`<h3>💳 Payment Proofs</h3>`;
            if(!allProofs.length) pHtml+=`<p style="color:#aaa">None.</p>`;
            else allProofs.forEach(p=>{ pHtml+=`<div style="background:#0b0c10;padding:10px;border-radius:5px;margin:10px 0"><img src="/proof-image/${p.id}" style="max-width:100%"><p style="font-size:12px;color:#888">${p.timestamp}</p><a href="/delete-payment-proof?id=${p.id}" style="color:#ff4d4d;font-size:12px">Delete</a></div>`; });

            const rt1=await getSetting('referral_commission_tier1')||'4';
            const rt2=await getSetting('referral_commission_tier2')||'5';
            const rt3=await getSetting('referral_commission_tier3')||'6';
            const rt4=await getSetting('referral_commission_tier4')||'7';
            const rt5=await getSetting('referral_commission_tier5')||'10';
            const rt6=await getSetting('referral_commission_tier6')||'15';

            res.send(wrap(req,'Admin',`
            <h3>Welcome Chief Admin</h3>
            <div class="navbar">
                <button id="btn-admin-panel" class="nav-tab active" onclick="switchSection('admin-panel')">⚙️ Panel</button>
                <button id="btn-task-reviews" class="nav-tab" onclick="switchSection('task-reviews')">📩 Subs(${pend.length})</button>
                <button id="btn-user-metrics" class="nav-tab" onclick="switchSection('user-metrics')">👥 Workers</button>
                <button id="btn-admin-tasks" class="nav-tab" onclick="switchSection('admin-tasks')">🎯 Tasks</button>
                <button id="btn-gmail-tasks" class="nav-tab" onclick="switchSection('gmail-tasks')">📧 Gmails</button>
                <button id="btn-admin-payments" class="nav-tab" onclick="switchSection('admin-payments')">💳 Proofs</button>
                <button id="btn-gmail-settings" class="nav-tab" onclick="switchSection('gmail-settings')">⚙️ Gmail</button>
                <button id="btn-referral-settings" class="nav-tab" onclick="switchSection('referral-settings')">💰 Ref</button>
            </div>
            <div id="admin-panel" class="dashboard-section active">
                <h3>📢 Notification</h3><form action="/send-notification" method="POST"><select name="target_user" class="form-input"><option value="all">📢 All</option>${users.map(u=>`<option value="${u.username}">👤 ${u.username}</option>`).join('')}</select><input name="message" placeholder="Message..." required><button>Send</button></form>
                <hr style="border-color:#45a29e;margin:20px 0"><h3>➕ Add Task</h3><form action="/add-cpa" method="POST"><input name="network_name" placeholder="Task Name" required><input name="embed_code" placeholder="URL" required><input name="instructions_en" placeholder="EN" required><input name="instructions_si" placeholder="SI" required><input name="instructions_ta" placeholder="TA" required><button>Add</button></form>
            </div>
            <div id="task-reviews" class="dashboard-section">${logsHtml}</div>
            <div id="user-metrics" class="dashboard-section">${uHtml}</div>
            <div id="admin-tasks" class="dashboard-section"><h3>🎯 Tasks</h3>${cpas.map(c=>`<div class="galaxy-secure-node-wrapper"><h4 style="color:#66fcf1">${c.network_name}</h4><p>${c.embed_code}</p><a href="/remove-cpa?id=${c.id}" style="color:#ff4d4d">Delete</a></div>`).join('')||'<p style="color:#aaa">None</p>'}</div>
            <div id="gmail-tasks" class="dashboard-section">${gHtml}</div>
            <div id="admin-payments" class="dashboard-section">${pHtml}</div>
            <div id="gmail-settings" class="dashboard-section"><h3>⚙️ Gmail Settings</h3><form action="/update-gmail-settings" method="POST"><label>Price LK USD:</label><input type="number" step="0.01" name="gmail_price_lk" value="${gpl}"><label>Price INTL USD:</label><input type="number" step="0.01" name="gmail_price_intl" value="${gpi}"><label>Instructions EN:</label><textarea name="instructions_en">${gie}</textarea><label>Instructions SI:</label><textarea name="instructions_si">${gis}</textarea><label>Instructions TA:</label><textarea name="instructions_ta">${git}</textarea><button>Update</button></form></div>
            <div id="referral-settings" class="dashboard-section"><h3>💰 Referral Commissions (LKR)</h3><form action="/update-referral-settings" method="POST"><label>Tier1 (1-3):</label><input name="tier1" value="${rt1}"><label>Tier2 (4):</label><input name="tier2" value="${rt2}"><label>Tier3 (5-8):</label><input name="tier3" value="${rt3}"><label>Tier4 (9-15):</label><input name="tier4" value="${rt4}"><label>Tier5 (16-25):</label><input name="tier5" value="${rt5}"><label>Tier6 (25+):</label><input name="tier6" value="${rt6}"><button>Update</button></form></div>
            `));
        } else {
            const ur=await sql`SELECT * FROM users WHERE username=${uname}`;
            if(!ur.length) return res.redirect('/logout');
            const u=ur[0];
            const cpas=await sql`SELECT * FROM cpa_configs WHERE is_active=1`;
            const logs=await sql`SELECT * FROM task_logs WHERE username=${uname} ORDER BY id DESC`;
            const gLogs=await sql`SELECT * FROM gmail_tasks WHERE username=${uname} ORDER BY id DESC`;
            const notifs=await sql`SELECT * FROM notifications WHERE target_user=${uname} OR target_user='all' ORDER BY id DESC LIMIT 20`;
            const unread=await sql`SELECT COUNT(*) as c FROM notifications WHERE (target_user=${uname} OR target_user='all') AND is_read=0`;
            const bal=parseFloat(u.balance_numeric||0);
            const pendC=logs.filter(l=>l.status==='Pending').length+gLogs.filter(g=>g.status==='Pending').length;
            const doneC=logs.filter(l=>l.status==='Success').length+gLogs.filter(g=>g.status==='Success'||g.status==='PaymentReady').length;
            const uCountry=u.country||'LK';
            const gPrice=parseFloat((await getSetting(uCountry==='LK'?'gmail_task_price_lk':'gmail_task_price_intl'))||0.25);
            const gIns=l==='si'?(await getSetting('gmail_task_instructions_si')||''):l==='ta'?(await getSetting('gmail_task_instructions_ta')||''):(await getSetting('gmail_task_instructions_en')||'');

            let stats=`<div class="stats-grid"><div class="stat-card"><h3>$${bal.toFixed(2)}</h3><p>${tr.total}</p></div><div class="stat-card"><h3>${pendC}</h3><p>Pending</p></div><div class="stat-card"><h3>${doneC}</h3><p>Approved</p></div></div>`;

            let nHtml=`<h3>${tr.notifTitle}</h3>`;
            if(!notifs.length) nHtml+=`<p style="color:#aaa">None.</p>`;
            else notifs.forEach(n=>{ const tag=n.target_user==='all'?'📢':'🔒'; const rc=n.is_read?'read':''; nHtml+=`<div class="notif-box ${rc}"><div class="notif-content"><strong>${tag}</strong> ${n.message}<span class="notif-time">${n.timestamp}</span></div>${!n.is_read?`<button class="notif-btn" onclick="location.href='/mark-notif-read?id=${n.id}'">Read</button>`:''}</div>`; });

            let tHtml=`<h3>${tr.tasks}</h3><p>${tr.subText}</p>`;
            if(!cpas.length) tHtml+=`<p style="color:#ff4d4d">No tasks.</p>`;
            else cpas.forEach(c=>{ const ins=l==='si'?c.instructions_si:l==='ta'?c.instructions_ta:c.instructions_en; tHtml+=`<div class="galaxy-secure-node-wrapper"><h4 style="color:#66fcf1">${c.network_name}</h4><p style="color:#45a29e">📋 ${ins}</p><div class="galaxy-task-card-white"><h4>Verification Protocol</h4><p>Complete task below.</p><a href="${c.embed_code}" target="_blank" class="galaxy-start-btn">⚡ START</a></div><div class="proof-form"><form action="/submit-task-proof" method="POST"><input type="hidden" name="task_name" value="${c.network_name}"><label style="color:#45a29e">Submit Proof:</label><input name="proof_data" placeholder="Code..." required><button style="background:#66fcf1">Submit</button></form></div></div>`; });

            let gHtml=`<h3>${tr.gmailTask}</h3><div class="galaxy-secure-node-wrapper"><p style="color:#fff">${gIns}</p><p style="color:#2ecc71">💰 $${gPrice.toFixed(2)}/Gmail</p><p style="color:#66fcf1"><strong>${tr.yourCode}:</strong> ${u.referral_code||'N/A'}</p><form action="/submit-gmail-task" method="POST"><input type="email" name="email_created" placeholder="${tr.emailCreated}" required><input name="password_created" placeholder="${tr.emailPass}" required><button>${tr.submitGmail}</button></form><hr style="border-color:#45a29e;margin:15px 0"><button onclick="document.getElementById('refSec').style.display='block';this.style.display='none'" style="background:#f39c12;color:#fff">${tr.getRefLink}</button><div id="refSec" style="display:none"><div class="ref-link-box"><input id="refLinkInput" value="https://${req.get('host')}/register?ref=${u.referral_code||''}" readonly><button onclick="copyRef()">${tr.copyRef}</button></div></div></div>`;

            let gHist=`<h3>${tr.gmailHistory}</h3>`;
            if(!gLogs.length) gHist+=`<p style="color:#aaa">None.</p>`;
            else gLogs.forEach(g=>{ const sb=g.status==='Success'?'<span class="badge-success">OK</span>':g.status==='Pending'?'<span class="badge-pending">Pend</span>':g.status==='PaymentReady'?'<span style="background:#f39c12;color:#fff;padding:2px 6px">Ready</span>':'<span class="badge-fail">Fail</span>'; gHist+=`<div class="user-row" style="border-left-color:${g.status==='Success'||g.status==='PaymentReady'?'#45a29e':g.status==='Pending'?'#f0ad4e':'#ff4d4d'}"><strong>📧 ${g.email_created}</strong> | Code: ${g.task_code}<br>$${parseFloat(g.amount).toFixed(2)} | ${sb}<br>${g.timestamp}${g.buyer_reason?`<br><span style="color:#ff4d4d">Reason: ${g.buyer_reason}</span>`:''}</div>`; });

            let refHtml=`<h3>${tr.referralEarnings}</h3>`;
            const refs=await sql`SELECT * FROM users WHERE referred_by=${uname}`;
            if(!refs.length) refHtml+=`<p style="color:#aaa">No referrals.</p>`;
            else refs.forEach(r=>{ refHtml+=`<div class="user-row"><strong>👤 ${r.username}</strong> | Code: ${r.referral_code||'N/A'}</div>`; });

            let lHtml=`<h3>📊 Interaction Logs</h3>`;
            if(!logs.length) lHtml+=`<p style="color:#aaa">None.</p>`;
            else logs.forEach(lg=>{ const sl=lg.status==='Success'?'<span class="badge-success">OK</span>':lg.status==='Pending'?'<span class="badge-pending">Pend</span>':'<span class="badge-fail">Fail</span>'; lHtml+=`<div class="user-row" style="border-left-color:${lg.status==='Success'?'#45a29e':lg.status==='Pending'?'#f0ad4e':'#ff4d4d'}"><strong>🎯 ${lg.task_name}</strong><br>Proof: <span style="color:#66fcf1">${lg.proof_data}</span><br>${lg.timestamp}<br>${sl} | $${parseFloat(lg.amount||0.5).toFixed(2)}</div>`; });

            res.send(wrap(req,'Dashboard',`
            <h3>${tr.welcome}, ${uname}!</h3>${stats}
            <div class="galaxy-secure-node-wrapper"><h4 style="color:#66fcf1">🌍 ${tr.selectCountry}</h4><form action="/update-country" method="POST"><select name="country" class="form-input" onchange="this.form.submit()"><option value="LK" ${uCountry==='LK'?'selected':''}>${tr.countryLK}</option><option value="INTL" ${uCountry==='INTL'?'selected':''}>${tr.countryINTL}</option></select></form></div>
            <div class="navbar">
                <button class="nav-tab active" onclick="switchSection('worker-tasks')">🎯 Tasks</button>
                <button class="nav-tab" onclick="switchSection('worker-gmail')">📧 Gmail</button>
                <button class="nav-tab" onclick="switchSection('worker-gmail-history')">📋 History</button>
                <button class="nav-tab" onclick="switchSection('worker-referrals')">🔗 Refs</button>
                <button class="nav-tab" onclick="switchSection('worker-notifs')">🔔 Alerts ${unread[0].c>0?`<span class="notif-badge">${unread[0].c}</span>`:''}</button>
                <button class="nav-tab" onclick="switchSection('worker-logs')">📊 Logs</button>
            </div>
            <div id="worker-tasks" class="dashboard-section active">${tHtml}</div>
            <div id="worker-gmail" class="dashboard-section">${gHtml}</div>
            <div id="worker-gmail-history" class="dashboard-section">${gHist}</div>
            <div id="worker-referrals" class="dashboard-section">${refHtml}</div>
            <div id="worker-notifs" class="dashboard-section">${nHtml}</div>
            <div id="worker-logs" class="dashboard-section">${lHtml}</div>
            `));
        }
    }catch(e){console.error(e);res.status(500).send("Error");}
});

// ACTIONS
app.post('/submit-gmail-task',async(req,res)=>{
    if(!req.session.user||['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    const {email_created,password_created}=req.body; const ts=new Date().toLocaleString();
    try{
        const ur=await sql`SELECT country FROM users WHERE username=${req.session.user}`;
        const uc=(ur.length&&ur[0].country)||'LK';
        const gp=parseFloat((await getSetting(uc==='LK'?'gmail_task_price_lk':'gmail_task_price_intl'))||0.25);
        const code=await genCode(req.session.user);
        await sql`INSERT INTO gmail_tasks(username,email_created,password_created,task_code,status,amount,timestamp) VALUES(${req.session.user},${email_created},${password_created},${code},'Pending',${gp},${ts})`;
        await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${req.session.user},'📧 Gmail submitted: ${email_created} (${code})',${ts},0)`;
        await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES('admin','📧 New Gmail: ${req.session.user} - ${email_created}',${ts},0)`;
        await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES('buyer','📧 New Gmail: ${req.session.user} - ${email_created}',${ts},0)`;
        res.send("<script>alert('Submitted!');location.href='/dashboard'</script>");
    }catch(e){console.error(e);res.redirect('/dashboard');}
});

app.post('/update-country',async(req,res)=>{
    if(!req.session.user||['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    await sql`UPDATE users SET country=${req.body.country} WHERE username=${req.session.user}`;
    res.redirect('/dashboard');
});

app.post('/update-gmail-settings',async(req,res)=>{
    if(req.session.user!=='admin') return res.redirect('/');
    const {gmail_price_lk,gmail_price_intl,instructions_en,instructions_si,instructions_ta}=req.body;
    await sql`UPDATE system_settings SET value=${gmail_price_lk} WHERE key='gmail_task_price_lk'`;
    await sql`UPDATE system_settings SET value=${gmail_price_intl} WHERE key='gmail_task_price_intl'`;
    await sql`UPDATE system_settings SET value=${instructions_en} WHERE key='gmail_task_instructions_en'`;
    await sql`UPDATE system_settings SET value=${instructions_si} WHERE key='gmail_task_instructions_si'`;
    await sql`UPDATE system_settings SET value=${instructions_ta} WHERE key='gmail_task_instructions_ta'`;
    res.send("<script>alert('Updated!');location.href='/dashboard?tab=gmail-settings'</script>");
});

app.post('/update-referral-settings',async(req,res)=>{
    if(req.session.user!=='admin') return res.redirect('/');
    for(let i=1;i<=6;i++) await sql`UPDATE system_settings SET value=${req.body['tier'+i]} WHERE key=${'referral_commission_tier'+i}`;
    res.send("<script>alert('Updated!');location.href='/dashboard?tab=referral-settings'</script>");
});

app.post('/submit-task-proof',async(req,res)=>{
    if(!req.session.user||['admin','buyer'].includes(req.session.user)) return res.redirect('/');
    const ts=new Date().toLocaleString();
    await sql`INSERT INTO task_logs(username,task_name,proof_data,amount,status,timestamp) VALUES(${req.session.user},${req.body.task_name},${req.body.proof_data},0.5,'Pending',${ts})`;
    await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${req.session.user},'⏳ Proof submitted for ${req.body.task_name}',${ts},0)`;
    res.send("<script>alert('Submitted!');location.href='/dashboard'</script>");
});

app.get('/mark-notif-read',async(req,res)=>{
    if(!req.session.user) return res.redirect('/');
    await sql`UPDATE notifications SET is_read=1 WHERE id=${req.query.id} AND (target_user=${req.session.user} OR target_user='all')`;
    res.redirect('/dashboard');
});

app.get('/approve-task',async(req,res)=>{
    if(req.session.user!=='admin') return res.redirect('/');
    const tr=await sql`SELECT * FROM task_logs WHERE id=${req.query.id}`;
    if(tr.length&&tr[0].status==='Pending'){
        const ts=new Date().toLocaleString();
        await sql`UPDATE task_logs SET status='Success' WHERE id=${req.query.id}`;
        await sql`UPDATE users SET balance_numeric=balance_numeric+${tr[0].amount} WHERE username=${tr[0].username}`;
        await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${tr[0].username},'🎉 Approved! +$${parseFloat(tr[0].amount).toFixed(2)}',${ts},0)`;
    }
    res.redirect('/dashboard?tab=task-reviews');
});

app.get('/reject-task',async(req,res)=>{
    if(req.session.user!=='admin') return res.redirect('/');
    const tr=await sql`SELECT * FROM task_logs WHERE id=${req.query.id}`;
    if(tr.length&&tr[0].status==='Pending'){
        await sql`UPDATE task_logs SET status='Failed' WHERE id=${req.query.id}`;
        await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${tr[0].username},'❌ Rejected: ${tr[0].task_name}',${new Date().toLocaleString()},0)`;
    }
    res.redirect('/dashboard?tab=task-reviews');
});

app.post('/send-notification',async(req,res)=>{
    if(req.session.user!=='admin') return res.redirect('/');
    await sql`INSERT INTO notifications(target_user,message,timestamp,is_read) VALUES(${req.body.target_user},${req.body.message},${new Date().toLocaleString()},0)`;
    res.send("<script>alert('Sent!');location.href='/dashboard'</script>");
});

app.get('/remove-user',async(req,res)=>{
    if(req.session.user!=='admin') return res.redirect('/');
    const tr=await sql`SELECT username FROM users WHERE id=${req.query.id}`;
    if(tr.length){ const nm=tr[0].username; await sql`DELETE FROM task_logs WHERE username=${nm}`; await sql`DELETE FROM gmail_tasks WHERE username=${nm}`; await sql`DELETE FROM notifications WHERE target_user=${nm}`; }
    await sql`DELETE FROM users WHERE id=${req.query.id}`;
    res.redirect('/dashboard?tab=user-metrics');
});

app.post('/add-cpa',async(req,res)=>{
    if(req.session.user!=='admin') return res.redirect('/');
    const {network_name,embed_code,instructions_en,instructions_si,instructions_ta}=req.body;
    await sql`INSERT INTO cpa_configs(network_name,embed_code,instructions_en,instructions_si,instructions_ta,is_active) VALUES(${network_name},${embed_code},${instructions_en},${instructions_si},${instructions_ta},1)`;
    res.redirect('/dashboard');
});

app.get('/remove-cpa',async(req,res)=>{
    if(req.session.user!=='admin') return res.redirect('/');
    await sql`DELETE FROM cpa_configs WHERE id=${req.query.id}`;
    res.redirect('/dashboard?tab=admin-tasks');
});

module.exports = app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Galaxy running on ${PORT}`));
