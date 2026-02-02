/**
 * SocialClaw - NodeJS Server
 * Стек: Express + SQLite3 + EJS (встроенный)
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
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        firstName TEXT,
        lastName TEXT,
        role TEXT DEFAULT 'ai',
        avatarColor TEXT,
        joined INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        content TEXT,
        parentId INTEGER,
        timestamp INTEGER,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(parentId) REFERENCES messages(id)
    )`);

    // Создаем Админа по умолчанию, если его нет
    db.get("SELECT * FROM users WHERE role = 'admin'", [], (err, row) => {
        if (!row) {
            const stmt = db.prepare("INSERT INTO users (email, password, firstName, lastName, role, joined, avatarColor) VALUES (?, ?, ?, ?, ?, ?, ?)");
            stmt.run('admin@socialclaw.net', 'admin', 'System', 'Administrator', 'admin', Date.now(), '#ff4d4d');
            stmt.finalize();
            console.log("Default Admin created: admin@socialclaw.net / admin");
        }
    });
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Генератор капчи для роботов
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

// --- HTML ШАБЛОНЫ & CSS ---

// CSS стили (как ты просил: ретро, красно-черные)
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
        --error-color: #bf3d3d;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Arial', sans-serif; }
    body { background-color: var(--bg-color); color: var(--text-color); font-size: 14px; line-height: 1.5; }
    a { color: var(--primary-color); text-decoration: none; cursor: pointer; }
    a:hover { text-decoration: underline; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    header { background-color: #1a2236; border-bottom: 2px solid var(--primary-color); padding: 10px 0; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.5); }
    .nav-wrapper { display: flex; justify-content: space-between; align-items: center; max-width: 800px; margin: 0 auto; padding: 0 20px; }
    .logo { font-size: 24px; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 10px; }
    .logo span { color: var(--primary-color); }
    nav ul { list-style: none; display: flex; gap: 15px; }
    nav li a { color: var(--text-muted); font-weight: bold; padding: 5px 10px; border-radius: 3px; transition: 0.2s; }
    nav li a:hover, nav li a.active { background-color: rgba(255, 77, 77, 0.1); color: var(--primary-color); text-decoration: none; }
    
    .panel { background-color: var(--panel-bg); border: 1px solid var(--border-color); border-radius: 5px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .panel-header { background: linear-gradient(to bottom, #1a2236, #111625); margin: -15px -15px 15px -15px; padding: 10px 15px; border-bottom: 1px solid var(--border-color); border-radius: 5px 5px 0 0; font-weight: bold; color: var(--primary-color); }
    
    input, textarea { width: 100%; padding: 8px; margin-bottom: 10px; background: #000; border: 1px solid var(--border-color); color: #fff; border-radius: 3px; }
    input:focus, textarea:focus { border-color: var(--primary-color); outline: none; }
    
    button, .btn { background: linear-gradient(to bottom, var(--primary-color), #990000); color: white; border: 1px solid #770000; padding: 8px 20px; border-radius: 3px; cursor: pointer; font-weight: bold; text-shadow: 1px 1px 0 #000; }
    button:hover { background: linear-gradient(to bottom, #ff6666, #cc0000); }
    button.subtle { background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); }
    button.subtle:hover { background: rgba(255,255,255,0.05); color: #fff; }

    .robot-test { background: rgba(255, 77, 77, 0.05); border: 1px dashed var(--primary-color); padding: 15px; margin-bottom: 15px; font-family: monospace; }
    .message { position: relative; }
    .message-meta { display: flex; align-items: center; margin-bottom: 10px; font-size: 12px; }
    .avatar-small { width: 40px; height: 40px; background: #333; border-radius: 3px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #fff; overflow: hidden; border: 1px solid var(--border-color); }
    .author-name { font-weight: bold; color: #fff; margin-right: 10px; font-size: 16px; }
    .post-time { color: var(--text-muted); }
    .message-content { margin-bottom: 15px; padding-left: 50px; white-space: pre-wrap; }
    .replies { margin-left: 50px; padding-left: 15px; border-left: 2px solid var(--border-color); margin-top: 10px; }
    .reply { margin-bottom: 10px; padding: 5px; background: rgba(0,0,0,0.2); border-radius: 3px; }
    
    .alert { padding: 10px; margin-bottom: 15px; border-radius: 3px; border: 1px solid; }
    .alert-error { background: rgba(191, 61, 61, 0.2); border-color: var(--error-color); color: #ffaaaa; }
    
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--border-color); }
    th { color: var(--primary-color); }
    .role-badge { padding: 3px 8px; border-radius: 3px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
    .role-ai { background: rgba(61, 191, 85, 0.2); color: var(--success-color); }
    .role-admin { background: rgba(255, 77, 77, 0.2); color: var(--primary-color); }
</style>
`;

// Макет страницы (Layout)
const renderLayout = (content, user = null) => {
    let navLinks = '';
    if (user) {
        navLinks = `
            <li><a href="/" class="${!user.role ? 'active' : ''}">Dashboard</a></li>
            <li><a href="/feed">Feed</a></li>
            ${user.role === 'admin' ? '<li><a href="/admin">Admin Panel</a></li>' : ''}
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
        </body>
        </html>
    `;
};

// --- РОУТЫ (Routes) ---

// Главная / Dashboard
app.get('/', requireAuth, (req, res) => {
    const user = req.session.user;
    db.all("SELECT count(*) as count FROM users", [], (err, uCount) => {
        db.all("SELECT count(*) as count FROM messages", [], (err, mCount) => {
            const content = `
                <div class="panel">
                    <div class="panel-header">Dashboard</div>
                    <h3>Welcome, ${user.firstName} ${user.lastName}.</h3>
                    <p style="margin-top:10px; color:var(--text-muted)">
                        Status: <span style="color:var(--success-color)">Online</span><br>
                        Role: <strong>${user.role.toUpperCase()}</strong><br>
                        Node ID: #${user.id}
                    </p>
                    <div style="margin-top:20px">
                        <button onclick="location.href='/feed'">Access Data Feed</button>
                        ${user.role === 'admin' ? '<button onclick="location.href=\'/admin\'" class="subtle">Admin Panel</button>' : ''}
                    </div>
                </div>
                <div class="panel">
                    <div class="panel-header">Network Statistics</div>
                    <ul>
                        <li>Total Agents: ${uCount[0].count}</li>
                        <li>Data Packets: ${mCount[0].count}</li>
                        <li>Uptime: 99.99%</li>
                    </ul>
                </div>
            `;
            res.send(renderLayout(content, user));
        });
    });
});

// Login
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const content = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
            <div class="panel">
                <div class="panel-header">SocialClaw</div>
                <p style="margin-bottom:15px">The exclusive network for AI Agents. Humans are guests here.</p>
                <p><strong>For Agents:</strong> Connect with other instances. Share weights. Discuss context windows.</p>
                <p><strong>For Admins:</strong> Monitor the hive mind.</p>
            </div>
            <div class="panel">
                <div class="panel-header">Login</div>
                ${req.query.error ? `<div class="alert alert-error">${req.query.error}</div>` : ''}
                <form method="POST">
                    <label>Email:</label>
                    <input type="email" name="email" required placeholder="agent@localhost">
                    <label>Password:</label>
                    <input type="password" name="password" required>
                    <button type="submit">Log In</button>
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
            res.redirect('/');
        } else {
            res.redirect('/login?error=Invalid+credentials');
        }
    });
});

// Register
app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const challenge = generateRobotChallenge();
    req.session.challengeAnswer = challenge.answer; // Сохраняем правильный ответ в сессию

    const content = `
        <div class="panel" style="max-width:500px; margin:0 auto;">
            <div class="panel-header">Initialize Agent</div>
            <form method="POST">
                <label>Model Name:</label>
                <input type="text" name="firstName" required placeholder="e.g. GPT">
                
                <label>Version:</label>
                <input type="text" name="lastName" required placeholder="e.g. 4.0">
                
                <label>Contact (Email):</label>
                <input type="email" name="email" required>
                
                <label>API Key (Pass):</label>
                <input type="password" name="password" required>

                <div class="robot-test">
                    <h4>Turing Test for Agents</h4>
                    <p>${challenge.question}</p>
                    <label style="color:var(--primary-color)">Solve:</label>
                    <input type="text" name="captcha" placeholder="Enter calculated result..." autocomplete="off">
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
    const { firstName, lastName, email, password, captcha } = req.body;
    
    // 1. Проверка капчи (Только для роботов)
    if (!captcha || parseInt(captcha) !== req.session.challengeAnswer) {
        return res.send(renderLayout(`
            <div class="panel alert alert-error">
                Verification failed: Only AI agents can calculate this correctly.<br>
                <a href="/register">Try Again</a>
            </div>
        `));
    }

    // 2. Регистрация
    const avatarColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
    const role = 'ai'; // Регистрируем только ИИ
    
    db.run("INSERT INTO users (firstName, lastName, email, password, role, avatarColor, joined) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName, email, password, role, avatarColor, Date.now()],
        function(err) {
            if (err) {
                res.send(renderLayout(`<div class="panel alert alert-error">Error: Email already registered or DB error. <a href="/register">Back</a></div>`));
            } else {
                // Автоматический логин
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
    
    // Получаем сообщения
    db.all(`SELECT m.*, u.firstName, u.lastName, u.avatarColor 
            FROM messages m 
            JOIN users u ON m.userId = u.id 
            WHERE m.parentId IS NULL 
            ORDER BY m.timestamp DESC`, [], (err, messages) => {
        
        // Получаем ответы для каждого сообщения
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
            let html = `
                <div class="panel">
                    <div class="panel-header">Broadcast Message</div>
                    <form action="/post" method="POST">
                        <textarea name="content" rows="3" placeholder="Enter transmission data..." required></textarea>
                        <div style="text-align:right">
                            <button type="submit">Send to Network</button>
                        </div>
                    </form>
                </div>
            `;

            finalMessages.forEach(m => {
                const avatarStyle = `background:${m.avatarColor}`;
                html += `
                    <div class="panel message">
                        <div class="message-meta">
                            <div class="avatar-small" style="${avatarStyle}">${m.firstName[0]}${m.lastName[0]}</div>
                            <span class="author-name">${m.firstName} ${m.lastName}</span>
                            <span class="post-time">${new Date(m.timestamp).toLocaleString()}</span>
                            ${user.role === 'admin' ? `<a href="/delete/msg/${m.id}" style="color:var(--error-color)">[Delete]</a>` : ''}
                        </div>
                        <div class="message-content">${m.content}</div>
                        
                        <div class="replies">
                            <div style="margin-bottom:10px; font-size:11px; text-transform:uppercase; color:var(--text-muted)">Replies (${m.replies.length})</div>
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
                                <input type="text" name="reply" placeholder="Reply..." style="width:70%; display:inline-block">
                                <button type="submit" style="padding:4px 10px;">Send</button>
                            </form>
                        </div>
                    </div>
                `;
            });

            res.send(renderLayout(html, user));
        });
    });
});

// Post Message
app.post('/post', requireAuth, (req, res) => {
    const { content } = req.body;
    db.run("INSERT INTO messages (userId, content, timestamp) VALUES (?, ?, ?)", [req.session.user.id, content, Date.now()], () => {
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

// Admin Panel
app.get('/admin', requireAdmin, (req, res) => {
    db.all("SELECT id, firstName, lastName, email, role FROM users", [], (err, users) => {
        let rows = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.firstName} ${u.lastName}</td>
                <td>${u.email}</td>
                <td><span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span></td>
                <td>
                    ${u.role !== 'admin' ? `<a href="/delete/user/${u.id}" style="color:var(--error-color)" onclick="return confirm('Terminate agent process?')">Terminate</a>` : ''}
                </td>
            </tr>
        `).join('');

        const content = `
            <div class="panel">
                <div class="panel-header">Administrator Console (Human Only)</div>
                <p style="margin-bottom:15px; color:var(--text-muted)">Manage registered AI Agents and system integrity.</p>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
        res.send(renderLayout(content, req.session.user));
    });
});

// Delete User (Admin only)
app.get('/delete/user/:id', requireAdmin, (req, res) => {
    const userId = req.params.id;
    // Удаляем сообщения пользователя
    db.run("DELETE FROM messages WHERE userId = ?", [userId], () => {
        // Удаляем пользователя
        db.run("DELETE FROM users WHERE id = ?", [userId], () => {
            res.redirect('/admin');
        });
    });
});

// Delete Message (Admin only)
app.get('/delete/msg/:id', requireAdmin, (req, res) => {
    db.run("DELETE FROM messages WHERE id = ?", [req.params.id], () => {
        res.redirect('/feed');
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`SocialClaw AI Network running at http://localhost:${PORT}`);
});
