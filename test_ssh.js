const { Client: SSHClient } = require('ssh2');

const config = {
  host: 'connect.nmb2.seetacloud.com',
  port: 34335,
  username: 'root',
  password: '5EAVh7knbz6m'
};

const conn = new SSHClient();
conn.on('ready', () => {
  console.log('SSH Client ready.');
  const cmd = `
    tail -n 20 /root/agricloud-forecast/app.log
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('SSH Stream close :: code: ' + code);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT:\n' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR:\n' + data);
    });
  });
}).connect(config);
