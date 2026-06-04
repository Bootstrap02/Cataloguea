
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY   = "virt-epl-horizontal-v1";

// Strict Order of Importance
const ASSET_KEYS = ["oneX","twoX","x2","tg0","tg6","ht12","ht21","ht30","ft40","ft41"];
const ASSET_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2", tg0:"TG0", tg6:"TG6",
  ht12:"HT12", ht21:"HT21", ht30:"HT30", ft40:"FT40", ft41:"FT41"
};
const ASSET_ODD_KEY = {
  oneX:"oneX", twoX:"twoX", x2:"x2", tg0:"tg0", tg6:"tg6",
  ht12:"ht12", ht21:"ht21", ht30:"ht30", ft40:"ft40", ft41:"ft41"
};
const ASSET_COLORS = {
  oneX:"bg-purple-600", twoX:"bg-pink-600", x2:"bg-lime-600",
  tg0:"bg-cyan-600", tg6:"bg-teal-600", ht12:"bg-blue-600",
  ht21:"bg-emerald-600", ht30:"bg-green-600", ft40:"bg-indigo-600", ft41:"bg-violet-600"
};

const emptyObj = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  const [baseStake, setBaseStake] = useState(10000);
  const [deficit, setDeficit] = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [week, setWeek] = useState(1);
  const [bank, setBank] = useState(0);

  const [privateDef, setPrivateDef] = useState(emptyObj());
  const [wonAssets, setWonAssets] = useState([]); 
  const [carriedAssets, setCarriedAssets] = useState([]); 
  const [helpers, setHelpers] = useState({}); 
  const [gameStakes, setGameStakes] = useState(emptyObj());

  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  const applyData = useCallback((d) => {
    setBaseStake(d.base ?? 10000);
    setDeficit(d.deficit ?? 0);
    setSmallDeficit(d.smallDeficit ?? 0);
    setWeek(d.week ?? 1);
    setPrivateDef(d.privateDef || emptyObj());
    setWonAssets(d.wonAssets || []);
    setCarriedAssets(d.carriedAssets || []);
    setHelpers(d.helpers || {});
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
      base: baseRef.current, deficit, smallDeficit, week,
      privateDef, wonAssets, carriedAssets, helpers, bank,
      ...overrides
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
    try { await axios.put(API_BASE, p); } catch (err) { console.error("❌ save:", err.message); }
  }, [deficit, smallDeficit, week, privateDef, wonAssets, carriedAssets, helpers, bank]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  // Round-Robin Assignment based strictly on defined order of importance
  const assignHelpers = (wonArr, carriedArr) => {
    const losers = ASSET_KEYS.filter(k => !wonArr.includes(k) && !carriedArr.includes(k));
    const pool = [...wonArr]; 
    const map = {};
    
    losers.forEach(k => { map[k] = []; });
    if (losers.length === 0 || pool.length === 0) return map;

    let poolIdx = 0;
    while (poolIdx < pool.length) {
      for (let i = 0; i < losers.length && poolIdx < pool.length; i++) {
        map[losers[i]].push(pool[poolIdx]);
        poolIdx++;
      }
    }
    return map;
  };

  // Standard Martingale chain generation per active group
  const buildGameStakes = (found, sd, privMap, wonArr, helpMap, carriedArr) => {
    const stakes = emptyObj();
    const losers = ASSET_KEYS.filter(k => !wonArr.includes(k) && !carriedArr.includes(k));

    losers.forEach(loser => {
      const odd = found[ASSET_ODD_KEY[loser]] || 0;
      const pd = privMap[loser] || 0;
      if (odd > 1.01) {
        stakes[loser] = Math.max(Math.round((sd + pd) / (odd - 1)), 10);
      }

      let runningChainDeficit = (sd + pd) + (stakes[loser] || 0);
      const chainHelpers = helpMap[loser] || [];

      chainHelpers.forEach(hk => {
        const hodd = found[ASSET_ODD_KEY[hk]] || 0;
        if (hodd > 1.01) {
          stakes[hk] = Math.max(Math.round(runningChainDeficit / (hodd - 1)), 10);
          runningChainDeficit += stakes[hk];
        }
      });
    });

    return stakes;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";
    const found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    setFixture(found);
    setClicked(new Set());
    setWinners(new Set());

    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);

    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    const curSD = smallDeficit + wStake;
    setSmallDeficit(curSD);

    const helpMap = assignHelpers(wonAssets, carriedAssets);
    setHelpers(helpMap);

    const stakes = buildGameStakes(found, curSD, privateDef, wonAssets, helpMap, carriedAssets);
    setGameStakes(stakes);
  };

  const markWin = (key) => {
    if (!fixture || clicked.has(key)) return;
    setClicked(p => new Set([...p, key]));
    setWinners(p => new Set([...p, key]));
  };

  const handleJackpot = () => {
    setClicked(p => new Set([...p, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  const handleNext = () => {
    if (!fixture) return;

    let newPriv = { ...privateDef };
    let newWon = [...wonAssets];
    let newSD = smallDeficit;
    let newCarried = [...carriedAssets];
    let newBank = bank;

    ASSET_KEYS.forEach(key => {
      if (wonAssets.includes(key)) return; 

      const won = winners.has(key);
      const stake = gameStakes[key] || 0;

      // Clicked carried assets exit status and directly enter winner pool
      if (carriedAssets.includes(key)) {
        if (won) {
          newPriv[key] = 0;
          if (!newWon.includes(key)) newWon.push(key);
          newCarried = newCarried.filter(k => k !== key);
        }
        return;
      }

      let leadLoser = null;
      let isHelperKey = false;

      if (!Object.values(helpers).flat().includes(key)) {
        leadLoser = key;
      } else {
        Object.entries(helpers).forEach(([loser, hArr]) => {
          if (hArr.includes(key)) { leadLoser = loser; isHelperKey = true; }
        });
      }

      const chain = leadLoser ? [leadLoser, ...(helpers[leadLoser] || [])] : [key];
      const myIdx = chain.indexOf(key);

      if (won) {
        newPriv[key] = 0;
        if (!newWon.includes(key)) newWon.push(key);

        const beforeTotal = chain.slice(0, myIdx).reduce((s, k) => s + (gameStakes[k] || 0), 0);
        const afterTotal = chain.slice(myIdx + 1).reduce((s, k) => s + (gameStakes[k] || 0), 0);

        if (beforeTotal > 0) {
          newPriv[leadLoser] = (newPriv[leadLoser] || 0) + beforeTotal;
        }
        if (afterTotal > 0) {
          newSD += afterTotal;
        }

        // If a helper pulled the win, the main loser gets carried along
        if (isHelperKey && leadLoser && !newWon.includes(leadLoser)) {
          if (!newCarried.includes(leadLoser)) newCarried.push(leadLoser);
        }
        if (!isHelperKey) {
          newCarried = newCarried.filter(k => k !== key);
        }
      } else {
        newPriv[key] = (newPriv[key] || 0) + stake;
      }
    });

    let nextWk = week + 1;
    let finalBase = baseStake;

    // End of Season Clean up
    if (nextWk > 38) {
      nextWk = 1;
      newWon = [];
      newCarried = [];
      newSD = 0;

      // Handle deficit transfer logic using the bank
      let leftoverDeficit = 0;
      ASSET_KEYS.forEach(k => {
        leftoverDeficit += newPriv[k];
      });

      if (newBank >= leftoverDeficit) {
        newBank -= leftoverDeficit;
        leftoverDeficit = 0;
      } else {
        leftoverDeficit -= newBank;
        newBank = 0;
      }

      finalBase = 10000 + leftoverDeficit;
      newPriv = emptyObj(); 
    }

    const nextHelpers = assignHelpers(newWon, newCarried);

    setPrivateDef(newPriv);
    setWonAssets(newWon);
    setCarriedAssets(newCarried);
    setHelpers(nextHelpers);
    setSmallDeficit(newSD);
    setBank(newBank);
    setWeek(nextWk);
    setBaseStake(finalBase);

    setFixture(null); setInputA(""); setInputB("");
    setGameStakes(emptyObj()); setWinners(new Set()); setClicked(new Set());
    setWinnerStake(0);

    saveBase({
      base: finalBase, smallDeficit: newSD, week: nextWk,
      privateDef: newPriv, wonAssets: newWon, carriedAssets: newCarried,
      helpers: nextHelpers, bank: newBank
    });
  };

  const activeLosers = ASSET_KEYS.filter(k => !wonAssets.includes(k) && !carriedAssets.includes(k));
  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  const btnCls = (key, isWon) =>
    `py-3 rounded-xl font-bold text-[9px] transition active:scale-95 w-full shadow-sm border border-white/10 ${
      isWon ? "bg-green-500 text-white ring-2 ring-green-300"
      : !fixture ? `${ASSET_COLORS[key]} opacity-40 cursor-not-allowed text-white`
      : `${ASSET_COLORS[key]} text-white`
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <h1 className="text-sm font-extrabold text-red-400">Virtual EPL</h1>
          <div className="flex gap-1.5 mt-0.5">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${week >= 35 ? "bg-red-500" : "bg-white/10"}`}>
              WK {week}/38
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/10">
              {wonAssets.length}/10 WON
            </span>
          </div>
        </div>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={() => saveBase()} className="px-3 py-1.5 bg-green-600 text-xs font-bold">💾</button>
          <button onClick={fetchBase} disabled={isReloading} className="px-3 py-1.5 bg-red-600 text-xs font-bold disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={10} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-3 pb-3 gap-2.5 overflow-y-auto">
        {/* TOP INTERACTION CONTROL */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleJackpot} className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture} className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 ${!fixture ? "bg-gray-700 opacity-40 cursor-not-allowed" : "bg-green-700"}`}>
            <div className="font-black">NEXT</div>
          </button>
        </div>

        {/* ACTIVE HORIZONTAL BATTLE GROUPS */}
        {activeLosers.map(lead => {
          const chainHelpers = helpers[lead] || [];
          return (
            <div key={lead} className="bg-black/20 rounded-2xl p-2 border border-white/5">
              <div className="text-[8px] text-gray-400 text-center tracking-widest mb-1">
                TARGET ➔ SD: {smallDeficit} + D: {privateDef[lead]}
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${1 + chainHelpers.length}, 1fr)` }}>
                {/* Lead Component */}
                <button onClick={() => markWin(lead)} disabled={!fixture || clicked.has(lead)} className={btnCls(lead, winners.has(lead))}>
                  <div className="font-black">{ASSET_LABELS[lead]}</div>
                  <div className="mt-0.5">{gameStakes[lead] || "–"}</div>
                  <div className="text-[7px] opacity-60">D:{privateDef[lead]}</div>
                </button>
                {/* Linked Round-Robin Helpers */}
                {chainHelpers.map((hk, idx) => (
                  <button key={hk} onClick={() => markWin(hk)} disabled={!fixture || clicked.has(hk)} className={btnCls(hk, winners.has(hk))}>
                    <div className="font-black">{ASSET_LABELS[hk]}</div>
                    <div className="mt-0.5">{gameStakes[hk] || "–"}</div>
                    <div className="text-[7px] opacity-60">H{idx + 1}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* CARRIED ASSETS VIEW (0 STAKE) */}
        {carriedAssets.length > 0 && (
          <div className="bg-black/10 rounded-2xl p-2 border border-yellow-500/20">
            <div className="text-[8px] text-yellow-400 text-center tracking-widest mb-1">— CARRIED (TAP TO SELF-WIN) —</div>
            <div className="grid grid-cols-5 gap-1.5">
              {carriedAssets.filter(k => !wonAssets.includes(k)).map(k => (
                <button key={k} onClick={() => markWin(k)} disabled={!fixture || clicked.has(k)} className={`py-3 rounded-xl font-bold text-[9px] border border-yellow-400/40 transition active:scale-95 w-full ${winners.has(k) ? "bg-green-500" : `${ASSET_COLORS[k]} opacity-60`}`}>
                  <div className="font-black">{ASSET_LABELS[k]}</div>
                  <div className="mt-0.5 text-yellow-300 text-[7px]">carried</div>
                  <div className="text-[7px] opacity-60">D:{privateDef[k]}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* COMPLETED/WON TRACKING ROW */}
        {wonAssets.length > 0 && (
          <div className="bg-black/10 rounded-2xl p-2 border border-green-500/20">
            <div className="text-[8px] text-green-400 text-center tracking-widest mb-1">— ASSIGNED HELPERS POOL —</div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {wonAssets.map(k => (
                <span key={k} className={`px-2 py-1 rounded-lg text-[9px] font-bold ${ASSET_COLORS[k]} opacity-70`}>
                  {ASSET_LABELS[k]} ✓
                </span>
              ))}
            </div>
          </div>
        )}

        {/* INPUTS AND CONFIGURATION */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home" className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent placeholder-red-400 focus:outline-none" />
            <span className="font-black text-lg text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away" className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent placeholder-red-400 focus:outline-none" />
          </div>
          <button onClick={handleSubmit} disabled={!!fixture} className={`w-full py-3 font-bold text-sm rounded-xl transition active:scale-95 ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed" : "bg-red-700 hover:bg-red-600"}`}>
            CALCULATE
          </button>
        </div>

        {/* ANALYTICAL OVERVIEW PANEL */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base Stake</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Yield Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Small Deficit</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank Savings</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="col-span-2 border-t border-white/10 pt-1.5 grid grid-cols-2 gap-1">
            {ASSET_KEYS.map(k => (
              <div key={k} className="flex justify-between">
                <span className={wonAssets.includes(k) ? "text-green-400" : "text-gray-500"}>
                  {ASSET_LABELS[k]}{wonAssets.includes(k) ? " (Helper)" : ""}
                </span>
                <strong>{privateDef[k]}</strong>
              </div>
            ))}
          </div>
          {fixture && (
            <div className="col-span-2 pt-1 border-t border-white/10 text-center font-bold text-[9px]">
              <span className="uppercase">{teamA}</span> <span className="text-gray-400 mx-1">vs</span> <span className="uppercase">{teamB}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Homepage;
