const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { Pool } = require('pg'); // PG එකතු කළා

const app = express();

// Neon Database සම්බන්ධතාවය
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// දත්ත ගබඩා කිරීම සඳහා දත්ත සමුදාය භාවිතා කිරීම (උදාහරණය)
// registration වැනි දේ සඳහා ඔබ Neon SQL queries භාවිතා කළ යුතුයි:
// await pool.query('INSERT INTO users (username, password, email) VALUES ($1, $2, $3)', [user, pass, email]);

// [ඉතිරි ඔබේ මුල් Code එක මෙතැනට එන ලෙස තබන්න...]

// උදාහරණයක් ලෙස user ලියාපදිංචි කරන කොටස මෙසේ වෙනස් විය යුතුයි:
app.post('/register', async (req, res) => {
    const { username, password, email } = req.body;
    try {
        await pool.query('INSERT INTO users (username, password, email) VALUES ($1, $2, $3)', [username, password, email]);
        res.send("ලියාපදිංචිය සාර්ථකයි!");
    } catch (err) {
        console.error(err);
        res.status(500).send("Database දෝෂයක් සිදුවිය.");
    }
});

// [ඔබේ ඉතිරි code කොටස් වලදී ද දත්ත තබා ගැනීමට 'let usersTable' වෙනුවට 'pool.query' භාවිතා කරන්න]

app.listen(3000, () => console.log("Server running..."));
