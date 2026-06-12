/**
 * Galaxy Workers Network Platform - Upgraded Core Server
 * Tech Stack: Node.js, Express, Express-Session, Neon Database (PostgreSQL), Googleapis
 * Version: 2.0.0 (Enhanced with Multi-Dashboard Gmail Sync Workflow, Dynamic Variable Multipliers, Nested Matrix Referrals & Cross-Border Localization Routing)
 */

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');

// Neon Database Connection Initialization
const sql = neon(process.env.DATABASE_URL);
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ 
    secret: 'galaxy-2026-super-secret', 
    resave: false, 
    saveUninitialized: true 
}));

// 🗄️ NEON DATABASE INITIALIZATION WITH EXTENDED RETROFITTED COLUMN MIGRATIONS
async function initDb() {
    try {
        // Base Legacy Table Architecture
        await sql(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL
        )`);

        try {
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contact VARCHAR(20)`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_numeric NUMERIC(10,2) DEFAULT 0.0`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS earnings_percentage NUMERIC(5,2) DEFAULT 100.0`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(100) DEFAULT NULL`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_username VARCHAR(50) DEFAULT NULL`);
            await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country_selection VARCHAR(100) DEFAULT 'Sri Lanka'`);
            console.log("Legacy User table schema migrated successfully!");
        } catch (migrationErr) {
            console.log("Migration columns check note (users):", migrationErr.message);
        }

        await sql(`CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            task_name VARCHAR(100) NOT NULL,
            proof_data TEXT,
            amount NUMERIC(10,2) DEFAULT 0.50,
            status VARCHAR(20) NOT NULL,
            timestamp VARCHAR(50) NOT NULL
        )`);

        await sql(`CREATE TABLE IF NOT EXISTS cpa_configs (
            id SERIAL PRIMARY KEY,
            network_name VARCHAR(100) NOT NULL,
            embed_code TEXT NOT NULL,
            instructions_en TEXT,
            instructions_si TEXT,
            instructions_ta TEXT,
            is_active INTEGER DEFAULT 1
        )`);

        await sql(`CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT
        )`);

        await sql(`INSERT INTO system_settings (key, value) VALUES ('global_earnings_percentage', '100') ON CONFLICT (key) DO NOTHING`);
        await sql(`INSERT INTO system_settings (key, value) VALUES ('google_sheet_config', '') ON CONFLICT (key) DO NOTHING`);
        
        // Dynamic Variable Configurations for Multipliers & Commission matrices
        await sql(`INSERT INTO system_settings (key, value) VALUES ('gmail_base_rate_usd', '0.25') ON CONFLICT (key) DO NOTHING`);
        await sql(`INSERT INTO system_settings (key, value) VALUES ('gmail_commission_tier_config', '{"tiers":[{"min":1,"max":2,"rate":4},{"min":3,"max":3,"rate":5},{"min":4,"max":7,"rate":6},{"min":8,"max":14,"rate":7},{"min":15,"max":24,"rate":10},{"min":25,"max":99999,"rate":15}]}') ON CONFLICT (key) DO NOTHING`);
        await sql(`INSERT INTO system_settings (key, value) VALUES ('gmail_instructions_global', '{"instructions_si": "කරුණාකර නිවැරදි තොරතුරු ඇතුලත් කර නව ජීමේල් ගිණුමක් සාදන්න. දුරකථන අංක සත්‍යාපනය අවශ්‍ය නොවන පරිදි සකසන්න.", "instructions_en": "Please create a new Gmail account using valid information. Ensure no phone verification lock is triggered."}') ON CONFLICT (key) DO NOTHING`);

        await sql(`CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            target_user VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            timestamp VARCHAR(50) NOT NULL,
            is_read INTEGER DEFAULT 0
        )`);

        try {
            await sql(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read INTEGER DEFAULT 0`);
            console.log("Notifications schema migrated successfully!");
        } catch (migrationErr) {
            console.log("Notifications migration note:", migrationErr.message);
        }

        // --- NEW ENHANCED CORE ENGINE TABLES FOR COMPREHENSIVE RECONCILIATION ---
        
        // 1. Gmail Accounts Task Log Infrastructure
        await sql(`CREATE TABLE IF NOT EXISTS gmail_tasks (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            tracking_code VARCHAR(100) NOT NULL,
            gmail_address VARCHAR(150) NOT NULL,
            gmail_password VARCHAR(100) NOT NULL,
            assigned_rate_usd NUMERIC(10,4) DEFAULT 0.25,
            status VARCHAR(30) DEFAULT 'PENDING',
            rejection_reason TEXT DEFAULT NULL,
            payment_status VARCHAR(30) DEFAULT 'UNPAID',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. Buyer Management Database Table Architecture
        await sql(`CREATE TABLE IF NOT EXISTS buyers (
            id SERIAL PRIMARY KEY,
            buyer_username VARCHAR(50) UNIQUE NOT NULL,
            buyer_password VARCHAR(100) NOT NULL,
            buyer_name VARCHAR(100)
        )`);
        
        // Seed an initial pipeline Buyer account if none exists
        await sql(`INSERT INTO buyers (buyer_username, buyer_password, buyer_name) 
                  VALUES ('galaxy_buyer', 'buyer2026pass', 'Global Gmail Broker') 
                  ON CONFLICT (buyer_username) DO NOTHING`);

        // 3. Buyer Liquidity and Escrow Proof Submission Ledger
        await sql(`CREATE TABLE IF NOT EXISTS buyer_proofs (
            id SERIAL PRIMARY KEY,
            buyer_username VARCHAR(50) NOT NULL,
            screenshot_url TEXT NOT NULL,
            status VARCHAR(30) DEFAULT 'PENDING',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 4. Overridden Custom Rates for specific high-volume nodes
        await sql(`CREATE TABLE IF NOT EXISTS custom_worker_rates (
            username VARCHAR(50) PRIMARY KEY,
            custom_rate_usd NUMERIC(10,4) NOT NULL
        )`);

        console.log("Neon Database Advanced Core Tables Initialized Successfully!");
    } catch (err) {
        console.error("Database Init Critical Error:", err);
    }
}

// Interceptor Middleware for Database State Preservation
let dbInitialized = false;
app.use(async (req, res, next) => {
    if (!dbInitialized) {
        await initDb();
        dbInitialized = true;
    }
    next();
});

// Helper for fetching system-wide settings dynamically
async function dbGetSetting(key) {
    try {
        const rows = await sql(`SELECT value FROM system_settings WHERE key = $1`, [key]);
        return rows.length > 0 ? { key, value: rows[0].value } : null;
    } catch (e) { return null; }
}

// Legacy Google Sheets Backup Implementation
async function backupToGoogleSheet(username, email, balance, taskCount) {
    const row = await dbGetSetting('google_sheet_config');
    if (!row || !row.value) return; 
    try {
        const config = JSON.parse(row.value); 
        if(!config.client_email || !config.private_key || !config.spreadsheet_id) return;
        // Proceed with legacy sheets logic...
    } catch(e) { console.error("Sheets backup failure:", e); }
}

/**
 * =========================================================================
 * CORE UPGRADE COMPONENT 1: ENHANCED REGISTER AND AUTOMATED TRACKING CODES
 * =========================================================================
 */

// Tracking Code Generator Utility
function parseInitials(name) {
    if (!name) return "GW";
    let parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (parts[0].length >= 2) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + "X").toUpperCase();
}

app.post('/auth/register', async (req, res) => {
    const { username, password, email, address, contact, referrer_link_code } = req.body;
    try {
        // Generate alphanumeric suffix sequence based on current sequence count
        const totalUsers = await sql(`SELECT COUNT(*) FROM users`);
        const nextIdInt = parseInt(totalUsers[0].count) + 1;
        const formattedIdStr = String(nextIdInt).padStart(3, '0');
        const initials = parseInitials(username);
        let tracking_code = `${initials}-${formattedIdStr}`;

        let referrer_username = null;
        if (referrer_link_code) {
            const refUser = await sql(`SELECT username, tracking_code FROM users WHERE tracking_code = $1`, [referrer_link_code]);
            if (refUser.length > 0) {
                referrer_username = refUser[0].username;
                // Inherited Nested Referral Matrix Mapping Routine
                tracking_code = `${refUser[0].tracking_code}/${initials}`;
            }
        }

        await sql(`INSERT INTO users (username, password, email, address, contact, tracking_code, referrer_username) 
                  VALUES ($1, $2, $3, $4, $5, $6, $7)`, 
                  [username, password, email, address, contact, tracking_code, referrer_username]);
        
        if (referrer_username) {
            const timeStr = new Date().toLocaleString();
            await sql(`INSERT INTO notifications (target_user, message, timestamp) 
                      VALUES ($1, $2, $3)`, 
                      [referrer_username, `New downline worker registered via your link! Node path assigned: ${tracking_code}`, timeStr]);
        }

        res.status(201).json({ success: true, tracking_code });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * =========================================================================
 * CORE UPGRADE COMPONENT 2: GEOLOCATION CROSS-BORDER ROUTING & WORKER TASKS
 * =========================================================================
 */

// Update worker tracking location metrics
app.post('/worker/select-country', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: "Unauthorized" });
    const { country } = req.body;
    try {
        await sql(`UPDATE users SET country_selection = $1 WHERE username = $2`, [country, req.session.username]);
        res.json({ success: true, message: "Country preferences successfully initialized." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Gmail instructions dynamically based on location routing
app.get('/worker/gmail-task-details', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: "Unauthorized" });
    try {
        const user = await sql(`SELECT country_selection, tracking_code FROM users WHERE username = $1`, [req.session.username]);
        const instructionRow = await dbGetSetting('gmail_instructions_global');
        const instructions = JSON.parse(instructionRow.value);

        // Fetch customized or global rate variable
        const customRate = await sql(`SELECT custom_rate_usd FROM custom_worker_rates WHERE username = $1`, [req.session.username]);
        const baseRateRow = await dbGetSetting('gmail_base_rate_usd');
        const activeRate = customRate.length > 0 ? customRate[0].custom_rate_usd : parseFloat(baseRateRow.value);

        res.json({
            tracking_code: user[0].tracking_code,
            country: user[0].country_selection,
            rate_usd: activeRate,
            rate_lkr: (activeRate * 180), // Dynamic projection mapping
            instructions: user[0].country_selection === "Sri Lanka" ? instructions.instructions_si : instructions.instructions_en
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit a generated Gmail account node for verification pipeline
app.post('/worker/submit-gmail', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: "Unauthorized" });
    const { gmail_address, gmail_password } = req.body;
    try {
        const user = await sql(`SELECT tracking_code FROM users WHERE username = $1`, [req.session.username]);
        const customRate = await sql(`SELECT custom_rate_usd FROM custom_worker_rates WHERE username = $1`, [req.session.username]);
        const baseRateRow = await dbGetSetting('gmail_base_rate_usd');
        const activeRate = customRate.length > 0 ? customRate[0].custom_rate_usd : parseFloat(baseRateRow.value);

        await sql(`INSERT INTO gmail_tasks (username, tracking_code, gmail_address, gmail_password, assigned_rate_usd) 
                  VALUES ($1, $2, $3, $4, $5)`, 
                  [req.session.username, user[0].tracking_code, gmail_address, gmail_password, activeRate]);

        res.json({ success: true, status: "PENDING" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch active worker pipeline stats dashboard
app.get('/worker/gmail-dashboard', async (req, res) => {
    if (!req.session.username) return res.status(401).json({ error: "Unauthorized" });
    try {
        const submissions = await sql(`SELECT id, gmail_address, assigned_rate_usd, status, rejection_reason FROM gmail_tasks WHERE username = $1 ORDER BY id DESC`, [req.session.username]);
        const referrals = await sql(`SELECT username, tracking_code FROM users WHERE referrer_username = $1`, [req.session.username]);
        
        res.json({
            submissions,
            referral_link_code: `https://galaxy-workers.vercel.app/register?ref=${req.session.username}`,
            referrals_count: referrals.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


/**
 * =========================================================================
 * CORE UPGRADE COMPONENT 3: BUYER CONTROL HOOKS INTERACTION INTERFACE
 * =========================================================================
 */

app.post('/auth/buyer-login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const rows = await sql(`SELECT * FROM buyers WHERE buyer_username = $1 AND buyer_password = $2`, [username, password]);
        if (rows.length > 0) {
            req.session.buyer_username = rows[0].buyer_username;
            req.session.role = 'buyer';
            res.json({ success: true, redirect: '/buyer/dashboard' });
        } else {
            res.status(401).json({ success: false, error: "Invalid Buyer Credentials" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch complete global logs structured sequentially with distinct tracking arrays
app.get('/buyer/pipeline-logs', async (req, res) => {
    if (!req.session.buyer_username) return res.status(401).json({ error: "Unauthorized" });
    try {
        const logs = await sql(`SELECT id, username, tracking_code, gmail_address, gmail_password, assigned_rate_usd, status FROM gmail_tasks ORDER BY id ASC`);
        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buyer action execution module containing transaction validation and nested commission trigger loops
app.post('/buyer/update-status', async (req, res) => {
    if (!req.session.buyer_username) return res.status(401).json({ error: "Unauthorized" });
    const { task_id, action, reason } = req.body; // action: 'DONE' or 'WRONG'
    const timestampStr = new Date().toLocaleString();

    try {
        const task = await sql(`SELECT * FROM gmail_tasks WHERE id = $1`, [task_id]);
        if (task.length === 0) return res.status(404).json({ error: "Task matrix index row not found." });
        
        const workerUsername = task[0].username;
        const rateUsd = parseFloat(task[0].assigned_rate_usd);

        if (action === 'DONE') {
            await sql(`UPDATE gmail_tasks SET status = 'DONE', rejection_reason = NULL WHERE id = $1`, [task_id]);
            
            // Credit basic rate directly to worker node
            await sql(`UPDATE users SET balance_numeric = balance_numeric + $1 WHERE username = $2`, [rateUsd, workerUsername]);
            
            // Push notification directly to user interface
            await sql(`INSERT INTO notifications (target_user, message, timestamp) VALUES ($1, $2, $3)`, 
                [workerUsername, `Your submitted Gmail account (${task[0].gmail_address}) has been approved! $${rateUsd} credited.`, timestampStr]);

            // --- COMPUTING NESTED SYSTEM REFERRAL COMMISSIONS MATRIX ROUTINE ---
            const workerDetails = await sql(`SELECT referrer_username FROM users WHERE username = $1`, [workerUsername]);
            if (workerDetails.length > 0 && workerDetails[0].referrer_username) {
                const referrer = workerDetails[0].referrer_username;
                
                // Fetch daily approved metrics for dynamic volumetric scale evaluation
                const dailyCountRows = await sql(`
                    SELECT COUNT(*) FROM gmail_tasks 
                    WHERE username = $1 AND status = 'DONE' 
                    AND timestamp >= CURRENT_DATE`, [workerUsername]);
                const dailyCount = parseInt(dailyCountRows[0].count);

                // Parse the dynamic configuration matrix
                const tierConfigRow = await dbGetSetting('gmail_commission_tier_config');
                const tiers = JSON.parse(tierConfigRow.value).tiers;
                
                let assignedLkrRate = 4; // Absolute base default boundary
                for(let tier of tiers) {
                    if (dailyCount >= tier.min && dailyCount <= tier.max) {
                        assignedLkrRate = tier.rate;
                        break;
                    }
                }
                
                // Standard Conversion multiplier projection mapping (LKR to USD converter matrix)
                const commissionUsd = assignedLkrRate / 180.0;
                await sql(`UPDATE users SET balance_numeric = balance_numeric + $1 WHERE username = $2`, [commissionUsd, referrer]);
                await sql(`INSERT INTO notifications (target_user, message, timestamp) VALUES ($1, $2, $3)`, 
                    [referrer, `Referral commission generated! Node ${workerUsername} completed a task. Earned $${commissionUsd.toFixed(4)} (LKR ${assignedLkrRate})`, timestampStr]);
            }

        } else if (action === 'WRONG') {
            await sql(`UPDATE gmail_tasks SET status = 'WRONG', rejection_reason = $1 WHERE id = $2`, [reason, task_id]);
            await sql(`INSERT INTO notifications (target_user, message, timestamp) VALUES ($1, $2, $3)`, 
                [workerUsername, `ALERT: Gmail (${task[0].gmail_address}) rejected by buyer. Reason: ${reason}`, timestampStr]);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Trigger Payment Ready Signal interface hook
app.post('/buyer/trigger-payment-ready', async (req, res) => {
    if (!req.session.buyer_username) return res.status(401).json({ error: "Unauthorized" });
    const { task_id } = req.body;
    try {
        await sql(`UPDATE gmail_tasks SET payment_status = 'PAYMENT READY' WHERE id = $1`, [task_id]);
        res.json({ success: true, message: "Payment ready notice signaled to administration." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit continuous transaction payload proof mapping logs
app.post('/buyer/upload-payment-proof', async (req, res) => {
    if (!req.session.buyer_username) return res.status(401).json({ error: "Unauthorized" });
    const { screenshot_url } = req.body;
    try {
        await sql(`INSERT INTO buyer_proofs (buyer_username, screenshot_url) VALUES ($1, $2)`, [req.session.buyer_username, screenshot_url]);
        res.json({ success: true, message: "Payment sheet asset uploaded successfully for verification." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


/**
 * =========================================================================
 * CORE UPGRADE COMPONENT 4: ADMINISTRATIVE METRICS OVERRIDE DASHBOARD
 * =========================================================================
 */

// Global administrative configuration update modules
app.post('/admin/configure-gmail-system', async (req, res) => {
    // Legacy system check hooks override placeholder logic integration
    const { base_rate_usd, tier_config_json, instructions_si, instructions_en } = req.body;
    try {
        if(base_rate_usd) {
            await sql(`UPDATE system_settings SET value = $1 WHERE key = 'gmail_base_rate_usd'`, [base_rate_usd]);
        }
        if(tier_config_json) {
            await sql(`UPDATE system_settings SET value = $1 WHERE key = 'gmail_commission_tier_config'`, [tier_config_json]);
        }
        if(instructions_si || instructions_en) {
            const configObj = { instructions_si, instructions_en };
            await sql(`UPDATE system_settings SET value = $1 WHERE key = 'gmail_instructions_global'`, [JSON.stringify(configObj)]);
        }
        res.json({ success: true, message: "Global structural workflow metrics overridden successfully." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Single Node Node override customization execution route 
app.post('/admin/override-worker-rate', async (req, res) => {
    const { username, custom_rate_usd } = req.body;
    try {
        await sql(`INSERT INTO custom_worker_rates (username, custom_rate_usd) 
                  VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET custom_rate_usd = $2`, [username, custom_rate_usd]);
        res.json({ success: true, message: `Custom task rate variable assigned to node: ${username}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get comprehensive worker performance matrices overview
app.get('/admin/worker-metrics', async (req, res) => {
    try {
        const generalMetrics = await sql(`
            SELECT username, count(*) as total, 
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) as done_count,
            SUM(CASE WHEN status = 'WRONG' THEN 1 ELSE 0 END) as wrong_count
            FROM gmail_tasks GROUP BY username`);
        
        const proofs = await sql(`SELECT * FROM buyer_proofs ORDER BY id DESC`);
        
        res.json({ generalMetrics, buyer_proofs: proofs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/admin/delete-proof', async (req, res) => {
    const { proof_id } = req.body;
    try {
        await sql(`DELETE FROM buyer_proofs WHERE id = $1`, [proof_id]);
        res.json({ success: true, message: "Asset entry removed cleanly." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Root entry point runtime binding handler
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Galaxy Core Core Workflow Engine online on port ${PORT}`);
});

module.exports = app;
