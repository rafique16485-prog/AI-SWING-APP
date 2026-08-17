const UPSTOX_BASE = 'https://api.upstox.com';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-rexy');
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

function clean(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

async function resolveIndex(symbol) {
  const isSensex = symbol === 'SENSEX';
  const exchange = isSensex ? 'BSE' : 'NSE';
  const query = isSensex ? 'SENSEX' : 'NIFTY';
  const data = await upstox(`/v2/instruments/search?query=${encodeURIComponent(query)}&exchanges=${exchange}&segments=INDEX&page_number=1&records=20`);
  const rows = Array.isArray(data?.data) ? data.data : [];
  const exact = rows.find(x => clean(x.trading_symbol) === clean(symbol) || clean(x.short_name) === clean(symbol) || clean(x.name) === clean(symbol));
  const preferred = exact || rows.find(x => clean(x.trading_symbol).includes(clean(symbol)) || clean(x.name).includes(clean(symbol)));
  return preferred ? { symbol, instrument_key: preferred.instrument_key, trading_symbol: preferred.trading_symbol, name: preferred.name, exchange } : null;
}

function analyzeCandles(candles) {
  const rows = candles.slice().reverse();
  if (rows.length < 5) return { score: 0, bias: 'WAIT', structure: 'INSUFFICIENT DATA', bos: 'WAIT', liquidity: 'WAIT', retest: 'WAIT' };

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const recent = rows.slice(-5);
  const prior = rows.slice(-10, -5);
  const recentHigh = Math.max(...recent.map(c => Number(c[2])));
  const recentLow = Math.min(...recent.map(c => Number(c[3])));
  const priorHigh = prior.length ? Math.max(...prior.map(c => Number(c[2]))) : recentHigh;
  const priorLow = prior.length ? Math.min(...prior.map(c => Number(c[3]))) : recentLow;
  const close = Number(last[1]);
  const prevClose = Number(prev[1]);
  const lastHigh = Number(last[2]);
  const lastLow = Number(last[3]);
  const body = Math.abs(close - Number(last[4]));
  const range = Math.max(lastHigh - lastLow, 0.0001);

  let score = 0;
  const bullish = close > prevClose;
  const bearish = close < prevClose;

  const structure = close > recentHigh ? 'BULLISH HH/HL' : close < recentLow ? 'BEARISH LH/LL' : bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'SIDEWAYS';
  const bos = close > priorHigh ? 'BULLISH BOS' : close < priorLow ? 'BEARISH BOS' : 'NO BOS';
  const liquidity = lastHigh > priorHigh && close < priorHigh ? 'BUY-SIDE SWEEP' : lastLow < priorLow && close > priorLow ? 'SELL-SIDE SWEEP' : 'NO CLEAR SWEEP';
  const retest = (close > priorHigh && Number(last[3]) <= priorHigh) ? 'BULLISH RETEST' : (close < priorLow && Number(last[2]) >= priorLow) ? 'BEARISH RETEST' : 'WAIT';

  if (structure.includes('BULLISH')) score += 20;
  if (structure.includes('BEARISH')) score -= 20;
  if (bos === 'BULLISH BOS') score += 20;
  if (bos === 'BEARISH BOS') score -= 20;
  if (retest === 'BULLISH RETEST') score += 20;
  if (retest === 'BEARISH RETEST') score -= 20;
  if (liquidity === 'SELL-SIDE SWEEP') score += 15;
  if (liquidity === 'BUY-SIDE SWEEP') score -= 15;
  if (body / range >= 0.6) score += bullish ? 15 : -15;

  const bias = score >= 60 ? 'CALL / LONG WATCH' : score <= -60 ? 'PUT / SHORT WATCH' : 'WAIT';
  return { score, bias, structure, bos, liquidity, retest, close, high: lastHigh, low: lastLow, candle_time: last[0] };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  try {
    const symbol = String(req.query?.symbol || 'NIFTY50').toUpperCase();
    if (!['NIFTY50', 'SENSEX'].includes(symbol)) return json(res, 400, { error: 'Use NIFTY50 or SENSEX' });
    const instrument = await resolveIndex(symbol);
    if (!instrument) return json(res, 404, { error: `${symbol} instrument not resolved` });

    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const fromDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const path = `/v3/historical-candle/${encodeURIComponent(instrument.instrument_key)}/minutes/5/${to}/${fromDate}`;
    const data = await upstox(path);
    const candles = Array.isArray(data?.data?.candles) ? data.data.candles : [];
    const analysis = analyzeCandles(candles);

    return json(res, 200, { ok: true, symbol, name: instrument.name, exchange: instrument.exchange, timeframe: '5m', candles: candles.slice(0, 30), analysis, updated_at_utc: new Date().toISOString() });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || 'Price action request failed' });
  }
}
