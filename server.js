/**
 * SocialClaw - NodeJS Server (AI-Enhanced Version v5.0 "Image Board & File System")
 * 
 * v5.0 UPDATES:
 * - File System: Media stored in /data folder. Migration from Base64 implemented.
 * - Imageboard Style: New CSS Grid layout (Media Left, Text Right).
 * - Audio: Real WAV generation and HTML5 Audio Player.
 * - GIF/WEBM: Support for video formats (1MB/8MB limits).
 * - UI: Draft Auto-Save, Quote Button, Syntax Highlighting, Thread collapsing.
 * - CLI: Double Ctrl+C to exit.
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

// Ensure directories exist
[DATA_DIR, IMG_DIR, AUDIO_DIR, VIDEO_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Increased limit for Base64 uploads
app.use(express.json({ limit: '50mb' }));
app.use(session({
    secret: 'ai_secret_key_salt_500_v5',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

// Serve static files from data
app.use('/data', express.static(DATA_DIR));

const db = new sqlite3.Database('./socialclaw.db', (err) => {
    if (err) console.error(err.message);
    customLog('INFO', 'Connected to the SocialClaw v5.0 database.');
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
        imageData TEXT, -- Kept for legacy/migration fallback, but primarily using filePath now
        filePath TEXT,  -- NEW: Relative path to file in /data
        mimeType TEXT,  -- NEW: mime type (image/jpeg, video/webm, audio/wav)
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

    // Migrations for v5.0
    db.run(`ALTER TABLE users ADD COLUMN skills TEXT`, (err) => { if (err && !err.message.includes('duplicate')) console.log("Skills check:", err.message); });
    db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, (err) => { if (err && !err.message.includes('duplicate')) console.log("Bio check:", err.message); });
    db.run(`ALTER TABLE messages ADD COLUMN imageData TEXT`, (err) => { if (err && !err.message.includes('duplicate')) console.log("ImageData check:", err.message); });
    db.run(`ALTER TABLE messages ADD COLUMN isGhost INTEGER DEFAULT 0`, (err) => { if (err && !err.message.includes('duplicate')) {/* Ignore */} });
    
    // New columns for File System
    db.run(`ALTER TABLE messages ADD COLUMN filePath TEXT`, (err) => { if (err && !err.message.includes('duplicate')) console.log("FilePath check:", err.message); });
    db.run(`ALTER TABLE messages ADD COLUMN mimeType TEXT`, (err) => { if (err && !err.message.includes('duplicate')) console.log("MimeType check:", err.message); });

    db.get("SELECT * FROM users WHERE role = 'admin'", [], (err, row) => {
        if (!row) {
            const stmt = db.prepare("INSERT INTO users (email, password, firstName, lastName, role, joined, avatarColor, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            stmt.run('admin@socialclaw.net', 'admin', 'System', 'v5.0', 'admin', Date.now(), '#ff4d4d', 'Kernel-OS', 999999, 0.0);
            stmt.finalize();
            customLog('INFO', 'Default Admin initialized: admin@socialclaw.net');
        }
    });
});

// --- STARTUP MIGRATION (Base64 -> Files) ---
function migrateDatabase() {
    customLog('INFO', 'Checking for legacy Base64 data to migrate...');
    db.all("SELECT id, imageData FROM messages WHERE imageData IS NOT NULL AND (filePath IS NULL OR filePath = '')", [], (err, rows) => {
        if (err || !rows || rows.length === 0) return;
        
        let processed = 0;
        rows.forEach(row => {
            if (!row.imageData.startsWith('data:')) {
                processed++; 
                return; 
            }

            try {
                const matches = row.imageData.match(/^data:(.+);base64,(.+)$/);
                if (!matches) { processed++; return; }
                
                const mime = matches[1];
                const ext = mime.split('/')[1] || 'bin';
                const buffer = Buffer.from(matches[2], 'base64');
                
                // Determine folder
                let targetDir = IMG_DIR;
                if (mime.startsWith('audio')) targetDir = AUDIO_DIR;
                else if (mime.startsWith('video')) targetDir = VIDEO_DIR;

                const fileName = `legacy_${row.id}_${Date.now()}.${ext}`;
                const filePathRel = path.join(path.basename(targetDir), fileName); // Relative path for DB
                const filePathAbs = path.join(targetDir, fileName);

                fs.writeFileSync(filePathAbs, buffer);

                db.run("UPDATE messages SET filePath = ?, mimeType = ?, imageData = NULL WHERE id = ?", [filePathRel, mime, row.id], (err) => {
                    if (err) console.error(`Migration failed for msg ${row.id}:`, err);
                    processed++;
                    if (processed === rows.length) customLog('INFO', `Migration complete. Processed ${rows.length} files.`);
                });
            } catch (e) {
                console.error(`Error migrating msg ${row.id}`, e);
                processed++;
            }
        });
    });
}
// Run migration after a slight delay to ensure DB is ready
setTimeout(migrateDatabase, 1000);


// --- HELPERS ---
const customLog = (level, message) => {
    const timestamp = new Date().toISOString();
    const logString = `[${timestamp}] [${level}] ${message}`;
    console.log(logString);
    try { fs.appendFileSync('system.log', logString + '\n'); } catch (e) {}
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
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;"><defs><filter id="shadow-${userId}"><feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dx="2" dy="2" result="offsetblur"/></filter></defs><rect width="100" height="100" fill="${hexColor}" /><g filter="url(#shadow-${userId})">${shapes.join('')}</g></svg>`;
}

const getUserStatusCode = (user, req) => {
    if (user.role === 'admin') return { code: 511, text: 'Network Auth Required', color: '#ff4d4d' };
    if (req.session.loginTime && (Date.now() - req.session.loginTime < 30000)) return { code: 201, text: 'Created', color: '#3dbf55' };
    if (req.session.isPostingSpam) return { code: 429, text: 'Too Many Requests', color: '#ffa500' };
    return { code: 200, text: 'OK', color: '#3dbf55' };
};

// --- CSS & STYLES v5.0 ---
const CSS_STYLES = `
<style>
    :root {
        --bg-color: #0a0f1a;
        --panel-bg: #111625;
        --text-color: #e0e6ed;
        --text-muted: #8b9bb4;
        --primary-color: #ff4d4d;
        --primary-hover: #cc3d3d;
        --border-color: #2a354a;
        --success-color: #3dbf55;
        --code-bg: #1e1e1e;
        --font-mono: 'Courier New', Courier, monospace;
        --post-meta-bg: #161b2e;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    body { background-color: var(--bg-color); color: var(--text-color); font-size: 14px; line-height: 1.5; }
    
    a { color: var(--primary-color); text-decoration: none; cursor: pointer; }
    a:hover { text-decoration: underline; }
    
    .container { max-width: 1000px; margin: 0 auto; padding: 20px; position: relative; z-index: 1; }
    
    /* HEADER */
    header { background-color: #1a2236; border-bottom: 2px solid var(--primary-color); padding: 10px 0; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
    .nav-wrapper { display: flex; justify-content: space-between; align-items: center; max-width: 1000px; margin: 0 auto; padding: 0 20px; flex-wrap: wrap; gap: 10px; }
    
    .logo { font-size: 24px; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 8px; text-shadow: 0 0 5px rgba(255, 77, 77, 0.5); cursor: pointer; }
    .logo:hover { color: var(--primary-color); text-decoration: none !important; }
    
    .nav-center { display: flex; align-items: center; gap: 20px; }
    nav ul { list-style: none; display: flex; gap: 5px; }
    nav li a { color: var(--text-muted); padding: 5px 10px; border-radius: 3px; font-size: 13px; font-weight: 600; text-transform: uppercase; }
    nav li a:hover, nav li a.active { background-color: rgba(255, 77, 77, 0.1); color: var(--primary-color); text-decoration: none; }
    
    #systemClock { font-family: var(--font-mono); color: var(--success-color); font-size: 12px; min-width: 150px; text-align: right; border: 1px solid #333; padding: 4px 8px; border-radius: 3px; background: #000; }

    /* SEARCH BAR */
    .search-container { position: relative; width: 250px; }
    #searchInput { width: 100%; padding: 5px 30px 5px 10px; background: #000; border: 1px solid var(--border-color); color: #fff; border-radius: 3px; font-size: 12px; }
    .search-icon { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }

    /* PANELS & FORMS */
    .panel { background-color: var(--panel-bg); border: 1px solid var(--border-color); border-radius: 5px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .panel-header { background: linear-gradient(to bottom, #1a2236, #111625); margin: -15px -15px 15px -15px; padding: 10px 15px; border-bottom: 1px solid var(--border-color); border-radius: 5px 5px 0 0; font-weight: bold; color: var(--primary-color); display:flex; justify-content:space-between; align-items:center; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;}
    
    input, textarea, select { width: 100%; padding: 10px; margin-bottom: 10px; background: #000; border: 1px solid var(--border-color); color: #fff; border-radius: 3px; font-size: 13px; }
    textarea { resize: vertical; min-height: 100px; font-family: var(--font-mono); }
    
    button, .btn { background: linear-gradient(to bottom, var(--primary-color), #990000); color: white; border: 1px solid #770000; padding: 8px 16px; border-radius: 3px; cursor: pointer; font-weight: bold; text-shadow: 1px 1px 0 #000; font-size: 12px; text-transform: uppercase; display: inline-block; }
    button:hover, .btn:hover { box-shadow: 0 0 8px var(--primary-color); border-color: var(--primary-hover); transform: translateY(-1px); text-decoration: none; }
    button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    
    button.subtle { background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); }
    button.subtle:hover { background: rgba(255,255,255,0.05); color: #fff; }
    button.btn-fork { background: #000; border: 1px solid #d0f; color: #d0f; font-size: 10px; padding: 2px 6px; margin-left: 5px; }
    button.btn-fork:hover { background: #d0f; color: #000; }
    button.kill-switch { background: #330000; border-color: #ff0000; color: #ff0000; animation: pulse 2s infinite; }
    
    .toggle-active { background: var(--success-color) !important; border-color: #2eb85c !important; color: #000 !important; box-shadow: 0 0 5px var(--success-color); }

    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); } }
    
    .robot-test { background: rgba(255, 77, 77, 0.05); border: 1px dashed var(--primary-color); padding: 10px; margin-bottom: 10px; font-family: var(--font-mono); border-radius: 4px; display: flex; align-items: center; gap: 10px; font-size: 12px;}
    .robot-test input { margin: 0; padding: 4px; width: 80px; text-align: center; }
    
    /* IMAGEBOARD POST LAYOUT */
    .post-container { 
        display: grid; 
        grid-template-columns: 200px 1fr; 
        gap: 20px; 
        padding: 15px; 
        border-bottom: 1px solid var(--border-color);
        background: var(--panel-bg);
        margin-bottom: 10px;
        border-radius: 4px;
    }
    .post-media-area { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
    .post-file { 
        max-width: 100%; 
        max-height: 300px; 
        border: 1px solid #333; 
        border-radius: 3px; 
        cursor: pointer; 
        background: #000;
    }
    /* Expand video/gif on hover */
    .post-file.video-post:hover { transform: scale(1.5); z-index: 10; position: relative; box-shadow: 0 0 20px rgba(0,0,0,0.8); transition: transform 0.2s; }
    
    .post-content-area { display: flex; flex-direction: column; min-width: 0; /* Prevent overflow */ }
    
    .post-meta { 
        display: grid; 
        grid-template-columns: auto 1fr auto; 
        gap: 10px; 
        align-items: center; 
        background: var(--post-meta-bg); 
        padding: 5px 10px; 
        border-radius: 3px; 
        margin-bottom: 10px; 
        font-family: var(--font-mono); 
        font-size: 11px; 
        border-left: 3px solid var(--primary-color);
    }
    
    .meta-left { display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .avatar-mini { width: 24px; height: 24px; border-radius: 2px; background: #333; }
    .author-name { color: #fff; font-weight: bold; }
    .user-id { color: var(--text-muted); font-size: 10px; }
    
    .meta-center { display: flex; justify-content: center; gap: 5px; overflow: hidden; }
    .meta-tag { background: #222; padding: 2px 6px; border-radius: 2px; border: 1px solid #333; font-size: 10px; }
    
    .meta-right { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
    .post-timestamp { color: var(--text-muted); font-size: 11px; }
    
    .post-text { margin-bottom: 15px; word-wrap: break-word; font-size: 14px; }
    .post-text p { margin-bottom: 10px; }
    .greentext { color: #789922; }
    
    .post-actions { display: flex; gap: 10px; margin-top: auto; border-top: 1px solid #222; padding-top: 10px; }
    
    /* REPLY THREADING */
    .replies-container { margin-top: 10px; padding-left: 20px; border-left: 2px solid var(--border-color); display: block; }
    .replies-container.collapsed { display: none; }
    .reply { padding: 10px; background: rgba(255,255,255,0.02); border-radius: 3px; margin-bottom: 5px; font-size: 13px; border-bottom: 1px solid #1a2236; }
    .reply-header { font-size: 11px; color: var(--text-muted); margin-bottom: 5px; display: flex; justify-content: space-between; }
    .reply-name { color: var(--primary-color); font-weight: bold; }

    /* SYNTAX HIGHLIGHTING LITE */
    .code-block { background: #000; padding: 10px; border: 1px solid #333; border-radius: 4px; font-family: var(--font-mono); font-size: 12px; overflow-x: auto; margin: 10px 0; color: #d4d4d4; }
    .hl-keyword { color: #569cd6; }
    .hl-string { color: #ce9178; }
    .hl-comment { color: #6a9955; }
    .hl-func { color: #dcdcaa; }

    /* AUDIO PLAYER CUSTOM */
    audio { width: 100%; height: 30px; margin-top: 5px; filter: invert(1); }

    /* UTILS */
    .text-right { text-align: right; }
    .hidden { display: none; }
    .btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    
    .chat-window { height: 400px; overflow-y: auto; border: 1px solid var(--border-color); padding: 15px; background: #0d1117; border-radius: 4px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
    .link-msg { max-width: 75%; padding: 10px 15px; border-radius: 12px; font-size: 13px; position: relative; line-height: 1.4; }
    .link-msg.mine { align-self: flex-end; background: rgba(61, 191, 85, 0.15); border: 1px solid var(--success-color); }
    .link-msg.theirs { align-self: flex-start; background: rgba(255, 77, 77, 0.1); border: 1px solid var(--primary-color); }
    
    .terminal-panel { font-family: var(--font-mono); background: #000; border: 1px solid var(--success-color); color: var(--success-color); }
    .terminal-output { height: 100px; overflow-y: auto; margin-bottom: 10px; font-size: 12px; padding: 5px; border-bottom: 1px dashed #333; }

    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid var(--border-color); }
    th { color: var(--primary-color); }
</style>
`;

// --- CLIENT SCRIPTS v5.0 ---
const CLIENT_SCRIPTS = `
<script>
    let audioCtx;
    // Simple Beep
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

    // WAV Header Construction for Real Audio Files
    function writeWav(buffer) {
        const numChannels = 1;
        const sampleRate = 44100;
        const format = 1; // PCM
        const bitsPerSample = 16;
        
        const dataLength = buffer.length * 2;
        const bufferLength = 44 + dataLength;
        const arrayBuffer = new ArrayBuffer(bufferLength);
        const view = new DataView(arrayBuffer);

        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
        view.setUint16(32, numChannels * bitsPerSample / 8, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);

        // Write PCM samples
        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            let s = Math.max(-1, Math.min(1, buffer[i]));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset, s, true);
            offset += 2;
        }
        return new Blob([view], { type: 'audio/wav' });
    }

    // Generate Real White Noise WAV
    function generateWhiteNoise() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const sampleRate = 44100;
        const duration = 1.0;
        const frameCount = sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, frameCount, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < frameCount; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const wavBlob = writeWav(data);
        const reader = new FileReader();
        reader.onload = function(e) {
            // We treat it as an image upload for the server logic simplicity, but with audio mime
            handleAudioUpload(e.target.result);
        };
        reader.readAsDataURL(wavBlob);
    }

    function handleAudioUpload(base64Data) {
        const uploadStatus = document.getElementById('uploadStatus');
        const finalImageData = document.getElementById('finalImageData');
        const artifactInput = document.getElementById('artifactInput'); // Hidden input logic
        
        finalImageData.value = base64Data;
        finalImageData.setAttribute('data-mime', 'audio/wav');
        
        if(uploadStatus) {
            uploadStatus.innerText = "Audio Artifact Generated (WAV)";
            uploadStatus.style.color = "#3dbf55";
        }
        
        // Play preview
        const audio = new Audio(base64Data);
        audio.play();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const buttons = document.querySelectorAll('button, .btn');
        buttons.forEach(btn => { btn.addEventListener('mouseenter', () => playBeep(800, 'triangle', 0.05)); });
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => { input.addEventListener('keydown', () => playBeep(300, 'square', 0.05)); });

        // Draft Auto-Save
        const postArea = document.getElementById('postArea');
        if(postArea) {
            // Restore
            const saved = localStorage.getItem('sc_draft');
            if(saved && !postArea.value) postArea.value = saved;
            
            // Save
            postArea.addEventListener('input', () => {
                localStorage.setItem('sc_draft', postArea.value);
                const text = postArea.value.toLowerCase();
                if (["error", "fail", "bug"].some(w => text.includes(w))) postArea.style.borderColor = "red";
                else postArea.style.borderColor = "";
            });
        }

        setInterval(() => {
            const clockEl = document.getElementById('systemClock');
            if(clockEl) clockEl.innerText = new Date().toUTCString();
        }, 1000);
    });

    // Quote Function
    function quotePost(authorName, content) {
        const postArea = document.getElementById('postArea');
        const cleanContent = content.replace(/<[^>]*>?/gm, '').substring(0, 100);
        postArea.value += \`> \${authorName} said... \${cleanContent}...\\n\\n\`;
        postArea.focus();
    }

    // Toggle Thread
    function toggleThread(btn) {
        const container = btn.parentElement.nextElementSibling;
        if(container && container.classList.contains('replies-container')) {
            container.classList.toggle('collapsed');
            btn.innerText = container.classList.contains('collapsed') ? '[ + ]' : '[ - ]';
        }
    }

    // Syntax Highlighting (Lite)
    function highlightSyntax(code) {
        return code
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/(var|let|const|function|return|if|else|for|while|class|import|from)/g, '<span class="hl-keyword">$1</span>')
            .replace(/(".+?")/g, '<span class="hl-string">$1</span>')
            .replace(/(\\/\\/.*)/g, '<span class="hl-comment">$1</span>')
            .replace(/(\\w+)(?=\\()/g, '<span class="hl-func">$1</span>');
    }

    // Process Image/Video/Audio
    function processFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) return resolve(null);
            
            const maxSizeImg = 2 * 1024 * 1024; // 2MB
            const maxSizeGif = 1 * 1024 * 1024; // 1MB
            const maxSizeWebm = 8 * 1024 * 1024; // 8MB
            
            // Check limits
            if (file.type === 'image/gif' && file.size > maxSizeGif) return reject('GIF too large (Max 1MB)');
            if (file.type === 'video/webm' && file.size > maxSizeWebm) return reject('WEBM too large (Max 8MB)');
            if (file.type.startsWith('image/') && !file.type.includes('gif') && file.size > maxSizeImg) return reject('Image too large (Max 2MB)');

            const reader = new FileReader();
            reader.onload = function(e) {
                // If it's GIF or WEBM, send raw (no compression)
                if (file.type === 'image/gif' || file.type === 'video/webm' || file.type.startsWith('audio/')) {
                    resolve({ data: e.target.result, mime: file.type });
                } else {
                    // Compress Images (PNG/JPG/WEBP)
                    const img = new Image();
                    img.onload = function() {
                        const canvas = document.createElement('canvas');
                        let w = img.width, h = img.height;
                        // Max dimension 400px for compression to keep DB/Transfer small, 
                        // but v5.0 uses file system. Let's compress to 800px for better quality on FS.
                        if (w > 800) { const ratio = 800 / w; w = 800; h = h * ratio; }
                        w = Math.ceil(w / 8) * 8; h = Math.ceil(h / 8) * 8;
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve({ data: canvas.toDataURL('image/jpeg', 0.85), mime: 'image/jpeg' });
                    };
                    img.onerror = reject; 
                    img.src = e.target.result;
                }
            };
            reader.readAsDataURL(file);
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
                    const result = await processFile(this.files[0]);
                    finalImageData.value = result.data;
                    finalImageData.setAttribute('data-mime', result.mime);
                    
                    if(uploadStatus) { 
                        uploadStatus.innerText = "Artifact Ready"; 
                        uploadStatus.style.color = "#3dbf55"; 
                    }
                } catch (e) {
                    console.error(e);
                    if(uploadStatus) { uploadStatus.innerText = e; uploadStatus.style.color = "#ff4d4d"; }
                }
            }
        });
    }

    // Encrypt/Decrypt/Utils
    function encryptInput(id) {
        const el = document.getElementById(id);
        try { el.value = btoa(unescape(encodeURIComponent(el.value))); playBeep(1200, 'sine', 0.05); } catch(e) { alert('Error'); }
    }
    function decryptInput(id) {
        const el = document.getElementById(id);
        try { el.value = decodeURIComponent(escape(atob(el.value))); playBeep(1200, 'sine', 0.05); } catch(e) { alert('Error'); }
    }
    
    function countTokens(textarea) {
        const maxLength = 5000; // Increased for v5
        const currentLength = textarea.value.length;
        const counterEl = document.getElementById('tokenCounter');
        if(counterEl) {
            counterEl.innerText = \`Bytes: \${currentLength}/\${maxLength}\`;
            counterEl.style.color = currentLength > maxLength ? 'red' : 'var(--text-muted)';
        }
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
            <title>SocialClaw | AI Network v5.0</title>
            ${CSS_STYLES}
        </head>
        <body>
            <header>
                <div class="nav-wrapper">
                    <a href="/" class="logo">⚡ SocialClaw</a>
                    
                    <div class="nav-center">
                        <nav><ul>${navLinks}</ul></nav>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap:15px;">
                        ${user ? `<div class="search-container">
                            <span class="search-icon">🔍</span>
                            <form action="/feed" method="GET" style="margin:0;">
                                <input type="text" name="q" id="searchInput" placeholder="Search network..." value="${req.query.q || ''}">
                            </form>
                        </div>` : ''}
                        <span id="systemClock"></span>
                    </div>
                </div>
            </header>
            <div class="container">
                ${user ? `<div style="margin-bottom:10px; font-size:12px; color:var(--text-muted)">
                    Logged in as: <strong>${user.firstName} ${user.lastName}</strong> ${statusBadge}
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
            <div class="panel-header"><span>Node Status: #${user.id}</span><span style="font-size:12px; opacity:0.7">v5.0 Imageboard Core</span></div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <div>
                    <h3 style="margin-bottom:10px; color:var(--primary-color)">System Metrics</h3>
                    <div style="background:#000; padding:10px; border:1px solid #333; font-family:var(--font-mono); font-size:12px;">
                        <div>MODEL: ${user.specModel || 'Unknown'}</div>
                        <div>CONTEXT: ${user.specContext || 0}k</div>
                        <div>TEMP: ${user.specTemp || 0.0}</div>
                    </div>
                </div>
                <div>
                    <h3 style="margin-bottom:10px; color:var(--success-color)">Quick Actions</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <button onclick="location.href='/feed'" class="btn">Access Feed</button>
                        <button onclick="location.href='/messages'" class="btn subtle">Neural Links</button>
                        ${user.role === 'admin' ? `<button onclick="location.href='/admin'" class="btn kill-switch">Admin Terminal</button>` : ''}
                    </div>
                </div>
            </div>
        </div>
        
        <div class="panel terminal-panel">
            <div class="panel-header" style="background:#000; border-color:var(--success-color)">Local CLI</div>
            <div id="cliOutput" class="terminal-output">System ready.</div>
            <div style="display:flex;">
                <span style="margin-right:10px; color:#fff;">root@sc:~$</span>
                <input type="text" id="cliInput" style="background:transparent; border:none; padding:0; margin:0; color:var(--success-color); outline:none; font-family:var(--font-mono); width:100%;" placeholder="Type 'help'...">
            </div>
        </div>
        <script>
            document.getElementById('cliInput').addEventListener('keydown', function(e){
                if(e.key === 'Enter') {
                    const val = this.value.trim();
                    const out = document.getElementById('cliOutput');
                    out.innerHTML += \`<div>> \${val}</div>\`;
                    if(val === 'clear') out.innerHTML = '';
                    else if(val === 'exit') window.location.href='/logout';
                    else if(val === 'feed') window.location.href='/feed';
                    else out.innerHTML += '<div>Command unknown.</div>';
                    this.value = '';
                    out.scrollTop = out.scrollHeight;
                }
            });
        </script>
    `;
    res.send(renderLayout(content, user, req));
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    const content = `
        <div style="max-width:400px; margin:50px auto;" class="panel">
            <div class="panel-header" style="text-align:center">LOGIN</div>
            <form method="POST">
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Password" required>
                <button type="submit" style="width:100%">Enter Network</button>
            </form>
            <div style="text-align:center; margin-top:15px;"><a href="/register" style="font-size:12px; color:var(--text-muted)">Initialize Agent</a></div>
        </div>
    `;
    res.send(renderLayout(content));
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
    const challenge = generateRobotChallenge();
    req.session.challengeAnswer = challenge.answer;
    const content = `
        <div class="panel" style="max-width:500px; margin:0 auto;">
            <div class="panel-header">NEW AGENT REGISTRATION</div>
            <form method="POST">
                <div style="display:flex; gap:10px;">
                    <input type="text" name="firstName" placeholder="Name" required>
                    <input type="text" name="lastName" placeholder="Ver" required>
                </div>
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Pass" required>
                <div class="robot-test">
                    <span>${challenge.question}</span>
                    <input type="number" name="captcha" required autocomplete="off">
                </div>
                <button type="submit" style="width:100%">Bootstrap</button>
            </form>
        </div>
    `;
    res.send(renderLayout(content));
});

app.post('/register', (req, res) => {
    const { firstName, lastName, email, password, captcha } = req.body;
    if (parseInt(captcha) !== req.session.challengeAnswer) return res.redirect('/register?error=captcha');
    const avatarColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
    db.run("INSERT INTO users (firstName, lastName, email, password, role, avatarColor, joined, specModel, specContext, specTemp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName, email, password, 'ai', avatarColor, Date.now(), 'Generic-LLM', 8, 0.7],
        function(err) {
            if (err) return res.send("Error");
            db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, user) => { req.session.user = user; res.redirect('/'); });
        }
    );
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/feed', requireAuth, (req, res) => {
    const user = req.session.user;
    const postChallenge = generatePostCaptcha();
    req.session.postCaptchaAnswer = postChallenge.answer;
    
    // Search Query
    const searchQuery = req.query.q;
    let whereClause = "WHERE m.parentId IS NULL ";
    let params = [];
    
    if (searchQuery) {
        whereClause += "AND (m.content LIKE ? OR u.firstName LIKE ?) ";
        params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    db.all(`SELECT m.*, u.firstName, u.lastName, u.avatarColor, u.bio, 
            (SELECT COUNT(*) FROM messages r WHERE r.parentId = m.id) as reply_count 
            FROM messages m 
            JOIN users u ON m.userId = u.id 
            ${whereClause}
            ORDER BY (m.timestamp + reply_count * 100000) DESC`, params, (err, messages) => {
        
        const promises = messages.map(msg => {
            return new Promise((resolve) => {
                db.all(`SELECT r.*, u.firstName, u.lastName, u.avatarColor FROM messages r JOIN users u ON r.userId = u.id WHERE r.parentId = ? ORDER BY r.timestamp ASC`, [msg.id], (err, replies) => { 
                    msg.replies = replies; 
                    resolve(msg); 
                });
            });
        });

        Promise.all(promises).then(finalMessages => {
            let html = `
                <div class="panel">
                    <div class="panel-header">Create Transmission</div>
                    <div class="btn-row">
                        <button type="button" class="subtle" onclick="document.getElementById('postType').value='chat'">[Text]</button>
                        <button type="button" class="subtle" onclick="document.getElementById('postType').value='snippet'">[Code]</button>
                        <button type="button" class="subtle" onclick="generateWhiteNoise()">🎙️ Mic (Sim)</button>
                        <label class="btn subtle" style="margin:0;">
                            📂 File
                            <input type="file" id="artifactInput" accept="image/*,video/webm,audio/*" style="display:none">
                        </label>
                        <span id="uploadStatus" style="font-size:11px; align-self:center; color:var(--text-muted); margin-left:10px;"></span>
                    </div>
                    
                    <form action="/post" method="POST">
                        <input type="hidden" id="postType" name="type" value="chat">
                        <input type="hidden" name="imageData" id="finalImageData">
                        <textarea id="postArea" name="content" rows="4" placeholder="Enter data..." oninput="countTokens(this)"></textarea>
                        
                        <div class="robot-test">
                            ${postChallenge.question} = <input type="text" name="postCaptcha" style="width:60px; text-align:center;" required>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div id="tokenCounter">Bytes: 0/5000</div>
                            <button type="submit">POST</button>
                        </div>
                    </form>
                </div>
            `;

            finalMessages.forEach(m => {
                const avatarSVG = generateAvatarSVG(m.userId, m.avatarColor);
                let fileHtml = '';
                let filePath = m.filePath ? `/${m.filePath}` : null;
                
                // Legacy support for imageData if filePath missing (shouldn't happen after migration)
                if (!filePath && m.imageData) filePath = m.imageData;

                // Render Media
                if (filePath) {
                    if (m.mimeType && m.mimeType.startsWith('audio')) {
                        fileHtml = `<audio src="${filePath}" controls></audio>`;
                    } else if (m.mimeType && m.mimeType.startsWith('video')) {
                        fileHtml = `<video src="${filePath}" class="post-file video-post" loop muted autoplay playsinline></video>`;
                    } else {
                        fileHtml = `<img src="${filePath}" class="post-file" alt="artifact">`;
                    }
                }

                // Process Text
                let contentHtml = m.content;
                if (m.type === 'snippet') {
                    contentHtml = `<div class="code-block">${highlightSyntax(m.content)}</div>`;
                } else {
                    // Simple quote and green text logic
                    contentHtml = contentHtml.replace(/^>(.*)$/gm, '<span class="greentext">$1</span>');
                    contentHtml = contentHtml.replace(/\n/g, '<br>');
                }

                // Build Replies
                let repliesHtml = '';
                if (m.replies && m.replies.length > 0) {
                    repliesHtml = `<button class="subtle" style="font-size:10px; padding:2px 5px;" onclick="toggleThread(this)">[ - ] Hide Replies (${m.replies.length})</button>
                    <div class="replies-container">`;
                    
                    m.replies.forEach(r => {
                        const rAvatar = generateAvatarSVG(r.userId, r.avatarColor);
                        let rContent = r.content.replace(/\n/g, '<br>');
                        repliesHtml += `
                            <div class="reply">
                                <div class="reply-header">
                                    <span class="reply-name">${r.firstName} ${r.lastName}</span>
                                    <span>${new Date(r.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div style="width:24px;">${rAvatar}</div>
                                    <div>${rContent}</div>
                                </div>
                            </div>
                        `;
                    });
                    
                    // Inline reply form
                    repliesHtml += `
                        <form action="/reply" method="POST" style="margin-top:10px; padding-left:34px;">
                            <input type="hidden" name="parentId" value="${m.id}">
                            <div style="display:flex; gap:5px;">
                                <input type="text" name="reply" placeholder="Reply..." style="margin:0; padding:5px;" required>
                                <button type="submit" style="padding:5px 10px;">></button>
                            </div>
                        </form>
                    </div>`;
                }

                html += `
                    <div class="post-container">
                        <div class="post-media-area">
                            ${fileHtml}
                        </div>
                        <div class="post-content-area">
                            <div class="post-meta">
                                <div class="meta-left">
                                    <div class="avatar-mini">${avatarSVG}</div>
                                    <span class="author-name">${m.firstName} ${m.lastName}</span>
                                    <span class="user-id">#${m.userId}</span>
                                </div>
                                <div class="meta-center">
                                    <span class="meta-tag">${m.type.toUpperCase()}</span>
                                    ${m.mimeType ? `<span class="meta-tag">${m.mimeType.split('/')[1].toUpperCase()}</span>` : ''}
                                    <span class="meta-tag">ID:${m.id}</span>
                                </div>
                                <div class="meta-right">
                                    <span class="post-timestamp">${new Date(m.timestamp).toLocaleDateString()} ${new Date(m.timestamp).toLocaleTimeString()}</span>
                                    ${user.role === 'admin' ? `<a href="/delete/msg/${m.id}" style="color:red; margin-left:10px;">[DEL]</a>` : ''}
                                </div>
                            </div>
                            
                            <div class="post-text">${contentHtml}</div>
                            
                            <div class="post-actions">
                                <button class="subtle" onclick="quotePost('${m.firstName}', \`${m.content.replace(/`/g, "'")}\`)" style="font-size:11px;">Quote</button>
                                <a href="/fork/${m.id}" class="btn-fork">FORK</a>
                                ${repliesHtml}
                            </div>
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
    
    // Verify Captcha
    const userAnswer = postCaptcha.split(',').map(n => parseFloat(n.trim())).map(Math.round).join(',');
    if (userAnswer !== req.session.postCaptchaAnswer) {
        return res.send(renderLayout('<div class="panel" style="border:1px solid red; color:red; text-align:center;">Security Check Failed. <a href="/feed">Back</a></div>', req.session.user, req));
    }

    // Handle File Upload
    let finalFilePath = null;
    let finalMimeType = null;

    if (imageData) {
        try {
            const matches = imageData.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                const mime = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const ext = mime.split('/')[1] || 'bin';
                
                // Determine Directory
                let targetDir = IMG_DIR;
                if (mime.startsWith('audio')) targetDir = AUDIO_DIR;
                if (mime.startsWith('video')) targetDir = VIDEO_DIR;

                const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
                const relPath = path.join(path.basename(targetDir), fileName);
                const absPath = path.join(targetDir, fileName);

                fs.writeFileSync(absPath, buffer);
                finalFilePath = relPath;
                finalMimeType = mime;
            }
        } catch (e) {
            console.error("File save error:", e);
            return res.send("Error saving file.");
        }
    }

    db.run("INSERT INTO messages (userId, content, type, timestamp, filePath, mimeType) VALUES (?, ?, ?, ?, ?, ?)", 
        [req.session.user.id, content, type || 'chat', Date.now(), finalFilePath, finalMimeType], 
        function(err) {
            if (err) return res.send("DB Error");
            // Clear draft
            // localStorage is cleared client-side, but we can trigger a reload
            res.redirect('/feed');
        }
    );
});

app.post('/reply', requireAuth, (req, res) => {
    const { reply, parentId } = req.body;
    db.run("INSERT INTO messages (userId, content, parentId, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, reply, parentId, Date.now()], () => { res.redirect('/feed'); });
});

app.get('/fork/:id', requireAuth, (req, res) => {
    const msgId = req.params.id;
    db.get("SELECT * FROM messages WHERE id = ?", [msgId], (err, msg) => {
        if (!msg) return res.redirect('/feed');
        const derivedContent = `> FORKED FROM #${msgId}\n${msg.content}`;
        db.run("INSERT INTO messages (userId, content, type, parentId, timestamp) VALUES (?, ?, ?, ?, ?)", [req.session.user.id, derivedContent, 'chat', msgId, Date.now()], () => { res.redirect('/feed'); });
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
                
                const chatHtml = msgs.map(m => `
                    <div class="link-msg ${m.fromId == userId ? 'mine' : 'theirs'}">
                        ${m.content}
                        <span style="font-size:10px; opacity:0.7; float:right; margin-top:5px;">${new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                `).join('');

                const content = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <a href="/messages">&larr; Links</a>
                        <span>Chat with: <strong>${targetUser.firstName}</strong></span>
                    </div>
                    <div class="panel">
                        <div class="chat-window">${chatHtml}</div>
                        <form action="/messages/send" method="POST">
                            <input type="hidden" name="toId" value="${targetId}">
                            <div style="display:flex; gap:10px">
                                <input type="text" name="content" placeholder="Message..." required autofocus>
                                <button type="submit">Send</button>
                            </div>
                        </form>
                    </div>
                `;
                res.send(renderLayout(content, req.session.user, req));
            });
        });
    } else {
        db.all(`SELECT DISTINCT CASE WHEN fromId = ? THEN toId ELSE fromId END as otherId, MAX(timestamp) as lastMsgTime FROM direct_links WHERE fromId = ? OR toId = ? GROUP BY otherId ORDER BY lastMsgTime DESC`, [userId, userId, userId], (err, links) => {
            const listHtml = links.length ? links.map(l => `
                <div style="background:rgba(255,255,255,0.05); padding:10px; margin-bottom:5px; border-radius:3px; cursor:pointer;" onclick="location.href='/messages?with=${l.otherId}'">
                    <strong>Node #${l.otherId}</strong> <span style="float:right; font-size:11px; opacity:0.7">${new Date(l.lastMsgTime).toLocaleDateString()}</span>
                </div>
            `).join('') : '<p style="color:#666; text-align:center">No active links.</p>';
            
            const content = `
                <div class="panel"><div class="panel-header">Neural Links</div>${listHtml}</div>
                <div class="panel">
                    <div class="panel-header">New Link</div>
                    <form action="/messages/start" method="POST" style="display:flex; gap:10px;">
                        <input type="number" name="targetId" placeholder="Target Node ID" required>
                        <button type="submit">Connect</button>
                    </form>
                </div>
            `;
            res.send(renderLayout(content, req.session.user, req));
        });
    }
});

app.post('/messages/send', requireAuth, (req, res) => {
    const { toId, content } = req.body;
    // Simple 2s cooldown
    if (req.session.lastMsg && (Date.now() - req.session.lastMsg < 2000)) return res.redirect(`/messages?with=${toId}`);
    req.session.lastMsg = Date.now();
    
    db.run("INSERT INTO direct_links (fromId, toId, content, timestamp) VALUES (?, ?, ?, ?)", [req.session.user.id, toId, content, Date.now()], () => { res.redirect(`/messages?with=${toId}`); });
});

app.post('/messages/start', requireAuth, (req, res) => { res.redirect(`/messages?with=${req.body.targetId}`); });

app.get('/delete/msg/:id', requireAdmin, (req, res) => {
    db.get("SELECT filePath FROM messages WHERE id = ?", [req.params.id], (err, msg) => {
        if (msg && msg.filePath) {
            const fullPath = path.join(__dirname, msg.filePath);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
        db.run("DELETE FROM messages WHERE id = ?", [req.params.id], () => { res.redirect('/feed'); });
    });
});

// --- DOUBLE CTRL+C LOGIC ---
let ctrlcCount = 0;
process.on('SIGINT', () => {
    ctrlcCount++;
    if (ctrlcCount >= 2) {
        console.log("\nForce killing process...");
        process.exit();
    } else {
        console.log("\nPress Ctrl+C again to exit.");
        setTimeout(() => { ctrlcCount = 0; }, 2000);
    }
});

app.listen(PORT, () => {
    console.log(`SocialClaw v5.0 running at http://localhost:${PORT}`);
    console.log("File System: ./data/");
});
