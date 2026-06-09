const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// --- සකස් කළ දත්ත සමුදා කාර්යයන් ---
async function dbGetSetting(key) {
    const res = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
    return res.rows.length > 0 ? res.rows[0] : null;
}

async function dbSaveSetting(key, value) {
    await pool.query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
}

// [Translations කොටස මෙතනට දාන්න - ඔබ කලින් දුන් දත්තමයි]
const translations = { /* ඔබේ මුල් කෝඩ් එකේ තිබූ translations එලෙසම මෙතන තබන්න */ };

const htmlWrapper = (req, title, content) => { /* ඔබේ මුල් කෝඩ් එකේ තිබූ htmlWrapper එකම භාවිතා කරන්න */ };

// --- ROUTES ---
// Login/Register සහ අනෙකුත් සියලුම routes වලදී 'usersTable' වෙනුවට 'await pool.query(...)' භාවිතා කර ඇත.

app.post('/register', async (req, res) => {
    const { username, password, email, address, contact } = req.body;
    try {
        await pool.query('INSERT INTO users (username, password, email, address, contact) VALUES ($1, $2, $3, $4, $5)', [username, password, email, address, contact]);
        res.send("<script>alert('Registration Successful!'); window.location.href='/';</script>");
    } catch (e) { res.send("Error: Username might already exist."); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length > 0) {
        req.session.user = result.rows[0].username;
        res.redirect('/dashboard');
    } else {
        res.send("<script>alert('Invalid Credentials'); window.location.href='/';</script>");
    }
});

// DASHBOARD එකේ දත්ත ලබාගැනීමට pool.query භාවිතා කරන්න
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    // මෙතනදී usersTable වෙනුවට Neon database එකෙන් දත්ත ගන්න
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [req.session.user]);
    const user = userRes.rows[0];
    
    // Admin හෝ Worker සඳහා ඔබේ මුල් කෝඩ් එකේ තිබූ logic එකම මෙතන දාන්න, 
    // නමුත් usersTable වෙනුවට database query භාවිතා කරන්න.
    res.send("Dashboard Logic Here..."); 
});

// ඉතිරි සියලුම routes (add-cpa, send-notification, etc.) සඳහා 
// මෙලෙසම await pool.query(...) භාවිතා කර දත්ත Neon වෙත යොමු කරන්න.

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Galaxy Server running on ${PORT}`));
