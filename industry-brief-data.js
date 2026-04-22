const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const { generateText, resolveProviderConfig } = require('./llm-client');

const DATA_FILE = path.join(__dirname, 'data', 'industry-brief.json');
const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'IndustryBriefBot/1.0 (+local)',
  },
});

let refreshPromise = null;

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readBrief() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeBrief(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function formatChinaDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return formatter.format(date);
}

function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function safeParseURL(url) {
  try {
    return await parser.parseURL(url);
  } catch (err) {
    return { items: [], error: err.message };
  }
}

function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function normalizeItems(items = [], limit = 5, label = 'Source') {
  return items.slice(0, limit).map((item) => ({
    title: item.title || '',
    url: item.link || '',
    publishedAt: item.isoDate || item.pubDate || null,
    source: item.creator || item.source?.title || label,
  }));
}

async function fetchGoogleNews(query, limit, label) {
  const feed = await safeParseURL(googleNewsUrl(query));
  return normalizeItems(feed.items, limit, label);
}

async function fetchCryptoPrices() {
  const products = [
    { label: 'BTC', productId: 'BTC-USD' },
    { label: 'ETH', productId: 'ETH-USD' },
    { label: 'BNB', productId: 'BNB-USD' },
  ];
  const fallback = readBrief().crypto.prices;
  const results = await Promise.all(
    products.map(async (product, index) => {
      try {
        const res = await fetch(`https://api.exchange.coinbase.com/products/${product.productId}/ticker`, {
          headers: {
            'User-Agent': 'IndustryBriefSite/1.0',
          },
        });
        if (!res.ok) {
          throw new Error(`Coinbase price fetch failed for ${product.productId}: ${res.status}`);
        }
        const json = await res.json();
        const value = Number(json.price);
        if (!Number.isFinite(value)) {
          throw new Error(`Invalid Coinbase price for ${product.productId}`);
        }
        const formatted =
          value >= 1000
            ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
            : value.toFixed(2);
        return { label: product.label, value: `$${formatted}` };
      } catch {
        return fallback[index] || { label: product.label, value: '$0.00' };
      }
    }),
  );

  return results;
}

async function fetchEastmoneyAshareSnapshot() {
  const fallback = null;
  const url = [
    'https://push2.eastmoney.com/api/qt/ulist.np/get',
    '?fltt=2',
    '&secids=1.000001,0.399001,0.399006,1.000688',
    '&fields=f12,f14,f2,f3,f4,f6',
  ].join('');

  try {
    const res = await fetch(url, {
      headers: {
        Referer: 'https://quote.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 IndustryBriefSite/1.0',
      },
    });
    if (!res.ok) {
      throw new Error(`Eastmoney fetch failed: ${res.status}`);
    }

    const json = await res.json();
    const rows = Array.isArray(json?.data?.diff) ? json.data.diff : [];
    if (!rows.length) return fallback;

    const indexes = rows.map((row) => ({
      code: row.f12,
      name: row.f14,
      price: Number(row.f2),
      changePct: Number(row.f3),
      change: Number(row.f4),
      turnover: Number(row.f6),
    }));

    const turnover = indexes.reduce((sum, item) => sum + (Number.isFinite(item.turnover) ? item.turnover : 0), 0);
    return {
      indexes,
      turnoverText: turnover > 0 ? `${(turnover / 1e12).toFixed(2)} 万亿元` : 'Unknown',
      source: {
        label: '东方财富',
        title: '东方财富 A股主要指数实时行情',
        url: 'https://quote.eastmoney.com/center/gridlist.html#hs_a_board',
        publishedAt: new Date().toISOString(),
        site: '东方财富',
      },
    };
  } catch {
    return fallback;
  }
}

async function collectCandidates() {
  const [aShare, hk, us, crypto, anthropic, openai, google, deepseek, seed, moonshot, signals] =
    await Promise.all([
      fetchGoogleNews('A股 半导体 算力 AI 芯片', 5, 'Google News'),
      fetchGoogleNews('港股 AI 芯片 恒生科技 算力', 5, 'Google News'),
      fetchGoogleNews('US stocks AI chip geopolitics semiconductor', 5, 'Google News'),
      fetchGoogleNews('bitcoin ethereum ETF Binance crypto', 6, 'Google News'),
      fetchGoogleNews('Anthropic Claude site:anthropic.com/news', 4, 'Google News'),
      fetchGoogleNews('OpenAI site:openai.com/index agents codex', 4, 'Google News'),
      fetchGoogleNews('Google Gemini AI site:blog.google', 4, 'Google News'),
      fetchGoogleNews('DeepSeek site:deepseek.com OR site:api-docs.deepseek.com', 4, 'Google News'),
      fetchGoogleNews('豆包 Seed 字节 site:seed.bytedance.com', 4, 'Google News'),
      fetchGoogleNews('Kimi Moonshot site:moonshot.cn', 4, 'Google News'),
      fetchGoogleNews('data center policy AI power grid humanoid robot standard', 6, 'Google News'),
    ]);

  const prices = await fetchCryptoPrices();
  const eastmoneyAshare = await fetchEastmoneyAshareSnapshot();

  return {
    prices,
    eastmoneyAshare,
    feeds: {
      markets: { aShare, hk, us },
      crypto,
      ai: {
        anthropic,
        openai,
        google,
        deepseek,
        seed,
        moonshot,
      },
      signals,
    },
  };
}

function buildSourceEntries(items = []) {
  return items
    .filter((item) => item.title && item.url)
    .slice(0, 4)
    .map((item) => ({
      label: item.source || 'Source',
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      site: item.source || 'Source',
    }));
}

function formatEastmoneyIndexLine(index) {
  const price = Number.isFinite(index.price) ? index.price.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : 'Unknown';
  const changePct = Number.isFinite(index.changePct) ? `${index.changePct >= 0 ? '+' : ''}${index.changePct.toFixed(2)}%` : 'Unknown';
  return `${index.name} ${price}（${changePct}）`;
}

async function generateWithLlm(candidates) {
  const sample = readBrief();
  const prompt = `
今天日期是 ${formatChinaDate()}，请根据我提供的候选新闻和价格，生成一份中文行业简报 JSON。

要求：
1. 严格返回 JSON，不要 Markdown，不要解释。
2. 语气简洁、偏投资和行业研究风格。
3. 必须生成这些字段：meta, markets, crypto, ai, knowledge, signals。
4. markets 必须包含 3 张卡：A股、港股、美股。
5. ai 必须包含 2 张卡：海外模型、国内大模型。
6. 每张卡都要有 id, title, highlight/summary（二者可任选其一或同时有）, items(2-3条), sources(1-4条)。
7. crypto 还必须包含 prices 数组，直接使用我提供的价格。
8. sources 中每项必须包含：label, title, url, publishedAt, site。
9. 今日新知识必须是今天候选内容里能推导出的 AI 或投资新概念，不能凭空捏造。
10. 信息差必须偏政策信号、基础设施约束、冷门但重要新闻。
11. 如果某模块候选不足，可保守概括，但 sources 不能留空。

输出结构参考：
${JSON.stringify(sample, null, 2)}

候选数据：
${JSON.stringify(candidates, null, 2)}
`;
  const text = await generateText(prompt, {
    maxTokens: 2600,
    temperature: 0.3,
    jsonMode: true,
  });
  return JSON.parse(text);
}

function fallbackBrief(candidates) {
  const now = new Date();
  const date = formatChinaDate(now);
  const base = readBrief();
  const marketSources = {
    aShare: buildSourceEntries(candidates.feeds.markets.aShare),
    hk: buildSourceEntries(candidates.feeds.markets.hk),
    us: buildSourceEntries(candidates.feeds.markets.us),
  };
  const eastmoneyAshare = candidates.eastmoneyAshare;
  const eastmoneyItems = eastmoneyAshare?.indexes?.length
    ? [
        eastmoneyAshare.indexes.map(formatEastmoneyIndexLine).join('，') + '。',
        `A股主要指数合计成交额约 ${eastmoneyAshare.turnoverText}，用于跟踪科技链与风险偏好强弱。`,
        '半导体、算力、AI 应用仍作为国内市场的重点观察方向。',
      ]
    : null;
  const aiGlobalSources = buildSourceEntries([
    ...candidates.feeds.ai.anthropic,
    ...candidates.feeds.ai.openai,
    ...candidates.feeds.ai.google,
  ]);
  const aiChinaSources = buildSourceEntries([
    ...candidates.feeds.ai.deepseek,
    ...candidates.feeds.ai.seed,
    ...candidates.feeds.ai.moonshot,
  ]);

  return {
    ...base,
    meta: {
      ...base.meta,
      date,
      generatedAt: now.toISOString(),
      lastSuccessfulRefreshAt: now.toISOString(),
      status: 'ready',
    },
    crypto: {
      ...base.crypto,
      prices: candidates.prices,
      sources: buildSourceEntries(candidates.feeds.crypto).length
        ? buildSourceEntries(candidates.feeds.crypto)
        : base.crypto.sources,
    },
    markets: [
      {
        ...base.markets[0],
        highlight: eastmoneyAshare
          ? '东方财富指数快照已接入，A股行情可在无模型 key 时持续更新。'
          : base.markets[0].highlight,
        items: eastmoneyItems || base.markets[0].items,
        sources: eastmoneyAshare
          ? [eastmoneyAshare.source, ...marketSources.aShare].slice(0, 4)
          : marketSources.aShare.length ? marketSources.aShare : base.markets[0].sources,
      },
      {
        ...base.markets[1],
        sources: marketSources.hk.length ? marketSources.hk : base.markets[1].sources,
      },
      {
        ...base.markets[2],
        sources: marketSources.us.length ? marketSources.us : base.markets[2].sources,
      },
    ],
    ai: [
      {
        ...base.ai[0],
        sources: aiGlobalSources.length ? aiGlobalSources : base.ai[0].sources,
      },
      {
        ...base.ai[1],
        sources: aiChinaSources.length ? aiChinaSources : base.ai[1].sources,
      },
    ],
    knowledge: {
      ...base.knowledge,
      sources: marketSources.us.length ? marketSources.us : base.knowledge.sources,
    },
    signals: {
      ...base.signals,
      sources: buildSourceEntries(candidates.feeds.signals).length
        ? buildSourceEntries(candidates.feeds.signals)
        : base.signals.sources,
    },
  };
}

function normalizeBriefShape(data) {
  const current = readBrief();
  const now = new Date().toISOString();

  return {
    meta: {
      date: data?.meta?.date || formatChinaDate(),
      title: data?.meta?.title || current.meta.title,
      subtitle: data?.meta?.subtitle || current.meta.subtitle,
      generatedAt: data?.meta?.generatedAt || now,
      lastSuccessfulRefreshAt: data?.meta?.lastSuccessfulRefreshAt || now,
      status: data?.meta?.status || 'ready',
      error: data?.meta?.error || undefined,
    },
    markets: Array.isArray(data?.markets) && data.markets.length === 3 ? data.markets : current.markets,
    crypto: {
      ...current.crypto,
      ...(data?.crypto || {}),
      prices:
        Array.isArray(data?.crypto?.prices) && data.crypto.prices.length
          ? data.crypto.prices
          : current.crypto.prices,
      sources:
        Array.isArray(data?.crypto?.sources) && data.crypto.sources.length
          ? data.crypto.sources
          : current.crypto.sources,
    },
    ai: Array.isArray(data?.ai) && data.ai.length >= 2 ? data.ai : current.ai,
    knowledge: {
      ...current.knowledge,
      ...(data?.knowledge || {}),
      sources:
        Array.isArray(data?.knowledge?.sources) && data.knowledge.sources.length
          ? data.knowledge.sources
          : current.knowledge.sources,
    },
    signals: {
      ...current.signals,
      ...(data?.signals || {}),
      sources:
        Array.isArray(data?.signals?.sources) && data.signals.sources.length
          ? data.signals.sources
          : current.signals.sources,
    },
  };
}

function isFreshForToday(brief) {
  if (!brief?.meta?.lastSuccessfulRefreshAt) return false;
  return todayKey(new Date(brief.meta.lastSuccessfulRefreshAt)) === todayKey(new Date());
}

async function buildIndustryBrief({ force = false } = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const current = readBrief();
    if (!force && isFreshForToday(current)) {
      return current;
    }

    const candidates = await collectCandidates();

    let generated;
    try {
      generated = await generateWithLlm(candidates);
    } catch (err) {
      generated = fallbackBrief(candidates);
      const provider = resolveProviderConfig().provider;
      const providerLabel = {
        anthropic: 'Anthropic',
        deepseek: 'DeepSeek',
        openai: 'OpenAI',
      }[provider] || provider;
      generated.meta.error = `${providerLabel} generation failed: ${err.message}`;
    }

    const normalized = normalizeBriefShape(generated);
    normalized.meta.lastSuccessfulRefreshAt = new Date().toISOString();
    normalized.meta.generatedAt = new Date().toISOString();
    normalized.meta.status = 'ready';

    writeBrief(normalized);
    return normalized;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function localOnly(req) {
  const remote = req.socket?.remoteAddress || '';
  return (
    remote === '127.0.0.1' ||
    remote === '::1' ||
    remote === '::ffff:127.0.0.1' ||
    remote.endsWith('127.0.0.1')
  );
}

function scheduleDailyRefresh() {
  const targetHour = Number(process.env.DAILY_REFRESH_HOUR || 7);
  const targetMinute = Number(process.env.DAILY_REFRESH_MINUTE || 0);

  function msUntilNextRun() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(targetHour, targetMinute, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  const scheduleNext = () => {
    const wait = msUntilNextRun();
    setTimeout(async () => {
      try {
        await buildIndustryBrief({ force: true });
        console.log('[industry-brief] Daily brief refreshed');
      } catch (err) {
        console.error('[industry-brief] Daily refresh failed:', err.message);
      }
      scheduleNext();
    }, wait);
  };

  scheduleNext();
}

module.exports = {
  DATA_FILE,
  readBrief,
  writeBrief,
  buildIndustryBrief,
  scheduleDailyRefresh,
  localOnly,
};
