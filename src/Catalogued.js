
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY = "virt-epl-chain-v1";

const ASSET_KEYS = ["oneX","twoX","x2","tg0","tg6","ht12","ht21","ht30","ft40","ft41"];
const ASSET_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2", tg0:"TG0", tg6:"TG6",
  ht12:"HT12", ht21:"HT21", ht30:"HT30", ft40:"FT40", ft41:"FT41"
};
const ASSET_ODD_KEY = {
  oneX:"oneX", twoX:"twoX", x2:"x2", tg0:"tg0", tg6:"tg6",
  ht12:"ht12", ht21:"ht21", ht30:"ht30", ft40:"ft40", ft41:"ft41"
};

const emptyObj = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  const [baseStake, setBaseStake] = useState(10000);
  const [winnerStake, setWinnerStake] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [week, setWeek] = useState(1);
  const [bank, setBank] = useState(0);

  const [privateDef, setPrivateDef] = useState(emptyObj());
  const [wonAssets, setWonAssets] = useState([]); 
  const [carriedAssets, setCarriedAssets] = useState([]);
  const [gameStakes, setGameStakes] = useState(emptyObj());

  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  const applyData = useCallback((d) => {
    setBaseStake(d.base ?? 10000);
    setSmallDeficit(d.smallDeficit ?? 0);
    setWeek(d.week ?? 1);
    setPrivateDef(d.privateDef || emptyObj());
    setWonAssets(d.wonAssets || []);
    setCarriedAssets(d.carriedAssets || []);
    setBank(d.bank ?? 0);
  }, []);

  const fetchBase = useCallback(async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) applyData(res.data);
    } catch {
      try {
        const s = localStorage.getItem(LS_KEY);
        if (s) applyData(JSON.parse(s));
      } catch {}
    } finally { setIsReloading(false); }
  }, [applyData]);

  const saveBase = useCallback(async (overrides = {}) => {
    const p = {
      base: baseRef.current, smallDeficit, week,
      privateDef, wonAssets, carriedAssets, bank,
      ...overrides
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
    try { await axios.put(API_BASE, p); } catch (err) { console.error("❌ save:", err.message); }
  }, [smallDeficit, week, privateDef, wonAssets, carriedAssets, bank]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  // Maps helpers to active losers in order
  const getChainMapping = useCallback((won, carried) => {
    const map = {};
    const activeLosers = ASSET_KEYS.filter(k => !won.includes(k) && !carried.includes(k));
    const helperPool = [...won];
    activeLosers.forEach(k => { map[k] = []; });
    
    if (activeLosers.length > 0 && helperPool.length > 0) {
      let pIdx = 0;
      while (pIdx < helperPool.length) {
        for (let i = 0; i < activeLosers.length && pIdx < helperPool.length; i++) {
          map[activeLosers[i]].push(helperPool[pIdx]);
          pIdx++;
        }
      }
    }
    return map;
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";
    const found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert("Match not found"); return; }

    setFixture(found);
    setClicked(new Set());
    setWinners(new Set());

    const wStake = Math.max(Math.round(baseStake / found.winner), 10);
    setWinnerStake(wStake);
    const curSD = smallDeficit + wStake;
    setSmallDeficit(curSD);

    const map = getChainMapping(wonAssets, carriedAssets);
    const stakes = emptyObj();
    
    Object.keys(map).forEach(lead => {
      const lOdd = found[ASSET_ODD_KEY[lead]] || 0;
      const pd = privateDef[lead] || 0;
      if (lOdd > 1.01) {
        stakes[lead] = Math.max(Math.round((curSD + pd) / (lOdd - 1)), 10);
      }
      
      let chainTarget = curSD + pd + (stakes[lead] || 0);
      map[lead].forEach(helper => {
        const hOdd = found[ASSET_ODD_KEY[helper]] || 0;
        if (hOdd > 1.01) {
          stakes[helper] = Math.max(Math.round(chainTarget / (hOdd - 1)), 10);
          chainTarget += stakes[helper];
        }
      });
    });

    setGameStakes(stakes);
  };

  const handleNext = () => {
    if (!fixture) return;
    let newPriv = { ...privateDef };
    let newWon = [...wonAssets];
    let newSD = smallDeficit;
    let newCarried = [...carriedAssets];
    let winOccurred = false;

    const map = getChainMapping(wonAssets, carriedAssets);

    ASSET_KEYS.forEach(key => {
      const won = winners.has(key) || (clicked.has("six") && key === "six");
      const stake = gameStakes[key] || 0;
      if (won) winOccurred = true;

      if (wonAssets.includes(key)) {
        if (won) newPriv[key] = 0;
        else newPriv[key] += stake;
        return;
      }

      if (carriedAssets.includes(key)) {
        if (won) {
          newWon.push(key);
          newCarried = newCarried.filter(c => c !== key);
          newPriv[key] = 0;
        }
        return;
      }

      let leadLoser = key;
      let isHelper = false;
      Object.entries(map).forEach(([lead, hArr]) => {
        if (hArr.includes(key)) { leadLoser = lead; isHelper = true; }
      });

      const chain = [leadLoser, ...(map[leadLoser] || [])];
      const myIdx = chain.indexOf(key);

      if (won) {
        newPriv[key] = 0;
        newWon.push(key);
        const beforeTotal = chain.slice(0, myIdx).reduce((acc, k) => acc + (gameStakes[k] || 0), 0);
        if (beforeTotal > 0) newPriv[leadLoser] += beforeTotal;
        if (isHelper && !newWon.includes(leadLoser)) {
          if (!newCarried.includes(leadLoser)) newCarried.push(leadLoser);
        }
        if (!isHelper) newCarried = newCarried.filter(c => c !== key);
      } else {
        newPriv[key] += stake;
      }
    });

    if (winOccurred) newSD = 0;
    let nextWk = week + 1;
    let finalBase = baseStake;

    if (nextWk > 38) {
      nextWk = 1;
      let leftover = Object.values(newPriv).reduce((a, b) => a + b, 0);
      finalBase = 10000 + Math.max(0, leftover - bank);
      newPriv = emptyObj(); newWon = []; newCarried = []; newSD = 0;
    }

    setPrivateDef(newPriv); setWonAssets(newWon); setCarriedAssets(newCarried);
    setSmallDeficit(newSD); setWeek(nextWk); setBaseStake(finalBase);
    setFixture(null); setInputA(""); setInputB(""); setGameStakes(emptyObj()); setClicked(new Set());
    saveBase({ base: finalBase, smallDeficit: newSD, week: nextWk, privateDef: newPriv, wonAssets: newWon, carriedAssets: newCarried });
  };

  const chainMap = getChainMapping(wonAssets, carriedAssets);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      <div className="p-4 border-b border-white/10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-red-500 italic">BETKING</h1>
          <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Week {week} / 38</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => saveBase()} className="bg-green-600 px-3 py-1 rounded text-[10px] font-bold">SAVE</button>
          <button onClick={fetchBase} disabled={isReloading} className="bg-slate-800 px-3 py-1 rounded text-[10px]"><FiRefreshCw className={isReloading ? "animate-spin" : ""}/></button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setClicked(new Set([...clicked, "six"]))} 
            className={`p-4 rounded-xl font-bold flex flex-col items-center border-2 ${clicked.has("six") ? "bg-white text-black border-white" : "bg-red-600 border-red-500"}`}>
            <span className="text-[10px] opacity-80">6-0 JACKPOT</span>
            <span className="text-lg">{winnerStake}</span>
          </button>
          <button onClick={handleNext} disabled={!fixture} className="bg-emerald-600 p-4 rounded-xl font-black text-lg disabled:opacity-30">NEXT</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ASSET_KEYS.filter(k => !wonAssets.includes(k)).map((key) => {
            const isCarried = carriedAssets.includes(key);
            const helpers = chainMap[key] || [];
            
            return (
              <div key={key} className={`relative p-3 rounded-xl border-b-4 bg-slate-800 border-slate-900 ${isCarried ? 'opacity-60 border-amber-500' : ''}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-black text-xs">{ASSET_LABELS[key]}</span>
                  {isCarried && <span className="text-[7px] bg-amber-500 text-black px-1 rounded font-bold">CARRIED</span>}
                </div>
                
                {/* Lead Asset Toggle */}
                <button 
                  onClick={() => setWinners(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                  disabled={!fixture}
                  className={`w-full py-2 rounded text-center font-bold text-lg mb-1 transition ${winners.has(key) ? "bg-green-500 text-white" : "bg-slate-700 text-slate-300"}`}
                >
                  {gameStakes[key] || (isCarried ? "0" : "-")}
                </button>

                {/* Embedded Helper Martingale UI */}
                {helpers.map(hKey => (
                  <button 
                    key={hKey}
                    onClick={() => setWinners(p => { const n = new Set(p); n.has(hKey) ? n.delete(hKey) : n.add(hKey); return n; })}
                    disabled={!fixture}
                    className={`w-full py-1 rounded text-[10px] font-bold mb-1 flex justify-between px-2 items-center border border-white/10 ${winners.has(hKey) ? "bg-green-600 text-white" : "bg-indigo-900/40 text-indigo-200"}`}
                  >
                    <span>{ASSET_LABELS[hKey]}</span>
                    <span>{gameStakes[hKey] || "0"}</span>
                  </button>
                ))}
                
                <div className="text-[8px] text-slate-500 font-bold mt-1 text-right italic text-red-400">D: {privateDef[key]}</div>
              </div>
            );
          })}
        </div>

        {/* Floating Won Status (for those currently helping) */}
        {wonAssets.length > 0 && (
          <div className="flex flex-wrap gap-1 bg-black/20 p-2 rounded-lg">
            <span className="text-[8px] w-full text-slate-500 mb-1 font-bold">HELPERS ACTIVE:</span>
            {wonAssets.map(k => (
              <span key={k} className="text-[9px] bg-slate-700 px-2 py-0.5 rounded-full text-slate-400 font-bold border border-white/5">{ASSET_LABELS[k]} ✓</span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="HOME" className="bg-slate-900 p-3 rounded-lg border border-white/10 text-center font-bold" />
          <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="AWAY" className="bg-slate-900 p-3 rounded-lg border border-white/10 text-center font-bold" />
          <button onClick={handleSubmit} className="col-span-2 bg-red-600 p-4 rounded-xl font-black shadow-xl">CALCULATE</button>
        </div>

        <div className="bg-white/5 p-4 rounded-xl space-y-1 text-xs border border-white/10">
          <div className="flex justify-between"><span className="text-slate-400">SMALL DEFICIT:</span><span className="font-bold text-red-500">{smallDeficit}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">BANK:</span><span className="font-bold text-emerald-500">{bank}</span></div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
