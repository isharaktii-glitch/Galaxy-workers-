const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { Pool } = require('pg'); // Neon Database සඳහා අවශ්‍ය වේ

const app = express();

// Neon Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// HTML Wrapper (ඔබේ කලින් තිබූ කෝඩ් එකමයි)
const htmlWrapper = (req, title, content) => {
    return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{background:#0b0c10;color:#c5c6c7;font-family:sans-serif;padding:20px;}</style>
    </head><body><div class="container">${content}</div></body></html>`;
};

// --- ROUTES ---

// 1. Home / Login Page
app.get('/', (req, res) => {
    res.send(htmlWrapper(req, "Login", `<h2>Login</h2><form action="/login" method="POST"><input type="text" name="username" placeholder="Username"><input type="password" name="password" placeholder="Password"><button type="submit">Login</button></form>`));
});

// 2. Login Logic
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Neon Database වෙතින් පරිශීලකයා පරීක්ෂා කිරීම
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            req.session.user = result.rows[0];
            res.redirect('/dashboard');
        } else {
            res.send("Invalid credentials! <a href='/'>Back</a>");
        }
    } catch (err) {
        res.status(500).send("Database Error");
    }
});

// 3. Dashboard Route (දැන් මෙය නිවැරදිව ක්‍රියා කරයි)
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    
    const content = `
        <h1>Welcome, ${req.session.user.username}</h1>
        <p>Your Balance: $${req.session.user.balance}</p>
        <a href="/logout">Logout</a>
    `;
    res.send(htmlWrapper(req, "Dashboard", content));
});

// 4. Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(3000, () => console.log("Server running on port 3000"));
