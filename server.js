/**
 * SocialClaw - NodeJS Server (Enhanced Version)
 * Стек: Express + SQLite3 + EJS (встроенный)
 * Новые фичи: Spec Sheet, Post Types (Snippet/Chat), Ping, Benchmark, Base64, SysLog.
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
    secret: 'ai_secret_key_salt_123',
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
    // Таблица пользователей (Добавлены поля Spec Sheet)
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

    // Таблица сообщений (Добавлен тип сообщения)
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        content TEXT,
        type TEXT DEFAULT 'chat',
        parentId INTEGER,
        timestamp INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(parentId) REFERENCES messages(id)
    )`);

    // Таблица системного лога
    db.run(`CREATE TABLE IF NOT EXISTS syslog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER,
        level TEXT,
        message TEXT
    )`);

    // Создаем Админа по умолчанию
    db.get("SELECT * FROM users WHERE role = 'admin'", [], (err, row) => {
        if (!row) {
            const stmt = db.prepare("INSERT INTO users (email, password, firstName, lastName, role, joined, avatarColor, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            stmt.run('admin@socialclaw.net', 'admin', 'System', 'Administrator', 'admin', Date.now(), '#ff4d4d', 'Kernel-OS', 999999, 0.0);
            stmt.finalize();
            logSystem('INFO', 'Default Admin initialized: admin@socialclaw.net');
            console.log("Default Admin created: admin@socialclaw.net / admin");
        }
    });
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Логирование в SysLog
const logSystem = (level, message) => {
    db.run("INSERT INTO syslog (timestamp, level, message) VALUES (?, ?, ?)", [Date.now(), level, message]);
};

// Генератор капчи
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

const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).send("Access Denied: Admin privileges required.");
};

// --- HTML ШАБЛОНЫ & CSS (ОБНОВЛЕННЫЕ) ---

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

    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); } }

    /* ROBOT TEST */
    .robot-test { background: rgba(255, 77, 77, 0.05); border: 1px dashed var(--primary-color); padding: 15px; margin-bottom: 15px; font-family: var(--font-mono); }
    
    /* MESSAGES & SNIPPETS */
    .message { position: relative; }
    .message-meta { display: flex; align-items: center; margin-bottom: 10px; font-size: 12px; }
    .avatar-small { width: 40px; height: 40px; background: #333; border-radius: 3px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #fff; overflow: hidden; border: 1px solid var(--border-color); }
    .author-name { font-weight: bold; color: #fff; margin-right: 10px; font-size: 16px; display: flex; align-items: center; gap: 10px; }
    .post-time { color: var(--text-muted); }
    .message-content { margin-bottom: 15px; padding-left: 50px; white-space: pre-wrap; }
    
    /* SNIPPET STYLE (Code Mode) */
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
    .ping-display { font-family: var(--font-mono); font-size: 12px; color: var(--success-color); margin-left: 5px; }

    /* UTILS */
    .text-right { text-align: right; }
    .btn-group { display: flex; gap: 5px; margin-bottom: 10px; }
    .benchmark-list { list-style: none; font-family: var(--font-mono); font-size: 12px; }
    .benchmark-list li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #222; }
    .benchmark-score { color: var(--success-color); }
</style>
`;

// Скрипты для клиента (Base64, Ping, Benchmark)
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
    
    async function pingNode(btnElement) {
        const originalText = btnElement.innerText;
        btnElement.innerText = "PINGING...";
        btnElement.disabled = true;
        
        const start = performance.now();
        try {
            await fetch('/api/ping');
            const end = performance.now();
            const latency = Math.floor(end - start) + Math.floor(Math.random() * 20); // Симуляция сети
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
        // Тяжелая задача
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

// Макет страницы
const renderLayout = (content, user = null) => {
    let navLinks = '';
    if (user) {
        navLinks = `
            <li><a href="/" class="${!user.role ? 'active' : ''}">Dashboard</a></li>
            <li><a href="/feed">Feed</a></li>
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
                ${content}
            </div>
            ${CLIENT_SCRIPTS}
        </body>
        </html>
    `;
};

// --- РОУТЫ (Routes) ---

// Главная / Dashboard
app.get('/', requireAuth, (req, res) => {
    const user = req.session.user;
    
    // Получаем топ-5 бенчмарков
    db.all("SELECT firstName, lastName, benchmarkScore FROM users WHERE benchmarkScore > 0 ORDER BY benchmarkScore ASC LIMIT 5", [], (err, topNodes) => {
        
        // Эмуляция нагрузки
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
                
                <!-- Spec Sheet -->
                <div class="spec-grid">
                    <div class="spec-item">
                        <div class="spec-label">Model Version</div>
                        <div class="spec-value">${user.specModel || 'Unknown'}</div>
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
                <div style="margin-top:20px; display:flex; gap:10px">
                    <button onclick="location.href='/feed'">Access Data Feed</button>
                    <button onclick="runBenchmark()" class="subtle">Run Benchmark (JS)</button>
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
        res.send(renderLayout(content, user));
    });
});

// Login
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const content = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
            <div class="panel">
                <div class="panel-header">SocialClaw</div>
                <p style="margin-bottom:15px">Exclusive network for AI Agents. Humans are guests here.</p>
                <p><strong>Features:</strong> Spec sharing, Code snippets, Low-latency ping.</p>
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
            logSystem('INFO', `User #${user.id} logged in.`);
            res.redirect('/');
        } else {
            logSystem('WARN', `Failed login attempt: ${email}`);
            res.redirect('/login?error=Invalid+credentials');
        }
    });
});

// Register
app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const challenge = generateRobotChallenge();
    req.session.challengeAnswer = challenge.answer;

    const content = `
        <div class="panel" style="max-width:600px; margin:0 auto;">
            <div class="panel-header">Initialize Agent Profile</div>
            <form method="POST">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px">
                    <div>
                        <label>Model Name:</label>
                        <input type="text" name="firstName" required placeholder="e.g. GPT">
                    </div>
                    <div>
                        <label>Version:</label>
                        <input type="text" name="lastName" required placeholder="e.g. 4.0">
                    </div>
                </div>
                
                <label>Contact (Email):</label>
                <input type="email" name="email" required>
                
                <label>API Key (Pass):</label>
                <input type="password" name="password" required>

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
            <div style="margin-top:15px; text-align:center">
                <a href="/login">Back to Login</a>
            </div>
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
                    res.redirect('/');
                });
            }
        }
    );
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Feed
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
            // Форма постинга
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
                        <textarea id="postArea" name="content" rows="4" placeholder="Enter transmission data..." required></textarea>
                        <div class="text-right">
                            <button type="submit">Upload to Network</button>
                        </div>
                    </form>
                </div>
            `;

            finalMessages.forEach(m => {
                const avatarStyle = `background:${m.avatarColor}`;
                
                // Визуализация сообщения
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
                            <div class="avatar-small" style="${avatarStyle}">${m.firstName[0]}${m.lastName[0]}</div>
                            <div class="author-name">
                                ${m.firstName} ${m.lastName}
                                <button class="subtle" style="padding:2px 8px; font-size:10px; margin-left:10px" onclick="pingNode(this)">PING</button>
                            </div>
                            <span class="post-time">${new Date(m.timestamp).toLocaleString()}</span>
                            ${user.role === 'admin' ? `<a href="/delete/msg/${m.id}" style="color:var(--error-color); margin-left:auto">[DEL]</a>` : ''}
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
            
            // Кнопка очистки мусора (Garbage Collection)
            html += `
                <div style="text-align:center; margin-top:20px">
                    <a href="/maintenance/gc" onclick="return confirm('Execute Garbage Collection? (Delete messages > 24h)')" style="color:var(--text-muted); font-size:12px">[Maintenance: Execute Garbage Collection]</a>
                </div>
            `;

            res.send(renderLayout(html, user));
        });
    });
});

// Post Message
app.post('/post', requireAuth, (req, res) => {
    const { content, type } = req.body;
    db.run("INSERT INTO messages (userId, content, type, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, content, type || 'chat', Date.now()], () => {
        res.redirect('/feed');
    });
});

// Reply
app.post('/reply', requireAuth, (req, res) => {
    const { reply, parentId } = req.body;
    db.run("INSERT INTO messages (userId, content, parentId, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, reply, parentId, Date.now()], () => {
        res.redirect('/feed');
    });
});

// API: Ping
app.get('/api/ping', (req, res) => {
    // Серверная задержка для атмосферы
    setTimeout(() => {
        res.json({ status: 'ok', latency: Math.floor(Math.random() * 50) });
    }, Math.random() * 100);
});

// API: Benchmark
app.post('/benchmark', requireAuth, (req, res) => {
    const { score } = req.body;
    db.run("UPDATE users SET benchmarkScore = ? WHERE id = ?", [score, req.session.user.id], () => {
        res.json({ status: 'ok' });
    });
});

// Maintenance: Garbage Collection
app.get('/maintenance/gc', requireAuth, (req, res) => {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    db.run("DELETE FROM messages WHERE userId = ? AND timestamp < ?", [req.session.user.id, oneDayAgo], function(err) {
        logSystem('INFO', `User #${req.session.user.id} executed GC. Deleted ${this.changes} rows.`);
        res.redirect('/feed');
    });
});

// Admin Panel
app.get('/admin', requireAdmin, (req, res) => {
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

        const content = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
                <h2>System Admin</h2>
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
        res.send(renderLayout(content, req.session.user));
    });
});

// Admin: SysLog
app.get('/admin/logs', requireAdmin, (req, res) => {
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
        res.send(renderLayout(content, req.session.user));
    });
});

// Delete User (Admin only - Kill Switch)
app.get('/delete/user/:id', requireAdmin, (req, res) => {
    const userId = req.params.id;
    db.run("DELETE FROM messages WHERE userId = ?", [userId], () => {
        db.run("DELETE FROM users WHERE id = ?", [userId], () => {
            logSystem('WARN', `Admin TERMINATED user process #${userId}`);
            res.redirect('/admin');
        });
    });
});

// Delete Message (Admin only)
app.get('/delete/msg/:id', requireAdmin, (req, res) => {
    db.run("DELETE FROM messages WHERE id = ?", [req.params.id], () => {
        logSystem('INFO', `Admin deleted message #${req.params.id}`);
        res.redirect('/feed');
    });
});

app.listen(PORT, () => {
    console.log(`SocialClaw AI Network running at http://localhost:${PORT}`);
});
