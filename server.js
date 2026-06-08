const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { google } = require('googleapis'); // Sheets API සඳහා (npm install googleapis)

const app = express();
const db = new sqlite3.Database('/tmp/galaxy.db'); 

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🗄️ DATABASE SETUP
db.serialize(() => {
    // 1. User Table (earnings_percentage එකතු කර ඇත - Requirement 6)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        username TEXT UNIQUE, 
        password TEXT, 
        email TEXT, 
        balance REAL DEFAULT 0.0, 
        address TEXT, 
        contact TEXT,
        earnings_percentage REAL DEFAULT 100.0
    )`);
    
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
    
    // CPA Configurations (Multi-networks සඳහා - Requirement 7)
    db.run("CREATE TABLE IF NOT EXISTS cpa_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, network_name TEXT, embed_code TEXT, instructions_en TEXT, instructions_si TEXT, instructions_ta TEXT, is_active INTEGER DEFAULT 1)");

    // External Database / Google Sheets API Settings Table (Requirement 5)
    db.run("CREATE TABLE IF NOT EXISTS system_settings (key TEXT UNIQUE, value TEXT)");

    // Default Admin Account
    db.run("INSERT OR IGNORE INTO users (username, password, email, balance, address, contact, earnings_percentage) VALUES ('admin', 'admin123', 'admin@galaxy.com', 0.0, 'Headquarters', '0000000000', 100.0)");
    
    // Default Global Profit/Earnings Percentage Setting
    db.run("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('global_earnings_percentage', '100')");
});

// Google Sheets වෙත දත්ත Backup කිරීමේ Function එක (Requirement 5)
async function backupToGoogleSheet(username, email, balance, taskCount) {
    db.get("SELECT value FROM system_settings WHERE key = 'google_sheet_config'", async (err, row) => {
        if (!row || !row.value) return; // Config කර නැත්නම් Skip වේ
        try {
            const config = JSON.parse(row.value); // credentials JSON සහ sheetId
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
    });
}

const translations = {
    en: {
        title: "GALAXY WORKERS", login: "Worker Login", reg: "Worker Registration",
        user: "Username", pass: "Password", email: "Email Address", addr: "Full Address", phone: "Contact Number",
        btnLog: "LOG IN", btnReg: "REGISTER", noAcc: "Don't have an account?", regHere: "Register here",
        backLog: "Back to Login", welcome: "Welcome", total: "Your Total Earnings", tasks: "Available Micro Tasks 👇",
        subText: "Complete the tasks below. Your earnings will automatically add to your balance.", logout: "Logout",
        forgot: "Forgot Password?", recoverTitle: "Recover Password", btnRecover: "RECOVER",
        cpaTitle: "🔗 CPA Networks Integration Settings", taskInstr: "Task Instructions"
    },
    si: {
        title: "GALAXY WORKERS", login: "සේවක ඇතුල්වීම", reg: "සේවක ලියාපදිංචිය",
        user: "පරිශීලක නාමය (Username)", pass: "මුරපදය (Password)", email: "ඊමේල් ලිපිනය (Email)", addr: "සම්පූර්ණ ලිපිනය", phone: "WhatsApp / දුරකථන අංකය",
        btnLog: "ඇතුල් වන්න", btnReg: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        backLog: "නැවත මුල් පිටුවට", welcome: "ආයුබෝවන්", total: "ඔබේ මුළු උපයනය", tasks: "කිරීමට ඇති සරල වැඩ (Tasks) 👇",
        subText: "පහත ඇති Tasks සම්පූර්ණ කරන්න. ඔබ උපයන මුදල් ස්වයංක්‍රීයවම ගිණුමට එකතු වේ.", logout: "ඉවත් වන්න (Logout)",
        forgot: "මුරපදය අමතකද? (Forgot Password)", recoverTitle: "මුරපදය නැවත ලබාගැනීම", btnRecover: "මුරපදය පෙන්වන්න",
        cpaTitle: "🔗 CPA ජාල සහ සබැඳි සැකසුම් (Integration)", taskInstr: "වැඩසටහනේ උපදෙස් (Instructions)"
    },
    ta: {
        title: "GALAXY WORKERS", login: "பணியாளர் உள்நுழைவு", reg: "பணியாளர் பதிவு",
        user: "பயனர் பெயர் (Username)", pass: "கடவுச்சொல் (Password)", email: "மின்னஞ்சல் முகவரி", addr: "முழு முகவரி", phone: "தொலைபேசி எண்",
        btnLog: "உள்நுழைக", btnReg: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        backLog: "மீண்டும் உள்நுழைய", welcome: "வரவேற்கிறோம்", total: "உங்கள் மொத்த வருவாய்", tasks: "கிடைக்கக்கூடிய பணிகள் 👇",
        subText: "கீழே உள்ள பணிகளை முடிக்கவும். உங்கள் வருவாய் தானாகவே உங்கள் கணக்கில் சேர்க்கப்படும்.", logout: "வெளியேறு (Logout)",
        forgot: "கடவுச்சொல் மறந்துவிட்டதா?", recoverTitle: "கடவுச்சொல்லை மீட்டெடுக்கவும்", btnRecover: "மீட்டெடுப்போம்",
        cpaTitle: "🔗 CPA நெட்வொர்க் இணைப்பு அமைப்புகள்", taskInstr: "பணி வழிமுறைகள்"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} 
        .container{max-width:850px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);position:relative;}
        .lang-selector { position: absolute; top: 15px; right: 15px; }
        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-weight: bold; }
        input, textarea, select.form-input {width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;}
        button:hover{background:#66fcf1;}
        .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-radius:5px;border-left:5px solid #45a29e;text-align:left;position:relative;}
        a{color:#66fcf1;text-decoration:none;} .logout-btn{background:#ff4d4d;color:#fff;width:auto;padding:5px 10px;font-size:12px;float:right;border-radius:3px;margin-left:5px;}
        .remove-btn{background:#ff4d4d;color:white;border:none;padding:5px 10px;font-size:11px;cursor:pointer;border-radius:3px;float:right;margin-top:-20px;}
        .cpa-box{background:#111a24; padding:15px; border:1px solid #66fcf1; border-radius:5px; margin-top:15px; text-align:left;}
    </style></head><body><div class="container">
    <div class="lang-selector">
        <select onchange="window.location.href='/change-lang?lang=' + this.value}">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
            <option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option>
        </select>
    </div><h2 style="text-align:center;color:#66fcf1;margin-top:15px;">${translations[lang].title}</h2>${content}</div></body></html>`;
};

app.get('/change-lang', (req, res) => {
    const selectedLang = req.query.lang;
    if (['en', 'si', 'ta'].includes(selectedLang)) {
        req.session.lang = selectedLang;
    }
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

// REGISTER PAGE
app.get('/register', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Register', `
        <h3>${t.reg}</h3>
        <form action="/register" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <input type="password" name="password" placeholder="${t.pass}" required>
            <input type="email" name="email" placeholder="${t.email}" required>
            <input type="text" name="address" placeholder="${t.addr}" required>
            <input type="text" name="contact" placeholder="${t.phone}" required>
            <button type="submit">${t.btnReg}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

// REGISTER POST ACTION
app.post('/register', (req, res) => {
    const { username, password, email, address, contact } = req.body;
    db.run("INSERT INTO users (username, password, email, address, contact) VALUES (?, ?, ?, ?, ?)", [username, password, email, address, contact], (err) => {
        if (err) return res.send("<script>alert('Username already exists!'); window.location.href='/register';</script>");
        backupToGoogleSheet(username, email, 0.0, 0); // Backup to external sheet
        res.send("<script>alert('Registration Successful!'); window.location.href='/';</script>");
    });
});

// LOGIN POST ACTION
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
        if (user) {
            req.session.user = user.username;
            res.redirect('/dashboard');
        } else {
            res.send("<script>alert('Invalid Credentials'); window.location.href='/';</script>");
        }
    });
});

// FORGOT PASSWORD
app.get('/forgot-password', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Forgot Password', `
        <h3>${t.recoverTitle}</h3>
        <form action="/forgot-password" method="POST">
            <input type="text" name="username" placeholder="${t.user}" required>
            <button type="submit">${t.btnRecover}</button>
        </form>
        <p style="text-align:center;"><a href="/">${t.backLog}</a></p>
    `));
});

app.post('/forgot-password', (req, res) => {
    const { username } = req.body;
    db.get("SELECT password FROM users WHERE username = ?", [username], (err, row) => {
        if (row) {
            res.send(htmlWrapper(req, 'Recovered', `<h3>Your Password is: <span style="color:#66fcf1;">${row.password}</span></h3><p><a href="/">Back to Login</a></p>`));
        } else {
            res.send("<script>alert('User not found!'); window.location.href='/forgot-password';</script>");
        }
    });
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// DASHBOARD (USER & ADMIN)
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const username = req.session.user;
    const lang = req.session.lang || 'en';
    const t = translations[lang];

    if (username === 'admin') {
        // ADMIN DASHBOARD
        db.all("SELECT * FROM users WHERE username != 'admin'", (err, users) => {
            db.all("SELECT * FROM cpa_configs", (err, cpas) => {
                db.get("SELECT value FROM system_settings WHERE key = 'google_sheet_config'", (err, sheetRow) => {
                    db.get("SELECT value FROM system_settings WHERE key = 'global_earnings_percentage'", (err, globalPctRow) => {
                        
                        let currentSheetVal = sheetRow ? sheetRow.value : '';
                        let globalPct = globalPctRow ? globalPctRow.value : '100';

                        // 2. User Search Functionality (Requirement 2)
                        let searchUser = req.query.search_user || '';
                        let filteredUsers = users;
                        if(searchUser) {
                            filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchUser.toLowerCase()));
                        }

                        // Requirement 1: Calculate specific user task metrics inside loop
                        let usersHtml = `
                        <form method="GET" action="/dashboard" style="margin-bottom:20px;">
                            <input type="text" name="search_user" value="${searchUser}" placeholder="🔍 Search User by Username..." style="width:75%; display:inline-block;">
                            <button type="submit" style="width:20%; display:inline-block; margin-top:0; margin-left:10px;">Search</button>
                        </form>
                        <h3>Registered Workers Details & Earnings Metric</h3>`;
                        
                        filteredUsers.forEach(u => {
                            usersHtml += `
                            <div class="user-row">
                                <strong>User:</strong> ${u.username} | <strong>Pass:</strong> ${u.password} | <strong>Email:</strong> ${u.email}<br>
                                <strong>Contact:</strong> ${u.contact} | <strong>Address:</strong> ${u.address}<br>
                                <strong>Current Balance:</strong> $${u.balance.toFixed(2)}<br>
                                
                                <form action="/update-user-percentage" method="POST" style="margin:5px 0; display:inline-block;">
                                    <input type="hidden" name="username" value="${u.username}">
                                    <label>Custom Pay: </label>
                                    <input type="number" name="percentage" value="${u.earnings_percentage || 100}" style="width:60px; padding:2px; margin:0;"> % 
                                    <button type="submit" style="width:auto; padding:3px 8px; font-size:11px; display:inline-block; margin:0;">Set</button>
                                </form>
                                <a href="/remove-user?id=${u.id}" class="remove-btn" onclick="return confirm('Are you sure you want to remove this user?')">REMOVE USER</a>
                            </div>`;
                        });

                        let cpaHtml = `<h3>${t.cpaTitle}</h3>`;
                        cpas.forEach(c => {
                            cpaHtml += `
                            <div class="user-row">
                                <strong>${c.network_name}</strong> (Active: ${c.is_active ? 'Yes' : 'No'})
                                <a href="/remove-cpa?id=${c.id}" class="remove-btn">Remove</a>
                                <br><small>Embed Code length: ${c.embed_code.length} chars</small>
                            </div>`;
                        });

                        res.send(htmlWrapper(req, 'Admin Dashboard', `
                            <h2>Welcome Admin <a href="/logout" class="logout-btn">${t.logout}</a></h2>
                            <hr>
                            <h3>⚙️ Global Revenue Adjustments</h3>
                            <form action="/update-global-percentage" method="POST">
                                <label>Set Global Payout Rate for All Users (Default 100%): </label>
                                <input type="number" name="global_percentage" value="${globalPct}" required style="width:100px;"> %
                                <button type="submit" style="width:auto; padding:10px;">Update Global Scale</button>
                            </form>
                            <hr>
                            <h3>📊 External Google Sheet Sync Token/Keys</h3>
                            <form action="/save-sheet-config" method="POST">
                                <textarea name="sheet_config" placeholder='Paste your Google Service Account JSON & Spreadsheet ID here:\n{\n  "client_email": "...",\n  "private_key": "...",\n  "spreadsheet_id": "..."\n}' rows="5" required>${currentSheetVal}</textarea>
                                <button type="submit">Save API Config Connection</button>
                            </form>
                            <hr>
                            <h3>➕ Add CPA Networks (CPAGrip, MaxBounty, etc)</h3>
                            <form action="/add-cpa" method="POST">
                                <input type="text" name="network_name" placeholder="Network Name (e.g. CPAGrip)" required>
                                <textarea name="embed_code" placeholder="Paste Offer Wall / Task Iframe Embed HTML Code here" rows="3" required></textarea>
                                <input type="text" name="instructions_en" placeholder="Instructions (English)" required>
                                <input type="text" name="instructions_si" placeholder="Instructions (Sinhala)" required>
                                <input type="text" name="instructions_ta" placeholder="Instructions (Tamil)" required>
                                <button type="submit">Integrate CPA Network</button>
                            </form>
                            <hr>
                            ${cpaHtml}
                            <hr>
                            ${usersHtml}
                        `));
                    });
                });
            });
        });
    } else {
        // WORKER DASHBOARD
        db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
            db.all("SELECT * FROM cpa_configs WHERE is_active = 1", (err, cpas) => {
                db.get("SELECT value FROM system_settings WHERE key = 'global_earnings_percentage'", (err, globalPctRow) => {
                    db.all("SELECT * FROM task_logs WHERE username = ?", [username], (err, logs) => {
                        
                        let globalPct = globalPctRow ? parseFloat(globalPctRow.value) : 100.0;
                        let userPct = user.earnings_percentage !== undefined ? user.earnings_percentage : 100.0;
                        
                        // අවසාන වශයෙන් පරිශීලකයාට හිමිවන ප්‍රතිශතය ගණනය කිරීම
                        let finalPayoutScale = (globalPct / 100.0) * (userPct / 100.0) * 100.0;

                        // Requirement 1: Task logs සහ මුළු උපයන ප්‍රමාණයන් ලැයිස්තුගත කිරීම
                        let logsHtml = `<h4>Your Completed Tasks Log (${logs.length} tasks done)</h4><div style="font-size:13px; max-height:150px; overflow-y:auto;">`;
                        logs.forEach(l => {
                            logsHtml += `• ${l.task_name} - Earned: $${l.amount.toFixed(2)} (${l.timestamp})<br>`;
                        });
                        logsHtml += `</div>`;

                        // Requirement 4 & 7: Multiple CPA Sites තමන්ගේම Site එකක් ලෙස පෙන්වීම (White-labeled via Wrapper)
                        let cpaTasksHtml = '';
                        cpas.forEach(c => {
                            let customInstructions = c.instructions_en;
                            if (lang === 'si') customInstructions = c.instructions_si;
                            if (lang === 'ta') customInstructions = c.instructions_ta;

                            cpaTasksHtml += `
                            <div class="cpa-box">
                                <h4>🎯 ${c.network_name} - ${t.taskInstr}</h4>
                                <p style="color:#66fcf1; font-size:14px;">${customInstructions}</p>
                                <div style="background: #fff; padding: 5px; border-radius: 5px;">
                                    ${c.embed_code}
                                </div>
                            </div>`;
                        });

                        res.send(htmlWrapper(req, 'Worker Dashboard', `
                            <h2>${t.welcome}, ${username}! <a href="/logout" class="logout-btn">${t.logout}</a></h2>
                            <div style="background:#0b0c10; padding:15px; border-radius:5px; border:1px solid #45a29e; margin-bottom:20px;">
                                <span style="font-size:14px; color:#45a29e;">${t.total}</span><br>
                                <span style="font-size:28px; font-weight:bold; color:#66fcf1;">$${user.balance.toFixed(2)}</span>
                                <p style="font-size:11px; margin:5px 0 0 0; color:#888;">Your customized pay rate scale: ${finalPayoutScale.toFixed(1)}%</p>
                            </div>
                            
                            ${logsHtml}
                            <hr>
                            <h3>${t.tasks}</h3>
                            <p>${t.subText}</p>
                            
                            ${cpaTasksHtml}
                        `));

                        // Backup automation triggered silently on login dashboard load to prevent loss
                        backupToGoogleSheet(user.username, user.email, user.balance, logs.length);
                    });
                });
            });
        });
    }
});

// 3. REMOVE USER ROUTE (Requirement 3)
app.get('/remove-user', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const userId = req.query.id;
    db.run("DELETE FROM users WHERE id = ?", [userId], (err) => {
        res.send("<script>alert('User removed successfully.'); window.location.href='/dashboard';</script>");
    });
});

// 6. UPDATE USER PAY PERCENTAGE (Requirement 6)
app.post('/update-user-percentage', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { username, percentage } = req.body;
    db.run("UPDATE users SET earnings_percentage = ? WHERE username = ?", [percentage, username], (err) => {
        res.redirect('/dashboard');
    });
});

// 6. UPDATE GLOBAL PAY PERCENTAGE (Requirement 6)
app.post('/update-global-percentage', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { global_percentage } = req.body;
    db.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('global_earnings_percentage', ?)", [global_percentage], (err) => {
        res.redirect('/dashboard');
    });
});

// 5. SAVE GOOGLE SHEET CONFIG (Requirement 5)
app.post('/save-sheet-config', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { sheet_config } = req.body;
    db.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('google_sheet_config', ?)", [sheet_config], (err) => {
        res.send("<script>alert('Google Sheet Configuration Saved!'); window.location.href='/dashboard';</script>");
    });
});

// 7. ADD CPA NETWORK ROUTE (Requirement 7)
app.post('/add-cpa', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { network_name, embed_code, instructions_en, instructions_si, instructions_ta } = req.body;
    db.run("INSERT INTO cpa_configs (network_name, embed_code, instructions_en, instructions_si, instructions_ta) VALUES (?, ?, ?, ?, ?)", 
        [network_name, embed_code, instructions_en, instructions_si, instructions_ta], (err) => {
            res.redirect('/dashboard');
    });
});

// REMOVE CPA NETWORK
app.get('/remove-cpa', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const cpaId = req.query.id;
    db.run("DELETE FROM cpa_configs WHERE id = ?", [cpaId], (err) => {
        res.redirect('/dashboard');
    });
});

app.listen(3000, () => {
    console.log('Galaxy Server running on http://localhost:3000');
});
