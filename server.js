const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const db = new sqlite3.Database('/tmp/galaxy.db'); 

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'galaxy-super-secret-key-2026',
    resave: false,
    saveUninitialized: true
}));

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, balance REAL DEFAULT 0.0)");
    db.run("INSERT OR IGNORE INTO users (username, password, balance) VALUES ('admin', 'admin123', 0.0)");
});

const translations = {
    en: {
        title: "GALAXY WORKERS", loginTitle: "Worker Login", registerTitle: "Worker Registration",
        username: "Username", password: "Password", chooseUser: "Choose Username", choosePass: "Choose Password",
        btnLogin: "Log In", btnRegister: "Register", noAcc: "Don't have an account?", regHere: "Register here",
        hasAcc: "Already have an account?", logHere: "Login here", welcome: "Welcome", totalEarn: "Your Total Earnings",
        startEarn: "👇 Click below to start earning 👇", btnTimewall: "🚀 OPEN TIMEWALL", logout: "Logout",
        errUser: "Username already exists!", errInvalid: "Invalid Username or Password!", successReg: "Registration Successful!",
        tryAgain: "Try Again", loginNow: "Login Now", twAlert: "Timewall Offerwall system will be linked soon!"
    },
    si: {
        title: "GALAXY WORKERS", loginTitle: "සේවක ඇතුල්වීම", registerTitle: "සේවක ලියාපදිංචිය",
        username: "පරිශීලක නාමය (Username)", password: "මුරපදය (Password)", chooseUser: "Username එකක් තෝරන්න", choosePass: "Password එකක් තෝරන්න",
        btnLogin: "ඇතුල් වන්න (Log In)", btnRegister: "ලියාපදිංචි වන්න", noAcc: "ගිණුමක් නොමැතිද?", regHere: "මෙහි ලියාපදිංචි වන්න",
        hasAcc: "දැනටමත් ගිණුමක් තිබේද?", logHere: "මෙහි ලොග් වන්න", welcome: "ආයුබෝවන්", totalEarn: "ඔබේ මුළු උපයනය",
        startEarn: "👇 මුදල් ඉපයීම ආරම්භ කිරීමට පහත බොත්තම ඔබන්න 👇", btnTimewall: "🚀 OPEN TIMEWALL", logout: "ගිණුමෙන් ඉවත් වන්න (Logout)",
        errUser: "මෙම Username එක දැනටමත් භාවිතයේ ඇත!", errInvalid: "Username හෝ Password වැරදියි!", successReg: "ලියාපදිංචිය සාර්ථකයි!",
        tryAgain: "නැවත උත්සාහ කරන්න", loginNow: "දැන් ලොග් වන්න", twAlert: "Timewall Offerwall පද්ධතිය ළඟදීම සම්බන්ධ වේ!"
    },
    ta: {
        title: "GALAXY WORKERS", loginTitle: "பணியாளர் உள்நுழைவு", registerTitle: "பணியாளர் பதிவு",
        username: "பயனர் பெயர் (Username)", password: "கடவுச்சொல் (Password)", chooseUser: "Username-ஐ தேர்ந்தெடுக்கவும்", choosePass: "Password-ஐ தேர்ந்தெடுக்கவும்",
        btnLogin: "உள்நுழைக (Log In)", btnRegister: "பதிவு செய்க", noAcc: "கணக்கு இல்லையா?", regHere: "இங்கே பதிவு செய்யவும்",
        hasAcc: "ஏற்கனவே கணக்கு உள்ளதா?", logHere: "இங்கே உள்நுழையவும்", welcome: "வரவேற்கிறோம்", totalEarn: "உங்கள் மொத்த வருவாய்",
        startEarn: "👇 சம்பாதிக்கத் தொடங்க கீழே உள்ள பொத்தானைக் கிளிக் செய்யவும் 👇", btnTimewall: "🚀 OPEN TIMEWALL", logout: "வெளியேறு (Logout)",
        errUser: "இந்த Username ஏற்கனவே பணம் பாட்டில் உள்ளது!", errInvalid: "Username அல்லது Password தவறானது!", successReg: "பதிவு வெற்றிகரமாக முடிந்தது!",
        tryAgain: "மீண்டும் முயற்சிக்கவும்", loginNow: "இப்போது உள்நுழைக", twAlert: "Timewall Offerwall அமைப்பு விரைவில் இணைக்கப்படும்!"
    }
};

const htmlWrapper = (req, title, content) => {
    const lang = req.session.lang || 'en';
    const t = translations[lang];
    return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Galaxy Workers</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #0b0c10; color: #c5c6c7; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
        .container { max-width: 500px; width: 100%; background: #1f2833; padding: 40px 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.7); text-align: center; border: 1px solid #45a29e; position: relative; margin-bottom: 20px; }
        .lang-selector { position: absolute; top: 15px; right: 15px; }
        .lang-selector select { background: #0b0c10; color: #66fcf1; border: 1px solid #45a29e; padding: 5px 10px; border-radius: 5px; cursor: pointer; outline: none; font-weight: bold; }
        h2 { color: #66fcf1; font-size: 28px; margin-bottom: 10px; font-weight: 700; letter-spacing: 1px; margin-top: 15px; }
        h3 { color: #fff; font-size: 20px; margin-bottom: 25px; font-weight: 400; }
        h4 { color: #66fcf1; font-size: 18px; margin-top: 20px; margin-bottom: 10px; text-align: left; border-bottom: 1px solid #45a29e; padding-bottom: 5px; }
        p { font-size: 14px; margin-top: 15px; color: #a9a9a9; }
        input, select.form-input { width: 100%; padding: 12px 15px; margin: 10px 0; border: 1px solid #45a29e; border-radius: 8px; background: #0b0c10; color: #fff; font-size: 16px; transition: 0.3s; }
        input:focus { border-color: #66fcf1; outline: none; }
        button { width: 100%; padding: 14px; background-color: #45a29e; color: #0b0c10; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; transition: 0.3s; margin-top: 15px; text-transform: uppercase; }
        button:hover { background-color: #66fcf1; box-shadow: 0 0 15px rgba(102,252,241,0.4); }
        a { color: #66fcf1; text-decoration: none; font-weight: bold; }
        a:hover { text-decoration: underline; }
        .balance-box { background: #0b0c10; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px dashed #66fcf1; }
        .balance-title { font-size: 14px; color: #45a29e; text-transform: uppercase; }
        .balance-amount { font-size: 32px; color: #2ecc71; font-weight: bold; margin-top: 5px; }
        .error { color: #ff4d4d; background: rgba(255,77,77,0.1); padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 14px; }
        .success { color: #2ecc71; background: rgba(46,204,113,0.1); padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 14px; }
        .admin-panel { background: #151c24; border: 2px dashed #ff4d4d; border-radius: 10px; padding: 20px; margin-top: 30px; text-align: left; }
        .user-row { display: flex; justify-content: space-between; background: #0b0c10; padding: 8px 12px; margin: 5px 0; border-radius: 5px; font-size: 14px; align-items: center; }
        .btn-danger { background: #ff4d4d; color: #fff; padding: 5px 10px; font-size: 12px; width: auto; margin: 0; text-transform: none; }
        .btn-danger:hover { background: #ff3333; box-shadow: none; }
        .btn-small { padding: 8px; font-size: 14px; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="lang-selector">
            <select onchange="window.location.href='/change-lang?lang=' + this.value">
                <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
                <option value="si" ${lang === 'si' ? 'selected' : ''}>සිංහල</option>
                <option value="ta" ${lang === 'ta' ? 'selected' : ''}>தமிழ்</option>
            </select>
        </div>
        <h2>${t.title}</h2>
        ${content}
    </div>
</body>
</html>
`;
};

app.get('/change-lang', (req, res) => {
    const selectedLang = req.query.lang;
    if (['en', 'si', 'ta'].includes(selectedLang)) req.session.lang = selectedLang;
    res.redirect('back');
});

app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Login', `
        <h3>${t.loginTitle}</h3>
        <form action="/login" method="POST">
            <input type="text" name="username" placeholder="${t.username}" required>
            <input type="password" name="password" placeholder="${t.password}" required>
            <button type="submit">${t.btnLogin}</button>
        </form>
        <p>${t.noAcc} <a href="/register">${t.regHere}</a></p>
    `));
});

app.get('/register', (req, res) => {
    const t = translations[req.session.lang || 'en'];
    res.send(htmlWrapper(req, 'Register', `
        <h3>${t.registerTitle}</h3>
        <form action="/register" method="POST">
            <input type="text" name="username" placeholder="${t.chooseUser}" required>
            <input type="password" name="password" placeholder="${t.choosePass}" required>
            <button type="submit">${t.btnRegister}</button>
        </form>
        <p>${t.hasAcc} <a href="/">${t.logHere}</a></p>
    `));
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const t = translations[req.session.lang || 'en'];
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], (err) => {
        if (err) return res.send(htmlWrapper(req, 'Error', `<div class="error">${t.errUser}</div><a href="/register">${t.tryAgain}</a>`));
        res.send(htmlWrapper(req, 'Success', `<div class="success">${t.successReg}</div><a href="/">${t.loginNow}</a>`));
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) {
            req.session.user = row;
            res.redirect('/dashboard');
        } else {
            const t = translations[req.session.lang || 'en'];
            res.send(htmlWrapper(req, 'Error', `<div class="error">${t.errInvalid}</div><a href="/">${t.tryAgain}</a>`));
        }
    });
});

// Main Dashboard & Owner Admin Panel Logic
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const t = translations[req.session.lang || 'en'];
    const currentUser = req.session.user.username;

    db.get("SELECT balance FROM users WHERE username = ?", [currentUser], (err, row) => {
        let userBalance = row ? row.balance.toFixed(4) : '0.0000';
        
        let content = `
            <h3>${t.welcome}, ${currentUser}! 👋</h3>
            <div class="balance-box">
                <div class="balance-title">${t.totalEarn}</div>
                <div class="balance-amount">$${userBalance}</div>
            </div>
            <p style="margin-bottom: 15px; color:#fff;">${t.startEarn}</p>
            <button onclick="alert('${t.twAlert}')" style="background-color: #66fcf1; color: #0b0c10;">${t.btnTimewall}</button>
            <br><br>
        `;

        // මැනේජ්මන්ට් පැනල් එක පෙන්වන්නේ 'admin' නමින් ලොග් වුනොත් විතරයි
        if (currentUser === 'admin') {
            db.all("SELECT username, balance FROM users WHERE username != 'admin'", [], (err, rows) => {
                let userListHtml = '';
                if(rows && rows.length > 0) {
                    rows.forEach(user => {
                        userListHtml += `
                            <div class="user-row">
                                <span>👤 <b>${user.username}</b> ($${user.balance.toFixed(4)})</span>
                                <button class="btn-danger" onclick="if(confirm('Delete ${user.username}?')) window.location.href='/admin/delete?user=${user.username}'">Delete</button>
                            </div>
                        `;
                    });
                } else {
                    userListHtml = '<p style="text-align:center; color:#888;">No workers registered yet.</p>';
                }

                content += `
                    <div class="admin-panel">
                        <h3 style="color:#ff4d4d; font-weight:bold; border-bottom:1px solid #ff4d4d; padding-bottom:5px;">🛠️ OWNER CONTROL PANEL</h3>
                        
                        <h4>💰 Update Worker Balance</h4>
                        <form action="/admin/update-balance" method="POST">
                            <input type="text" name="worker_name" placeholder="Worker Username" required>
                            <input type="number" step="0.0001" name="amount" placeholder="Amount (e.g. 0.50)" required>
                            <button type="submit" class="btn-small" style="background:#2ecc71;">Update Balance</button>
                        </form>

                        <h4>👥 Registered Workers (${rows ? rows.length : 0})</h4>
                        <div style="max-height: 200px; overflow-y: auto; margin-top:10px;">
                            ${userListHtml}
                        </div>
                    </div>
                `;
                
                content += `<br><a href="/logout" style="color: #ff4d4d; font-size: 14px;">${t.logout}</a>`;
                res.send(htmlWrapper(req, 'Admin Dashboard', content));
            });
        } else {
            content += `<a href="/logout" style="color: #ff4d4d; font-size: 14px;">${t.logout}</a>`;
            res.send(htmlWrapper(req, 'Dashboard', content));
        }
    });
});

// Admin Route: Update Worker Balance
app.post('/admin/update-balance', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.status(403).send('Unauthorized');
    const { worker_name, amount } = req.body;
    
    db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [parseFloat(amount), worker_name], (err) => {
        res.redirect('/dashboard');
    });
});

// Admin Route: Delete User
app.get('/admin/delete', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.status(403).send('Unauthorized');
    const worker = req.query.user;
    
    db.run("DELETE FROM users WHERE username = ?", [worker], (err) => {
        res.redirect('/dashboard');
    });
});

app.get('/postback', (req, res) => {
    const { status, subid, reward } = req.query; 
    if (status === 'approved' || status === '1') {
        db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [parseFloat(reward), subid], (err) => {
            if (err) return res.status(500).send('Database Error');
            return res.send('OK'); 
        });
    } else {
        res.send('Invalid Transaction');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = app;
