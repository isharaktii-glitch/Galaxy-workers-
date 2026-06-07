const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
// දත්ත ගබඩාව (දැනට ඉන්න අයගේ Data මැකෙන්නේ නැති වෙන්න /tmp එකේ තියෙන්නේ)
const db = new sqlite3.Database('/tmp/galaxy.db'); 

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-secret', resave: false, saveUninitialized: true }));

// Tables නිර්මාණය කිරීම (දැනට තිබේ නම් අලුතින් හැදෙන්නේ නැත)
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, balance REAL DEFAULT 0.0, address TEXT, contact TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, task_name TEXT, amount REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
});

// හැම පේජ් එකකටම පොදු ලස්සන Dark Theme ඩිසයින් එක
const htmlWrapper = (req, title, content) => {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
    <style>
        body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;margin:0;} 
        .container{max-width:800px;margin:30px auto;background:#1f2833;padding:25px;border-radius:10px;border:1px solid #45a29e;box-shadow: 0px 0px 15px rgba(69, 162, 158, 0.2);}
        input{width:95%;padding:10px;margin:8px 0;border-radius:5px;border:1px solid #45a29e;background:#0b0c10;color:#fff;} 
        button{width:100%;padding:12px;background:#45a29e;border:none;color:#0b0c10;font-weight:bold;font-size:16px;border-radius:5px;cursor:pointer;margin-top:10px;}
        button:hover{background:#66fcf1;}
        .user-row{background:#0b0c10;padding:12px;margin:10px 0;border-radius:5px;border-left:5px solid #45a29e;}
        a{color:#66fcf1;text-decoration:none;} .logout-btn{background:#ff4d4d;color:#fff;width:auto;padding:5px 10px;font-size:12px;float:right;}
    </style></head><body><div class="container">${content}</div></body></html>`;
};

// 1. LOGIN PAGE
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.send(htmlWrapper(req, 'Login - Galaxy Workers', `
        <h2 style="text-align:center;color:#66fcf1;">GALAXY WORKERS LOGIN</h2>
        <form action="/login" method="POST">
            <input type="text" name="username" placeholder="Username" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">LOGIN</button>
        </form>
        <p style="text-align:center;">Don't have an account? <a href="/register">Register here</a></p>
    `));
});

// 2. REGISTER PAGE (Address & Contact එකතු කර ඇත)
app.get('/register', (req, res) => {
    res.send(htmlWrapper(req, 'Register - Galaxy Workers', `
        <h2 style="text-align:center;color:#66fcf1;">WORKER REGISTRATION</h2>
        <form action="/register" method="POST">
            <input type="text" name="username" placeholder="Choose Username (English)" required>
            <input type="password" name="password" placeholder="Choose Password" required>
            <input type="text" name="address" placeholder="Your Full Address" required>
            <input type="text" name="contact" placeholder="WhatsApp / Contact Number" required>
            <button type="submit">REGISTER</button>
        </form>
        <p style="text-align:center;"><a href="/">Back to Login</a></p>
    `));
});

app.post('/register', (req, res) => {
    const { username, password, address, contact } = req.body;
    db.run("INSERT INTO users (username, password, address, contact) VALUES (?, ?, ?, ?)", [username, password, address, contact], (err) => {
        if (err) return res.send(htmlWrapper(req, 'Error', `<h3>Username already exists!</h3><a href="/register">Try again</a>`));
        res.send(htmlWrapper(req, 'Success', `<h3>Registration Successful!</h3><a href="/">Click here to Login</a>`));
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if (row) { 
            req.session.user = row; 
            res.redirect('/dashboard'); 
        } else {
            res.send(htmlWrapper(req, 'Error', `<h3>Invalid Username or Password!</h3><a href="/">Try again</a>`));
        }
    });
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 3. DASHBOARD & ADMIN PANEL
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = req.session.user.username;

    if (user === 'admin') {
        // ADMIN PANEL: සේරම විස්තර සහ Passwords මෙතන පේනවා
        db.all("SELECT * FROM users WHERE username != 'admin'", [], (err, users) => {
            let list = users.map(u => `
                <div class="user-row">
                    <strong>User:</strong> ${u.username} | <strong>Current Balance:</strong> $${u.balance.toFixed(4)} <br>
                    <strong>Password:</strong> <span style="color:#66fcf1;">${u.password}</span> (Recovery) <br>
                    <strong>Address:</strong> ${u.address} | <strong>Contact:</strong> ${u.contact}
                </div>
            `).join('');
            
            res.send(htmlWrapper(req, 'Admin Panel', `
                <a href="/logout" class="logout-btn">Logout</a>
                <h2 style="color:#66fcf1;">Owner Control Panel</h2>
                <p>Welcome back, Boss! Here are your registered workers:</p>
                <hr style="border-color:#45a29e;">
                ${list || '<p>No workers registered yet.</p>'}
                <hr style="border-color:#45a29e;">
                <h3 style="margin-top:20px;"><a href="/admin/logs">📊 View Detailed Task Logs</a></h3>
            `));
        });
    } else {
        // WORKER DASHBOARD: සයිට් එක ඇතුළෙම වැඩ කරන්න IFrame එක දමා ඇත
        db.get("SELECT balance FROM users WHERE username = ?", [user], (err, row) => {
            res.send(htmlWrapper(req, 'Dashboard - Galaxy Workers', `
                <a href="/logout" class="logout-btn">Logout</a>
                <h2>Welcome, ${user}! ✨</h2>
                <div style="background:#0b0c10; padding:15px; border-radius:5px; margin-bottom:20px; border:1px solid #45a29e;">
                    <span style="font-size:18px;">Your Total Earnings:</span> 
                    <span style="font-size:24px; color:#66fcf1; font-weight:bold; float:right;">$${row.balance.toFixed(4)}</span>
                </div>
                <h3 style="color:#66fcf1; margin-bottom:10px;">Available Micro Tasks 👇</h3>
                <p style="font-size:13px; color:#aaa;">Complete the tasks below. Your earnings will automatically add to your balance.</p>
                
                <!-- ⚠️ වැදගත්: පහත තියෙන URL එකට ඔයාගේ Timewall Widget URL එක දාන්න -->
                <iframe src="https://timewall.io/embed/your-widget-id-here" width="100%" height="600px" frameborder="0" style="border-radius:8px; background:#fff;"></iframe>
            `));
        });
    }
});

// 4. ADMIN DETAILED TASK LOGS (සේවකයෝ කරපු හැම Task එකක්ම වෙන වෙනම බලන්න)
app.get('/admin/logs', (req, res) => {
    if (!req.session.user || req.session.user.username !== 'admin') return res.redirect('/');
    
    db.all("SELECT * FROM task_logs ORDER BY timestamp DESC", [], (err, logs) => {
        let logList = logs.map(l => `
            <div class="user-row" style="border-left-color: #66fcf1;">
                <strong>Worker:</strong> ${l.username} <br>
                <strong>Task Name:</strong> ${l.task_name} <br>
                <strong>Earned (After 30% Cut):</strong> <span style="color:#66fcf1;">$${l.amount.toFixed(4)}</span> <br>
                <small style="color:#aaa;">Time: ${l.timestamp}</small>
            </div>
        `).join('');
        
        res.send(htmlWrapper(req, 'Task Logs', `
            <a href="/dashboard" style="font-size:14px;"><- Back to Admin Panel</a>
            <h2 style="color:#66fcf1; margin-top:15px;">Completed Task Logs</h2>
            ${logList || '<p>No tasks completed yet.</p>'}
        `));
    });
});

// 5. AUTOMATIC TIMEWALL POSTBACK (30% ලාභය කපාගෙන සේවකයාට 70%ක් දෙන තැන)
app.get('/postback', (req, res) => {
    const { subid, reward, task_name } = req.query;
    
    if (subid && reward) {
        // 💰 Timewall එකෙන් එන මුදලෙන් 70%ක් විතරක් සේවකයාට දෙනවා (30% ඔයාගේ ලාභය)
        const workerReward = parseFloat(reward) * 0.70; 
        
        // සේවකයාගේ Balance එක සයිට් එකේ අප්ඩේට් කරනවා
        db.run("UPDATE users SET balance = balance + ? WHERE username = ?", [workerReward, subid]);
        
        // කරපු වැඩේ විස්තර Adminට පේන්න Log එකට දානවා
        db.run("INSERT INTO task_logs (username, task_name, amount) VALUES (?, ?, ?)", [subid, task_name || 'Micro Task', workerReward]);
        
        res.send('OK'); // Timewall එකට 'OK' කියා පණිවිඩයක් යැවීම
    } else {
        res.status(400).send('Invalid Parameters');
    }
});

// Vercel එකට ගැලපෙන්න Server එක Run කිරීම
module.exports = app;
