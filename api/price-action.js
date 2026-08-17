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
  const r = await fetch(`${UPSTOX_BASE}${path}`, {headers:{Accept:'application/json',Authorization:`Bearer ${token}`} });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(`Upstox ${r.status}: ${JSON.stringify(data)}`);
  return data;
}
function clean(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
async function resolveIndex(symbol){
  const isSensex=symbol==='SENSEX'; const exchange=isSensex?'BSE':'NSE'; const query=isSensex?'SENSEX':'NIFTY';
  const data=await upstox(`/v2/instruments/search?query=${encodeURIComponent(query)}&exchanges=${exchange}&segments=INDEX&page_number=1&records=20`);
  const rows=Array.isArray(data?.data)?data.data:[];
  const exact=rows.find(x=>clean(x.trading_symbol)===clean(symbol)||clean(x.short_name)===clean(symbol)||clean(x.name)===clean(symbol));
  const preferred=exact||rows.find(x=>clean(x.trading_symbol).includes(clean(symbol))||clean(x.name).includes(clean(symbol)));
  return preferred?{symbol,instrument_key:preferred.instrument_key,trading_symbol:preferred.trading_symbol,name:preferred.name,exchange}:null;
}

// Uses the latest CLOSED 5-minute candle, not a partial live candle.
function analyzeCandles(candles){
  const rows=candles.slice().reverse();
  if(rows.length<12)return{score:0,bias:'WAIT',structure:'INSUFFICIENT DATA',bos:'WAIT',choch:'WAIT',liquidity:'WAIT',retest:'WAIT',volume:0};
  const closed=rows.slice(0,-1); // last Upstox candle can still be forming
  const last=closed[closed.length-1],prev=closed[closed.length-2];
  const lookback=closed.slice(-6,-1),prior=closed.slice(-11,-6);
  const open=Number(last[1]),high=Number(last[2]),low=Number(last[3]),close=Number(last[4]);
  const prevClose=Number(prev[4]),volume=Number(last[5]||0),prevVolume=Number(prev[5]||0);
  const range=Math.max(high-low,0.0001),body=Math.abs(close-open);
  const refHigh=Math.max(...lookback.map(c=>Number(c[2]))),refLow=Math.min(...lookback.map(c=>Number(c[3])));
  const priorHigh=prior.length?Math.max(...prior.map(c=>Number(c[2]))):refHigh;
  const priorLow=prior.length?Math.min(...prior.map(c=>Number(c[3]))):refLow;
  const bullish=close>prevClose,bearish=close<prevClose,brokeUp=close>refHigh,brokeDown=close<refLow;
  const structure=brokeUp?'BULLISH HH/HL':brokeDown?'BEARISH LH/LL':bullish?'BULLISH':'BEARISH';
  const bos=close>priorHigh?'BULLISH BOS':close<priorLow?'BEARISH BOS':'NO BOS';
  const choch=close>priorHigh&&prevClose<=priorHigh?'BULLISH CHOCH':close<priorLow&&prevClose>=priorLow?'BEARISH CHOCH':'NO CHOCH';
  const liquidity=high>refHigh&&close<refHigh?'BUY-SIDE SWEEP':low<refLow&&close>refLow?'SELL-SIDE SWEEP':'NO CLEAR SWEEP';
  const retest=brokeUp&&low<=refHigh&&close>refHigh?'BULLISH RETEST':brokeDown&&high>=refLow&&close<refLow?'BEARISH RETEST':'WAIT';
  let score=0;
  if(structure.includes('BULLISH'))score+=20;if(structure.includes('BEARISH'))score-=20;
  if(bos==='BULLISH BOS')score+=20;if(bos==='BEARISH BOS')score-=20;
  if(choch==='BULLISH CHOCH')score+=10;if(choch==='BEARISH CHOCH')score-=10;
  if(retest==='BULLISH RETEST')score+=20;if(retest==='BEARISH RETEST')score-=20;
  if(liquidity==='SELL-SIDE SWEEP')score+=15;if(liquidity==='BUY-SIDE SWEEP')score-=15;
  if(body/range>=0.6)score+=bullish?10:-10;
  if(prevVolume>0&&volume>prevVolume*1.5)score+=bullish?10:-10;
  score=Math.max(-100,Math.min(100,score));
  const bias=score>=60?'CALL / LONG WATCH':score<=-60?'PUT / SHORT WATCH':'WAIT';
  return{score,bias,structure,bos,choch,liquidity,retest,close,open,high,low,volume,prev_volume:prevVolume,candle_time:last[0],candle_status:'LATEST CLOSED 5M'};
}
export default async function handler(req,res){
  if(req.method==='OPTIONS')return json(res,204,{}); if(req.method!=='GET')return json(res,405,{error:'GET only'});
  try{
    const symbol=String(req.query?.symbol||'NIFTY50').toUpperCase(); if(!['NIFTY50','SENSEX'].includes(symbol))return json(res,400,{error:'Use NIFTY50 or SENSEX'});
    const instrument=await resolveIndex(symbol); if(!instrument)return json(res,404,{error:`${symbol} instrument not resolved`});
    const now=new Date(),to=now.toISOString().slice(0,10),fromDate=new Date(now.getTime()-2*86400000).toISOString().slice(0,10);
    const data=await upstox(`/v3/historical-candle/${encodeURIComponent(instrument.instrument_key)}/minutes/5/${to}/${fromDate}`);
    const candles=Array.isArray(data?.data?.candles)?data.data.candles:[];
    return json(res,200,{ok:true,engine_version:'V4-PRICE-ACTION-5M-CLOSED-CANDLE',symbol,name:instrument.name,exchange:instrument.exchange,timeframe:'5m',candles:candles.slice(0,30),analysis:analyzeCandles(candles),updated_at_utc:new Date().toISOString()});
  }catch(error){return json(res,500,{ok:false,error:error?.message||'Price action request failed'});}
}
