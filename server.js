Const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');

// Neon Database Connection
const sql = neon(process.env.DATABASE_URL);

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// 🗄️ NEON DATABASE INITIALIZATION WITH COLUMN AUTO-MIGRATION
async function initDb() {
    try {
        // Create base table if it doesn't exist
        await sql(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL
        )`);

        // AUTO-MIGRATION: Check and add missing columns if table already exists
        try {
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contact VARCHAR(20)`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_numeric NUMERIC(10,2) DEFAULT 0.0`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS earnings_percentage NUMERIC(5,2) DEFAULT 100.0`);
            console.log("Database schema migrated successfully (Columns checked)!");
        } catch (migrationErr) {
            console.log("Migration columns check note:", migrationErr.message);
        }

        // Task Logs Table
        await sql(`CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            task_name VARCHAR(100) NOT NULL,
            proof_data TEXT,
            amount NUMERIC(10,2) DEFAULT 0.50,
            status VARCHAR(20) NOT NULL,
            timestamp VARCHAR(50) NOT NULL
        )`);

        // CPA Configs Table
        await sql(`CREATE TABLE IF NOT EXISTS cpa_configs (
            id SERIAL PRIMARY KEY,
            network_name VARCHAR(100) NOT NULL,
            embed_code TEXT NOT NULL,
            instructions_en TEXT,
            instructions_si TEXT,
            instructions_ta TEXT,
            is_active INTEGER DEFAULT 1
        )`);

        // System Settings Table
        await sql(`CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT
        )`);

        await sql(`INSERT INTO system_settings (key, value) VALUES ('global_earnings_percentage', '100') ON CONFLICT (key) DO NOTHING`);
        await sql(`INSERT INTO system_settings (key, value) VALUES ('google_sheet_config', '') ON CONFLICT (key) DO NOTHING`);

        // Notifications Table
        await sql(`CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            target_user VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            timestamp VARCHAR(50) NOT NULL
        )`);

        // Admin Tasks Table (for tasks visible to users)
        await sql(`CREATE TABLE IF NOT EXISTS admin_tasks (
            id SERIAL PRIMARY KEY,
            task_name VARCHAR(100) NOT NULL,
            description TEXT,
            reward NUMERIC(10,2) DEFAULT 0.50,
            is_active BOOLEAN DEFAULT TRUE,
            created_at VARCHAR(50) NOT NULL
        )`);

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
        const rows = await sql(`SELECT value FROM system_settings WHERE key = $1`, [key]);
        return rows.length > 0 ? { key, value: rows[0].value } : null;
    } catch (e) { return null; }
}

// ==================== NOTIFICATION HELPERS ====================

async function createNotification(username, message) {
    const timestamp = new Date().toISOString();
    await sql(
        `INSERT INTO notifications (target_user, message, timestamp) 
         VALUES ($1, $2, $3)`,
        [username, message, timestamp]
    );
}

async function getUserNotifications(username) {
    return await sql(
        `SELECT * FROM notifications 
         WHERE target_user = $1 
         ORDER BY id DESC`,
        [username]
    );
}

async function markNotificationAsRead(id, username) {
    await sql(
        `UPDATE notifications 
         SET is_read = TRUE 
         WHERE id = $1 AND target_user = $2`,
        [id, username]
    );
}

async function getUnreadCount(username) {
    const result = await sql(
        `SELECT COUNT(*) as count FROM notifications 
         WHERE target_user = $1 AND is_read = FALSE`,
        [username]
    );
    return parseInt(result[0].count);
}

// ==================== AUTO NOTIFICATIONS ====================

async function sendTaskNotification(username, taskName, status, amount = 0) {
    let message = '';
    if (status === 'completed') {
        message = `✅ Task "${taskName}" completed successfully! +Rs. ${amount} added to your balance.`;
    } else if (status === 'failed') {
        message = `❌ Task "${taskName}" was not approved.`;
    } else if (status === 'balance_update') {
        message = `💰 Your balance has been updated by Rs. ${amount}.`;
    }
    if (message) await createNotification(username, message);
}

// ==================== ROUTES ====================

// User Dashboard (with notifications)
app.get('/dashboard', async (req, res) => {
    if (!req.session.username) return res.redirect('/login');

    const notifications = await getUserNotifications(req.session.username);
    const unreadCount = await getUnreadCount(req.session.username);
    const tasks = await sql(`SELECT * FROM admin_tasks WHERE is_active = TRUE ORDER BY id DESC`);

    // Example: Render your dashboard (adjust according to your template engine)
    res.send(`
        <h1>Welcome, ${req.session.username}</h1>
        <div>
            <h2>Notifications (${unreadCount})</h2>
            <ul>
                ${notifications.map(n => `
                    <li>
                        <a href="/notification/read/${n.id}">${n.message}</a>
                        ${n.is_read ? '' : ' <strong>(New)</strong>'}
                    </li>
                `).join('')}
            </ul>
        </div>
        <div>
            <h2>Available Tasks</h2>
            ${tasks.map(t => `
                <div style="border:1px solid #ccc; padding:10px; margin:10px 0; border-radius:8px;">
                    <h3>${t.task_name}</h3>
                    <p>${t.description || ''}</p>
                    <p>Reward: Rs. ${t.reward}</p>
                    <button onclick="window.location.href='/do-task/${t.id}'">Do This Task</button>
                </div>
            `).join('')}
        </div>
    `);
});

// Mark notification as read
app.get('/notification/read/:id', async (req, res) => {
    if (!req.session.username) return res.redirect('/login');
    await markNotificationAsRead(req.params.id, req.session.username);
    res.redirect('/dashboard');
});

// Admin - Add Notification
app.post('/admin/send-notification', async (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("Admin only");
    
    const { username, message } = req.body;
    if (username && message) {
        await createNotification(username, message);
        res.send("Notification sent successfully!");
    } else {
        res.send("Missing username or message");
    }
});

// Admin - Add New Task (visible to users)
app.post('/admin/add-task', async (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("Admin only");
    
    const { task_name, description, reward } = req.body;
    const timestamp = new Date().toISOString();
    
    await sql(
        `INSERT INTO admin_tasks (task_name, description, reward, created_at) 
         VALUES ($1, $2, $3, $4)`,
        [task_name, description, reward || 0.50, timestamp]
    );
    
    res.send("Task added and visible to users!");
});

// Example: When a task is completed (call this from your task completion route)
app.post('/complete-task', async (req, res) => {
    if (!req.session.username) return res.redirect('/login');
    
    const { task_name, amount } = req.body;
    // ... your existing task logic ...
    
    await sql(`INSERT INTO task_logs ...`); // your existing code
    
    // Auto notification
    await sendTaskNotification(req.session.username, task_name, 'completed', amount);
    
    res.send("Task completed!");
});

// Keep all your existing routes (Google, login, etc.) unchanged below...

// Your existing backupToGoogleSheet function remains the same
async function backupToGoogleSheet(username, email, balance, taskCount) {
    const row = await dbGetSetting('google_sheet_config');
    if (!row || !row.value) return; 
    try {
        const config = JSON.parse(row.value); 
        if(!config.client_email || !config.private_key || !config.spreadsheet_id) return;

        const auth = new google.auth.JWT(config.client_email, null, config.private_key.replace(/\\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
        const sheets = google.sheets({ version: 'v4', auth });
        // ... your existing code ...
    } catch(e) { console.error(e); }
}

// Start Server (keep your existing port logic)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
