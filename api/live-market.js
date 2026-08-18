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

async function resolveInstrument(symbol) {
  const isSensex = symbol === 'SENSEX';
  const isNifty = symbol === 'NIFTY' || symbol === 'NIFTY50';
  const exchange = isSensex ? 'BSE' : 'NSE';
  const query = isSensex ? 'SENSEX' : isNifty ? 'NIFTY' : symbol;
  const segment = isSensex || isNifty ? 'INDEX' : 'EQ';
  const data = await upstox(
    `/v2/instruments/search?query=${encodeURIComponent(query)}&exchanges=${exchange}&segments=${segment}&page_number=1&records=20`
  );
  const rows = Array.isArray(data?.data) ? data.data : [];
  const exact = rows.find(x =>
    clean(x.trading_symbol) === clean(symbol) ||
    clean(x.short_name) === clean(symbol) ||
    clean(x.name) === clean(symbol)
  );
  const preferred = exact || rows.find(x => clean(x.trading_symbol) === clean(symbol)) || rows[0];
  return preferred ? {
    symbol,
    instrument_key: preferred.instrument_key,
    trading_symbol: preferred.trading_symbol,
    name: preferred.name || preferred.short_name || preferred.trading_symbol,
    exchange,
    kind: segment === 'INDEX' ? 'INDEX' : 'EQ',
  } : null;
}

function latestClosed5m(candles) {
  if (!Array.isArray(candles)) return null;
  const now = Date.now();
  const bucketStart = Math.floor(now / 300000) * 300000;
  const parsed = candles
    .map(c => ({
      ts: new Date(c?.[0]).getTime(),
      open: Number(c?.[1] ?? 0),
      high: Number(c?.[2] ?? 0),
      low: Number(c?.[3] ?? 0),
      close: Number(c?.[4] ?? 0),
      volume: Number(c?.[5] ?? 0),
      oi: Number(c?.[6] ?? 0),
    }))
    .filter(c => Number.isFinite(c.ts) && c.ts < bucketStart && c.close > 0)
    .sort((a, b) => b.ts - a.ts);
  return parsed[0] || null;
}

async function get5m(symbol) {
  const data = await upstox(`/v3/historical-candle/intraday/${encodeURIComponent(symbol)}/minutes/5`);
  const candles = Array.isArray(data?.data?.candles) ? data.data.candles : [];
  const latest = latestClosed5m(candles);
  if (!latest) return { candle: null, volume_ratio: null };
  const ordered = candles
    .map(c => ({ ts: new Date(c?.[0]).getTime(), volume: Number(c?.[5] ?? 0) }))
    .filter(c => Number.isFinite(c.ts) && c.ts < Math.floor(Date.now() / 300000) * 300000)
    .sort((a, b) => b.ts - a.ts);
  const baseline = ordered.slice(1, 7).map(x => x.volume).filter(v => v > 0);
  const avg = baseline.length ? baseline.reduce((a, b) => a + b, 0) / baseline.length : 0;
  return {
    candle: latest,
    volume_ratio: avg > 0 && latest.volume > 0 ? Number((latest.volume / avg).toFixed(2)) : null,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

  try {
    const raw = String(req.query?.symbols || 'NIFTY50,SENSEX')
      .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);
    const symbols = raw.length ? raw : ['NIFTY50', 'SENSEX'];

    const resolved = (await Promise.all(symbols.map(resolveInstrument))).filter(Boolean);
    if (!resolved.length) return json(res, 404, { error: 'No instruments resolved', symbols });

    const keys = resolved.map(x => x.instrument_key).join(',');
    const quote = await upstox(`/v3/market-quote/ltp?instrument_key=${encodeURIComponent(keys)}`);
    const byKey = quote?.data || {};

    const getQuote = (instrumentKey) => (
      byKey[instrumentKey] ||
      byKey[instrumentKey.replace('|', ':')] ||
      byKey[instrumentKey.replace(':', '|')] ||
      Object.values(byKey).find(q => String(q?.instrument_token || '') === instrumentKey) ||
      {}
    );

    const rows = await Promise.all(resolved.map(async x => {
      const q = getQuote(x.instrument_key);
      const last = Number(q.last_price ?? 0);
      const cp = Number(q.cp ?? 0);
      const changePct = cp ? ((last / cp) - 1) * 100 : null;
      let candleData = { candle: null, volume_ratio: null };
      try { candleData = await get5m(x.instrument_key); } catch (_) {}
      const c = candleData.candle;
      const candleMove = c?.open ? ((c.close / c.open) - 1) * 100 : null;
      const rangePct = c?.open ? ((c.high - c.low) / c.open) * 100 : null;
      return {
        symbol: x.symbol,
        trading_symbol: x.trading_symbol,
        name: x.name,
        exchange: x.exchange,
        kind: x.kind,
        instrument_key: x.instrument_key,
        ltp: last,
        previous_close: cp,
        change_pct: changePct == null ? null : Number(changePct.toFixed(2)),
        volume: Number(c?.volume ?? q.volume ?? 0),
        ltq: Number(q.ltq ?? 0),
        candle_time: c?.ts ? new Date(c.ts).toISOString() : null,
        candle_open: c?.open ?? null,
        candle_high: c?.high ?? null,
        candle_low: c?.low ?? null,
        candle_close: c?.close ?? null,
        candle_move_pct: candleMove == null ? null : Number(candleMove.toFixed(3)),
        candle_range_pct: rangePct == null ? null : Number(rangePct.toFixed(3)),
        volume_ratio: candleData.volume_ratio,
      };
    }));

    return json(res, 200, {
      ok: true,
      provider: 'Upstox Analytics Token',
      mode: 'live-ltp-plus-closed-5m-candle',
      updated_at_utc: new Date().toISOString(),
      rows,
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || 'Live market request failed' });
  }
}
