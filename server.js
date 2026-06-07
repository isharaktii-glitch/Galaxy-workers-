const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('/tmp/galaxy.db'); 

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🛠️ DATABASE SETUP: Proof Submission Table එක අලුතින් එකතු කර ඇත
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, email TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS proof_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, category TEXT, proof_text TEXT, status TEXT DEFAULT 'PENDING', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000')");
});

const translations = {
    en: { title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration", user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number", btnLog: "LOG IN", btnReg: "REGISTER", logout: "Logout", forgot: "Forgot Password?" },
    si: { title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය", user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය", btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", logout: "ඉවත් වන්න", forgot: "මුරපදය අමතකද?" }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} 
        .container{max-width:800px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;}
        .lang-selector { position: absolute; top: 15px; right: 15px; }
        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        input, textarea, select.form-input {width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;}
        button:hover{background:#66fcf1;}
        .cat-btn { background:#0b0c10; color:#66fcf1; border:1px solid #45a29e; padding:12px; margin:5px; border-radius:5px; cursor:pointer; font-weight:bold; display:inline-block; text-decoration:none; font-size:14px; }
        .cat-btn:hover, .cat-btn.active { background:#45a29e; color:#0b0c10; }
        .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;}
        a{color:#66fcf1;text-decoration:none;} .logout-btn{background:#ff4d4d;color:#fff;width:auto;padding:5px 10px;font-size:12px;float:right;}
    </style></head><body><div class="container">
    <div class="lang-selector">
        <select onchange="window.location.href='/change-lang?lang=' + this.value}">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
        </select>
    </div><h2 style="text-align:center;color:#66fcf1;margin-top:15px;">${translations[lang].title}</h2>${content}</div></body></html>`;
};

app.get('/change-lang', (req, res) => {
    const selectedLang = req.query.lang;
    if (['en', 'si'].includes(selectedLang)) req.session.lang = selectedLang;
    res.redirect('back');
});

// LOGIN, REGISTER, FORGOT PASSWORD ROUTES
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Login', `<h3>${t.login}</h3><form action="/login" method="POST"><input type="text" name="username" placeholder="${t.user}" required><input type="password" name="password" placeholder="${t.pass}" required><button type="submit">${t.btnLog}</button></form><p style="text-align:center; margin-top:15px;">${t.noAcc} <a href="/register">${t.regHere}</a> <br><br><a href="/forgot-password" style="color:#ff4d4d; font-size:14px;">${t.forgot}</a></p>`));
});

app.get('/register', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Register', `<h3>${t.reg}</h3><form action="/register" method="POST"><input type="text" name="username" placeholder="${t.user}" required><input type="email" name="email" placeholder="${t.email}" required><input type="password" name="password" placeholder="${t.pass}" required><input type="text" name="address" placeholder="${t.addr}" required><input type="text" name="contact" placeholder="${t.phone}" required><button type="submit">${t.btnReg}</button></form><p style="text-align:center;"><a href="/">${t.backLog}</a></p>`));
});

app.post('/register', (req, res) => {
    const { username, password, email, address, contact } = req.body;
    db.run("INSERT INTO users (username, password, email, balance, address, contact) VALUES (?, ?, ?, 0.0, ?, ?)", [username, password, email, address, contact], (err) => {
        if (err) return res.send(htmlWrapper(req, 'Error', `<h3>Username already exists!</h3><a href="/register">Try again</a>`));
        res.redirect('/');
    });
});

app.get('/forgot-password', (req, res) => {
    res.send(htmlWrapper(req, 'Forgot Password', `<h3>Recover Password</h3><form action="/forgot-password" method="POST"><input type="text" name="username" placeholder="Username" required><input type="email" name="email" placeholder="Email Address" required><button type="submit">RECOVER</button></form><p style="text-align:center;"><a href="/">Back to Login</a></p>`));
});

app.post('/forgot-password', (req, res) => {
    const { username, email } = req.body;
    db.get("SELECT password FROM users WHERE username = ? AND email = ?", [username, email], (err, row) => {
        if (row) res.send(htmlWrapper(req, 'Password Recovered', `<div style="border:1px solid #45a29e; padding:20px; border-radius:5px; text-align:center;"><h3 style="color:#66fcf1;">Your Password is:</h3><h1>${row.password}</h1><br><a href="/">Login</a></div>`));
        else res.send(htmlWrapper(req, 'Error', `<h3>Details do not match!</h3><a href="/forgot-password">Try again</a>`));
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) { req.session.user = row; res.redirect('/dashboard'); }
        else res.send(htmlWrapper(req, 'Error', `<h3>Invalid Credentials!</h3><a href="/">Try again</a>`));
    });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// 📊 MAIN DASHBOARD (කැටගරි සිස්ටම් එක සහිතව)
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = req.session.user.username;
    const currentCat = req.query.category || 'youtube'; // Default category

    // 💡 Timewall Embed URL (ඔයාගේ එක දාගන්න)
    const timewallWidgetBaseURL = "https://timewall.io/embed/your-widget-id"; 
    const finalIframeSrc = `${timewallWidgetBaseURL}?subid=${user}`;

    // 🗂️ කැටගරි අනුව වෙනස් වන දත්ත (Content Area)
    let categoryContent = '';
    if (currentCat === 'youtube') {
        categoryContent = `
            <div style="background:#0b0c10; padding:20px; border-radius:5px; margin-top:15px; border-left:5px solid #ff4d4d;">
                <h3 style="color:#ff4d4d; margin-top:0;">📺 YouTube Video Tasks</h3>
                <p>1. Go to YouTube and search for <strong>"Galaxy Business Tips"</strong>.</p>
                <p>2. Watch the latest video fully, like it, and subscribe.</p>
                <p>💰 <strong>Reward: $0.0500 per view</strong></p>
            </div>`;
    } else if (currentCat === 'apps') {
        categoryContent = `
            <div style="background:#0b0c10; padding:20px; border-radius:5px; margin-top:15px; border-left:5px solid #66fcf1;">
                <h3 style="color:#66fcf1; margin-top:0;">📱 Mobile App Installing Tasks</h3>
                <p>1. Download the specified app using our referral links shared in the WhatsApp group.</p>
                <p>2. Register an account and keep the app for 2 days.</p>
                <p>💰 <strong>Reward: $0.2500 per install</strong></p>
            </div>`;
    } else if (currentCat === 'seo') {
        categoryContent = `
            <div style="background:#0b0c10; padding:20px; border-radius:5px; margin-top:15px; border-left:5px solid #45a29e;">
                <h3 style="color:#45a29e; margin-top:0;">🌐 Website Visiting & SEO Tasks</h3>
                <p>Complete the fast automation and website browsing micro tasks below. Earnings will be tracked instantly!</p>
                <iframe src="${finalIframeSrc}" width="100%" height="500px" frameborder="0" style="border-radius:8px; background:#fff; margin-top:15px;"></iframe>
            </div>`;
    } else if (currentCat === 'kyc') {
        categoryContent = `
            <div style="background:#0b0c10; padding:20px; border-radius:5px; margin-top:15px; border-left:5px solid #f5b041;">
                <h3 style="color:#f5b041; margin-top:0;">🆔 Identity & KYC Verifications</h3>
                <p>1. Complete the crypto wallet or account verification tasks as requested by the team lead.</p>
                <p>💰 <strong>Reward: $1.5000 per verified account</strong></p>
            </div>`;
    }

    // 🗳️ Proof Submission Form (YouTube, Apps, KYC සඳහා විතරක් පෙන්වයි)
    let proofForm = '';
    if (currentCat !== 'seo') {
        proofForm = `
            <div style="background:#1f2833; padding:20px; border-radius:5px; margin-top:20px; border:1px solid #45a29e;">
                <h4 style="color:#66fcf1; margin-top:0;">📤 Submit Task Proof</h4>
                <form action="/submit-proof" method="POST">
                    <input type="hidden" name="category" value="${currentCat}">
                    <textarea name="proof_text" rows="3" placeholder="Enter your registered Email, Username, or Paste the Screenshot Imgur/Drive Link here as proof..." required></textarea>
                    <button type="submit" style="background:#66fcf1; color:#0b0c10;">SUBMIT PROOF</button>
                </form>
            </div>`;
    }

    // 🛠️ ADMIN CONTROL PANEL VIEW
    if (user === 'admin') {
        db.all("SELECT * FROM users WHERE username != 'admin'", [], (err, users) => {
            db.all("SELECT * FROM proof_submissions WHERE status = 'PENDING'", [], (err, proofs) => {
                let userList = users.map(u => `<div class="user-row"><strong>Worker:</strong> ${u.username} | <strong>Email:</strong> ${u.email} | <strong>Balance:</strong> $${u.balance.toFixed(4)} <br><strong>Contact:</strong> ${u.contact} | <strong>Address:</strong> ${u.address}</div>`).join('');
                let pendingProofs = proofs.map(p => `
                    <div class="user-row" style="border-left-color:#f5b041;">
                        <strong>Worker:</strong> ${p.username} | <strong>Category:</strong> ${p.category.toUpperCase()} <br>
                        <strong>Submitted Proof:</strong> <span style="color:#fff;">${p.proof_text}</span> <br>
                        <form action="/admin/approve-proof" method="POST" style="margin-top:10px; display:inline-block;">
                            <input type="hidden" name="proof_id" value="${p.id}">
                            <input type="text" name="amount" placeholder="Enter payout amount ($)" style="width:150px; padding:5px; margin:0 5px;" required>
                            <button type="submit" style="width:auto; padding:5px 15px; margin:0; background:#2ecc71; color:#fff;">Approve & Pay</button>
                        </form>
                    </div>
                `).join('');

                res.send(htmlWrapper(req, 'Owner Control Panel', `
                    <a href="/logout" class="logout-btn">Logout</a>
                    <h2 style="color:#ff4d4d;">🛠️ OWNER CONTROL PANEL</h2>
                    
                    <h3 style="color:#66fcf1;">📥 Pending Task Proofs (${proofs.length})</h3>
                    ${pendingProofs || '<p style="color:#888;">No pending proofs to review.</p>'}
                    <hr style="border-color:#45a29e; margin:20px 0;">
                    
                    <h3 style="color:#66fcf1;">👥 Registered Workers (${users.length})</h3>
                    ${userList || '<p style="color:#888;">No workers registered yet.</p>'}
                `));
            });
        });
    } else {
        // 👥 WORKER DASHBOARD VIEW
        db.get("SELECT balance FROM users WHERE username = ?", [user], (err, row) => {
            const currentBalance = row ? row.balance.toFixed(4) : '0.0000';
            res.send(htmlWrapper(req, 'Dashboard', `
                <a href="/logout" class="logout-btn">Logout</a>
                <h2>Welcome, ${user}! ✨</h2>
                <div style="background:#0b0c10; padding:15px; border-radius:5px; margin-bottom:20px; border:1px solid #45a29e;">
                    <span>Your Total Earnings:</span> <span style="font-size:24px; color:#66fcf1; font-weight:bold; float:right;">$${currentBalance}</span>
                </div>
                
                <div style="text-align:center; margin-bottom:15px;">
                    <a href="/dashboard?category=youtube" class="cat-btn ${currentCat === 'youtube' ? 'active' : ''}">📺 YouTube Videos</a>
                    <a href="/dashboard?category=apps" class="cat-btn ${currentCat === 'apps' ? 'active' : ''}">📱 Mobile Apps</a>
                    <a href="/dashboard?category=seo" class="cat-btn ${currentCat === 'seo' ? 'active' : ''}">🌐 Web SEO Tasks</a>
                    <a href="/dashboard?category=kyc" class="cat-btn ${currentCat === 'kyc' ? 'active' : ''}">🆔 KYC Verification</a>
                </div>
                
                ${categoryContent}
                ${proofForm}
            `));
        });
    }
});

// WORKER PROOF SUBMISSION POST
app.post('/submit-proof', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { category, proof_text } = req.body;
    const username = req.session.user.username;
    db.run("INSERT INTO proof_submissions (username, category, proof_text) VALUES (?, ?, ?)", [username, category, proof_text], () => {
        res.send(htmlWrapper(req, 'Success', `<div style="text-align:center; padding:20px;"><h3>Proof submitted successfully! Admin will review and credit your balance soon.</h3><a href="/dashboard">Go Back</a></div>`));
    });
});

// ADMIN APPROVE & PAY POST
app.post('/admin/approve-proof', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    const { proof_id, amount } = req.body;
    const payout = parseFloat(amount);

    db.get("SELECT * FROM proof_submissions WHERE id = ?", [proof_id], (err, proof) => {
        if (proof) {
            db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [payout, proof.username]);
            db.run("INSERT INTO task_logs (username, task_name, amount) VALUES (?, ?, ?)", [proof.username, `${proof.category.toUpperCase()} Approved Task`, payout]);
            db.run("DELETE FROM proof_submissions WHERE id = ?", [proof_id], () => {
                res.redirect('/dashboard');
            });
        } else {
            res.send('Proof not found.');
        }
    });
});

// AUTOMATIC POSTBACK FOR TIMEWALL
app.get('/postback', (req, res) => {
    const { subid, reward, task_name } = req.query;
    if (subid && reward) {
        const workerReward = parseFloat(reward) * 0.70; 
        db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [workerReward, subid]);
        db.run("INSERT INTO task_logs (username, task_name, amount) VALUES (?, ?, ?)", [subid, task_name || 'Web SEO Task', workerReward]);
        res.send('OK');
    } else {
        res.status(400).send('Invalid Parameters');
    }
});

module.exports = app;
