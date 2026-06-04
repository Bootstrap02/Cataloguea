
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY = "virt-epl-flat-helper-v5";

const ASSET_KEYS = ["oneX", "twoX", "x2", "tg0", "tg6", "ht12", "ht21", "ht30", "ft40", "ft41"];
const ASSET_LABELS = {
  oneX: "1X", twoX: "2X", x2: "X2", tg0: "TG0", tg6: "TG6",
  ht12: "HT12", ht21: "HT21", ht30: "HT30", ft40: "FT40", ft41: "FT41"
};
const ASSET_ODD_KEY = {
  oneX: "oneX", twoX: "twoX", x2: "x2", tg0: "tg0", tg6: "tg6",
  ht12: "ht12", ht21: "ht21", ht30: "ht30", ft40: "ft40", ft41: "ft41"
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

  // Distributes helpers every single game round dynamically
  const distributeAndCalculate = useCallback((found, sd, currentStacks, won, carried) => {
    const stakes = Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));
    const targetMap = {}; 
    const reverseMap = {}; 

    const activeLosers = ASSET_KEYS.filter(k => !won.includes(k) && !carried.includes(k));
    const helpers = [...won];

    activeLosers.forEach(k => { targetMap[k] = []; });
    helpers.forEach(h => { reverseMap[h] = null; });

    // Round-robin distribution loop run per game frame
    if (activeLosers.length > 0 && helpers.length > 0) {
      let hIdx = 0;
      while (hIdx < helpers.length) {
        for (let i = 0; i < activeLosers.length && hIdx < helpers.length; i++) {
          const target = activeLosers[i];
          const helper = helpers[hIdx];
          targetMap[target].push(helper);
          reverseMap[helper] = target;
          hIdx++;
        }
      }
    }

    activeLosers.forEach(target => {
      const tOdd = found[ASSET_ODD_KEY[target]] || 0;
      const targetHistorySum = (currentStacks[target] || []).reduce((a, b) => a + b, 0);

      if (tOdd > 1.01) {
        stakes[target] = Math.max(Math.round((sd + targetHistorySum) / (tOdd - 1)), 10);
      }

      let runSum = sd + targetHistorySum + (stakes[target] || 0);
      targetMap[target].forEach(helper => {
        const hOdd = found[ASSET_ODD_KEY[helper]] || 0;
        if (hOdd > 1.01) {
          stakes[helper] = Math.max(Math.round(runSum / (hOdd - 1)), 10);
          runSum += stakes[helper];
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
    if (!found) { alert("Match not found"); return; }

    setFixture(found);
    setWinners(new Set());

    const wStake = Math.max(Math.round(baseStake / found.winner), 10);
    setWinnerStake(wStake);
    const curSD = smallDeficit + wStake;
    setSmallDeficit(curSD);

    const { stakes } = distributeAndCalculate(found, curSD, stacks, wonAssets, carriedAssets);
    setGameStakes(stakes);
  };

  const handleNext = () => {
    if (!fixture) return;

    let nextStacks = Object.fromEntries(Object.entries(stacks).map(([k, arr]) => [k, [...arr]]));
    let nextWon = [...wonAssets];
    let nextCarried = [...carriedAssets];
    let nextSD = smallDeficit;
    let winOccurred = false;

    // Get current game's dynamic round routing mapping
    const { targetMap, stakes } = distributeAndCalculate(fixture, smallDeficit, stacks, wonAssets, carriedAssets);
    const roundPlacements = Object.fromEntries(ASSET_KEYS.map(k => [k, []]));

    ASSET_KEYS.forEach(key => {
      if (wonAssets.includes(key) || carriedAssets.includes(key)) return;
      roundPlacements[key].push({ key, stake: stakes[key] || 0 });
      (targetMap[key] || []).forEach(hKey => {
        roundPlacements[key].push({ key: hKey, stake: stakes[hKey] || 0 });
      });
    });

    Object.keys(targetMap).forEach(target => {
      const chainPlacements = roundPlacements[target] || [];
      let winIdx = -1;
      for (let i = 0; i < chainPlacements.length; i++) {
        if (winners.has(chainPlacements[i].key)) { winIdx = i; break; }
      }

      if (winIdx !== -1) {
        winOccurred = true;
        const winnerKey = chainPlacements[winIdx].key;
        
        // Before Total Calculation: Add stakes up to the winning item's index to smallDeficit
        let beforeTotal = 0;
        for (let i = 0; i < winIdx; i++) {
          beforeTotal += chainPlacements[i].stake;
        }
        if (beforeTotal > 0) {
          nextSD += beforeTotal;
        }

        // Wipe history stacks
        nextStacks[target] = [];
        nextStacks[winnerKey] = [];

        if (winnerKey === target) {
          // Main asset won its own array: goes into helpers pool
          if (!nextWon.includes(target)) nextWon.push(target);
        } else {
          // Helper won: Target main asset becomes dormant. 
          if (!nextCarried.includes(target) && !nextWon.includes(target)) nextCarried.push(target);
          
          // CRITICAL FIX: The helper is filtered/kept in nextWon pool so it stays free to seek a new array next game!
          if (!nextWon.includes(winnerKey)) nextWon.push(winnerKey);
        }

        nextCarried = nextCarried.filter(c => c !== winnerKey);
      } else {
        // Loss: Append current stakes directly into the target asset's deficit history array
        chainPlacements.forEach(item => nextStacks[target].push(item.stake));
      }
    });

    if (winOccurred || clicked.has("six")) nextSD = 0;

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
    setFixture(null); setInputA(""); setInputB(""); 
    setGameStakes(Object.fromEntries(ASSET_KEYS.map(k => [k, 0]))); 
    setWinners(new Set()); setClicked(new Set());
    
    saveBase({ base: finalBase, smallDeficit: nextSD, week: nextWk, stacks: nextStacks, wonAssets: nextWon, carriedAssets: nextCarried });
  };

  const { reverseMap: currentHelpersRouting } = distributeAndCalculate(fixture || { winner: 2 }, smallDeficit, stacks, wonAssets, carriedAssets);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      <div className="p-4 border-b border-white/10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-red-500 italic">BETKING</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Week {week} / 38</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => saveBase()} className="bg-green-600 p-2 rounded text-xs font-bold active:scale-95 transition">SAVE</button>
          <button onClick={fetchBase} disabled={isReloading} className="bg-slate-800 p-2 rounded text-xs transition disabled:opacity-40"><FiRefreshCw className={isReloading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setClicked(new Set([...clicked, "six"]))} className={`p-4 rounded-xl font-bold flex flex-col items-center border-2 transition ${clicked.has("six") ? "bg-white text-black border-white" : "bg-red-600 border-red-500"}`}>
            <span className="text-[10px] font-black uppercase opacity-80">6-0 Jackpot</span>
            <span className="text-lg">{winnerStake}</span>
          </button>
          <button onClick={handleNext} disabled={!fixture} className="bg-emerald-600 p-4 rounded-xl font-black text-lg shadow-lg disabled:opacity-30 active:scale-95 transition">NEXT GAME</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ASSET_KEYS.map((key) => {
            const isWon = wonAssets.includes(key);
            const isCarried = carriedAssets.includes(key);
            const stake = gameStakes[key] || 0;
            const targetLeadKey = currentHelpersRouting[key];
            const currentStackSum = (stacks[key] || []).reduce((a, b) => a + b, 0);

            return (
              <button
                key={key}
                onClick={() => {
                  if (isCarried) {
                    setCarriedAssets(prev => prev.filter(k => k !== key));
                    setWonAssets(prev => [...prev, key]);
                    return;
                  }
                  setWinners(prev => {
                    const next = new Set(prev);
                    next.has(key) ? next.delete(key) : next.add(key);
                    return next;
                  });
                }}
                disabled={isWon || (!fixture && !isCarried)}
                className={`relative p-3 rounded-xl border-b-4 transition-all text-left active:translate-y-1 ${
                  isWon ? "bg-indigo-950 border-indigo-900 opacity-90 shadow-inner" :
                  winners.has(key) ? "bg-green-500 border-green-700" :
                  isCarried ? "bg-slate-800 border-amber-600 shadow-lg" : "bg-slate-700 border-slate-900"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="font-black text-sm">{ASSET_LABELS[key]}</span>
                    {targetLeadKey && <span className="text-[9px] font-extrabold text-cyan-400 mt-0.5">➔ {ASSET_LABELS[targetLeadKey]}</span>}
                  </div>
                  {isWon && <span className="text-[8px] bg-indigo-500 px-1 rounded font-bold">HELPER</span>}
                  {isCarried && <span className="text-[8px] bg-amber-600 px-1 rounded font-bold">DORMANT</span>}
                </div>
                <div className="mt-2 text-xl font-black text-center">{stake > 0 ? stake : (isCarried ? "0" : (isWon ? "✓" : "-"))}</div>
                {!isWon && <div className="text-[9px] opacity-65 font-bold mt-1 text-right italic">D: {currentStackSum}</div>}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-4">
          <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="HOME" className="bg-slate-900 p-3 rounded-lg border border-white/10 text-center font-bold" />
          <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="AWAY" className="bg-slate-900 p-3 rounded-lg border border-white/10 text-center font-bold" />
          <button onClick={handleSubmit} className="col-span-2 bg-red-600 p-4 rounded-xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition">Calculate Odds</button>
        </div>

        <div className="bg-white/5 p-4 rounded-2xl space-y-2 border border-white/10 text-xs">
          <div className="flex justify-between"><span className="text-slate-400 font-bold">SMALL DEFICIT:</span><span className="font-bold text-red-500">{smallDeficit}</span></div>
          <div className="flex justify-between"><span className="text-slate-400 font-bold">BASE STAKE:</span><span className="font-bold text-green-500">{baseStake}</span></div>
          <div className="flex justify-between items-center pt-1 border-t border-white/5">
            <span className="text-slate-400 font-bold">BANK RESERVE:</span>
            <input type="number" value={bank} onChange={e => setBank(Number(e.target.value) || 0)} className="w-24 bg-slate-900 border border-white/10 text-right p-1 rounded font-black text-amber-400" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
