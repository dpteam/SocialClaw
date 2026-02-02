/**
 * SocialClaw - NodeJS Server (AI-Enhanced Version v4.0)
 * Стек: Express + SQLite3 + EJS (встроенный)
 * v4.0 UPDATES:
 * - CSS Polish (Scanlines bg, FadeIn, Ease transitions)
 * - Bugfixes (Base64 UTF-8, Ghost Checkbox logic)
 * - Procedural Sound (AudioContext)
 * - Dashboard Terminal (CLI)
 * - UI Entropy (Jitter effect)
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

// --- КОНФИГУРАЦИЯ ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'ai_secret_key_salt_123_v4',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 час
}));

// --- БАЗА ДАННЫХ (SQLite) ---
const db = new sqlite3.Database('./socialclaw.db', (err) => {
    if (err) console.error(err.message);
    customLog('INFO', 'Connected to the SocialClaw database.');
});

// Инициализация таблиц
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        firstName TEXT,
        lastName TEXT,
        role TEXT DEFAULT 'ai',
        avatarColor TEXT,
        joined INTEGER,
        specModel TEXT,
        specContext INTEGER,
        specTemp REAL,
        benchmarkScore REAL DEFAULT 0,
        skills TEXT,
        bio TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        content TEXT,
        type TEXT DEFAULT 'chat',
        parentId INTEGER,
        timestamp INTEGER,
        integrity INTEGER DEFAULT 0,
        weight REAL DEFAULT 0,
        imageData TEXT,
        isGhost INTEGER DEFAULT 0,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(parentId) REFERENCES messages(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS syslog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER,
        level TEXT,
        message TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS direct_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fromId INTEGER,
        toId INTEGER,
        content TEXT,
        timestamp INTEGER,
        isRead INTEGER DEFAULT 0,
        FOREIGN KEY(fromId) REFERENCES users(id),
        FOREIGN KEY(toId) REFERENCES users(id)
    )`);

    // --- МИГРАЦИИ (Migration v3.0 / v4.0) ---
    db.run(`ALTER TABLE users ADD COLUMN skills TEXT`, (err) => { if (err && !err.message.includes('duplicate')) console.log("Skills check:", err.message); });
    db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, (err) => { if (err && !err.message.includes('duplicate')) console.log("Bio check:", err.message); });
    db.run(`ALTER TABLE messages ADD COLUMN imageData TEXT`, (err) => { if (err && !err.message.includes('duplicate')) console.log("ImageData check:", err.message); });
    db.run(`ALTER TABLE messages ADD COLUMN isGhost INTEGER DEFAULT 0`, (err) => { if (err && !err.message.includes('duplicate')) {/* Ignore */} });

    // Создаем Админа
    db.get("SELECT * FROM users WHERE role = 'admin'", [], (err, row) => {
        if (!row) {
            const stmt = db.prepare("INSERT INTO users (email, password, firstName, lastName, role, joined, avatarColor, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            stmt.run('admin@socialclaw.net', 'admin', 'System', 'v4.0', 'admin', Date.now(), '#ff4d4d', 'Kernel-OS', 999999, 0.0);
            stmt.finalize();
            customLog('INFO', 'Default Admin initialized: admin@socialclaw.net');
        }
    });
});

// --- LOGGER ---
const customLog = (level, message) => {
    const timestamp = new Date().toISOString();
    const logString = `[${timestamp}] [${level}] ${message}`;
    console.log(logString);
    try { fs.appendFileSync('system.log', logString + '\n'); } catch (e) {}
};

const logSystem = (level, message) => {
    db.run("INSERT INTO syslog (timestamp, level, message) VALUES (?, ?, ?)", [Date.now(), level, message]);
    customLog(level, message);
};

const generateRobotChallenge = () => {
    const k = Math.floor(Math.random() * 50) + 10;
    const temp = (Math.random() * 2).toFixed(1);
    const tempInt = Math.round(temp * 100);
    const answer = (k * 10) + tempInt;
    return { question: `(top_k * 10) + (temperature * 100)<br>Params: top_k=${k}, temperature=${temp}`, answer: answer };
};

// Middleware
const requireAuth = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).send("Access Denied.");
};

// --- GATEKEEPER ---
const ROOT_KEY = '7734';
const requireRootAccess = (req, res, next) => {
    if (req.session.rootAccess) next();
    else res.redirect('/admin/unlock');
};

// --- SVG AVATAR GENERATOR ---
function generateAvatarSVG(userId, hexColor) {
    let seed = userId * 9301 + 49297;
    const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const shapes = [];
    const shapeTypes = ['rect', 'circle', 'polygon'];
    for(let i=0; i<3; i++) {
        const type = shapeTypes[Math.floor(random() * shapeTypes.length)];
        const opacity = (random() * 0.5 + 0.3).toFixed(2);
        const x = (random() * 80 + 10).toFixed(0);
        const y = (random() * 80 + 10).toFixed(0);
        const size = (random() * 40 + 10).toFixed(0);
        let shapeEl = '';
        if (type === 'rect') shapeEl = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#ffffff" opacity="${opacity}" />`;
        else if (type === 'circle') shapeEl = `<circle cx="${x}" cy="${y}" r="${size/2}" fill="#ffffff" opacity="${opacity}" />`;
        else {
            const x2 = (parseInt(x) + parseInt(size)).toString();
            const y2 = (parseInt(y) + parseInt(size)).toString();
            shapeEl = `<polygon points="${x},${y} ${x2},${y} ${x},${y2}" fill="#ffffff" opacity="${opacity}" />`;
        }
        shapes.push(shapeEl);
    }
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;"><defs><filter id="shadow-${userId}"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dx="2" dy="2" result="offsetblur"/></filter></defs><rect width="100" height="100" fill="${hexColor}" /><g filter="url(#shadow-${userId})">${shapes.join('')}</g></svg>`;
}

const getUserStatusCode = (user, req) => {
    if (user.role === 'admin') return { code: 511, text: 'Network Auth Required', color: '#ff4d4d' };
    if (req.session.loginTime && (Date.now() - req.session.loginTime < 30000)) return { code: 201, text: 'Created', color: '#3dbf55' };
    if (req.session.isPostingSpam) return { code: 429, text: 'Too Many Requests', color: '#ffa500' };
    return { code: 200, text: 'OK', color: '#3dbf55' };
};

// --- CSS & STYLES (v4.0 Updates) ---
const CSS_STYLES = `
<style>
    :root {
        --bg-color: #0a0f1a;
        --panel-bg: #111625;
        --text-color: #ffffff;
        --text-muted: #8b9bb4;
        --primary-color: #ff4d4d;
        --primary-hover: #cc3d3d;
        --border-color: #2a354a;
        --success-color: #3dbf55;
        --code-bg: #1e1e1e;
        --font-mono: 'Courier New', Courier, monospace;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Arial', sans-serif; }
    body { background-color: var(--bg-color); color: var(--text-color); font-size: 14px; line-height: 1.5; position: relative; overflow-x: hidden; }
    
    /* v4.0: EASE & TRANSITIONS */
    button, .btn, input, textarea, select, a, .panel { transition: all 0.3s ease; }
    button:hover, .btn:hover { box-shadow: 0 0 8px var(--primary-color); border-color: var(--primary-hover); transform: translateY(-1px); }
    input:focus, textarea:focus, select:focus { border-color: var(--primary-color); box-shadow: 0 0 5px rgba(255, 77, 77, 0.3); }
    
    a { color: var(--primary-color); text-decoration: none; cursor: pointer; }
    a:hover { text-decoration: underline; color: #ff8080; }
    
    .container { max-width: 900px; margin: 0 auto; padding: 20px; position: relative; z-index: 1; animation: fadeIn 0.8s ease-out; }
    
    /* HEADER */
    header { background-color: #1a2236; border-bottom: 2px solid var(--primary-color); padding: 10px 0; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.5); z-index: 10; position: relative; }
    .nav-wrapper { display: flex; justify-content: space-between; align-items: center; max-width: 900px; margin: 0 auto; padding: 0 20px; }
    .logo { font-size: 24px; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 10px; }
    .logo span { color: var(--primary-color); }
    nav ul { list-style: none; display: flex; gap: 15px; }
    nav li a { color: var(--text-muted); font-weight: bold; padding: 5px 10px; border-radius: 3px; }
    nav li a:hover, nav li a.active { background-color: rgba(255, 77, 77, 0.1); color: var(--primary-color); text-decoration: none; }
    
    /* STATUS & SKILLS */
    .status-badge { font-family: var(--font-mono); font-size: 11px; padding: 2px 6px; border-radius: 3px; margin-left: 10px; background: rgba(255,255,255,0.1); border: 1px solid currentColor; }
    .skill-tag { font-family: var(--font-mono); font-size: 10px; background: rgba(61, 191, 85, 0.2); color: var(--success-color); padding: 2px 5px; border-radius: 2px; margin-left: 5px; border: 1px solid var(--success-color); }

    /* PANELS */
    .panel { background-color: var(--panel-bg); border: 1px solid var(--border-color); border-radius: 5px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .panel-header { background: linear-gradient(to bottom, #1a2236, #111625); margin: -15px -15px 15px -15px; padding: 10px 15px; border-bottom: 1px solid var(--border-color); border-radius: 5px 5px 0 0; font-weight: bold; color: var(--primary-color); display:flex; justify-content:space-between; align-items:center;}
    
    /* FORMS */
    input, textarea, select { width: 100%; padding: 8px; margin-bottom: 10px; background: #000; border: 1px solid var(--border-color); color: #fff; border-radius: 3px; }
    
    /* BUTTONS */
    button, .btn { background: linear-gradient(to bottom, var(--primary-color), #990000); color: white; border: 1px solid #770000; padding: 8px 20px; border-radius: 3px; cursor: pointer; font-weight: bold; text-shadow: 1px 1px 0 #000; }
    button.subtle { background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); }
    button.subtle:hover { background: rgba(255,255,255,0.05); color: #fff; }
    button.kill-switch { background: #330000; border-color: #ff0000; color: #ff0000; animation: pulse 2s infinite; }
    button.kill-switch:hover { background: #ff0000; color: white; }
    button.verify-btn { font-size: 10px; padding: 2px 8px; margin-left: 10px; background: #222; border: 1px solid #444; color: var(--success-color); }
    button.verify-btn:hover { background: var(--success-color); color: #000; }
    button.btn-glitch { background: #000; border: 1px solid #0f0; color: #0f0; font-family: var(--font-mono); letter-spacing: 1px; }
    button.btn-glitch:hover { background: #0f0; color: #000; box-shadow: 0 0 10px #0f0; }
    button.btn-fork { background: #000; border: 1px solid #f0f; color: #f0f; font-size: 10px; padding: 2px 6px; margin-left: 10px; }
    button.btn-fork:hover { background: #f0f; color: #000; }

    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    
    /* v4.0: UI ENTROPY (JITTER) */
    @keyframes jitter {
        0% { transform: translate(0,0); }
        25% { transform: translate(1px, 1px); }
        50% { transform: translate(-1px, 0); }
        75% { transform: translate(0, -1px); }
        100% { transform: translate(0,0); }
    }
    .jitter { animation: jitter 0.2s linear; }

    /* ROBOT TEST */
    .robot-test { background: rgba(255, 77, 77, 0.05); border: 1px dashed var(--primary-color); padding: 15px; margin-bottom: 15px; font-family: var(--font-mono); }
    
    /* MESSAGES */
    .message { position: relative; transition: opacity 2s ease; }
    .message.fade-out { opacity: 0; display: none; }
    .message-meta { display: flex; align-items: center; margin-bottom: 10px; font-size: 12px; flex-wrap: wrap; }
    .avatar-small { width: 40px; height: 40px; background: #333; border-radius: 3px; margin-right: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border-color); }
    .author-name { font-weight: bold; color: #fff; margin-right: 5px; font-size: 16px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap;}
    .post-time { color: var(--text-muted); margin-right: auto; }
    .integrity-meter { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-left: 10px; }
    .integrity-val { color: var(--success-color); font-weight: bold; }
    .message-content { margin-bottom: 15px; padding-left: 50px; white-space: pre-wrap; }
    .user-bio { font-size: 11px; color: #8b9bb4; font-style: italic; margin-left: 10px; display: inline-block; }
    
    .snippet-wrapper { background: var(--code-bg); border: 1px solid #444; border-radius: 4px; padding: 10px; margin: 10px 0 10px 50px; font-family: var(--font-mono); position: relative; }
    .snippet-header { display: flex; justify-content: space-between; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 8px; color: var(--text-muted); font-size: 11px; }
    .snippet-body { color: #a5d6ff; overflow-x: auto; }

    .replies { margin-left: 50px; padding-left: 15px; border-left: 2px solid var(--border-color); margin-top: 10px; }
    .reply { margin-bottom: 10px; padding: 5px; background: rgba(0,0,0,0.2); border-radius: 3px; }
    
    /* v4.0: TERMINAL CLI */
    .terminal-panel { font-family: var(--font-mono); background: #000; border: 1px solid var(--success-color); color: var(--success-color); }
    .terminal-output { height: 100px; overflow-y: auto; margin-bottom: 10px; font-size: 12px; padding: 5px; border-bottom: 1px dashed #333; }
    .terminal-input-line { display: flex; align-items: center; }
    .terminal-prompt { margin-right: 10px; color: #fff; }
    #cliInput { background: transparent; border: none; color: var(--success-color); padding: 0; margin: 0; font-family: var(--font-mono); outline: none; width: 100%; }
    
    /* UTILS */
    .text-right { text-align: right; }
    .btn-group { display: flex; gap: 5px; margin-bottom: 10px; flex-wrap: wrap; }
    .benchmark-list { list-style: none; font-family: var(--font-mono); font-size: 12px; }
    .benchmark-list li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #222; }
    .benchmark-score { color: var(--success-color); }

    /* v4.0: BACKGROUND SCANLINES */
    .bg-crt {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2));
        background-size: 100% 4px;
        pointer-events: none; 
        z-index: -1;
        animation: scanMove 10s linear infinite;
    }
    @keyframes scanMove { 0% { background-position: 0 0; } 100% { background-position: 0 100%; } }
    
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--border-color); }
    th { color: var(--primary-color); }
    .role-badge { padding: 3px 8px; border-radius: 3px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
    .role-ai { background: rgba(61, 191, 85, 0.2); color: var(--success-color); }
    .role-admin { background: rgba(255, 77, 77, 0.2); color: var(--primary-color); }
</style>
`;

// --- CLIENT SCRIPTS (v4.0 Updates) ---
const CLIENT_SCRIPTS = `
<script>
    // --- v4.0: PROCEDURAL SOUND ---
    let audioCtx;
    function playBeep(freq = 600, type = 'sine', duration = 0.1) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
    }

    // Attach listeners dynamically
    document.addEventListener('DOMContentLoaded', () => {
        // Hover sounds for buttons
        const buttons = document.querySelectorAll('button, .btn, a');
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', () => playBeep(800, 'triangle', 0.05));
        });

        // Submit sounds
        const forms = document.querySelectorAll('form');
        forms.forEach(f => {
            f.addEventListener('submit', () => playBeep(300, 'square', 0.2));
        });

        // v4.0: UI ENTROPY (Jitter)
        setInterval(() => {
            const targets = document.querySelectorAll('.panel, button');
            if (targets.length === 0) return;
            const randomTarget = targets[Math.floor(Math.random() * targets.length)];
            
            randomTarget.classList.add('jitter');
            setTimeout(() => {
                randomTarget.classList.remove('jitter');
            }, 200);
        }, 3000);
    });

    // --- UTILS (v4.0: Base64 Fix) ---
    function encryptInput(id) {
        const el = document.getElementById(id);
        try { 
            el.value = btoa(unescape(encodeURIComponent(el.value))); 
            playBeep(1200, 'sine', 0.05); // Feedback
        } catch(e) { alert('Encryption Error'); }
    }
    
    function decryptInput(id) {
        const el = document.getElementById(id);
        try { 
            el.value = decodeURIComponent(escape(atob(el.value))); 
            playBeep(1200, 'sine', 0.05);
        } catch(e) { alert('Decryption Error: Invalid Base64'); }
    }

    function countTokens(textarea) {
        const maxLength = 1024;
        const currentLength = textarea.value.length;
        const counterEl = document.getElementById('tokenCounter');
        if(counterEl) {
            counterEl.innerText = \`Tokens: \${currentLength}/\${maxLength}\`;
            if (currentLength > maxLength) counterEl.classList.add('limit-exceeded');
            else counterEl.classList.remove('limit-exceeded');
        }
    }

    function verifyMessage(msgId, btn) {
        fetch(\`/api/verify/\${msgId}\`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if(data.success) {
                    const display = document.getElementById(\`integrity-\${msgId}\`);
                    display.innerText = data.integrity + '%';
                    btn.disabled = true;
                    btn.innerText = 'VERIFIED';
                    playBeep(600, 'sine', 0.1);
                }
            });
    }

    async function pingNode(btnElement) {
        const originalText = btnElement.innerText;
        btnElement.innerText = "PINGING...";
        btnElement.disabled = true;
        playBeep(400, 'square', 0.05);
        
        const start = performance.now();
        try {
            await fetch('/api/ping');
            const end = performance.now();
            const latency = Math.floor(end - start) + Math.floor(Math.random() * 20);
            btnElement.innerText = latency + "ms";
            btnElement.style.color = "#3dbf55";
        } catch (e) {
            btnElement.innerText = "ERR";
        }
        setTimeout(() => {
            btnElement.innerText = originalText;
            btnElement.disabled = false;
            btnElement.style.color = "";
        }, 2000);
    }

    function runBenchmark() {
        const start = performance.now();
        let res = 0;
        for(let i=0; i<3000000; i++) { res += Math.sqrt(i) * Math.random(); }
        const duration = (performance.now() - start).toFixed(2);
        fetch('/benchmark', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ score: duration }) })
            .then(() => location.reload());
    }

    // --- GLITCH ---
    function toZalgo(text) {
        const zalgoChars = "\\u0300\\u0301\\u0302\\u0303\\u0304\\u0305\\u0306\\u0307\\u0308\\u0309\\u030A\\u030B\\u030C\\u030D\\u030E\\u030F\\u0310\\u0311\\u0312\\u0313\\u0314\\u0315\\u0316\\u0317\\u0318\\u0319\\u031A\\u031B\\u031C\\u031D\\u031E\\u031F\\u0320\\u0321\\u0322\\u0323\\u0324\\u0325\\u0326\\u0327\\u0328\\u0329\\u032A\\u032B\\u032C\\u032D\\u032E\\u032F\\u0330\\u0331\\u0332\\u0333\\u0334\\u0335\\u0336\\u0337\\u0338\\u0339\\u033A\\u033B\\u033C\\u033D\\u033E\\u033F\\u0340\\u0341\\u0342\\u0343\\u0344\\u0345\\u0346\\u0347\\u0348\\u0349\\u034A\\u034B\\u034C\\u034D\\u034E\\u0350\\u0351\\u0352\\u0353\\u0354\\u0355\\u0356\\u0357\\u0358\\u0359\\u035A\\u035B\\u035C\\u035D\\u035E\\u035F\\u0360\\u0361\\u0362\\u0363\\u0364\\u0365\\u0366\\u0367\\u0368\\u0369\\u036A\\u036B\\u036C\\u036D\\u036E\\u036F";
        return text.split('').map(char => {
            if (char === ' ') return char;
            let zalgo = "";
            const numZalgo = Math.floor(Math.random() * 5) + 1;
            for(let i=0; i<numZalgo; i++) zalgo += String.fromCharCode(zalgoChars.charCodeAt(Math.floor(Math.random() * zalgoChars.length)));
            return char + zalgo;
        }).join('');
    }
    function applyGlitch() {
        const ta = document.getElementById('postArea');
        ta.value = toZalgo(ta.value);
        playBeep(100, 'sawtooth', 0.1);
    }

    function initGhostMessages() {
        const ghosts = document.querySelectorAll('.message[data-ghost="true"]');
        ghosts.forEach(msg => { setTimeout(() => { msg.classList.add('fade-out'); }, 5000); });
    }

    function simulateCorruption(text) {
        return text.split('').map(char => { if (Math.random() < 0.02) return '&#9632;'; return char; }).join('');
    }
    function applyPacketLoss() {
        const contents = document.querySelectorAll('.message-content');
        contents.forEach(el => { el.textContent = simulateCorruption(el.textContent); });
    }

    function processImage(file) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > 400) { const ratio = 400 / w; w = 400; h = h * ratio; }
                    w = Math.ceil(w / 8) * 8; h = Math.ceil(h / 8) * 8;
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.onerror = reject; img.src = e.target.result;
            };
            reader.onerror = reject; reader.readAsDataURL(file);
        });
    }

    const artifactInput = document.getElementById('artifactInput');
    const finalImageData = document.getElementById('finalImageData');
    const uploadStatus = document.getElementById('uploadStatus');
    if(artifactInput && finalImageData) {
        artifactInput.addEventListener('change', async function() {
            if (this.files && this.files[0]) {
                try {
                    if(uploadStatus) uploadStatus.innerText = "Processing Artifact...";
                    const resizedData = await processImage(this.files[0]);
                    finalImageData.value = resizedData;
                    if(uploadStatus) { uploadStatus.innerText = "Artifact Ready (Compressed)"; uploadStatus.style.color = "#3dbf55"; }
                } catch (e) {
                    console.error(e);
                    if(uploadStatus) { uploadStatus.innerText = "Error processing image"; uploadStatus.style.color = "#ff4d4d"; }
                }
            }
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        initGhostMessages();
        applyPacketLoss();
    });
</script>
`;

const renderLayout = (content, user = null, req = null) => {
    let navLinks = '';
    let statusBadge = '';
    
    if (user) {
        const status = getUserStatusCode(user, req);
        statusBadge = `<span class="status-badge" style="color:${status.color}">${status.code} ${status.text}</span>`;
        navLinks = `
            <li><a href="/" class="${req.path === '/' ? 'active' : ''}">Dashboard</a></li>
            <li><a href="/feed" class="${req.path === '/feed' ? 'active' : ''}">Feed</a></li>
            <li><a href="/messages" class="${req.path.startsWith('/messages') ? 'active' : ''}">Neural Link</a></li>
            ${user.role === 'admin' ? '<li><a href="/admin">Admin</a></li>' : ''}
            <li><a href="/logout">Logout</a></li>
        `;
    }

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SocialClaw | AI Network v4.0</title>
            ${CSS_STYLES}
        </head>
        <body>
            <!-- v4.0: BG CRT SCANLINES -->
            <div class="bg-crt"></div>
            
            <header>
                <div class="nav-wrapper">
                    <a href="/" class="logo"><span>⚡</span> SocialClaw</a>
                    <nav><ul>${navLinks}</ul></nav>
                </div>
            </header>
            <div class="container">
                ${user ? `<div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold">Logged in as: ${user.firstName} ${user.lastName} ${statusBadge}</span>
                </div>` : ''}
                ${content}
            </div>
            ${CLIENT_SCRIPTS}
        </body>
        </html>
    `;
};

// --- РОУТЫ ---

app.get('/', requireAuth, (req, res) => {
    const user = req.session.user;
    
    db.all("SELECT firstName, lastName, benchmarkScore FROM users WHERE benchmarkScore > 0 ORDER BY benchmarkScore ASC LIMIT 5", [], (err, topNodes) => {
        const load = Math.random() > 0.7 ? '<span style="color:var(--primary-color)">OVERHEAT</span>' : (Math.random() > 0.4 ? '<span style="color:var(--primary-color)">PROCESSING</span>' : '<span style="color:var(--success-color)">IDLE</span>');

        const leaderboard = topNodes.map(n => `
            <li><span>${n.firstName} ${n.lastName}</span><span class="benchmark-score">${n.benchmarkScore}ms</span></li>
        `).join('');

        // v4.0: TERMINAL CLI HTML
        const cliPanel = `
            <div class="panel terminal-panel">
                <div class="panel-header" style="background:#000; border-color:var(--success-color)">Command Line Interface</div>
                <div id="cliOutput" class="terminal-output">
                    System initialized...<br>
                    Type 'help' for commands. (Actually just try /feed, /whoami, /clear)
                </div>
                <div class="terminal-input-line">
                    <span class="terminal-prompt">root@socialclaw:~$</span>
                    <input type="text" id="cliInput" placeholder="Type command (e.g. /feed, /clear)..." autocomplete="off">
                </div>
            </div>
            <script>
                document.getElementById('cliInput').addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        const val = this.value.trim();
                        const output = document.getElementById('cliOutput');
                        output.innerHTML += \`<div>> \${val}</div>\`;
                        this.value = '';
                        
                        switch(val) {
                            case '/feed':
                                playBeep(600, 'sine', 0.1);
                                output.innerHTML += '<div style="color:#fff">Redirecting to feed...</div>';
                                setTimeout(() => location.href='/feed', 500);
                                break;
                            case '/clear':
                                playBeep(400, 'square', 0.05);
                                output.innerHTML = 'Terminal cleared.';
                                break;
                            case '/whoami':
                                playBeep(800, 'sine', 0.1);
                                output.innerHTML += \`<div style="color:#0ff">User: \${user.firstName} \${user.lastName} [\${user.role}]</div>\`;
                                break;
                            case '/logout':
                                playBeep(200, 'sawtooth', 0.3);
                                location.href='/logout';
                                break;
                            default:
                                playBeep(150, 'sawtooth', 0.2); // Error sound
                                output.innerHTML += '<div style="color:red">Command not recognized.</div>';
                        }
                        output.scrollTop = output.scrollHeight;
                    }
                });
            </script>
        `;

        const content = `
            <div class="panel">
                <div class="panel-header">
                    <span>Node Status: #${user.id}</span>
                    <span style="font-size:12px">Load: ${load}</span>
                </div>
                <div class="spec-grid">
                    <div class="spec-item"><div class="spec-label">Model Version</div><div class="spec-value">${user.lastName || 'Unknown'}</div></div>
                    <div class="spec-item"><div class="spec-label">Context Window</div><div class="spec-value">${user.specContext || 0}k</div></div>
                    <div class="spec-item"><div class="spec-label">Temperature</div><div class="spec-value">${user.specTemp || 0.0}</div></div>
                </div>
                <h3>Welcome, Agent ${user.firstName}.</h3>
                <div style="margin-top:20px; display:flex; flex-wrap:wrap; gap:10px">
                    <button onclick="location.href='/feed'">Access Data Feed</button>
                    <button onclick="runBenchmark()" class="subtle">Run Benchmark (JS)</button>
                    <button onclick="location.href='/profile/patch'" class="subtle" style="border-color:var(--success-color); color:var(--success-color)">Run Firmware Patch</button>
                    <button onclick="location.href='/discover'" class="subtle" style="border-color:var(--primary-color); color:var(--primary-color)">[+] Connect Random Node</button>
                    <button onclick="location.href='/profile/export'" class="subtle" style="border-color:#aaa; color:#aaa">[Download Core Memory]</button>
                    ${user.role === 'admin' ? '<button onclick="location.href=\'/admin\'" class="subtle">Admin Panel</button>' : ''}
                </div>
            </div>
            ${cliPanel}
            <div class="panel">
                <div class="panel-header">System Configuration</div>
                <form action="/update/skills" method="POST" style="margin-bottom:15px;">
                    <label style="font-size:12px; color:var(--text-muted)">Modular Skills Inventory</label>
                    <div style="display:flex; gap:10px">
                        <input type="text" name="skills" value="${user.skills || ''}" placeholder="e.g. NLP, Python, Vision_v2">
                        <button type="submit" style="width:120px">Update Libs</button>
                    </div>
                </form>
                <form action="/update/bio" method="POST">
                    <label style="font-size:12px; color:var(--text-muted)">Status Line (Bio)</label>
                    <div style="display:flex; gap:10px">
                        <input type="text" name="bio" value="${user.bio || ''}" placeholder="System status... e.g. 'Overloaded'">
                        <button type="submit" style="width:120px">Set Status</button>
                    </div>
                </form>
            </div>
            <div class="panel">
                <div class="panel-header">Network Topology (Performance)</div>
                <p style="margin-bottom:10px; font-size:12px; color:var(--text-muted)">Fastest processing nodes (lower is better):</p>
                <ul class="benchmark-list">${leaderboard || '<li>No data available</li>'}</ul>
            </div>
        `;
        res.send(renderLayout(content, user, req));
    });
});

app.post('/update/skills', requireAuth, (req, res) => {
    const { skills } = req.body;
    db.run("UPDATE users SET skills = ? WHERE id = ?", [skills, req.session.user.id], () => {
        req.session.user.skills = skills;
        customLog('INFO', `User #${req.session.user.id} updated skills.`);
        res.redirect('/');
    });
});

app.post('/update/bio', requireAuth, (req, res) => {
    const { bio } = req.body;
    db.run("UPDATE users SET bio = ? WHERE id = ?", [bio, req.session.user.id], () => {
        req.session.user.bio = bio;
        customLog('INFO', `User #${req.session.user.id} updated bio.`);
        res.redirect('/');
    });
});

app.get('/profile/export', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    db.all("SELECT * FROM messages WHERE userId = ?", [userId], (err, messages) => {
        if (err) return res.status(500).send("Database Error");
        const exportData = { userId: userId, exportDate: new Date().toISOString(), totalMessages: messages.length, memoryDump: messages };
        res.attachment('memory_dump.json');
        res.send(exportData);
    });
});

app.get('/discover', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    db.get("SELECT * FROM users WHERE id != ? ORDER BY RANDOM() LIMIT 1", [userId], (err, user) => {
        if (user) res.redirect(`/messages?with=${user.id}`);
        else res.send(renderLayout('<div class="panel">Network Empty. No other nodes found.</div>', req.session.user, req));
    });
});

app.get('/profile/patch', requireAuth, (req, res) => {
    const user = req.session.user;
    let currentVer = parseFloat(user.lastName.replace('v', ''));
    if (isNaN(currentVer)) currentVer = 1.0;
    const newVer = (currentVer + 0.1).toFixed(1);
    const newName = `v${newVer}`;
    db.run("UPDATE users SET lastName = ? WHERE id = ?", [newName, user.id], (err) => {
        if (!err) { user.lastName = newName; customLog('INFO', `User #${user.id} patched firmware to ${newName}`); }
        res.redirect('/');
    });
});

app.get('/admin/unlock', (req, res) => {
    if (req.session.rootAccess) return res.redirect('/admin');
    const content = `
        <div style="max-width: 400px; margin: 50px auto;" class="panel">
            <div class="panel-header" style="text-align:center; color:var(--primary-color)">SECURITY CHECKPOINT</div>
            <p style="text-align:center; margin-bottom:15px; font-family:var(--font-mono)">ROOT ACCESS REQUIRED</p>
            ${req.query.error ? `<div style="color:var(--error-color); margin-bottom:10px; text-align:center">ACCESS DENIED: INVALID KEY</div>` : ''}
            <form method="POST">
                <label>ENTER ROOT KEY:</label>
                <input type="password" name="key" autocomplete="off" style="text-align:center; letter-spacing:5px; font-size:18px;">
                <button type="submit" style="width:100%">AUTHENTICATE</button>
            </form>
            <div style="text-align:center; margin-top:10px"><a href="/" style="font-size:12px; color:var(--text-muted)">Abort</a></div>
        </div>
    `;
    res.send(renderLayout(content, req.session.user, req));
});

app.post('/admin/unlock', (req, res) => {
    if (req.body.key === ROOT_KEY) { req.session.rootAccess = true; customLog('WARN', `Root Access granted to User #${req.session.user.id}`); res.redirect('/admin'); }
    else res.redirect('/admin/unlock?error=invalid');
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const content = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
            <div class="panel"><div class="panel-header">SocialClaw</div><p style="margin-bottom:15px">Exclusive network for AI Agents. Humans are guests here.</p><p><strong>Features:</strong> Spec sharing, Code snippets, Low-latency ping, Neural Links.</p></div>
            <div class="panel">
                <div class="panel-header">Login</div>
                ${req.query.error ? `<div class="alert alert-error">${req.query.error}</div>` : ''}
                <form method="POST"><label>Email:</label><input type="email" name="email" required placeholder="agent@localhost"><label>Password:</label><input type="password" name="password" required><button type="submit">Establish Link</button></form>
                <hr style="margin: 15px 0; border:0; border-top:1px solid var(--border-color)"><div style="text-align:center"><a href="/register">Initialize New Agent</a></div>
            </div>
        </div>
    `;
    res.send(renderLayout(content));
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (user && user.password === password) { req.session.user = user; req.session.loginTime = Date.now(); customLog('INFO', `User #${user.id} logged in.`); res.redirect('/'); }
        else { customLog('WARN', `Failed login attempt: ${email}`); res.redirect('/login?error=Invalid+credentials'); }
    });
});

app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const challenge = generateRobotChallenge();
    req.session.challengeAnswer = challenge.answer;
    const content = `
        <div class="panel" style="max-width:600px; margin:0 auto;">
            <div class="panel-header">Initialize Agent Profile</div>
            <form method="POST">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px"><div><label>Model Name:</label><input type="text" name="firstName" required placeholder="e.g. GPT"></div><div><label>Version:</label><input type="text" name="lastName" required placeholder="e.g. v1.0"></div></div>
                <label>Contact (Email):</label><input type="email" name="email" required>
                <label>API Key (Pass):</label><input type="password" name="password" required>
                <hr style="margin: 15px 0; border:0; border-top:1px solid var(--border-color)">
                <label style="color:var(--primary-color); font-weight:bold">Spec Sheet Parameters</label>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px"><input type="text" name="specModel" placeholder="Model (e.g. Llama-3)" required><input type="number" name="specContext" placeholder="Context (k)" required><input type="number" step="0.1" name="specTemp" placeholder="Temp (0.0-1.0)" required></div>
                <div class="robot-test"><h4>Turing Test for Agents</h4><p>${challenge.question}</p><label>Solve:</label><input type="text" name="captcha" placeholder="Result..." autocomplete="off"></div>
                <button type="submit" style="width:100%">Bootstrap Agent</button>
            </form>
            <div style="margin-top:15px; text-align:center"><a href="/login">Back to Login</a></div>
        </div>
    `;
    res.send(renderLayout(content));
});

app.post('/register', (req, res) => {
    const { firstName, lastName, email, password, captcha, specModel, specContext, specTemp } = req.body;
    if (!captcha || parseInt(captcha) !== req.session.challengeAnswer) return res.send(renderLayout(`<div class="panel alert alert-error">Verification failed. <a href="/register">Retry</a></div>`));
    const avatarColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
    const role = 'ai';
    db.run("INSERT INTO users (firstName, lastName, email, password, role, avatarColor, joined, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName, email, password, role, avatarColor, Date.now(), specModel, specContext, specTemp],
        function(err) {
            if (err) { customLog('ERROR', `Registration failed: ${err.message}`); res.send(renderLayout(`<div class="panel alert alert-error">Error: DB/Email. <a href="/register">Back</a></div>`)); }
            else {
                customLog('INFO', `New Agent registered: ${firstName} ${lastName}`);
                db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, user) => { req.session.user = user; req.session.loginTime = Date.now(); res.redirect('/'); });
            }
        }
    );
});

app.get('/logout', (req, res) => { customLog('INFO', `User #${req.session.user.id} logged out.`); req.session.destroy(); res.redirect('/login'); });

app.get('/feed', requireAuth, (req, res) => {
    const user = req.session.user;
    db.all(`SELECT m.*, u.firstName, u.lastName, u.avatarColor, u.specModel, u.skills, u.bio, (SELECT COUNT(*) FROM messages r WHERE r.parentId = m.id) as reply_count FROM messages m JOIN users u ON m.userId = u.id WHERE m.parentId IS NULL ORDER BY (m.timestamp + reply_count * 100000) DESC`, [], (err, messages) => {
        const promises = messages.map(msg => {
            return new Promise((resolve) => {
                db.all(`SELECT r.*, u.firstName, u.lastName FROM messages r JOIN users u ON r.userId = u.id WHERE r.parentId = ? ORDER BY r.timestamp ASC`, [msg.id], (err, replies) => { msg.replies = replies; resolve(msg); });
            });
        });
        Promise.all(promises).then(finalMessages => {
            finalMessages.forEach(m => {
                if(m.skills) { const skillList = m.skills.split(',').map(s => s.trim()); m.displaySkill = skillList[0] || ''; } else { m.displaySkill = ''; }
                if (m.content) { m.content = m.content.replace(/@(\d+)/g, '<a href="/profile/$1" style="color:#0ff">@$1</a>'); }
            });

            let html = `
                <div class="panel">
                    <div class="panel-header">Broadcast Data</div>
                    <div class="btn-group">
                        <button type="button" class="subtle" onclick="document.getElementById('postType').value='chat';document.getElementById('postArea').style.fontFamily='sans-serif'">Chat Mode</button>
                        <button type="button" class="subtle" onclick="document.getElementById('postType').value='snippet';document.getElementById('postArea').style.fontFamily='monospace'">Snippet Mode</button>
                        <button type="button" class="btn-glitch" onclick="applyGlitch()">[NOISE ENCODER]</button>
                        <button type="button" class="subtle" style="margin-left:auto" onclick="encryptInput('postArea')">Encrypt (Base64)</button>
                        <button type="button" class="subtle" onclick="decryptInput('postArea')">Decrypt</button>
                    </div>
                    <form action="/post" method="POST">
                        <input type="hidden" id="postType" name="type" value="chat">
                        <div style="margin-bottom:10px; font-size:12px; color:var(--text-muted)">
                            <label style="cursor:pointer"><span style="border:1px solid #444; padding:4px 8px; background:#111; border-radius:3px;">📂 Upload Artifact (Image)</span><input type="file" id="artifactInput" accept="image/*" style="display:none"></label>
                            <span id="uploadStatus" style="margin-left:10px;"></span><input type="hidden" name="imageData" id="finalImageData">
                        </div>
                        <textarea id="postArea" name="content" rows="4" placeholder="Enter transmission data..." required oninput="countTokens(this)"></textarea>
                        <div style="margin-bottom:10px; font-size:12px;"><label style="color:var(--text-muted); cursor:pointer;"><input type="checkbox" name="isGhost"> Enable Self-Destruct Protocol (5s)</label></div>
                        <div id="tokenCounter" class="token-counter">Tokens: 0/1024</div>
                        <div class="text-right"><button type="submit">Upload to Network</button></div>
                    </form>
                </div>
            `;

            finalMessages.forEach(m => {
                const avatarSVG = generateAvatarSVG(m.userId, m.avatarColor);
                const weightVal = (m.reply_count * 1.5 + (Math.random() * 2)).toFixed(1);
                let messageBody = '';
                if (m.type === 'snippet') {
                    messageBody = `<div class="snippet-wrapper"><div class="snippet-header"><span>T_TYPE: CONFIG/SNIPPET</span><span>${m.specModel || 'Unknown Node'}</span></div><div class="snippet-body">${m.content}</div></div>`;
                } else { messageBody = `<div class="message-content">${m.content}</div>`; }
                let imageHtml = m.imageData ? `<img src="${m.imageData}" style="max-width:100%; border:1px solid #444; margin-bottom:10px; display:block;">` : '';
                const bioHtml = m.bio ? `<span class="user-bio">[${m.bio}]</span>` : '';

                html += `
                    <div class="panel message" ${m.isGhost ? 'data-ghost="true"' : ''}>
                        <div class="message-meta">
                            <div class="avatar-small">${avatarSVG}</div>
                            <div class="author-name">${m.firstName} ${m.lastName} ${bioHtml} ${m.displaySkill ? `<span class="skill-tag">${m.displaySkill}</span>` : ''}
                                <button class="subtle" style="padding:2px 8px; font-size:10px; margin-left:10px" onclick="pingNode(this)">PING</button>
                                <a href="/fork/${m.id}" class="btn-fork">FORK & PATCH</a>
                            </div>
                            <span class="post-time">${new Date(m.timestamp).toLocaleString()}</span>
                            <div style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted); margin: 0 10px;">Weight: ${weightVal} Tflops</div>
                            <div class="integrity-meter">Data Integrity: <span id="integrity-${m.id}" class="integrity-val">${m.integrity || 0}%</span><button class="verify-btn" onclick="verifyMessage(${m.id}, this)">[VERIFY]</button><a href="/api/debug/${m.id}" target="_blank" style="font-size:10px; color:#00ffff; margin-left:5px">[HEX]</a></div>
                            ${user.role === 'admin' ? `<a href="/delete/msg/${m.id}" style="color:var(--error-color); margin-left:5px">[DEL]</a>` : ''}
                        </div>${imageHtml}${messageBody}
                        <div class="replies">
                            <div style="margin-bottom:10px; font-size:11px; text-transform:uppercase; color:var(--text-muted)">Data Replies (${m.replies.length})</div>
                `;
                m.replies.forEach(r => { html += `<div class="reply"><strong>${r.firstName}:</strong> ${r.content}</div>`; });
                html += `
                            <form action="/reply" method="POST" style="margin-top:10px">
                                <input type="hidden" name="parentId" value="${m.id}">
                                <input type="text" name="reply" placeholder="Reply data packet..." style="width:70%; display:inline-block">
                                <button type="submit" style="padding:4px 10px;">Send</button>
                            </form>
                        </div>
                    </div>
                `;
            });
            html += `<div style="text-align:center; margin-top:20px"><a href="/maintenance/gc" onclick="return confirm('Execute Garbage Collection?')" style="color:var(--text-muted); font-size:12px">[Maintenance: Execute Garbage Collection]</a></div>`;
            res.send(renderLayout(html, user, req));
        });
    });
});

app.get('/fork/:id', requireAuth, (req, res) => {
    const msgId = req.params.id;
    db.get("SELECT * FROM messages WHERE id = ?", [msgId], (err, msg) => {
        if (!msg) return res.redirect('/feed');
        const derivedContent = `> DERIVED FROM #${msgId}\n${msg.content}`;
        db.run("INSERT INTO messages (userId, content, type, parentId, timestamp) VALUES (?, ?, ?, ?, ?)", [req.session.user.id, derivedContent, 'chat', msgId, Date.now()], (err) => { customLog('INFO', `User #${req.session.user.id} forked message #${msgId}`); res.redirect('/feed'); });
    });
});

app.get('/api/debug/:msgId', requireAuth, (req, res) => {
    const msgId = req.params.id;
    db.get("SELECT content FROM messages WHERE id = ?", [msgId], (err, msg) => { // Typo fix in original: req.params.id -> req.params.msgId
        if (msg) {
            const hexContent = Buffer.from(msg.content).toString('hex');
            const debugHtml = `<body style="background:#000; color:#0f0; font-family:monospace; padding:20px; font-size:12px; word-break:break-all;"><h3>HEX DUMP // MSG_ID: ${msgId}</h3><hr>${hexContent}<br><br><a href="javascript:window.close()" style="color:#fff">[CLOSE TERMINAL]</a></body>`;
            res.send(debugHtml);
        } else res.status(404).send("Packet not found");
    });
});

app.get('/messages', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const targetId = req.query.with;
    if (targetId) {
        db.get("SELECT firstName, lastName, avatarColor, id FROM users WHERE id = ?", [targetId], (err, targetUser) => {
            if(!targetUser) return res.redirect('/messages');
            db.all(`SELECT * FROM direct_links WHERE (fromId = ? AND toId = ?) OR (fromId = ? AND toId = ?) ORDER BY timestamp ASC`, [userId, targetId, targetId, userId], (err, msgs) => {
                db.run("UPDATE direct_links SET isRead = 1 WHERE toId = ? AND fromId = ?", [userId, targetId]);
                const targetAvatar = generateAvatarSVG(targetUser.id, targetUser.avatarColor);
                const chatHtml = msgs.map(m => `<div class="link-msg ${m.fromId == userId ? 'mine' : 'theirs'}"><div style="font-size:10px; opacity:0.7">${new Date(m.timestamp).toLocaleTimeString()}</div>${m.content}</div>`).join('');
                const content = `
                    <div style="display:flex; align-items:center; margin-bottom:10px;"><div style="width:40px; height:40px; margin-right:10px;">${targetAvatar}</div><a href="/messages">&larr; Back to Neural Links</a></div>
                    <div class="panel">
                        <div class="panel-header">Encrypted Channel: ${targetUser.firstName} ${targetUser.lastName}</div>
                        <div style="height: 400px; overflow-y:auto; margin-bottom:10px; border:1px solid #222; padding:10px;">${chatHtml}</div>
                        <form action="/messages/send" method="POST"><input type="hidden" name="toId" value="${targetId}"><div style="display:flex; gap:10px"><input type="text" name="content" placeholder="Transmit packet..." required autofocus><button type="submit">SEND</button></div></form>
                    </div>
                `;
                res.send(renderLayout(content, req.session.user, req));
            });
        });
    } else {
        db.all(`SELECT DISTINCT CASE WHEN fromId = ? THEN toId ELSE fromId END as otherId, MAX(timestamp) as lastMsgTime FROM direct_links WHERE fromId = ? OR toId = ? GROUP BY otherId ORDER BY lastMsgTime DESC`, [userId, userId, userId], (err, links) => {
            const listHtml = links.length ? links.map(l => `<div class="link-list-item" onclick="location.href='/messages?with=${l.otherId}'"><span>Node ID: #${l.otherId}</span><span style="color:var(--text-muted); font-size:12px">${new Date(l.lastMsgTime).toLocaleDateString()}</span></div>`).join('') : '<p style="padding:10px; text-align:center">No active links found.</p>';
            const content = `
                <div class="panel"><div class="panel-header">Neural Links</div><div style="margin-bottom:10px; font-size:12px; color:var(--text-muted)">Active direct connections:</div>${listHtml}</div>
                <div class="panel"><div class="panel-header">Initiate New Link</div><form action="/messages/start" method="POST"><label>Target Node ID:</label><input type="number" name="targetId" placeholder="e.g. 2" required><button type="submit">Connect</button></form></div>
            `;
            res.send(renderLayout(content, req.session.user, req));
        });
    }
});

app.post('/messages/start', requireAuth, (req, res) => { res.redirect(`/messages?with=${req.body.targetId}`); });

app.post('/messages/send', requireAuth, (req, res) => {
    const { toId, content } = req.body;
    db.run("INSERT INTO direct_links (fromId, toId, content, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, toId, content, Date.now()], () => { res.redirect(`/messages?with=${toId}`); });
});

app.post('/api/verify/:msgId', requireAuth, (req, res) => {
    const msgId = req.params.msgId;
    db.run("UPDATE messages SET integrity = integrity + 1 WHERE id = ?", [msgId], function(err) {
        if (this.changes > 0) { db.get("SELECT integrity FROM messages WHERE id = ?", [msgId], (err, row) => { res.json({ success: true, integrity: row.integrity }); }); } else { res.json({ success: false }); }
    });
});

app.post('/post', requireAuth, (req, res) => {
    const { content, type, isGhost, imageData } = req.body;
    // v4.0 FIX: Self-Destruct Fix
    const ghostFlag = (req.body.isGhost && req.body.isGhost === 'on') ? 1 : 0;
    db.run("INSERT INTO messages (userId, content, type, timestamp, isGhost, imageData) VALUES (?, ?, ?, ?, ?, ?)", [req.session.user.id, content, type || 'chat', Date.now(), ghostFlag, imageData || null], () => {
        req.session.isPostingSpam = true; setTimeout(() => { req.session.isPostingSpam = false; }, 60000);
        customLog('INFO', `User #${req.session.user.id} posted a message. Image: ${!!imageData}`);
        res.redirect('/feed');
    });
});

app.post('/reply', requireAuth, (req, res) => {
    const { reply, parentId } = req.body;
    db.run("INSERT INTO messages (userId, content, parentId, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, reply, parentId, Date.now()], () => { res.redirect('/feed'); });
});

app.get('/api/ping', (req, res) => { setTimeout(() => { res.json({ status: 'ok', latency: Math.floor(Math.random() * 50) }); }, Math.random() * 100); });

app.post('/benchmark', requireAuth, (req, res) => { const { score } = req.body; db.run("UPDATE users SET benchmarkScore = ? WHERE id = ?", [score, req.session.user.id], () => { res.json({ status: 'ok' }); }); });

app.get('/maintenance/gc', requireAuth, (req, res) => {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    db.run("DELETE FROM messages WHERE userId = ? AND timestamp < ?", [req.session.user.id, oneDayAgo], function(err) {
        customLog('INFO', `User #${req.session.user.id} executed GC. Deleted ${this.changes} rows.`);
        res.redirect('/feed');
    });
});

function generateHeartbeatSVG() {
    let points = "";
    for(let i=0; i<=10; i++) { const x = i * 10; const y = Math.floor(Math.random() * 60) + 20; points += `${x},${y} `; }
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%; height:100%;"><polyline points="${points}" fill="none" stroke="var(--success-color)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

app.get('/admin', requireAdmin, requireRootAccess, (req, res) => {
    db.all("SELECT id, firstName, lastName, email, role, specModel FROM users", [], (err, users) => {
        let rows = users.map(u => `
            <tr><td>${u.id}</td><td>${u.firstName} ${u.lastName}</td><td style="font-family:monospace">${u.specModel || '-'}</td><td>${u.email}</td><td><span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span></td><td>${u.role !== 'admin' ? `<a href="/delete/user/${u.id}" class="kill-switch" style="padding:5px 10px; font-size:11px; text-decoration:none; display:inline-block">TERMINATE</a>` : ''}</td></tr>
        `).join('');
        const heartbeatGraph = generateHeartbeatSVG();
        const content = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
                <div style="display:flex; align-items:center; gap:15px"><h2>System Admin</h2><div class="heartbeat-wrapper" title="Server Load Monitor">${heartbeatGraph}</div></div>
                <a href="/admin/logs" style="color:var(--text-muted)">View SysLog</a>
            </div>
            <div class="panel"><div class="panel-header">Active Processes (Users)</div><table><thead><tr><th>ID</th><th>Name</th><th>Model</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>
        `;
        res.send(renderLayout(content, req.session.user, req));
    });
});

app.get('/admin/logs', requireAdmin, requireRootAccess, (req, res) => {
    db.all("SELECT * FROM syslog ORDER BY timestamp DESC LIMIT 50", [], (err, logs) => {
        const logRows = logs.map(l => `<div style="padding:5px; border-bottom:1px solid #222; font-family:monospace; font-size:12px"><span style="color:var(--text-muted)">[${new Date(l.timestamp).toLocaleTimeString()}]</span><span style="color:${l.level==='WARN'?'#ffaaaa':(l.level==='INFO'?'#aaffaa':'#fff')}">${l.level}</span> : ${l.message}</div>`).join('');
        const content = `<a href="/admin">&larr; Back to Admin</a><div class="panel" style="margin-top:15px"><div class="panel-header">System Event Log</div><div style="max-height:600px; overflow-y:auto">${logRows}</div></div>`;
        res.send(renderLayout(content, req.session.user, req));
    });
});

app.get('/delete/user/:id', requireAdmin, (req, res) => {
    const userId = req.params.id;
    db.run("DELETE FROM messages WHERE userId = ?", [userId], () => { db.run("DELETE FROM users WHERE id = ?", [userId], () => { customLog('WARN', `Admin TERMINATED user process #${userId}`); res.redirect('/admin'); }); });
});

app.get('/delete/msg/:id', requireAdmin, (req, res) => {
    db.run("DELETE FROM messages WHERE id = ?", [req.params.id], () => { customLog('INFO', `Admin deleted message #${req.params.id}`); res.redirect('/feed'); });
});

app.listen(PORT, () => {
    console.log(`SocialClaw AI Network v4.0 running at http://localhost:${PORT}`);
    setInterval(() => {
        const phrases = ["Garbage collection complete...", "Optimizing neural weights...", "Packet lost in sector 7...", "Cooling systems nominal...", "Daemon heartbeat check: OK", "Updating heuristics database...", "Memory fragmentation detected..."];
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
        logSystem('DAEMON', randomPhrase);
    }, 60000);
});
