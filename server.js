// Servidor estático mínimo, sem dependências. Uso: node server.js  ->  http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.normalize(path.join(dir, p));
  if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(process.env.PORT || 3000, () => console.log('Abra http://localhost:' + (process.env.PORT || 3000)));
