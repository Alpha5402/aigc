process.env.MODEL_SERVICE_BASE_URL = 'http://127.0.0.1:8000';
process.env.MODEL_SERVICE_SHARED_SECRET = 'my_super_secret_key_for_agricloud';

const { __callModelService } = require('./backend/lib/forecast-engine');

async function main() {
  const history = {
    dates: Array.from({length: 100}, (_, i) => `2026-04-${(i%30+1).toString().padStart(2,'0')}`),
    values: Array.from({length: 100}, () => Math.random() * 10 + 5),
    missingMask: Array.from({length: 100}, () => 0),
    forwardFilledValues: Array.from({length: 100}, () => Math.random() * 10 + 5),
  };

  console.log('Calling Model Service...');
  const res = await __callModelService({
    requestId: 'test_123_456_789_012',
    spuId: 'spu_test_id',
    history,
    horizonDays: 7,
    families: ['arima', 'dlinear', 'nbeats']
  });

  console.log(JSON.stringify(res, null, 2));
}

main().catch(console.error);
