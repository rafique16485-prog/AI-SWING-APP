import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Sliders, Zap, RefreshCw, Database, Wifi, Search, BarChart3, Activity } from 'lucide-react';

const INITIAL_STOCKS = [
  { symbol:'TATASTEEL', name:'Tata Steel Ltd.', price:174.50, change:4.82, volume:'3.8x', ema9:168.20, vwap:171.10, timeframe:'Daily' },
  { symbol:'RELIANCE', name:'Reliance Industries', price:2945.10, change:3.15, volume:'2.4x', ema9:2910.50, vwap:2930.00, timeframe:'4-Hour' },
  { symbol:'INFY', name:'Infosys Ltd.', price:1532.00, change:-0.45, volume:'0.8x', ema9:1545.00, vwap:1538.50, timeframe:'Daily' },
  { symbol:'SBIN', name:'State Bank of India', price:842.30, change:5.60, volume:'4.1x', ema9:815.40, vwap:830.20, timeframe:'Daily' },
  { symbol:'TATOMOTORS', name:'Tata Motors Ltd.', price:988.40, change:2.80, volume:'1.9x', ema9:975.00, vwap:982.10, timeframe:'4-Hour' },
  { symbol:'HDFCBANK', name:'HDFC Bank Ltd.', price:1610.20, change:1.10, volume:'1.2x', ema9:1605.00, vwap:1612.50, timeframe:'4-Hour' },
  { symbol:'ITC', name:'ITC Ltd.', price:432.15, change:3.90, volume:'3.2x', ema9:420.50, vwap:428.00, timeframe:'Daily' },
  { symbol:'BHARTIARTL', name:'Bharti Airtel', price:1420.00, change:6.25, volume:'5.0x', ema9:1380.00, vwap:1405.50, timeframe:'Daily' }
];

const INDEX_START = [
  { symbol:'NIFTY50', name:'NIFTY 50', ltp:0, change_pct:0, volume:0, exchange:'NSE' },
  { symbol:'SENSEX', name:'SENSEX', ltp:0, change_pct:0, volume:0, exchange:'BSE' }
];

const money = n => Number(n || 0).toLocaleString('en-IN',{maximumFractionDigits:2});

// IMPORTANT: levels are created ONLY after a LONG/SHORT setup is confirmed.
function buildSetup(price, direction, riskPct = 0.5) {
  const p = Number(price || 0);
  if (!p || direction === 'WAIT') return { direction:'WAIT', entry:0, sl:0, target1:0, target2:0, rr:'—' };

  const risk = p * (riskPct / 100);
  if (direction === 'LONG') {
    const sl = p - risk;
    return { direction, entry:p, sl:Number(sl.toFixed(2)), target1:Number((p + risk * 2).toFixed(2)), target2:Number((p + risk * 3).toFixed(2)), rr:'1 : 2' };
  }

  const sl = p + risk;
  return { direction, entry:p, sl:Number(sl.toFixed(2)), target1:Number((p - risk * 2).toFixed(2)), target2:Number((p - risk * 3).toFixed(2)), rr:'1 : 2' };
}

function getStockDirection(stock) {
  if (!stock) return 'WAIT';
  const aboveBoth = stock.price > stock.vwap && stock.price > stock.ema9;
  const belowBoth = stock.price < stock.vwap && stock.price < stock.ema9;
  if (aboveBoth) return 'LONG';
  if (belowBoth) return 'SHORT';
  return 'WAIT';
}

export default function App(){
  const [stocks] = useState(INITIAL_STOCKS);
  const [indices,setIndices] = useState(INDEX_START);
  const [mode,setMode] = useState('indices');
  const [selectedStock,setSelectedStock] = useState(INITIAL_STOCKS[0]);
  const [selectedIndex,setSelectedIndex] = useState(INDEX_START[0]);
  const [searchQuery,setSearchQuery] = useState('');
  const [filterVolume,setFilterVolume] = useState('all');
  const [apiConnected,setApiConnected] = useState(false);
  const [connecting,setConnecting] = useState(false);
  const [apiError,setApiError] = useState('');
  const [lastUpdated,setLastUpdated] = useState('');
  const [aiAnalysis,setAiAnalysis] = useState('');
  const [loading,setLoading] = useState(false);
  const [priceAction,setPriceAction] = useState(null);
  const [priceActionLoading,setPriceActionLoading] = useState(false);
  const [priceActionError,setPriceActionError] = useState('');
  const [capital] = useState(5000);
  const [riskPercent] = useState(1);

  const fetchLiveIndices = async () => {
    try {
      setApiError('');
      const res = await fetch('/api/live-market?symbols=NIFTY50,SENSEX',{cache:'no-store'});
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Live API failed');
      setIndices(data.rows || []);
      setLastUpdated(new Date().toLocaleTimeString('en-IN'));
      return true;
    } catch (err) {
      setApiError(err.message || 'Live data unavailable');
      return false;
    }
  };

  const fetchPriceAction = async (symbol) => {
    try {
      setPriceActionLoading(true);
      setPriceActionError('');
      const res = await fetch(`/api/price-action?symbol=${encodeURIComponent(symbol)}`,{cache:'no-store'});
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Price action API failed');
      setPriceAction(data.analysis || null);
    } catch (err) {
      setPriceAction(null);
      setPriceActionError(err.message || '5-minute data unavailable');
    } finally {
      setPriceActionLoading(false);
    }
  };

  useEffect(() => {
    if (!apiConnected) return;
    fetchLiveIndices();
    const timer = setInterval(fetchLiveIndices,5000);
    return () => clearInterval(timer);
  },[apiConnected]);

  const toggleApiConnection = async () => {
    if (apiConnected) { setApiConnected(false); return; }
    setConnecting(true);
    const ok = await fetchLiveIndices();
    setConnecting(false);
    if (ok) setApiConnected(true);
  };

  const selectedIndexLive = useMemo(() => indices.find(i => i.symbol === selectedIndex.symbol) || selectedIndex,[indices,selectedIndex.symbol]);

  const indexDirection = useMemo(() => {
    if (!priceAction) return 'WAIT';
    const score = Number(priceAction.score || 0);
    const bias = String(priceAction.bias || '').toUpperCase();
    if (score >= 60 || bias.includes('LONG') || bias.includes('CALL') || bias.includes('BULL')) return 'LONG';
    if (score <= -60 || bias.includes('SHORT') || bias.includes('PUT') || bias.includes('BEAR')) return 'SHORT';
    return 'WAIT';
  },[priceAction]);

  const setup = useMemo(() => {
    if (mode === 'indices') return buildSetup(selectedIndexLive.ltp,indexDirection,0.5);
    return buildSetup(selectedStock.price,getStockDirection(selectedStock),0.5);
  },[mode,selectedIndexLive,selectedStock,indexDirection]);

  const quantity = useMemo(() => {
    if (setup.direction === 'WAIT' || !setup.entry || !setup.sl) return 0;
    const riskAmount = capital * riskPercent / 100;
    const unitRisk = Math.abs(setup.entry - setup.sl);
    return unitRisk > 0 ? Math.floor(riskAmount / unitRisk) : 0;
  },[capital,riskPercent,setup]);

  const filteredStocks = stocks.filter(s => {
    const q = s.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const v = parseFloat(s.volume);
    return q && (filterVolume==='all' || (filterVolume==='high'&&v>=3) || (filterVolume==='medium'&&v>=1.5&&v<3));
  });

  const selectStock = stock => {
    setMode('stocks');
    setSelectedStock(stock);
    setAiAnalysis('');
  };

  const selectIndex = index => {
    setMode('indices');
    setSelectedIndex(index);
    setAiAnalysis('');
    setPriceAction(null);
    if (index.ltp) fetchPriceAction(index.symbol);
  };

  const handleAIAnalysis = () => {
    setLoading(true);
    setAiAnalysis('');
    setTimeout(() => {
      if (mode === 'indices') {
        const i = selectedIndexLive;
        const score = Number(priceAction?.score || 0);
        const verdict = indexDirection;
        setAiAnalysis(`🤖 ${i.name} MASTER REPORT\n\nLTP: ₹${money(i.ltp)}\n5-Min Score: ${score}\n\nFINAL VERDICT: ${verdict === 'WAIT' ? 'WAIT' : verdict}\n\n${verdict === 'WAIT' ? '⚠️ No confirmed setup. Do NOT show trade levels. Wait for structure + liquidity + BOS/CHOCH confirmation.' : '✅ Setup confirmed. Entry/SL/Target are calculated from the confirmed direction with 1:2 planned RR.'}\n\nAutomatic order placement: OFF.`);
      } else {
        const s = selectedStock;
        const direction = getStockDirection(s);
        setAiAnalysis(`🤖 ${s.symbol} MASTER REPORT\n\nPrice: ₹${money(s.price)}\n9-EMA: ₹${money(s.ema9)} → ${s.price>s.ema9?'Above ✅':'Below ❌'}\nVWAP: ₹${money(s.vwap)} → ${s.price>s.vwap?'Above ✅':'Below ❌'}\n\nFINAL VERDICT: ${direction}\n\n${direction === 'WAIT' ? '⚠️ Price is between EMA/VWAP. No trade levels until confirmation.' : '✅ Direction confirmed by price vs EMA/VWAP.'}`);
      }
      setLoading(false);
    },500);
  };

  return <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
    <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/15 p-2 rounded-xl border border-emerald-500/30"><TrendingUp className="w-8 h-8 text-emerald-400"/></div>
          <div><h1 className="text-xl sm:text-2xl font-bold text-white">SWING HUNTER <span className="text-emerald-400">AI</span></h1><p className="text-xs text-slate-400">Stocks • NIFTY 50 • SENSEX • 5-Min Price Action</p></div>
        </div>
        <button onClick={toggleApiConnection} disabled={connecting} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${apiConnected?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':connecting?'bg-amber-500/20 text-amber-400 border border-amber-500/30':'bg-slate-800 text-slate-200 border border-slate-700'}`}>
          {connecting?<RefreshCw className="w-4 h-4 animate-spin"/>:apiConnected?<Wifi className="w-4 h-4"/>:<Database className="w-4 h-4"/>}
          {connecting?'Connecting...':apiConnected?'LIVE UPSTOX':'Connect Live API'}
        </button>
      </div>
    </header>

    <main className="max-w-7xl mx-auto px-4 py-5 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {indices.map(i => <button key={i.symbol} onClick={()=>selectIndex(i)} className={`text-left p-4 rounded-2xl border ${mode==='indices'&&selectedIndex.symbol===i.symbol?'border-emerald-500/60 bg-emerald-950/30':'border-slate-800 bg-slate-900'}`}>
          <div className="flex justify-between"><span className="font-bold">{i.name}</span><BarChart3 className="w-4 h-4 text-slate-500"/></div>
          <div className="mt-2 text-2xl font-mono font-bold">{i.ltp?`₹${money(i.ltp)}`:'—'}</div>
          <div className={`text-sm font-bold ${Number(i.change_pct)>=0?'text-emerald-400':'text-rose-400'}`}>{i.ltp?`${Number(i.change_pct)>=0?'+':''}${Number(i.change_pct).toFixed(2)}%`:'Connect API'}</div>
          <div className="text-[10px] text-slate-500 mt-1">{i.exchange} • LIVE SNAPSHOT</div>
        </button>)}
      </div>

      {apiError && <div className="bg-rose-950/30 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs">⚠️ {apiError}</div>}
      {apiConnected && <div className="text-[11px] text-emerald-400 flex items-center gap-2"><Activity className="w-3 h-3"/>Live index refresh every 5 seconds • Last update {lastUpdated}</div>}

      <div className="flex gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800">
        <button onClick={()=>setMode('stocks')} className={`flex-1 py-3 rounded-xl font-bold ${mode==='stocks'?'bg-emerald-500 text-slate-950':'text-slate-400'}`}>📈 STOCKS</button>
        <button onClick={()=>setMode('indices')} className={`flex-1 py-3 rounded-xl font-bold ${mode==='indices'?'bg-emerald-500 text-slate-950':'text-slate-400'}`}>🇮🇳 NIFTY / SENSEX</button>
      </div>

      {mode==='stocks' ? <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-3 justify-between">
            <div className="flex items-center gap-2"><Sliders className="w-5 h-5 text-emerald-400"/><b>Momentum Scanner</b></div>
            <div className="flex gap-2"><div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2"><Search className="w-4 h-4 text-slate-500"/><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Stock..." className="bg-transparent outline-none px-2 py-1 text-xs w-24"/></div><button onClick={()=>setFilterVolume(filterVolume==='high'?'all':'high')} className="px-3 py-1 text-xs rounded-lg bg-slate-800">{filterVolume==='high'?'All':'>3x Volume'}</button></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-950 text-slate-500 text-xs"><tr><th className="p-3">Stock</th><th className="p-3">LTP</th><th className="p-3">9-EMA</th><th className="p-3">VWAP</th><th className="p-3">Setup</th></tr></thead><tbody className="divide-y divide-slate-800">{filteredStocks.map(s=>{const direction=getStockDirection(s);return <tr key={s.symbol} onClick={()=>selectStock(s)} className={`cursor-pointer hover:bg-slate-800 ${selectedStock.symbol===s.symbol?'bg-emerald-950/25':''}`}><td className="p-3 font-bold">{s.symbol}<span className="block text-[10px] text-slate-500">{s.timeframe}</span></td><td className={`p-3 font-mono font-bold ${s.change>=0?'text-emerald-400':'text-rose-400'}`}>₹{money(s.price)}</td><td className="p-3 font-mono text-slate-300">₹{money(s.ema9)}</td><td className="p-3 font-mono text-amber-400">₹{money(s.vwap)}</td><td className="p-3"><span className={`font-bold text-xs ${direction==='LONG'?'text-emerald-400':direction==='SHORT'?'text-rose-400':'text-amber-400'}`}>{direction}</span></td></tr>})}</tbody></table></div>
        </div>
        <div className="lg:col-span-4 space-y-5"><SetupCard symbol={selectedStock.symbol} setup={setup} quantity={quantity}/><AnalysisCard loading={loading} onAnalyze={handleAIAnalysis} text={aiAnalysis}/></div>
      </div> : <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {indices.map(i=>{const active=selectedIndex.symbol===i.symbol;return <button key={i.symbol} onClick={()=>selectIndex(i)} className={`text-left p-5 rounded-2xl border ${active?'border-emerald-500/60 bg-emerald-950/20':'border-slate-800 bg-slate-900'}`}><div className="flex justify-between"><span className="text-lg font-bold">{i.name}</span><span className="text-xs text-slate-500">{i.exchange}</span></div><div className="text-3xl font-mono font-bold mt-5">{i.ltp?`₹${money(i.ltp)}`:'—'}</div><div className={`text-lg font-bold ${Number(i.change_pct)>=0?'text-emerald-400':'text-rose-400'}`}>{i.ltp?`${Number(i.change_pct)>=0?'+':''}${Number(i.change_pct).toFixed(2)}%`:'Live API connect करें'}</div><div className="mt-5 text-xs text-slate-400">Volume: {i.volume?Number(i.volume).toLocaleString('en-IN'):'—'}</div></button>})}
          <div className="md:col-span-2"><PriceActionPanel symbol={selectedIndexLive.symbol} data={priceAction} loading={priceActionLoading} error={priceActionError} onRefresh={()=>fetchPriceAction(selectedIndexLive.symbol)}/></div>
        </div>
        <div className="lg:col-span-4 space-y-5"><SetupCard symbol={selectedIndexLive.name} setup={setup} quantity={quantity}/><AnalysisCard loading={loading} onAnalyze={handleAIAnalysis} text={aiAnalysis}/></div>
      </div>}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-500 text-center">⚠️ Planning/analysis tool only. No automatic order placement. Always verify live price and risk with your broker before trading.</div>
    </main>
  </div>;
}

function PriceActionPanel({symbol,data,loading,error,onRefresh}){
  const score=Number(data?.score||0);
  const rawBias=String(data?.bias||'WAIT').toUpperCase();
  const verdict=score>=60||rawBias.includes('LONG')||rawBias.includes('CALL')||rawBias.includes('BULL')?'LONG':score<=-60||rawBias.includes('SHORT')||rawBias.includes('PUT')||rawBias.includes('BEAR')?'SHORT':'WAIT';
  return <div className="bg-slate-900 border-2 border-emerald-500/30 rounded-2xl p-5">
    <div className="flex justify-between items-center"><div><div className="text-xs text-emerald-400 font-bold">5-MIN PRICE ACTION</div><h3 className="text-xl font-bold mt-1">{symbol}</h3></div><button onClick={onRefresh} disabled={loading} className="p-2 rounded-lg bg-slate-800"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button></div>
    {error&&<div className="mt-3 text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-xl p-3">⚠️ {error}</div>}
    {loading&&!data?<div className="mt-5 text-sm text-slate-400">5-minute candles analyse ho rahi hain...</div>:data?<div className="mt-5 space-y-4"><div className="grid grid-cols-2 gap-3"><Metric label="Score" value={`${score}/100`} accent={verdict==='LONG'?'green':verdict==='SHORT'?'red':'amber'}/><Metric label="Final Verdict" value={verdict} accent={verdict==='LONG'?'green':verdict==='SHORT'?'red':'amber'}/><Metric label="Structure" value={data.structure||'WAIT'}/><Metric label="BOS" value={data.bos||'WAIT'}/><Metric label="Liquidity" value={data.liquidity||'WAIT'}/><Metric label="Retest" value={data.retest||'WAIT'}/></div><div className="bg-slate-950 rounded-xl p-4 text-xs text-slate-400">Golden Rule: <b className="text-slate-200">LONG only after +60 confirmation</b> • <b className="text-slate-200">SHORT only after -60 confirmation</b> • otherwise <b className="text-slate-200">WAIT</b></div></div>:<div className="mt-5 text-sm text-slate-400">NIFTY/SENSEX select karo aur 5-min analysis load hoga.</div>}
  </div>;
}

function Metric({label,value,accent}){const cls=accent==='green'?'text-emerald-400':accent==='red'?'text-rose-400':accent==='amber'?'text-amber-400':'text-slate-200';return <div className="bg-slate-950 rounded-xl p-3"><div className="text-[10px] text-slate-500 uppercase">{label}</div><div className={`mt-1 font-bold text-sm ${cls}`}>{value}</div></div>;}

function SetupCard({symbol,setup,quantity}){
  const wait=setup.direction==='WAIT';
  return <div className="bg-slate-900 border-2 border-emerald-500/30 rounded-2xl p-5 space-y-3">
    <div className="flex items-center gap-2"><Zap className="w-5 h-5 text-emerald-400"/><h3 className="font-bold">Risk-Defined Setup</h3></div>
    <div className="text-sm font-bold text-white">{symbol}</div>
    <div className={`text-center py-3 rounded-xl font-extrabold text-xl ${wait?'bg-amber-950/30 text-amber-400 border border-amber-500/20':setup.direction==='LONG'?'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20':'bg-rose-950/30 text-rose-400 border border-rose-500/20'}`}>{wait?'WAIT':setup.direction}</div>
    {wait ? <div className="bg-slate-950 p-4 rounded-xl text-sm text-amber-300">⚠️ No confirmed setup yet.<br/><span className="text-slate-400 text-xs">Entry, Stop Loss and Targets are hidden until LONG/SHORT confirmation. This prevents wrong-side levels.</span></div> : <>
      <Level label="Entry" value={setup.entry} />
      <Level label="Stop Loss" value={setup.sl} cls="text-rose-400" />
      <Level label="Target 1" value={setup.target1} cls="text-emerald-400" />
      <Level label="Target 2" value={setup.target2} cls="text-emerald-300" />
      <div className="bg-slate-950 p-3 rounded-xl flex justify-between"><span className="text-xs text-slate-400">Planned R:R</span><b>{setup.rr}</b></div>
      <div className="bg-slate-950 p-3 rounded-xl flex justify-between"><span className="text-xs text-slate-400">Qty @ 1% risk</span><b>{quantity}</b></div>
    </>}
  </div>;
}

function Level({label,value,cls=''}){return <div className="bg-slate-950 p-3 rounded-xl flex justify-between"><span className="text-xs text-slate-400">{label}</span><b className={`font-mono ${cls}`}>₹{money(value)}</b></div>;}

function AnalysisCard({loading,onAnalyze,text}){return <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><h3 className="font-bold flex items-center gap-2 mb-4"><Zap className="w-5 h-5 text-emerald-400"/>MASTER REPORT</h3><button onClick={onAnalyze} disabled={loading} className="w-full bg-emerald-500 text-slate-950 py-3 rounded-xl font-bold">{loading?'ANALYSING...':'SIGNAL CHECK'}</button><div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4 min-h-[170px] text-xs whitespace-pre-line text-slate-300">{text||'SIGNAL CHECK दबाकर current instrument का report देखें.'}</div></div>;}
