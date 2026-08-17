import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Sliders, Zap, RefreshCw, Database, Wifi, Search, BarChart3, Activity } from 'lucide-react';

const INDEX_START = [
  { symbol:'NIFTY50', name:'NIFTY 50', ltp:0, change_pct:0, volume:0, exchange:'NSE' },
  { symbol:'SENSEX', name:'SENSEX', ltp:0, change_pct:0, volume:0, exchange:'BSE' }
];
const money = n => Number(n || 0).toLocaleString('en-IN',{maximumFractionDigits:2});

function buildSetup(price, direction, riskPct = 0.5) {
  const p = Number(price || 0);
  if (!p || direction === 'WAIT') return { direction:'WAIT', entry:0, sl:0, target1:0, target2:0, rr:'—' };
  const risk = p * (riskPct / 100);
  if (direction === 'LONG') return { direction, entry:p, sl:Number((p-risk).toFixed(2)), target1:Number((p+risk*2).toFixed(2)), target2:Number((p+risk*3).toFixed(2)), rr:'1 : 2' };
  return { direction, entry:p, sl:Number((p+risk).toFixed(2)), target1:Number((p-risk*2).toFixed(2)), target2:Number((p-risk*3).toFixed(2)), rr:'1 : 2' };
}

function getStockDirection(stock) {
  if (!stock) return 'WAIT';
  const above = Number(stock.price) > Number(stock.resistance || 0) && Number(stock.momentum || stock.change || 0) > 0;
  const below = Number(stock.price) < Number(stock.support || 0) && Number(stock.momentum || stock.change || 0) < 0;
  if (above) return 'LONG';
  if (below) return 'SHORT';
  return 'WAIT';
}

export default function App(){
  const [stocks,setStocks] = useState([]);
  const [indices,setIndices] = useState(INDEX_START);
  const [mode,setMode] = useState('indices');
  const [selectedStock,setSelectedStock] = useState(null);
  const [selectedIndex,setSelectedIndex] = useState(INDEX_START[0]);
  const [searchQuery,setSearchQuery] = useState('');
  const [filterVolume,setFilterVolume] = useState('all');
  const [apiConnected,setApiConnected] = useState(false);
  const [connecting,setConnecting] = useState(false);
  const [apiError,setApiError] = useState('');
  const [lastUpdated,setLastUpdated] = useState('');
  const [snapshotUpdated,setSnapshotUpdated] = useState('');
  const [aiAnalysis,setAiAnalysis] = useState('');
  const [loading,setLoading] = useState(false);
  const [priceAction,setPriceAction] = useState(null);
  const [priceActionLoading,setPriceActionLoading] = useState(false);
  const [priceActionError,setPriceActionError] = useState('');
  const [capital] = useState(5000);
  const [riskPercent] = useState(1);

  const fetchSnapshot = async () => {
    try {
      setApiError('');
      const res = await fetch(`/market_data.json?t=${Date.now()}`, {cache:'no-store'});
      if (!res.ok) throw new Error(`Snapshot HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.stocks) ? data.stocks : [];
      const mapped = rows.map(x => ({
        symbol:x.s || x.n,
        name:x.n || x.s,
        price:Number(x.p || 0),
        change:Number(x.m || 0),
        volume:Number(x.v || 0),
        momentum:Number(x.b || 0),
        score:Number(x.score || 0),
        setup:x.setup || x.status || 'WATCH',
        status:x.status || 'WATCH',
        resistance:Number(x.res || 0),
        support:Number(x.sup || 0),
        target1:Number(x.target1 || 0),
        target2:Number(x.target2 || 0),
        ret20:Number(x.ret20 || 0),
        risk_pct:Number(x.risk_pct || 0),
        rr1:Number(x.rr1 || 0),
        rr2:Number(x.rr2 || 0),
        retest_hold:Boolean(x.retest_hold),
        no_chase:Boolean(x.no_chase)
      }));
      setStocks(mapped);
      if (!selectedStock && mapped.length) setSelectedStock(mapped[0]);
      setSnapshotUpdated(data.updated_utc || '');
      return true;
    } catch (err) {
      setApiError(err.message || 'Swing snapshot unavailable');
      return false;
    }
  };

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
      setPriceActionLoading(true); setPriceActionError('');
      const res = await fetch(`/api/price-action?symbol=${encodeURIComponent(symbol)}&t=${Date.now()}`,{cache:'no-store'});
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Price action API failed');
      setPriceAction(data.analysis || null);
    } catch (err) { setPriceAction(null); setPriceActionError(err.message || '5-minute data unavailable'); }
    finally { setPriceActionLoading(false); }
  };

  useEffect(() => {
    fetchSnapshot();
    const timer = setInterval(fetchSnapshot, 60000);
    return () => clearInterval(timer);
  },[]);

  useEffect(() => {
    if (!apiConnected) return;
    fetchLiveIndices();
    const timer = setInterval(fetchLiveIndices,5000);
    return () => clearInterval(timer);
  },[apiConnected]);

  const toggleApiConnection = async () => {
    if (apiConnected) { setApiConnected(false); return; }
    setConnecting(true); const ok = await fetchLiveIndices(); setConnecting(false); if (ok) setApiConnected(true);
  };

  const selectedIndexLive = useMemo(() => indices.find(i => i.symbol === selectedIndex.symbol) || selectedIndex,[indices,selectedIndex.symbol]);
  const indexDirection = useMemo(() => {
    if (!priceAction) return 'WAIT';
    const score = Number(priceAction.score || 0);
    return score >= 60 ? 'LONG' : score <= -60 ? 'SHORT' : 'WAIT';
  },[priceAction]);
  const stockDirection = mode === 'stocks' ? getStockDirection(selectedStock) : 'WAIT';
  const setup = useMemo(() => mode === 'indices' ? buildSetup(selectedIndexLive.ltp,indexDirection,0.5) : buildSetup(selectedStock?.price,stockDirection,0.5),[mode,selectedIndexLive,selectedStock,stockDirection,indexDirection]);
  const quantity = useMemo(() => {
    if (setup.direction === 'WAIT' || !setup.entry || !setup.sl) return 0;
    const riskAmount = capital * riskPercent / 100;
    const unitRisk = Math.abs(setup.entry - setup.sl);
    return unitRisk > 0 ? Math.floor(riskAmount / unitRisk) : 0;
  },[capital,riskPercent,setup]);

  const filteredStocks = stocks.filter(s => {
    const q = String(s.symbol).toLowerCase().includes(searchQuery.toLowerCase());
    const v = Number(s.volume || 0);
    return q && (filterVolume==='all' || (filterVolume==='high'&&v>=3) || (filterVolume==='medium'&&v>=1.5&&v<3));
  });

  const selectStock = stock => { setMode('stocks'); setSelectedStock(stock); setAiAnalysis(''); };
  const selectIndex = index => { setMode('indices'); setSelectedIndex(index); setAiAnalysis(''); setPriceAction(null); if (index.ltp) fetchPriceAction(index.symbol); };

  const handleAIAnalysis = () => {
    setLoading(true); setAiAnalysis('');
    setTimeout(() => {
      if (mode === 'indices') {
        const i = selectedIndexLive; const score = Number(priceAction?.score || 0);
        setAiAnalysis(`🤖 ${i.name} MASTER REPORT\n\nLTP: ₹${money(i.ltp)}\n5-Min Score: ${score}\nStructure: ${priceAction?.structure || 'WAIT'}\nBOS: ${priceAction?.bos || 'WAIT'}\nLiquidity: ${priceAction?.liquidity || 'WAIT'}\nRetest: ${priceAction?.retest || 'WAIT'}\n\nFINAL VERDICT: ${indexDirection}\n\n${indexDirection==='WAIT'?'⚠️ No confirmed setup. WAIT.':'✅ Setup confirmed. Verify price action before execution.'}`);
      } else {
        const s=selectedStock;
        setAiAnalysis(`🤖 ${s?.symbol || 'STOCK'} MASTER REPORT\n\nLTP: ₹${money(s?.price)}\nMomentum: ${Number(s?.momentum||0).toFixed(2)}%\nScore: ${s?.score || 0}\nSetup: ${s?.setup || 'WATCH'}\nResistance: ₹${money(s?.resistance)}\nSupport: ₹${money(s?.support)}\n\nFINAL VERDICT: ${stockDirection}\n\n${stockDirection==='WAIT'?'⚠️ Confirmation required. No chase.':'⚠️ Candidate only — verify live price action before trade.'}`);
      }
      setLoading(false);
    },300);
  };

  return <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
    <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-50"><div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-3"><div className="flex items-center gap-3"><div className="bg-emerald-500/15 p-2 rounded-xl border border-emerald-500/30"><TrendingUp className="w-8 h-8 text-emerald-400"/></div><div><h1 className="text-xl sm:text-2xl font-bold text-white">SWING HUNTER <span className="text-emerald-400">AI</span></h1><p className="text-xs text-slate-400">Live Snapshot • NIFTY 50 • SENSEX • 5-Min Price Action</p></div></div><button onClick={toggleApiConnection} disabled={connecting} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${apiConnected?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':connecting?'bg-amber-500/20 text-amber-400 border border-amber-500/30':'bg-slate-800 text-slate-200 border border-slate-700'}`}>{connecting?<RefreshCw className="w-4 h-4 animate-spin"/>:apiConnected?<Wifi className="w-4 h-4"/>:<Database className="w-4 h-4"/>}{connecting?'Connecting...':apiConnected?'LIVE UPSTOX':'Connect Live API'}</button></div></header>
    <main className="max-w-7xl mx-auto px-4 py-5 space-y-5">
      <div className="grid grid-cols-2 gap-3">{indices.map(i=><button key={i.symbol} onClick={()=>selectIndex(i)} className={`text-left p-4 rounded-2xl border ${mode==='indices'&&selectedIndex.symbol===i.symbol?'border-emerald-500/60 bg-emerald-950/30':'border-slate-800 bg-slate-900'}`}><div className="flex justify-between"><span className="font-bold">{i.name}</span><BarChart3 className="w-4 h-4 text-slate-500"/></div><div className="mt-2 text-2xl font-mono font-bold">{i.ltp?`₹${money(i.ltp)}`:'—'}</div><div className={`text-sm font-bold ${Number(i.change_pct)>=0?'text-emerald-400':'text-rose-400'}`}>{i.ltp?`${Number(i.change_pct)>=0?'+':''}${Number(i.change_pct).toFixed(2)}%`:'Connect API'}</div><div className="text-[10px] text-slate-500 mt-1">{i.exchange} • LIVE</div></button>)}</div>
      {apiError&&<div className="bg-rose-950/30 border border-rose-500/30 text-rose-300 rounded-xl p-3 text-xs">⚠️ {apiError}</div>}
      <div className="text-[11px] text-slate-500">Swing snapshot: {snapshotUpdated ? new Date(snapshotUpdated).toLocaleString('en-IN') : 'loading...'} {apiConnected && <>• Upstox live: {lastUpdated}</>}</div>
      <div className="flex gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800"><button onClick={()=>setMode('stocks')} className={`flex-1 py-3 rounded-xl font-bold ${mode==='stocks'?'bg-emerald-500 text-slate-950':'text-slate-400'}`}>📈 LIVE CANDIDATES</button><button onClick={()=>setMode('indices')} className={`flex-1 py-3 rounded-xl font-bold ${mode==='indices'?'bg-emerald-500 text-slate-950':'text-slate-400'}`}>🇮🇳 NIFTY / SENSEX</button></div>
      {mode==='stocks' ? <div className="grid grid-cols-1 lg:grid-cols-12 gap-5"><div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden"><div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-3 justify-between"><div className="flex items-center gap-2"><Sliders className="w-5 h-5 text-emerald-400"/><b>Live Swing Radar • {stocks.length} candidates</b></div><div className="flex gap-2"><div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2"><Search className="w-4 h-4 text-slate-500"/><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Stock..." className="bg-transparent outline-none px-2 py-1 text-xs w-24"/></div><button onClick={()=>setFilterVolume(filterVolume==='high'?'all':'high')} className="px-3 py-1 text-xs rounded-lg bg-slate-800">{filterVolume==='high'?'All':'>3x Volume'}</button></div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-950 text-slate-500 text-xs"><tr><th className="p-3">Stock</th><th className="p-3">LTP</th><th className="p-3">Move</th><th className="p-3">Vol</th><th className="p-3">Score</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-slate-800">{filteredStocks.map(s=><tr key={s.symbol} onClick={()=>selectStock(s)} className={`cursor-pointer hover:bg-slate-800 ${selectedStock?.symbol===s.symbol?'bg-emerald-950/25':''}`}><td className="p-3 font-bold">{s.symbol}</td><td className="p-3 font-mono">₹{money(s.price)}</td><td className={`p-3 font-bold ${s.change>=0?'text-emerald-400':'text-rose-400'}`}>{s.change>=0?'+':''}{s.change.toFixed(2)}%</td><td className="p-3">{s.volume.toFixed(2)}x</td><td className="p-3 font-bold text-emerald-400">{s.score}</td><td className="p-3 text-xs">{s.status}</td></tr>)}</tbody></table></div></div><div className="lg:col-span-4 space-y-5"><SetupCard symbol={selectedStock?.symbol||'—'} setup={setup} quantity={quantity} stock={selectedStock}/><AnalysisCard loading={loading} onAnalyze={handleAIAnalysis} text={aiAnalysis}/></div></div> : <div className="grid grid-cols-1 lg:grid-cols-12 gap-5"><div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">{indices.map(i=>{const active=selectedIndex.symbol===i.symbol;return <button key={i.symbol} onClick={()=>selectIndex(i)} className={`text-left p-5 rounded-2xl border ${active?'border-emerald-500/60 bg-emerald-950/20':'border-slate-800 bg-slate-900'}`}><div className="flex justify-between"><span className="text-lg font-bold">{i.name}</span><span className="text-xs text-slate-500">{i.exchange}</span></div><div className="text-3xl font-mono font-bold mt-5">{i.ltp?`₹${money(i.ltp)}`:'—'}</div><div className={`text-lg font-bold ${Number(i.change_pct)>=0?'text-emerald-400':'text-rose-400'}`}>{i.ltp?`${Number(i.change_pct)>=0?'+':''}${Number(i.change_pct).toFixed(2)}%`:'Live API connect करें'}</div><div className="mt-5 text-xs text-slate-400">Volume: {i.volume?Number(i.volume).toLocaleString('en-IN'):'—'}</div></button>})}<div className="md:col-span-2"><PriceActionPanel symbol={selectedIndexLive.symbol} data={priceAction} loading={priceActionLoading} error={priceActionError} onRefresh={()=>fetchPriceAction(selectedIndexLive.symbol)}/></div></div><div className="lg:col-span-4 space-y-5"><SetupCard symbol={selectedIndexLive.name} setup={setup} quantity={quantity}/><AnalysisCard loading={loading} onAnalyze={handleAIAnalysis} text={aiAnalysis}/></div></div>}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-500 text-center">⚠️ Analysis/planning tool only. No automatic order placement. Verify live price action, liquidity, support/resistance and risk with your broker.</div>
    </main>
  </div>;
}

function PriceActionPanel({symbol,data,loading,error,onRefresh}){const score=Number(data?.score||0);const verdict=score>=60?'LONG':score<=-60?'SHORT':'WAIT';return <div className="bg-slate-900 border-2 border-emerald-500/30 rounded-2xl p-5"><div className="flex justify-between items-center"><div><div className="text-xs text-emerald-400 font-bold">5-MIN PRICE ACTION • V4</div><h3 className="text-xl font-bold mt-1">{symbol}</h3></div><button onClick={onRefresh} disabled={loading} className="p-2 rounded-lg bg-slate-800"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button></div>{error&&<div className="mt-3 text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-xl p-3">⚠️ {error}</div>}{loading&&!data?<div className="mt-5 text-sm text-slate-400">5-minute candles analyse ho rahi hain...</div>:data?<div className="mt-5 space-y-4"><div className="grid grid-cols-2 gap-3"><Metric label="Score" value={`${score}/100`} accent={verdict==='LONG'?'green':verdict==='SHORT'?'red':'amber'}/><Metric label="Verdict" value={verdict} accent={verdict==='LONG'?'green':verdict==='SHORT'?'red':'amber'}/><Metric label="Structure" value={data.structure||'WAIT'}/><Metric label="BOS" value={data.bos||'WAIT'}/><Metric label="Liquidity" value={data.liquidity||'WAIT'}/><Metric label="Retest" value={data.retest||'WAIT'}/></div><div className="bg-slate-950 rounded-xl p-4 text-xs text-slate-400">Golden Rule: <b className="text-slate-200">+60 LONG</b> • <b className="text-slate-200">-60 SHORT</b> • otherwise <b className="text-slate-200">WAIT</b></div></div>:<div className="mt-5 text-sm text-slate-400">Connect Live API and select NIFTY/SENSEX.</div>}</div>}
function Metric({label,value,accent}){const cls=accent==='green'?'text-emerald-400':accent==='red'?'text-rose-400':accent==='amber'?'text-amber-400':'text-slate-200';return <div className="bg-slate-950 rounded-xl p-3"><div className="text-[10px] text-slate-500 uppercase">{label}</div><div className={`mt-1 font-bold text-sm ${cls}`}>{value}</div></div>}
function SetupCard({symbol,setup,quantity,stock}){const wait=setup.direction==='WAIT';return <div className="bg-slate-900 border-2 border-emerald-500/30 rounded-2xl p-5 space-y-3"><div className="flex items-center gap-2"><Zap className="w-5 h-5 text-emerald-400"/><h3 className="font-bold">Risk-Defined Setup</h3></div><div className="text-sm font-bold text-white">{symbol}</div>{stock&&<div className="text-xs text-slate-400">Score {stock.score} • {stock.setup}</div>}<div className={`text-center py-3 rounded-xl font-extrabold text-xl ${wait?'bg-amber-950/30 text-amber-400 border border-amber-500/20':setup.direction==='LONG'?'bg-emerald-950/30 text-emerald-400 border border-emerald-500/20':'bg-rose-950/30 text-rose-400 border border-rose-500/20'}`}>{wait?'WAIT':setup.direction}</div>{wait?<div className="bg-slate-950 p-4 rounded-xl text-sm text-amber-300">⚠️ No confirmed setup yet.<br/><span className="text-slate-400 text-xs">Entry, Stop Loss and Targets stay hidden until confirmation.</span></div>:<><Level label="Entry" value={setup.entry}/><Level label="Stop Loss" value={setup.sl} cls="text-rose-400"/><Level label="Target 1" value={setup.target1} cls="text-emerald-400"/><Level label="Target 2" value={setup.target2} cls="text-emerald-300"/><div className="bg-slate-950 p-3 rounded-xl flex justify-between"><span className="text-xs text-slate-400">Planned R:R</span><b>{setup.rr}</b></div><div className="bg-slate-950 p-3 rounded-xl flex justify-between"><span className="text-xs text-slate-400">Qty @ 1% risk</span><b>{quantity}</b></div></>}</div>}
function Level({label,value,cls=''}){return <div className="bg-slate-950 p-3 rounded-xl flex justify-between"><span className="text-xs text-slate-400">{label}</span><b className={`font-mono ${cls}`}>₹{money(value)}</b></div>}
function AnalysisCard({loading,onAnalyze,text}){return <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><h3 className="font-bold flex items-center gap-2 mb-4"><Zap className="w-5 h-5 text-emerald-400"/>MASTER REPORT</h3><button onClick={onAnalyze} disabled={loading} className="w-full bg-emerald-500 text-slate-950 py-3 rounded-xl font-bold">{loading?'ANALYSING...':'SIGNAL CHECK'}</button><div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4 min-h-[170px] text-xs whitespace-pre-line text-slate-300">{text||'SIGNAL CHECK दबाकर current data ka report देखें.'}</div></div>}
