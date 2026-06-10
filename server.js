const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));
app.set('view engine', 'ejs'); // EJS භාවිතා කරන බව උපකල්පනය කර ඇත

// 🗄️ DATABASE INITIALIZATION
async function initDb() {
    await sql(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE, password VARCHAR(50), email VARCHAR(100), address TEXT, contact VARCHAR(20), balance_numeric NUMERIC(10,2) DEFAULT 0.0, earnings_percentage NUMERIC(5,2) DEFAULT 100.0)`);
    await sql(`CREATE TABLE IF NOT EXISTS task_logs (id SERIAL PRIMARY KEY, username VARCHAR(50), task_name VARCHAR(100), proof_data TEXT, amount NUMERIC(10,2) DEFAULT 0.50, status VARCHAR(20), timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await sql(`CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, target_user VARCHAR(50), message TEXT, is_read INTEGER DEFAULT 0, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await sql(`CREATE TABLE IF NOT EXISTS system_settings (key VARCHAR(100) PRIMARY KEY, value TEXT)`);
    console.log("Database Initialized!");
}

// 🔔 ස්වයංක්‍රීය Notification ශ්‍රිතය
async function createNotification(username, message) {
    await sql(`INSERT INTO notifications (target_user, message) VALUES ($1, $2)`, [username, message]);
}

// 🖥️ USER DASHBOARD ROUTE (උදාහරණයක්)
app.get('/dashboard', async (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    // Notification Count ලබාගැනීම
    const unreadCount = await sql(`SELECT COUNT(*) FROM notifications WHERE target_user = $1 AND is_read = 0`, [user.username]);
    
    // Notifications ලැයිස්තුව ලබාගැනීම
    const notifications = await sql(`SELECT * FROM notifications WHERE target_user = $1 ORDER BY timestamp DESC`, [user.username]);

    res.render('dashboard', { user, notifications, unreadCount: unreadCount[0].count });
});

// 📖 Notification කියවූ බව සලකුණු කිරීම (Mark as read)
app.post('/notifications/read', async (req, res) => {
    const { id } = req.body;
    await sql(`UPDATE notifications SET is_read = 1 WHERE id = $1`, [id]);
    res.json({ success: true });
});

// 🛠️ TASK SUBMISSION (ස්වයංක්‍රීය Notification සහිත)
app.post('/submit-task', async (req, res) => {
    const { task_name, proof_data } = req.body;
    const username = req.session.user.username;

    await sql(`INSERT INTO task_logs (username, task_name, proof_data, status) VALUES ($1, $2, $3, 'Pending')`, [username, task_name, proof_data]);
    
    await createNotification(username, `ඔබේ "${task_name}" කාර්යය සාර්ථකව භාර දී ඇත.`);
    res.redirect('/dashboard');
});

// --- UI කොටස (Dashboard EJS සඳහා HTML/CSS උදාහරණයක්) ---
/* Dashboard එකේ පහත කේතය භාවිතා කරන්න:
   
   <div class="notification-bell">
       Notifications (<span id="count"><%= unreadCount %></span>)
   </div>
   
   <div class="tasks-container">
       <div class="task-card">
           <h3>Task Name</h3>
           <button class="btn-primary" onclick="submitTask()">Complete Task</button>
       </div>
   </div>
*/

// ඉතිරි කොටස් (Backup logic ආදිය එලෙසම තබන්න)
let dbInitialized = false;
app.use(async (req, res, next) => {
    if (!dbInitialized) { await initDb(); dbInitialized = true; }
    next();
});

// ... ඉතිරි කේතය මෙතැන් සිට ...
