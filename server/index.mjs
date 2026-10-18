import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { openStore, failure } from './store.mjs';

export async function createSpaceServer({ database = ':memory:', publicDir = fileURLToPath(new URL('../dist', import.meta.url)) } = {}) {
  if (database !== ':memory:') await mkdir(dirname(resolve(database)), { recursive: true });
  const store = openStore(database);
  // Space ID -> (connection ID -> socket), just as in ListenDock.
  const clients = new Map();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const server = createServer((req, res) => handle(req, res).catch(error => {
    if (!error.status) console.error('Space request failed:', error.message);
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Could not save. Please try again.' });
    else res.destroy();
  }));

  async function handle(req, res) {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!path.startsWith('/api/')) return serveFile(req, res, path);
    res.setHeader('Cache-Control', 'no-store');
    if (!sameSite(req)) throw failure(403, 'Use this site to save.');
    if (path === '/api/spaces' && req.method === 'POST') return json(res, 201, store.createSpace());
    const spaceId = req.headers.authorization?.replace(/^Bearer /, '');
    if (!spaceId || !store.hasSpace(spaceId)) throw failure(404, 'Space not found. Check the link.');
    if (path === '/api/projects' && req.method === 'GET') return json(res, 200, { projects: store.list(spaceId) });
    const picture = path.match(/^\/api\/projects\/([-a-zA-Z0-9]{1,200})\/pictures(?:\/([a-f0-9]{64}))?$/);
    if (picture) {
      if (req.method === 'GET' && picture[2]) return json(res, 200, store.getPicture(spaceId, picture[1], picture[2]));
      if (req.method === 'POST' && !picture[2]) return json(res, 200, store.putPicture(spaceId, picture[1], (await readJson(req)).src));
      throw failure(405, 'Use GET or POST.');
    }
    const project = path.match(/^\/api\/projects\/([-a-zA-Z0-9]{1,200})$/);
    if (!project) throw failure(404, 'Not found.');
    if (req.method === 'GET') return json(res, 200, store.get(spaceId, project[1]));
    const body = await readJson(req);
    let result;
    if (req.method === 'PUT') result = store.save(spaceId, project[1], body);
    else if (req.method === 'DELETE') result = store.remove(spaceId, project[1], body.version);
    else throw failure(405, 'Use GET, PUT or DELETE.');
    sendToSpace(spaceId, 'project_changed', result);
    return json(res, 200, result);
  }

  async function serveFile(req, res, path) {
    if (!['GET','HEAD'].includes(req.method)) throw failure(405, 'Use GET.');
    const file = path.endsWith('/') ? path + 'index.html' : path;
    // Never serve the database, source, dependency files or dotfiles.
    if (!/^\/(?:index\.html|404\.html|robots\.txt|sitemap\.xml|llms\.txt|instructions\.txt|(?:guide|privacy-policy)\/index\.html|assets\/[a-zA-Z0-9._-]+|drafts\/dark-(?:player|library|chapter|add)-layout\/index\.html)$/.test(file)) throw failure(404, 'Not found.');
    let data;
    try { data = await readFile(join(publicDir, file)); }
    catch (error) { if (error.code === 'ENOENT') throw failure(404, 'Not found.');throw error; }
    res.setHeader('Content-Type', ({ '.html':'text/html; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.txt':'text/plain; charset=utf-8','.xml':'application/xml' })[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  function sendToSpace(spaceId, type, payload) {
    for (const ws of clients.get(spaceId)?.values() || []) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload }));
  }
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !sameSite(req)) return socket.destroy();
    sockets.handleUpgrade(req, socket, head, ws => sockets.emit('connection', ws));
  });
  sockets.on('connection', ws => {
    ws.clientId = randomUUID();
    ws.alive = true;
    const joinTimeout = setTimeout(() => { if (!ws.spaceId) ws.close(1008, 'Join a Space.'); }, 10000);
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => ws.terminate());
    ws.on('message', bytes => {
      try {
        const { type, payload } = JSON.parse(bytes);
        if (type !== 'join_space' || ws.spaceId || !store.hasSpace(payload?.spaceId)) return ws.close(1008, 'Space not found.');
        ws.spaceId = payload.spaceId;
        if (!clients.has(ws.spaceId)) clients.set(ws.spaceId, new Map());
        clients.get(ws.spaceId).set(ws.clientId, ws);
        clearTimeout(joinTimeout);
        ws.send(JSON.stringify({ type: 'connected', payload: { clientId: ws.clientId } }));
      } catch { ws.close(1008, 'Invalid message.'); }
    });
    ws.on('close', () => {
      clearTimeout(joinTimeout);
      const group = clients.get(ws.spaceId);
      group?.delete(ws.clientId);
      if (!group?.size) clients.delete(ws.spaceId);
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!ws.alive) ws.terminate();
      else { ws.alive = false;ws.ping(); }
    }
  }, 30000);
  heartbeat.unref();
  return { server, clients, store, async close() {
    clearInterval(heartbeat);
    for (const ws of sockets.clients) ws.terminate();
    await new Promise(resolve => sockets.close(resolve));
    await new Promise(resolve => server.close(resolve));
    store.close();
  } };
}

async function readJson(req) {
  let size = 0;const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 60_000_000) throw failure(413, 'This project is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw failure(400, 'Use JSON.'); }
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });res.end(JSON.stringify(body)); }
function sameSite(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; }
  catch { return false; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const app = await createSpaceServer({ database: join(process.env.DATA_DIR || 'data', 'spaces.sqlite'), publicDir: resolve(process.env.PUBLIC_DIR || '.') });
  app.server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log('UI Design Editor: http://localhost:' + app.server.address().port));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => app.close().then(() => process.exit()));
}
