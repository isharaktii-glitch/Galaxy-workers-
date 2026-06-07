const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('/tmp/galaxy.db'); 

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🗄️ DATABASE SETUP & TABLE UPDATES
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, email TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS cpa_offers (id INTEGER PRIMARY KEY AUTOINCREMENT, network_name TEXT, offer_title TEXT, offer_link TEXT, payout REAL, instruction_en TEXT, status TEXT DEFAULT 'active')");
    
    // ⚙️ Offerwall ලින්ක්ස් ඩයිනමික්ව සේව් කරන්න අලුත් ටේබල් එකක්
    db.run("CREATE TABLE IF NOT EXISTS offerwall_settings (id INTEGER PRIMARY KEY, wall_name TEXT, wall_url TEXT)");
    
    // Default Admin Account
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000')");
    
    // මුලින්ම පාවිච්චි කරන්න ඩෙමෝ ඔෆර්වෝල් 2ක් ඇතුළත් කිරීම (පසුව ඇඩ්මින් එකෙන් වෙනස් කල හැක)
    db.run("INSERT OR IGNORE INTO offerwall_settings (id, wall_name, wall_url) VALUES (1, 'Galaxy Core Tasks', 'https://timewall.io/embed/your-widget-id')");
    db.run("INSERT OR IGNORE INTO offerwall_settings (id, wall_name, wall_url) VALUES (2, 'Galaxy Premium Wall', 'https://www.cpalead.com/offerwall/embed/your-id')");
});

const translations = {
    en: {
        title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration",
        user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number",
        btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here",
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Official Tasks 👇",
        subText: "Complete the tasks in our official walls below. Earnings will add to your balance automatically.", logout: "Logout",
        forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER",
        changePassTitle: "Change Password", oldPass: "Old Password", newPass: "New Password", btnUpdate: "UPDATE PASSWORD",
        cpaTasks: "🔥 Premium Bonus Tasks", instructionTitle: "Instructions:"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "GALAXY නිල කාර්යයන් (Official Tasks) 👇",
        subText: "පහත දැක්වෙන අපගේ නිල පැනල් මඟින් Tasks සම්පූර්ණ කරන්න. ඔබ උපයන මුදල් ස්වයංක්‍රීයවම ගිණුමට එකතු වේ.", logout: "ඉවත් වන්න (Logout)",
        forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න",
        changePassTitle: "මුරපදය වෙනස් කිරීම", oldPass: "පරණ මුරපදය", newPass: "අලුත් මුරපදය", btnUpdate: "මුරපදය වෙනස් කරන්න",
        cpaTasks: "🔥 විශේෂ Premium කාර්යයන් (Bonus Tasks)", instructionTitle: "උපදෙස්:"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "கீழே உள்ள அதிகாரப்பூர்வ பணிகளை முடிக்கவும். உங்கள் வருவாய் தானாகவே உங்கள் கணக்கில் சேர்க்கப்படும்.", logout: "வெளியேறு (Logout)",
        forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்",
        changePassTitle: "கடவுச்சொல்லை மாற்றவும்", oldPass: "பழைய கடவுச்சொல்", newPass: "புதிய கடவுச்சொல்", btnUpdate: "மாற்றவும்",
        cpaTasks: "🔥 பிரீமியம் போனஸ் பணிகள்", instructionTitle: "வழிமுறைகள்:"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} 
        .container{max-width:800px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;}
        .lang-selector { position: absolute; top: 15px; right: 15px; }
        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        input, select, textarea {width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;}
        button:hover{background:#66fcf1;}
        .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;}
        .cpa-card{background:#141d26; padding:15px; margin:15px 0; border-radius:8px; border:1px solid #66fcf1; text-align:left;}
        a{color:#66fcf1;text-decoration:none;} .logout-btn{background:#ff4d4d;color:#fff;width:auto;padding:5px 10px;font-size:12px;float:right;margin-left:10px;}
        .delete-btn{background:#ff4d4d; color:#fff; padding:5px 10px; border:none; border-radius:3px; cursor:pointer; float:right; font-size:12px;}
        .wall-tab-container { display: flex; gap: 10px; margin-top: 20px; margin-bottom: 10px; }
        .wall-tab { background: #0b0c10; color: #fff; border: 1px solid #45a29e; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; flex: 1; text-align: center; }
        .wall-tab.active { background: #45a29e; color: #0b0c10; border-color: #66fcf1; }
    </style></head><body><div class="container">
    <div class="lang-selector">
        <select onchange="window.location.href='/change-lang?lang=' + this.value}">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
            <option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option>
        </select>
    </div><h2 style="text-align:center;color:#66fcf1;margin-top:15px;">${translations[lang].title}</h2>${content}</div></body></html>`;
};

// LANGUAGE CHANGE 
app.get('/change-lang', (req, res) => {
    const selectedLang = req.query.lang;
    if (['en', 'si', 'ta'].includes(selectedLang)) req.session.lang = selectedLang;
    res.redirect(req.get('referer') || '/');
});

// LOGIN PAGE
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

// LOGIN ACTION WITH HARDCODED ADMIN ACC bypass
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'admin123') {
        req.session.user = { id: 0, username: 'admin', email: 'admin@galaxy.com' };
        return res.redirect('/dashboard');
    }

    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) { 
            req.session.user = row; 
            res.redirect('/dashboard'); 
        } else {
            res.send(htmlWrapper(req, 'Error', `<div style="border:1px solid #ff4d4d; padding:20px; border-radius:5px;"><h3>Invalid Username or Password!</h3><a href="/">Try again</a></div>`));
        }
    });
});

// REGISTER PAGE
app.get('/register', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Register', `
        <h3>${t.reg}</h3>
        <form action="/register" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <input type="email" name="email" placeholder="${t.email}" required>
            <input type="password" name="password" placeholder="${t.pass}" required>
            <input type="text" name="address" placeholder="${t.addr}" required>
            <input type="text" name="contact" placeholder="${t.phone}" required>
            <button type="submit">${t.btnReg}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

app.post('/register', (req, res) => {
    const { username, password, email, address, contact } = req.body;
    db.run("INSERT INTO users (username, password, email, balance, address, contact) VALUES (?, ?, ?, 0.0, ?, ?)", [username, password, email, address, contact], (err) => {
        if (err) return res.send(htmlWrapper(req, 'Error', `<h3>Username already exists!</h3><a href="/register">Try again</a>`));
        res.redirect('/');
    });
});

// FORGOT PASSWORD
app.get('/forgot-password', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Forgot Password', `
        <h3>${t.recoverTitle}</h3>
        <form action="/forgot-password" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <input type="email" name="email" placeholder="${t.email}" required>
            <button type="submit">${t.btnRecover}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

app.post('/forgot-password', (req, res) => {
    const { username, email } = req.body;
    db.get("SELECT password FROM users WHERE username = ? AND email = ?", [username, email], (err, row) => {
        if (row) {
            res.send(htmlWrapper(req, 'Password Recovered', `
                <div style="border:1px solid #45a29e; padding:20px; border-radius:5px; text-align:center;">
                    <h3 style="color:#66fcf1;">Your Password is:</h3>
                    <h1 style="color:#fff; background:#0b0c10; padding:10px; display:inline-block; border-radius:5px;">${row.password}</h1>
                    <br><br><a href="/">Click here to Login</a>
                </div>
            `));
        } else {
            res.send(htmlWrapper(req, 'Error', `<h3>Details do not match!</h3><a href="/forgot-password">Try again</a>`));
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 🔐 USER PASSWORD CHANGE
app.get('/change-password', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Change Password', `
        <h3>${t.changePassTitle}</h3>
        <form action="/change-password" method="POST">
            <input type="password" name="oldPassword" placeholder="${t.oldPass}" required>
            <input type="password" name="newPassword" placeholder="${t.newPass}" required>
            <button type="submit">${t.btnUpdate}</button>
        </form>
        <p style="text-align:center;"><a href="/dashboard"><- Back to Dashboard</a></p>
    `));
});

app.post('/change-password', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { oldPassword, newPassword } = req.body;
    const username = req.session.user.username;

    db.get("SELECT password FROM users WHERE username = ?", [username], (err, row) => {
        if (row && row.password === oldPassword) {
            db.run("UPDATE users SET password = ? WHERE username = ?", [newPassword, username], (err) => {
                res.send(htmlWrapper(req, 'Success', `<h3>Password updated successfully!</h3><a href="/dashboard">Back to Dashboard</a>`));
            });
        } else {
            res.send(htmlWrapper(req, 'Error', `<h3>Old password is incorrect!</h3><a href="/change-password">Try again</a>`));
        }
    });
});

// ❌ ADMIN: DELETE WORKER USER
app.get('/admin/delete-user/:id', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    db.run("DELETE FROM users WHERE id = ? AND username != 'admin'", [req.params.id], (err) => {
        res.redirect('/dashboard');
    });
});

// 📥 ADMIN: ADD CPA LINKS
app.post('/admin/add-cpa', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    const { network_name, offer_title, offer_link, payout, instruction_en } = req.body;
    
    db.run("INSERT INTO cpa_offers (network_name, offer_title, offer_link, payout, instruction_en) VALUES (?, ?, ?, ?, ?)", 
    [network_name, offer_title, offer_link, parseFloat(payout), instruction_en], (err) => {
        res.redirect('/dashboard');
    });
});

// 📥 ADMIN: UPDATE OFFERWALL CONFIGURATIONS (SECRET MANAGER)
app.post('/admin/update-walls', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    const { wall1_url, wall2_url } = req.body;
    
    db.run("UPDATE offerwall_settings SET wall_url = ? WHERE id = 1", [wall1_url], () => {
        db.run("UPDATE offerwall_settings SET wall_url = ? WHERE id = 2", [wall2_url], () => {
            res.redirect('/dashboard');
        });
    });
});

// ❌ ADMIN: DELETE CPA LINK
app.get('/admin/delete-cpa/:id', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    db.run("DELETE FROM cpa_offers WHERE id = ?", [req.params.id], (err) => {
        res.redirect('/dashboard');
    });
});

// 📊 DASHBOARD 
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = req.session.user.username;
    const currentLang = req.session.lang || 'en';
    const t = translations[currentLang];

    if (user === 'admin') {
        const getUsers = new Promise((resolve, reject) => {
            db.all("SELECT * FROM users WHERE username != 'admin'", [], (err, rows) => err ? reject(err) : resolve(rows));
        });
        const getOffers = new Promise((resolve, reject) => {
            db.all("SELECT * FROM cpa_offers", [], (err, rows) => err ? reject(err) : resolve(rows));
        });
        const getWalls = new Promise((resolve, reject) => {
            db.all("SELECT * FROM offerwall_settings", [], (err, rows) => err ? reject(err) : resolve(rows));
        });

        Promise.all([getUsers, getOffers, getWalls]).then(([users, offers, walls]) => {
            let wall1 = walls.find(w => w.id === 1) || { wall_url: '' };
            let wall2 = walls.find(w => w.id === 2) || { wall_url: '' };

            let workerList = (users || []).map(u => `
                <div class="user-row">
                    <a href="/admin/delete-user/${u.id}" class="delete-btn" onclick="return confirm('Are you sure you want to remove this worker?')">Remove Worker</a>
                    <strong>Worker:</strong> ${u.username} | <strong>Email:</strong> ${u.email} <br>
                    <strong>Balance:</strong> $${(u.balance || 0).toFixed(4)} | <strong>Password:</strong> <span style="color:#66fcf1;">${u.password}</span> <br>
                    <strong>Address:</strong> ${u.address} | <strong>Contact:</strong> ${u.contact}
                </div>
            `).join('');

            let activeOffersList = (offers || []).map(o => `
                <div class="user-row" style="border-left-color: #ff4d4d;">
                    <a href="/admin/delete-cpa/${o.id}" class="delete-btn">Delete Offer</a>
                    <strong>[${o.network_name}]</strong> ${o.offer_title} - <span style="color:#66fcf1;">$${o.payout}</span><br>
                    <small style="word-break: break-all;">Link: ${o.offer_link}</small>
                </div>
            `).join('');

            res.send(htmlWrapper(req, 'Owner Control Panel', `
                <a href="/logout" class="logout-btn">${t.logout}</a>
                <h2 style="color:#ff4d4d;text-align:left;">🛠️ OWNER CONTROL PANEL</h2>
                <p>Welcome back, Boss!</p>
                
                <!-- 🤫 SECRET OFFERWALL MANAGER -->
                <hr style="border-color:#45a29e;">
                <h3 style="color:#66fcf1;">⚙️ GALAXY AUTOMATIC OFFERWALL MANAGER</h3>
                <p style="font-size:13px; color:#aaa;">CPA Networks වලින් හම්බෙන Global Offerwall Iframe Links හෝ Widgets ලින්ක්ස් මෙතනට දාන්න. මේවා Workers ලට පේන්නේ උඹේම පැනල් වගේ (Masked) රහස්‍යවයි.</p>
                <form action="/admin/update-walls" method="POST" style="background:#141d26; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #66fcf1;">
                    <label style="font-weight:bold; color:#fff;">Wall 1 URL (Will display as 'Galaxy Core Tasks'):</label>
                    <input type="text" name="wall1_url" value="${wall1.wall_url}" placeholder="Paste Timewall URL or other network wall url..." required>
                    
                    <label style="font-weight:bold; color:#fff; margin-top:10px; display:block;">Wall 2 URL (Will display as 'Galaxy Premium Wall'):</label>
                    <input type="text" name="wall2_url" value="${wall2.wall_url}" placeholder="Paste CPALead / MyLead Offerwall iframe URL here..." required>
                    
                    <button type="submit" style="background:#66fcf1; color:#0b0c10;">💾 SAVE & SECURE WALLS</button>
                </form>

                <hr style="border-color:#45a29e;">
                <h3>➕ ADD MANUALLY MANAGED LINKS</h3>
                <form action="/admin/add-cpa" method="POST" style="background:#141d26; padding:15px; border-radius:8px;">
                    <select name="network_name" required>
                        <option value="CPAGrip">CPAGrip</option>
                        <option value="CPALead">CPALead</option>
                        <option value="MaxBounty">MaxBounty</option>
                        <option value="Other">Other Network / GitHub Link</option>
                    </select>
                    <input type="text" name="offer_title" placeholder="Offer Title (e.g., Complete Survey)" required>
                    <input type="text" name="offer_link" placeholder="Paste Offer Link / Affiliate URL here" required>
                    <input type="number" step="0.01" name="payout" placeholder="Worker Payout Amount ($)" required>
                    <textarea name="instruction_en" placeholder="Type Instructions in English ONLY" rows="3" required></textarea>
                    <button type="submit" style="background:#45a29e; color:#0b0c10;">UPLOAD & INTEGRATE TASK</button>
                </form>

                <h3 style="margin-top:20px;">🔗 Active Managed CPA Offers</h3>
                ${activeOffersList || '<p style="color:#888;">No CPA offers active.</p>'}

                <hr style="border-color:#45a29e; margin-top:20px;">
                <h3>👥 REGISTERED WORKERS TRACKING</h3>
                <div id="workersContainer">
                    ${workerList || '<p style="text-align:center;color:#888;">No workers registered yet.</p>'}
                </div>
                
                <hr style="border-color:#45a29e;">
                <h3 style="margin-top:20px; text-align:left;"><a href="/admin/logs">📊 View Detailed Task Logs</a></h3>
            `));
        }).catch(err => res.send("Database Error: " + err.message));

    } else {
        db.get("SELECT balance FROM users WHERE username = ?", [user], (err, row) => {
            db.all("SELECT * FROM cpa_offers WHERE status = 'active'", [], (err, offers) => {
                db.all("SELECT * FROM offerwall_settings", [], (err, walls) => {
                    const currentBalance = row ? row.balance.toFixed(4) : '0.0000';
                    
                    let wall1 = walls.find(w => w.id === 1) || { wall_url: '' };
                    let wall2 = walls.find(w => w.id === 2) || { wall_url: '' };

                    // Auto inject subid safely to avoid leaking details
                    let finalSrc1 = wall1.wall_url.includes('?') ? `${wall1.wall_url}&subid=${user}` : `${wall1.wall_url}?subid=${user}`;
                    let finalSrc2 = wall2.wall_url.includes('?') ? `${wall2.wall_url}&subid=${user}` : `${wall2.wall_url}?subid=${user}`;

                    const dynamicIframeTabs = `
                        <h3 style="color:#66fcf1; margin-top:30px; text-align:left;">${t.tasks}</h3>
                        <p style="font-size:13px; color:#aaa; text-align:left;">${t.subText}</p>
                        
                        <div class="wall-tab-container">
                            <div class="wall-tab active" onclick="switchWall('wall1', this)">🌌 Galaxy Core Tasks</div>
                            <div class="wall-tab" onclick="switchWall('wall2', this)">💎 Galaxy Premium Wall</div>
                        </div>

                        <div id="wall1" class="wall-frame-wrapper" style="display:block;">
                            <iframe src="${finalSrc1}" width="100%" height="600px" frameborder="0" style="border-radius:8px; background:#fff; margin-top:10px;"></iframe>
                        </div>
                        <div id="wall2" class="wall-frame-wrapper" style="display:none;">
                            <iframe src="${finalSrc2}" width="100%" height="600px" frameborder="0" style="border-radius:8px; background:#fff; margin-top:10px;"></iframe>
                        </div>

                        <script>
                            function switchWall(wallId, tabElement) {
                                document.querySelectorAll('.wall-frame-wrapper').forEach(el => el.style.display = 'none');
                                document.querySelectorAll('.wall-tab').forEach(el => el.classList.remove('active'));
                                
                                document.getElementById(wallId).style.display = 'block';
                                tabElement.classList.add('active');
                            }
                        </script>
                    `;
                    
                    let cpaSection = "";
                    if(offers && offers.length > 0) {
                        let offersHtml = offers.map(o => {
                            let trackingLink = o.offer_link.includes('?') ? `${o.offer_link}&subid=${user}` : `${o.offer_link}?subid=${user}`;

                            return `
                                <div class="cpa-card">
                                    <h4 style="margin:0 0 5px 0; color:#66fcf1;">${o.offer_title}</h4>
                                    <p style="margin:5px 0; font-size:14px;">
                                        <strong>${t.instructionTitle}</strong> 
                                        <span class="translate-text">${o.instruction_en}</span>
                                    </p>
                                    <p style="margin:5px 0; color:#ff4d4d; font-weight:bold;">Reward: $${o.payout.toFixed(4)}</p>
                                    <a href="${trackingLink}" target="_blank"><button style="padding:8px; font-size:14px; margin-top:5px;">👉 Complete Task</button></a>
                                </div>
                            `;
                        }).join('');

                        const translationScript = `
                            <script>
                                document.addEventListener("DOMContentLoaded", function() {
                                    let targetLang = "${currentLang}";
                                    if (targetLang === "en") return; 
                                    
                                    let elements = document.querySelectorAll('.translate-text');
                                    elements.forEach(el => {
                                        let originalText = el.innerText;
                                        let url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" + targetLang + "&dt=t&q=" + encodeURIComponent(originalText);
                                        
                                        fetch(url)
                                            .then(response => response.json())
                                            .then(data => {
                                                if(data && data[0] && data[0][0] && data[0][0][0]) {
                                                    el.innerText = data[0][0][0];
                                                }
                                            })
                                            .catch(err => console.error("Translation Error: ", err));
                                    });
                                });
                            </script>
                        `;

                        cpaSection = `
                            <h3 style="color:#66fcf1; text-align:left; margin-top:25px;">${t.cpaTasks}</h3>
                            ${offersHtml}
                            ${translationScript}
                        `;
                    }

                    res.send(htmlWrapper(req, 'Dashboard', `
                        <a href="/logout" class="logout-btn">${t.logout}</a>
                        <a href="/change-password" class="logout-btn" style="background:#45a29e;">🔑 Change Password</a>
                        <h2>${t.welcome}, ${user}! ✨</h2>
                        <div style="background:#0b0c10; padding:15px; border-radius:5px; margin-bottom:20px; border:1px solid #45a29e;">
                            <span style="font-size:18px;">${t.total}:</span> 
                            <span style="font-size:24px; color:#66fcf1; font-weight:bold; float:right;">$${currentBalance}</span>
                        </div>

                        ${cpaSection}
                        ${dynamicIframeTabs}
                    `));
                });
            });
        });
    }
});

// 🔎 DETAILED LOGS WITH LIVE SEARCH
app.get('/admin/logs', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    
    db.all("SELECT * FROM task_logs ORDER BY timestamp DESC", [], (err, logs) => {
        let logList = (logs || []).map(l => `
            <div class="user-row log-item" data-username="${l.username.toLowerCase()}" data-task="${l.task_name.toLowerCase()}" style="border-left-color: #66fcf1;">
                <strong>Worker:</strong> <span class="worker-name">${l.username}</span> <br>
                <strong>Task Details:</strong> ${l.task_name} <br>
                <strong>Earned (After 30% Profit Cut):</strong> <span style="color:#66fcf1;">$${l.amount.toFixed(4)}</span> <br>
                <small style="color:#aaa;">Time: ${l.timestamp}</small>
            </div>
        `).join('');

        const searchScript = `
            <input type="text" id="logSearch" placeholder="🔍 Type Worker Username or Task name to filter..." style="width:95%; padding:12px; margin:15px 0; border:1px solid #66fcf1; border-radius:5px; background:#0b0c10; color:#fff;">
            
            <script>
                document.getElementById('logSearch').addEventListener('input', function() {
                    let filter = this.value.toLowerCase();
                    let items = document.querySelectorAll('.log-item');
                    
                    items.forEach(function(item) {
                        let username = item.getAttribute('data-username');
                        let taskName = item.getAttribute('data-task');
                        
                        if (username.includes(filter) || taskName.includes(filter)) {
                            item.style.display = 'block';
                        } else {
                            item.style.display = 'none';
                        }
                    });
                });
            </script>
        `;

        res.send(htmlWrapper(req, 'Task Logs', `
            <a href="/dashboard" style="font-size:14px;"><- Back to Control Panel</a>
            <h2 style="color:#66fcf1; margin-top:15px;">Completed Task Logs</h2>
            ${searchScript}
            <div id="logsContainer" style="margin-top:10px;">
                ${logList || '<p style="text-align:center;color:#888;">No tasks completed yet.</p>'}
            </div>
        `));
    });
});

// POSTBACK
app.get('/postback', (req, res) => {
    const { subid, reward, task_name } = req.query;
    if (subid && reward) {
        const workerReward = parseFloat(reward) * 0.70; 
        db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [workerReward, subid]);
        db.run("INSERT INTO task_logs (username, task_name, amount) VALUES (?, ?, ?)", [subid, task_name || 'Micro Task', workerReward]);
        res.send('OK');
    } else {
        res.status(400).send('Invalid Parameters');
    }
});

module.exports = app;
