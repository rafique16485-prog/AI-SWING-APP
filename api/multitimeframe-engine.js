function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res.end(JSON.stringify(body));
}

const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

function structure(candles = []) {
  if (candles.length < 6) return { bias: 'NEUTRAL', label: 'INSUFFICIENT DATA' };
  const a = candles.slice(-3).map(c => num(c.high));
  const l = candles.slice(-3).map(c => num(c.low));
  const hh = a[2] > a[1] && a[1] > a[0];
  const hl = l[2] > l[1] && l[1] > l[0];
  const lh = a[2] < a[1] && a[1] < a[0];
  const ll = l[2] < l[1] && l[1] < l[0];
  if (hh && hl) return { bias: 'BULLISH', label: 'HH-HL' };
  if (lh && ll) return { bias: 'BEARISH', label: 'LH-LL' };
  return { bias: 'NEUTRAL', label: 'RANGE' };
}

function timeframeSignal(candles = []) {
  if (candles.length < 20) return { signal: 'WAIT', reason: 'Need more candles' };
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const recent = candles.slice(-21, -1);
  const high = Math.max(...recent.map(c => num(c.high)));
  const low = Math.min(...recent.map(c => num(c.low)));
  const close = num(last.close);
  const volume = num(last.volume);
  const avgVol = recent.reduce((s, c) => s + num(c.volume), 0) / recent.length;
  const breakoutUp = close > high && close > num(prev.close);
  const breakoutDown = close < low && close < num(prev.close);
  const volumeOk = avgVol > 0 && volume >= avgVol * 1.2;
  return {
    signal: breakoutUp && volumeOk ? 'BULLISH_BREAKOUT' : breakoutDown && volumeOk ? 'BEARISH_BREAKOUT' : 'WAIT',
    reason: breakoutUp ? (volumeOk ? 'High breakout + volume confirmation' : 'High breakout but weak volume') : breakoutDown ? (volumeOk ? 'Low breakdown + volume confirmation' : 'Low breakdown but weak volume') : 'No confirmed breakout',
    volumeConfirmed: volumeOk
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

  // This endpoint is intentionally calculation-only. Feed normalized candle arrays
  // from the live broker adapter; no fake prices are generated here.
  try {
    const payload = req.query?.data ? JSON.parse(String(req.query.data)) : null;
    if (!payload) return json(res, 400, { ok: false, error: 'Missing data. Send normalized candles for 1D, 1H, 15M and 5M.' });

    const tf = payload.timeframes || {};
    const daily = structure(tf['1D']);
    const hourly = structure(tf['1H']);
    const m15 = timeframeSignal(tf['15M']);
    const m5 = timeframeSignal(tf['5M']);

    const alignedLong = daily.bias === 'BULLISH' && hourly.bias === 'BULLISH';
    const alignedShort = daily.bias === 'BEARISH' && hourly.bias === 'BEARISH';
    const longTrigger = m15.signal === 'BULLISH_BREAKOUT' && m5.signal === 'BULLISH_BREAKOUT';
    const shortTrigger = m15.signal === 'BEARISH_BREAKOUT' && m5.signal === 'BEARISH_BREAKOUT';

    let verdict = 'WAIT';
    if (alignedLong && longTrigger) verdict = 'BUY';
    if (alignedShort && shortTrigger) verdict = 'SELL';

    return json(res, 200, {
      ok: true,
      verdict,
      rule: 'Daily + 1H trend alignment, then 15M setup and 5M confirmation',
      timeframes: { '1D': daily, '1H': hourly, '15M': m15, '5M': m5 },
      confirmation: verdict === 'BUY' || verdict === 'SELL' ? 'ALL TIMEFRAMES ALIGNED' : 'WAIT FOR CONFIRMATION'
    });
  } catch (e) {
    return json(res, 400, { ok: false, error: e?.message || 'Invalid candle data' });
  }
}
