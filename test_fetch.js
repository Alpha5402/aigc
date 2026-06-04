const https = require('https');
const { db } = require('./backend/lib/db');

const fetchPfsc = (product, days) => {
  return new Promise((resolve, reject) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    
    const sDate = start.toISOString().slice(0, 10);
    const eDate = end.toISOString().slice(0, 10);
    const url = `https://pfsc.agri.cn/jgsj/jgcx/jgcx.html?prodName=${encodeURIComponent(product)}&startDate=${sDate}&endDate=${eDate}`;
    
    console.log('Fetching:', url);
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
};

async function run() {
  const html = await fetchPfsc('苹果', 100);
  console.log('HTML length:', html.length);
  // Parse
  const regex = /<td[^>]*>([\d\-/]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
  let match;
  const records = [];
  while ((match = regex.exec(html)) !== null) {
    records.push({
      date: match[1].replace(/\//g, '-').trim(),
      product: match[2].trim(),
      market: match[3].trim(),
      price_avg: parseFloat(match[6])
    });
  }
  console.log('Found records:', records.length);
  if (records.length > 0) {
    console.log('Sample:', records[0]);
  }
}
run();
