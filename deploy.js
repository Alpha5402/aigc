const Client = require('ssh2-sftp-client');
const { Client: SSHClient } = require('ssh2');
const path = require('path');
const fs = require('fs');

const config = {
  host: 'connect.nmb2.seetacloud.com',
  port: 34335,
  username: 'root',
  password: '5EAVh7knbz6m'
};

async function main() {
  const sftp = new Client();
  try {
    console.log('Connecting SFTP...');
    await sftp.connect(config);
    const remoteDir = '/root/agricloud-forecast';
    
    // Check if remote dir exists
    const exists = await sftp.exists(remoteDir);
    if (!exists) {
      await sftp.mkdir(remoteDir);
    }

    const localDir = path.join(__dirname, 'model-service');
    console.log(`Uploading ${localDir} to ${remoteDir}...`);
    await sftp.uploadDir(localDir, remoteDir);
    console.log('Upload successful!');
    
    // Create .env
    const envContent = `FORECAST_SHARED_SECRET=my_super_secret_key_for_agricloud\nHOST=0.0.0.0\nPORT=8000\nMODEL_ARTIFACT_DIR=/root/agricloud-forecast/data\n`;
    await sftp.put(Buffer.from(envContent), `${remoteDir}/.env`);
    console.log('.env created.');

  } catch (err) {
    console.error('SFTP Error:', err);
  } finally {
    sftp.end();
  }

  // SSH commands
  const conn = new SSHClient();
  conn.on('ready', () => {
    console.log('SSH Client ready. Installing dependencies and starting service...');
    const cmd = `
      cd /root/agricloud-forecast && 
      /root/miniconda3/bin/python -m pip install -e ".[dev]" pydantic-settings &&
      pkill -f uvicorn || true &&
      export PYTHONPATH=/root/agricloud-forecast/src &&
      nohup /root/miniconda3/bin/python -m uvicorn agricloud_forecast.main:app --host 0.0.0.0 --port 8000 > app.log 2>&1 &
      sleep 10 &&
      curl -s http://127.0.0.1:8000/health || echo "Health check failed"
      cat app.log
    `;
    conn.exec(cmd, (err, stream) => {
      if (err) throw err;
      stream.on('close', (code, signal) => {
        console.log('SSH Stream close :: code: ' + code);
        conn.end();
      }).on('data', (data) => {
        console.log('STDOUT: ' + data);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });
  }).connect(config);
}

main();
