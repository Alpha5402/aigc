require('../lib/env').loadEnv()
const { triggerForecastDailyAll } = require('../lib/scheduler')

console.log('Triggering forecast batch run...')
triggerForecastDailyAll()
  .then(result => {
    console.log('Forecast batch complete:', result)
    process.exit(0)
  })
  .catch(err => {
    console.error('Forecast batch failed:', err)
    process.exit(1)
  })