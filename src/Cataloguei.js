import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY   = "virt-epl-solo-v1";

// 10 Distinct Slot Keys corresponding to our Sub-Arrays
const ALL_PAIRS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"];

// Structure definitions mapping the arrays together
const PAIR_METADATA = {
  p1:  { label: "1X Slot",   primary: "oneX",    backing: "ft02" },
  p2:  { label: "2X Slot",   primary: "twoX",    backing: "ft01" },
  p3:  { label: "X2 Slot",   primary: "x2",      backing: "ft12" },
  p4:  { label: "TG0 Slot",  primary: "tg0",     backing: "ft22" },
  p5:  { label: "TG6 Slot",  primary: "tg6",     backing: "ft32" },
  p6:  { label: "HT12 Slot", primary: "ht12",    backing: "ft42" },
  p7:  { label: "HT21 Slot", primary: "ht21",    backing: "ft13" },
  p8:  { label: "HT30 Slot", primary: "ht30",    backing: "ht02" },
  p9:  { label: "FT40 Slot", primary: "ft40",    backing: "c21" },
  p10: { label: "FT41 Slot", primary: "ft41",    backing: "awayO25" }
};

const PAIR_COLORS = {
  p1: "bg-purple-600", p2: "bg-pink-600", p3: "bg-lime-600",
  p4: "bg-cyan-600", p5: "bg-teal-600", p6: "bg-blue-600",
  p7: "bg-emerald-600", p8: "bg-green-700", p9: "bg-indigo-600", p10: "bg-violet-600"
};

const emptyMap = () => Object.fromEntries(ALL_PAIRS.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture,     setFixture]     = useState(null);

  /* ── WINNER (6-0) ── */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [deficit,     setDeficit]     = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);

  /* ── SHARED SMALL DEFICIT ── */
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [shadow,       setShadow]       = useState(0);
  const [bank,         setBank]         = useState(0);

  /* ── PER-PAIR STATES ── */
  const [privateDef,   setPrivateDef]   = useState(emptyMap());
  const [bigDef,       setBigDef]       = useState(emptyMap());
  const [brokenTarget, setBrokenTarget] = useState(emptyMap());

  /* ── GAME STAKES ── */
  const [gameStakes, setGameStakes] = useState(Object.fromEntries(ALL_PAIRS.map(k => [k, { primary: 0, backing: 0 }])));
  const [bigStakes,  setBigStakes]  = useState({});

  /* ── WINNERS / CLICKED ── */
  const [winners,    setWinners]    = useState(new Set()); // Contains Slot IDs ("p1", etc.)
  const [bigWinners, setBigWinners] = useState(new Set());
  const [clicked,    setClicked]    = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  const applyData = useCallback((d) => {
    setBaseStake(d.base            ?? 10000);
    setDeficit(d.deficit           ?? 0);
    setSmallDeficit(d.smallDeficit ?? 0);
    setShadow(d.shadow             ?? 0);
    setBank(d.bank                 ?? 0);
    setPrivateDef(d.privateDef     || emptyMap());
    setBigDef(d.bigDef             || emptyMap());
    setBrokenTarget(d.brokenTarget || emptyMap());
  }, []);

  const fetchBase = useCallback(() => {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) {
        applyData(JSON.parse(s));
        console.log("💾 L1: Loaded from Local Storage");
      }
    } catch (err) {
      console.error("❌ L1 Load error:", err.message);
    }
  }, [applyData]);

  const saveBase = useCallback((overrides = {}) => {
    const p = {
      base: baseRef.current, deficit,
      smallDeficit, shadow, bank,
      privateDef, bigDef, brokenTarget,
      ...overrides,
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p));
      console.log("💾 L1: Saved to Local Storage");
    } catch (err) {
      console.error("❌ L1 Save error:", err.message);
    }
  }, [deficit, smallDeficit, shadow, bank, privateDef, bigDef, brokenTarget]);

  const fetchFromAPI = useCallback(async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) {
        applyData(res.data);
        localStorage.setItem(LS_KEY, JSON.stringify(res.data));
        console.log("☁️ L2: Fetched from API Sync");
      }
    } catch (err) {
      console.error("❌ L2 Fetch failed:", err.message);
      alert("API fetch failed. Reverting to local data.");
    } finally {
      setIsReloading(false);
    }
  }, [applyData]);

  const saveToAPI = useCallback(async () => {
    const p = {
      base: baseRef.current, deficit,
      smallDeficit, shadow, bank,
      privateDef, bigDef, brokenTarget,
    };
    try {
      await axios.put(API_BASE, p);
      console.log("✅ L2: Master Backup Synced to API");
      alert("State fully backed up to API successfully.");
    } catch (err) {
      console.error("❌ L2 Sync failed:", err.message);
      alert("API backup failed.");
    }
  }, [deficit, smallDeficit, shadow, bank, privateDef, bigDef, brokenTarget]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  /* ================================================================
     HANDLE SETUP CALCULATIONS (PAIRED LOGIC)
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";
    const found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    setFixture(found);
    setClicked(new Set());
    setWinners(new Set());
    setBigWinners(new Set());

    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);

    const curSD = smallDeficit + wStake;
    setSmallDeficit(curSD);
    setShadow(curSD);

    /* ── Paired Martingale Math Injection ── */
    const newStakes = {};
    ALL_PAIRS.forEach(slot => {
      const pKey = PAIR_METADATA[slot].primary;
      const bKey = PAIR_METADATA[slot].backing;
      
      const oddP = found[pKey] || 0;
      const oddB = found[bKey] || 0;

      const bt = brokenTarget[slot] || 0;
      const pd = privateDef[slot]   || 0;
      const combinedTarget = bt + curSD + pd;

      let stakeP = 0;
      let stakeB = 0;

      if (oddP > 1.01 && oddB > 1.01) {
        // Paired formula matrix to return objective targets for both markers simultaneously
        const denominator = (oddP * oddB) - oddP - oddB;
        if (denominator > 0) {
          stakeP = Math.round((combinedTarget * oddB) / denominator);
          stakeB = Math.round((combinedTarget * oddP) / denominator);
        } else {
          // Fallback if odds structure cannot bridge mathematical denominator parity
          stakeP = Math.round(combinedTarget / (oddP - 1));
          stakeB = Math.round(combinedTarget / (oddB - 1));
        }
      }
      newStakes[slot] = { primary: Math.max(stakeP, 0), backing: Math.max(stakeB, 0) };
    });
    setGameStakes(newStakes);

    /* ── Big Deficit Matrix Settings ── */
    const newBigStakes = {};
    const newBrokenFromBig = { ...brokenTarget };
    
    ALL_PAIRS.forEach(slot => {
      if ((bigDef[slot] || 0) === 0) return;
      const pKey = PAIR_METADATA[slot].primary;
      const oddP = found[pKey] || 0;
      
      if (oddP > 1.01) {
        const totalBigAllocated = Math.round((bigDef[slot] || 0) / oddP);
        newBigStakes[slot] = totalBigAllocated;
        
        const share = Math.floor(totalBigAllocated / 10);
        if (share > 0) {
          ALL_PAIRS.forEach(k => { newBrokenFromBig[k] = (newBrokenFromBig[k] || 0) + share; });
        }
      }
    });
    setBigStakes(newBigStakes);
    setBrokenTarget(newBrokenFromBig);
  };

  const markWin = (slot) => {
    if (!fixture || clicked.has(`n_${slot}`)) return;
    setClicked(p => new Set([...p, `n_${slot}`]));
    setWinners(p => new Set([...p, slot]));
  };

  const markBigWin = (slot) => {
    if (!fixture || clicked.has(`b_${slot}`)) return;
    setClicked(p => new Set([...p, `b_${slot}`]));
    setBigWinners(p => new Set([...p, slot]));
  };

  const handleJackpot = () => {
    setClicked(p => new Set([...p, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
    setShadow(0);
    saveBase({ base: 10000, deficit: 0, smallDeficit: 0, shadow: 0 });
  };

  /* ================================================================
     SETTLE / NEXT LOGIC
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    let newSD      = smallDeficit;
    let newShadow  = shadow;
    let newBank    = bank;
    let newDef     = deficit;
    let newBase    = baseStake;
    let newPriv    = { ...privateDef };
    let newBigDef  = { ...bigDef };
    let newBroken  = { ...brokenTarget };

    // 1. Settle Big Deficits
    ALL_PAIRS.forEach(slot => {
      if (bigWinners.has(slot)) {
        newBigDef[slot] = 0;
      }
    });

    // 2. Settle Sub-Array Pairs
    let firstWin = true;
    const shadowPayout = newShadow;

    ALL_PAIRS.forEach(slot => {
      const stakeData = gameStakes[slot] || { primary: 0, backing: 0 };
      const totalCombinedStakePaid = stakeData.primary + stakeData.backing;

      if (winners.has(slot)) {
        newPriv[slot]   = 0;
        newBroken[slot] = 0;

        if (firstWin) {
          newSD    = 0;
          firstWin = false;
        } else {
          newBank  += shadowPayout;
          newShadow = 0;
          newSD     = 0;
        }
      } else {
        // If loss, total paired stakes accumulate inside the slot's private deficit pool
        newPriv[slot] = (newPriv[slot] || 0) + totalCombinedStakePaid;

        if (newPriv[slot] >= 1000) {
          if (newBank > 0) {
            const reduction = Math.min(newBank, 500);
            newBank        -= reduction;
            newPriv[slot]   -= reduction;
          }
          newBigDef[slot] = (newBigDef[slot] || 0) + newPriv[slot];
          newPriv[slot]   = 0;
        }
      }
    });

    // 3. Overflow target validation
    ALL_PAIRS.forEach(slot => {
      if ((newBroken[slot] || 0) >= 1000) {
        newBase += newBroken[slot];
        newBroken[slot] = 0;
      }
    });

    setSmallDeficit(newSD);
    setShadow(newShadow);
    setBank(newBank);
    setDeficit(newDef);
    setBaseStake(newBase);
    setPrivateDef(newPriv);
    setBigDef(newBigDef);
    setBrokenTarget(newBroken);

    setFixture(null); setInputA(""); setInputB("");
    setGameStakes(Object.fromEntries(ALL_PAIRS.map(k => [k, { primary: 0, backing: 0 }]))); 
    setBigStakes({});
    setWinners(new Set()); setBigWinners(new Set());
    setClicked(new Set()); setWinnerStake(0);

    saveBase({
      base: newBase, deficit: newDef,
      smallDeficit: newSD, shadow: newShadow, bank: newBank,
      privateDef: newPriv, bigDef: newBigDef, brokenTarget: newBroken,
    });
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";
  const hasBigDefs = ALL_PAIRS.some(k => (bigDef[k] || 0) > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-black to-slate-900 text-white flex flex-col">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0 border-b border-white/5">
        <div>
          <h1 className="text-sm font-black text-slate-300 tracking-wider uppercase">⚡ Paired Solo Matrix</h1>
          <div className="text-[9px] text-slate-500 mt-0.5">
            SD:{smallDeficit} · shadow:{shadow} · bank:{bank}
          </div>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button onClick={saveToAPI} className="px-4 py-1.5 bg-emerald-600 font-bold text-white text-xs active:bg-emerald-700 transition">💾 API</button>
          <button onClick={fetchFromAPI} disabled={isReloading} className="px-4 py-1.5 bg-slate-800 font-bold text-white text-xs disabled:opacity-50 active:bg-slate-700 transition flex items-center justify-center gap-1">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={11} />
            <span>API</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-3 pb-3 gap-3 overflow-y-auto">
        {/* ACTION BUTTONS */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={handleJackpot} disabled={!fixture} className={`py-4 rounded-2xl font-black text-sm transition active:scale-95 border-b-4 ${clicked.has("six") ? "bg-white text-emerald-600 border-emerald-300" : !fixture ? "bg-slate-900 border-slate-950 opacity-30 cursor-not-allowed" : "bg-yellow-400 text-black border-yellow-600"}`}>
            <div className="text-[10px] opacity-70 uppercase tracking-widest">6–0 Jackpot</div>
            <div className="text-xl font-black">{winnerStake || "—"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture} className={`py-4 rounded-2xl font-black text-sm transition active:scale-95 border-b-4 ${!fixture ? "bg-slate-900 border-slate-950 opacity-30 cursor-not-allowed text-white" : "bg-emerald-600 border-emerald-800 text-white"}`}>
            <div className="text-[10px] opacity-70 uppercase tracking-widest">Settle Slots</div>
            <div className="text-xl font-black">NEXT</div>
          </button>
        </div>

        {/* BIG DEFICIT SECTION */}
        {hasBigDefs && (
          <div className="bg-red-950/60 rounded-2xl p-2 border border-red-500/20">
            <div className="text-[8px] text-red-400 text-center tracking-widest uppercase mb-1">— Big Deficit Recovery —</div>
            <div className="grid grid-cols-5 gap-1.5">
              {ALL_PAIRS.filter(slot => (bigDef[slot] || 0) > 0).map(slot => {
                const bStake = bigStakes[slot] || 0;
                const combinedTotal = bStake + (gameStakes[slot]?.primary || 0) + (gameStakes[slot]?.backing || 0);
                return (
                  <button key={slot} onClick={() => markBigWin(slot)} disabled={!fixture || clicked.has(`b_${slot}`)} className={`py-3 rounded-xl font-black text-center transition active:scale-95 border-b-2 flex flex-col items-center justify-between min-h-[72px] ${bigWinners.has(slot) ? "bg-green-500 text-white border-green-700" : !fixture ? "bg-red-900/40 border-red-950 opacity-40 cursor-not-allowed" : "bg-red-600 text-white border-red-900"}`}>
                    <div className="text-[8px] opacity-60 font-bold">{PAIR_METADATA[slot].primary.toUpperCase()}</div>
                    <div className="text-base font-black text-white">{fixture ? combinedTotal : "—"}</div>
                    <div className="text-[7px] opacity-75 text-red-200">Def: {bigDef[slot]}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* MAIN SUB-ARRAY PAIRED GRID */}
        <div className="bg-slate-900/60 rounded-2xl p-2 border border-white/5">
          <div className="text-[8px] text-slate-500 text-center tracking-widest uppercase mb-2">— Paired Martingale Sub-Arrays —</div>
          <div className="grid grid-cols-2 gap-2">
            {ALL_PAIRS.map(slot => {
              const stakeData = gameStakes[slot] || { primary: 0, backing: 0 };
              const isWon = winners.has(slot);
              const meta = PAIR_METADATA[slot];
              return (
                <button key={slot} onClick={() => markWin(slot)} disabled={!fixture || clicked.has(`n_${slot}`)} className={`p-2.5 rounded-xl text-left transition active:scale-95 border-b-2 flex flex-col justify-between min-h-[85px] ${isWon ? "bg-green-500 border-green-700 text-white" : !fixture ? "bg-slate-900 border-slate-950 opacity-40" : `${PAIR_COLORS[slot]} text-white`}`}>
                  <div className="flex justify-between items-center w-full">
                    <span className="text-xs font-black tracking-wide uppercase bg-black/20 px-2 py-0.5 rounded text-white">{meta.label}</span>
                    <span className="text-[9px] opacity-80 font-mono">P: {privateDef[slot] || 0}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1 my-1.5 text-center">
                    <div className="bg-black/30 rounded p-1">
                      <div className="text-[8px] opacity-60 font-bold">{meta.primary}</div>
                      <div className="text-xs font-black text-yellow-300">{fixture ? stakeData.primary : "—"}</div>
                    </div>
                    <div className="bg-black/30 rounded p-1">
                      <div className="text-[8px] opacity-60 font-bold">{meta.backing}</div>
                      <div className="text-xs font-black text-cyan-300">{fixture ? stakeData.backing : "—"}</div>
                    </div>
                  </div>

                  <div className="text-[8px] text-white/60 font-medium flex justify-between w-full">
                    <span>Target Pool: {brokenTarget[slot] || 0}</span>
                    {fixture && <span className="font-bold text-white/90">Total: {stakeData.primary + stakeData.backing}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* INPUT PROCESSORS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home" className="flex-1 min-w-0 px-3 py-2.5 border border-slate-700 rounded-xl text-center text-sm bg-slate-900/60 text-white placeholder-slate-600 font-bold uppercase" />
            <span className="font-black text-sm text-slate-600 shrink-0">VS</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away" className="flex-1 min-w-0 px-3 py-2.5 border border-slate-700 rounded-xl text-center text-sm bg-slate-900/60 text-white placeholder-slate-600 font-bold uppercase" />
          </div>
          <button onClick={handleSubmit} disabled={!!fixture} className={`w-full py-3 font-black text-sm rounded-xl transition active:scale-95 uppercase tracking-widest ${fixture ? "bg-slate-900 text-slate-600 cursor-not-allowed opacity-40" : "bg-slate-100 text-black hover:bg-white"}`}>
            Calculate Setup Matrix
          </button>
        </div>

        {/* STATS CONTROL SHEETS */}
        <div className="bg-slate-900/80 rounded-xl p-3 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1.5 border border-white/5">
          <div className="flex justify-between"><span className="text-slate-400">Base Pool</span><strong className="text-emerald-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-slate-400">General Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-slate-400">SmallDef Total</span><strong className="text-purple-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-slate-400">Shadow Copy</span><strong className="text-blue-300">{shadow}</strong></div>
          <div className="flex justify-between col-span-2 border-b border-white/5 pb-1"><span className="text-slate-400">Overflow Bank</span><strong className="text-emerald-300">{bank}</strong></div>
          
          <div className="col-span-2">
            <div className="grid grid-cols-1 gap-1 mt-1">
              {ALL_PAIRS.map(slot => (
                <div key={slot} className="flex justify-between items-center text-[9px] bg-white/5 rounded px-2 py-1">
                  <span className="text-slate-300 font-black w-14">{PAIR_METADATA[slot].label}</span>
                  <span className="text-purple-300">PrivDef: <strong>{privateDef[slot]}</strong></span>
                  <span className="text-yellow-400">Target: <strong>{brokenTarget[slot]}</strong></span>
                  {bigDef[slot] > 0 ? <span className="text-red-400 font-bold">Big: {bigDef[slot]}</span> : <span className="text-slate-600">Big: —</span>}
                </div>
              ))}
            </div>
          </div>
          {fixture && <div className="col-span-2 pt-1 border-t border-white/5 text-center font-black text-[9px] text-purple-400 uppercase tracking-widest">{teamA} ⚔️ {teamB}</div>}
        </div>
      </div>
    </div>
  );
};

export default Homepage;
