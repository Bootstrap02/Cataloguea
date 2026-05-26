
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, odds2 } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const ASSET_KEYS = ["oneX","twoX","x2","tg0","tg6","ht12","ht21","ht30","ft40","ft41"];
const ASSET_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2", tg0:"0G", tg6:"6G",
  ht12:"HT12", ht21:"HT21", ht30:"HT30", ft40:"FT40", ft41:"FT41"
};
const ASSET_ODD_KEY = {
  oneX:"oneX", twoX:"twoX", x2:"x2", tg0:"zeroGoals", tg6:"sixGoals",
  ht12:"ht12", ht21:"ht21", ht30:"ht30", ft40:"ft40", ft41:"ft41"
};
const ASSET_COLORS = {
  oneX:"bg-purple-600", twoX:"bg-pink-600", x2:"bg-lime-600",
  tg0:"bg-cyan-600", tg6:"bg-teal-600", ht12:"bg-blue-600",
  ht21:"bg-emerald-600", ht30:"bg-green-600", ft40:"bg-indigo-600", ft41:"bg-violet-600"
};

const emptyDefs   = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));
const emptyStakes = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));

const Homepage = () => {
  /* ── INPUTS ── */
  const [inputA,  setInputA]  = useState(""); // Che home
  const [inputB,  setInputB]  = useState(""); // Che away
  const [inputC,  setInputC]  = useState(""); // Mnc home
  const [inputD,  setInputD]  = useState(""); // Mnc away
  const [isReloading, setIsReloading] = useState(false);

  /* ── FIXTURES ── */
  const [fixture,  setFixture]  = useState(null); // Che game
  const [fixture2, setFixture2] = useState(null); // Mnc game

  /* ── WINNER (Che only) ── */
  const [baseStake,    setBaseStake]    = useState(10000);
  const [deficit,      setDeficit]      = useState(0);
  const [winnerStake,  setWinnerStake]  = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [bank,         setBank]         = useState(0);
  const [smallDeficitShadow, setSmallDeficitShadow] = useState(0);

  /* ── WEEK & WIN COUNT ── */
  const [week,     setWeek]     = useState(1);
  const [winCount, setWinCount] = useState(0);

  /* ── SHARED ASSET DEFICITS ── */
  const [assetDefs, setAssetDefs] = useState(emptyDefs());

  /* ── TOTAL DEFICIT ── */
  const [totalDeficit,       setTotalDeficit]       = useState(0);
  const [totalDeficitShadow, setTotalDeficitShadow] = useState(0);

  /* ── RESIDUE ── */
  const [residue, setResidue] = useState(0);

  /* ── QUALIFIED ── */
  const [qualified, setQualified] = useState([]);

  /* ── STAKES THIS GAME ── */
  const [cheStakes, setCheStakes] = useState(emptyStakes()); // Che stakes
  const [mncStakes, setMncStakes] = useState(emptyStakes()); // Mnc stakes

  /* ── WINNERS THIS GAME (separate sets) ── */
  const [cheWinners, setCheWinners] = useState(new Set());
  const [mncWinners, setMncWinners] = useState(new Set());
  const [clicked,    setClicked]    = useState(new Set()); // "che_oneX" | "mnc_oneX" | "six"

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  const computeTotal = (defs) => Object.values(defs).reduce((s, v) => s + v, 0);

  /* ================================================================
     API
     ================================================================ */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d = res.data || {};
      setBaseStake(d.base ?? 10000);
      setDeficit(d.deficit ?? 0);
      setSmallDeficit(d.smallDeficit ?? 0);
      setBank(d.bank ?? 0);
      setSmallDeficitShadow(d.smallDeficitShadow ?? 0);
      setWeek(d.week ?? 1);
      setWinCount(d.winCount ?? 0);
      setAssetDefs(d.assetDefs || emptyDefs());
      setTotalDeficit(d.totalDeficit ?? 0);
      setTotalDeficitShadow(d.totalDeficitShadow ?? 0);
      setResidue(d.residue ?? 0);
      setQualified(d.qualified || []);
    } catch (err) { console.error("❌ fetch:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        base: baseRef.current, deficit, bank, smallDeficit, smallDeficitShadow,
        week, winCount, assetDefs, totalDeficit, totalDeficitShadow, residue, qualified,
      });
    } catch (err) { console.error("❌ save:", err.message); }
  };

  useEffect(() => { fetchBase(); }, []);

  /* ================================================================
     HANDLE SUBMIT (both teams)
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const cheHome = sanitizeTeam(inputA) || "che";
    const cheAway = sanitizeTeam(inputB) || "che";
    const mncHome = sanitizeTeam(inputC) || "mnc";
    const mncAway = sanitizeTeam(inputD) || "mnc";

    const found  = odds.find((o)  => o.home === cheHome && o.away === cheAway);
    const found2 = odds2.find((o) => o.home === mncHome && o.away === mncAway);

    if (!found  && !found2) { alert("No odds found for either game"); return; }
    if (!found)  { alert(`No Che odds for "${cheHome} vs ${cheAway}"`); return; }
    if (!found2) { alert(`No Mnc odds for "${mncHome} vs ${mncAway}"`); return; }

    setFixture(found);
    setFixture2(found2);
    setClicked(new Set());
    setCheWinners(new Set());
    setMncWinners(new Set());

    /* ── Winner stake (Che only) ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    setSmallDeficit((prev) => prev + wStake);

    const curSD    = smallDeficit + wStake;
    const curTotal = computeTotal(assetDefs);
    setTotalDeficit(curTotal);
    setTotalDeficitShadow(curTotal);

    if (winCount >= 28) { setCheStakes(emptyStakes()); setMncStakes(emptyStakes()); return; }

    /* ── Calc stakes ── */
    const newCheStakes = emptyStakes();
    const newMncStakes = emptyStakes();

    ASSET_KEYS.forEach((key) => {
      const cheOdd = found[ASSET_ODD_KEY[key]]  || 0;
      const mncOdd = found2[ASSET_ODD_KEY[key]] || 0;
      const def    = assetDefs[key] || 0;

      if (qualified.includes(key)) {
        /* Qualified: chase totalDeficit + residue */
        const target = curTotal + residue;
        if (cheOdd > 1.01) newCheStakes[key] = target > 0 ? Math.max(Math.round(target / (cheOdd - 1)), 10) : 10;
        if (mncOdd > 1.01) {
          const cheS = newCheStakes[key] || 0;
          newMncStakes[key] = Math.max(Math.round((curSD + def + cheS) / (mncOdd - 1)), 10);
        }
      } else {
        /* Normal: Che chases smallDeficit + def, Mnc adds Che stake on top */
        if (cheOdd > 1.01) newCheStakes[key] = Math.max(Math.round((curSD + def) / (cheOdd - 1)), 10);
        if (mncOdd > 1.01) {
          const cheS = newCheStakes[key] || 0;
          newMncStakes[key] = Math.max(Math.round((curSD + def + cheS) / (mncOdd - 1)), 10);
        }
      }
    });

    setCheStakes(newCheStakes);
    setMncStakes(newMncStakes);
  };

  /* ================================================================
     MARK WIN
     ================================================================ */
  const markCheWin = (key) => {
    if (!fixture || winCount >= 28) return;
    const ck = `che_${key}`;
    if (clicked.has(ck)) return;
    setClicked((prev) => new Set([...prev, ck]));
    setCheWinners((prev) => new Set([...prev, key]));
    setWinCount((prev) => prev + 1);
  };

  const markMncWin = (key) => {
    if (!fixture2 || winCount >= 28) return;
    const ck = `mnc_${key}`;
    if (clicked.has(ck)) return;
    setClicked((prev) => new Set([...prev, ck]));
    setMncWinners((prev) => new Set([...prev, key]));
    setWinCount((prev) => prev + 1);
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNext = () => {
    if (!fixture && !fixture2) return;

    const newDefs = { ...assetDefs };
    let newQualified  = [...qualified];
    let newWinCount   = winCount;
    let newTotalDef   = totalDeficit;
    let newResidue    = residue;
    let newSmallDef   = smallDeficit;
    let newBank       = bank;
    let newSmallShadow = smallDeficitShadow;
    let currentTotalShadow = totalDeficitShadow;
    let qualifiedBankBonus = 0;

    /* ── Categorise wins ── */
    const cheNormalWins   = [];
    const mncNormalWins   = [];
    const cheQualWins     = [];
    const mncQualWins     = [];

    ASSET_KEYS.forEach((key) => {
      const cheWon = cheWinners.has(key);
      const mncWon = mncWinners.has(key);
      const isQual = qualified.includes(key);

      if (cheWon || mncWon) {
        if (isQual) {
          if (cheWon) cheQualWins.push(key);
          if (mncWon) mncQualWins.push(key);
        } else {
          if (cheWon) cheNormalWins.push(key);
          if (mncWon) mncNormalWins.push(key);
        }
      }
    });

    /* ── Normal wins → qualified promotion ── */
    [...cheNormalWins, ...mncNormalWins].forEach((key) => {
      if (!newQualified.includes(key)) newQualified.push(key);
    });

    /* ── Small deficit logic for normal Che wins ── */
    if (cheNormalWins.length > 0) {
      if (newSmallDef > 0) {
        newSmallShadow = newSmallDef;
        newSmallDef    = 0;
      } else if (newSmallShadow > 0) {
        newBank       += newSmallShadow;
        newSmallShadow = 0;
      }
    }

    /* ── Qualified win logic ── */
    const allQualWins = [...new Set([...cheQualWins, ...mncQualWins])];
    let qualResetDone = false;

    allQualWins.forEach((key) => {
      if (!qualResetDone && newTotalDef > 0) {
        qualResetDone      = true;
        currentTotalShadow = newTotalDef;
        newTotalDef        = 0;
        /* All other defs reset to their current game stake */
        ASSET_KEYS.forEach((k) => {
          newDefs[k] = k === key ? 0 : (cheStakes[k] || 0);
        });
      } else {
        qualifiedBankBonus += currentTotalShadow;
        newResidue          = 0;
        newDefs[key]        = 0;
      }
    });

    /* ── Apply losses per asset ── */
    ASSET_KEYS.forEach((key) => {
      const cheWon = cheWinners.has(key);
      const mncWon = mncWinners.has(key);
      const isQual = qualified.includes(key);

      if (isQual) return; // handled above

      if (cheWon && mncWon) {
        /* Both won → deficit = 0 */
        newDefs[key] = 0;
      } else if (cheWon && !mncWon) {
        /* Only Che won → add Mnc stake to deficit */
        newDefs[key] += mncStakes[key] || 0;
      } else if (!cheWon && mncWon) {
        /* Only Mnc won → deficit = 0 */
        newDefs[key] = 0;
      } else {
        /* Neither won → add both stakes */
        newDefs[key] += (cheStakes[key] || 0) + (mncStakes[key] || 0);
      }

      /* Promote if either won */
      if ((cheWon || mncWon) && !newQualified.includes(key)) {
        newQualified.push(key);
      }
    });

    /* ── Recompute total ── */
    newTotalDef = computeTotal(newDefs);

    /* ── Bank bonus ── */
    if (qualifiedBankBonus > 0) newBank += qualifiedBankBonus;

    setTotalDeficitShadow(currentTotalShadow);

    /* ── 28 win rule ── */
    if (newWinCount >= 28 && winCount < 28) {
      const sumDefs = computeTotal(newDefs);
      if (newBank >= sumDefs) {
        newBank -= sumDefs;
        newResidue = 0;
      } else {
        newResidue = sumDefs - newBank;
        newBank    = 0;
      }
      newTotalDef = 0;
      Object.keys(newDefs).forEach(k => { newDefs[k] = 0; });
    }

    /* ── Week progression ── */
    let newWeek  = week + 1;
    let resetAll = newWeek > 38;
    if (resetAll) {
      newWeek = 1;
      if (newBank >= newSmallDef) { newBank -= newSmallDef; newSmallDef = 0; }
      else { newSmallDef = newSmallDef - newBank; newBank = 0; }
      newWinCount  = 0;
      newQualified = [];
      newTotalDef  = 0;
      newResidue   = 0;
      Object.keys(newDefs).forEach(k => { newDefs[k] = 0; });
    }

    /* ── Apply ── */
    setAssetDefs(newDefs);
    setTotalDeficit(newTotalDef);
    setResidue(newResidue);
    setQualified(newQualified);
    setWinCount(newWinCount);
    setWeek(newWeek);
    setSmallDeficit(newSmallDef);
    setSmallDeficitShadow(newSmallShadow);
    setBank(newBank);

    clearForNext();
  };

  /* ── 6-0 jackpot ── */
  const handleJackpot = () => {
    setClicked((prev) => new Set([...prev, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  /* ── Clear ── */
  const clearForNext = () => {
    setInputA(""); setInputB(""); setInputC(""); setInputD("");
    setFixture(null); setFixture2(null);
    setClicked(new Set());
    setCheWinners(new Set());
    setMncWinners(new Set());
    setWinnerStake(0);
    setCheStakes(emptyStakes());
    setMncStakes(emptyStakes());
    saveBase();
  };

  const martingalePaused = winCount >= 28;

  /* ── button class helpers ── */
  const cheBtn = (key) => {
    const won   = cheWinners.has(key);
    const isQual = qualified.includes(key);
    const color  = ASSET_COLORS[key];
    if (!fixture || martingalePaused) return "py-2 rounded-xl font-bold text-[9px] bg-gray-700 opacity-40 cursor-not-allowed text-white w-full";
    if (won) return "py-2 rounded-xl font-bold text-[9px] bg-green-500 text-white ring-1 ring-green-300 w-full";
    if (isQual) return `py-2 rounded-xl font-bold text-[9px] ${color} text-white ring-1 ring-yellow-400 w-full`;
    return `py-2 rounded-xl font-bold text-[9px] ${color} text-white w-full`;
  };

  const mncBtn = (key) => {
    const won   = mncWinners.has(key);
    const isQual = qualified.includes(key);
    const color  = ASSET_COLORS[key];
    if (!fixture2 || martingalePaused) return "py-2 rounded-xl font-bold text-[9px] bg-gray-700 opacity-40 cursor-not-allowed text-white w-full";
    if (won) return "py-2 rounded-xl font-bold text-[9px] bg-green-500 text-white ring-1 ring-green-300 w-full";
    if (isQual) return `py-2 rounded-xl font-bold text-[9px] ${color} text-white ring-1 ring-yellow-400 opacity-70 w-full`;
    return `py-2 rounded-xl font-bold text-[9px] ${color} text-white opacity-70 w-full`;
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col overflow-hidden">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0">
        <div>
          <h1 className="text-xs font-extrabold text-red-400">Virtual EPL</h1>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-extrabold ${week >= 35 ? "bg-red-500 text-white" : "bg-white/10 text-white"}`}>
              WK {week}/38
            </span>
            <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-extrabold ${winCount >= 28 ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`}>
              {winCount}/28 W
            </span>
            {martingalePaused && <span className="px-1.5 py-0.5 rounded-full text-[8px] font-extrabold bg-yellow-400 text-black">PAUSED</span>}
          </div>
        </div>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-2 py-1 bg-green-600 font-bold text-white text-[9px]">💾</button>
          <button onClick={fetchBase} disabled={isReloading}
            className="flex items-center gap-0.5 px-2 py-1 bg-red-600 font-bold text-white text-[9px] disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={9} />
            {isReloading ? "…" : "↺"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-2 pb-2 gap-1.5 overflow-hidden">

        {/* WINNER + NEXT + STATS MINI */}
        <div className="grid grid-cols-3 gap-1.5 shrink-0">
          <button onClick={handleJackpot}
            className={`py-2.5 rounded-xl font-extrabold text-xs transition active:scale-95 ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black text-xs">6–0</div>
            <div className="text-[9px] opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture && !fixture2}
            className={`py-2.5 rounded-xl font-extrabold text-xs transition active:scale-95 ${(!fixture && !fixture2) ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-green-700 text-white"}`}>
            <div className="font-black text-xs">NEXT</div>
            <div className="text-[8px] opacity-70">settle+week</div>
          </button>
          <div className="bg-white/10 rounded-xl flex flex-col items-center justify-center text-[8px] font-mono px-1">
            <div>SD:<strong className="text-blue-300">{smallDeficit}</strong></div>
            <div>TD:<strong className="text-orange-300">{totalDeficit}</strong></div>
            <div>Bk:<strong className="text-emerald-300">{bank}</strong></div>
          </div>
        </div>

        {/* ASSET GRID — CHE row + MNC row per asset */}
        <div className="shrink-0">
          <div className="grid grid-cols-10 gap-1 mb-0.5">
            {ASSET_KEYS.map(key => (
              <div key={key} className="text-center text-[7px] text-gray-400 font-bold">
                {ASSET_LABELS[key]}
              </div>
            ))}
          </div>

          {/* CHE row */}
          <div className="grid grid-cols-10 gap-1 mb-1">
            {ASSET_KEYS.map(key => (
              <button key={key} onClick={() => markCheWin(key)}
                disabled={!fixture || martingalePaused || clicked.has(`che_${key}`)}
                className={cheBtn(key)}>
                <div className="text-[8px] font-black leading-none">{cheStakes[key] || "–"}</div>
                <div className="text-[6px] opacity-50 leading-none">D:{assetDefs[key]}</div>
                {qualified.includes(key) && <div className="text-[6px] text-yellow-300 leading-none">★</div>}
              </button>
            ))}
          </div>

          {/* MNC row */}
          <div className="grid grid-cols-10 gap-1">
            {ASSET_KEYS.map(key => (
              <button key={key} onClick={() => markMncWin(key)}
                disabled={!fixture2 || martingalePaused || clicked.has(`mnc_${key}`)}
                className={mncBtn(key)}>
                <div className="text-[8px] font-black leading-none">{mncStakes[key] || "–"}</div>
                <div className="text-[6px] opacity-50 leading-none">M</div>
              </button>
            ))}
          </div>
        </div>

        {/* INPUTS — CHE + MNC side by side */}
        <div className="shrink-0 grid grid-cols-2 gap-2">
          {/* CHE */}
          <div className="flex items-center gap-1">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Che H"
              className="flex-1 min-w-0 px-2 py-1.5 border border-red-600 rounded-lg text-center text-[10px] bg-transparent text-white placeholder-red-400 focus:outline-none" />
            <span className="text-[9px] text-red-400 font-black shrink-0">v</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Che A"
              className="flex-1 min-w-0 px-2 py-1.5 border border-red-600 rounded-lg text-center text-[10px] bg-transparent text-white placeholder-red-400 focus:outline-none" />
          </div>
          {/* MNC */}
          <div className="flex items-center gap-1">
            <input value={inputC} onChange={e => setInputC(e.target.value)} placeholder="Mnc H"
              className="flex-1 min-w-0 px-2 py-1.5 border border-blue-600 rounded-lg text-center text-[10px] bg-transparent text-white placeholder-blue-400 focus:outline-none" />
            <span className="text-[9px] text-blue-400 font-black shrink-0">v</span>
            <input value={inputD} onChange={e => setInputD(e.target.value)} placeholder="Mnc A"
              className="flex-1 min-w-0 px-2 py-1.5 border border-blue-600 rounded-lg text-center text-[10px] bg-transparent text-white placeholder-blue-400 focus:outline-none" />
          </div>
        </div>

        {/* CALCULATE */}
        <button onClick={handleSubmit} disabled={!!fixture && !!fixture2}
          className={`shrink-0 w-full py-2 font-bold text-xs rounded-xl transition active:scale-95 ${(fixture && fixture2) ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
          CALCULATE
        </button>

        {/* STATS */}
        <div className="flex-1 bg-white/5 rounded-xl p-2 text-[9px] grid grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">SmallDef</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">TotalDef</span><strong className="text-orange-400">{totalDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Residue</span><strong className="text-pink-400">{residue}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">TDShadow</span><strong className="text-orange-300">{totalDeficitShadow}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Wins</span><strong className="text-yellow-400">{winCount}/28</strong></div>
          <div className="col-span-2 border-t border-white/10 pt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
            {ASSET_KEYS.map(key => (
              <div key={key} className="flex justify-between">
                <span className={qualified.includes(key) ? "text-yellow-300" : "text-gray-500"}>
                  {ASSET_LABELS[key]}{qualified.includes(key) ? "★" : ""}
                </span>
                <strong className="text-white">{assetDefs[key]}</strong>
              </div>
            ))}
          </div>
          {(fixture || fixture2) && (
            <div className="col-span-2 pt-1 border-t border-white/10 text-[8px]">
              {fixture  && <div className="text-red-300">CHE: {sanitizeTeam(inputA)||"–"} v {sanitizeTeam(inputB)||"–"}</div>}
              {fixture2 && <div className="text-blue-300">MNC: {sanitizeTeam(inputC)||"–"} v {sanitizeTeam(inputD)||"–"}</div>}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
