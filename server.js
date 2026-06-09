const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🗄️ VERCEL COMPATIBLE DATA STRUCTURES
let usersTable = [
    {id: 1, username: 'admin', password: 'admin123', email: 'admin@galaxy.com', balance: 0.0, address: 'Headquarters', contact: '0000000000', earnings_percentage: 100.0}
];
let taskLogsTable = [
    // Example task logs with status for tracking
    {id: 1, username: 'sample_user', task_name: 'CPA Offer #1', amount: 1.50, status: 'Success', timestamp: '2026-06-08 10:00'},
    {id: 2, username: 'sample_user', task_name: 'CPA Offer #2', amount: 0.00, status: 'Failed', timestamp: '2026-06-08 10:15'}
];
let cpaConfigsTable = [];
let systemSettingsTable = [
    {key: 'global_earnings_percentage', value: '100'},
    {key: 'google_sheet_config', value: ''}
];

// Notifications Store (Requirement: Public & Personal notifications)
let notificationsTable = [
    {id: 1, target_user: 'all', message: 'Welcome to Galaxy Workers Network! Keep doing tasks to earn more.', timestamp: '2026-06-08 09:00'}
];

// Helper database functions
const dbGetSetting = (key) => {
    const item = systemSettingsTable.find(s => s.key === key);
    return item ? item : null;
};

const dbSaveSetting = (key, value) => {
    const index = systemSettingsTable.findIndex(s => s.key === key);
    if (index > -1) systemSettingsTable[index].value = value;
    else systemSettingsTable.push({key, value});
};

// Google Sheets Backup Function
async function backupToGoogleSheet(username, email, balance, taskCount) {
    const row = dbGetSetting('google_sheet_config');
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
        .iframe { width: 100%; height: 600px; border: none; border-radius: 8px; margin-top: 15px; }

        .cpa-box{background:#111a24; padding:15px; border:1px solid #66fcf1; border-radius:5px; margin-top:15px; text-align:left;}
        
        /* 🧭 NAVIGATION BAR STYLES */
        .navbar { display: flex; background: #0b0c10; border: 1px solid #45a29e; border-radius: 5px; margin-bottom: 20px; overflow: hidden; }
        .nav-tab { flex: 1; text-align: center; padding: 12px; color: #c5c6c7; font-weight: bold; cursor: pointer; background: #0b0c10; border: none; transition: 0.3s; }
        .nav-tab:hover { background: #1f2833; color: #66fcf1; }
        .nav-tab.active { background: #45a29e; color: #0b0c10; }
        .dashboard-section { display: none; }
        .dashboard-section.active { display: block; }

        /* 🔔 NOTIFICATION SYSTEM STYLES */
        .notification-bar { background: #111a24; border: 1px solid #ff4d4d; border-radius: 5px; padding: 12px; margin-bottom: 20px; text-align: left; }
        .notification-item { border-bottom: 1px solid #333; padding: 6px 0; font-size: 14px; color: #fff; }
        .notification-item.personal { color: #66fcf1; border-left: 3px solid #66fcf1; padding-left: 5px; }
        .notification-item.fail { color: #ff4d4d; border-left: 3px solid #ff4d4d; padding-left: 5px; }
            </style>
</head>
<body>${content}</body>
</html>`;
};


const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
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
        iframe { width: 100%; height: 600px; border: none; border-radius: 8px; margin-top: 15px; }
        .cpa-box{background:#111a24; padding:15px; border:1px solid #66fcf1; border-radius:5px; margin-top:15px; text-align:left;}
        .navbar { display: flex; background: #0b0c10; border: 1px solid #45a29e; border-radius: 5px; margin-bottom: 20px; overflow: hidden; }
        .nav-tab { flex: 1; text-align: center; padding: 12px; color: #c5c6c7; font-weight: bold; cursor: pointer; background: #0b0c10; border: none; transition: 0.3s; }
        .nav-tab:hover { background: #1f2833; color: #66fcf1; }
        .nav-tab.active { background: #45a29e; color: #0b0c10; }
        .dashboard-section { display: none; }
        .dashboard-section.active { display: block; }
        .badge-fail { background: #ff4d4d; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; }
        .badge-success { background: #45a29e; color: #0b0c10; padding: 2px 6px; border-radius: 3px; font-size: 11px; }
    </style>
    <script>
        function switchSection(sectionId) {
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
            event.target.classList.add('active');
        }
    </script>
</head><body><div class="container">
    <div class="lang-selector">
        <select onchange="window.location.href='/change-lang?lang=' + this.value}">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
            <option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option>
        </select>
    </div>
    <h2 style="text-align:center;color:#66fcf1;margin-top:15px;">${t.title}</h2>
    ${content}
</div></body></html>`;
};

        .badge-fail { background: #ff4d4d; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .badge-success { background: #45a29e; color: #0b0c10; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
    </style>
    
    <script>
        function switchSection(sectionId) {
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            
            document.getElementById(sectionId).classList.add('active');
            event.target.classList.add('active');
        }
    </script>
    </head><body><div class="container">
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
    const exists = usersTable.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
        return res.send("<script>alert('Username already exists!'); window.location.href='/register';</script>");
    }
    const newUser = {
        id: usersTable.length + 1,
        username, password, email, address, contact,
        balance: 0.0, earnings_percentage: 100.0
    };
    usersTable.push(newUser);
    backupToGoogleSheet(username, email, 0.0, 0); 
    res.send("<script>alert('Registration Successful!'); window.location.href='/';</script>");
});

// LOGIN POST ACTION
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = usersTable.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.user = user.username;
        res.redirect('/dashboard');
    } else {
        res.send("<script>alert('Invalid Credentials'); window.location.href='/';</script>");
    }
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
    const user = usersTable.find(u => u.username === username);
    if (user) {
        res.send(htmlWrapper(req, 'Recovered', `<h3>Your Password is: <span style="color:#66fcf1;">${user.password}</span></h3><p><a href="/">Back to Login</a></p>`));
    } else {
        res.send("<script>alert('User not found!'); window.location.href='/forgot-password';</script>");
    }
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// DASHBOARD (USER & ADMIN WITH DISTINCT SECTIONS)
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const username = req.session.user;
    const lang = req.session.lang || 'en';
    const t = translations[lang];

    if (username === 'admin') {
        // --- 🔵 ADMIN DASHBOARD ---
        const users = usersTable.filter(u => u.username !== 'admin');
        const cpas = cpaConfigsTable;
        const sheetRow = dbGetSetting('google_sheet_config');
        const globalPctRow = dbGetSetting('global_earnings_percentage');
        
        let currentSheetVal = sheetRow ? sheetRow.value : '';
        let globalPct = globalPctRow ? globalPctRow.value : '100';

        // Search Functionality
        let searchUser = req.query.search_user || '';
        let filteredUsers = users;
        if(searchUser) {
            filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchUser.toLowerCase()));
        }

        // Generate User rows HTML (Section 1)
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

        // Live User Dashboard Preview Container for Admin
        let livePreviewHtml = `
        <div style="background:#111a24; padding:20px; border-radius:8px; border:2px solid #45a29e; margin-top:15px;">
            <h3 style="color:#66fcf1;">${t.tasks}</h3>
            <p>${t.subText}</p>`;
        
        const activeCpasForAdmin = cpas.filter(c => c.is_active === 1);
        if(activeCpasForAdmin.length === 0) {
            livePreviewHtml += `<p style="color:#ff4d4d; text-align:center;">No active CPA Networks linked yet. Add one in Settings to see preview.</p>`;
        } else {
            activeCpasForAdmin.forEach(c => {
                let customInstructions = c.instructions_en;
                if (lang === 'si') customInstructions = c.instructions_si;
                if (lang === 'ta') customInstructions = c.instructions_ta;

                livePreviewHtml += `
                <div class="cpa-box" style="border-color:#45a29e;">
                    <h4>🎯 ${c.network_name} - ${t.taskInstr}</h4>
                    <p style="color:#66fcf1; font-size:14px;">${customInstructions}</p>
                    <div style="background: #fff; padding: 5px; border-radius: 5px;">
                        ${c.embed_code}
                    </div>
                </div>`;
            });
        }         livePreviewHtml += `
<div class="user-row" style="background:#1f2833; padding:15px; margin:15px 0; border-radius:8px; border-left:5px solid #66fcf1;">
    <h4 style="color:#66fcf1; margin-top:0;">🎁 Special Daily Bonus Task</h4>
    <p>Complete the task below to earn your daily bonus rewards!</p>
    <a href="https://www.mobilerewards.link/unlock/M6Pv" target="_blank" 
       style="display:inline-block; padding:10px 20px; background:#45a29e; color:#0b0c10; font-weight:bold; border-radius:5px; text-decoration:none;">
       COMPLETE TASK NOW
    </a>
</div>`;

        livePreviewHtml += `</div>`;

        res.send(htmlWrapper(req, 'Admin Dashboard', `
            <h2>Welcome Admin <a href="/logout" class="logout-btn">${t.logout}</a></h2>
            
            <div class="navbar">
                <button class="nav-tab active" onclick="switchSection('admin-panel')">⚙️ Admin Control Panel</button>
                <button class="nav-tab" onclick="switchSection('user-metrics')">👥 User Details & Metrics</button>
                <button class="nav-tab" onclick="switchSection('live-view')">👁️ Live Task Dashboard Preview</button>
            </div>

            <div id="admin-panel" class="dashboard-section active">
                <h3>📢 Broadcast & Personal Notification Dispatch Panel</h3>
                <form action="/send-notification" method="POST" style="background:#111a24; padding:15px; border-radius:5px; border:1px solid #45a29e;">
                    <label>Select Target Recipient:</label>
                    <select name="target_user" class="form-input" style="width:100%;">
                        <option value="all">📢 Broadcast to All Workers (සියලුම දෙනාට)</option>
                        ${users.map(u => `<option value="${u.username}">👤 Personal to: ${u.username}</option>`).join('')}
                    </select>
                    <input type="text" name="message" placeholder="Type notification message here..." required>
                    <button type="submit">Send Notification Alert</button>
                </form>
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
            </div>

            <div id="user-metrics" class="dashboard-section">
                ${usersHtml}
            </div>

            <div id="live-view" class="dashboard-section">
                <h3>Live User Dashboard Preview (For Admin Testing)</h3>
                ${livePreviewHtml}
            </div>
        `));
    } else {
        // --- 🟢 WORKER DASHBOARD (ADMIN DASHBOARD සම්පූර්ණයෙන්ම වසා ඇත) ---
        const user = usersTable.find(u => u.username === username);
        const cpas = cpaConfigsTable.filter(c => c.is_active === 1);
        const globalPctRow = dbGetSetting('global_earnings_percentage');
        const logs = taskLogsTable.filter(l => l.username === username);
        
        // Fetch matching notifications for this specific user or broadcast to all
        const myNotifications = notificationsTable.filter(n => n.target_user === 'all' || n.target_user === username);

        let globalPct = globalPctRow ? parseFloat(globalPctRow.value) : 100.0;
        let userPct = user.earnings_percentage !== undefined ? user.earnings_percentage : 100.0;
        let finalPayoutScale = (globalPct / 100.0) * (userPct / 100.0) * 100.0;

        // Dynamic Notification UI Generator
        let notificationBarHtml = '';
        if (myNotifications.length > 0) {
            notificationBarHtml = `<div class="notification-bar"><h4>🔔 Notifications / පණිවිඩ</h4>`;
            myNotifications.reverse().forEach(n => {
                let personalClass = n.target_user !== 'all' ? 'personal' : '';
                let failClass = n.message.toLowerCase().includes('fail') ? 'fail' : '';
                notificationBarHtml += `<div class="notification-item ${personalClass} ${failClass}">• ${n.message} <span style="font-size:11px; color:#66fcf1; float:right;">${n.timestamp}</span></div>`;
            });
            notificationBarHtml += `</div>`;
        }

        // Task Log generator with status tags (Success/Fail notification inside log)
        let logsHtml = `<h4>Your Completed Tasks Log (${logs.length} tasks recorded)</h4><div style="font-size:13px; max-height:150px; overflow-y:auto;">`;
        logs.forEach(l => {
            let statusBadge = l.status === 'Success' ? `<span class="badge-success">SUCCESS</span>` : `<span class="badge-fail">FAILED</span>`;
            logsHtml += `• ${l.task_name} - Earned: $${l.amount.toFixed(2)} | Status: ${statusBadge} <span style="color:#555; font-size:11px;">(${l.timestamp})</span><br>`;
        });
        logsHtml += `</div>`;

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
            
            <div class="navbar">
                <button class="nav-tab active" onclick="switchSection('worker-tasks')">🎯 Available Tasks Section</button>
                <button class="nav-tab" onclick="switchSection('worker-logs')">📊 My Logs & Profile Metric</button>
            </div>

            ${notificationBarHtml}

            <div id="worker-tasks" class="dashboard-section active">
                <div style="background:#0b0c10; padding:15px; border-radius:5px; border:1px solid #45a29e; margin-bottom:20px;">
                    <span style="font-size:14px; color:#45a29e;">${t.total}</span><br>
                    <span style="font-size:28px; font-weight:bold; color:#66fcf1;">$${user.balance.toFixed(2)}</span>
                    <p style="font-size:11px; margin:5px 0 0 0; color:#888;">Your customized pay rate scale: ${finalPayoutScale.toFixed(1)}%</p>
                </div>
                <h3>${t.tasks}</h3>
                <p>${t.subText}</p>
                ${cpaTasksHtml}
            </div>

            <div id="worker-logs" class="dashboard-section">
                <div style="background:#111a24; padding:20px; border-radius:5px; border:1px solid #45a29e;">
                    <h3>👤 Account Profile Metrics</h3>
                    <p><strong>Username:</strong> ${user.username}</p>
                    <p><strong>Email Address:</strong> ${user.email}</p>
                    <p><strong>Registered Contact:</strong> ${user.contact}</p>
                    <hr style="border:1px solid #333;">
                    ${logsHtml}
                </div>
            </div>
        `));

        backupToGoogleSheet(user.username, user.email, user.balance, logs.length);
    }
});

// 📢 POST ROUTE: ADMIN NOTIFICATION DISPATCHER
app.post('/send-notification', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { target_user, message } = req.body;
    
    const now = new Date();
    const timestampStr = now.toISOString().replace('T', ' ').substring(0, 16);
    
    notificationsTable.push({
        id: notificationsTable.length + 1,
        target_user,
        message,
        timestamp: timestampStr
    });
    
    res.send("<script>alert('Notification dispatched successfully!'); window.location.href='/dashboard';</script>");
});

// REMOVE USER ROUTE
app.get('/remove-user', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const userId = parseInt(req.query.id);
    usersTable = usersTable.filter(u => u.id !== userId);
    res.send("<script>alert('User removed successfully.'); window.location.href='/dashboard';</script>");
});

// UPDATE USER PAY PERCENTAGE
app.post('/update-user-percentage', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { username, percentage } = req.body;
    const user = usersTable.find(u => u.username === username);
    if(user) user.earnings_percentage = parseFloat(percentage);
    res.redirect('/dashboard');
});

// UPDATE GLOBAL PAY PERCENTAGE
app.post('/update-global-percentage', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { global_percentage } = req.body;
    dbSaveSetting('global_earnings_percentage', global_percentage);
    res.redirect('/dashboard');
});

// SAVE GOOGLE SHEET CONFIG
app.post('/save-sheet-config', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { sheet_config } = req.body;
    dbSaveSetting('google_sheet_config', sheet_config);
    res.send("<script>alert('Google Sheet Configuration Saved!'); window.location.href='/dashboard';</script>");
});

// ADD CPA NETWORK ROUTE
app.post('/add-cpa', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const { network_name, embed_code, instructions_en, instructions_si, instructions_ta } = req.body;
    cpaConfigsTable.push({
        id: cpaConfigsTable.length + 1,
        network_name, embed_code, instructions_en, instructions_si, instructions_ta, is_active: 1
    });
    res.redirect('/dashboard');
});

// REMOVE CPA NETWORK
app.get('/remove-cpa', (req, res) => {
    if (req.session.user !== 'admin') return res.redirect('/');
    const cpaId = parseInt(req.query.id);
    cpaConfigsTable = cpaConfigsTable.filter(c => c.id !== cpaId);
    res.redirect('/dashboard');
});

module.exports = app;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Galaxy Server running on port ${PORT}`);
});
