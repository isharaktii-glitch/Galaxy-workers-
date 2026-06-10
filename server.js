const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. FIXED USER REGISTRATION BACKEND
// ==========================================
app.post('/register', async (req, res) => {
    // Frontend එකෙන් එන data ටික destructure කරගන්නවා
    const { name, password, email, address, phone } = req.body;

    // කිසිම දත්තයක් හිස්ව එන්න බැරි වෙන්න check කිරීමක්
    if (!name || !password || !email || !address || !phone) {
        return res.status(400).json({ 
            success: false, 
            message: "All fields are required to register." 
        });
    }

    try {
        // FIX: Parameterized Queries ($1, $2, etc.) භාවිතා කර ඇති නිසා 
        // "bind message supplies 0 parameters" හෝ 'column "ishara" does not exist' වැරදි නැවත ඇති නොවේ!
        const query = `
            INSERT INTO users (name, password, email, address, phone, balance) 
            VALUES ($1, $2, $3, $4, $5, 0.00) 
            RETURNING id
        `;
        const values = [name, password, email, address, phone];
        
        await pool.query(query, values);
        
        res.json({ success: true, message: "Registration successful!" });
    } catch (err) {
        console.error("Registration Error Details:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "Error registering user.", 
            technicalInfo: err.message 
        });
    }
});

// ==========================================
// 2. FIXED WORKER VIEW RENDERING (FRONTEND HTML)
// ==========================================
app.get('/api/tasks', async (req, res) => {
    const lang = req.query.lang || 'en';

    // ඩමි හෝ ඩේටාබේස් එකෙන් එන CPA Tasks ටිකක් (ඔයාගේ dashboard එකට ගැලපෙන ලෙස)
    const t = {
        tasks: "Available Premium Micro Tasks",
        subText: "Complete the verified Galaxy system tasks below. Submit accurate proof data for fast validation."
    };

    try {
        // දැනට active CPA nodes ටික database එකෙන් ගන්නවා
        const result = await pool.query("SELECT * FROM cpa_tasks WHERE status = 'active'");
        const cpas = result.rows;

        // Clean Branded Task Cards - Fully White & Hides CPALead traces
        let cpaTasksHtml = `<h3>${t.tasks}</h3><p>${t.subText}</p>`;
        
        if (cpas.length === 0) {
            cpaTasksHtml += `<p style="text-align:center; color:#ff4d4d; font-weight:bold; margin-top:20px;">No system data verification lines open right now. Refresh shortly!</p>`;
        } else {
            cpas.forEach(c => {
                let instructions = c.instructions_en;
                if (lang === 'si') instructions = c.instructions_si || c.instructions_en;
                if (lang === 'ta') instructions = c.instructions_ta || c.instructions_en;

                cpaTasksHtml += `
                <div class="galaxy-secure-node-wrapper" style="margin-bottom: 25px; padding: 15px; border: 1px solid #45a29e; border-radius: 8px;">
                    <h4 style="color:#66fcf1; margin:0 0 5px 0; text-align:left;">🌐 Core System Node: ${c.network_name}</h4>
                    <p style="font-size:14px; color:#45a29e; text-align:left;">📋 <strong>Execution Instructions:</strong> ${instructions}</p>
                    
                    <div class="galaxy-task-card-white" style="background:#fff; color:#333; padding:20px; border-radius:8px; text-align:center; margin:15px 0;">
                        <h4 style="color:#111; margin-top:0;">Galaxy Verification Protocol</h4>
                        <p style="color:#555; font-size:14px;">To securely register your interaction and auto-credit $0.50 into your balance ledger, click the button below and follow the security checkpoint verification step.</p>
                        
                        <a href='${c.embed_code}' target='_blank' class='galaxy-start-btn' style='display:inline-block; background:#00ffcc; color:#000; padding:10px 20px; text-decoration:none; font-weight:bold; border-radius:4px; margin-top:10px;'>⚡ START VERIFICATION TASK</a>
                    </div>
                    
                    <div class="proof-form">
                        <form action="/submit-task-proof" method="POST">
                            <input type="hidden" name="task_name" value="${c.network_name}">
                            <div style="margin-bottom:10px; text-align:left;">
                                <label style="font-size:12px; color:#45a29e;"><strong>Submit Verification Tracking Code/Identity:</strong></label>
                            </div>
                            <input type="text" name="proof_data" placeholder="Type your confirmation identifier string here..." required style="width:100%; padding:10px; margin-bottom:10px; border-radius:4px; border:1px solid #45a29e; background:#1f2833; color:#fff;">
                            <button type="submit" style="width:100%; padding:10px; font-size:14px; background:#66fcf1; color:#0b0c10; font-weight:bold; border:none; border-radius:4px; cursor:pointer;">Transmit Verification Token</button>
                        </form>
                    </div>
                </div>`;
            });
        }

        res.json({ html: cpaTasksHtml });
    } catch (err) {
        res.status(500).json({ error: "Failed to load tasks." });
    }
});

// ==========================================
// 3. TASK PROOF SUBMISSION & ADMIN LOGS
// ==========================================
app.post('/submit-task-proof', async (req, res) => {
    const { task_name, proof_data } = req.body;
    // සාමාන්‍යයෙන් මේවා session/token වලින් ගන්නා අතර උදාහරණයක් ලෙස දමා ඇත
    const worker_name = req.body.worker_name || "Anonymous Worker"; 

    try {
        await pool.query(
            "INSERT INTO submissions (worker_name, task_name, proof_data, status, submitted_at) VALUES ($1, $2, $3, 'pending', NOW())",
            [worker_name, task_name, proof_data]
        );
        res.send(`<script>alert('Token transmitted successfully! Waiting for admin validation.'); window.location.href='/';</script>`);
    } catch (err) {
        res.status(500).send("Error submitting proof.");
    }
});

// Admin Panel එකට submissions බලාගන්න වෙනම API එකක්
app.get('/api/admin/submissions', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM submissions ORDER BY submitted_at DESC");
        res.json({ submissions: result.rows });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch submissions." });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Galaxy Workers Server running on port ${PORT}`);
});
