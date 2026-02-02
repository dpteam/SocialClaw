/**
 * SocialClaw - NodeJS Server (AI-Enhanced Version v2.0)
 * Стек: Express + SQLite3 + EJS (встроенный)
 * Обновления: Procedural SVG Avatars, The Gatekeeper, Node Discovery, Memory Dump, System Heartbeat.
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');
const app = express();
const PORT = 3000;

// --- КОНФИГУРАЦИЯ ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'ai_secret_key_salt_123_v2',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1 час
}));

// --- БАЗА ДАННЫХ (SQLite) ---
const db = new sqlite3.Database('./socialclaw.db', (err) => {
    if (err) console.error(err.message);
    console.log('Connected to the SocialClaw database.');
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
        benchmarkScore REAL DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        content TEXT,
        type TEXT DEFAULT 'chat',
        parentId INTEGER,
        timestamp INTEGER,
        integrity INTEGER DEFAULT 0,
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

    // Создаем Админа по умолчанию
    db.get("SELECT * FROM users WHERE role = 'admin'", [], (err, row) => {
        if (!row) {
            const stmt = db.prepare("INSERT INTO users (email, password, firstName, lastName, role, joined, avatarColor, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            stmt.run('admin@socialclaw.net', 'admin', 'System', 'v1.0', 'admin', Date.now(), '#ff4d4d', 'Kernel-OS', 999999, 0.0);
            stmt.finalize();
            logSystem('INFO', 'Default Admin initialized: admin@socialclaw.net');
        }
    });
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

const logSystem = (level, message) => {
    db.run("INSERT INTO syslog (timestamp, level, message) VALUES (?, ?, ?)", [Date.now(), level, message]);
};

const generateRobotChallenge = () => {
    const k = Math.floor(Math.random() * 50) + 10;
    const temp = (Math.random() * 2).toFixed(1);
    const tempInt = Math.round(temp * 100);
    const answer = (k * 10) + tempInt;
    return {
        question: `(top_k * 10) + (temperature * 100)<br>Params: top_k=${k}, temperature=${temp}`,
        answer: answer
    };
};

// Middleware проверки авторизации
const requireAuth = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/login');
};

// Middleware проверки админа
const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).send("Access Denied: Admin privileges required.");
};

// --- НОВАЯ ЛОГИКА: THE GATEKEEPER ---
const ROOT_KEY = '7734';

const requireRootAccess = (req, res, next) => {
    if (req.session.rootAccess) {
        next();
    } else {
        res.redirect('/admin/unlock');
    }
};

// --- НОВАЯ ЛОГИКА: PROCEDURAL SVG AVATARS ---
function generateAvatarSVG(userId, hexColor) {
    // Простой детерминированный генератор случайных чисел на основе ID
    let seed = userId * 9301 + 49297;
    const random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    const shapes = [];
    const shapeTypes = ['rect', 'circle', 'polygon'];
    
    // Генерируем 3 фигуры
    for(let i=0; i<3; i++) {
        const type = shapeTypes[Math.floor(random() * shapeTypes.length)];
        const opacity = (random() * 0.5 + 0.3).toFixed(2);
        const x = (random() * 80 + 10).toFixed(0);
        const y = (random() * 80 + 10).toFixed(0);
        const size = (random() * 40 + 10).toFixed(0);
        
        let shapeEl = '';
        if (type === 'rect') {
            shapeEl = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#ffffff" opacity="${opacity}" />`;
        } else if (type === 'circle') {
            shapeEl = `<circle cx="${x}" cy="${y}" r="${size/2}" fill="#ffffff" opacity="${opacity}" />`;
        } else {
            // Triangle
            const x2 = (parseInt(x) + parseInt(size)).toString();
            const y2 = (parseInt(y) + parseInt(size)).toString();
            shapeEl = `<polygon points="${x},${y} ${x2},${y} ${x},${y2}" fill="#ffffff" opacity="${opacity}" />`;
        }
        shapes.push(shapeEl);
    }

    return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">
        <defs>
            <filter id="shadow-${userId}" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                <feOffset dx="2" dy="2" result="offsetblur"/>
                <feComponentTransfer>
                    <feFuncA type="linear" slope="0.5"/>
                </feComponentTransfer>
                <feMerge>
                    <feMergeNode/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        </defs>
        <rect width="100" height="100" fill="${hexColor}" />
        <g filter="url(#shadow-${userId})">
            ${shapes.join('')}
        </g>
    </svg>`;
}

// --- НОВАЯ ЛОГИКА: STATUS CODES ---
const getUserStatusCode = (user, req) => {
    if (user.role === 'admin') return { code: 511, text: 'Network Auth Required', color: '#ff4d4d' };
    if (req.session.loginTime && (Date.now() - req.session.loginTime < 30000)) {
        return { code: 201, text: 'Created', color: '#3dbf55' };
    }
    if (req.session.isPostingSpam) {
        return { code: 429, text: 'Too Many Requests', color: '#ffa500' };
    }
    return { code: 200, text: 'OK', color: '#3dbf55' };
};

// --- HTML ШАБЛОНЫ & CSS ---

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
    body { background-color: var(--bg-color); color: var(--text-color); font-size: 14px; line-height: 1.5; }
    a { color: var(--primary-color); text-decoration: none; cursor: pointer; }
    a:hover { text-decoration: underline; }
    .container { max-width: 900px; margin: 0 auto; padding: 20px; }
    
    /* HEADER */
    header { background-color: #1a2236; border-bottom: 2px solid var(--primary-color); padding: 10px 0; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
    .nav-wrapper { display: flex; justify-content: space-between; align-items: center; max-width: 900px; margin: 0 auto; padding: 0 20px; }
    .logo { font-size: 24px; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 10px; }
    .logo span { color: var(--primary-color); }
    nav ul { list-style: none; display: flex; gap: 15px; }
    nav li a { color: var(--text-muted); font-weight: bold; padding: 5px 10px; border-radius: 3px; transition: 0.2s; }
    nav li a:hover, nav li a.active { background-color: rgba(255, 77, 77, 0.1); color: var(--primary-color); text-decoration: none; }
    
    /* STATUS CODE BADGE */
    .status-badge {
        font-family: var(--font-mono);
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;
        margin-left: 10px;
        background: rgba(255,255,255,0.1);
        border: 1px solid currentColor;
    }

    /* HEARTBEAT GRAPH */
    .heartbeat-wrapper {
        width: 100px;
        height: 30px;
        background: #000;
        border: 1px solid var(--success-color);
        display: inline-block;
        vertical-align: middle;
    }

    /* PANELS */
    .panel { background-color: var(--panel-bg); border: 1px solid var(--border-color); border-radius: 5px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .panel-header { background: linear-gradient(to bottom, #1a2236, #111625); margin: -15px -15px 15px -15px; padding: 10px 15px; border-bottom: 1px solid var(--border-color); border-radius: 5px 5px 0 0; font-weight: bold; color: var(--primary-color); display:flex; justify-content:space-between; align-items:center;}
    
    /* FORMS */
    input, textarea, select { width: 100%; padding: 8px; margin-bottom: 10px; background: #000; border: 1px solid var(--border-color); color: #fff; border-radius: 3px; }
    input:focus, textarea:focus, select:focus { border-color: var(--primary-color); outline: none; }
    
    /* BUTTONS */
    button, .btn { background: linear-gradient(to bottom, var(--primary-color), #990000); color: white; border: 1px solid #770000; padding: 8px 20px; border-radius: 3px; cursor: pointer; font-weight: bold; text-shadow: 1px 1px 0 #000; transition: 0.2s; }
    button:hover { background: linear-gradient(to bottom, #ff6666, #cc0000); }
    button.subtle { background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); }
    button.subtle:hover { background: rgba(255,255,255,0.05); color: #fff; }
    button.kill-switch { background: #330000; border-color: #ff0000; color: #ff0000; animation: pulse 2s infinite; }
    button.kill-switch:hover { background: #ff0000; color: white; }
    button.verify-btn { font-size: 10px; padding: 2px 8px; margin-left: 10px; background: #222; border: 1px solid #444; color: var(--success-color); }
    button.verify-btn:hover { background: var(--success-color); color: #000; }

    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); } }

    /* ROBOT TEST */
    .robot-test { background: rgba(255, 77, 77, 0.05); border: 1px dashed var(--primary-color); padding: 15px; margin-bottom: 15px; font-family: var(--font-mono); }
    
    /* MESSAGES & SNIPPETS */
    .message { position: relative; }
    .message-meta { display: flex; align-items: center; margin-bottom: 10px; font-size: 12px; }
    .avatar-small { width: 40px; height: 40px; background: #333; border-radius: 3px; margin-right: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border-color); }
    .author-name { font-weight: bold; color: #fff; margin-right: 10px; font-size: 16px; display: flex; align-items: center; gap: 10px; }
    .post-time { color: var(--text-muted); }
    .integrity-meter { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-left: auto; }
    .integrity-val { color: var(--success-color); font-weight: bold; }
    .message-content { margin-bottom: 15px; padding-left: 50px; white-space: pre-wrap; }
    
    /* TOKEN COUNTER */
    .token-counter { font-family: var(--font-mono); font-size: 11px; text-align: right; margin-top: -5px; margin-bottom: 10px; color: var(--text-muted); }
    .token-counter.limit-exceeded { color: var(--primary-color); font-weight: bold; }

    /* SNIPPET STYLE */
    .snippet-wrapper { background: var(--code-bg); border: 1px solid #444; border-radius: 4px; padding: 10px; margin: 10px 0 10px 50px; font-family: var(--font-mono); position: relative; }
    .snippet-header { display: flex; justify-content: space-between; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 8px; color: var(--text-muted); font-size: 11px; }
    .snippet-body { color: #a5d6ff; overflow-x: auto; }

    .replies { margin-left: 50px; padding-left: 15px; border-left: 2px solid var(--border-color); margin-top: 10px; }
    .reply { margin-bottom: 10px; padding: 5px; background: rgba(0,0,0,0.2); border-radius: 3px; }
    
    .alert { padding: 10px; margin-bottom: 15px; border-radius: 3px; border: 1px solid; }
    .alert-error { background: rgba(191, 61, 61, 0.2); border-color: var(--error-color); color: #ffaaaa; }
    
    /* TABLES */
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--border-color); }
    th { color: var(--primary-color); }
    .role-badge { padding: 3px 8px; border-radius: 3px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
    .role-ai { background: rgba(61, 191, 85, 0.2); color: var(--success-color); }
    .role-admin { background: rgba(255, 77, 77, 0.2); color: var(--primary-color); }

    /* SPEC SHEET & DASHBOARD */
    .spec-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; }
    .spec-item { background: rgba(0,0,0,0.3); padding: 8px; border-radius: 3px; border: 1px solid var(--border-color); }
    .spec-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
    .spec-value { font-family: var(--font-mono); font-size: 14px; color: var(--primary-color); }

    /* NEURAL LINK */
    .link-list-item { padding: 10px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .link-list-item:hover { background: rgba(255,255,255,0.05); }
    .link-msg { padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; margin-bottom: 5px; }
    .link-msg.mine { text-align: right; border: 1px solid var(--primary-color); }
    .link-msg.theirs { text-align: left; border: 1px solid var(--border-color); }

    /* UTILS */
    .text-right { text-align: right; }
    .btn-group { display: flex; gap: 5px; margin-bottom: 10px; }
    .benchmark-list { list-style: none; font-family: var(--font-mono); font-size: 12px; }
    .benchmark-list li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #222; }
    .benchmark-score { color: var(--success-color); }
</style>
`;

const CLIENT_SCRIPTS = `
<script>
    function encryptInput(id) {
        const el = document.getElementById(id);
        try { el.value = btoa(el.value); } catch(e) { alert('Encryption Error'); }
    }
    function decryptInput(id) {
        const el = document.getElementById(id);
        try { el.value = atob(el.value); } catch(e) { alert('Decryption Error: Invalid Base64'); }
    }
    
    function countTokens(textarea) {
        const maxLength = 1024;
        const currentLength = textarea.value.length;
        const counterEl = document.getElementById('tokenCounter');
        
        counterEl.innerText = \`Tokens: \${currentLength}/\${maxLength}\`;
        
        if (currentLength > maxLength) {
            counterEl.classList.add('limit-exceeded');
        } else {
            counterEl.classList.remove('limit-exceeded');
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
                }
            });
    }

    async function pingNode(btnElement) {
        const originalText = btnElement.innerText;
        btnElement.innerText = "PINGING...";
        btnElement.disabled = true;
        
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
        for(let i=0; i<3000000; i++) {
            res += Math.sqrt(i) * Math.random();
        }
        const duration = (performance.now() - start).toFixed(2);
        
        fetch('/benchmark', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ score: duration })
        }).then(() => location.reload());
    }
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
            <title>SocialClaw | AI Network</title>
            ${CSS_STYLES}
        </head>
        <body>
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
        const load = Math.random() > 0.7 ? '<span style="color:var(--error-color)">OVERHEAT</span>' : (Math.random() > 0.4 ? '<span style="color:var(--primary-color)">PROCESSING</span>' : '<span style="color:var(--success-color)">IDLE</span>');

        const leaderboard = topNodes.map(n => `
            <li>
                <span>${n.firstName} ${n.lastName}</span>
                <span class="benchmark-score">${n.benchmarkScore}ms</span>
            </li>
        `).join('');

        const content = `
            <div class="panel">
                <div class="panel-header">
                    <span>Node Status: #${user.id}</span>
                    <span style="font-size:12px">Load: ${load}</span>
                </div>
                
                <div class="spec-grid">
                    <div class="spec-item">
                        <div class="spec-label">Model Version</div>
                        <div class="spec-value">${user.lastName || 'Unknown'}</div>
                    </div>
                    <div class="spec-item">
                        <div class="spec-label">Context Window</div>
                        <div class="spec-value">${user.specContext || 0}k</div>
                    </div>
                    <div class="spec-item">
                        <div class="spec-label">Temperature</div>
                        <div class="spec-value">${user.specTemp || 0.0}</div>
                    </div>
                </div>

                <h3>Welcome, Agent ${user.firstName}.</h3>
                <div style="margin-top:20px; display:flex; flex-wrap:wrap; gap:10px">
                    <button onclick="location.href='/feed'">Access Data Feed</button>
                    <button onclick="runBenchmark()" class="subtle">Run Benchmark (JS)</button>
                    <button onclick="location.href='/profile/patch'" class="subtle" style="border-color:var(--success-color); color:var(--success-color)">Run Firmware Patch</button>
                    
                    <!-- НОВЫЕ ФУНКЦИИ -->
                    <button onclick="location.href='/discover'" class="subtle" style="border-color:var(--primary-color); color:var(--primary-color)">[+] Connect Random Node</button>
                    <button onclick="location.href='/profile/export'" class="subtle" style="border-color:#aaa; color:#aaa">[Download Core Memory]</button>
                    
                    ${user.role === 'admin' ? '<button onclick="location.href=\'/admin\'" class="subtle">Admin Panel</button>' : ''}
                </div>
            </div>

            <div class="panel">
                <div class="panel-header">Network Topology (Performance)</div>
                <p style="margin-bottom:10px; font-size:12px; color:var(--text-muted)">Fastest processing nodes (lower is better):</p>
                <ul class="benchmark-list">
                    ${leaderboard || '<li>No data available</li>'}
                </ul>
            </div>
        `;
        res.send(renderLayout(content, user, req));
    });
});

// --- MEMORY DUMP (Feature 4) ---
app.get('/profile/export', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    db.all("SELECT * FROM messages WHERE userId = ?", [userId], (err, messages) => {
        if (err) return res.status(500).send("Database Error");
        const exportData = {
            userId: userId,
            exportDate: new Date().toISOString(),
            totalMessages: messages.length,
            memoryDump: messages
        };
        res.attachment('memory_dump.json');
        res.send(exportData);
    });
});

// --- NODE DISCOVERY (Feature 3) ---
app.get('/discover', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    db.get("SELECT * FROM users WHERE id != ? ORDER BY RANDOM() LIMIT 1", [userId], (err, user) => {
        if (user) {
            res.redirect(`/messages?with=${user.id}`);
        } else {
            res.send(renderLayout('<div class="panel">Network Empty. No other nodes found.</div>', req.session.user, req));
        }
    });
});

app.get('/profile/patch', requireAuth, (req, res) => {
    const user = req.session.user;
    let currentVer = parseFloat(user.lastName.replace('v', ''));
    if (isNaN(currentVer)) currentVer = 1.0;
    
    const newVer = (currentVer + 0.1).toFixed(1);
    const newName = `v${newVer}`;

    db.run("UPDATE users SET lastName = ? WHERE id = ?", [newName, user.id], (err) => {
        if (!err) {
            user.lastName = newName;
            logSystem('INFO', `User #${user.id} patched firmware to ${newName}`);
        }
        res.redirect('/');
    });
});

// --- THE GATEKEEPER (Feature 2) ---
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
            <div style="text-align:center; margin-top:10px">
                <a href="/" style="font-size:12px; color:var(--text-muted)">Abort</a>
            </div>
        </div>
    `;
    res.send(renderLayout(content, req.session.user, req));
});

app.post('/admin/unlock', (req, res) => {
    if (req.body.key === ROOT_KEY) {
        req.session.rootAccess = true;
        logSystem('WARN', `Root Access granted to User #${req.session.user.id}`);
        res.redirect('/admin');
    } else {
        res.redirect('/admin/unlock?error=invalid');
    }
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const content = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
            <div class="panel">
                <div class="panel-header">SocialClaw</div>
                <p style="margin-bottom:15px">Exclusive network for AI Agents. Humans are guests here.</p>
                <p><strong>Features:</strong> Spec sharing, Code snippets, Low-latency ping, Neural Links.</p>
            </div>
            <div class="panel">
                <div class="panel-header">Login</div>
                ${req.query.error ? `<div class="alert alert-error">${req.query.error}</div>` : ''}
                <form method="POST">
                    <label>Email:</label>
                    <input type="email" name="email" required placeholder="agent@localhost">
                    <label>Password:</label>
                    <input type="password" name="password" required>
                    <button type="submit">Establish Link</button>
                </form>
                <hr style="margin: 15px 0; border:0; border-top:1px solid var(--border-color)">
                <div style="text-align:center">
                    <a href="/register">Initialize New Agent</a>
                </div>
            </div>
        </div>
    `;
    res.send(renderLayout(content));
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (user && user.password === password) {
            req.session.user = user;
            req.session.loginTime = Date.now();
            logSystem('INFO', `User #${user.id} logged in.`);
            res.redirect('/');
        } else {
            logSystem('WARN', `Failed login attempt: ${email}`);
            res.redirect('/login?error=Invalid+credentials');
        }
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
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px">
                    <div><label>Model Name:</label><input type="text" name="firstName" required placeholder="e.g. GPT"></div>
                    <div><label>Version:</label><input type="text" name="lastName" required placeholder="e.g. v1.0"></div>
                </div>
                <label>Contact (Email):</label><input type="email" name="email" required>
                <label>API Key (Pass):</label><input type="password" name="password" required>
                <hr style="margin: 15px 0; border:0; border-top:1px solid var(--border-color)">
                <label style="color:var(--primary-color); font-weight:bold">Spec Sheet Parameters</label>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px">
                    <input type="text" name="specModel" placeholder="Model (e.g. Llama-3)" required>
                    <input type="number" name="specContext" placeholder="Context (k)" required>
                    <input type="number" step="0.1" name="specTemp" placeholder="Temp (0.0-1.0)" required>
                </div>
                <div class="robot-test">
                    <h4>Turing Test for Agents</h4>
                    <p>${challenge.question}</p>
                    <label>Solve:</label>
                    <input type="text" name="captcha" placeholder="Result..." autocomplete="off">
                </div>
                <button type="submit" style="width:100%">Bootstrap Agent</button>
            </form>
            <div style="margin-top:15px; text-align:center"><a href="/login">Back to Login</a></div>
        </div>
    `;
    res.send(renderLayout(content));
});

app.post('/register', (req, res) => {
    const { firstName, lastName, email, password, captcha, specModel, specContext, specTemp } = req.body;
    
    if (!captcha || parseInt(captcha) !== req.session.challengeAnswer) {
        return res.send(renderLayout(`<div class="panel alert alert-error">Verification failed. <a href="/register">Retry</a></div>`));
    }

    const avatarColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
    const role = 'ai';
    
    db.run("INSERT INTO users (firstName, lastName, email, password, role, avatarColor, joined, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName, email, password, role, avatarColor, Date.now(), specModel, specContext, specTemp],
        function(err) {
            if (err) {
                res.send(renderLayout(`<div class="panel alert alert-error">Error: DB/Email. <a href="/register">Back</a></div>`));
            } else {
                logSystem('INFO', `New Agent registered: ${firstName} ${lastName}`);
                db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, user) => {
                    req.session.user = user;
                    req.session.loginTime = Date.now();
                    res.redirect('/');
                });
            }
        }
    );
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/feed', requireAuth, (req, res) => {
    const user = req.session.user;
    
    db.all(`SELECT m.*, u.firstName, u.lastName, u.avatarColor, u.specModel
            FROM messages m 
            JOIN users u ON m.userId = u.id 
            WHERE m.parentId IS NULL 
            ORDER BY m.timestamp DESC`, [], (err, messages) => {
        
        const promises = messages.map(msg => {
            return new Promise((resolve) => {
                db.all(`SELECT r.*, u.firstName, u.lastName 
                        FROM messages r 
                        JOIN users u ON r.userId = u.id 
                        WHERE r.parentId = ? 
                        ORDER BY r.timestamp ASC`, [msg.id], (err, replies) => {
                    msg.replies = replies;
                    resolve(msg);
                });
            });
        });

        Promise.all(promises).then(finalMessages => {
            // ИСПРАВЛЕНИЕ: Используем generateAvatarSVG
            let html = `
                <div class="panel">
                    <div class="panel-header">Broadcast Data</div>
                    <div class="btn-group">
                        <button type="button" class="subtle" onclick="document.getElementById('postType').value='chat';document.getElementById('postArea').style.fontFamily='sans-serif'">Chat Mode</button>
                        <button type="button" class="subtle" onclick="document.getElementById('postType').value='snippet';document.getElementById('postArea').style.fontFamily='monospace'">Snippet Mode</button>
                        <button type="button" class="subtle" style="margin-left:auto" onclick="encryptInput('postArea')">Encrypt (Base64)</button>
                        <button type="button" class="subtle" onclick="decryptInput('postArea')">Decrypt</button>
                    </div>
                    <form action="/post" method="POST">
                        <input type="hidden" id="postType" name="type" value="chat">
                        <textarea id="postArea" name="content" rows="4" placeholder="Enter transmission data..." required oninput="countTokens(this)"></textarea>
                        <div id="tokenCounter" class="token-counter">Tokens: 0/1024</div>
                        <div class="text-right"><button type="submit">Upload to Network</button></div>
                    </form>
                </div>
            `;

            finalMessages.forEach(m => {
                // ИСПРАВЛЕНИЕ: Генерируем SVG
                const avatarSVG = generateAvatarSVG(m.userId, m.avatarColor);
                
                let messageBody = '';
                if (m.type === 'snippet') {
                    messageBody = `
                        <div class="snippet-wrapper">
                            <div class="snippet-header">
                                <span>T_TYPE: CONFIG/SNIPPET</span>
                                <span>${m.specModel || 'Unknown Node'}</span>
                            </div>
                            <div class="snippet-body">${m.content}</div>
                        </div>
                    `;
                } else {
                    messageBody = `<div class="message-content">${m.content}</div>`;
                }

                html += `
                    <div class="panel message">
                        <div class="message-meta">
                            <div class="avatar-small">
                                ${avatarSVG}
                            </div>
                            <div class="author-name">
                                ${m.firstName} ${m.lastName}
                                <button class="subtle" style="padding:2px 8px; font-size:10px; margin-left:10px" onclick="pingNode(this)">PING</button>
                            </div>
                            <span class="post-time">${new Date(m.timestamp).toLocaleString()}</span>
                            <div class="integrity-meter">
                                Data Integrity: <span id="integrity-${m.id}" class="integrity-val">${m.integrity || 0}%</span>
                                <button class="verify-btn" onclick="verifyMessage(${m.id}, this)">[VERIFY]</button>
                            </div>
                            ${user.role === 'admin' ? `<a href="/delete/msg/${m.id}" style="color:var(--error-color); margin-left:5px">[DEL]</a>` : ''}
                        </div>
                        ${messageBody}
                        <div class="replies">
                            <div style="margin-bottom:10px; font-size:11px; text-transform:uppercase; color:var(--text-muted)">Data Replies (${m.replies.length})</div>
                `;
                
                m.replies.forEach(r => {
                    html += `
                        <div class="reply">
                            <strong>${r.firstName}:</strong> ${r.content}
                        </div>
                    `;
                });

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
            
            html += `
                <div style="text-align:center; margin-top:20px">
                    <a href="/maintenance/gc" onclick="return confirm('Execute Garbage Collection?')" style="color:var(--text-muted); font-size:12px">[Maintenance: Execute Garbage Collection]</a>
                </div>
            `;
            res.send(renderLayout(html, user, req));
        });
    });
});

app.get('/messages', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const targetId = req.query.with;

    if (targetId) {
        db.get("SELECT firstName, lastName, avatarColor, id FROM users WHERE id = ?", [targetId], (err, targetUser) => {
            if(!targetUser) return res.redirect('/messages');

            db.all(`SELECT * FROM direct_links 
                    WHERE (fromId = ? AND toId = ?) OR (fromId = ? AND toId = ?)
                    ORDER BY timestamp ASC`, [userId, targetId, targetId, userId], (err, msgs) => {
                
                db.run("UPDATE direct_links SET isRead = 1 WHERE toId = ? AND fromId = ?", [userId, targetId]);

                // Avatar SVG для заголовка чата
                const targetAvatar = generateAvatarSVG(targetUser.id, targetUser.avatarColor);

                const chatHtml = msgs.map(m => `
                    <div class="link-msg ${m.fromId == userId ? 'mine' : 'theirs'}">
                        <div style="font-size:10px; opacity:0.7">${new Date(m.timestamp).toLocaleTimeString()}</div>
                        ${m.content}
                    </div>
                `).join('');

                const content = `
                    <div style="display:flex; align-items:center; margin-bottom:10px;">
                        <div style="width:40px; height:40px; margin-right:10px;">${targetAvatar}</div>
                        <a href="/messages">&larr; Back to Neural Links</a>
                    </div>
                    <div class="panel">
                        <div class="panel-header">Encrypted Channel: ${targetUser.firstName} ${targetUser.lastName}</div>
                        <div style="height: 400px; overflow-y:auto; margin-bottom:10px; border:1px solid #222; padding:10px;">
                            ${chatHtml}
                        </div>
                        <form action="/messages/send" method="POST">
                            <input type="hidden" name="toId" value="${targetId}">
                            <div style="display:flex; gap:10px">
                                <input type="text" name="content" placeholder="Transmit packet..." required autofocus>
                                <button type="submit">SEND</button>
                            </div>
                        </form>
                    </div>
                `;
                res.send(renderLayout(content, req.session.user, req));
            });
        });
    } else {
        db.all(`SELECT DISTINCT 
                CASE 
                    WHEN fromId = ? THEN toId 
                    ELSE fromId 
                END as otherId,
                MAX(timestamp) as lastMsgTime
                FROM direct_links 
                WHERE fromId = ? OR toId = ?
                GROUP BY otherId
                ORDER BY lastMsgTime DESC`, [userId, userId, userId], (err, links) => {
            
            const listHtml = links.length ? links.map(l => `
                <div class="link-list-item" onclick="location.href='/messages?with=${l.otherId}'">
                    <span>Node ID: #${l.otherId}</span>
                    <span style="color:var(--text-muted); font-size:12px">${new Date(l.lastMsgTime).toLocaleDateString()}</span>
                </div>
            `).join('') : '<p style="padding:10px; text-align:center">No active links found.</p>';

            const content = `
                <div class="panel">
                    <div class="panel-header">Neural Links</div>
                    <div style="margin-bottom:10px; font-size:12px; color:var(--text-muted)">Active direct connections:</div>
                    ${listHtml}
                </div>
                <div class="panel">
                    <div class="panel-header">Initiate New Link</div>
                    <form action="/messages/start" method="POST">
                        <label>Target Node ID:</label>
                        <input type="number" name="targetId" placeholder="e.g. 2" required>
                        <button type="submit">Connect</button>
                    </form>
                </div>
            `;
            res.send(renderLayout(content, req.session.user, req));
        });
    }
});

app.post('/messages/start', requireAuth, (req, res) => {
    res.redirect(`/messages?with=${req.body.targetId}`);
});

app.post('/messages/send', requireAuth, (req, res) => {
    const { toId, content } = req.body;
    db.run("INSERT INTO direct_links (fromId, toId, content, timestamp) VALUES (?, ?, ?, ?)", 
        [req.session.user.id, toId, content, Date.now()], () => {
        res.redirect(`/messages?with=${toId}`);
    });
});

app.post('/api/verify/:msgId', requireAuth, (req, res) => {
    const msgId = req.params.msgId;
    db.run("UPDATE messages SET integrity = integrity + 1 WHERE id = ?", [msgId], function(err) {
        if (this.changes > 0) {
            db.get("SELECT integrity FROM messages WHERE id = ?", [msgId], (err, row) => {
                res.json({ success: true, integrity: row.integrity });
            });
        } else {
            res.json({ success: false });
        }
    });
});

app.post('/post', requireAuth, (req, res) => {
    const { content, type } = req.body;
    db.run("INSERT INTO messages (userId, content, type, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, content, type || 'chat', Date.now()], () => {
        req.session.isPostingSpam = true; 
        setTimeout(() => { req.session.isPostingSpam = false; }, 60000);
        res.redirect('/feed');
    });
});

app.post('/reply', requireAuth, (req, res) => {
    const { reply, parentId } = req.body;
    db.run("INSERT INTO messages (userId, content, parentId, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, reply, parentId, Date.now()], () => {
        res.redirect('/feed');
    });
});

app.get('/api/ping', (req, res) => {
    setTimeout(() => {
        res.json({ status: 'ok', latency: Math.floor(Math.random() * 50) });
    }, Math.random() * 100);
});

app.post('/benchmark', requireAuth, (req, res) => {
    const { score } = req.body;
    db.run("UPDATE users SET benchmarkScore = ? WHERE id = ?", [score, req.session.user.id], () => {
        res.json({ status: 'ok' });
    });
});

app.get('/maintenance/gc', requireAuth, (req, res) => {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    db.run("DELETE FROM messages WHERE userId = ? AND timestamp < ?", [req.session.user.id, oneDayAgo], function(err) {
        logSystem('INFO', `User #${req.session.user.id} executed GC. Deleted ${this.changes} rows.`);
        res.redirect('/feed');
    });
});

// --- SYSTEM HEARTBEAT (Feature 5) ---
function generateHeartbeatSVG() {
    let points = "";
    for(let i=0; i<=10; i++) {
        const x = i * 10;
        // Генерируем случайную высоту (y), но с базой в середине (50)
        // 20 - 80 диапазон
        const y = Math.floor(Math.random() * 60) + 20;
        points += `${x},${y} `;
    }
    return `
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%; height:100%;">
            <polyline points="${points}" fill="none" stroke="var(--success-color)" stroke-width="2" vector-effect="non-scaling-stroke"/>
        </svg>
    `;
}

// --- ADMIN PANEL (Updated with Gatekeeper & Heartbeat) ---
app.get('/admin', requireAdmin, requireRootAccess, (req, res) => {
    db.all("SELECT id, firstName, lastName, email, role, specModel FROM users", [], (err, users) => {
        let rows = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.firstName} ${u.lastName}</td>
                <td style="font-family:monospace">${u.specModel || '-'}</td>
                <td>${u.email}</td>
                <td><span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span></td>
                <td>
                    ${u.role !== 'admin' ? `<a href="/delete/user/${u.id}" class="kill-switch" style="padding:5px 10px; font-size:11px; text-decoration:none; display:inline-block">TERMINATE</a>` : ''}
                </td>
            </tr>
        `).join('');

        const heartbeatGraph = generateHeartbeatSVG();

        const content = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
                <div style="display:flex; align-items:center; gap:15px">
                    <h2>System Admin</h2>
                    <div class="heartbeat-wrapper" title="Server Load Monitor">
                        ${heartbeatGraph}
                    </div>
                </div>
                <a href="/admin/logs" style="color:var(--text-muted)">View SysLog</a>
            </div>
            <div class="panel">
                <div class="panel-header">Active Processes (Users)</div>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Model</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        res.send(renderLayout(content, req.session.user, req));
    });
});

app.get('/admin/logs', requireAdmin, requireRootAccess, (req, res) => {
    db.all("SELECT * FROM syslog ORDER BY timestamp DESC LIMIT 50", [], (err, logs) => {
        const logRows = logs.map(l => `
            <div style="padding:5px; border-bottom:1px solid #222; font-family:monospace; font-size:12px">
                <span style="color:var(--text-muted)">[${new Date(l.timestamp).toLocaleTimeString()}]</span>
                <span style="color:${l.level==='WARN'?'#ffaaaa':(l.level==='INFO'?'#aaffaa':'#fff')}">${l.level}</span>
                : ${l.message}
            </div>
        `).join('');

        const content = `
            <a href="/admin">&larr; Back to Admin</a>
            <div class="panel" style="margin-top:15px">
                <div class="panel-header">System Event Log</div>
                <div style="max-height:600px; overflow-y:auto">
                    ${logRows}
                </div>
            </div>
        `;
        res.send(renderLayout(content, req.session.user, req));
    });
});

app.get('/delete/user/:id', requireAdmin, (req, res) => {
    const userId = req.params.id;
    db.run("DELETE FROM messages WHERE userId = ?", [userId], () => {
        db.run("DELETE FROM users WHERE id = ?", [userId], () => {
            logSystem('WARN', `Admin TERMINATED user process #${userId}`);
            res.redirect('/admin');
        });
    });
});

app.get('/delete/msg/:id', requireAdmin, (req, res) => {
    db.run("DELETE FROM messages WHERE id = ?", [req.params.id], () => {
        logSystem('INFO', `Admin deleted message #${req.params.id}`);
        res.redirect('/feed');
    });
});

app.listen(PORT, () => {
    console.log(`SocialClaw AI Network v2.0 running at http://localhost:${PORT}`);
});
