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

function indiaDate(offsetDays = 0) {
  const d = new Date(Date.now() + 19800000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function parseCandles(data) {
  const candles = Array.isArray(data?.data?.candles) ? data.data.candles : [];
  return candles.map(c => ({
    time: c[0], open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] || 0)
  })).filter(c => [c.open,c.high,c.low,c.close].every(Number.isFinite)).reverse();
}

async function candles(instrumentKey, unit, interval, historical) {
  const key = encodeURIComponent(instrumentKey);
  if (historical) {
    const to = indiaDate(0);
    const from = unit === 'days' ? indiaDate(-180) : indiaDate(-30);
    return parseCandles(await upstox(`/v3/historical-candle/${key}/${unit}/${interval}/${to}/${from}`));
  }
  return parseCandles(await upstox(`/v3/historical-candle/intraday/${key}/${unit}/${interval}`));
}

function structure(cs) {
  if (cs.length < 6) return { bias: 'NEUTRAL', structure: 'INSUFFICIENT DATA', bos: 'NONE', swingHigh: null, swingLow: null };
  const last = cs[cs.length - 1];
  const prev = cs.slice(-6, -1);
  const priorHigh = Math.max(...prev.map(c => c.high));
  const priorLow = Math.min(...prev.map(c => c.low));
  const highs = cs.slice(-8).map(c => c.high);
  const lows = cs.slice(-8).map(c => c.low);
  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);
  const bullish = last.close > priorHigh;
  const bearish = last.close < priorLow;
  const higher = last.close > cs[cs.length - 4].close && last.low >= cs[cs.length - 4].low;
  const lower = last.close < cs[cs.length - 4].close && last.high <= cs[cs.length - 4].high;
  return {
    bias: bullish || higher ? 'BULLISH' : bearish || lower ? 'BEARISH' : 'NEUTRAL',
    structure: bullish || higher ? 'HH-HL' : bearish || lower ? 'LH-LL' : 'RANGE',
    bos: bullish ? 'BULLISH BOS' : bearish ? 'BEARISH BOS' : 'NONE',
    swingHigh, swingLow, lastClose: last.close
  };
}

function retestSetup(cs, bias) {
  if (cs.length < 5) return { setup: 'NONE', confirmation: 'NOT CONFIRMED' };
  const last = cs[cs.length - 1];
  const prev = cs.slice(-6, -1);
  const priorHigh = Math.max(...prev.map(c => c.high));
  const priorLow = Math.min(...prev.map(c => c.low));
  const bullishBreak = last.close > priorHigh;
  const bearishBreak = last.close < priorLow;
  const avgVol = prev.reduce((s,c) => s+c.volume, 0) / Math.max(1, prev.length);
  const volumeConfirmed = avgVol > 0 && last.volume >= avgVol * 1.15;
  if (bias === 'BULLISH' && bullishBreak) return { setup: volumeConfirmed ? 'BREAKOUT + VOLUME' : 'BREAKOUT', confirmation: 'CONFIRMED' };
  if (bias === 'BEARISH' && bearishBreak) return { setup: volumeConfirmed ? 'BREAKDOWN + VOLUME' : 'BREAKDOWN', confirmation: 'CONFIRMED' };
  return { setup: 'NO CONFIRMED BREAKOUT', confirmation: 'NOT CONFIRMED' };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  try {
    const instrumentKey = String(req.query?.instrument_key || '').trim();
    const symbol = String(req.query?.symbol || '').trim().toUpperCase();
    if (!instrumentKey) return json(res, 400, { ok: false, error: 'instrument_key is required' });

    const [daily, hourly, m15, m5] = await Promise.all([
      candles(instrumentKey, 'days', '1', true),
      candles(instrumentKey, 'hours', '1', true),
      candles(instrumentKey, 'minutes', '15', false),
      candles(instrumentKey, 'minutes', '5', false)
    ]);

    const d = structure(daily), h = structure(hourly), p15 = structure(m15), p5 = structure(m5);
    const setup = retestSetup(m15, h.bias === 'NEUTRAL' ? d.bias : h.bias);
    const entryConfirmed = setup.confirmation === 'CONFIRMED' && (
      (h.bias === 'BULLISH' && p5.bias === 'BULLISH') ||
      (h.bias === 'BEARISH' && p5.bias === 'BEARISH')
    );
    const finalBias = h.bias !== 'NEUTRAL' ? h.bias : d.bias;
    const finalDecision = entryConfirmed ? (finalBias === 'BULLISH' ? 'SWING LONG' : 'SWING SHORT') : 'WAIT';
    const entry = p5.lastClose || p15.lastClose || h.lastClose || d.lastClose;
    const riskLow = Math.min(p15.swingLow ?? entry, p5.swingLow ?? entry);
    const riskHigh = Math.max(p15.swingHigh ?? entry, p5.swingHigh ?? entry);
    const sl = finalBias === 'BULLISH' ? riskLow : riskHigh;
    const risk = Math.abs(entry - sl);
    const t1 = finalBias === 'BULLISH' ? entry + risk * 2 : entry - risk * 2;
    const t2 = finalBias === 'BULLISH' ? entry + risk * 3 : entry - risk * 3;
    const score = Math.round(Math.min(100, Math.max(0,
      (d.bias === finalBias ? 30 : 0) + (h.bias === finalBias ? 30 : 0) + (p15.bias === finalBias ? 20 : 0) + (p5.bias === finalBias ? 20 : 0)
    )));

    return json(res, 200, {
      ok: true, symbol, instrument_key: instrumentKey, updated_at_utc: new Date().toISOString(),
      score, market_structure: finalBias, bias: finalBias,
      daily: { structure: d.structure, bos: d.bos },
      hourly: { structure: h.structure, bos: h.bos },
      m15: { structure: p15.structure, setup: setup.setup, confirmation: setup.confirmation },
      m5: { structure: p5.structure, confirmation: entryConfirmed ? 'CONFIRMED' : 'NOT CONFIRMED' },
      entry: Number(entry?.toFixed?.(2) ?? 0), stop_loss: Number(sl?.toFixed?.(2) ?? 0),
      target1: Number(t1?.toFixed?.(2) ?? 0), target2: Number(t2?.toFixed?.(2) ?? 0),
      risk_reward: risk > 0 ? '1:2 / 1:3' : 'N/A', final_decision: finalDecision,
      confidence: score >= 80 && entryConfirmed ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
      data_available: { daily: daily.length, hourly: hourly.length, m15: m15.length, m5: m5.length }
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || 'Swing analysis failed' });
  }
}
