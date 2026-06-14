// app.js - Stable Vercel Deployment
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { neon } = require('@neondatabase/serverless');

// Global error catcher (prevent Vercel 500 crashes)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Database setup
let sql;
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  sql = neon(process.env.DATABASE_URL);
} catch (e) {
  console.error('Neon connection failed:', e.message);
  sql = null;
}

const app = express();
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(session({
  secret: 'galaxy-2026-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Middleware to check database
app.use((req, res, next) => {
  if (!sql) return res.status(500).send('Database not connected. Set DATABASE_URL.');
  next();
});

// --- Database Initialization (runs once) ---
let dbReady = false;
async function initDb() {
  // Users
  await sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL
  )`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS contact VARCHAR(20)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_numeric NUMERIC(10,2) DEFAULT 0.0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS earnings_percentage NUMERIC(5,2) DEFAULT 100.0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'LK'`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50)`;

  // task_logs
  await sql`CREATE TABLE IF NOT EXISTS task_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    task_name VARCHAR(100) NOT NULL,
    proof_data TEXT,
    amount NUMERIC(10,2) DEFAULT 0.50,
    status VARCHAR(20) NOT NULL,
    timestamp VARCHAR(50) NOT NULL
  )`;

  // cpa_configs
  await sql`CREATE TABLE IF NOT EXISTS cpa_configs (
    id SERIAL PRIMARY KEY,
    network_name VARCHAR(100) NOT NULL,
    embed_code TEXT NOT NULL,
    instructions_en TEXT,
    instructions_si TEXT,
    instructions_ta TEXT,
    is_active INTEGER DEFAULT 1
  )`;

  // system_settings
  await sql`CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT
  )`;
  const defaults = [
    ['global_earnings_percentage', '100'],
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
  for (const [k, v] of defaults) {
    await sql`INSERT INTO system_settings (key, value) VALUES (${k}, ${v}) ON CONFLICT (key) DO NOTHING`;
  }

  // gmail_tasks
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

  // payment_proofs (base64 storage)
  await sql`CREATE TABLE IF NOT EXISTS payment_proofs (
    id SERIAL PRIMARY KEY,
    buyer_username VARCHAR(50) NOT NULL,
    file_data TEXT,
    timestamp VARCHAR(50) NOT NULL,
    is_deleted INTEGER DEFAULT 0
  )`;

  // notifications
  await sql`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    target_user VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    timestamp VARCHAR(50) NOT NULL,
    is_read INTEGER DEFAULT 0
  )`;
  await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read INTEGER DEFAULT 0`;

  // default buyer
  const buyer = await sql`SELECT id FROM users WHERE username = 'buyer'`;
  if (!buyer.length) {
    await sql`INSERT INTO users (username, password, email, address, contact, balance_numeric)
      VALUES ('buyer', 'buyer123', 'buyer@galaxy.com', 'Buyer', '000', 0)`;
  }
}

app.use(async (req, res, next) => {
  if (!dbReady) {
    try {
      await initDb();
      dbReady = true;
    } catch (e) {
      console.error('DB init failed:', e);
      return res.status(500).send('Database initialization error. Check your DATABASE_URL.');
    }
  }
  next();
});

// --- Helper functions ---
async function getSetting(key) {
  const r = await sql`SELECT value FROM system_settings WHERE key = ${key}`;
  return r.length ? r[0].value : null;
}

function getInitials(name) {
  const parts = name.trim().split(' ');
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}

async function generateUserCode(username, referredBy) {
  const initials = getInitials(username);
  if (!referredBy) {
    const cnt = await sql`SELECT COUNT(*) as c FROM users WHERE referral_code IS NOT NULL AND referral_code NOT LIKE '%/%'`;
    const next = parseInt(cnt[0].c) + 1;
    const code = initials + '-' + String(next).padStart(3, '0');
    await sql`UPDATE users SET referral_code = ${code} WHERE username = ${username}`;
    return code;
  } else {
    const ref = await sql`SELECT referral_code FROM users WHERE username = ${referredBy}`;
    if (!ref.length || !ref[0].referral_code) {
      const cnt = await sql`SELECT COUNT(*) as c FROM users WHERE referral_code IS NOT NULL AND referral_code NOT LIKE '%/%'`;
      const next = parseInt(cnt[0].c) + 1;
      const code = initials + '-' + String(next).padStart(3, '0');
      await sql`UPDATE users SET referral_code = ${code} WHERE username = ${username}`;
      return code;
    }
    const refCode = ref[0].referral_code;
    if (!refCode.includes('/')) {
      const newCode = refCode + '/' + initials;
      await sql`UPDATE users SET referral_code = ${newCode} WHERE username = ${username}`;
      return newCode;
    } else {
      const dash = refCode.indexOf('-');
      const slash = refCode.indexOf('/');
      const num = parseInt(refCode.substring(dash + 1, slash));
      const refInits = refCode.substring(refCode.lastIndexOf('/') + 1);
      const newCode = refInits + '-' + String(num + 1).padStart(3, '0') + '/' + initials;
      await sql`UPDATE users SET referral_code = ${newCode} WHERE username = ${username}`;
      return newCode;
    }
  }
}

// --- Translations ---
const t = {
  en: {
    title: "GALAXY WORKERS", login: "Login", reg: "Register",
    user: "Username", pass: "Password", email: "Email", btnLog: "LOG IN", btnReg: "REGISTER",
    logout: "Logout", welcome: "Welcome", balance: "Balance", tasks: "Tasks",
    gmailTask: "📧 Gmail Task", gmailInstr: "Create a Gmail & submit.",
    emailCreated: "Email", emailPass: "Password", submitGmail: "Submit",
    yourCode: "Your Code", getRefLink: "Referral Link", refLink: "Your Link", copyRef: "Copy",
    gmailHistory: "Gmail History", buyerWelcome: "Welcome Buyer",
    allPaymentsDone: "ALL PAID", paymentProof: "Proof (base64)", uploadProof: "Upload",
    done: "DONE", wrong: "WRONG", reason: "Reason", paymentReady: "Pay Ready",
    search: "Search", deleteTask: "Delete"
  },
  si: {
    title: "GALAXY WORKERS", login: "ඇතුල්වීම", reg: "ලියාපදිංචිය",
    user: "පරිශීලක", pass: "මුරපදය", email: "ඊමේල්", btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි",
    logout: "ඉවත් වන්න", welcome: "ආයුබෝවන්", balance: "ශේෂය", tasks: "කාර්යයන්",
    gmailTask: "📧 Gmail", gmailInstr: "Gmail ගිණුමක් සාදන්න.",
    emailCreated: "ඊමේල්", emailPass: "මුරපදය", submitGmail: "යොමු කරන්න",
    yourCode: "ඔබේ කේතය", getRefLink: "Referral Link", refLink: "Link", copyRef: "Copy",
    gmailHistory: "Gmail ඉතිහාසය", buyerWelcome: "ආයුබෝවන්",
    allPaymentsDone: "සියලු ගෙවීම්", paymentProof: "ගෙවීම් සාක්ෂි (base64)", uploadProof: "උඩුගත",
    done: "හරි", wrong: "වැරදි", reason: "හේතුව", paymentReady: "ගෙවීම් සූදානම්",
    search: "සොයන්න", deleteTask: "මකන්න"
  }
};

// --- HTML Builder (robust) ---
function basePage(req, title, body) {
  const lang = req.session.lang || 'en';
  const tr = t[lang];
  const langSelect = '<select onchange="location.href=\'/change-lang?lang=\'+this.value" style="background:#0b0c10;color:#66fcf1;border:1px solid #45a29e;padding:6px;border-radius:5px">'
    + '<option value="en" ' + (lang === 'en' ? 'selected' : '') + '>En</option>'
    + '<option value="si" ' + (lang === 'si' ? 'selected' : '') + '>සිං</option></select>';
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title>
<style>
body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:15px;margin:0}
.container{max-width:1000px;margin:20px auto;background:#1f2833;padding:20px;border-radius:10px;border:1px solid #45a29e}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #45a29e;padding-bottom:15px}
.header h2{color:#66fcf1;margin:0}
input,textarea,select{width:100%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;box-sizing:border-box}
button{width:100%;padding:12px;background:#45a29e;border:none;color:#000;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px}
button:hover{background:#66fcf1}
.user-row{background:#0b0c10;padding:15px;margin:12px 0;border-radius:5px;border-left:5px solid #45a29e}
a{color:#66fcf1;text-decoration:none}
.logout-btn{background:#ff4d4d;color:#fff;padding:6px 14px;font-size:13px;border-radius:4px}
.navbar{display:flex;background:#0b0c10;border:1px solid #45a29e;border-radius:5px;margin-bottom:20px;flex-wrap:wrap}
.nav-tab{flex:1;min-width:100px;text-align:center;padding:12px;color:#c5c6c7;font-weight:bold;cursor:pointer;background:0;border:none;font-size:13px}
.nav-tab.active{background:#45a29e;color:#000}
.dashboard-section{display:none}
.dashboard-section.active{display:block}
.stats-grid{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
.stat-card{flex:1;min-width:calc(33% - 12px);background:#0b0c10;border:1px solid #45a29e;padding:15px;border-radius:8px;text-align:center}
@media(max-width:600px){.stat-card{min-width:100%}}
.badge-pending{background:#f0ad4e;color:#000;padding:2px 6px;border-radius:3px;font-size:11px}
.badge-success{background:#45a29e;color:#000;padding:2px 6px;border-radius:3px;font-size:11px}
.badge-fail{background:#ff4d4d;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px}
.payment-ready-btn{background:#f39c12;color:#fff;animation:glow 2s infinite;padding:8px;border-radius:4px;display:inline-block;margin-top:10px}
@keyframes glow{0%{box-shadow:0 0 5px #f39c12}50%{box-shadow:0 0 20px #f39c12}100%{box-shadow:0 0 5px #f39c12}}
.btn-done{background:#2ecc71;color:#fff;padding:5px 10px;border-radius:4px;display:inline-block}
.btn-wrong{background:#ff4d4d;color:#fff;padding:5px 10px;border-radius:4px}
.search-form{display:flex;gap:10px;margin-bottom:15px}
.search-form input{flex:1}
.search-form button{width:auto;margin:0}
.toggle-btn{background:#45a29e;color:#000;padding:5px 10px;margin-right:5px;border:none;border-radius:4px;font-size:12px;cursor:pointer}
</style>
<script>
function switchSection(id){
  document.querySelectorAll('.dashboard-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  event.target.classList.add('active');
}
function toggleDiv(uid,type){
  const el=document.getElementById(type+'-'+uid);
  el.style.display=el.style.display==='none'?'block':'none';
}
function copyRef(){
  document.getElementById('refLinkInput').select();
  document.execCommand('copy');
  alert('Copied!');
}
</script>
</head><body><div class="container">
<div class="header"><h2>${tr.title}</h2>
<div style="display:flex;gap:10px;align-items:center">${langSelect}
<a href="/logout" class="logout-btn">${tr.logout}</a></div></div>
${body}</div></body></html>`;
}

// --- Routes ---
app.get('/change-lang', (req, res) => {
  req.session.lang = req.query.lang === 'si' ? 'si' : 'en';
  res.redirect(req.get('referer') || '/');
});

// Auth
app.get('/', (req, res) => {
  if (req.session.user) return req.session.user === 'buyer' ? res.redirect('/buyer-dashboard') : res.redirect('/dashboard');
  const tr = t[req.session.lang || 'en'];
  res.send(basePage(req, 'Login', `<h3>${tr.login}</h3>
    <form action="/login" method="POST"><input name="username" placeholder="${tr.user}" required><input type="password" name="password" placeholder="${tr.pass}" required><button>${tr.btnLog}</button></form>
    <p style="text-align:center"><a href="/register">${tr.reg}</a></p>`));
});

app.get('/register', (req, res) => {
  const tr = t[req.session.lang || 'en'];
  res.send(basePage(req, 'Register', `<h3>${tr.reg}</h3>
    <form action="/register" method="POST"><input name="username" placeholder="${tr.user}" required><input type="password" name="password" placeholder="${tr.pass}" required><input type="email" name="email" placeholder="${tr.email}" required><input name="address" placeholder="Address" required><input name="contact" placeholder="Contact" required><input type="hidden" name="ref_code" value="${req.query.ref || ''}"><button>${tr.btnReg}</button></form>`));
});

app.post('/register', async (req, res) => {
  try {
    const { username, password, email, address, contact, ref_code } = req.body;
    const exists = await sql`SELECT id FROM users WHERE LOWER(username) = ${username.toLowerCase()}`;
    if (exists.length) return res.send("<script>alert('Username exists!'); location.href='/register'</script>");
    let referredBy = null;
    if (ref_code && ref_code.trim()) {
      const ref = await sql`SELECT username FROM users WHERE referral_code = ${ref_code.trim()}`;
      if (ref.length) referredBy = ref[0].username;
    }
    await sql`INSERT INTO users (username, password, email, address, contact, balance_numeric, referred_by) VALUES (${username}, ${password}, ${email}, ${address}, ${contact}, 0, ${referredBy})`;
    const now = new Date().toLocaleString();
    await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${username}, 'Welcome!', ${now})`;
    if (referredBy) await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${referredBy}, ${'New referral: ' + username}, ${now})`;
    res.send("<script>alert('Registered!'); location.href='/'</script>");
  } catch (e) { console.error(e); res.send("<script>alert('Registration error'); location.href='/'</script>"); }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') { req.session.user = 'admin'; return res.redirect('/dashboard'); }
    if (username === 'buyer' && password === 'buyer123') { req.session.user = 'buyer'; return res.redirect('/buyer-dashboard'); }
    const users = await sql`SELECT username FROM users WHERE username = ${username} AND password = ${password}`;
    if (users.length) { req.session.user = users[0].username; res.redirect('/dashboard'); }
    else res.send("<script>alert('Invalid credentials'); location.href='/'</script>");
  } catch (e) { res.send("<script>alert('Login error'); location.href='/'</script>"); }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// Buyer Dashboard
app.get('/buyer-dashboard', async (req, res) => {
  if (req.session.user !== 'buyer') return res.redirect('/');
  const tr = t[req.session.lang || 'en'];
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

    let tasksHtml = '<h3>📧 Gmail Submissions</h3><form class="search-form" method="GET"><input name="search" placeholder="' + tr.search + '..." value="' + search + '"><button>' + tr.search + '</button></form>';
    if (!tasks.length) tasksHtml += '<p>No tasks.</p>';
    else {
      const grouped = {};
      tasks.forEach(x => { if (!grouped[x.task_code]) grouped[x.task_code] = []; grouped[x.task_code].push(x); });
      for (const [code, list] of Object.entries(grouped)) {
        tasksHtml += '<div style="margin:15px 0;border:1px solid #45a29e;padding:10px"><h4>👤 ' + code + '</h4>';
        list.forEach(task => {
          const badge = task.status === 'Success' ? '<span class="badge-success">Approved</span>' :
                        task.status === 'Pending' ? '<span class="badge-pending">Pending</span>' :
                        task.status === 'PaymentReady' ? '<span style="background:#f39c12;color:#fff;padding:2px 6px">Payment Ready</span>' :
                        '<span class="badge-fail">Wrong</span>';
          tasksHtml += '<div style="margin:10px 0;border-bottom:1px solid #333;padding-bottom:10px">' +
            '<p><strong>📧 Email:</strong> ' + task.email_created + '</p>' +
            '<p><strong>🔑 Password:</strong> ' + task.password_created + '</p>' +
            '<p><strong>💰 Amount:</strong> $' + parseFloat(task.amount).toFixed(2) + ' | ' + badge + '</p>' +
            '<p><strong>📅 Date:</strong> ' + task.timestamp + '</p>' +
            (task.buyer_reason ? '<p><strong>Reason:</strong> ' + task.buyer_reason + '</p>' : '') +
            (task.status === 'Pending' ? '<div style="display:flex;gap:10px;margin-top:5px"><a href="/buyer-mark-done?id=' + task.id + '" class="btn-done">' + tr.done + '</a><form action="/buyer-mark-wrong" method="POST"><input type="hidden" name="task_id" value="' + task.id + '"><input name="reason" placeholder="' + tr.reason + '" required><button class="btn-wrong">' + tr.wrong + '</button></form></div>' : '') +
            (task.status === 'Success' ? '<a href="/buyer-mark-payment-ready?id=' + task.id + '" class="payment-ready-btn">' + tr.paymentReady + '</a>' : '') +
            '</div>';
        });
        tasksHtml += '</div>';
      }
    }

    let proofHtml = '<h3>' + tr.paymentProof + '</h3><form action="/upload-payment-proof" method="POST"><textarea name="image_base64" placeholder="Paste base64 image..." required style="height:100px"></textarea><button>' + tr.uploadProof + '</button></form>';
    if (proofs.length) proofHtml += proofs.map(p => '<div><img src="data:image/png;base64,' + p.file_data + '" style="max-width:200px"><p>' + p.timestamp + '</p><a href="/delete-payment-proof?id=' + p.id + '">Delete</a></div>').join('');
    else proofHtml += '<p>No proofs.</p>';

    res.send(basePage(req, 'Buyer Dashboard', '<h3>' + tr.buyerWelcome + '</h3><form action="/buyer-all-payments-done" method="POST"><button class="payment-ready-btn">💰 ' + tr.allPaymentsDone + '</button></form>' + proofHtml + tasksHtml));
  } catch (e) { console.error(e); res.status(500).send('Buyer dashboard error'); }
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
          if (c > 25) amt = 15; else if (c > 15) amt = 10; else if (c > 8) amt = 7; else if (c > 4) amt = 6; else if (c > 3) amt = 5;
          const usd = amt / 300;
          await sql`UPDATE users SET balance_numeric = balance_numeric + ${usd} WHERE username = ${user[0].referred_by}`;
          await sql`UPDATE gmail_tasks SET referral_commission_paid=1 WHERE id = ${req.query.id}`;
        }
      }
      await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${t.username}, 'Gmail approved!', ${new Date().toLocaleString()})`;
    }
    res.redirect('/buyer-dashboard');
  } catch (e) { res.redirect('/buyer-dashboard'); }
});

app.post('/buyer-mark-wrong', async (req, res) => {
  if (req.session.user !== 'buyer') return res.redirect('/');
  try {
    await sql`UPDATE gmail_tasks SET status='Failed', buyer_reason=${req.body.reason} WHERE id = ${req.body.task_id} AND status='Pending'`;
    res.redirect('/buyer-dashboard');
  } catch (e) { res.redirect('/buyer-dashboard'); }
});

app.get('/buyer-mark-payment-ready', async (req, res) => {
  if (req.session.user !== 'buyer') return res.redirect('/');
  try { await sql`UPDATE gmail_tasks SET status='PaymentReady' WHERE id = ${req.query.id} AND status='Success'`; } catch (e) {}
  res.redirect('/buyer-dashboard');
});

app.post('/buyer-all-payments-done', async (req, res) => {
  if (req.session.user !== 'buyer') return res.redirect('/');
  await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES ('admin', 'All payments done by buyer', ${new Date().toLocaleString()})`;
  res.send("<script>alert('Done!'); location.href='/buyer-dashboard'</script>");
});

app.post('/upload-payment-proof', async (req, res) => {
  if (req.session.user !== 'buyer' || !req.body.image_base64) return res.redirect('/buyer-dashboard');
  await sql`INSERT INTO payment_proofs (buyer_username, file_data, timestamp) VALUES ('buyer', ${req.body.image_base64}, ${new Date().toLocaleString()})`;
  res.redirect('/buyer-dashboard');
});

app.get('/delete-payment-proof', async (req, res) => {
  if (!['buyer','admin'].includes(req.session.user)) return res.redirect('/');
  await sql`UPDATE payment_proofs SET is_deleted=1 WHERE id = ${req.query.id}`;
  res.redirect(req.session.user === 'admin' ? '/dashboard?tab=proofs' : '/buyer-dashboard');
});

// Main Dashboard
app.get('/dashboard', async (req, res) => {
  if (!req.session.user) return res.redirect('/');
  const username = req.session.user;
  const lang = req.session.lang || 'en';
  const tr = t[lang];
  try {
    if (username === 'admin') {
      const users = await sql`SELECT * FROM users WHERE username NOT IN ('admin','buyer')`;
      const allLogs = await sql`SELECT * FROM task_logs ORDER BY id DESC`;
      const allGmail = await sql`SELECT * FROM gmail_tasks ORDER BY id DESC`;
      const allProofs = await sql`SELECT * FROM payment_proofs WHERE is_deleted=0 ORDER BY id DESC`;
      const kw = req.query.search_keyword || '';
      let filtered = users;
      if (kw.trim()) {
        const k = kw.toLowerCase();
        filtered = users.filter(u => u.username.toLowerCase().includes(k) || u.email.toLowerCase().includes(k));
      }
      let userHtml = '<h3>👥 Workers</h3><form class="search-form" method="GET"><input type="hidden" name="tab" value="users"><input name="search_keyword" value="' + kw + '" placeholder="' + tr.search + '..."><button>' + tr.search + '</button></form>';
      filtered.forEach(u => {
        const userLogs = allLogs.filter(l => l.username === u.username);
        const userGmails = allGmail.filter(g => g.username === u.username);
        const gDetail = userGmails.map(g => '<div>📧 ' + g.email_created + ' (' + g.task_code + ') - ' + g.status + '</div>').join('') || 'No Gmails';
        const oDetail = userLogs.map(l => '<div>• ' + l.task_name + ' - ' + l.status + ' $' + l.amount + '</div>').join('') || 'No tasks';
        userHtml += '<div class="user-row"><strong>👤 ' + u.username + '</strong> | 💰 $' + parseFloat(u.balance_numeric || 0).toFixed(2) +
          '<div style="margin-top:5px"><button class="toggle-btn" onclick="toggleDiv(\'' + u.username + '\',\'gmail\')">📧 Gmails</button>' +
          '<button class="toggle-btn" onclick="toggleDiv(\'' + u.username + '\',\'other\')">📋 Tasks</button>' +
          '<a href="/remove-user?id=' + u.id + '" class="logout-btn">Delete</a></div>' +
          '<div id="gmail-' + u.username + '" style="display:none">' + gDetail + '</div>' +
          '<div id="other-' + u.username + '" style="display:none">' + oDetail + '</div></div>';
      });
      const pend = allLogs.filter(l => l.status === 'Pending');
      res.send(basePage(req, 'Admin Dashboard', '<h3>Welcome Admin</h3><div class="navbar">' +
        '<button class="nav-tab active" onclick="switchSection(\'panel\')">⚙️</button>' +
        '<button class="nav-tab" onclick="switchSection(\'reviews\')">📩</button>' +
        '<button class="nav-tab" onclick="switchSection(\'users\')">👥</button>' +
        '<button class="nav-tab" onclick="switchSection(\'gmails\')">📧</button>' +
        '<button class="nav-tab" onclick="switchSection(\'proofs\')">💳</button>' +
        '<button class="nav-tab" onclick="switchSection(\'gsettings\')">⚙️</button>' +
        '<button class="nav-tab" onclick="switchSection(\'rsettings\')">💰</button>' +
        '</div><div id="panel" class="dashboard-section active">' +
        '<h3>Send Notification</h3><form action="/send-notification" method="POST"><select name="target_user"><option value="all">All</option>' + users.map(u => '<option>' + u.username + '</option>').join('') + '</select><input name="message" required><button>Send</button></form>' +
        '<h3>Add Task</h3><form action="/add-cpa" method="POST"><input name="network_name" placeholder="Task Name" required><input name="embed_code" placeholder="URL" required><input name="instructions_en" placeholder="EN"><input name="instructions_si" placeholder="SI"><input name="instructions_ta" placeholder="TA"><button>Add</button></form>' +
        '</div><div id="reviews" class="dashboard-section">' + (pend.length ? pend.map(l => '<div class="user-row">' + l.username + ' - ' + l.task_name + ' <a href="/approve-task?id=' + l.id + '">Approve</a> <a href="/reject-task?id=' + l.id + '">Reject</a></div>').join('') : '<p>No pending</p>') + '</div>' +
        '<div id="users" class="dashboard-section">' + userHtml + '</div>' +
        '<div id="gmails" class="dashboard-section">' + allGmail.map(g => '<div>' + g.username + ': ' + g.email_created + ' (' + g.task_code + ') - ' + g.status + '</div>').join('') + '</div>' +
        '<div id="proofs" class="dashboard-section">' + (allProofs.length ? allProofs.map(p => '<div><img src="data:image/png;base64,' + p.file_data + '" style="max-width:200px"><p>' + p.timestamp + '</p><a href="/delete-payment-proof?id=' + p.id + '">Delete</a></div>').join('') : '<p>No proofs</p>') + '</div>' +
        '<div id="gsettings" class="dashboard-section"><h3>Gmail Settings</h3><form action="/update-gmail-settings" method="POST"><label>Price LK:</label><input name="gmail_price_lk" value="' + (await getSetting('gmail_task_price_lk') || '0.25') + '"><label>Price INTL:</label><input name="gmail_price_intl" value="' + (await getSetting('gmail_task_price_intl') || '0.25') + '"><label>EN:</label><textarea name="instructions_en">' + (await getSetting('gmail_task_instructions_en') || '') + '</textarea><label>SI:</label><textarea name="instructions_si">' + (await getSetting('gmail_task_instructions_si') || '') + '</textarea><button>Update</button></form></div>' +
        '<div id="rsettings" class="dashboard-section"><h3>Referral</h3><form action="/update-referral-settings" method="POST">' + [1,2,3,4,5,6].map(i => '<label>Tier ' + i + ':</label><input name="tier' + i + '" value="' + (await getSetting('referral_commission_tier' + i) || [4,5,6,7,10,15][i-1]) + '">').join('') + '<button>Update</button></form></div>'));
    } else {
      // Worker
      const user = await sql`SELECT * FROM users WHERE username = ${username}`;
      if (!user.length) return res.redirect('/logout');
      const u = user[0];
      if (!u.referral_code) {
        await generateUserCode(username, u.referred_by);
        const upd = await sql`SELECT referral_code FROM users WHERE username = ${username}`;
        u.referral_code = upd[0].referral_code;
      }
      const cpas = await sql`SELECT * FROM cpa_configs WHERE is_active=1`;
      const logs = await sql`SELECT * FROM task_logs WHERE username = ${username} ORDER BY id DESC`;
      const gmailLogs = await sql`SELECT * FROM gmail_tasks WHERE username = ${username} ORDER BY id DESC`;
      const notifs = await sql`SELECT * FROM notifications WHERE target_user = ${username} OR target_user = 'all' ORDER BY id DESC LIMIT 20`;
      const unread = await sql`SELECT COUNT(*) as c FROM notifications WHERE (target_user = ${username} OR target_user = 'all') AND is_read=0`;
      const bal = parseFloat(u.balance_numeric || 0);
      const country = u.country || 'LK';
      const gPrice = parseFloat(await getSetting(country === 'LK' ? 'gmail_task_price_lk' : 'gmail_task_price_intl') || '0.25');
      const instr = country === 'LK' ? (await getSetting('gmail_task_instructions_si') || '') : (await getSetting('gmail_task_instructions_en') || '');
      const ghist = gmailLogs.length ? gmailLogs.map(g => {
        const delBtn = g.status === 'Pending' ? '<a href="/delete-gmail-task?id=' + g.id + '" style="color:#ff4d4d">' + tr.deleteTask + '</a>' : '';
        return '<div class="user-row" style="border-left-color:' + (g.status === 'Success' || g.status === 'PaymentReady' ? '#45a29e' : g.status === 'Pending' ? '#f0ad4e' : '#ff4d4d') + '">📧 ' + g.email_created + ' | 🔑 ' + g.password_created + ' | ' + g.task_code + '<br>' + g.status + ' $' + g.amount + ' ' + g.timestamp + ' ' + (g.buyer_reason ? '<br>Reason: ' + g.buyer_reason : '') + ' ' + delBtn + '</div>';
      }).join('') : '<p>No Gmail tasks</p>';

      res.send(basePage(req, 'Worker Dashboard', '<h3>' + tr.welcome + ', ' + username + '</h3><div class="stats-grid"><div class="stat-card"><h3>$' + bal.toFixed(2) + '</h3><p>' + tr.balance + '</p></div></div>' +
        '<div class="navbar">' +
        '<button class="nav-tab active" onclick="switchSection(\'wtasks\')">🎯</button>' +
        '<button class="nav-tab" onclick="switchSection(\'wgmail\')">📧</button>' +
        '<button class="nav-tab" onclick="switchSection(\'wghist\')">📋</button>' +
        '<button class="nav-tab" onclick="switchSection(\'wrefs\')">🔗</button>' +
        '<button class="nav-tab" onclick="switchSection(\'wnotifs\')">🔔' + (unread[0].c > 0 ? ' <span style="background:red;color:#fff;border-radius:50%;padding:2px 5px">' + unread[0].c + '</span>' : '') + '</button>' +
        '<button class="nav-tab" onclick="switchSection(\'wlogs\')">📊</button>' +
        '</div>' +
        '<div id="wtasks" class="dashboard-section active">' + cpas.map(c => '<div class="user-row"><strong>' + c.network_name + '</strong><br>' + (lang === 'si' ? c.instructions_si : c.instructions_en) + '<br><a href="' + c.embed_code + '" target="_blank">⚡ START</a></div>').join('') + '<h4>Submit Proof</h4><form action="/submit-task-proof" method="POST"><input name="task_name" placeholder="Task name"><input name="proof_data" placeholder="Proof"><button>Submit</button></form></div>' +
        '<div id="wgmail" class="dashboard-section"><h3>' + tr.gmailTask + '</h3><p>' + instr + '</p><p><strong>Price:</strong> $' + gPrice.toFixed(2) + '</p><p><strong>' + tr.yourCode + ':</strong> ' + u.referral_code + '</p><form action="/submit-gmail-task" method="POST"><input type="email" name="email_created" placeholder="' + tr.emailCreated + '" required><input name="password_created" placeholder="' + tr.emailPass + '" required><button>' + tr.submitGmail + '</button></form><button onclick="document.getElementById(\'refSec\').style.display=\'block\';this.style.display=\'none\'" style="background:#f39c12;color:#fff;margin-top:10px">' + tr.getRefLink + '</button><div id="refSec" style="display:none"><input id="refLinkInput" value="https://' + req.get('host') + '/register?ref=' + u.referral_code + '" readonly><button onclick="copyRef()">' + tr.copyRef + '</button></div></div>' +
        '<div id="wghist" class="dashboard-section">' + ghist + '</div>' +
        '<div id="wrefs" class="dashboard-section">' + ((await sql`SELECT * FROM users WHERE referred_by = ${username}`).map(r => '<div>👤 ' + r.username + ' (' + (r.referral_code || 'N/A') + ')</div>').join('') || '<p>No referrals</p>') + '</div>' +
        '<div id="wnotifs" class="dashboard-section">' + notifs.map(n => '<div class="user-row">' + n.message + ' <small>' + n.timestamp + '</small> ' + (n.is_read ? '' : '<a href="/mark-notif-read?id=' + n.id + '">Read</a>') + '</div>').join('') + '</div>' +
        '<div id="wlogs" class="dashboard-section">' + (logs.length ? logs.map(l => '<div class="user-row">' + l.task_name + ' - ' + l.status + ' $' + l.amount + '</div>').join('') : '<p>No logs</p>') + '</div>'));
    }
  } catch (e) { console.error(e); res.status(500).send('Dashboard error'); }
});

// Task routes
app.post('/submit-gmail-task', async (req, res) => {
  if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
  const { email_created, password_created } = req.body;
  try {
    const user = await sql`SELECT country, referral_code, referred_by FROM users WHERE username = ${req.session.user}`;
    let code = user[0].referral_code;
    if (!code) code = await generateUserCode(req.session.user, user[0].referred_by);
    const country = user[0].country || 'LK';
    const price = parseFloat(await getSetting(country === 'LK' ? 'gmail_task_price_lk' : 'gmail_task_price_intl') || '0.25');
    await sql`INSERT INTO gmail_tasks (username, email_created, password_created, task_code, amount, timestamp) VALUES (${req.session.user}, ${email_created}, ${password_created}, ${code}, ${price}, ${new Date().toLocaleString()})`;
    await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES (${req.session.user}, '📧 Gmail submitted!', ${new Date().toLocaleString()})`;
    await sql`INSERT INTO notifications (target_user, message, timestamp) VALUES ('buyer', ${'📧 New Gmail from ' + req.session.user}, ${new Date().toLocaleString()})`;
    res.send("<script>alert('Submitted!'); location.href='/dashboard?tab=wghist'</script>");
  } catch (e) { console.error(e); res.redirect('/dashboard'); }
});

app.get('/delete-gmail-task', async (req, res) => {
  if (!req.session.user || ['admin','buyer'].includes(req.session.user)) return res.redirect('/');
  await sql`DELETE FROM gmail_tasks WHERE id = ${req.query.id} AND username = ${req.session.user} AND status = 'Pending'`;
  res.redirect('/dashboard?tab=wghist');
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
  res.redirect('/dashboard?tab=reviews');
});

app.get('/reject-task', async (req, res) => {
  if (req.session.user !== 'admin') return res.redirect('/');
  await sql`UPDATE task_logs SET status='Failed' WHERE id = ${req.query.id} AND status='Pending'`;
  res.redirect('/dashboard?tab=reviews');
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
  res.redirect('/dashboard?tab=users');
});

app.post('/add-cpa', async (req, res) => {
  if (req.session.user !== 'admin') return res.redirect('/');
  const { network_name, embed_code, instructions_en, instructions_si, instructions_ta } = req.body;
  await sql`INSERT INTO cpa_configs (network_name, embed_code, instructions_en, instructions_si, instructions_ta, is_active) VALUES (${network_name}, ${embed_code}, ${instructions_en}, ${instructions_si}, ${instructions_ta}, 1)`;
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
  res.send("<script>alert('Updated!'); location.href='/dashboard?tab=gsettings'</script>");
});

app.post('/update-referral-settings', async (req, res) => {
  if (req.session.user !== 'admin') return res.redirect('/');
  for (let i = 1; i <= 6; i++) await sql`UPDATE system_settings SET value = ${req.body['tier' + i]} WHERE key = ${'referral_commission_tier' + i}`;
  res.send("<script>alert('Updated!'); location.href='/dashboard?tab=rsettings'</script>");
});

module.exports = app;

// Local dev only (Vercel ignores)
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('Server running on port ' + port));
}
