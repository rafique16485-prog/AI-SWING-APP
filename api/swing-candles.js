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

function normalize(candles) {
  return (Array.isArray(candles) ? candles : []).map(c => ({
    timestamp: c[0], open: Number(c[1]), high: Number(c[2]), low: Number(c[3]),
    close: Number(c[4]), volume: Number(c[5] || 0), openInterest: Number(c[6] || 0),
  })).reverse();
}

function dateString(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return dateString(d);
}

async function fetchHistorical(instrumentKey, unit, interval, fromDate, toDate) {
  const path = `/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${unit}/${interval}/${toDate}/${fromDate}`;
  const data = await upstox(path);
  return normalize(data?.data?.candles);
}

async function fetchIntraday(instrumentKey, unit, interval) {
  const path = `/v3/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/${unit}/${interval}`;
  const data = await upstox(path);
  return normalize(data?.data?.candles);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

  try {
    const instrumentKey = String(req.query?.instrument_key || '').trim();
    if (!instrumentKey) return json(res, 400, { ok: false, error: 'instrument_key is required' });

    // 1D and 1H use V3 historical candles. 15M and 5M use today's intraday candles.
    const [daily, hourly, m15, m5] = await Promise.all([
      fetchHistorical(instrumentKey, 'days', '1', daysAgo(365), dateString(new Date())),
      fetchHistorical(instrumentKey, 'hours', '1', daysAgo(90), dateString(new Date())),
      fetchIntraday(instrumentKey, 'minutes', '15'),
      fetchIntraday(instrumentKey, 'minutes', '5'),
    ]);

    return json(res, 200, {
      ok: true,
      provider: 'Upstox V3 Candle API',
      instrument_key: instrumentKey,
      updated_at_utc: new Date().toISOString(),
      timeframes: { '1D': daily, '1H': hourly, '15M': m15, '5M': m5 },
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || 'Candle request failed' });
  }
}
