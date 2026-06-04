// backend/scripts/deploy-and-train.js
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const { execSync, spawn } = require('child_process');

const SSH_HOST = 'connect.nmb2.seetacloud.com';
const SSH_PORT = 34335;
const SSH_USER = 'root';
const SSH_PASS = '5EAVh7knbz6m';

const MODEL_SERVICE_DIR = path.join(__dirname, '../../model-service');
const ARCHIVE_PATH = path.join(__dirname, 'model-service.tar.gz');

async function createArchive() {
  console.log('📦 Creating archive of model-service...');
  try {
    if (fs.existsSync(ARCHIVE_PATH)) fs.unlinkSync(ARCHIVE_PATH);
    // Use built-in tar on Windows/Linux
    execSync(`tar -czf "${ARCHIVE_PATH}" model-service`, { cwd: path.join(__dirname, '../../') });
    console.log('✅ Archive created successfully.');
  } catch (e) {
    console.error('Failed to create archive using tar:', e.message);
    throw e;
  }
}

function runRemoteCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', (code, signal) => resolve({code, out}))
            .on('data', (data) => { out += data; console.log(`[GPU] ${data.toString().trim()}`); })
            .stderr.on('data', (data) => { out += data; console.error(`[GPU ERROR] ${data.toString().trim()}`); });
    });
  });
}

async function main() {
  await createArchive();
  
  const conn = new Client();
  console.log('🔌 Connecting to GPU server...');
  
  conn.on('ready', () => {
    console.log('✅ SSH Connection ready.');
    
    conn.sftp(async (err, sftp) => {
      if (err) throw err;
      
      console.log('⬆️ Uploading archive to GPU...');
      sftp.fastPut(ARCHIVE_PATH, '/root/model-service.tar.gz', async (err) => {
        if (err) throw err;
        console.log('✅ Upload complete.');
        
        try {
          console.log('⚙️ Setting up remote environment...');
          await runRemoteCommand(conn, 'mkdir -p /root/model-service && tar -xzf /root/model-service.tar.gz -C /root/model-service');
          
          console.log('📦 Installing dependencies (this may take a minute)...');
          await runRemoteCommand(conn, 'cd /root/model-service && pip install fastapi uvicorn pydantic numpy pandas python-dotenv torch -i https://pypi.tuna.tsinghua.edu.cn/simple');
          
          console.log('🛑 Stopping any existing server...');
          await runRemoteCommand(conn, 'pkill -f uvicorn || true');
          
          console.log('🚀 Starting FastAPI server on GPU...');
          await runRemoteCommand(conn, 'cd /root/model-service && export MODEL_SERVICE_SHARED_SECRET="agricloud-gpu-secret" && nohup uvicorn src.agricloud_forecast.main:app --host 127.0.0.1 --port 8000 > server.log 2>&1 &');
          
          // Wait a few seconds for server to start
          await new Promise(r => setTimeout(r, 5000));
          
          console.log('🚇 Setting up SSH tunnel (Local 8000 -> GPU 8000)...');
          const net = require('net');
          const server = net.createServer((sock) => {
            conn.forwardOut(sock.remoteAddress, sock.remotePort, '127.0.0.1', 8000, (err, stream) => {
              if (err) {
                console.error('Port forwarding error:', err);
                return sock.end();
              }
              sock.pipe(stream);
              stream.pipe(sock);
            });
          });
          
          server.listen(8000, '127.0.0.1', () => {
            console.log('✅ Tunnel active on http://127.0.0.1:8000');
            
            console.log('🔥 Triggering GPU training and model download...');
            const env = Object.assign({}, process.env, {
              MODEL_SERVICE_BASE_URL: 'http://127.0.0.1:8000',
              MODEL_SERVICE_SHARED_SECRET: 'agricloud-gpu-secret'
            });
            
            const downloader = spawn('node', [path.join(__dirname, 'download-models.js')], {
              env,
              stdio: 'inherit'
            });
            
            downloader.on('close', (code) => {
              console.log(`🎉 Process finished. Closing connection.`);
              server.close();
              conn.end();
              if (fs.existsSync(ARCHIVE_PATH)) fs.unlinkSync(ARCHIVE_PATH);
            });
          });
          
        } catch (e) {
          console.error('Deployment error:', e);
          conn.end();
          if (fs.existsSync(ARCHIVE_PATH)) fs.unlinkSync(ARCHIVE_PATH);
        }
      });
    });
  }).on('error', (err) => {
    console.error('SSH Connection Error:', err);
    if (fs.existsSync(ARCHIVE_PATH)) fs.unlinkSync(ARCHIVE_PATH);
  }).connect({
    host: SSH_HOST,
    port: SSH_PORT,
    username: SSH_USER,
    password: SSH_PASS,
    readyTimeout: 60000
  });
}

main().catch(console.error);
