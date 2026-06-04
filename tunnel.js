const { Client } = require('ssh2');
const net = require('net');

const config = {
  host: 'connect.nmb2.seetacloud.com',
  port: 34335,
  username: 'root',
  password: '5EAVh7knbz6m'
};

const LOCAL_PORT = 8000;
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Client ready. Starting local server...');
  const server = net.createServer((socket) => {
    socket.on('error', (err) => console.error('Socket error:', err));
    conn.forwardOut('127.0.0.1', socket.remotePort, '127.0.0.1', 8000, (err, stream) => {
      if (err) {
        socket.end();
        return;
      }
      stream.on('error', (err) => console.error('Stream error:', err));
      socket.pipe(stream);
      stream.pipe(socket);
    });
  });

  server.listen(LOCAL_PORT, () => {
    console.log(`SSH Tunnel listening on 127.0.0.1:${LOCAL_PORT}`);
  });
}).on('error', (err) => {
  console.error('SSH Error:', err);
}).connect(config);

// keep alive
setInterval(() => {}, 1000 * 60 * 60);
