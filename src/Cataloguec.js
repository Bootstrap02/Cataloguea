import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
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

const emptyDefs = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));
const emptyStakes = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));

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
  const [smallDeficitShadow, setSmallDeficitShadow] = useState(0);
  /* ── WEEK & WIN COUNT ── */
  const [week,     setWeek]     = useState(1);
  const [winCount, setWinCount] = useState(0);

  /* ── ASSET DEFICITS ── */
  const [assetDefs, setAssetDefs] = useState(emptyDefs());

  /* ── TOTAL DEFICIT (sum of all asset defs) ── */
  const [totalDeficit, setTotalDeficit] = useState(0);

  /* ── RESIDUE (pushed in when 16 wins reached) ── */
  const [residue, setResidue] = useState(0);

  /* ── TOTAL DEFICIT SHADOW (mirrors totalDeficit when set, used for bank on 2nd qualified win) ── */
  const [totalDeficitShadow, setTotalDeficitShadow] = useState(0);

  /* ── QUALIFIED ARRAY (assets that have won, now chase totalDeficit+residue) ── */
  const [qualified, setQualified] = useState([]); // array of keys

  /* ── CURRENT GAME STAKES ── */
  const [stakes, setStakes] = useState(emptyStakes());

  /* ── WINNERS THIS GAME ── */
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

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
      setWeek(d.week ?? 1);
      setWinCount(d.winCount ?? 0);
      setAssetDefs(d.assetDefs || emptyDefs());
      setTotalDeficit(d.totalDeficit ?? 0);
      setResidue(d.residue ?? 0);
      setTotalDeficitShadow(d.totalDeficitShadow ?? 0);
      setQualified(d.qualified || []);
    } catch (err) { console.error("❌ fetch:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        base: baseRef.current, deficit, smallDeficit,
        week, winCount, assetDefs, totalDeficit, residue, totalDeficitShadow, qualified,
      });
    } catch (err) { console.error("❌ save:", err.message); }
  };

  useEffect(() => { fetchBase(); }, []);

  /* ── Compute totalDeficit from assetDefs ── */
  const computeTotal = (defs) =>
    Object.values(defs).reduce((s, v) => s + v, 0);

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";
    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) { alert(`No odds found for "${home}" vs "${away}"`); return; }

    setFixture(found);
    setClicked(new Set());
    setWinners(new Set());

    /* ── Winner stake ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    setSmallDeficit((prev) => prev + wStake);
    /* ── If 16 wins reached, martingale is paused — no asset stakes ── */
    if (winCount >= 16) {
      setStakes(emptyStakes());
      return;
    }

    /* ── Calc asset stakes ── */
    const newStakes = emptyStakes();
    const curTotal = computeTotal(assetDefs);

    ASSET_KEYS.forEach((key) => {
      const odd = found[ASSET_ODD_KEY[key]] || 0;
      if (odd <= 1.01) return;

      if (qualified.includes(key)) {
        /* Qualified: chase totalDeficit + residue */
        const target = curTotal + residue;
        newStakes[key] = target > 0 ? Math.max(Math.round(target / (odd - 1)), 10) : 10;
      } else {
        /* Normal: chase smallDeficit */
        newStakes[key] = smallDeficit > 0
          ? Math.max(Math.round((smallDeficit + wStake) / (odd - 1)), 10)
          : Math.max(Math.round(wStake / (odd - 1)), 10);
      }
    });

    setStakes(newStakes);
  };

  /* ================================================================
     MARK WIN
     ================================================================ */
  const markWin = (key) => {
    if (!fixture || clicked.has(key) || winCount >= 16) return;
    setClicked((prev) => new Set([...prev, key]));
    setWinners((prev) => new Set([...prev, key]));
  };

  /* ================================================================
     HANDLE NEXT — settle all, advance week
     ================================================================ */
  
  const handleNext = () => {
  if (!fixture) return;

  const newDefs = { ...assetDefs };

  let newQualified = [...qualified];
  let newWinCount = winCount;

  let newTotalDef = totalDeficit;
  let newResidue = residue;

  let newSmallDef = smallDeficit;
  let newBank = bank;

  let newSmallShadow = smallDeficitShadow;

  let qualifiedBankBonus = 0;

  /* ─────────────────────────────
     STEP 1: SPLIT WINS
     ───────────────────────────── */
  const normalWins = [];
  const qualifiedWins = [];

  ASSET_KEYS.forEach((key) => {
    if (!winners.has(key)) return;

    newWinCount += 1;

    if (qualified.includes(key)) {
      qualifiedWins.push(key);
    } else {
      normalWins.push(key);
    }
  });

  /* ─────────────────────────────
     STEP 2: NORMAL SYSTEM (smallDef ONLY HERE)
     ───────────────────────────── */
  if (normalWins.length > 0) {
    normalWins.forEach(() => {
      if (newSmallDef > 0) {
        newSmallShadow = newSmallDef;
        newSmallDef = 0;
      } else {
        if (newSmallShadow > 0) {
          newBank += newSmallShadow;
          newSmallShadow = 0;
        }
      }
    });
  }

  /* ─────────────────────────────
     STEP 3: QUALIFIED SYSTEM (NO smallDef TOUCH)
     ───────────────────────────── */
  let qualifiedResetTriggered = false;
  let winningQualifiedKey = null;
  let capturedTotalShadow = 0;

  qualifiedWins.forEach((key) => {
    if (!qualifiedResetTriggered && newTotalDef > 0) {
      qualifiedResetTriggered = true;
      winningQualifiedKey = key;
      capturedTotalShadow = newTotalDef;
    } else if (newTotalDef <= 0) {
      qualifiedBankBonus += totalDeficitShadow;
      newResidue = 0;
      newDefs[key] = 0;
    }
  });

  /* ─────────────────────────────
     APPLY LOSSES (ONLY IF NO RESET)
     ───────────────────────────── */
  if (!qualifiedResetTriggered) {
    ASSET_KEYS.forEach((key) => {
      if (!winners.has(key) && stakes[key] > 0) {
        newDefs[key] += stakes[key];
      }
    });
  }

  /* ─────────────────────────────
     QUALIFIED RESET
     ───────────────────────────── */
  if (qualifiedResetTriggered) {
    setTotalDeficitShadow(capturedTotalShadow);

    ASSET_KEYS.forEach((k) => {
      newDefs[k] = k === winningQualifiedKey ? 0 : (stakes[k] || 0);
    });

    newTotalDef = 0;
  }

  /* ─────────────────────────────
     RECOMPUTE TOTAL DEFICIT
     ───────────────────────────── */
  newTotalDef = computeTotal(newDefs);

  /* ─────────────────────────────
     BANK UPDATE (SAFE)
     ───────────────────────────── */
  if (qualifiedBankBonus > 0) {
    newBank += qualifiedBankBonus;
  }

  /* ─────────────────────────────
     16 WIN RULE
     ───────────────────────────── */
  if (newWinCount >= 16 && winCount < 16) {
    const sumDefs = computeTotal(newDefs);

    if (newBank >= sumDefs) {
      newBank -= sumDefs;
      newResidue = 0;
    } else {
      newResidue = sumDefs - newBank;
      newBank = 0;
    }

    newTotalDef = 0;

    Object.keys(newDefs).forEach((k) => {
      newDefs[k] = 0;
    });
  }

  /* ─────────────────────────────
     WEEK PROGRESSION
     ───────────────────────────── */
  let newWeek = week + 1;
  let resetAll = false;

  if (newWeek > 38) {
    newWeek = 1;
    resetAll = true;
  }

  /* ─────────────────────────────
     END OF SEASON RULE (bank vs smallDef)
     ───────────────────────────── */
  if (resetAll) {
    if (newBank >= newSmallDef) {
      newBank -= newSmallDef;
      newSmallDef = 0;
    } else {
      newSmallDef = newSmallDef - newBank;
      newBank = 0;
    }

    newWinCount = 0;
    newQualified = [];
    newTotalDef = 0;
    newResidue = 0;

    Object.keys(newDefs).forEach((k) => {
      newDefs[k] = 0;
    });
  }

  /* ─────────────────────────────
     APPLY STATE
     ───────────────────────────── */
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
    setInputA(""); setInputB("");
    setFixture(null);
    setClicked(new Set());
    setWinners(new Set());
    setWinnerStake(0);
    setStakes(emptyStakes());
    saveBase();
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";
  const martingalePaused = winCount >= 16;

  const btnClass = (key) => {
    const isWinner  = winners.has(key);
    const isQual    = qualified.includes(key);
    const color     = ASSET_COLORS[key];
    if (!fixture || martingalePaused)
      return `py-4 rounded-2xl font-bold text-xs transition active:scale-95 bg-gray-700 opacity-40 cursor-not-allowed text-white`;
    if (isWinner)
      return `py-4 rounded-2xl font-bold text-xs transition active:scale-95 bg-green-500 text-white ring-2 ring-green-300`;
    if (isQual)
      return `py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${color} text-white ring-2 ring-yellow-400`;
    return `py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${color} text-white`;
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
        <div className="flex flex-col gap-1">
          <h1 className="text-sm font-extrabold text-red-400">Virtual EPL</h1>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${week >= 35 ? "bg-red-500 text-white" : "bg-white/10 text-white"}`}>
              WK {week} / 38
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${winCount >= 16 ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`}>
              {winCount} / 16 WINS
            </span>
            {martingalePaused && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-yellow-400 text-black">PAUSED</span>
            )}
          </div>
        </div>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-3 py-1.5 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">💾</button>
          <button onClick={fetchBase} disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={11} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-4 gap-3 overflow-y-auto">

        {/* WINNER / JACKPOT / NEXT */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={handleJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] mt-0.5 opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-green-700 text-white hover:bg-green-600"}`}>
            <div className="font-black">NEXT</div>
            <div className="text-[9px] mt-0.5 opacity-70">settle + advance week</div>
          </button>
          <div className="bg-white/10 rounded-2xl flex flex-col items-center justify-center text-[10px] font-mono gap-0.5 px-2">
            <div>SmDef: <strong className="text-blue-300">{smallDeficit}</strong></div>
            <div>TotDef: <strong className="text-orange-300">{totalDeficit}</strong></div>
            <div>Resid: <strong className="text-pink-300">{residue}</strong></div>
          </div>
        </div>

        {/* ASSET BUTTONS */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">
          {martingalePaused
            ? "— MARTINGALE PAUSED — (16 wins reached, resume week 1) —"
            : "— TAP TO MARK WIN —"}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {ASSET_KEYS.map((key) => {
            const isQual = qualified.includes(key);
            return (
              <button key={key} onClick={() => markWin(key)} disabled={!fixture || martingalePaused}
                className={btnClass(key)}>
                <div className="font-black text-[11px]">{ASSET_LABELS[key]}</div>
                <div className="text-[10px] mt-0.5">{stakes[key] || "–"}</div>
                <div className="text-[8px] opacity-60 mt-0.5">D:{assetDefs[key]}</div>
                {isQual && <div className="text-[7px] text-yellow-300 mt-0.5">★ QUAL</div>}
              </button>
            );
          })}
        </div>

        {/* INPUTS */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
            <span className="font-black text-lg text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
          </div>
          <button onClick={handleSubmit} disabled={!!fixture}
            className={`w-full py-3 font-bold text-sm rounded-xl transition active:scale-95 shadow ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
            CALCULATE
          </button>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">SmallDef</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">TotalDef</span><strong className="text-orange-400">{totalDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Residue/Bank</span><strong className="text-pink-400">{residue} / {bank}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">TotDefShad</span><strong className="text-orange-300">{totalDeficitShadow}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Wins</span><strong className="text-yellow-400">{winCount}/16</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Week</span><strong className={week >= 35 ? "text-red-400" : "text-white"}>{week}/38</strong></div>
          <div className="col-span-2 border-t border-white/10 pt-1 grid grid-cols-2 gap-x-6 gap-y-1">
            {ASSET_KEYS.map(key => (
              <div key={key} className="flex justify-between">
                <span className={`${qualified.includes(key) ? "text-yellow-300" : "text-gray-500"}`}>
                  {ASSET_LABELS[key]}{qualified.includes(key) ? "★" : ""}
                </span>
                <strong className="text-white">{assetDefs[key]}</strong>
              </div>
            ))}
          </div>
          {fixture && (
            <div className="col-span-2 pt-1 border-t border-white/10 text-center font-bold">
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
