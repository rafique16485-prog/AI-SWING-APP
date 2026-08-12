import json, re
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'index.html'
OUT = ROOT / 'market_data.json'

# Fast liquid universe for the first live version. Expand after stability is proven.
UNIVERSE = '''RELIANCE HDFCBANK ICICIBANK SBIN AXISBANK KOTAKBANK INDUSINDBK BAJFINANCE BAJAJFINSV
BHARTIARTL TCS INFY HCLTECH WIPRO LT LTIM TECHM ITC HINDUNILVR MARUTI M&M TATAMOTORS TATASTEEL
JSWSTEEL HINDALCO VEDL COALINDIA NTPC POWERGRID ONGC BPCL IOC ADANIENT ADANIPORTS BEL HAL BHEL
IRFC RVNL IREDA PFC RECLTD SAIL JINDALSTEL TVSMOTOR EICHERMOT HEROMOTOCO APOLLOTYRE ASHOKLEY
TRENT TITAN DIXON ZOMATO JIOFIN INDHOTEL DLF OBEROIRLTY PIDILITIND SIEMENS ABB
SUNPHARMA CIPLA DRREDDY DIVISLAB AUROPHARMA TORNTPHARM MAXHEALTH LTTS PERSISTENT COFORGE
POLYCAB KEI FINCABLES KPIL APLAPOLLO VOLTAS CROMPTON KAYNES KALYANKJIL HAVELLS AMBER
MCX BSE IEX IRCTC HUDCO NBCC SJVN NHPC BANKBARODA CANBK PNB IDFCFIRSTB FEDERALBNK RBLBANK BANDHANBNK
ZEEL PVRINOX DELHIVERY
'''.split()

def scan_symbol(sym, d, bench5=0.0):
    if d is None or len(d) < 35: return None
    d=d.dropna()
    if len(d)<35: return None
    close=d['Close'].astype(float); high=d['High'].astype(float); low=d['Low'].astype(float); vol=d['Volume'].astype(float)
    p=float(close.iloc[-1]); prev20high=float(high.iloc[-21:-1].max()); avgvol20=float(vol.iloc[-21:-1].mean())
    vr=float(vol.iloc[-1]/avgvol20) if avgvol20 else 0.0
    ret5=float((p/close.iloc[-6]-1)*100); ret20=float((p/close.iloc[-21]-1)*100)
    breakout_ratio=(p/prev20high-1)*100 if prev20high else 0.0
    range20=float(high.iloc[-21:-1].max()-low.iloc[-21:-1].min()); pos20=((p-float(low.iloc[-21:-1].min()))/range20*100) if range20 else 50
    slope=float((p/close.iloc[-11]-1)*100); structure=max(0,min(100,50+slope*8+(pos20-50)*.5))
    recent_high=high.iloc[-6:-1]; recent_low=low.iloc[-6:-1]; broke_recent=bool((recent_high>prev20high).any())
    retest_hold=bool(broke_recent and recent_low.min()<=prev20high*1.015 and p>=prev20high*.995)
    retest=92.0 if retest_hold else (max(45,min(82,82-abs(breakout_ratio)*8)) if broke_recent else max(30,min(75,structure)))
    rs=max(0,min(100,55+(ret5-bench5)*8+ret20*1.2)); volume_score=max(0,min(100,vr/3*100)); momentum=max(0,min(100,50+ret5*7+ret20*1.5)); breakout=max(0,min(100,55+breakout_ratio*18+(pos20-70)*.7))
    score=round(.30*breakout+.20*(.55*retest+.45*structure)+.20*rs+.20*volume_score+.10*momentum)
    structural_sl=float(low.iloc[-11:].min()); sl=max(structural_sl,p*.96); sl=p*.96 if sl>=p else sl
    risk_pct=(p-sl)/p*100; t1=p*1.04; t2=p*1.08; rr1=(t1-p)/(p-sl) if p>sl else 0; rr2=(t2-p)/(p-sl) if p>sl else 0
    no_chase=ret5>9 or breakout_ratio>4
    if score<55: return None
    if no_chase: status='NO CHASE'
    elif retest_hold and score>=80 and vr>=1.5 and rr1>=1.30: status='BUY CANDIDATE'
    elif p>=prev20high and broke_recent: status='WAIT FOR RETEST'
    elif p>=prev20high: status='BREAKOUT WATCH'
    else: status='MOMENTUM WATCH'
    pattern='Volume Breakout' if vr>=1.8 and p>=prev20high*.995 else ('Breakout' if p>=prev20high else ('Retest Watch' if broke_recent else 'Momentum Watch'))
    return {'s':sym,'n':sym,'p':round(p,2),'m':round(ret5,2),'v':round(vr,2),'b':round(breakout,1),'r':round(.55*retest+.45*structure,1),'rs':round(rs,1),'setup':status+' • '+pattern,'res':round(prev20high,2),'sup':round(sl,2),'ret20':round(ret20,2),'score':score,'status':status,'risk_pct':round(risk_pct,2),'rr1':round(rr1,2),'rr2':round(rr2,2),'target1':round(t1,2),'target2':round(t2,2),'retest_hold':retest_hold,'no_chase':no_chase}

def main():
    syms=sorted(set(UNIVERSE)); tickers=[s+'.NS' for s in syms]; print('FAST SCAN:',len(tickers),'symbols',flush=True)
    bench5=0.0
    try:
        bench=yf.download('^NSEI',period='2mo',interval='1d',auto_adjust=False,progress=False,threads=False,timeout=10)
        if bench is not None and len(bench)>=6:
            bc=bench['Close'].squeeze().dropna(); bench5=float((bc.iloc[-1]/bc.iloc[-6]-1)*100) if len(bc)>=6 else 0.0
    except Exception as e: print('Benchmark failed:',e,flush=True)
    rows=[]
    try:
        raw=yf.download(tickers,period='2mo',interval='1d',auto_adjust=False,progress=False,group_by='ticker',threads=True,timeout=10)
        for t in tickers:
            try:
                d=raw[t] if isinstance(raw.columns,pd.MultiIndex) and t in raw.columns.get_level_values(0) else None
                r=scan_symbol(t.replace('.NS',''),d,bench5)
                if r: rows.append(r)
            except Exception as e: print('skip',t,e,flush=True)
    except Exception as e: print('Batch download failed:',e,flush=True)
    rows.sort(key=lambda x:(x['status']=='BUY CANDIDATE',x['score'],x['rr2']),reverse=True); top=rows[:50]; stamp=datetime.now(timezone.utc).isoformat()
    OUT.write_text(json.dumps({'updated_utc':stamp,'universe_size':len(syms),'candidates_scanned':len(rows),'buy_candidates':sum(x['status']=='BUY CANDIDATE' for x in rows),'stocks':top},indent=2),encoding='utf-8')
    if top:
        text=INDEX.read_text(encoding='utf-8'); arr=',\n'.join(' '+json.dumps(x,separators=(',',':')) for x in top)
        text=re.sub(r'const stocks=\[.*?\];', lambda m: 'const stocks=[\n'+arr+'\n];', text, flags=re.S)
        text=text.replace('ENGINE V2.1 • RISK FILTERED','ENGINE V2.2 • FAST LIVE SCAN'); INDEX.write_text(text,encoding='utf-8')
    print('DONE | Top:',len(top),'| Scanned:',len(rows),'| BUY:',sum(x['status']=='BUY CANDIDATE' for x in rows),flush=True)

if __name__=='__main__': main()
