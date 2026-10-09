const http = require('node:http');
const PORT = Number(process.env.PORT || 3100);
const HOST = '127.0.0.1';
const page = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111827"><title>GamesForChildren</title><style>body{margin:0;background:#0d101b;color:#f8fafc;font-family:system-ui,Arial;min-height:100vh;display:grid;place-items:center;text-align:center}main{padding:32px}h1{font-size:clamp(28px,6vw,54px);margin-bottom:8px}p{color:#94a3b8}small{color:#64748b}</style></head><body><main><h1>🎮 GamesForChildren</h1><p>Plataforma de jogos familiares em desenvolvimento</p><small>Infraestrutura online — jogos e login em preparação</small></main></body></html>`;
const server = http.createServer((req,res)=>{
  if(req.url === '/api/health'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:true,service:'games-for-children'}));
    return;
  }
  if(req.url !== '/' && req.url !== '/index.html'){
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Não encontrado');
    return;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  res.end(page);
});
server.listen(PORT,HOST,()=>console.log(`GamesForChildren em http://${HOST}:${PORT}`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
