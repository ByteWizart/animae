// Ponto de entrada da função serverless da Vercel.
// Passam por aqui: /api/*, o painel Admin (endereço secreto) e /supabase-schema.sql (veja "rewrites" no vercel.json).
// Os arquivos estáticos (páginas, JS, CSS, imagens) NÃO passam por aqui: saem direto da CDN, a partir de dist/ (npm run build).
const { handler } = require('../server.js');

module.exports = (req, res) => handler(req, res).catch(e => {
  console.error('Erro não tratado:', e);
  if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end('{"error":"Erro interno."}'); } else res.end();
});
