// 사내 PC 로컬 실행용 서버 (Node.js 만 필요, npm install 불필요)
// 사설 IP 서버(NK개발 등)로 전송할 때 사용한다. 실행: node local-server.js 또는 로컬실행.bat
// - 이 PC 에서만 접속 가능 (127.0.0.1), 사설 IP 전송 허용
// - 접근 토큰은 실행할 때마다 새로 만들어 화면에 자동 입력한다
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './src/api.js';

const PORT = Number(process.env.PORT) || 8788;
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TOKEN = randomBytes(24).toString('hex');
const env = { ...process.env, ACCESS_TOKEN: TOKEN, ALLOW_PRIVATE_HOSTS: '1', LOCAL_RUN: '1' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function serveStatic(pathname, res) {
  const file = path.join(PUBLIC, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  let data;
  try { data = await readFile(file); } catch { res.writeHead(404).end('Not Found'); return; }
  if (file.endsWith('index.html')) {
    // 접근 토큰 자동 입력 (app.js 보다 먼저 실행)
    data = data.toString('utf8').replace('<head>', `<head><script>sessionStorage.setItem('sc-token','${TOKEN}')</script>`);
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (!url.pathname.startsWith('/api/')) return await serveStatic(url.pathname, res);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const r = await handleApi(request, env, url.pathname);
    res.writeHead(r.status, Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(500).end(String(e && e.message));
  }
}).listen(PORT, '127.0.0.1', () => {
  const addr = `http://127.0.0.1:${PORT}`;
  console.log(`ShopCloseService 로컬 실행 중: ${addr}`);
  console.log('종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.');
  if (process.platform === 'win32' && !process.env.NO_OPEN) exec(`start "" ${addr}`);
});
