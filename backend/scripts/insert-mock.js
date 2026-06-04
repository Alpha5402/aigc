const { db } = require('../lib/db');
const spu = 'spu_370600_apple_standard_cny_jin';
const stmt = db.prepare(`INSERT OR IGNORE INTO price_history (spu_id, source_name, source_url, observed_date, price, request_id, source_priority, collected_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`);
  for(let i=0; i<200; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dstr = date.toISOString().slice(0,10);
    stmt.run(spu, 'mock', 'http://mock', dstr, 5 + Math.random()*2, 'mock_req');
  }
console.log('Mock data inserted');