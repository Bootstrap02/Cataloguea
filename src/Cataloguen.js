
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

/* ── 4 independent martingale assets ── */
const MART_KEYS    = ["oneX", "twoX", "zeroGoals", "sixGoals"];
const MART_LABELS  = { oneX: "1X", twoX: "2X", zeroGoals: "0 GOALS", sixGoals: "6 GOALS" };
const MART_COLORS  = {
  oneX:      { base: "bg-blue-600 text-white hover:bg-blue-500",   won: "bg-green-500 text-white" },
  twoX:      { base: "bg-indigo-600 text-white hover:bg-indigo-500", won: "bg-green-500 text-white" },
  zeroGoals: { base: "bg-cyan-600 text-white hover:bg-cyan-500",   won: "bg-green-500 text-white" },
  sixGoals:  { base: "bg-teal-600 text-white hover:bg-teal-500",   won: "bg-green-500 text-white" },
};

const emptyMart = () => ({ oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0 });

const Homepage = () => {
  /* ── INPUTS ── */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  /* ── FIXTURE ── */
  const [fixture, setFixture] = useState(null);
  const [isSmallTeamMatch, setIsSmallTeamMatch] = useState(false);
  const [pressedWins, setPressedWins] = useState(new Set());
  const [jackpot, setJackpot] = useState(false);

  /* ── MAIN STATE ── */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit,     setDeficit]     = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit,  setOneDeficit]  = useState(0);
  const baseRef = useRef(10000);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ── MAIN STAKES ── */
  const [amounts,       setAmounts]       = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts,   setZeroAmounts]   = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts,    setOneAmounts]    = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ── SMALL ODDS SHARED POOL ──
     smallDeficit: fed by 6-0 winner stakes from small-odds games.
     Each asset's effective target = privateDeficit[key] + smallDeficit.
  ── */
  const [smallDeficit, setSmallDeficit] = useState(0);

  /* ── PRIVATE DEFICITS per asset ── */
  const [privateDeficit, setPrivateDeficit] = useState(emptyMart());

  /* ── CURRENT GAME STAKES per asset ── */
  const [martStakes, setMartStakes] = useState(emptyMart());

  /* ── SMALL ODDS: 5-0 / 5-1 plain stakes ── */
  const [smallZeroStake, setSmallZeroStake] = useState(0);
  const [smallOneStake,  setSmallOneStake]  = useState(0);

  /* ── BANK ── */
  const [bank, setBank] = useState(0);

  /* ── API ── */
  const fetchAll = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d = res.data || {};
      setBaseStake(d.base         ?? 10000);
      setBaseDeficit(d.baseDeficit ?? 0);
      setZeroDeficit(d.zeroDeficit ?? 0);
      setOneDeficit(d.oneDeficit   ?? 0);
      setDeficit(d.deficit         ?? 0);
      setSmallDeficit(d.smallDeficit ?? 0);
      setBank(d.bank               ?? 0);
      if (d.privateDeficit) setPrivateDeficit(d.privateDeficit);
    } catch (err) { console.error("❌ Load:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveAll = async () => {
    try {
      await axios.put(API_BASE, {
        base: Math.max(10000, baseRef.current),
        baseDeficit, zeroDeficit, oneDeficit, deficit,
        smallDeficit, bank, privateDeficit,
      });
    } catch (err) { console.error("❌ Save:", err.message); }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ── LADDER BUILDER ── */
  const buildLadder = (startTotal, type, code, oddsMap) => {
    let running = startTotal;
    const ladder = [];
    let H = 0, D = 0, A = 0;
    for (const step of code) {
      const odd = oddsMap[step];
      if (!odd || odd <= 1.01) continue;
      const stake = Math.round(running / (odd - 1));
      ladder.push({ step, stake, type });
      if (step === "H") H = stake;
      if (step === "D") D = stake;
      if (step === "A") A = stake;
      running += stake;
    }
    return { ladder, H, D, A };
  };

  /* ================================================================
     CALC MART STAKES
     For each active asset: target = privateDeficit[key] + smallDeficit
     stake = target / odd
     ================================================================ */
  const calcMartStakes = (found, privDef, smallDef) => {
    const stakes = emptyMart();
    MART_KEYS.forEach((key) => {
      const odd = found[key] || 0;
      if (!odd || odd <= 1.01) { stakes[key] = 0; return; }
      const target = (privDef[key] || 0) + smallDef;
      stakes[key] = Math.max(Math.round(target / odd), 10);
    });
    return stakes;
  };

  /* ================================================================
     HANDLE LOAD GAME
     ================================================================ */
  const handleLoadGame = (e) => {
    e.preventDefault();
    if (isLoading) return;

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    let found = smallOdds.find((o) => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!isSmall) found = odds.find((o) => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    setFixture(found);
    setIsSmallTeamMatch(isSmall);
    setPressedWins(new Set());
    setJackpot(false);
    setOrderedStakes([]);

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    const code    = found.code || "";

    /* 6-0 winner stake */
    const newBase6  = baseStake + deficit;
    setBaseStake(newBase6);
    setDeficit(0);
    const winnerAmt = Math.max(Math.round(newBase6 / found.winner), 10);

    /* 5-0 stake */
    const zeroWinner = Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10);
    /* 5-1 stake */
    const oneWinner  = Math.max(Math.round((baseDeficit + oneDeficit)  / found.fiveOne),  10);

    if (!isSmall) {
      /* ── NORMAL GAME: full HDA ladders ── */
      const r6  = buildLadder(winnerAmt,   "6-0", code, oddsMap);
      const r50 = buildLadder(zeroWinner,  "5-0", code, oddsMap);
      const r51 = buildLadder(oneWinner,   "5-1", code, oddsMap);

      setOrderedStakes([...r6.ladder, ...r50.ladder, ...r51.ladder]);
      setAmounts({     winnerAmount: winnerAmt,   homeAmount: r6.H,  drawAmount: r6.D,  awayAmount: r6.A });
      setZeroAmounts({ winnerAmount: zeroWinner,  homeAmount: r50.H, drawAmount: r50.D, awayAmount: r50.A });
      setOneAmounts({  winnerAmount: oneWinner,   homeAmount: r51.H, drawAmount: r51.D, awayAmount: r51.A });
    } else {
      /* ── SMALL ODDS GAME: winner feeds smallDeficit, no HDA for 6-0/5-0/5-1 ── */
      /* winnerAmt goes into smallDeficit immediately */
      const newSmallDef = smallDeficit + winnerAmt;
      setSmallDeficit(newSmallDef);

      setAmounts({     winnerAmount: winnerAmt,  homeAmount: 0, drawAmount: 0, awayAmount: 0 });
      setZeroAmounts({ winnerAmount: zeroWinner, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
      setOneAmounts({  winnerAmount: oneWinner,  homeAmount: 0, drawAmount: 0, awayAmount: 0 });
      setSmallZeroStake(zeroWinner);
      setSmallOneStake(oneWinner);

      /* Mart stakes use the freshly updated smallDeficit */
      const newMartStakes = calcMartStakes(found, privateDeficit, newSmallDef);
      setMartStakes(newMartStakes);
      setIsLoading(true);
      return;
    }

    /* Mart stakes for normal game also computed (smallDeficit unchanged) */
    const newMartStakes = calcMartStakes(found, privateDeficit, smallDeficit);
    setMartStakes(newMartStakes);
    setIsLoading(true);
  };

  /* ================================================================
     MART ASSET WIN
     - Clear private deficit for this asset
     - Set smallDeficit to 0
     - Add 100 to bank
     ================================================================ */
  const handleMartWin = (key) => {
    if (!fixture || pressedWins.has(key)) return;
    setPressedWins((prev) => new Set([...prev, key]));

    setPrivateDeficit((prev) => ({ ...prev, [key]: 0 }));
    setSmallDeficit(0);
    setBank((prev) => prev + 100);
  };

  /* ── 6-0 WIN ── */
  const handleJackpot = () => {
    if (!fixture) return;
    setJackpot(true);
    setDeficit(0);
    setBaseStake(10000);
    setBaseDeficit(0);
  };

  /* ── 5-0 WIN ── */
  const handleZeroJackpot = () => {
    setBaseStake(10000 + oneDeficit);
    setBaseDeficit(oneDeficit);
    setOneDeficit(0);
    setZeroDeficit(0);
  };

  /* ── 5-1 WIN ── */
  const handleOneJackpot = () => {
    setBaseStake(10000 + zeroDeficit);
    setBaseDeficit(zeroDeficit);
    setZeroDeficit(0);
    setOneDeficit(0);
  };

  /* ================================================================
     RESOLVE RESULT (normal game HDA)
     ================================================================ */
  const resolveResult = (step) => {
    if (!fixture || isSmallTeamMatch) return;

    const calcLoss = (type) => {
      const stakes = orderedStakes.filter((s) => s.type === type);
      const idx    = stakes.findIndex((s) => s.step === step);
      if (idx === -1) return 0;
      return stakes.slice(idx + 1).reduce((sum, s) => sum + s.stake, 0);
    };

    const mainLoss = calcLoss("6-0");
    const zeroLoss = calcLoss("5-0");
    const oneLoss  = calcLoss("5-1");

    setDeficit(mainLoss);
    setBaseDeficit((prev) => prev + mainLoss);
    setZeroDeficit((prev) => prev + zeroLoss);
    setOneDeficit((prev)  => prev + oneLoss);

    /* Mart assets also lose their stakes — add to private deficits */
    setPrivateDeficit((prev) => {
      const next = { ...prev };
      MART_KEYS.forEach((key) => {
        next[key] = (prev[key] || 0) + (martStakes[key] || 0);
      });
      return next;
    });

    clearForNext();
  };

  /* ================================================================
     HANDLE NEXT  (small odds game ended without mart win)
     ================================================================ */
  const handleNextGame = async () => {
    if (!fixture || !isLoading) return;

    /* Push 5-0/5-1 stakes into their deficits (small odds only) */
    let nextZeroDef = zeroDeficit;
    let nextOneDef  = oneDeficit;
    if (isSmallTeamMatch) {
      nextZeroDef += smallZeroStake;
      nextOneDef  += smallOneStake;
    }

    /* Add mart stakes to each asset's private deficit */
    const nextPrivate = { ...privateDeficit };
    MART_KEYS.forEach((key) => {
      nextPrivate[key] = (privateDeficit[key] || 0) + (martStakes[key] || 0);
    });

    /* If any private deficit >= 1000, flush it to baseStake + baseDeficit */
    let nextBase        = baseStake;
    let nextBaseDeficit = baseDeficit;
    let nextBank        = bank;
    const flushedPrivate = { ...nextPrivate };

    MART_KEYS.forEach((key) => {
      if (flushedPrivate[key] >= 1000) {
        const amount = flushedPrivate[key];
        if (nextBank >= amount) {
          nextBank -= amount;
        } else {
          const residue    = amount - nextBank;
          nextBank         = 0;
          nextBase        += residue;
          nextBaseDeficit += residue;
        }
        flushedPrivate[key] = 0;
      }
    });

    setBaseStake(nextBase);
    setBaseDeficit(nextBaseDeficit);
    setZeroDeficit(nextZeroDef);
    setOneDeficit(nextOneDef);
    setDeficit(0);
    setBank(nextBank);
    setPrivateDeficit(flushedPrivate);

    /* Reset game state */
    setSmallZeroStake(0);
    setSmallOneStake(0);
    setMartStakes(emptyMart());
    setPressedWins(new Set());
    setJackpot(false);
    setFixture(null);
    setOrderedStakes([]);
    setAmounts(    { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts( { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setIsSmallTeamMatch(false);
    setInputA(""); setInputB("");
    setIsLoading(false);

    await saveAll();
  };

  /* ── CLEAR after normal HDA resolve ── */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setOrderedStakes([]);
    setAmounts(    { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts( { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setMartStakes(emptyMart());
    setIsLoading(false);
    saveAll();
  };

  /* ── DERIVED ── */
  const teamA = sanitizeTeam(inputA) || "HOME";
  const teamB = sanitizeTeam(inputB) || "AWAY";

  const displayAmounts = {
    homeAmount: amounts.homeAmount + zeroAmounts.homeAmount + oneAmounts.homeAmount,
    drawAmount: amounts.drawAmount + zeroAmounts.drawAmount + oneAmounts.drawAmount,
    awayAmount: amounts.awayAmount + zeroAmounts.awayAmount + oneAmounts.awayAmount,
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white">

      {/* ══════════════ DESKTOP ══════════════ */}
      <div className="max-lg:hidden px-4 py-10">
        <div className="text-center mb-10 flex items-center justify-center gap-6 flex-wrap">
          <h1 className="text-4xl font-extrabold text-red-500">Virtual EPL Strategy</h1>
          <button onClick={fetchAll} disabled={isReloading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-sm transition">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
            {isReloading ? "Reloading…" : "Reload"}
          </button>
        </div>

        <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

          {/* ── Jackpot buttons (always visible) ── */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <button onClick={handleJackpot} disabled={!fixture || jackpot}
              className={`py-6 rounded-2xl font-extrabold transition ${jackpot ? "bg-green-500 text-white" : "bg-yellow-400 text-black hover:bg-yellow-500"}`}>
              6–0<br /><span className="text-sm">({amounts.winnerAmount || "–"})</span>
            </button>
            <button onClick={handleZeroJackpot} disabled={!fixture}
              className="py-6 rounded-2xl font-extrabold bg-yellow-500 text-black hover:bg-yellow-400 transition">
              5–0<br /><span className="text-sm">({zeroAmounts.winnerAmount || "–"})</span>
            </button>
            <button onClick={handleOneJackpot} disabled={!fixture}
              className="py-6 rounded-2xl font-extrabold bg-orange-400 text-black hover:bg-orange-300 transition">
              5–1<br /><span className="text-sm">({oneAmounts.winnerAmount || "–"})</span>
            </button>
          </div>

          {/* ── Mart assets (always visible) ── */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {MART_KEYS.map((key) => {
              const won = pressedWins.has(key);
              const col = MART_COLORS[key];
              return (
                <button key={key} onClick={() => handleMartWin(key)}
                  disabled={!fixture || won}
                  className={`py-6 rounded-2xl font-bold transition ${won ? col.won : col.base} ${!fixture || won ? "opacity-60 cursor-not-allowed" : ""}`}>
                  {MART_LABELS[key]}<br />
                  <span className="text-sm">({martStakes[key] || "–"})</span><br />
                  <span className="text-xs opacity-70">def:{privateDeficit[key] || 0}</span>
                </button>
              );
            })}
          </div>

          {/* ── HDA (normal games only) ── */}
          {!isSmallTeamMatch && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <button onClick={() => resolveResult("H")} disabled={!fixture}
                className="py-6 rounded-2xl bg-green-600 text-white font-extrabold hover:bg-green-500 transition disabled:opacity-50">
                {teamA}<br /><span className="text-sm">({displayAmounts.homeAmount || "–"})</span>
              </button>
              <button onClick={() => resolveResult("D")} disabled={!fixture}
                className="py-6 rounded-2xl bg-gray-500 text-white font-extrabold hover:bg-gray-400 transition disabled:opacity-50">
                DRAW<br /><span className="text-sm">({displayAmounts.drawAmount || "–"})</span>
              </button>
              <button onClick={() => resolveResult("A")} disabled={!fixture}
                className="py-6 rounded-2xl bg-red-600 text-white font-extrabold hover:bg-red-500 transition disabled:opacity-50">
                {teamB}<br /><span className="text-sm">({displayAmounts.awayAmount || "–"})</span>
              </button>
            </div>
          )}

          {/* ── Controls ── */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-8">
            <div className="flex items-center gap-4">
              <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home"
                className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg" />
              <span className="font-black text-3xl text-red-500">VS</span>
              <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away"
                className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg" />
            </div>
            <div className="flex gap-4">
              <button onClick={handleLoadGame} disabled={isLoading}
                className="px-10 py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-xl rounded-2xl">
                LOAD
              </button>
              <button onClick={handleNextGame} disabled={!isLoading}
                className="px-10 py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-extrabold text-xl rounded-2xl">
                NEXT
              </button>
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Base<br /><strong className="text-green-600">{baseStake}</strong></div>
            <div>Deficit<br /><strong className="text-red-600">{deficit}</strong></div>
            <div>Base Def<br /><strong className="text-orange-600">{baseDeficit}</strong></div>
            <div>5-0 Def<br /><strong className="text-yellow-600">{zeroDeficit}</strong></div>
            <div>5-1 Def<br /><strong className="text-yellow-500">{oneDeficit}</strong></div>
            <div>Small Def<br /><strong className="text-blue-600">{smallDeficit}</strong></div>
            <div>Bank<br /><strong className="text-emerald-600">{bank}</strong></div>
            {MART_KEYS.map((key) => (
              <div key={key}>{MART_LABELS[key]} Def<br /><strong className="text-purple-600">{privateDeficit[key] || 0}</strong></div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════ MOBILE ══════════════ */}
      <div className="hidden max-lg:block px-3 py-6">
        <div className="text-center mb-4 flex items-center justify-center gap-3">
          <h1 className="text-2xl font-extrabold text-red-500">Virtual EPL</h1>
          <button onClick={fetchAll} disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-xs rounded-xl transition disabled:opacity-50">
            <FiRefreshCw className={`w-3 h-3 ${isReloading ? "animate-spin" : ""}`} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>

        <div className="flex gap-2 mb-4 justify-center items-center">
          <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home"
            className="flex-1 max-w-[105px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" />
          <span className="text-xl text-red-500 font-black px-1">VS</span>
          <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away"
            className="flex-1 max-w-[105px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" />
        </div>

        <div className="flex gap-3 mb-4">
          <button onClick={handleLoadGame} disabled={isLoading}
            className="flex-1 py-3 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-2xl text-sm font-bold transition">
            LOAD
          </button>
          <button onClick={handleNextGame} disabled={!isLoading}
            className="flex-1 py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-2xl text-sm font-bold transition">
            NEXT
          </button>
        </div>

        {/* Jackpot row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button onClick={handleJackpot} disabled={!fixture || jackpot}
            className={`py-3 rounded-xl text-xs font-bold transition ${jackpot ? "bg-green-500 text-white" : "bg-yellow-500 text-black"} disabled:opacity-50`}>
            6–0<br /><span className="text-[10px]">({amounts.winnerAmount || "–"})</span>
          </button>
          <button onClick={handleZeroJackpot} disabled={!fixture}
            className="py-3 rounded-xl text-xs font-bold bg-yellow-600 text-black transition disabled:opacity-50">
            5–0<br /><span className="text-[10px]">({zeroAmounts.winnerAmount || "–"})</span>
          </button>
          <button onClick={handleOneJackpot} disabled={!fixture}
            className="py-3 rounded-xl text-xs font-bold bg-orange-500 text-black transition disabled:opacity-50">
            5–1<br /><span className="text-[10px]">({oneAmounts.winnerAmount || "–"})</span>
          </button>
        </div>

        {/* Mart assets row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {MART_KEYS.map((key) => {
            const won = pressedWins.has(key);
            const col = MART_COLORS[key];
            return (
              <button key={key} onClick={() => handleMartWin(key)}
                disabled={!fixture || won}
                className={`py-3 rounded-xl text-[10px] font-bold transition ${won ? col.won : col.base} ${!fixture || won ? "opacity-60 cursor-not-allowed" : ""}`}>
                {MART_LABELS[key]}<br />
                <span className="text-[9px]">({martStakes[key] || "–"})</span><br />
                <span className="text-[8px] opacity-70">{privateDeficit[key] || 0}</span>
              </button>
            );
          })}
        </div>

        {/* HDA (normal only) */}
        {!isSmallTeamMatch && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button onClick={() => resolveResult("H")} disabled={!fixture}
              className="py-4 rounded-xl font-bold bg-green-600 text-white transition disabled:opacity-50">
              {teamA}<br /><span className="text-xs">({displayAmounts.homeAmount || "–"})</span>
            </button>
            <button onClick={() => resolveResult("D")} disabled={!fixture}
              className="py-4 rounded-xl font-bold bg-gray-500 text-white transition disabled:opacity-50">
              DRAW<br /><span className="text-xs">({displayAmounts.drawAmount || "–"})</span>
            </button>
            <button onClick={() => resolveResult("A")} disabled={!fixture}
              className="py-4 rounded-xl font-bold bg-red-600 text-white transition disabled:opacity-50">
              {teamB}<br /><span className="text-xs">({displayAmounts.awayAmount || "–"})</span>
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="bg-black/30 rounded-2xl p-4 text-xs grid grid-cols-3 gap-2">
          <div>Base<br /><strong className="text-green-400">{baseStake}</strong></div>
          <div>Deficit<br /><strong className="text-red-400">{deficit}</strong></div>
          <div>Base Def<br /><strong className="text-orange-400">{baseDeficit}</strong></div>
          <div>5-0 Def<br /><strong className="text-yellow-400">{zeroDeficit}</strong></div>
          <div>5-1 Def<br /><strong className="text-yellow-300">{oneDeficit}</strong></div>
          <div>Small Def<br /><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div>Bank<br /><strong className="text-emerald-400">{bank}</strong></div>
          {MART_KEYS.map((key) => (
            <div key={key}>{MART_LABELS[key]}<br /><strong className="text-purple-400">{privateDeficit[key] || 0}</strong></div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default Homepage;
