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
            timestamp VARCHAR(50) NOT NULL
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

async function backupToGoogleSheet(username, email, balance, taskCount) {
    const row = await dbGetSetting('google_sheet_config');
    if (!row || !row.value) return; 
    try {
        const config = JSON.parse(row.value); 
        if(!config.client_email || !config.private_key || !config.spreadsheet_id) return;

        const auth = new google.auth.JWT(config.client_email, null, config.private_key.replace(/\\n/g, '\n'), ['https://www.googleapis.com/auth/spreadsheets']);
        const sheets = google.sheets({ version: 'v4', auth });


