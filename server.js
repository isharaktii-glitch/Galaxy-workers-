const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// ඔබගේ මුල් කේතයේ තිබූ translations සහ htmlWrapper මෙතැනටම අලවන්න (Copy-Paste)
const translations = { /* ඔබේ මුල් code එකේ translations මෙතැනට */ };
const htmlWrapper = (req, title, content) => { /* ඔබේ මුල් code එකේ htmlWrapper මෙතැනට */ };

// දත්ත සමුදා සම්බන්ධතාවය
const dbSaveSetting = async (key, value) => {
    await pool.query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
};

async function backupToGoogleSheet(username, email, balance, taskCount) {
    const { rows } = await pool.query('SELECT value FROM system_settings WHERE key = $1', ['google_sheet_config']);
    if (rows.length === 0 || !rows[0].value) return;
    try {
        const config = JSON.parse(rows[0].value);
        const auth = new google.auth.JWT(config.client_email, null, config.private_key.replace(/\\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
        const sheets = google.sheets({ version: 'v4', auth });
        await sheets.spreadsheets.values.append({
            spreadsheetId: config.spreadsheet_id, range: 'Sheet1!A:E', valueInputOption: 'USER_ENTERED',
            resource: { values: [[new Date().toISOString(), username, email, balance, taskCount]] }
        });
    } catch (e) { console.error("Google Sheet Backup Error:", e); }
}

// LOGIN & REGISTER (DB භාවිතා කරන ලෙස යාවත්කාලීන කර ඇත)
app.post('/register', async (req, res) => {
    const { username, password, email, address, contact } = req.body;
    try {
        await pool.query('INSERT INTO users (username, password, email, address, contact, balance, earnings_percentage) VALUES ($1, $2, $3, $4, $5, 0.0, 100.0)', [username, password, email, address, contact]);
        res.send("<script>alert('Registration Successful!'); window.location.href='/';</script>");
    } catch (e) { res.send("<script>alert('Error: Username exists!'); window.location.href='/register';</script>"); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (rows.length > 0) {
        req.session.user = rows[0].username;
        res.redirect('/dashboard');
    } else {
        res.send("<script>alert('Invalid Credentials'); window.location.href='/';</script>");
    }
});

// DASHBOARD (පැරණි logic එකම තබාගෙන DB query භාවිතා කරන්න)
app.get('/dashboard', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    // මෙතැනදී පැරණි usersTable වෙනුවට: const { rows: users } = await pool.query('SELECT * FROM users');
    // ඉන්පසු ඔබේ පැරණි HTML UI එක පෙන්වන්න.
});

// LOGOUT, FORGOT PASSWORD, API ROUTES සියල්ල ඉහත ආකාරයට pool.query භාවිතයෙන් යාවත්කාලීන කරන්න.

module.exports = app;
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
