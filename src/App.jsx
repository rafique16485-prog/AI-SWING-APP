import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Search, Activity, ShieldAlert, Zap, Sliders, Award, 
  RefreshCw, ArrowUpRight, Percent, BookOpen, Info, Clock, Calendar, Compass, Database, Wifi
} from 'lucide-react';

// डेटा में 9-EMA और VWAP जोड़ा गया है
const INITIAL_STOCKS = [
  { symbol: "TATASTEEL", name: "Tata Steel Ltd.", price: 174.50, change: 4.82, volume: "3.8x", rsi: 68, ema9: 168.20, vwap: 171.10, pattern: "Resistance Breakout", timeframe: "Daily", holdingPeriod: "5-10 Days" },
  { symbol: "RELIANCE", name: "Reliance Industries", price: 2945.10, change: 3.15, volume: "2.4x", rsi: 62, ema9: 2910.50, vwap: 2930.00, pattern: "Double Bottom", timeframe: "4-Hour", holdingPeriod: "10-15 Days" },
  { symbol: "INFY", name: "Infosys Ltd.", price: 1532.00, change: -0.45, volume: "0.8x", rsi: 48, ema9: 1545.00, vwap: 1538.50, pattern: "Consolidation", timeframe: "Daily", holdingPeriod: "N/A" },
  { symbol: "SBIN", name: "State Bank of India", price: 842.30, change: 5.60, volume: "4.1x", rsi: 72, ema9: 815.40, vwap: 830.20, pattern: "Multi-Year Breakout", timeframe: "Daily", holdingPeriod: "8-12 Days" },
  { symbol: "TATOMOTORS", name: "Tata Motors Ltd.", price: 988.40, change: 2.80, volume: "1.9x", rsi: 59, ema9: 975.00, vwap: 982.10, pattern: "Flag Breakout", timeframe: "4-Hour", holdingPeriod: "4-7 Days" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", price: 1610.20, change: 1.10, volume: "1.2x", rsi: 54, ema9: 1605.00, vwap: 1612.50, pattern: "Channel Resistance", timeframe: "4-Hour", holdingPeriod: "6-12 Days" },
  { symbol: "ITC", name: "ITC Ltd.", price: 432.15, change: 3.90, volume: "3.2x", rsi: 65, ema9: 420.50, vwap: 428.00, pattern: "Cup & Handle", timeframe: "Daily", holdingPeriod: "10-18 Days" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", price: 1420.00, change: 6.25, volume: "5.0x", rsi: 78, ema9: 1380.00, vwap: 1405.50, pattern: "All-Time High", timeframe: "Daily", holdingPeriod: "5-10 Days" }
];

export default function App() {
  const [stocks, setStocks] = useState(INITIAL_STOCKS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState(INITIAL_STOCKS[0]);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [filterVolume, setFilterVolume] = useState("all");
  
  // API कनेक्शन स्टेट्स
  const [apiConnected, setApiConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  
  const [capital, setCapital] = useState(100000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [calcEntry, setCalcEntry] = useState(174.50);
  const [calcSL, setCalcSL] = useState(165.75);
  const [calcTarget1, setCalcTarget1] = useState(192.00);
  const [quantity, setQuantity] = useState(0);

  // लाइव डेटा सिमुलेशन / API ब्रिज
  useEffect(() => {
    let interval;
    if (apiConnected) {
      // यह असली API (जैसे WebSockets) का सिमुलेशन है
      interval = setInterval(() => {
        setStocks(prevStocks => 
          prevStocks.map(stock => {
            const priceChange = (Math.random() * 0.8 - 0.4); 
            const newPrice = Number((stock.price * (1 + priceChange / 100)).toFixed(2));
            const newChange = Number((stock.change + priceChange).toFixed(2));
            
            // VWAP और 9-EMA भी प्राइस के साथ थोड़ा मूव करेंगे
            const newVwap = Number((stock.vwap + (newPrice - stock.price) * 0.3).toFixed(2));
            
            if (selectedStock && stock.symbol === selectedStock.symbol) {
              updateTradeLevels(newPrice);
            }
            return { ...stock, price: newPrice, change: newChange, vwap: newVwap };
          })
        );
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [apiConnected, selectedStock]);

  const toggleApiConnection = () => {
    if (!apiConnected) {
      setConnecting(true);
      setTimeout(() => {
        setConnecting(false);
        setApiConnected(true);
      }, 1500);
    } else {
      setApiConnected(false);
    }
  };

  const updateTradeLevels = (price) => {
    setCalcEntry(price);
    setCalcSL(Number((price * 0.95).toFixed(2)));
    setCalcTarget1(Number((price * 1.10).toFixed(2)));
  };

  useEffect(() => {
    const riskAmt = (capital * riskPercent) / 100;
    const perShareRisk = calcEntry - calcSL;
    if (perShareRisk > 0 && calcEntry > 0) {
      setQuantity(Math.floor(riskAmt / perShareRisk));
    } else {
      setQuantity(0);
    }
  }, [capital, riskPercent, calcEntry, calcSL]);

  const filteredStocks = stocks.filter(stock => {
    const matchesSearch = stock.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const volNum = parseFloat(stock.volume);
    const matchesVolume = filterVolume === "all" || (filterVolume === "high" && volNum >= 3.0) || (filterVolume === "medium" && volNum >= 1.5 && volNum < 3.0);
    return matchesSearch && matchesVolume;
  });

  const selectForAnalysis = (stock) => {
    setSelectedStock(stock);
    updateTradeLevels(stock.price);
    setAiAnalysis("");
  };

  const handleAIAnalysis = async () => {
    if (!selectedStock) return;
    setLoading(true);
    setAiAnalysis("");
    
    // API Key की आवश्यकता नहीं है, सिमुलेटेड रिस्पॉन्स फास्ट स्पीड के लिए
    setTimeout(() => {
      const isBullish = selectedStock.price > selectedStock.vwap && selectedStock.price > selectedStock.ema9;
      setAiAnalysis(`🤖 **AI मास्टर स्नाइपर एनालिसिस: ${selectedStock.symbol}**\n\n` +
        `📊 **मोमेंटम चेक:**\n` +
        `• **9-EMA (${selectedStock.ema9}):** प्राइस 9-EMA के ${selectedStock.price > selectedStock.ema9 ? 'ऊपर (Bullish ✅)' : 'नीचे (Bearish ❌)'} है।\n` +
        `• **VWAP (${selectedStock.vwap}):** प्राइस VWAP के ${selectedStock.price > selectedStock.vwap ? 'ऊपर है (संस्थागत खरीद ✅)' : 'नीचे है ❌'}।\n\n` +
        `🎯 **ट्रेड सेटअप:**\n` +
        `${isBullish ? 'स्टॉक में बहुत मजबूत मोमेंटम है। 9-EMA और VWAP दोनों का सपोर्ट मिल रहा है। ' : 'अभी एंट्री न लें। स्टॉक VWAP या 9-EMA के पास रेजिस्टेंस ले रहा है। पुलबैक का इंतज़ार करें। '}` +
        `ऑटो-कैलकुलेटेड रिस्क-रिवॉर्ड 1:2 के साथ स्टॉप-लॉस को स्ट्रिक्ट रखें।`
      );
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-900">
      
      {/* हेडर */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/15 p-2 rounded-xl border border-emerald-500/30">
              <TrendingUp className="w-8 h-8 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                मास्टर स्नाइपर <span className="text-emerald-400">स्कैनर</span>
              </h1>
              <p className="text-xs text-slate-400">9-EMA + VWAP मोमेंटम ट्रैकर</p>
            </div>
          </div>
          
          {/* API कनेक्शन बटन */}
          <button 
            onClick={toggleApiConnection}
            disabled={connecting}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${apiConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : connecting ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
          >
            {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : apiConnected ? <Wifi className="w-4 h-4" /> : <Database className="w-4 h-4" />}
            {connecting ? "Connecting Broker..." : apiConnected ? "Live API Connected" : "Connect Live API"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* बायां हिस्सा: स्टॉक लिस्ट */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h3 className="font-bold text-white flex items-center gap-2"><Sliders className="w-5 h-5 text-emerald-400" /> मोमेंटम स्कैन (VWAP + EMA)</h3>
              <div className="flex gap-2">
                <button onClick={() => setFilterVolume("all")} className={`px-3 py-1 text-xs rounded-lg ${filterVolume === "all" ? "bg-emerald-500 text-slate-950 font-bold" : "bg-slate-800 text-slate-300"}`}>सभी</button>
                <button onClick={() => setFilterVolume("high")} className={`px-3 py-1 text-xs rounded-lg ${filterVolume === "high" ? "bg-emerald-500 text-slate-950 font-bold" : "bg-slate-800 text-slate-300"}`}>मोमेंटम (>3x)</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-850 text-slate-400 text-xs font-semibold uppercase">
                    <th className="p-4">स्टॉक विवरण</th>
                    <th className="p-4">कीमत (LTP)</th>
                    <th className="p-4">9-EMA</th>
                    <th className="p-4">VWAP</th>
                    <th className="p-4 text-center">सिग्नल</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredStocks.map((stock) => {
                    const isSelected = selectedStock && selectedStock.symbol === stock.symbol;
                    const isBullish = stock.price > stock.vwap && stock.price > stock.ema9;

                    return (
                      <tr key={stock.symbol} className={`hover:bg-slate-850/55 cursor-pointer ${isSelected ? "bg-emerald-950/25 border-l-4 border-emerald-500" : ""}`} onClick={() => selectForAnalysis(stock)}>
                        <td className="p-4 font-bold text-white">{stock.symbol}<span className="text-xs text-slate-450 block font-normal">{stock.timeframe}</span></td>
                        <td className={`p-4 font-mono font-bold ${stock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>₹{stock.price.toFixed(2)}</td>
                        <td className="p-4 font-mono text-slate-300 text-sm">₹{stock.ema9.toFixed(2)}</td>
                        <td className="p-4 font-mono text-amber-400/90 text-sm">₹{stock.vwap.toFixed(2)}</td>
                        <td className="p-4 text-center">
                          {isBullish ? (
                            <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded text-xs font-bold">BUY (STRONG)</span>
                          ) : (
                            <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded text-xs font-bold">WAIT</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* दायां हिस्सा: एनालाइजर */}
        <div className="lg:col-span-4 space-y-6">
          
          {selectedStock && (
            <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
              <div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-300 font-bold px-2 py-0.5 rounded-full uppercase border border-emerald-500/20">ऑटो-ट्रेड ब्लूप्रिंट</span>
                <h3 className="font-extrabold text-xl text-white mt-1">{selectedStock.symbol}</h3>
              </div>
              
              <div className="space-y-2 pt-1">
                <div className="bg-emerald-950/15 border border-emerald-500/20 p-3 rounded-xl flex justify-between items-center"><span className="text-xs text-emerald-400 font-semibold">🎯 एंट्री ज़ोन (VWAP Support)</span><span className="font-mono font-bold text-emerald-400">₹{calcEntry.toFixed(2)}</span></div>
                <div className="bg-rose-950/15 border border-rose-500/20 p-3 rounded-xl flex justify-between items-center"><span className="text-xs text-rose-400 font-semibold">🛑 स्टॉप लॉस (EMA9 Below)</span><span className="font-mono font-bold text-rose-400">₹{calcSL.toFixed(2)}</span></div>
                <div className="bg-blue-950/15 border border-blue-500/20 p-3 rounded-xl flex justify-between items-center"><span className="text-xs text-blue-400 font-semibold">📈 टारगेट (1:2 RR)</span><span className="font-mono font-bold text-blue-400">₹{calcTarget1.toFixed(2)}</span></div>
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="font-bold text-white flex items-center gap-2"><Zap className="w-5 h-5 text-emerald-400" /> मास्टर स्नाइपर रिपोर्ट</h3>
            <button onClick={handleAIAnalysis} disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 py-2 rounded-xl text-sm font-bold transition-all">{loading ? "एनालिसिस हो रहा है..." : `सिग्नल चेक करें`}</button>
            <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 min-h-[150px] overflow-y-auto text-xs text-slate-300 whitespace-pre-line">{aiAnalysis || "ऊपर बटन दबाकर VWAP और 9-EMA मोमेंटम की जाँच करें।"}</div>
          </div>
          
        </div>
      </main>
    </div>
  );
}
