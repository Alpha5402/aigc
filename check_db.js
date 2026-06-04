const { db } = require('./backend/lib/db');
const pHash = require('crypto').createHash('sha256').update('123456').digest('hex');
db.prepare("INSERT INTO users (phone, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run('18888888888', pHash, '演示用户', 'user');
