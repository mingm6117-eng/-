const http = require('http');
const fs = require('fs');
const path = require('path');
const industryBriefData = require('./industry-brief-data');
const { generateText, resolveProviderConfig } = require('./llm-client');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIdx = trimmed.indexOf('=');
    if (equalIdx <= 0) continue;
    const key = trimmed.slice(0, equalIdx).trim();
    let value = trimmed.slice(equalIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 5500);
const DIST_ROOT = path.join(__dirname, 'dist');
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname === '/') pathname = '/index.html';
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(DIST_ROOT, safePath);
  const fallbackPath = path.join(DIST_ROOT, 'index.html');
  const targetPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : fallbackPath;
  if (!fs.existsSync(targetPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Run npm run build first, or use npm run openclaw for local development.');
    return;
  }
  const ext = path.extname(targetPath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(targetPath).pipe(res);
}

async function handleChat(req, res) {
  try {
    const { prompt } = await readJsonBody(req);
    if (!prompt || typeof prompt !== 'string') return sendJson(res, 400, { error: 'Missing prompt' });
    const text = await generateText(prompt, { maxTokens: 900, temperature: 0.4 });
    sendJson(res, 200, { text });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

async function handleIndustryBrief(req, res) {
  try { sendJson(res, 200, industryBriefData.readBrief()); } catch (err) { sendJson(res, 500, { error: err.message }); }
}

async function handleIndustryBriefRefresh(req, res) {
  if (!industryBriefData.localOnly(req)) return sendJson(res, 403, { error: 'Refresh is only allowed from localhost' });
  try { sendJson(res, 200, await industryBriefData.buildIndustryBrief({ force: true })); } catch (err) { sendJson(res, 500, { error: err.message }); }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/api/industry-brief')) return handleIndustryBrief(req, res);
  if (req.method === 'POST' && req.url === '/api/industry-brief/refresh') return handleIndustryBriefRefresh(req, res);
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  serveStatic(req, res);
});

server.listen(PORT, () => {
  const provider = resolveProviderConfig();
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`LLM provider: ${provider.provider}`);
  console.log(`Model: ${provider.model}`);
});

industryBriefData
  .buildIndustryBrief({ force: false })
  .then((brief) => {
    console.log(`[industry-brief] Ready: ${brief.meta.date} (${brief.meta.status})`);
  })
  .catch((err) => {
    console.error('[industry-brief] Startup refresh failed:', err.message);
  });

industryBriefData.scheduleDailyRefresh();
