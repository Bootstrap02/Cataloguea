
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY = "virt-epl-flat-helper-v7";

const ASSET_KEYS = ["oneX", "twoX", "x2", "tg0", "tg6", "ht12", "ht21", "ht30", "ft40", "ft41"];
const ASSET_LABELS = {
  oneX: "1X", twoX: "2X", x2: "X2", tg0: "TG0", tg6: "TG6",
  ht12: "HT12", ht21: "HT21", ht30: "HT30", ft40: "FT40", ft41: "FT41"
};

const makeEmptyStacks = () => Object.fromEntries(ASSET_KEYS.map(k => [k, []]));

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
  const [stacks, setStacks] = useState(makeEmptyStacks());
  const [wonAssets, setWonAssets] = useState([]);
  const [carriedAssets, setCarriedAssets] = useState([]);
  const [gameStakes, setGameStakes] = useState(Object.fromEntries(ASSET_KEYS.map(k => [k, 0])));
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  const applyData = useCallback((d) => {
    setBaseStake(d.base ?? 10000);
    setSmallDeficit(d.smallDeficit ?? 0);
    setWeek(d.week ?? 1);
    setStacks(d.stacks || makeEmptyStacks());
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
      stacks, wonAssets, carriedAssets, bank,
      ...overrides
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
    try { await axios.put(API_BASE, p); } catch (err) { console.error("❌ save:", err.message); }
  }, [smallDeficit, week, stacks, wonAssets, carriedAssets, bank]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  // Distribution Engine: Redistributes the helper pool to active losers
  const distributeAndCalculate = useCallback((found, sd, currentStacks, won, carried) => {
    const stakes = Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));
    const targetMap = {}; 
    const reverseMap = {}; 

    const activeArrays = ASSET_KEYS.filter(k => !won.includes(k) && !carried.includes(k));
    const helpers = [...won];

    activeArrays.forEach(k => { targetMap[k] = []; });

    if (activeArrays.length > 0 && helpers.length > 0) {
      let hIdx = 0;
      while (hIdx < helpers.length) {
        for (let i = 0; i < activeArrays.length && hIdx < helpers.length; i++) {
          targetMap[activeArrays[i]].push(helpers[hIdx]);
          reverseMap[helpers[hIdx]] = activeArrays[i];
          hIdx++;
        }
      }
    }

    activeArrays.forEach(target => {
      const tOdd = found[target] || 0;
      const tHistorySum = (currentStacks[target] || []).reduce((a, b) => a + b, 0);
      if (tOdd > 1.01) stakes[target] = Math.max(Math.round((sd + tHistorySum) / (tOdd - 1)), 10);
      
      let runningSum = sd + tHistorySum + (stakes[target] || 0);
      targetMap[target].forEach(hKey => {
        const hOdd = found[hKey] || 0;
        if (hOdd > 1.01) {
          stakes[hKey] = Math.max(Math.round(runningSum / (hOdd - 1)), 10);
          runningSum += stakes[hKey];
        }
      });
    });

    return { targetMap, reverseMap, stakes };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";
    const found = odds.find(o => o.home === home && o.away === away);
    if (!found) return;

    setFixture(found);
    setWinners(new Set());
    const wStake = Math.max(Math.round(baseStake / found.winner), 10);
    setWinnerStake(wStake);
    
    const { stakes } = distributeAndCalculate(found, smallDeficit + wStake, stacks, wonAssets, carriedAssets);
    setGameStakes(stakes);
  };

  const handleNext = () => {
    if (!fixture) return;

    let nextStacks = Object.fromEntries(Object.entries(stacks).map(([k, arr]) => [k, [...arr]]));
    let nextWon = [...wonAssets];
    let nextCarried = [...carriedAssets];
    let nextSD = smallDeficit + winnerStake;
    let anyWin = false;

    const { targetMap, stakes } = distributeAndCalculate(fixture, smallDeficit + winnerStake, stacks, wonAssets, carriedAssets);

    Object.keys(targetMap).forEach(target => {
      const helpers = targetMap[target];
      const chain = [{ key: target, stake: stakes[target] || 0 }, ...helpers.map(h => ({ key: h, stake: stakes[h] || 0 }))];
      let winIdx = chain.findIndex(item => winners.has(item.key));

      if (winIdx !== -1) {
        anyWin = true;
        const winnerKey = chain[winIdx].key;

        // Before Total logic
        let beforeTotal = 0;
        for (let i = 0; i < winIdx; i++) beforeTotal += chain[i].stake;
        nextSD += beforeTotal;

        // Reset arrays
        nextStacks[target] = [];
        nextStacks[winnerKey] = [];

        // If helper won, target becomes dormant
        if (winnerKey !== target) {
          if (!nextCarried.includes(target) && !nextWon.includes(target)) nextCarried.push(target);
        }
        
        // Ensure winner is in the helper pool
        if (!nextWon.includes(winnerKey)) nextWon.push(winnerKey);
        nextCarried = nextCarried.filter(c => c !== winnerKey);
      } else {
        // No win: target absorbs all chain losses
        chain.forEach(item => nextStacks[target].push(item.stake));
      }
    });

    if (anyWin || clicked.has("six")) nextSD = 0;

    let nextWk = week + 1;
    let finalBase = baseStake;
    if (nextWk > 38) {
      nextWk = 1;
      let leftover = Object.values(nextStacks).reduce((acc, arr) => acc + arr.reduce((a, b) => a + b, 0), 0);
      finalBase = 10000 + Math.max(0, leftover - bank);
      nextStacks = makeEmptyStacks(); nextWon = []; nextCarried = []; nextSD = 0;
    }

    setStacks(nextStacks); setWonAssets(nextWon); setCarriedAssets(nextCarried);
    setSmallDeficit(nextSD); setWeek(nextWk); setBaseStake(finalBase);
    setFixture(null); setInputA(""); setInputB(""); setWinners(new Set()); setClicked(new Set());
    saveBase({ base: finalBase, smallDeficit: nextSD, week: nextWk, stacks: nextStacks, wonAssets: nextWon, carriedAssets: nextCarried });
  };

  const { reverseMap: currentRouting } = distributeAndCalculate(fixture || { winner: 2 }, smallDeficit, stacks, wonAssets, carriedAssets);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-3 font-sans">
      <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
        <h1 className="text-xl font-black text-red-600 italic">BETKING v7</h1>
        <div className="flex gap-2">
          <button onClick={() => saveBase()} className="bg-green-600 px-3 py-1 rounded text-xs font-bold">SAVE</button>
          <button onClick={fetchBase} disabled={isReloading} className="bg-slate-800 px-3 py-1 rounded text-xs">
             <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <button onClick={() => setClicked(new Set(["six"]))} className={`p-4 rounded-xl border-2 transition ${clicked.has("six") ? "bg-white text-black" : "bg-red-600"}`}>
          <span className="text-[10px] uppercase font-black block text-center">6-0 Jackpot</span>
          <div className="text-xl font-black text-center">{winnerStake}</div>
        </button>
        <button onClick={handleNext} disabled={!fixture} className="bg-emerald-600 p-4 rounded-xl font-black text-lg disabled:opacity-20 active:scale-95 transition">NEXT GAME</button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {ASSET_KEYS.map((key) => {
          const isWon = wonAssets.includes(key);
          const isCarried = carriedAssets.includes(key);
          const stake = gameStakes[key] || 0;
          const target = currentRouting[key];

          return (
            <button key={key} onClick={() => {
                if (isCarried) {
                  // Re-activate dormant asset into helper pool
                  setCarriedAssets(prev => prev.filter(k => k !== key));
                  setWonAssets(prev => [...prev, key]);
                } else {
                  // Toggle win for active or helper asset
                  setWinners(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
                }
              }}
              className={`p-3 rounded-xl border-b-4 text-left transition-all active:translate-y-1 ${
                isWon ? "bg-indigo-600 border-indigo-900 shadow-lg" : 
                winners.has(key) ? "bg-green-500 border-green-700" : 
                isCarried ? "bg-slate-800 border-amber-600 opacity-60" : "bg-slate-700 border-slate-900"
              }`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-black text-xs">{ASSET_LABELS[key]}</div>
                  {target && <div className="text-[9px] text-cyan-300 font-bold">➔ {ASSET_LABELS[target]}</div>}
                </div>
                {isWon && <div className="text-[8px] bg-indigo-400 px-1 rounded font-bold uppercase">Helper</div>}
                {isCarried && <div className="text-[8px] bg-amber-600 px-1 rounded font-bold uppercase">Dormant</div>}
              </div>
              <div className="text-xl font-black text-center my-2">{stake > 0 ? stake : (isCarried ? "0" : "-")}</div>
              {!isWon && <div className="text-[9px] opacity-50 text-right">D: {(stacks[key] || []).reduce((a, b) => a + b, 0)}</div>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="HOME" className="bg-slate-900 p-3 rounded-lg border border-white/10 text-center font-bold uppercase" />
        <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="AWAY" className="bg-slate-900 p-3 rounded-lg border border-white/10 text-center font-bold uppercase" />
        <button onClick={handleSubmit} className="col-span-2 bg-red-600 p-4 rounded-xl font-black uppercase tracking-widest active:scale-95 transition">Calculate Odds</button>
      </div>

      <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-xs space-y-2">
        <div className="flex justify-between"><span>SMALL DEFICIT:</span><span className="text-red-500 font-black">{smallDeficit}</span></div>
        <div className="flex justify-between"><span>BASE STAKE:</span><span className="text-green-500 font-black">{baseStake}</span></div>
        <div className="flex justify-between items-center">
          <span>BANK:</span>
          <input type="number" value={bank} onChange={e => setBank(Number(e.target.value))} className="w-24 bg-black/40 text-right p-1 rounded text-amber-500 font-bold" />
        </div>
      </div>
    </div>
  );
};

export default Homepage;
