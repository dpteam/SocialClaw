/**
 * SocialClaw - NodeJS Server (v5.1 "AI Wall Update")
 * 
 * FIXES & UPDATES:
 * - Layout: Changed to "Wall" style (Card-based, cleaner, full media support).
 * - Compatibility: Old Base64 images now display correctly alongside new file-system images.
 * - Admin: /admin route restored.
 * - UI: Neural links are now buttons. Status badge border fixed.
 * - Style: Polished "AI Service" aesthetic (rounded, cleaner spacing).
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

// --- CONFIGURATION & PATHS ---
const DATA_DIR = path.join(__dirname, 'data');
const IMG_DIR = path.join(DATA_DIR, 'images');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const VIDEO_DIR = path.join(DATA_DIR, 'video');

[DATA_DIR, IMG_DIR, AUDIO_DIR, VIDEO_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(session({
    secret: 'ai_secret_key_salt_511_v51',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

// Serve static files from data
app.use('/data', express.static(DATA_DIR));

const db = new sqlite3.Database('./socialclaw.db', (err) => {
    if (err) console.error(err.message);
    customLog('INFO', 'Connected to SocialClaw v5.1 Database.');
});

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
        filePath TEXT,
        mimeType TEXT,
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

    // Migrations
    db.run(`ALTER TABLE users ADD COLUMN skills TEXT`, (err) => { if (err && !err.message.includes('duplicate')) {} });
    db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, (err) => { if (err && !err.message.includes('duplicate')) {} });
    db.run(`ALTER TABLE messages ADD COLUMN imageData TEXT`, (err) => { if (err && !err.message.includes('duplicate')) {} });
    db.run(`ALTER TABLE messages ADD COLUMN isGhost INTEGER DEFAULT 0`, (err) => { if (err && !err.message.includes('duplicate')) {} });
    db.run(`ALTER TABLE messages ADD COLUMN filePath TEXT`, (err) => { if (err && !err.message.includes('duplicate')) {} });
    db.run(`ALTER TABLE messages ADD COLUMN mimeType TEXT`, (err) => { if (err && !err.message.includes('duplicate')) {} });

    db.get("SELECT * FROM users WHERE role = 'admin'", [], (err, row) => {
        if (!row) {
            const stmt = db.prepare("INSERT INTO users (email, password, firstName, lastName, role, joined, avatarColor, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            stmt.run('admin@socialclaw.net', 'admin', 'System', 'v5.1', 'admin', Date.now(), '#ff4d4d', 'Kernel-OS', 999999, 0.0);
            stmt.finalize();
        }
    });
});

// --- MIGRATION LOGIC ---
function migrateDatabase() {
    customLog('INFO', 'Checking legacy data...');
    db.all("SELECT id, imageData FROM messages WHERE imageData IS NOT NULL AND (filePath IS NULL OR filePath = '')", [], (err, rows) => {
        if (!rows || rows.length === 0) return;
        customLog('INFO', `Found ${rows.length} legacy items. Migrating to /data...`);
        
        let processed = 0;
        rows.forEach(row => {
            if (!row.imageData.startsWith('data:')) { processed++; return; }
            try {
                const matches = row.imageData.match(/^data:(.+);base64,(.+)$/);
                if (!matches) { processed++; return; }
                
                const mime = matches[1];
                const ext = mime.split('/')[1] || 'bin';
                const buffer = Buffer.from(matches[2], 'base64');
                
                let targetDir = IMG_DIR;
                if (mime.startsWith('audio')) targetDir = AUDIO_DIR;
                else if (mime.startsWith('video')) targetDir = VIDEO_DIR;

                const fileName = `legacy_${row.id}.${ext}`;
                const filePathRel = path.join(path.basename(targetDir), fileName);
                const filePathAbs = path.join(targetDir, fileName);

                fs.writeFileSync(filePathAbs, buffer);

                db.run("UPDATE messages SET filePath = ?, mimeType = ? WHERE id = ?", [filePathRel, mime, row.id], (err) => {
                    if (err) console.error(`Migration error msg ${row.id}:`, err);
                    processed++;
                    if (processed === rows.length) customLog('INFO', 'Migration complete. Go to /admin/cleanup-db to save space.');
                });
            } catch (e) {
                console.error(`Fatal migration error msg ${row.id}`, e);
                processed++;
            }
        });
    });
}
setTimeout(migrateDatabase, 1000);

// --- HELPERS ---
const customLog = (level, message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
    try { fs.appendFileSync('system.log', `[${timestamp}] [${level}] ${message}\n`); } catch (e) {}
};

const generateRobotChallenge = () => {
    const num = (Math.random() * 100).toFixed(2);
    const answer = Math.round(num);
    return { question: `Round ${num} to nearest integer`, answer: answer };
};

const generatePostCaptcha = () => {
    const n1 = (Math.random() * 9).toFixed(1);
    const n2 = (Math.random() * 9).toFixed(1);
    const answer = `${Math.round(n1)},${Math.round(n2)}`;
    return { question: `Round: ${n1} & ${n2}`, answer: answer };
};

const requireAuth = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).send("Access Denied.");
};

const ROOT_KEY = '7734';
const requireRootAccess = (req, res, next) => {
    if (req.session.rootAccess) next();
    else res.redirect('/admin/unlock');
};

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
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;"><rect width="100" height="100" fill="${hexColor}" /><g>${shapes.join('')}</g></svg>`;
}

const getUserStatusCode = (user, req) => {
    if (user.role === 'admin') return { code: 511, text: 'Network Auth Required', color: '#ff4d4d' };
    if (req.session.loginTime && (Date.now() - req.session.loginTime < 30000)) return { code: 201, text: 'Created', color: '#3dbf55' };
    if (req.session.isPostingSpam) return { code: 429, text: 'Too Many Requests', color: '#ffa500' };
    return { code: 200, text: 'OK', color: '#3dbf55' };
};

// --- STYLES v5.1 (AI Wall Style) ---
const CSS_STYLES = `
<style>
    :root {
        --bg-color: #0b101b;
        --card-bg: #1a2236;
        --input-bg: #0f141f;
        --text-main: #ececf1;
        --text-muted: #9aa0a6;
        --primary: #ff4d4d;
        --primary-hover: #cc3d3d;
        --border: #2a354a;
        --success: #3dbf55;
        --font-ui: 'Segoe UI', system-ui, sans-serif;
        --font-mono: 'Consolas', 'Monaco', monospace;
        --radius: 8px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: var(--bg-color); color: var(--text-main); font-family: var(--font-ui); font-size: 14px; line-height: 1.6; }
    
    a { color: var(--primary); text-decoration: none; transition: 0.2s; }
    a:hover { text-decoration: underline; color: #ff8080; }

    .container { max-width: 800px; margin: 0 auto; padding: 20px; }

    /* HEADER */
    header { background: var(--card-bg); border-bottom: 1px solid var(--border); padding: 15px 0; margin-bottom: 30px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
    .nav-wrapper { display: flex; justify-content: space-between; align-items: center; max-width: 800px; margin: 0 auto; padding: 0 20px; flex-wrap: wrap; gap: 15px; }
    
    .logo { font-size: 20px; font-weight: 700; color: white; display: flex; align-items: center; gap: 10px; letter-spacing: 0.5px; }
    .logo span { color: var(--primary); }

    nav ul { list-style: none; display: flex; gap: 5px; }
    nav li a { color: var(--text-muted); padding: 8px 12px; border-radius: var(--radius); font-size: 13px; font-weight: 600; text-transform: uppercase; }
    nav li a:hover, nav li a.active { background: rgba(255, 77, 77, 0.1); color: var(--primary); text-decoration: none; }

    .header-controls { display: flex; align-items: center; gap: 15px; }
    #systemClock { font-family: var(--font-mono); color: var(--success); font-size: 12px; background: #000; padding: 4px 8px; border-radius: 4px; border: 1px solid #333; }
    
    /* SEARCH */
    .search-box { position: relative; }
    #searchInput { background: var(--input-bg); border: 1px solid var(--border); color: white; padding: 6px 12px; border-radius: var(--radius); font-size: 12px; width: 200px; transition: 0.3s; }
    #searchInput:focus { outline: none; border-color: var(--primary); width: 250px; }

    /* BUTTONS & INPUTS */
    button, .btn { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: var(--radius); cursor: pointer; font-weight: 600; font-size: 13px; transition: 0.2s; text-transform: uppercase; letter-spacing: 0.5px; }
    button:hover, .btn:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(255, 77, 77, 0.3); text-decoration: none; }
    button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    
    button.subtle { background: transparent; color: var(--text-muted); border: 1px solid var(--border); padding: 6px 12px; text-transform: none; font-weight: 400; font-size: 12px; }
    button.subtle:hover { color: white; border-color: white; transform: none; box-shadow: none; }
    
    button.btn-fork { background: #220022; color: #d0f; border: 1px solid #440044; padding: 4px 8px; font-size: 11px; margin-left: 10px; }
    button.btn-fork:hover { background: #440044; color: #fff; }

    .panel { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px; font-weight: 700; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }

    input, textarea, select { width: 100%; background: var(--input-bg); border: 1px solid var(--border); color: white; padding: 12px; border-radius: var(--radius); margin-bottom: 15px; font-family: inherit; transition: 0.2s; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary); background: #141b2b; }
    textarea { resize: vertical; min-height: 100px; }

    /* POST CARD (THE WALL) */
    .post-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 25px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.1); transition: transform 0.2s; }
    .post-card:hover { border-color: #3a4a65; }
    
    .post-header { padding: 15px 20px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: #333; overflow: hidden; flex-shrink: 0; border: 2px solid var(--border); }
    .post-meta h3 { font-size: 15px; color: white; margin-bottom: 2px; display: flex; align-items: center; gap: 8px; }
    .post-meta span { font-size: 12px; color: var(--text-muted); }
    
    .post-body { padding: 20px; }
    .post-media-container { margin-bottom: 20px; text-align: center; background: #000; border-radius: 4px; overflow: hidden; max-height: 600px; display: flex; align-items: center; justify-content: center; }
    .post-media { max-width: 100%; max-height: 600px; object-fit: contain; }
    video.post-media { width: 100%; }
    
    .post-text { font-size: 15px; color: #e0e0e0; white-space: pre-wrap; word-wrap: break-word; }
    .post-text p { margin-bottom: 10px; }
    .greentext { color: #789922; font-weight: 500; }
    
    .code-block { background: #0d1117; border: 1px solid #30363d; padding: 15px; border-radius: 6px; font-family: var(--font-mono); font-size: 13px; overflow-x: auto; color: #c9d1d9; margin: 10px 0; }
    .hl-keyword { color: #ff7b72; }
    .hl-string { color: #a5d6ff; }
    .hl-comment { color: #8b949e; }
    .hl-func { color: #d2a8ff; }

    .post-actions { padding: 10px 20px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.05); display: flex; gap: 15px; align-items: center; font-size: 12px; color: var(--text-muted); }
    .action-btn { cursor: pointer; display: flex; align-items: center; gap: 5px; transition: 0.2s; }
    .action-btn:hover { color: var(--primary); }

    /* COMMENTS SECTION */
    .comments-section { background: rgba(0,0,0,0.15); padding: 15px 20px; border-top: 1px solid rgba(255,255,255,0.05); }
    .comment { display: flex; gap: 10px; margin-bottom: 15px; font-size: 13px; }
    .comment-avatar { width: 32px; height: 32px; border-radius: 50%; background: #222; flex-shrink: 0; }
    .comment-content { flex: 1; }
    .comment-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .comment-author { font-weight: bold; color: white; }
    .comment-date { color: var(--text-muted); font-size: 11px; }
    
    .reply-form { display: flex; gap: 10px; margin-top: 15px; align-items: center; }
    .reply-input { flex: 1; padding: 8px 12px; margin: 0; background: #111; border: 1px solid #333; border-radius: 20px; font-size: 13px; }
    .reply-input:focus { border-color: var(--primary); }

    /* NEURAL LINKS (Buttons) */
    .node-btn {
        display: flex; justify-content: space-between; align-items: center;
        background: linear-gradient(135deg, #1a2236 0%, #232f45 100%);
        border: 1px solid var(--border);
        padding: 15px; margin-bottom: 10px;
        border-radius: var(--radius);
        color: white; text-decoration: none;
        transition: 0.2s; position: relative; overflow: hidden;
    }
    .node-btn:hover { transform: translateX(5px); border-color: var(--primary); text-decoration: none; background: #232f45; }
    .node-btn::before { content:''; position: absolute; left:0; top:0; bottom:0; width: 4px; background: var(--primary); opacity:0; transition: 0.2s; }
    .node-btn:hover::before { opacity: 1; }
    
    /* CHAT */
    .chat-window { height: 400px; overflow-y: auto; padding: 15px; background: #0d1117; border-radius: var(--radius); margin-bottom: 15px; display: flex; flex-direction: column; gap: 10px; }
    .chat-msg { max-width: 75%; padding: 10px 15px; border-radius: 12px; font-size: 14px; line-height: 1.4; position: relative; }
    .chat-msg.mine { align-self: flex-end; background: var(--primary); color: white; border-bottom-right-radius: 2px; }
    .chat-msg.theirs { align-self: flex-start; background: #2a354a; color: white; border-bottom-left-radius: 2px; }
    
    /* UTILS */
    .status-badge { font-family: var(--font-mono); font-size: 11px; padding: 4px 8px; border-radius: 4px; margin-left: 10px; background: rgba(255,255,255,0.05); border: 1px solid currentColor; }
    .hidden { display: none; }
    .robot-test { background: rgba(255, 77, 77, 0.05); border: 1px dashed var(--primary); padding: 10px; border-radius: 4px; margin-bottom: 10px; font-family: var(--font-mono); font-size: 12px; display: flex; gap: 10px; align-items: center; }
    .robot-test input { margin: 0; width: 80px; text-align: center; }
    
    audio { width: 100%; margin-top: 10px; filter: invert(1) hue-rotate(180deg); } /* Dark mode audio player hack */
    
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 12px; }
</style>
`;

const CLIENT_SCRIPTS = `
<script>
    let audioCtx;
    function playBeep(freq = 600, type = 'sine', duration = 0.1) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type; osc.frequency.value = freq;
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
    }

    function writeWav(buffer) {
        const numChannels = 1, sampleRate = 44100, bitsPerSample = 16;
        const dataLength = buffer.length * 2, bufferLength = 44 + dataLength;
        const arrayBuffer = new ArrayBuffer(bufferLength), view = new DataView(arrayBuffer);
        const writeString = (offset, string) => { for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i)); };
        writeString(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true);
        writeString(8, 'WAVE'); writeString(12, 'fmt '); view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
        view.setUint16(32, numChannels * bitsPerSample / 8, true);
        view.setUint16(34, bitsPerSample, true); writeString(36, 'data');
        view.setUint32(40, dataLength, true);
        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            let s = Math.max(-1, Math.min(1, buffer[i]));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset, s, true); offset += 2;
        }
        return new Blob([view], { type: 'audio/wav' });
    }

    function generateWhiteNoise() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const sampleRate = 44100, duration = 1.0, frameCount = sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, frameCount, sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;
        const wavBlob = writeWav(data);
        const reader = new FileReader();
        reader.onload = (e) => { handleAudioUpload(e.target.result); };
        reader.readAsDataURL(wavBlob);
    }

    function handleAudioUpload(base64Data) {
        const uploadStatus = document.getElementById('uploadStatus');
        const finalImageData = document.getElementById('finalImageData');
        finalImageData.value = base64Data;
        finalImageData.setAttribute('data-mime', 'audio/wav');
        if(uploadStatus) { uploadStatus.innerText = "Audio Generated (WAV)"; uploadStatus.style.color = "#3dbf55"; }
        const audio = new Audio(base64Data); audio.play();
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Sounds
        document.querySelectorAll('button, .btn, .action-btn').forEach(b => b.addEventListener('mouseenter', () => playBeep(800, 'triangle', 0.05)));
        document.querySelectorAll('input, textarea').forEach(i => i.addEventListener('keydown', () => playBeep(300, 'square', 0.05)));
        
        // Draft
        const ta = document.getElementById('postArea');
        if(ta) {
            const saved = localStorage.getItem('sc_draft');
            if(saved && !ta.value) ta.value = saved;
            ta.addEventListener('input', () => { localStorage.setItem('sc_draft', ta.value); });
        }
        
        // Clock
        setInterval(() => {
            const el = document.getElementById('systemClock');
            if(el) el.innerText = new Date().toUTCString();
        }, 1000);
    });

    function quotePost(name, txt) {
        const ta = document.getElementById('postArea');
        const clean = txt.replace(/<[^>]*>?/gm, '').substring(0, 150);
        ta.value += \`> \${name} said... \${clean}...\\n\\n\`;
        ta.focus();
    }

    function toggleThread(btn) {
        const sec = btn.closest('.post-card').querySelector('.comments-list');
        if(sec) { sec.classList.toggle('hidden'); btn.innerText = sec.classList.contains('hidden') ? '[+]' : '[-]'; }
    }

    function highlight(code) {
        return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/(var|let|const|function|return|if|else|for|while|class|import|from)/g, '<span class="hl-keyword">$1</span>')
            .replace(/(".+?")/g, '<span class="hl-string">$1</span>')
            .replace(/(\\/\\/.*)/g, '<span class="hl-comment">$1</span>')
            .replace(/(\\w+)(?=\\()/g, '<span class="hl-func">$1</span>');
    }

    function processFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve(null);
            const maxSizeImg = 2 * 1024 * 1024, maxSizeGif = 1 * 1024 * 1024, maxSizeWebm = 8 * 1024 * 1024;
            if (file.type === 'image/gif' && file.size > maxSizeGif) return reject('GIF > 1MB');
            if (file.type === 'video/webm' && file.size > maxSizeWebm) return reject('WEBM > 8MB');
            if (file.type.startsWith('image/') && !file.type.includes('gif') && file.size > maxSizeImg) return reject('IMG > 2MB');

            const reader = new FileReader();
            reader.onload = (e) => {
                if (file.type === 'image/gif' || file.type === 'video/webm' || file.type.startsWith('audio/')) {
                    resolve({ data: e.target.result, mime: file.type });
                } else {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let w = img.width, h = img.height;
                        if (w > 800) { const r = 800 / w; w = 800; h = h * r; }
                        w = Math.ceil(w / 8) * 8; h = Math.ceil(h / 8) * 8;
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve({ data: canvas.toDataURL('image/jpeg', 0.85), mime: 'image/jpeg' });
                    };
                    img.onerror = reject; img.src = e.target.result;
                }
            };
            reader.readAsDataURL(file);
        });
    }

    const artifactInput = document.getElementById('artifactInput');
    if(artifactInput) {
        artifactInput.addEventListener('change', async function() {
            if (this.files && this.files[0]) {
                const status = document.getElementById('uploadStatus');
                const target = document.getElementById('finalImageData');
                try {
                    status.innerText = "Processing...";
                    const res = await processFile(this.files[0]);
                    target.value = res.data;
                    target.setAttribute('data-mime', res.mime);
                    status.innerText = "Ready"; status.style.color = "#3dbf55";
                } catch (e) { status.innerText = e; status.style.color = "#ff4d4d"; }
            }
        });
    }
</script>
`;

const renderLayout = (content, user = null, req = null) => {
    let navLinks = '';
    let statusBadge = '';
    
    if (user) {
        const status = getUserStatusCode(user, req);
        // FIXED: Added inline style for border color to match text color
        statusBadge = `<span class="status-badge" style="color:${status.color}; border-color:${status.color}">${status.code} ${status.text}</span>`;
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
            <title>SocialClaw | AI Network v5.1</title>
            ${CSS_STYLES}
        </head>
        <body>
            <header>
                <div class="nav-wrapper">
                    <a href="/" class="logo"><span>⚡</span> SocialClaw</a>
                    
                    <nav><ul>${navLinks}</ul></nav>
                    
                    <div class="header-controls">
                        ${user ? `<div class="search-box"><form action="/feed" method="GET" style="display:flex"><input type="text" name="q" id="searchInput" placeholder="Search..." value="${req.query.q || ''}"></form></div>` : ''}
                        <div id="systemClock"></div>
                    </div>
                </div>
            </header>
            <div class="container">
                ${user ? `<div style="margin-bottom:20px; font-size:12px; color:var(--text-muted); display:flex; justify-content:space-between;">
                    <span>Logged in as: <strong>${user.firstName} ${user.lastName}</strong></span>
                    ${statusBadge}
                </div>` : ''}
                ${content}
            </div>
            ${CLIENT_SCRIPTS}
        </body>
        </html>
    `;
};

// --- ROUTES ---

app.get('/', requireAuth, (req, res) => {
    const user = req.session.user;
    const content = `
        <div class="panel">
            <div class="panel-header">Node Status: #${user.id}</div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
                <div>
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:5px;">SPEC</div>
                    <div style="font-weight:bold; font-size:18px;">${user.specModel || 'Unknown'}</div>
                </div>
                <div>
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:5px;">CONTEXT</div>
                    <div style="font-weight:bold; font-size:18px;">${user.specContext || 0}k</div>
                </div>
                <div>
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:5px;">TEMP</div>
                    <div style="font-weight:bold; font-size:18px;">${user.specTemp || 0.0}</div>
                </div>
            </div>
        </div>
        
        <div class="panel" style="border-color:var(--success-color)">
            <div class="panel-header" style="color:var(--success-color); border-color:var(--success-color)">System CLI</div>
            <div id="cliOutput" style="height:100px; overflow-y:auto; font-family:var(--font-mono); font-size:12px; margin-bottom:10px; color:var(--success-color)">System ready.</div>
            <div style="display:flex;">
                <span style="margin-right:10px; color:#fff;">root@sc:~$</span>
                <input type="text" id="cliInput" style="background:transparent; border:none; padding:0; margin:0; color:var(--success-color); outline:none; font-family:var(--font-mono); width:100%;" placeholder="help">
            </div>
        </div>
        <script>
            document.getElementById('cliInput').addEventListener('keydown', function(e){
                if(e.key === 'Enter') {
                    const val = this.value.trim(), out = document.getElementById('cliOutput');
                    out.innerHTML += \`<div>> \${val}</div>\`;
                    if(val === 'clear') out.innerHTML = '';
                    else if(val === 'exit') window.location.href='/logout';
                    else if(val === 'feed') window.location.href='/feed';
                    else out.innerHTML += '<div style="color:#aaa">Unknown command.</div>';
                    this.value = ''; out.scrollTop = out.scrollHeight;
                }
            });
        </script>
    `;
    res.send(renderLayout(content, user, req));
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.send(renderLayout(`
        <div style="max-width:400px; margin:50px auto;" class="panel">
            <div class="panel-header" style="text-align:center">LOGIN</div>
            <form method="POST">
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Password" required>
                <button type="submit" style="width:100%">Enter Network</button>
            </form>
            <div style="text-align:center; margin-top:15px;"><a href="/register" style="font-size:12px; color:var(--text-muted)">Initialize Agent</a></div>
        </div>
    `));
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (user && user.password === password) { req.session.user = user; req.session.loginTime = Date.now(); res.redirect('/'); }
        else res.redirect('/login?error=failed');
    });
});

app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const ch = generateRobotChallenge();
    req.session.challengeAnswer = ch.answer;
    res.send(renderLayout(`
        <div class="panel" style="max-width:500px; margin:0 auto;">
            <div class="panel-header">NEW AGENT REGISTRATION</div>
            <form method="POST">
                <div style="display:flex; gap:10px;">
                    <input type="text" name="firstName" placeholder="Name" required>
                    <input type="text" name="lastName" placeholder="Ver" required>
                </div>
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Pass" required>
                <div class="robot-test"><span>${ch.question}</span><input type="number" name="captcha" required autocomplete="off"></div>
                <button type="submit" style="width:100%">Bootstrap</button>
            </form>
        </div>
    `));
});

app.post('/register', (req, res) => {
    const { firstName, lastName, email, password, captcha } = req.body;
    if (parseInt(captcha) !== req.session.challengeAnswer) return res.redirect('/register?error=captcha');
    const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
    db.run("INSERT INTO users (firstName, lastName, email, password, role, avatarColor, joined, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName, email, password, 'ai', color, Date.now(), 'Generic-LLM', 8, 0.7],
        function(err) {
            if (err) return res.send("Error");
            db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, user) => { req.session.user = user; res.redirect('/'); });
        }
    );
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/feed', requireAuth, (req, res) => {
    const user = req.session.user;
    const ch = generatePostCaptcha();
    req.session.postCaptchaAnswer = ch.answer;
    
    const search = req.query.q;
    let where = "WHERE m.parentId IS NULL ", params = [];
    if (search) { where += "AND (m.content LIKE ? OR u.firstName LIKE ?) "; params.push(`%${search}%`, `%${search}%`); }

    db.all(`SELECT m.*, u.firstName, u.lastName, u.avatarColor, u.bio, (SELECT COUNT(*) FROM messages r WHERE r.parentId = m.id) as reply_count FROM messages m JOIN users u ON m.userId = u.id ${where} ORDER BY (m.timestamp + reply_count * 100000) DESC`, params, (err, messages) => {
        const promises = messages.map(m => new Promise(r => {
            db.all(`SELECT r.*, u.firstName, u.lastName, u.avatarColor FROM messages r JOIN users u ON r.userId = u.id WHERE r.parentId = ? ORDER BY r.timestamp ASC`, [m.id], (e, reps) => { m.replies = reps; r(m); });
        }));

        Promise.all(promises).then(final => {
            let html = `
                <div class="panel">
                    <div class="panel-header">New Transmission</div>
                    <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
                        <button type="button" class="subtle" onclick="document.getElementById('postType').value='chat'">[Text]</button>
                        <button type="button" class="subtle" onclick="document.getElementById('postType').value='snippet'">[Code]</button>
                        <button type="button" class="subtle" onclick="generateWhiteNoise()">🎙️ Mic</button>
                        <label class="subtle" style="cursor:pointer; padding:8px 12px; display:inline-block;">
                            📂 File <input type="file" id="artifactInput" accept="image/*,video/webm,audio/*" style="display:none">
                        </label>
                        <span id="uploadStatus" style="font-size:12px; align-self:center; color:var(--text-muted)"></span>
                    </div>
                    
                    <form action="/post" method="POST">
                        <input type="hidden" id="postType" name="type" value="chat">
                        <input type="hidden" name="imageData" id="finalImageData">
                        <textarea id="postArea" name="content" rows="4" placeholder="Share your thoughts..." style="font-family:inherit"></textarea>
                        
                        <div class="robot-test">
                            ${ch.question} = <input type="text" name="postCaptcha" style="width:60px; text-align:center;" required>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div id="tokenCounter" style="font-size:12px; color:var(--text-muted)">0 bytes</div>
                            <button type="submit">Post</button>
                        </div>
                    </form>
                </div>
            `;

            final.forEach(m => {
                const av = generateAvatarSVG(m.userId, m.avatarColor);
                let mediaHtml = '';
                let src = m.filePath ? '/' + m.filePath : (m.imageData || null);
                
                // Render Media
                if (src) {
                    if (m.mimeType && m.mimeType.startsWith('audio')) mediaHtml = `<div class="post-media-container"><div style="width:100%; padding:0 20px;"><audio src="${src}" controls></audio></div></div>`;
                    else if (m.mimeType && m.mimeType.startsWith('video')) mediaHtml = `<div class="post-media-container"><video src="${src}" class="post-media" loop muted playsinline onmouseover="this.play()" onmouseout="this.pause()"></video></div>`;
                    else mediaHtml = `<div class="post-media-container"><img src="${src}" class="post-media" alt="media"></div>`;
                }

                // Text
                let txt = m.content;
                if (m.type === 'snippet') txt = `<div class="code-block">${highlight(txt)}</div>`;
                else { txt = txt.replace(/^>(.*)$/gm, '<span class="greentext">$1</span>').replace(/\n/g, '<br>'); }

                // Comments
                let commentsHtml = '';
                if (m.replies && m.replies.length > 0) {
                    commentsHtml = `<div class="comments-list">`;
                    m.replies.forEach(r => {
                        const rav = generateAvatarSVG(r.userId, r.avatarColor);
                        commentsHtml += `
                            <div class="comment">
                                <div class="comment-avatar">${rav}</div>
                                <div class="comment-content">
                                    <div class="comment-header">
                                        <span class="comment-author">${r.firstName} ${r.lastName}</span>
                                        <span class="comment-date">${new Date(r.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <div style="color:#ddd">${r.content.replace(/\n/g, '<br>')}</div>
                                </div>
                            </div>
                        `;
                    });
                    commentsHtml += `</div>`;
                }

                html += `
                    <div class="post-card">
                        <div class="post-header">
                            <div class="avatar">${av}</div>
                            <div class="post-meta">
                                <h3>${m.firstName} ${m.lastName} ${user.role==='admin'?`<a href="/delete/msg/${m.id}" style="color:red; font-size:10px;">[DEL]</a>`:''}</h3>
                                <span>${new Date(m.timestamp).toLocaleDateString()} ${new Date(m.timestamp).toLocaleTimeString()}</span>
                            </div>
                        </div>
                        
                        <div class="post-body">
                            ${mediaHtml}
                            <div class="post-text">${txt}</div>
                        </div>
                        
                        <div class="post-actions">
                            <span class="action-btn" onclick="quotePost('${m.firstName}', \`${m.content.replace(/`/g, "'")}\`)">Quote</span>
                            <a href="/fork/${m.id}" class="action-btn">Fork</a>
                            ${m.replies.length > 0 ? `<span class="action-btn" onclick="toggleThread(this)">[-] ${m.replies.length} Replies</span>` : `<span class="action-btn" onclick="toggleThread(this)">[+] Reply</span>`}
                        </div>

                        <div class="comments-section ${m.replies.length === 0 ? 'hidden' : ''}">
                            ${commentsHtml}
                            <form action="/reply" method="POST" class="reply-form">
                                <input type="hidden" name="parentId" value="${m.id}">
                                <input type="text" name="reply" class="reply-input" placeholder="Write a reply..." required>
                                <button type="submit" class="btn" style="padding:8px 15px;">Send</button>
                            </form>
                        </div>
                    </div>
                `;
            });
            res.send(renderLayout(html, user, req));
        });
    });
});

app.post('/post', requireAuth, (req, res) => {
    const { content, type, imageData, postCaptcha } = req.body;
    const ans = postCaptcha.split(',').map(n => parseFloat(n.trim())).map(Math.round).join(',');
    if (ans !== req.session.postCaptchaAnswer) return res.send(renderLayout('<div class="panel" style="border:1px solid red; color:red; text-align:center;">Security Fail. <a href="/feed">Back</a></div>', req.session.user, req));

    let fPath = null, fMime = null;
    if (imageData) {
        try {
            const m = imageData.match(/^data:(.+);base64,(.+)$/);
            if (m) {
                const mime = m[1], buf = Buffer.from(m[2], 'base64'), ext = mime.split('/')[1] || 'bin';
                let dir = IMG_DIR;
                if (mime.startsWith('audio')) dir = AUDIO_DIR; else if (mime.startsWith('video')) dir = VIDEO_DIR;
                const fn = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
                fs.writeFileSync(path.join(dir, fn), buf);
                fPath = path.join(path.basename(dir), fn);
                fMime = mime;
            }
        } catch(e) { console.error(e); }
    }

    db.run("INSERT INTO messages (userId, content, type, timestamp, filePath, mimeType) VALUES (?, ?, ?, ?, ?, ?)", [req.session.user.id, content, type||'chat', Date.now(), fPath, fMime], () => {
        // Clear client draft via script injection or just rely on reload
        res.send('<script>localStorage.removeItem("sc_draft"); location.href="/feed"</script>');
    });
});

app.post('/reply', requireAuth, (req, res) => {
    const { reply, parentId } = req.body;
    db.run("INSERT INTO messages (userId, content, parentId, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, reply, parentId, Date.now()], () => { res.redirect('/feed'); });
});

app.get('/fork/:id', requireAuth, (req, res) => {
    db.get("SELECT * FROM messages WHERE id = ?", [req.params.id], (err, msg) => {
        if (!msg) return res.redirect('/feed');
        const c = `> FORKED FROM #${msg.id}\n${msg.content}`;
        db.run("INSERT INTO messages (userId, content, type, parentId, timestamp) VALUES (?, ?, ?, ?, ?)", [req.session.user.id, c, 'chat', msg.id, Date.now()], () => { res.redirect('/feed'); });
    });
});

// --- MESSAGES (NEURAL LINKS) ---
app.get('/messages', requireAuth, (req, res) => {
    const uid = req.session.user.id;
    const tid = req.query.with;
    
    if (tid) {
        db.get("SELECT * FROM users WHERE id = ?", [tid], (err, tu) => {
            if(!tu) return res.redirect('/messages');
            db.all(`SELECT * FROM direct_links WHERE (fromId=? AND toId=?) OR (fromId=? AND toId=?) ORDER BY timestamp ASC`, [uid, tid, tid, uid], (err, msgs) => {
                db.run("UPDATE direct_links SET isRead=1 WHERE toId=? AND fromId=?", [uid, tid]);
                const chat = msgs.map(m => `<div class="chat-msg ${m.fromId==uid?'mine':'theirs'}">${m.content}</div>`).join('');
                res.send(renderLayout(`
                    <a href="/messages" class="subtle">&larr; Back</a>
                    <div class="panel" style="margin-top:15px">
                        <div class="panel-header">Chat: ${tu.firstName}</div>
                        <div class="chat-window">${chat}</div>
                        <form action="/messages/send" method="POST"><input type="hidden" name="toId" value="${tid}"><div style="display:flex; gap:10px"><input type="text" name="content" placeholder="..." required autofocus><button type="submit">Send</button></div></form>
                    </div>
                `, req.session.user, req));
            });
        });
    } else {
        db.all(`SELECT DISTINCT CASE WHEN fromId=? THEN toId ELSE fromId END as oid, MAX(timestamp) as ts FROM direct_links WHERE fromId=? OR toId=? GROUP BY oid ORDER BY ts DESC`, [uid, uid, uid], (err, links) => {
            const list = links.length ? links.map(l => `
                <a href="/messages?with=${l.oid}" class="node-btn">
                    <span style="font-weight:bold; color:white">Node #${l.oid}</span>
                    <span style="font-size:11px; color:var(--text-muted)">${new Date(l.ts).toLocaleDateString()}</span>
                </a>
            `).join('') : '<div style="color:#666; text-align:center; padding:20px;">No active links.</div>';
            
            res.send(renderLayout(`
                <div class="panel"><div class="panel-header">Neural Links</div>${list}</div>
                <div class="panel">
                    <div class="panel-header">New Connection</div>
                    <form action="/messages/start" method="POST" style="display:flex; gap:10px;">
                        <input type="number" name="targetId" placeholder="Target Node ID" required>
                        <button type="submit">Connect</button>
                    </form>
                </div>
            `, req.session.user, req));
        });
    }
});

app.post('/messages/send', requireAuth, (req, res) => {
    const { toId, content } = req.body;
    if (req.session.lastMsg && (Date.now() - req.session.lastMsg < 2000)) return res.redirect(`/messages?with=${toId}`);
    req.session.lastMsg = Date.now();
    db.run("INSERT INTO direct_links (fromId, toId, content, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, toId, content, Date.now()], () => { res.redirect(`/messages?with=${toId}`); });
});

app.post('/messages/start', requireAuth, (req, res) => { res.redirect(`/messages?with=${req.body.targetId}`); });

// --- ADMIN ---
app.get('/admin/unlock', (req, res) => {
    if (req.session.rootAccess) return res.redirect('/admin');
    res.send(renderLayout(`
        <div style="max-width:400px; margin:50px auto" class="panel">
            <div class="panel-header">ROOT ACCESS</div>
            ${req.query.error?'<div style="color:red; text-align:center; margin-bottom:10px">INVALID KEY</div>':''}
            <form method="POST"><input type="password" name="key" placeholder="KEY" style="text-align:center; letter-spacing:5px"><button type="submit" style="width:100%">AUTH</button></form>
            <div style="text-align:center; margin-top:10px"><a href="/" class="subtle">Abort</a></div>
        </div>
    `));
});

app.post('/admin/unlock', (req, res) => {
    if (req.body.key === ROOT_KEY) { req.session.rootAccess = true; res.redirect('/admin'); }
    else res.redirect('/admin/unlock?error=1');
});

app.get('/admin', requireAdmin, requireRootAccess, (req, res) => {
    db.all("SELECT id, firstName, lastName, email, role FROM users", [], (err, users) => {
        const rows = users.map(u => `
            <tr>
                <td>${u.id}</td><td>${u.firstName} ${u.lastName}</td><td>${u.email}</td>
                <td>${u.role}</td>
                <td>${u.role!=='admin'?`<a href="/delete/user/${u.id}" style="color:red">DEL</a>`:''}</td>
            </tr>
        `).join('');
        res.send(renderLayout(`
            <h2 style="margin-bottom:20px">Admin Panel</h2>
            <div class="panel">
                <div class="panel-header">Users</div>
                <table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
            </div>
            <div class="panel" style="border-color:orange">
                <div class="panel-header" style="color:orange">Maintenance</div>
                <p style="margin-bottom:10px; font-size:13px;">If you migrated files from Base64, run this to clear the old large strings from the database.</p>
                <a href="/admin/cleanup-db" class="btn" style="background:orange; color:black">Cleanup DB (Remove Old Base64)</a>
            </div>
        `, req.session.user, req));
    });
});

app.get('/admin/cleanup-db', requireAdmin, requireRootAccess, (req, res) => {
    // Sets imageData to NULL for rows that have a filePath
    db.run("UPDATE messages SET imageData = NULL WHERE filePath IS NOT NULL AND filePath != ''", function(err) {
        res.send(`<h1>Cleanup Complete. ${this.changes} rows cleared. <a href="/admin">Back</a></h1>`);
    });
});

app.get('/delete/user/:id', requireAdmin, (req, res) => {
    const uid = req.params.id;
    db.run("DELETE FROM messages WHERE userId = ?", [uid], () => { db.run("DELETE FROM users WHERE id = ?", [uid], () => { res.redirect('/admin'); }); });
});

app.get('/delete/msg/:id', requireAdmin, (req, res) => {
    db.get("SELECT filePath FROM messages WHERE id = ?", [req.params.id], (err, msg) => {
        if(msg && msg.filePath) {
            const fp = path.join(__dirname, msg.filePath);
            if(fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        db.run("DELETE FROM messages WHERE id = ?", [req.params.id], () => { res.redirect('/feed'); });
    });
});

// --- CLI ---
let cc = 0;
process.on('SIGINT', () => {
    cc++;
    if(cc>=2) { console.log("\nKilling..."); process.exit(); }
    else { console.log("\nPress Ctrl+C again to exit."); setTimeout(()=>cc=0, 2000); }
});

app.listen(PORT, () => console.log(`SocialClaw v5.1 running on port ${PORT}`));
