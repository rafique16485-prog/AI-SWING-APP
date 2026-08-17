const UPSTOX_BASE = 'https://api.upstox.com';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res.end(JSON.stringify(body));
}

async function upstox(path) {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) throw new Error('UPSTOX_ANALYTICS_TOKEN is not configured');
  const r = await fetch(`${UPSTOX_BASE}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Upstox ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

function clean(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function resolveIndex(symbol) {
  const isSensex = symbol === 'SENSEX';
  const exchange = isSensex ? 'BSE' : 'NSE';
  const query = isSensex ? 'SENSEX' : 'NIFTY';
  const data = await upstox(
    `/v2/instruments/search?query=${encodeURIComponent(query)}&exchanges=${exchange}&segments=INDEX&page_number=1&records=20`
  );
  const rows = Array.isArray(data?.data) ? data.data : [];
  const exact = rows.find(x =>
    clean(x.trading_symbol) === clean(symbol) ||
    clean(x.short_name) === clean(symbol) ||
    clean(x.name) === clean(symbol)
  );
  const preferred = exact || rows.find(x => clean(x.trading_symbol).includes(clean(symbol)) || clean(x.name).includes(clean(symbol)));
  return preferred ? {
    symbol,
    instrument_key: preferred.instrument_key,
    trading_symbol: preferred.trading_symbol,
    name: preferred.name,
    exchange,
  } : null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

  try {
    const raw = String(req.query?.symbols || 'NIFTY50,SENSEX')
      .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 25);
    const symbols = raw.length ? raw : ['NIFTY50', 'SENSEX'];

    const resolved = await Promise.all(symbols.map(async symbol => {
      if (symbol === 'NIFTY' || symbol === 'NIFTY50') return resolveIndex('NIFTY50');
      if (symbol === 'SENSEX') return resolveIndex('SENSEX');
      return null;
    }));

    const instruments = resolved.filter(Boolean);
    if (!instruments.length) return json(res, 404, { error: 'No index instruments resolved', symbols });

    const keys = instruments.map(x => x.instrument_key).join(',');
    const quote = await upstox(`/v3/market-quote/ltp?instrument_key=${encodeURIComponent(keys)}`);
    const byKey = quote?.data || {};

    const getQuote = (instrumentKey) => (
      byKey[instrumentKey] ||
      byKey[instrumentKey.replace('|', ':')] ||
      byKey[instrumentKey.replace(':', '|')] ||
      Object.values(byKey).find(q => String(q?.instrument_token || '') === instrumentKey) ||
      {}
    );

    const rows = instruments.map(x => {
      const q = getQuote(x.instrument_key);
      const last = Number(q.last_price ?? 0);
      const cp = Number(q.cp ?? 0);
      const changePct = cp ? ((last / cp) - 1) * 100 : null;
      return {
        symbol: x.symbol,
        trading_symbol: x.trading_symbol,
        name: x.name,
        exchange: x.exchange,
        instrument_key: x.instrument_key,
        ltp: last,
        previous_close: cp,
        change_pct: changePct == null ? null : Number(changePct.toFixed(2)),
        volume: Number(q.volume ?? 0),
        ltq: Number(q.ltq ?? 0),
      };
    });

    return json(res, 200, {
      ok: true,
      provider: 'Upstox Analytics Token',
      mode: 'live-index-snapshot',
      updated_at_utc: new Date().toISOString(),
      rows,
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || 'Live market request failed' });
  }
}
