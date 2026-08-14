function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.end(JSON.stringify(body));
}

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
function structure(cs) {
  if (!cs || cs.length < 6) return { bias:'NEUTRAL', structure:'INSUFFICIENT DATA' };
  const x = cs.slice(-4);
  const highs=x.map(c=>n(c.high)), lows=x.map(c=>n(c.low));
  if (highs[3]>highs[2] && highs[2]>highs[1] && lows[3]>lows[2] && lows[2]>lows[1]) return {bias:'BULLISH',structure:'HH-HL'};
  if (highs[3]<highs[2] && highs[2]<highs[1] && lows[3]<lows[2] && lows[2]<lows[1]) return {bias:'BEARISH',structure:'LH-LL'};
  return {bias:'NEUTRAL',structure:'RANGE'};
}
function breakout(cs) {
  if (!cs || cs.length < 22) return {signal:'WAIT',volumeConfirmed:false,reason:'Insufficient candles'};
  const last=cs[cs.length-1], prev=cs[cs.length-2], r=cs.slice(-21,-1);
  const hi=Math.max(...r.map(c=>n(c.high))), lo=Math.min(...r.map(c=>n(c.low)));
  const avg=r.reduce((s,c)=>s+n(c.volume),0)/r.length, vol=n(last.volume);
  const v=avg>0 && vol>=avg*1.2;
  if(n(last.close)>hi && n(last.close)>n(prev.close)) return {signal:v?'BREAKOUT_UP':'BREAKOUT_UP_WEAK_VOLUME',volumeConfirmed:v,reason:v?'High breakout + volume':'High breakout but weak volume'};
  if(n(last.close)<lo && n(last.close)<n(prev.close)) return {signal:v?'BREAKOUT_DOWN':'BREAKOUT_DOWN_WEAK_VOLUME',volumeConfirmed:v,reason:v?'Low breakdown + volume':'Low breakdown but weak volume'};
  return {signal:'WAIT',volumeConfirmed:v,reason:'No confirmed breakout'};
}
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'GET only'});
  try {
    const base=String(req.query?.url||'');
    if(!base) return json(res,400,{ok:false,error:'url is required'});
    const r=await fetch(base,{headers:{Accept:'application/json'}}); const d=await r.json();
    if(!r.ok || !d.ok) return json(res,502,{ok:false,error:d.error||'Candle API failed'});
    const tf=d.timeframes||{}, daily=structure(tf['1D']), hourly=structure(tf['1H']), m15=breakout(tf['15M']), m5=breakout(tf['5M']);
    const long=daily.bias==='BULLISH'&&hourly.bias==='BULLISH'&&m15.signal==='BREAKOUT_UP'&&m5.signal==='BREAKOUT_UP';
    const short=daily.bias==='BEARISH'&&hourly.bias==='BEARISH'&&m15.signal==='BREAKOUT_DOWN'&&m5.signal==='BREAKOUT_DOWN';
    let verdict=long?'SWING LONG':short?'SWING SHORT':'WAIT';
    return json(res,200,{ok:true,verdict,confidence:verdict==='WAIT'?'LOW':'HIGH',timeframes:{'1D':daily,'1H':hourly,'15M':m15,'5M':m5},rule:'Daily + 1H alignment, 15M breakout, 5M confirmation'});
  } catch(e){ return json(res,500,{ok:false,error:e.message||'Swing signal failed'}); }
}
