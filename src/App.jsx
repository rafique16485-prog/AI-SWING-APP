import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Search, Activity, ShieldAlert, Zap, Sliders, Award, 
  RefreshCw, ArrowUpRight, Percent, BookOpen, Info, Clock, Calendar, Compass
} from 'lucide-react';

const INITIAL_STOCKS = [
  { symbol: "TATASTEEL", name: "Tata Steel Ltd.", price: 174.50, change: 4.82, volume: "3.8x", rsi: 68, pattern: "Resistance Breakout", status: "Bullish Breakout", timeframe: "Daily Chart", holdingPeriod: "5-10 Days" },
  { symbol: "RELIANCE", name: "Reliance Industries", price: 2945.10, change: 3.15, volume: "2.4x", rsi: 62, pattern: "Double Bottom Breakout", status: "Strong Momentum", timeframe: "Daily / 4-Hour", holdingPeriod: "10-15 Days" },
  { symbol: "INFY", name: "Infosys Ltd.", price: 1532.00, change: -0.45, volume: "0.8x", rsi: 48, pattern: "Consolidation", status: "No Breakout", timeframe: "Daily Chart", holdingPeriod: "N/A" },
  { symbol: "SBIN", name: "State Bank of India", price: 842.30, change: 5.60, volume: "4.1x", rsi: 72, pattern: "Multi-Year High Breakout", status: "High Volume Burst", timeframe: "Daily Chart", holdingPeriod: "8-12 Days" },
  { symbol: "TATOMOTORS", name: "Tata Motors Ltd.", price: 988.40, change: 2.80, volume: "1.9x", rsi: 59, pattern: "Flag & Pennant Breakout", status: "Trend Continuation", timeframe: "4-Hour Chart", holdingPeriod: "4-7 Days" },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", price: 1610.20, change: 1.10, volume: "1.2x", rsi: 54, pattern: "Channel Resistance Test", status: "Approaching Breakout", timeframe: "Daily / 4-Hour", holdingPeriod: "6-12 Days" },
  { symbol: "ITC", name: "ITC Ltd.", price: 432.15, change: 3.90, volume: "3.2x", rsi: 65, pattern: "Cup & Handle Breakout", status: "Bullish Breakout", timeframe: "Daily Chart", holdingPeriod: "10-18 Days" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", price: 1420.00, change: 6.25, volume: "5.0x", rsi: 78, pattern: "All-Time High Breakout", status: "Extreme Momentum", timeframe: "Daily Chart", holdingPeriod: "5-10 Days" }
];

export default function App() {
  const [stocks, setStocks] = useState(INITIAL_STOCKS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState(INITIAL_STOCKS[0]);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [filterVolume, setFilterVolume] = useState("all");
  const [filterRsi, setFilterRsi] = useState("all");
  
  const [capital, setCapital] = useState(100000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [calcEntry, setCalcEntry] = useState(174.50);
  const [calcSL, setCalcSL] = useState(165.75);
  const [calcTarget1, setCalcTarget1] = useState(192.00);
  const [calcTarget2, setCalcTarget2] = useState(200.50);
  const [quantity, setQuantity] = useState(0);
  const [totalRisk, setTotalRisk] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStocks(prevStocks => 
        prevStocks.map(stock => {
          const priceChangePercent = (Math.random() * 0.6 - 0.3); 
          const newPrice = Number((stock.price * (1 + priceChangePercent / 100)).toFixed(2));
          const newChange = Number((stock.change + priceChangePercent).toFixed(2));
          if (selectedStock && stock.symbol === selectedStock.symbol) {
            updateTradeLevels(newPrice);
          }
          return { ...stock, price: newPrice, change: newChange };
        })
      );
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedStock]);

  const updateTradeLevels = (price) => {
    setCalcEntry(price);
    setCalcSL(Number((price * 0.95).toFixed(2)));
    setCalcTarget1(Number((price * 1.10).toFixed(2)));
    setCalcTarget2(Number((price * 1.15).toFixed(2)));
  };

  useEffect(() => {
    const riskAmt = (capital * riskPercent) / 100;
    const perShareRisk = calcEntry - calcSL;
    if (perShareRisk > 0 && calcEntry > 0) {
      const qty = Math.floor(riskAmt / perShareRisk);
      setQuantity(qty);
      setTotalRisk(Number((qty * perShareRisk).toFixed(2)));
    } else {
      setQuantity(0);
      setTotalRisk(0);
    }
  }, [capital, riskPercent, calcEntry, calcSL]);

  const filteredStocks = stocks.filter(stock => {
    const matchesSearch = stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.name.toLowerCase().includes(searchQuery.toLowerCase());
    const volNum = parseFloat(stock.volume);
    const matchesVolume = filterVolume === "all" || (filterVolume === "high" && volNum >= 3.0) || (filterVolume === "medium" && volNum >= 1.5 && volNum < 3.0);
    const matchesRsi = filterRsi === "all" || (filterRsi === "oversold" && stock.rsi < 40) || (filterRsi === "bullish" && stock.rsi >= 60 && stock.rsi < 70) || (filterRsi === "extreme" && stock.rsi >= 70);
    return matchesSearch && matchesVolume && matchesRsi;
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
    
    const apiKey = ""; // Canvas/Vercel will run this without key safely in preview or you can add Gemini key later
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const systemPrompt = `You are an expert SEBI Registered Technical Analyst specializing in Swing Trading. Provide responses in clear Hinglish with structural formatting, emojis, key levels, recommended timeframe, and holding duration.`;
    const userQuery = `Detailed analysis needed for "${selectedStock.symbol}" (${selectedStock.name}). Current Price is ₹${selectedStock.price}. Volume multiplier is ${selectedStock.volume} and RSI is ${selectedStock.rsi}. Explain Breakout Validation, Entry, Targets, SL, Timeframe & Holding Period.`;

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{ "google_search": {} }]
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResult) setAiAnalysis(textResult);
    } catch (err) {
      setAiAnalysis("विवरण लोड करने में त्रुटि हुई। कृपया पुनः प्रयास करें।");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-400" />
            <div>
              <h1 className="text-xl font-bold text-white">NSE AI <span className="text-emerald-400">ब्रेकआउट स्कैनर</span></h1>
              <p className="text-xs text-slate-400">ऑटो-डिटेक्टेड एंट्री, स्टॉप लॉस, टारगेट, टाइमफ्रेम</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h3 className="font-bold text-white flex items-center gap-2"><Sliders className="w-5 h-5 text-emerald-400" /> लाइव ब्रेकआउट डैशबोर्ड</h3>
              <input type="text" placeholder="खोजें..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-950 border border-slate-850 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-850 text-slate-400 text-xs font-semibold uppercase">
                    <th className="p-4">स्टॉक विवरण</th>
                    <th className="p-4">लाइव कीमत</th>
                    <th className="p-4 text-right">बदलाव</th>
                    <th className="p-4">वॉल्यूम</th>
                    <th className="p-4">टाइमफ्रेम</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredStocks.map((stock) => {
                    const isSelected = selectedStock && selectedStock.symbol === stock.symbol;
                    return (
                      <tr key={stock.symbol} className={`hover:bg-slate-850/55 cursor-pointer ${isSelected ? "bg-emerald-950/25 border-l-4 border-emerald-500" : ""}`} onClick={() => selectForAnalysis(stock)}>
                        <td className="p-4 font-bold text-white">{stock.symbol}<span className="text-xs text-slate-450 block font-normal">{stock.name}</span></td>
                        <td className="p-4 font-mono">₹{stock.price.toFixed(2)}</td>
                        <td className={`p-4 text-right font-mono font-bold ${stock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{stock.change}%</td>
                        <td className="p-4"><span className="bg-slate-800 px-2 py-0.5 rounded text-xs">{stock.volume}</span></td>
                        <td className="p-4 text-xs text-slate-300">{stock.timeframe}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          {selectedStock && (
            <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
              <div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-300 font-bold px-2 py-0.5 rounded-full uppercase border border-emerald-500/20">ऑटो-ट्रेड ब्लूप्रिंट</span>
                <h3 className="font-extrabold text-xl text-white mt-1">{selectedStock.symbol}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850"><span className="text-slate-400 block font-semibold">टाइमफ्रेम</span><span className="text-sm font-bold text-blue-400">{selectedStock.timeframe}</span></div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850"><span className="text-slate-400 block font-semibold">होल्डिंग अवधि</span><span className="text-sm font-bold text-amber-400">{selectedStock.holdingPeriod}</span></div>
              </div>
              <div className="space-y-2 pt-1">
                <div className="bg-emerald-950/15 border border-emerald-500/20 p-3 rounded-xl flex justify-between items-center"><span className="text-xs text-emerald-400 font-semibold">🎯 सुरक्षित एंट्री ज़ोन</span><span className="font-mono font-bold text-emerald-400">₹{calcEntry.toFixed(2)}</span></div>
                <div className="bg-rose-950/15 border border-rose-500/20 p-3 rounded-xl flex justify-between items-center"><span className="text-xs text-rose-400 font-semibold">🛑 सख्त स्टॉप लॉस</span><span className="font-mono font-bold text-rose-400">₹{calcSL.toFixed(2)}</span></div>
                <div className="bg-blue-950/15 border border-blue-500/20 p-3 rounded-xl space-y-1"><div className="flex justify-between text-xs"><span className="text-blue-400 font-semibold">📈 टारगेट 1</span><span className="font-mono font-bold">₹{calcTarget1.toFixed(2)}</span></div><div className="flex justify-between text-xs"><span className="text-blue-400 font-semibold">🚀 टारगेट 2</span><span className="font-mono font-bold">₹{calcTarget2.toFixed(2)}</span></div></div>
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="font-bold text-white flex items-center gap-2"><Award className="w-5 h-5 text-emerald-400" /> डीप एआई रिपोर्ट</h3>
            <button onClick={handleAIAnalysis} disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 py-2 rounded-xl text-sm font-bold transition-all">{loading ? "एनालिसिस हो रहा है..." : `एआई रिपोर्ट जनरेट करें`}</button>
            <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 min-h-[150px] max-h-[250px] overflow-y-auto text-xs text-slate-300 whitespace-pre-line">{aiAnalysis || "ऊपर बटन दबाकर लाइव एआई चार्ट रीडिंग देखें।"}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
