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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });

  try {
    const raw = String(req.query?.symbols || 'NIFTY50').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 25);
    const symbols = raw.length ? raw : ['NIFTY50'];

    // Resolve NSE equity/index symbols to Upstox instrument keys.
    const resolved = await Promise.all(symbols.map(async (symbol) => {
      const query = symbol === 'NIFTY50' ? 'NIFTY' : symbol;
      const data = await upstox(`/v2/instruments/search?query=${encodeURIComponent(query)}&exchanges=NSE&segments=${symbol === 'NIFTY50' ? 'INDEX' : 'EQ'}&page_number=1&records=10`);
      const rows = Array.isArray(data?.data) ? data.data : [];
      const exact = rows.find(x => {
        const trading = String(x.trading_symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const short = String(x.short_name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return trading === symbol || short === symbol;
      }) || rows[0];
      return exact ? { symbol, instrument_key: exact.instrument_key, trading_symbol: exact.trading_symbol, name: exact.name } : null;
    }));

    const instruments = resolved.filter(Boolean);
    if (!instruments.length) return json(res, 404, { error: 'No instruments resolved', symbols });

    const keys = instruments.map(x => x.instrument_key).join(',');
    const quote = await upstox(`/v3/market-quote/ltp?instrument_key=${encodeURIComponent(keys)}`);
    const byKey = quote?.data || {};

    // Upstox V3 returns response-object keys in exchange:token format,
    // while instrument_key uses exchange|token. Support both forms.
    const getQuote = (instrumentKey) => {
      return byKey[instrumentKey]
        || byKey[instrumentKey.replace('|', ':')]
        || byKey[instrumentKey.replace(':', '|')]
        || Object.values(byKey).find(q => String(q?.instrument_token || '') === instrumentKey)
        || {};
    };

    const rows = instruments.map(x => {
      const q = getQuote(x.instrument_key);
      const last = Number(q.last_price ?? 0);
      const cp = Number(q.cp ?? 0);
      const changePct = cp ? ((last / cp) - 1) * 100 : null;
      return {
        symbol: x.symbol,
        trading_symbol: x.trading_symbol,
        name: x.name,
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
      mode: 'live-snapshot',
      updated_at_utc: new Date().toISOString(),
      rows,
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || 'Live market request failed' });
  }
}
