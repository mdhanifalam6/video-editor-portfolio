/*
 * Md Hanif Alam — Portfolio server
 * Zero dependencies: needs only Node.js 18+.
 *
 *   node server.js            → http://localhost:3000        (website)
 *                               http://localhost:3000/admin  (admin panel)
 *
 * The public site lives in /docs and is plain HTML/CSS/JS. GitHub Pages serves
 * that folder. Run this server on your PC to use the admin panel, then press
 * "Publish to GitHub" (git commit + push) to put your changes online.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUB = path.join(ROOT, 'docs');
const ADMIN = path.join(ROOT, 'admin');
const PRIV = path.join(ROOT, 'private');
const DATA_FILE = path.join(PUB, 'data', 'portfolio.json');
const AUTH_FILE = path.join(PRIV, 'auth.json');
const MSG_FILE = path.join(PRIV, 'messages.json');
const BACKUP_DIR = path.join(PRIV, 'backups');
const MEDIA_DIRS = { work: path.join(PUB, 'media', 'works'), profile: path.join(PUB, 'media', 'profile') };

const MAX_UPLOAD = 1024 * 1024 * 1024; // 1 GB
const MAX_JSON = 2 * 1024 * 1024;      // 2 MB
const SESSION_HOURS = 12;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.m4v': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const UPLOAD_TYPES = {
  '.mp4': 'video', '.m4v': 'video', '.webm': 'video',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image'
};

for (const d of [PRIV, BACKUP_DIR, ...Object.values(MEDIA_DIRS)]) fs.mkdirSync(d, { recursive: true });

const HAS_FFMPEG = (() => {
  try { return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; }
})();

/* ---------------- helpers ---------------- */
const sessions = new Map(); // token -> expiry ms
const loginAttempts = new Map(); // ip -> {count, until}
const contactHits = new Map(); // ip -> [timestamps]

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  const payload = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(payload);
}

function readBody(req, limit = MAX_JSON) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const raw = await readBody(req);
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('Invalid JSON'); }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJsonAtomic(file, data) {
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  const t = parseCookies(req).hsid;
  if (!t || !sessions.has(t)) return false;
  if (sessions.get(t) < Date.now()) { sessions.delete(t); return false; }
  return true;
}
function clientIp(req) { return req.socket.remoteAddress || 'unknown'; }

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw, auth) {
  const h = crypto.scryptSync(pw, auth.salt, 64);
  const stored = Buffer.from(auth.hash, 'hex');
  return stored.length === h.length && crypto.timingSafeEqual(stored, h);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
}

/* Resolve a site-relative media path ("media/works/x.mp4") safely inside /public/media */
function mediaPathToAbs(rel) {
  if (typeof rel !== 'string' || !rel.startsWith('media/')) return null;
  const abs = path.normalize(path.join(PUB, rel));
  const mediaRoot = path.join(PUB, 'media') + path.sep;
  return abs.startsWith(mediaRoot) ? abs : null;
}

function collectMediaRefs(data) {
  const refs = new Set();
  const walk = v => {
    if (typeof v === 'string') { if (v.startsWith('media/')) refs.add(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(data);
  return refs;
}

async function checkMagic(file, kind, ext) {
  const fh = await fsp.open(file, 'r');
  const buf = Buffer.alloc(16);
  await fh.read(buf, 0, 16, 0); await fh.close();
  if (kind === 'video') {
    if (ext === '.webm') return buf.readUInt32BE(0) === 0x1A45DFA3;
    return buf.slice(4, 8).toString('latin1') === 'ftyp';
  }
  if (ext === '.png') return buf.readUInt32BE(0) === 0x89504E47;
  if (ext === '.webp') return buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  return buf[0] === 0xFF && buf[1] === 0xD8; // jpg
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => { err += d; });
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err || 'ffmpeg failed')));
    p.on('error', reject);
  });
}

/* ---------------- static files (with Range support for video) ---------------- */
async function serveStatic(req, res, baseDir, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.normalize(path.join(baseDir, rel));
  if (!abs.startsWith(baseDir)) return send(res, 403, 'Forbidden');
  let stat;
  try { stat = await fsp.stat(abs); } catch { return send(res, 404, 'Not found'); }
  if (stat.isDirectory()) return serveStatic(req, res, baseDir, rel.replace(/\/?$/, '/'));

  const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': abs.includes(path.sep + 'media' + path.sep) ? 'public, max-age=86400' : 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  };
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (m && !m[1] && m[2]) { start = Math.max(0, stat.size - parseInt(m[2], 10)); end = stat.size - 1; }
    if (start >= stat.size || end >= stat.size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).pipe(res);
}

/* ---------------- API ---------------- */
async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const authed = isAuthed(req);

  // Mutating admin calls must carry this header (blocks cross-site form posts).
  const adminHeaderOk = req.headers['x-requested-with'] === 'admin';
  const requireAdmin = () => {
    if (!authed) { send(res, 401, { error: 'Please log in again.' }); return false; }
    if (method !== 'GET' && !adminHeaderOk) { send(res, 403, { error: 'Bad request origin.' }); return false; }
    return true;
  };

  if (route === '/session' && method === 'GET') {
    const auth = await readJson(AUTH_FILE, null);
    return send(res, 200, { authed, needsSetup: !auth, ffmpeg: HAS_FFMPEG });
  }

  if (route === '/setup' && method === 'POST') {
    if (!adminHeaderOk) return send(res, 403, { error: 'Bad request origin.' });
    if (await readJson(AUTH_FILE, null)) return send(res, 409, { error: 'Password is already set.' });
    const { password } = await readJsonBody(req);
    if (typeof password !== 'string' || password.length < 8) return send(res, 400, { error: 'Password must be at least 8 characters.' });
    await writeJsonAtomic(AUTH_FILE, hashPassword(password));
    return startSession(res);
  }

  if (route === '/login' && method === 'POST') {
    if (!adminHeaderOk) return send(res, 403, { error: 'Bad request origin.' });
    const ip = clientIp(req);
    const att = loginAttempts.get(ip);
    if (att && att.until > Date.now() && att.count >= 5) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const auth = await readJson(AUTH_FILE, null);
    const { password } = await readJsonBody(req);
    if (!auth || typeof password !== 'string' || !checkPassword(password, auth)) {
      const cur = att && att.until > Date.now() ? att : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      cur.count++; loginAttempts.set(ip, cur);
      return send(res, 401, { error: 'Wrong password.' });
    }
    loginAttempts.delete(ip);
    return startSession(res);
  }

  if (route === '/logout' && method === 'POST') {
    const t = parseCookies(req).hsid; if (t) sessions.delete(t);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'hsid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  }

  if (route === '/password' && method === 'POST') {
    if (!requireAdmin()) return;
    const { current, next } = await readJsonBody(req);
    const auth = await readJson(AUTH_FILE, null);
    if (!auth || !checkPassword(String(current || ''), auth)) return send(res, 401, { error: 'Current password is wrong.' });
    if (typeof next !== 'string' || next.length < 8) return send(res, 400, { error: 'New password must be at least 8 characters.' });
    await writeJsonAtomic(AUTH_FILE, hashPassword(next));
    return send(res, 200, { ok: true });
  }

  /* ---- portfolio data ---- */
  if (route === '/data' && method === 'GET') {
    return send(res, 200, await readJson(DATA_FILE, {}));
  }
  if (route === '/data' && method === 'PUT') {
    if (!requireAdmin()) return;
    const next = await readJsonBody(req);
    if (!next || typeof next !== 'object' || !next.profile || !Array.isArray(next.works)) {
      return send(res, 400, { error: 'Data is missing profile or works.' });
    }
    const prev = await readJson(DATA_FILE, {});
    // keep a backup of the previous version (last 25)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.writeFile(path.join(BACKUP_DIR, `portfolio-${stamp}.json`), JSON.stringify(prev, null, 2));
    const backups = (await fsp.readdir(BACKUP_DIR)).filter(f => f.endsWith('.json')).sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - 25))) await fsp.unlink(path.join(BACKUP_DIR, old)).catch(() => {});

    next.updatedAt = new Date().toISOString();
    await writeJsonAtomic(DATA_FILE, next);

    // delete media files that were used before but are no longer referenced
    const before = collectMediaRefs(prev), after = collectMediaRefs(next);
    let removed = 0;
    for (const ref of before) {
      if (after.has(ref)) continue;
      const abs = mediaPathToAbs(ref);
      if (abs) { await fsp.unlink(abs).then(() => removed++).catch(() => {}); }
    }
    return send(res, 200, { ok: true, removedFiles: removed, updatedAt: next.updatedAt });
  }

  /* ---- uploads: raw body streamed straight to disk ---- */
  if (route === '/upload' && method === 'POST') {
    if (!requireAdmin()) return;
    const kind = url.searchParams.get('kind') === 'profile' ? 'profile' : 'work';
    const name = url.searchParams.get('name') || 'file';
    const ext = path.extname(name).toLowerCase();
    const type = UPLOAD_TYPES[ext];
    if (!type) return send(res, 400, { error: 'Only MP4, WEBM, JPG, PNG or WEBP files are allowed.' });
    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_UPLOAD) return send(res, 413, { error: 'File is larger than 1 GB.' });

    const fileName = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}-${slugify(name)}${ext}`;
    const abs = path.join(MEDIA_DIRS[kind], fileName);
    let size = 0, aborted = false;
    const out = fs.createWriteStream(abs);
    req.on('data', c => {
      size += c.length;
      if (size > MAX_UPLOAD && !aborted) { aborted = true; req.unpipe(out); out.destroy(); fsp.unlink(abs).catch(() => {}); send(res, 413, { error: 'File is larger than 1 GB.' }); }
    });
    req.pipe(out);
    out.on('finish', async () => {
      if (aborted) return;
      if (size === 0 || !(await checkMagic(abs, type, ext).catch(() => false))) {
        await fsp.unlink(abs).catch(() => {});
        return send(res, 400, { error: 'This file does not look like a valid ' + type + '.' });
      }
      send(res, 200, { path: `media/${kind === 'work' ? 'works' : 'profile'}/${fileName}`, type, size });
    });
    out.on('error', () => { if (!aborted) send(res, 500, { error: 'Could not save the file.' }); });
    return;
  }

  /* ---- ffmpeg: make hover preview + poster for an uploaded video ---- */
  if (route === '/optimize' && method === 'POST') {
    if (!requireAdmin()) return;
    if (!HAS_FFMPEG) return send(res, 200, { ok: false, reason: 'ffmpeg not installed' });
    const { path: rel, posterAt = 1 } = await readJsonBody(req);
    const abs = mediaPathToAbs(rel);
    if (!abs || !fs.existsSync(abs)) return send(res, 400, { error: 'Video not found.' });
    const base = abs.replace(/\.[a-z0-9]+$/i, '');
    const scale = "scale='if(gt(iw,ih),640,-2)':'if(gt(iw,ih),-2,640)'";
    const relOf = a => path.relative(PUB, a).split(path.sep).join('/');
    try {
      // Big or non-MP4 files → web-friendly MP4 (GitHub refuses files over 100 MB)
      let src = abs, video = null;
      const size = (await fsp.stat(abs)).size;
      if (size > 40 * 1024 * 1024 || !/\.mp4$/i.test(abs)) {
        const outAbs = base + '-web.mp4';
        await runFfmpeg(['-i', abs, '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outAbs]);
        const newSize = (await fsp.stat(outAbs)).size;
        if (newSize < size || !/\.mp4$/i.test(abs)) { await fsp.unlink(abs).catch(() => {}); src = outAbs; video = relOf(outAbs); }
        else await fsp.unlink(outAbs).catch(() => {});
      }
      await runFfmpeg(['-ss', '0', '-t', '8', '-i', src, '-vf', scale, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', base + '-preview.mp4']);
      let poster = null;
      if (url.searchParams.get('poster') !== '0') {
        await runFfmpeg(['-ss', String(Number(posterAt) || 1), '-i', src, '-frames:v', '1', '-vf', "scale='if(gt(iw,ih),960,-2)':'if(gt(iw,ih),-2,960)'", '-q:v', '4', base + '-poster.jpg']);
        poster = relOf(base + '-poster.jpg');
      }
      const preview = relOf(base + '-preview.mp4');
      return send(res, 200, { ok: true, preview, poster, video });
    } catch (e) {
      return send(res, 200, { ok: false, reason: e.message.slice(0, 200) });
    }
  }

  /* ---- remove an uploaded file that never got saved (e.g. cancelled add) ---- */
  if (route === '/media' && method === 'DELETE') {
    if (!requireAdmin()) return;
    const rel = url.searchParams.get('path');
    const abs = mediaPathToAbs(rel);
    if (!abs) return send(res, 400, { error: 'Bad path.' });
    const data = await readJson(DATA_FILE, {});
    if (collectMediaRefs(data).has(rel)) return send(res, 409, { error: 'File is still used on the site.' });
    await fsp.unlink(abs).catch(() => {});
    return send(res, 200, { ok: true });
  }

  /* ---- GitHub publishing (git commit + push of the project) ---- */
  if (route === '/publish/status' && method === 'GET') {
    if (!requireAdmin()) return;
    return send(res, 200, await publishStatus());
  }
  if (route === '/publish' && method === 'POST') {
    if (!requireAdmin()) return;
    const st = await publishStatus();
    if (!st.ready) return send(res, 400, { error: 'This folder is not connected to GitHub yet. See README → GitHub Pages.' });
    const big = await findBigFiles(path.join(PUB, 'media'), 95 * 1024 * 1024);
    if (big.length) return send(res, 400, { error: 'GitHub does not accept files over 100 MB. Remove or compress: ' + big.join(', ') });
    const log = [];
    const run = async args => { const r = await git(args); log.push('$ git ' + args.join(' ') + '\n' + (r.out + r.err).trim()); return r; };
    await run(['add', '-A']);
    const staged = await git(['diff', '--cached', '--quiet']);
    if (staged.code === 1) {
      const c = await run(['commit', '-m', 'Update portfolio — ' + new Date().toISOString().slice(0, 16).replace('T', ' ')]);
      if (c.code !== 0) return send(res, 500, { error: 'Commit failed.', log });
    }
    const p = await run(['push', 'origin', 'HEAD']);
    if (p.code !== 0) return send(res, 500, { error: 'Push to GitHub failed. Check your internet / GitHub login.', log });
    return send(res, 200, { ok: true, committed: staged.code === 1, pagesUrl: st.pagesUrl, log });
  }

  /* ---- contact form ---- */
  if (route === '/contact' && method === 'POST') {
    const ip = clientIp(req);
    const now = Date.now();
    const hits = (contactHits.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
    if (hits.length >= 5) return send(res, 429, { error: 'Too many messages. Please try again later.' });
    const body = await readJsonBody(req);
    if (body.website) return send(res, 200, { ok: true }); // honeypot
    const clean = (v, n) => String(v || '').trim().slice(0, n);
    const msg = {
      id: crypto.randomBytes(6).toString('hex'),
      name: clean(body.name, 100), email: clean(body.email, 150), type: clean(body.type, 60),
      message: clean(body.message, 4000), date: new Date().toISOString(), read: false
    };
    if (!msg.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email) || msg.message.length < 5) {
      return send(res, 400, { error: 'Please fill in your name, a valid email and a message.' });
    }
    hits.push(now); contactHits.set(ip, hits);
    const list = await readJson(MSG_FILE, []);
    list.unshift(msg);
    await writeJsonAtomic(MSG_FILE, list.slice(0, 1000));
    return send(res, 200, { ok: true });
  }
  if (route === '/messages' && method === 'GET') {
    if (!requireAdmin()) return;
    return send(res, 200, await readJson(MSG_FILE, []));
  }
  const msgMatch = /^\/messages\/([a-f0-9]+)$/.exec(route);
  if (msgMatch && (method === 'DELETE' || method === 'PATCH')) {
    if (!requireAdmin()) return;
    let list = await readJson(MSG_FILE, []);
    if (method === 'DELETE') list = list.filter(m => m.id !== msgMatch[1]);
    else list = list.map(m => m.id === msgMatch[1] ? { ...m, read: true } : m);
    await writeJsonAtomic(MSG_FILE, list);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Unknown API route.' });
}

function git(args) {
  return new Promise(resolve => {
    let out = '', err = '';
    let p;
    try { p = spawn('git', args, { cwd: ROOT }); } catch (e) { return resolve({ code: -1, out: '', err: e.message }); }
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => resolve({ code, out, err }));
    p.on('error', e => resolve({ code: -1, out: '', err: e.message }));
  });
}

async function publishStatus() {
  const top = await git(['rev-parse', '--show-toplevel']);
  const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  if (top.code !== 0 || !same(top.out.trim(), ROOT)) return { ready: false, reason: 'not-a-repo' };
  const remote = await git(['remote', 'get-url', 'origin']);
  if (remote.code !== 0) return { ready: false, reason: 'no-remote' };
  const url = remote.out.trim();
  const st = await git(['status', '--porcelain']);
  const changes = st.out.split('\n').filter(Boolean).length;
  let pagesUrl = '';
  const m = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/i.exec(url);
  if (m) {
    const owner = m[1].toLowerCase(), repo = m[2];
    pagesUrl = repo.toLowerCase() === owner + '.github.io' ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo}/`;
  }
  return { ready: true, remote: url.replace(/\/\/[^@/]+@/, '//'), pagesUrl, changes };
}

async function findBigFiles(dir, limit) {
  const out = [];
  for (const sub of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, sub.name);
    if (sub.isDirectory()) out.push(...await findBigFiles(p, limit));
    else if ((await fsp.stat(p)).size > limit) out.push(sub.name);
  }
  return out;
}

function startSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
  return send(res, 200, { ok: true }, {
    'Set-Cookie': `hsid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`
  });
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
    if (url.pathname === '/favicon.ico') { res.writeHead(301, { Location: '/assets/favicon.svg' }); return res.end(); }
    if (url.pathname.startsWith('/admin/')) return await serveStatic(req, res, ADMIN, url.pathname.slice('/admin'.length));
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, PUB, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Portfolio running:  http://localhost:${PORT}`);
  console.log(`  Admin panel:        http://localhost:${PORT}/admin`);
  console.log(`  ffmpeg for previews: ${HAS_FFMPEG ? 'found ✓' : 'not found (previews made in browser instead)'}\n`);
});
