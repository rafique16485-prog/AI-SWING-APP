import fs from 'node:fs';

const path = 'src/SwingProApp.jsx';
let src = fs.readFileSync(path, 'utf8');

const start = src.indexOf('function Watchlist(');
const end = src.indexOf('function MtfBox(', start);

if (start !== -1 && end !== -1) {
  const watchlist = `function Watchlist({rows}){const[items,setItems]=useState(()=>{try{return JSON.parse(localStorage.getItem('swingpro_watchlist')||'[]')}catch{return[]}}),[input,setInput]=useState('');useEffect(()=>{localStorage.setItem('swingpro_watchlist',JSON.stringify(items))},[items]);const add=()=>{const s=input.trim().toUpperCase();if(s&&!items.includes(s))setItems([...items,s]);setInput('')};const data=items.map(sym=>rows.find(x=>x.symbol===sym)||{symbol:sym,score:0,setup:'WAIT',actionable:false,vol:0,rr:'—',reason:'Waiting for scanner data'});return <div className="space-y-3"><div className="rounded-2xl bg-[#0d1b2f] border border-slate-700 p-4"><div className="text-[9px] text-blue-400 font-black">⭐ PERSONAL WATCHLIST</div><h2 className="text-2xl font-black mt-1">Watchlist</h2><p className="text-[9px] text-slate-400 mt-1">Saved stocks • refreshed with every market scan</p><div className="flex gap-2 mt-3"><input value={input} onChange={e=>setInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Enter NSE stock e.g. KOTAKBANK" className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-xs font-bold outline-none"/><button onClick={add} className="bg-[#0b3270] rounded-xl px-4 text-[10px] font-black">ADD</button></div></div>{items.length===0?<div className="rounded-2xl bg-amber-950/40 border border-amber-900 p-5 text-center text-amber-300 text-sm">No stocks saved yet.<div className="text-[10px] mt-2 text-slate-400">Add a stock above. Its score and setup will update after each scan.</div></div>:<div className="space-y-2.5">{data.map(s=>{const bull=s.actionable,bear=s.score<45;return <div key={s.symbol} className="rounded-2xl bg-[#0d1b2f] border border-slate-700 p-3.5"><div className="flex justify-between items-start"><div><div className="flex items-center gap-2"><b className="text-base">{s.symbol}</b><fl type={bull?'green':bear?'red':'yellow'}>{bull?'BUY CANDIDATE':bear?'AVOID':'WAIT'}</fl></div><div className="text-[9px] text-slate-500 mt-1">{s.setup||'WAIT'} • Vol {s.vol||0}x • 2–4 days</div></div><div className={'text-2xl font-black '+(bull?'text-emerald-400':bear?'text-red-400':'text-amber-400')}>{s.score||0}<span className="text-[8px] text-slate-500">/100</span></div></div><div className="grid grid-cols-3 gap-1.5 mt-3"><L label="Entry" value={bull?'₹'+s.entry:'—'}/><L label="SL" value={bull?'₹'+ke(s.sl):'—'} tone="red"/><L label="T1" value={bull?'₹'+ke(s.t1):'—'} tone="green"/></div><div className="grid grid-cols-2 gap-1.5 mt-1.5"><L label="R:R" value={bull?s.rr:'—'} tone="yellow"/><L label="STATUS" value={rows.find(x=>x.symbol===s.symbol)?'SCANNED':'NOT IN CURRENT SCAN'}/></div><div className="text-[9px] mt-2 text-slate-300">⚡ {s.reason}</div><div className="flex gap-2 mt-2"><button onClick={()=>fc(s)} className="flex-1 bg-[#25D366] text-white rounded-lg py-2.5 text-[9px] font-black">WHATSAPP SHARE</button><button onClick={()=>setItems(items.filter(x=>x!==s.symbol))} className="px-4 bg-slate-800 border border-slate-700 rounded-lg text-[9px] font-black">REMOVE</button></div></div>})}</div>}</div>}`;
  src = src.slice(0, start) + watchlist + src.slice(end);
}

if (!src.includes("a==='watchlist'&&c.jsx(Watchlist,{rows:e})")) {
  // Current app already contains the watchlist render in the main JSX in normal builds.
  // If it is absent, inject a simple render before the main closing tag.
  const marker = '</main>';
  const pos = src.lastIndexOf(marker);
  if (pos !== -1) src = src.slice(0, pos) + "{a==='watchlist'&&<Watchlist rows={e}/>}" + src.slice(pos);
}

fs.writeFileSync(path, src);
console.log('Watchlist build repair applied');
