const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'galaxy-2026-super-secret', resave: false, saveUninitialized: true }));

// Root route - Login page
app.get('/', (req, res) => {
    res.send(`
        <h2>Login</h2>
        <form action="/login" method="POST">
            <input type="text" name="username" placeholder="Username" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Login</button>
        </form>
    `);
});

// Login handle
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            req.session.user = result.rows[0];
            res.redirect('/dashboard');
        } else {
            res.send("Invalid details!");
        }
    } catch (err) {
        res.status(500).send("Database error: " + err.message);
    }
});

// Dashboard route - මෙන්න මේකයි දැන් නැත්තේ
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.send(`<h1>Welcome to Dashboard</h1><p>Hello ${req.session.user.username}!</p><a href="/">Home</a>`);
});

// Vercel සඳහා Port එක
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
