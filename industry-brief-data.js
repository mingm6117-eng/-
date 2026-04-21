const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const { generateText, resolveProviderConfig } = require('./llm-client');

const DATA_FILE = path.join(__dirname, 'data', 'industry-brief.json');
const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'IndustryBriefBot/1.0' } });
let refreshPromise = null;

function ensureDataFile() { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); }
function readBrief() { ensureDataFile(); return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeBrief(data) { ensureDataFile(); fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8'); }
function formatChinaDate(date = new Date()) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' }).format(date); }
function todayKey(date = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function googleNewsUrl(query) { return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`; }

async function safeParseURL(url) { try { return await parser.parseURL(url); } catch (err) { return { items: [], error: err.message }; } }
function normalizeItems(items = [], limit = 5, label = 'Source') { return items.slice(0, limit).map((item) => ({ title: item.title || '', url: item.link || '', publishedAt: item.isoDate || item.pubDate || null, source: item.creator || item.source?.title || label })); }
async function fetchGoogleNews(query, limit, label) { const feed = await safeParseURL(googleNewsUrl(query)); return normalizeItems(feed.items, limit, label); }
function buildSourceEntries(items = []) { return items.filter((item) => item.title && item.url).slice(0, 4).map((item) => ({ label: item.source || 'Source', title: item.title, url: item.url, publishedAt: item.publishedAt, site: item.source || 'Source' })); }

async function fetchCryptoPrices() {
  const fallback = readBrief().crypto.prices;
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  return Promise.all(symbols.map(async (symbol, index) => {
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      if (!res.ok) throw new Error(`Price fetch failed: ${symbol}`);
      const json = await res.json();
      const value = Number(json.price);
      return { label: symbol.replace('USDT', ''), value: `$${value >= 1000 ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value.toFixed(2)}` };
    } catch {
      return fallback[index] || { label: symbol.replace('USDT', ''), value: '$0.00' };
    }
  }));
}

async function collectCandidates() {
  const [aShare, hk, us, crypto, aiGlobal, aiChina, signals] = await Promise.all([
    fetchGoogleNews('A股 半导体 算力 AI 芯片', 5, 'Google News'),
    fetchGoogleNews('港股 AI 芯片 恒生科技 算力', 5, 'Google News'),
    fetchGoogleNews('US stocks AI chip geopolitics semiconductor', 5, 'Google News'),
    fetchGoogleNews('bitcoin ethereum ETF Binance crypto', 6, 'Google News'),
    fetchGoogleNews('Anthropic OpenAI Google Gemini Claude AI agents', 6, 'Google News'),
    fetchGoogleNews('DeepSeek 豆包 Kimi 大模型 AI agent', 6, 'Google News'),
    fetchGoogleNews('data center policy AI power grid humanoid robot standard', 6, 'Google News'),
  ]);
  return { prices: await fetchCryptoPrices(), feeds: { markets: { aShare, hk, us }, crypto, aiGlobal, aiChina, signals } };
}

function fallbackBrief(candidates) {
  const base = readBrief();
  const now = new Date();
  return {
    ...base,
    meta: { ...base.meta, date: formatChinaDate(now), generatedAt: now.toISOString(), lastSuccessfulRefreshAt: now.toISOString(), status: 'ready' },
    crypto: { ...base.crypto, prices: candidates.prices, sources: buildSourceEntries(candidates.feeds.crypto).length ? buildSourceEntries(candidates.feeds.crypto) : base.crypto.sources },
    markets: base.markets.map((card, index) => {
      const key = ['aShare', 'hk', 'us'][index];
      const sources = buildSourceEntries(candidates.feeds.markets[key]);
      return { ...card, sources: sources.length ? sources : card.sources };
    }),
    ai: [
      { ...base.ai[0], sources: buildSourceEntries(candidates.feeds.aiGlobal).length ? buildSourceEntries(candidates.feeds.aiGlobal) : base.ai[0].sources },
      { ...base.ai[1], sources: buildSourceEntries(candidates.feeds.aiChina).length ? buildSourceEntries(candidates.feeds.aiChina) : base.ai[1].sources },
    ],
    signals: { ...base.signals, sources: buildSourceEntries(candidates.feeds.signals).length ? buildSourceEntries(candidates.feeds.signals) : base.signals.sources },
  };
}

async function generateWithLlm(candidates) {
  const sample = readBrief();
  const prompt = `今天日期是 ${formatChinaDate()}。请基于候选新闻和价格生成中文行业简报 JSON。严格只返回 JSON，字段结构必须与样例一致：${JSON.stringify(sample)} 候选数据：${JSON.stringify(candidates)}`;
  return JSON.parse(await generateText(prompt, { maxTokens: 2600, temperature: 0.3, jsonMode: true }));
}

function isFreshForToday(brief) { return brief?.meta?.lastSuccessfulRefreshAt && todayKey(new Date(brief.meta.lastSuccessfulRefreshAt)) === todayKey(new Date()); }
async function buildIndustryBrief({ force = false } = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const current = readBrief();
    if (!force && isFreshForToday(current)) return current;
    const candidates = await collectCandidates();
    let generated;
    try { generated = await generateWithLlm(candidates); }
    catch (err) {
      generated = fallbackBrief(candidates);
      const provider = resolveProviderConfig().provider;
      const label = { anthropic: 'Anthropic', deepseek: 'DeepSeek', openai: 'OpenAI' }[provider] || provider;
      generated.meta.error = `${label} generation failed: ${err.message}`;
    }
    generated.meta.lastSuccessfulRefreshAt = new Date().toISOString();
    generated.meta.generatedAt = new Date().toISOString();
    generated.meta.status = 'ready';
    writeBrief(generated);
    return generated;
  })();
  try { return await refreshPromise; } finally { refreshPromise = null; }
}

function localOnly(req) { const remote = req.socket?.remoteAddress || ''; return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1' || remote.endsWith('127.0.0.1'); }
function scheduleDailyRefresh() {
  const targetHour = Number(process.env.DAILY_REFRESH_HOUR || 7);
  const targetMinute = Number(process.env.DAILY_REFRESH_MINUTE || 0);
  const scheduleNext = () => {
    const next = new Date(); next.setHours(targetHour, targetMinute, 0, 0); if (next <= new Date()) next.setDate(next.getDate() + 1);
    setTimeout(async () => { try { await buildIndustryBrief({ force: true }); console.log('[industry-brief] Daily brief refreshed'); } catch (err) { console.error('[industry-brief] Daily refresh failed:', err.message); } scheduleNext(); }, next.getTime() - Date.now());
  };
  scheduleNext();
}

module.exports = { DATA_FILE, readBrief, writeBrief, buildIndustryBrief, scheduleDailyRefresh, localOnly };
