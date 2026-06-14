import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY   = "virt-epl-solo-v1";

const ALL_PAIRS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"];

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

const emptyMap = (val = 0) => Object.fromEntries(ALL_PAIRS.map(k => [k, val]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture,     setFixture]     = useState(null);

  /* ── CONSTANT STRATEGY CONFIGURATIONS ── */
  const [smallDeficit, setSmallDeficit] = useState(150);
  const [bank,         setBank]         = useState(0);

  /* ── PER-PAIR POOLS ── */
  const [privateDef,   setPrivateDef]   = useState(emptyMap(0));
  const [brokenTarget, setBrokenTarget] = useState(emptyMap(0));
  const [activePairs,  setActivePairs]  = useState(emptyMap(true));

  /* ── CALCULATED GAME STAKES ── */
  const [gameStakes, setGameStakes] = useState(Object.fromEntries(ALL_PAIRS.map(k => [k, { primary: 0, backing: 0 }])));

  /* ── WIN ASSESSMENT CAPTURES ── */
  const [primaryWins, setPrimaryWins] = useState(new Set());
  const [backingWins, setBackingWins] = useState(new Set());

  const applyData = useCallback((d) => {
    setSmallDeficit(d.smallDeficit ?? 150);
    setBank(d.bank                 ?? 0);
    setPrivateDef(d.privateDef     || emptyMap(0));
    setBrokenTarget(d.brokenTarget || emptyMap(0));
    setActivePairs(d.activePairs   || emptyMap(true));
  }, []);

  const fetchBase = useCallback(() => {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) {
        applyData(JSON.parse(s));
        console.log("💾 Loaded saved configuration locally");
      }
    } catch (err) {
      console.error("❌ Local retrieval failure:", err.message);
    }
  }, [applyData]);

  const saveBase = useCallback((overrides = {}) => {
    const p = {
      smallDeficit, bank, privateDef, brokenTarget, activePairs, ...overrides
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p));
    } catch (err) {
      console.error("❌ Storage update failure:", err.message);
    }
  }, [smallDeficit, bank, privateDef, brokenTarget, activePairs]);

  const fetchFromAPI = useCallback(async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) {
        applyData(res.data);
        localStorage.setItem(LS_KEY, JSON.stringify(res.data));
      }
    } catch (err) {
      console.error("❌ API synchronisation loss:", err.message);
    } finally {
      setIsReloading(false);
    }
  }, [applyData]);

  const saveToAPI = useCallback(async () => {
    const p = { smallDeficit, bank, privateDef, brokenTarget, activePairs };
    try {
      await axios.put(API_BASE, p);
      alert("Cloud state matching complete.");
    } catch (err) {
      console.error("❌ API remote state push failed:", err.message);
    }
  }, [smallDeficit, bank, privateDef, brokenTarget, activePairs]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  /* ================================================================
     CALCULATE MATRICES
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";
    const found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert(`Odds profile non-existent for targets.`); return; }

    setFixture(found);
    setPrimaryWins(new Set());
    setBackingWins(new Set());

    const newStakes = {};
    ALL_PAIRS.forEach(slot => {
      if (!activePairs[slot]) {
        newStakes[slot] = { primary: 0, backing: 0 };
        return;
      }

      const pKey = PAIR_METADATA[slot].primary;
      const bKey = PAIR_METADATA[slot].backing;
      const oddP = found[pKey] || 0;
      const oddB = found[bKey] || 0;

      const targetPool = (brokenTarget[slot] || 0) + smallDeficit + (privateDef[slot] || 0);

      let stakeP = 0;
      let stakeB = 0;

      if (oddP > 1.01 && oddB > 1.01) {
        const denominator = (oddP * oddB) - oddP - oddB;
        if (denominator > 0) {
          stakeP = Math.round((targetPool * oddB) / denominator);
          stakeB = Math.round((targetPool * oddP) / denominator);
        } else {
          stakeP = Math.round(targetPool / (oddP - 1));
          stakeB = Math.round(targetPool / (oddB - 1));
        }
      }
      newStakes[slot] = { primary: Math.max(stakeP, 0), backing: Math.max(stakeB, 0) };
    });
    setGameStakes(newStakes);
  };

  /* ── TARGETED VALUE CAPTURES ── */
  const togglePrimaryWin = (slot) => {
    if (!fixture || !activePairs[slot]) return;
    setPrimaryWins(prev => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot); else next.add(slot);
      return next;
    });
  };

  const toggleBackingWin = (slot) => {
    if (!fixture || !activePairs[slot]) return;
    setBackingWins(prev => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot); else next.add(slot);
      return next;
    });
  };

  const resetDeactivatedArrays = () => {
    const activeReset = emptyMap(true);
    setActivePairs(activeReset);
    setSmallDeficit(150);
    saveBase({ activePairs: activeReset, smallDeficit: 150 });
    alert("All 10 Martingale arrays restored.");
  };

  /* ================================================================
     SETTLE GAME TICK RULES
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    let runningSmallDeficitModifier = 0; 
    let newBank = bank;
    let newPriv = { ...privateDef };
    let newActive = { ...activePairs };
    let newBroken = { ...brokenTarget };

    ALL_PAIRS.forEach(slot => {
      if (!activePairs[slot]) return;

      const stakes = gameStakes[slot] || { primary: 0, backing: 0 };
      const hasPrimaryWon = primaryWins.has(slot);
      const hasBackingWon = backingWins.has(slot);

      if (hasPrimaryWon || hasBackingWon) {
        newActive[slot] = false;
        newPriv[slot] = 0; 
        newBroken[slot] = 0;

        if (hasPrimaryWon && !hasBackingWon) {
          runningSmallDeficitModifier += stakes.backing;
        }
        if (hasBackingWon && !hasPrimaryWon) {
          runningSmallDeficitModifier += stakes.primary;
        }
      } else {
        const combinedLossSum = stakes.primary + stakes.backing;
        newPriv[slot] = (newPriv[slot] || 0) + combinedLossSum;
      }
    });

    const balancedSmallDeficit = Math.max(150, smallDeficit + runningSmallDeficitModifier);

    setSmallDeficit(balancedSmallDeficit);
    setBank(newBank);
    setPrivateDef(newPriv);
    setActivePairs(newActive);
    setBrokenTarget(newBroken);

    setFixture(null); setInputA(""); setInputB("");
    setGameStakes(Object.fromEntries(ALL_PAIRS.map(k => [k, { primary: 0, backing: 0 }])));
    setPrimaryWins(new Set()); setBackingWins(new Set());

    saveBase({
      smallDeficit: balancedSmallDeficit,
      bank: newBank,
      privateDef: newPriv,
      activePairs: newActive,
      brokenTarget: newBroken
    });
  };

  const activeCount = ALL_PAIRS.filter(k => activePairs[k]).length;
  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-black to-slate-900 text-white flex flex-col font-sans">
      
      {/* HEADER PANELS */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0 border-b border-white/5">
        <div>
          <h1 className="text-sm font-black text-slate-300 tracking-wider uppercase">⚡ Array Matrix Strategy</h1>
          <div className="text-[10px] text-purple-400 mt-0.5 font-bold">
            Target Unit: {smallDeficit} CP · Active Arrays: {activeCount} / 10
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={resetDeactivatedArrays} className="px-2.5 py-1 bg-amber-600 font-bold rounded text-[10px] uppercase tracking-wider text-white">Reset Arrays</button>
          <div className="flex rounded overflow-hidden border border-white/10">
            <button onClick={saveToAPI} className="px-3 py-1 bg-emerald-600 font-bold text-[10px] text-white">💾 API</button>
            <button onClick={fetchFromAPI} disabled={isReloading} className="px-3 py-1 bg-slate-800 font-bold text-[10px] text-white flex items-center gap-1">
              <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={9} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-3 pb-3 gap-3 overflow-y-auto">
        
        {/* RUN ACTION ENGINE */}
        <div className="mt-2">
          <button onClick={handleNext} disabled={!fixture} className={`w-full py-3.5 rounded-xl font-black text-sm transition active:scale-95 border-b-4 ${!fixture ? "bg-slate-900 border-slate-950 opacity-30 cursor-not-allowed text-white" : "bg-emerald-600 border-emerald-800 text-white"}`}>
            SETTLE ROUND & UPDATE ARRAYS
          </button>
        </div>

        {/* TRACKING MODULE ACTIVE PAIRS GRID */}
        <div className="bg-slate-900/60 rounded-2xl p-2 border border-white/5">
          <div className="text-[8px] text-slate-500 text-center tracking-widest uppercase mb-2">— Active Sub-Array Pairing Sets —</div>
          <div className="grid grid-cols-1 gap-2">
            {ALL_PAIRS.map(slot => {
              const isActive = activePairs[slot];
              const meta = PAIR_METADATA[slot];
              const stakes = gameStakes[slot] || { primary: 0, backing: 0 };
              const isPWin = primaryWins.has(slot);
              const isBWin = backingWins.has(slot);

              if (!isActive) {
                return (
                  <div key={slot} className="p-2 rounded-xl bg-slate-950/40 border border-dashed border-white/5 flex justify-between items-center opacity-30 grayscale">
                    <span className="text-xs font-bold text-slate-500 line-through">{meta.label}</span>
                    <span className="text-[9px] text-red-500 font-black uppercase tracking-widest bg-red-950/40 px-2 py-0.5 rounded">Deactivated (Win)</span>
                  </div>
                );
              }

              return (
                <div key={slot} className={`p-2.5 rounded-xl transition border-b-2 text-white flex flex-col gap-2 ${PAIR_COLORS[slot]}`}>
                  <div className="flex justify-between items-center w-full">
                    <span className="text-xs font-black uppercase bg-black/20 px-2 py-0.5 rounded">{meta.label}</span>
                    <span className="text-[10px] font-mono bg-black/40 px-2 py-0.5 rounded text-yellow-300">Deficit Pool: {privateDef[slot] || 0}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => togglePrimaryWin(slot)} disabled={!fixture} className={`p-2 rounded-lg transition font-black text-center border ${isPWin ? "bg-green-500 border-white text-white" : "bg-black/20 border-transparent hover:bg-black/30"}`}>
                      <div className="text-[9px] uppercase tracking-wider text-white/70">{meta.primary}</div>
                      <div className="text-sm text-white">{fixture ? stakes.primary : "—"}</div>
                      {isPWin && <span className="text-[8px] block text-green-100 uppercase">HIT</span>}
                    </button>

                    <button onClick={() => toggleBackingWin(slot)} disabled={!fixture} className={`p-2 rounded-lg transition font-black text-center border ${isBWin ? "bg-green-500 border-white text-white" : "bg-black/20 border-transparent hover:bg-black/30"}`}>
                      <div className="text-[9px] uppercase tracking-wider text-white/70">{meta.backing}</div>
                      <div className="text-sm text-white">{fixture ? stakes.backing : "—"}</div>
                      {isBWin && <span className="text-[8px] block text-green-100 uppercase">HIT</span>}
                    </button>
                  </div>
                </div>
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
            Calculate Live Stakes
          </button>
        </div>

        {/* STATS CONTROL SHEETS */}
        <div className="bg-slate-900/80 rounded-xl p-3 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1.5 border border-white/5">
          <div className="flex justify-between"><span className="text-slate-400">SmallDef Total</span><strong className="text-purple-400">{smallDeficit}</strong></div>
          <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-slate-400">Overflow Bank</span><strong className="text-emerald-300">{bank}</strong></div>
          
          <div className="col-span-2">
            <div className="grid grid-cols-1 gap-1 mt-1">
              {ALL_PAIRS.map(slot => (
                <div key={slot} className="flex justify-between items-center text-[9px] bg-white/5 rounded px-2 py-1">
                  <span className="text-slate-300 font-black w-14">{PAIR_METADATA[slot].label}</span>
                  <span className="text-purple-300">PrivDef: <strong>{privateDef[slot]}</strong></span>
                  <span className="text-yellow-400">Target: <strong>{brokenTarget[slot]}</strong></span>
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
