
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY = "virt-epl-flat-helper-v2";

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

  // Builds the explicit helper assignment tree
  const getHelperMapAndStakes = useCallback((found, sd, pDefs, won, carried) => {
    const stakes = emptyObj();
    const map = {};
    const activeLosers = ASSET_KEYS.filter(k => !won.includes(k) && !carried.includes(k));
    const helperPool = [...won];

    activeLosers.forEach(k => { map[k] = []; });
    
    if (activeLosers.length > 0 && helperPool.length > 0) {
      let poolIdx = 0;
      while (poolIdx < helperPool.length) {
        for (let i = 0; i < activeLosers.length && poolIdx < helperPool.length; i++) {
          map[activeLosers[i]].push(helperPool[poolIdx]);
          poolIdx++;
        }
      }
    }

    activeLosers.forEach(loser => {
      const odd = found[ASSET_ODD_KEY[loser]] || 0;
      const pd = pDefs[loser] || 0;
      if (odd > 1.01) {
        stakes[loser] = Math.max(Math.round((sd + pd) / (odd - 1)), 10);
      }

      let runningChain = sd + pd + (stakes[loser] || 0);
      map[loser].forEach(helperKey => {
        const hOdd = found[ASSET_ODD_KEY[helperKey]] || 0;
        if (hOdd > 1.01) {
          stakes[helperKey] = Math.max(Math.round(runningChain / (hOdd - 1)), 10);
          runningChain += stakes[helperKey];
        }
      });
    });

    return { map, stakes };
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

    const { stakes } = getHelperMapAndStakes(found, curSD, privateDef, wonAssets, carriedAssets);
    setGameStakes(stakes);
  };

  const handleNext = () => {
    if (!fixture) return;

    let newPriv = { ...privateDef };
    let newWon = [...wonAssets];
    let newSD = smallDeficit;
    let newCarried = [...carriedAssets];
    let winOccurred = false;

    const { map } = getHelperMapAndStakes(fixture, smallDeficit, privateDef, wonAssets, carriedAssets);

    ASSET_KEYS.forEach(key => {
      const won = winners.has(key) || (clicked.has("six") && key === "six");
      const stake = gameStakes[key] || 0;
      if (won) winOccurred = true;

      // Carried handlers
      if (carriedAssets.includes(key)) {
        if (won) {
          if (!newWon.includes(key)) newWon.push(key);
          newCarried = newCarried.filter(c => c !== key);
          newPriv[key] = 0;
        }
        return;
      }

      // Track down context tree
      let leadLoser = key;
      let isHelper = false;
      Object.entries(map).forEach(([lead, hArr]) => {
        if (hArr.includes(key)) { leadLoser = lead; isHelper = true; }
      });

      const chain = [leadLoser, ...(map[leadLoser] || [])];
      const myIdx = chain.indexOf(key);

      if (won) {
        newPriv[key] = 0;
        if (!newWon.includes(key)) newWon.push(key);

        // Before total additions to Lead Loser
        const beforeTotal = chain.slice(0, myIdx).reduce((acc, k) => acc + (gameStakes[k] || 0), 0);
        if (beforeTotal > 0) newPriv[leadLoser] += beforeTotal;

        // If a helper wins, it clears the entire lead loser's private debt to 0!
        if (isHelper) {
          newPriv[leadLoser] = 0; 
          if (!newWon.includes(leadLoser) && !newCarried.includes(leadLoser)) {
            newCarried.push(leadLoser);
          }
        } else {
          newCarried = newCarried.filter(c => c !== key);
        }
      } else {
        // Lose condition: If it's a helper, route its stake into the lead loser's private deficit
        if (isHelper) {
          newPriv[leadLoser] += stake;
        } else if (!wonAssets.includes(key)) {
          newPriv[key] += stake;
        }
      }
    });

    if (winOccurred) newSD = 0;

    let nextWk = week + 1;
    let finalBase = baseStake;
    if (nextWk > 38) {
      nextWk = 1;
      let leftover = Object.values(newPriv).reduce((a, b) => a + b, 0);
      finalBase = 10000 + Math.max(0, leftover - bank);
      newPriv = emptyObj();
      newWon = [];
      newCarried = [];
      newSD = 0;
    }

    setPrivateDef(newPriv);
    setWonAssets(newWon);
    setCarriedAssets(newCarried);
    setSmallDeficit(newSD);
    setWeek(nextWk);
    setBaseStake(finalBase);
    setFixture(null); setInputA(""); setInputB(""); setGameStakes(emptyObj()); setClicked(new Set());
    saveBase({ base: finalBase, smallDeficit: newSD, week: nextWk, privateDef: newPriv, wonAssets: newWon, carriedAssets: newCarried });
  };

  // Find inverse helper mapping to print helper designations inside their native grids
  const { map: chainMap } = getHelperMapAndStakes(fixture || { winner: 2 }, smallDeficit, privateDef, wonAssets, carriedAssets);
  const helperAssignmentLabel = {};
  Object.entries(chainMap).forEach(([lead, helpers]) => {
    helpers.forEach(hKey => {
      helperAssignmentLabel[hKey] = ASSET_LABELS[lead];
    });
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      <div className="p-4 border-b border-white/10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-red-500 italic">BETKING</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Week {week} / 38</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => saveBase()} className="bg-green-600 p-2 rounded text-xs font-bold active:scale-95 transition">SAVE</button>
          <button onClick={fetchBase} disabled={isReloading} className="bg-slate-800 p-2 rounded text-xs active:scale-95 transition disabled:opacity-40">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setClicked(new Set([...clicked, "six"]))} 
            className={`p-4 rounded-xl font-bold flex flex-col items-center border-2 transition ${clicked.has("six") ? "bg-white text-black border-white" : "bg-red-600 border-red-500"}`}>
            <span className="text-xs opacity-80 font-black">6-0 JACKPOT</span>
            <span className="text-lg">{winnerStake}</span>
          </button>
          <button onClick={handleNext} disabled={!fixture} 
            className="bg-emerald-600 p-4 rounded-xl font-black text-lg shadow-lg disabled:opacity-30 active:scale-95 transition">
            NEXT GAME
          </button>
        </div>

        {/* Completely Flat Grid UI Cleaned Up */}
        <div className="grid grid-cols-2 gap-2">
          {ASSET_KEYS.map((key) => {
            const isWon = wonAssets.includes(key);
            const isCarried = carriedAssets.includes(key);
            const isWinning = winners.has(key);
            const stake = gameStakes[key] || 0;
            const targetLeadName = helperAssignmentLabel[key];
            
            return (
              <button
                key={key}
                onClick={() => {
                  setWinners(prev => {
                    const next = new Set(prev);
                    next.has(key) ? next.delete(key) : next.add(key);
                    return next;
                  });
                }}
                disabled={!fixture}
                className={`relative p-3 rounded-xl border-b-4 transition-all text-left active:translate-y-1 ${
                  isWon ? "bg-indigo-950 border-indigo-900 shadow-[0_0_8px_rgba(99,102,241,0.2)]" :
                  isWinning ? "bg-green-500 border-green-700" :
                  isCarried ? "bg-amber-500 border-amber-700" : "bg-slate-700 border-slate-900"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="font-black text-sm">{ASSET_LABELS[key]}</span>
                    {targetLeadName && (
                      <span className="text-[9px] font-extrabold text-cyan-300 mt-0.5">➔ FOR {targetLeadName}</span>
                    )}
                  </div>
                  {isWon && <span className="text-[8px] bg-indigo-500 px-1 rounded font-bold">HELPER</span>}
                  {isCarried && <span className="text-[8px] bg-white text-black px-1 rounded font-bold animate-pulse">CARRIED</span>}
                </div>
                <div className="mt-2 text-xl font-black text-center">{stake > 0 ? stake : (isCarried ? "0" : "-")}</div>
                <div className="text-[9px] opacity-60 font-bold mt-1 text-right">D: {privateDef[key]}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-4">
          <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home" className="bg-slate-900 p-3 rounded-lg border border-white/10 text-center uppercase font-bold" />
          <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away" className="bg-slate-900 p-3 rounded-lg border border-white/10 text-center uppercase font-bold" />
          <button onClick={handleSubmit} className="col-span-2 bg-red-600 p-4 rounded-xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition">Calculate Odds</button>
        </div>

        <div className="bg-white/5 p-4 rounded-2xl space-y-2 border border-white/10">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Current Small Deficit:</span>
            <span className="font-bold text-red-400">{smallDeficit}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Base Stake:</span>
            <span className="font-bold text-green-400">{baseStake}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
