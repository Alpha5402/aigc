const Client = require('ssh2-sftp-client');
const { Client: SSHClient } = require('ssh2');
const path = require('path');

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
    const remoteDir = '/root/agricloud-forecast/src/agricloud_forecast';
    
    // Upload files
    console.log('Uploading dlinear.py and nbeats.py and registry.py ...');
    await sftp.fastPut(path.join(__dirname, 'model-service/src/agricloud_forecast/adapters/dlinear.py'), `${remoteDir}/adapters/dlinear.py`);
    await sftp.fastPut(path.join(__dirname, 'model-service/src/agricloud_forecast/adapters/nbeats.py'), `${remoteDir}/adapters/nbeats.py`);
    await sftp.fastPut(path.join(__dirname, 'model-service/src/agricloud_forecast/registry.py'), `${remoteDir}/registry.py`);
    await sftp.fastPut(path.join(__dirname, 'model-service/src/agricloud_forecast/adapters/base.py'), `${remoteDir}/adapters/base.py`);
    await sftp.fastPut(path.join(__dirname, 'model-service/src/agricloud_forecast/routes/forecast.py'), `${remoteDir}/routes/forecast.py`);
    await sftp.fastPut(path.join(__dirname, 'model-service/src/agricloud_forecast/schemas.py'), `${remoteDir}/schemas.py`);
    console.log('Upload successful!');

  } catch (err) {
    console.error('SFTP Error:', err);
  } finally {
    sftp.end();
  }

  // SSH restart service
  const conn = new SSHClient();
  conn.on('ready', () => {
    console.log('SSH Client ready. Restarting remote Python service...');
    const cmd = `
      cd /root/agricloud-forecast && 
      pkill -f uvicorn || true &&
      sleep 2 &&
      export PYTHONPATH=/root/agricloud-forecast/src &&
      nohup /root/miniconda3/bin/python -m uvicorn agricloud_forecast.main:app --host 0.0.0.0 --port 8000 > app.log 2>&1 &
      sleep 5 &&
      curl -s http://127.0.0.1:8000/health || echo "Health check failed"
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
