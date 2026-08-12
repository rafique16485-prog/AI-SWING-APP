import json, re, time
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'index.html'
OUT = ROOT / 'market_data.json'

FALLBACK = ['RELIANCE','HDFCBANK','ICICIBANK','SBIN','AXISBANK','KOTAKBANK','ITC','TCS','INFY','HCLTECH','BHARTIARTL','LT','TATAMOTORS','TATASTEEL','M&M','SUNPHARMA','MARUTI','NTPC','POWERGRID','ONGC','COALINDIA','ADANIENT','ADANIPORTS','BEL','HAL','TRENT','ZOMATO','JIOFIN','INDHOTEL','IOC','BPCL','HINDALCO','JSWSTEEL','VEDL','TITAN','BAJFINANCE','BAJAJFINSV','INDUSINDBK','EICHERMOT','HEROMOTOCO','TVSMOTOR','DLF','PIDILITIND','SIEMENS','ABB','DIXON','BHEL','IRFC','RVNL','IREDA']


def universe():
    urls = [
        'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv',
        'https://archives.nseindia.com/content/indices/ind_nifty500list.csv',
    ]
    for url in urls:
        try:
            df = pd.read_csv(url)
            col = next((c for c in df.columns if str(c).strip().upper() == 'SYMBOL'), None)
            if col:
                syms = [str(x).strip().upper() for x in df[col].dropna()]
                if len(syms) >= 300:
                    return sorted(set(syms))
        except Exception as e:
            print('Universe source failed:', url, e)
    return FALLBACK


def norm(v, lo, hi):
    if hi <= lo: return 0.0
    return max(0.0, min(100.0, (v-lo)/(hi-lo)*100.0))


def scan_symbol(sym, data, bench5=0.0):
    if data is None or len(data) < 35: return None
    d = data.dropna().copy()
    if len(d) < 35: return None
    close = d['Close'].astype(float); high = d['High'].astype(float); low = d['Low'].astype(float); vol = d['Volume'].astype(float)
    p = float(close.iloc[-1]); prev20high = float(high.iloc[-21:-1].max()); avgvol20 = float(vol.iloc[-21:-1].mean())
    vr = float(vol.iloc[-1] / avgvol20) if avgvol20 > 0 else 0.0
    ret5 = float((p/close.iloc[-6]-1)*100)
    ret20 = float((p/close.iloc[-21]-1)*100)
    breakout_ratio = (p/prev20high-1)*100 if prev20high else 0.0
    range20 = float(high.iloc[-21:-1].max()-low.iloc[-21:-1].min())
    pos20 = ((p-float(low.iloc[-21:-1].min()))/range20*100) if range20 > 0 else 50
    # Structure proxy: rising 10-day closes + strong 20-day range position.
    slope = float((close.iloc[-1]/close.iloc[-11]-1)*100)
    structure = max(0,min(100, 50 + slope*8 + (pos20-50)*0.5))
    # Retest quality: breakout in last 5 sessions and price still near/above breakout level.
    recent_high = high.iloc[-6:-1]
    broke_recent = bool((recent_high > prev20high).any())
    retest = 55.0
    if broke_recent:
        distance = abs(p/prev20high-1)*100
        retest = max(45, min(100, 100 - distance*8))
        if p >= prev20high*0.995: retest = min(100, retest+10)
    else:
        retest = max(30, min(80, structure))
    # Relative strength against benchmark 5D move.
    rs = max(0,min(100, 55 + (ret5-bench5)*8 + (ret20)*1.2))
    volume_score = max(0,min(100, vr/3*100))
    momentum = max(0,min(100, 50 + ret5*7 + ret20*1.5))
    breakout = max(0,min(100, 55 + breakout_ratio*18 + (pos20-70)*0.7))
    score = round(0.30*breakout + 0.20*(0.55*retest+0.45*structure) + 0.20*rs + 0.20*volume_score + 0.10*momentum)
    if score < 55: return None
    setup = 'Volume Breakout' if vr >= 1.8 and p >= prev20high*0.995 else ('Breakout' if p >= prev20high else ('Retest Watch' if broke_recent else 'Momentum Watch'))
    # Conservative swing levels: 4% / 8% targets, recent 10-day low as structural stop.
    sup = float(low.iloc[-11:].min())
    if sup >= p: sup = p*0.96
    return {
        's': sym, 'n': sym, 'p': round(p,2), 'm': round(ret5,2), 'v': round(vr,2),
        'b': round(breakout,1), 'r': round((0.55*retest+0.45*structure),1), 'rs': round(rs,1),
        'setup': setup, 'res': round(prev20high,2), 'sup': round(sup,2),
        'ret20': round(ret20,2), 'score': score
    }


def main():
    syms = universe()
    tickers = [s+'.NS' for s in syms]
    print('Scanning', len(tickers), 'symbols')
    # Batch downloads reduce API calls. If a batch fails, continue with the next one.
    chunks = [tickers[i:i+100] for i in range(0, len(tickers), 100)]
    all_rows = []
    bench = yf.download('^NSEI', period='3mo', interval='1d', auto_adjust=False, progress=False, threads=False)
    bench5 = 0.0
    if bench is not None and len(bench) >= 6:
        bclose = bench['Close'].squeeze().dropna()
        if len(bclose) >= 6: bench5 = float((bclose.iloc[-1]/bclose.iloc[-6]-1)*100)
    for i, chunk in enumerate(chunks,1):
        try:
            raw = yf.download(chunk, period='3mo', interval='1d', auto_adjust=False, progress=False, group_by='ticker', threads=True)
            for t in chunk:
                try:
                    if isinstance(raw.columns, pd.MultiIndex):
                        if t not in raw.columns.get_level_values(0): continue
                        d = raw[t]
                    else:
                        d = raw
                    row = scan_symbol(t.replace('.NS',''), d, bench5)
                    if row: all_rows.append(row)
                except Exception as e:
                    print('symbol failed', t, e)
        except Exception as e:
            print('batch failed', i, e)
        time.sleep(1)
    all_rows.sort(key=lambda x: x['score'], reverse=True)
    top = all_rows[:50]
    stamp = datetime.now(timezone.utc).isoformat()
    OUT.write_text(json.dumps({'updated_utc': stamp, 'universe_size': len(syms), 'candidates_scanned': len(all_rows), 'stocks': top}, indent=2), encoding='utf-8')
    if top:
        text = INDEX.read_text(encoding='utf-8')
        arr = ',\n'.join(' '+json.dumps({k:v for k,v in x.items() if k != 'score'}, separators=(',',':')) for x in top)
        text = re.sub(r'const stocks=\[.*?\];', 'const stocks=[\n'+arr+'\n];', text, flags=re.S)
        text = text.replace('ENGINE V1 • DEMO DATA', 'ENGINE V2 • MARKET SNAPSHOT')
        text = re.sub(r'⚠️ Educational screening tool\. Market data in this V1 is demo/sample data; connect a permitted live data source before using it for real decisions\.', '⚠️ Market snapshot generated automatically from public market-data sources. Verify price/volume on your broker before trading.', text)
        text = text.replace('Score = Breakout 30% + Retest/Structure 20% + Relative Strength 20% + Volume 20% + Momentum 10%. Scores are intentionally not capped at 100 until the final calculation.', 'Score = Breakout 30% + Retest/Structure 20% + Relative Strength 20% + Volume 20% + Momentum 10%. Snapshot: '+stamp)
        INDEX.write_text(text, encoding='utf-8')
    print('Top candidates:', len(top), 'scanned:', len(all_rows))

if __name__ == '__main__':
    main()
