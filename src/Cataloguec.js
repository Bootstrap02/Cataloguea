
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const ASSET_KEYS = ["oneX","twoX","x2","tg0","tg6","ht12","ht21","ht30","ft40","ft41"];
const ASSET_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2", tg0:"Tg0", tg6:"Tg6 ",
  ht12:"HT12", ht21:"HT21", ht30:"HT30", ft40:"FT40", ft41:"FT41"
};
const ASSET_ODD_KEY = {
  oneX:"oneX", twoX:"twoX", x2:"x2", tg0:"tg0", tg6:"tg6",
  ht12:"ht12", ht21:"ht21", ht30:"ht30", ft40:"ft40", ft41:"ft41"
};
const LEVEL_COLORS = [
  "bg-gray-600",      // L1
  "bg-purple-600",    // L2
  "bg-blue-600",      // L3
  "bg-cyan-600",      // L4
  "bg-emerald-600",   // L5
  "bg-orange-600",    // L6
  "bg-red-600",       // L7
];

const MAX_LEVEL = 7;
const WIN_LIMIT  = 18;

const emptyPerAsset = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));
// assetLevels: which level each asset is on (1-7)
const defaultLevels  = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 1]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  /* ── WINNER ── */
  const [baseStake,    setBaseStake]    = useState(10000);
  const [deficit,      setDeficit]      = useState(0);
  const [winnerStake,  setWinnerStake]  = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [bank, setBank] = useState(0);
  /* ── WEEK & WIN COUNT ── */
  const [week,     setWeek]     = useState(1);
  const [winCount, setWinCount] = useState(0);
  const [paused,   setPaused]   = useState(false);

  /* ── ASSET LEVELS (1-7) ── */
  const [assetLevels, setAssetLevels] = useState(defaultLevels());

  /* ── PRIVATE DEFICITS per asset (one per asset regardless of level) ── */
  const [privDefs, setPrivDefs] = useState(emptyPerAsset());

  /* ── TOTAL DEFICITS per level (L1→L6, no L7 total) ── */
  const [total1, setTotal1] = useState(0);
  const [total2, setTotal2] = useState(0);
  const [total3, setTotal3] = useState(0);
  const [total4, setTotal4] = useState(0);
  const [total5, setTotal5] = useState(0);
  const [total6, setTotal6] = useState(0);
  const [grandDeficit, setGrandDeficit] = useState(0);
  

  
  /* ── CURRENT GAME STAKES ── */
  const [gameStakes, setGameStakes] = useState(emptyPerAsset());

  /* ── WINNERS THIS GAME ── */
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);


  /* ================================================================
     API
     ================================================================ */
  const LS_KEY = "virt-epl-7level";

  const applyData = (d) => {
    setBaseStake(d.base ?? 10000);
    setDeficit(d.deficit ?? 0);
    setSmallDeficit(d.smallDeficit ?? 0);
    setWeek(d.week ?? 1);
    setWinCount(d.winCount ?? 0);
    setPaused(d.paused ?? false);
    setAssetLevels(d.assetLevels || defaultLevels());
    setPrivDefs(d.privDefs || emptyPerAsset());
    setTotal1(d.total1 ?? 0);
    setTotal2(d.total2 ?? 0);
    setTotal3(d.total3 ?? 0);
    setTotal4(d.total4 ?? 0);
    setTotal5(d.total5 ?? 0);
    setTotal6(d.total6 ?? 0);
    setGrandDeficit(d.grandDeficit ?? 0);
  };

  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) applyData(res.data);
    } catch (err) {
      console.error("❌ fetch:", err.message);
      /* Fallback to localStorage */
      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) applyData(JSON.parse(saved));
      } catch (_) {}
    } finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    const payload = {
      base: baseRef.current, deficit, smallDeficit,
      week, winCount, paused,
      assetLevels, privDefs,
      total1, total2, total3, total4, total5, total6,
      grandDeficit,
    };
    /* Always save to localStorage */
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch (_) {}
    /* Also save to backend */
    try { await axios.put(API_BASE, payload); }
    catch (err) { console.error("❌ save:", err.message); }
  };

  useEffect(() => { fetchBase(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Stake calc for an asset given its level ── */
  const calcStake = (key, found, levels, priv, sd, t1,t2,t3,t4,t5,t6,gd) => {
    const odd = found[ASSET_ODD_KEY[key]] || 0;
    if (odd <= 1.01) return 0;
    const lv = levels[key];
    const pd = priv[key] || 0;
    const ts = [0,sd,t1,t2,t3,t4,t5]; // target for each level: L1→sd, L2→t1, ..., L7→t6+gd
    let target;
    if (lv === 7) {
      target = t6 + gd + pd;
    } else {
      target = (ts[lv] || 0) + pd;
    }
    return Math.max(Math.round(target / (odd - 1)), 10);
  };

  /* ================================================================
     HANDLE SUBMIT
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

    /* ── Winner stake ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    setSmallDeficit(prev => prev + wStake);
    const curSD = smallDeficit + wStake;

    /* ── Calc stakes for all assets ── */
    const newStakes = emptyPerAsset();
    if (!paused) {
      ASSET_KEYS.forEach(key => {
        newStakes[key] = calcStake(
          key, found, assetLevels, privDefs,
          curSD, total1, total2, total3, total4, total5, total6, grandDeficit
        );
      });
    }
    setGameStakes(newStakes);
  };

  /* ── Mark win ── */
  const markWin = (key) => {
    if (!fixture || clicked.has(key) || paused) return;
    setClicked(p => new Set([...p, key]));
    setWinners(p => new Set([...p, key]));
  };

  /* ── 6-0 jackpot ── */
  const handleJackpot = () => {
    setClicked(p => new Set([...p, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNext = () => {
  if (!fixture) return;

  const newPriv = { ...privDefs };
  const newLevels = { ...assetLevels };

  let nt1 = total1;
  let nt2 = total2;
  let nt3 = total3;
  let nt4 = total4;
  let nt5 = total5;
  let nt6 = total6;

  let newSD = smallDeficit;
  let ngd = grandDeficit;

  let newWinCount = winCount;
  let newPaused = paused;

  /* shadows for double wins */
  let sdShadow = 0;
  let t1Shadow = 0;
  let t2Shadow = 0;
  let t3Shadow = 0;
  let t4Shadow = 0;
  let t5Shadow = 0;
  let t6Shadow = 0;

  /* track how many winners happened per level */
  const levelWins = {
    1:0,
    2:0,
    3:0,
    4:0,
    5:0,
    6:0,
    7:0
  };

  /* ===============================
     SETTLE EVERY ASSET
  =============================== */

  ASSET_KEYS.forEach(key => {

    const lv = newLevels[key];
    const won = winners.has(key);
    const stake = gameStakes[key] || 0;
    const pd = newPriv[key] || 0;

    if (won) {

      newWinCount++;
      levelWins[lv]++;

      /* ----------------------------
         remove priv deficit from
         previous target totals
      ---------------------------- */

      if (lv === 2) nt1 = Math.max(0, nt1 - pd);
      if (lv === 3) nt2 = Math.max(0, nt2 - pd);
      if (lv === 4) nt3 = Math.max(0, nt3 - pd);
      if (lv === 5) nt4 = Math.max(0, nt4 - pd);
      if (lv === 6) nt5 = Math.max(0, nt5 - pd);
      if (lv === 7) nt6 = Math.max(0, nt6 - pd);

      /* ----------------------------
         clear current level deficit
         using shadow logic
      ---------------------------- */

      if (lv === 1) {
       setTotal1((prev) => prev - pd) 
        if (levelWins[1] === 1) {
          sdShadow = newSD;
          newSD = 0;
        } else {
          bank += sdShadow;
          sdShadow = 0;
        }

      }

      if (lv === 2) {

        if (levelWins[2] === 1) {
          t1Shadow = nt1;
          nt1 = 0;
        } else {
          bank += t1Shadow;
          t1Shadow = 0;
        }

      }

      if (lv === 3) {

        if (levelWins[3] === 1) {
          t2Shadow = nt2;
          nt2 = 0;
        } else {
          bank += t2Shadow;
          t2Shadow = 0;
        }

      }

      if (lv === 4) {

        if (levelWins[4] === 1) {
          t3Shadow = nt3;
          nt3 = 0;
        } else {
          bank += t3Shadow;
          t3Shadow = 0;
        }

      }

      if (lv === 5) {

        if (levelWins[5] === 1) {
          t4Shadow = nt4;
          nt4 = 0;
        } else {
          bank += t4Shadow;
          t4Shadow = 0;
        }

      }

      if (lv === 6) {

        if (levelWins[6] === 1) {
          t5Shadow = nt5;
          nt5 = 0;
        } else {
          bank += t5Shadow;
          t5Shadow = 0;
        }

      }

      if (lv === 7) {

        if (levelWins[7] === 1) {
          t6Shadow = nt6;
          nt6 = 0;
        } else {
          bank += t6Shadow;
          t6Shadow = 0;
        }

      }

      /* clear priv deficit */

      newPriv[key] = 0;

      /* move asset UP one level */

      if (lv < MAX_LEVEL) {

        newLevels[key] = lv + 1;

      }

    }

    else {

      /* -----------------------
         LOSSES
      ----------------------- */

      newPriv[key] += stake;

      if (lv === 1) newSD += stake;
      else if (lv === 2) nt1 += stake;
      else if (lv === 3) nt2 += stake;
      else if (lv === 4) nt3 += stake;
      else if (lv === 5) nt4 += stake;
      else if (lv === 6) nt5 += stake;
      else if (lv === 7) nt6 += stake;

    }

  });

  if (newWinCount >= WIN_LIMIT) {

    newPaused = true;

  }

  let newWeek = week + 1;

  if (newWeek > 38) {

    newWeek = 1;
    newWinCount = 0;
    newPaused = false;

  }

  setSmallDeficit(newSD);

  setPrivDefs(newPriv);
  setAssetLevels(newLevels);

  setTotal1(nt1);
  setTotal2(nt2);
  setTotal3(nt3);
  setTotal4(nt4);
  setTotal5(nt5);
  setTotal6(nt6);

  setGrandDeficit(ngd);

  setWinCount(newWinCount);
  setPaused(newPaused);
  setWeek(newWeek);

  clearForNext();
};
  

        
  

  /* ── Clear ── */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setClicked(new Set());
    setWinners(new Set());
    setWinnerStake(0);
    setGameStakes(emptyPerAsset());
    saveBase();
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  /* Group assets by level for display */
  const byLevel = {};
  ASSET_KEYS.forEach(key => {
    const lv = assetLevels[key];
    if (!byLevel[lv]) byLevel[lv] = [];
    byLevel[lv].push(key);
  });

  const levelTargetLabel = (lv) => {
    if (lv === 1) return `SD:${smallDeficit}`;
    if (lv === 2) return `T1:${total1}`;
    if (lv === 3) return `T2:${total2}`;
    if (lv === 4) return `T3:${total3}`;
    if (lv === 5) return `T4:${total4}`;
    if (lv === 6) return `T5:${total5}`;
    if (lv === 7) return `T6:${total6}+G:${grandDeficit}`;
    return "";
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <h1 className="text-sm font-extrabold text-red-400">Virtual EPL</h1>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${week >= 35 ? "bg-red-500" : "bg-white/10"} text-white`}>
              WK {week}/38
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${paused ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`}>
              {winCount}/{WIN_LIMIT} W{paused ? " ⏸" : ""}
            </span>
          </div>
        </div>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-3 py-1.5 bg-green-600 font-bold text-white text-xs">💾</button>
          <button onClick={fetchBase} disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 font-bold text-white text-xs disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={10} />
            {isReloading ? "…" : "↺"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-3 pb-3 gap-2.5 overflow-y-auto">

        {/* WINNER + NEXT */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-green-700 text-white"}`}>
            <div className="font-black">NEXT</div>
            <div className="text-[9px] opacity-70">settle + week</div>
          </button>
        </div>

        {/* ASSET BUTTONS grouped by level */}
        {[1,2,3,4,5,6,7].map(lv => {
          const keys = byLevel[lv];
          if (!keys || keys.length === 0) return null;
          return (
            <div key={lv}>
              <div className="text-[8px] text-gray-400 text-center tracking-widest mb-1">
                — L{lv} · {levelTargetLabel(lv)} —
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {keys.map(key => {
                  const won = winners.has(key);
                  const color = LEVEL_COLORS[lv - 1];
                  return (
                    <button key={key} onClick={() => markWin(key)}
                      disabled={!fixture || paused || clicked.has(key)}
                      className={`py-3 rounded-xl font-bold text-[9px] transition active:scale-95 w-full ${
                        won ? "bg-green-500 text-white ring-2 ring-green-300"
                        : (!fixture || paused) ? `${color} opacity-40 cursor-not-allowed text-white`
                        : `${color} text-white`
                      }`}>
                      <div className="font-black">{ASSET_LABELS[key]}</div>
                      <div className="mt-0.5">{gameStakes[key] || "–"}</div>
                      <div className="text-[7px] opacity-60">D:{privDefs[key]}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* INPUTS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
            <span className="font-black text-lg text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
          </div>
          <button onClick={handleSubmit} disabled={!!fixture}
            className={`w-full py-3 font-bold text-sm rounded-xl transition active:scale-95 ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
            CALCULATE
          </button>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">SmallDef</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Grand Def</span><strong className="text-pink-400">{grandDeficit}</strong></div>
          <div className="col-span-2 border-t border-white/10 pt-1 grid grid-cols-3 gap-1">
            {[total1,total2,total3,total4,total5,total6].map((t,i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-500">T{i+1}</span>
                <strong className="text-orange-300">{t}</strong>
              </div>
            ))}
          </div>
          {fixture && (
            <div className="col-span-2 pt-1 border-t border-white/10 text-center font-bold text-[9px]">
              <span className="uppercase">{teamA}</span>
              <span className="text-gray-400 mx-1">vs</span>
              <span className="uppercase">{teamB}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
