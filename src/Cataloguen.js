
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const specialKeys = [
  "oneX", "twoX", "x2", "zeroGoals", "sixGoals",
  "ht12", "ht21", "ht30", "ft40", "ft41",
];

const specialLabels = {
  oneX: "1X", twoX: "2X", x2: "X2",
  zeroGoals: "0 GOALS", sixGoals: "6 GOALS",
  ht12: "HT 1-2", ht21: "HT 2-1", ht30: "HT 3-0",
  ft40: "FT 4-0", ft41: "FT 4-1",
};

const emptySpecial = () => ({
  oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
  ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
});

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

  /* ── NORMAL GAME STATE ── */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit,     setDeficit]     = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit,  setOneDeficit]  = useState(0);
  const baseRef = useRef(10000);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ── NORMAL STAKES ── */
  const [amounts,       setAmounts]       = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts,   setZeroAmounts]   = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts,    setOneAmounts]    = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ── SMALL ODDS STATE ── */
  const [smallDeficit,  setSmallDeficit]  = useState(0); /* shared pool fed by winner stakes */
  const [badGamesDeficit, setBadGamesDeficit] = useState(0);
  const [badGameShadow, setBadGameShadow] = useState(0);
  const [bank,          setBank]          = useState(0);

  /* ── PRIVATE DEFICIT per asset (10 independent) ── */
  const [privateDeficit, setPrivateDeficit] = useState(emptySpecial());

  /* ── CURRENT GAME STAKES per asset ── */
  const [gameStakes, setGameStakes] = useState(emptySpecial());

  /* ── SMALL ODDS: 5-0 / 5-1 plain stakes (no HDA) ── */
  const [smallZeroStake, setSmallZeroStake] = useState(0);
  const [smallOneStake,  setSmallOneStake]  = useState(0);

  /* ── API ── */
  /* ── API ── */
const fetchAll = async () => {
  setIsReloading(true);
  try {
    const res = await axios.get(API_BASE);
    const d = res.data || {};

    // Core fields
    setBaseStake(d.base ?? 10000);
    setBaseDeficit(d.baseDeficit ?? 0);
    setZeroDeficit(d.zeroDeficit ?? 0);
    setOneDeficit(d.oneDeficit ?? 0);
    setSmallDeficit(d.smallDeficit ?? 0);
    setBank(d.bank ?? 0);
    setBadGamesDeficit(d.badGamesDeficit ?? 0);
    setBadGameShadow(d.badGameShadow ?? 0);

    // Main Private Deficits (1X, 2X, X2, 0 Goals, 6 Goals, etc.)
    if (d.privateDeficit && typeof d.privateDeficit === 'object') {
      setPrivateDeficit(d.privateDeficit);
    } else {
      // Fallback: try loading from legacy individual fields
      setPrivateDeficit({
        oneX: d.oneXDeficit ?? 0,
        twoX: d.twoXDeficit ?? 0,
        x2: d.xTwoDeficit ?? 0,
        zeroGoals: d.zeroGoalsDeficit ?? 0,
        sixGoals: d.sixGoalsDeficit ?? 0,
        ht12: d.htOneTwoDeficit ?? 0,
        ht21: d.htTwoOneDeficit ?? 0,
        ht30: d.htThreeZeroDeficit ?? 0,
        ft40: d.ftFourZeroDeficit ?? 0,
        ft41: d.ftFourOneDeficit ?? 0,
      });
    }
  } catch (err) {
    console.error("❌ Load:", err.message);
  } finally {
    setIsReloading(false);
  }
};

const saveAll = async () => {
  try {
    await axios.put(API_BASE, {
      base: Math.max(10000, baseRef.current),
      baseDeficit,
      zeroDeficit,
      oneDeficit,
      smallDeficit,
      bank,
      badGamesDeficit,
      badGameShadow,

      // Main Object (Recommended)
      privateDeficit,

      // Legacy Individual Fields (for full backend compatibility)
      oneXDeficit: privateDeficit.oneX || 0,
      twoXDeficit: privateDeficit.twoX || 0,
      xTwoDeficit: privateDeficit.x2 || 0,
      zeroGoalsDeficit: privateDeficit.zeroGoals || 0,
      sixGoalsDeficit: privateDeficit.sixGoals || 0,
      htOneTwoDeficit: privateDeficit.ht12 || 0,
      htTwoOneDeficit: privateDeficit.ht21 || 0,
      htThreeZeroDeficit: privateDeficit.ht30 || 0,
      ftFourZeroDeficit: privateDeficit.ft40 || 0,
      ftFourOneDeficit: privateDeficit.ft41 || 0,
    });
  } catch (err) {
    console.error("❌ Save:", err.message);
  }
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

  /* ── CALC INDEPENDENT ASSET STAKES ──
     stake = (privateDeficit[key] + smallDeficit) / odd
  ── */
  const calcGameStakes = (found, privDef, smallDef) => {
    const stakes = emptySpecial();
    specialKeys.forEach((key) => {
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

    /* ── 6-0 winner stake ── */
    const newBase6  = baseStake + deficit;
    setBaseStake(newBase6);
    setDeficit(0);
    const winnerAmt = Math.max(Math.round(newBase6 / found.winner), 10);

    /* ── 5-0 / 5-1 stakes ── */
    const zeroWinner = Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10);
    const oneWinner  = Math.max(Math.round((baseDeficit + oneDeficit)  / found.fiveOne),  10);

    if (!isSmall) {
      /* ══ NORMAL GAME — full HDA ladders, NO special assets ══ */
      const r6  = buildLadder(winnerAmt,  "6-0", code, oddsMap);
      const r50 = buildLadder(zeroWinner, "5-0", code, oddsMap);
      const r51 = buildLadder(oneWinner,  "5-1", code, oddsMap);

      setOrderedStakes([...r6.ladder, ...r50.ladder, ...r51.ladder]);
      setAmounts({     winnerAmount: winnerAmt,  homeAmount: r6.H,  drawAmount: r6.D,  awayAmount: r6.A });
      setZeroAmounts({ winnerAmount: zeroWinner, homeAmount: r50.H, drawAmount: r50.D, awayAmount: r50.A });
      setOneAmounts({  winnerAmount: oneWinner,  homeAmount: r51.H, drawAmount: r51.D, awayAmount: r51.A });
      setIsLoading(true);
      return;
    }

    /* ══ SMALL ODDS GAME ══
       winnerAmt feeds smallDeficit.
       No HDA for 6-0/5-0/5-1.
       All 10 special assets compute their independent stakes.
    ══ */
    const newSmallDef = smallDeficit + winnerAmt;
    setSmallDeficit(newSmallDef);
    setBadGamesDeficit(newSmallDef);
    setBadGameShadow(newSmallDef);

    setAmounts({     winnerAmount: winnerAmt,  homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: zeroWinner, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({  winnerAmount: oneWinner,  homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setSmallZeroStake(zeroWinner);
    setSmallOneStake(oneWinner);

    /* Each asset: (privateDeficit[key] + newSmallDef) / odd */
    const newGameStakes = calcGameStakes(found, privateDeficit, newSmallDef);
    setGameStakes(newGameStakes);
    setIsLoading(true);
  };

  /* ================================================================
     SPECIAL WIN — independent, no chain
     - Clear this asset's privateDeficit → 0
     - Set smallDeficit → 0
     - Add 100 to bank
     ================================================================ */
  const handleSpecialWin = (key) => {
    if (!fixture || !isSmallTeamMatch || gameStakes[key] === 0) return;
    if (pressedWins.has(key)) return;
    setPressedWins((prev) => new Set([...prev, key]));

    if(smallDeficit > 0){
    setPrivateDeficit((prev) => ({ ...prev, [key]: 0 }));
    setSmallDeficit(0);
    setBadGamesDeficit(0);
    }else{
      setPrivateDeficit((prev) => ({ ...prev, [key]: 0 }));
    setBank((prev) => prev + badGameShadow);
    }
    
  };

  /* ── 6-0 WIN ── */
  const handleJackpot = () => {
    if (!fixture) return;
    setJackpot(true);
    setDeficit(0);
    setBaseStake(10000);
    setBaseDeficit(0);
    if (isSmallTeamMatch) {
      setBadGamesDeficit(0);
      setSmallDeficit(0);
    }
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

    clearForNext();
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNextGame = async () => {
    if (!fixture || !isLoading) return;

    let nextBase        = baseStake + deficit;
    let nextBaseDeficit = baseDeficit;
    let nextZeroDef     = zeroDeficit;
    let nextOneDef      = oneDeficit;
    let nextSmallDef    = smallDeficit;
    let nextBank        = bank;

    if (isSmallTeamMatch) {
      /* Push 5-0/5-1 stakes into their deficits */
      nextZeroDef += smallZeroStake;
      nextOneDef  += smallOneStake;

      /* Each losing asset adds its stake to its own privateDeficit */
      const nextPrivate = { ...privateDeficit };
      specialKeys.forEach((key) => {
        if (!pressedWins.has(key) && gameStakes[key] > 0) {
          nextPrivate[key] = (privateDeficit[key] || 0) + gameStakes[key];
        }
      });

      /* Flush any privateDeficit >= 1000 into base */
      specialKeys.forEach((key) => {
        if (nextPrivate[key] >= 1000) {
          const amount = nextPrivate[key];
          if (nextBank >= amount) {
            nextBank -= amount;
          } else {
            const residue    = amount - nextBank;
            nextBank         = 0;
            nextBase        += residue;
            nextBaseDeficit += residue;
          }
          nextPrivate[key] = 0;
        }
      });

      setPrivateDeficit(nextPrivate);
    }

    setBaseStake(nextBase);
    setDeficit(0);
    setBaseDeficit(nextBaseDeficit);
    setZeroDeficit(nextZeroDef);
    setOneDeficit(nextOneDef);
    setSmallDeficit(nextSmallDef);
    setBadGamesDeficit(0);
    setBadGameShadow(0);
    setBank(nextBank);
    setSmallZeroStake(0);
    setSmallOneStake(0);
    setGameStakes(emptySpecial());

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

  /* ── CLEAR after normal game resolve ── */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setOrderedStakes([]);
    setAmounts(    { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts( { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
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

      {/* ══ DESKTOP ══ */}
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
          <div className="mb-8">
            {isSmallTeamMatch ? (
              /* ── SMALL GAME: jackpots + all 10 special assets ── */
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <button onClick={handleJackpot} disabled={!fixture || jackpot}
                  className={`py-6 rounded-2xl font-extrabold transition ${jackpot ? "bg-green-500 text-white" : "bg-yellow-400 text-black hover:bg-yellow-500"}`}>
                  6–0<br />({amounts.winnerAmount || "–"})
                </button>
                <button onClick={handleZeroJackpot} disabled={!fixture}
                  className="py-6 rounded-2xl font-extrabold bg-yellow-500 text-black hover:bg-yellow-400 transition">
                  5–0<br />({zeroAmounts.winnerAmount || "–"})
                </button>
                <button onClick={handleOneJackpot} disabled={!fixture}
                  className="py-6 rounded-2xl font-extrabold bg-orange-400 text-black hover:bg-orange-300 transition">
                  5–1<br />({oneAmounts.winnerAmount || "–"})
                </button>
                {specialKeys.map((key) => (
                  <button key={key} onClick={() => handleSpecialWin(key)}
                    disabled={!fixture || gameStakes[key] === 0 || pressedWins.has(key)}
                    className={`py-6 rounded-2xl font-bold transition ${pressedWins.has(key) ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-500"} disabled:opacity-50`}>
                    {specialLabels[key]}<br />
                    ({gameStakes[key] || "–"})<br />
                    <span className="text-xs opacity-60">def:{privateDeficit[key] || 0}</span>
                  </button>
                ))}
              </div>
            ) : (
              /* ── NORMAL GAME: jackpots + HDA only ── */
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button onClick={handleJackpot} disabled={!fixture || jackpot}
                  className={`py-6 rounded-2xl font-extrabold transition ${jackpot ? "bg-green-500 text-white" : "bg-yellow-400 text-black hover:bg-yellow-500"}`}>
                  6–0<br />({amounts.winnerAmount || "–"})
                </button>
                <button onClick={handleZeroJackpot} disabled={!fixture}
                  className="py-6 rounded-2xl font-extrabold bg-yellow-500 text-black hover:bg-yellow-400 transition">
                  5–0<br />({zeroAmounts.winnerAmount || "–"})
                </button>
                <button onClick={handleOneJackpot} disabled={!fixture}
                  className="py-6 rounded-2xl font-extrabold bg-orange-400 text-black hover:bg-orange-300 transition">
                  5–1<br />({oneAmounts.winnerAmount || "–"})
                </button>
                <button onClick={() => resolveResult("H")} disabled={!fixture}
                  className="py-6 rounded-2xl bg-green-600 text-white font-extrabold hover:bg-green-500 transition disabled:opacity-50">
                  {teamA}<br />({displayAmounts.homeAmount || "–"})
                </button>
                <button onClick={() => resolveResult("D")} disabled={!fixture}
                  className="py-6 rounded-2xl bg-gray-500 text-white font-extrabold hover:bg-gray-400 transition disabled:opacity-50">
                  DRAW<br />({displayAmounts.drawAmount || "–"})
                </button>
                <button onClick={() => resolveResult("A")} disabled={!fixture}
                  className="py-6 rounded-2xl bg-red-600 text-white font-extrabold hover:bg-red-500 transition disabled:opacity-50">
                  {teamB}<br />({displayAmounts.awayAmount || "–"})
                </button>
              </div>
            )}
          </div>

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

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Base<br /><strong className="text-green-600">{baseStake}</strong></div>
            <div>Deficit<br /><strong className="text-red-600">{deficit}</strong></div>
            <div>Base Def<br /><strong className="text-orange-600">{baseDeficit}</strong></div>
            <div>5-0 Def<br /><strong className="text-yellow-600">{zeroDeficit}</strong></div>
            <div>5-1 Def<br /><strong className="text-yellow-500">{oneDeficit}</strong></div>
            <div>Small Def<br /><strong className="text-blue-600">{smallDeficit}</strong></div>
            <div>Bad Games<br /><strong className="text-pink-600">{badGamesDeficit}</strong></div>
            <div>Shadow<br /><strong className="text-orange-500">{badGameShadow}</strong></div>
            <div>Bank<br /><strong className="text-emerald-600">{bank}</strong></div>
            {specialKeys.map((key) => (
              <div key={key}>{specialLabels[key]}<br /><strong className="text-purple-600">{privateDeficit[key] || 0}</strong></div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ MOBILE ══ */}
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

        <div className="flex gap-3 mb-6">
          <button onClick={handleLoadGame} disabled={isLoading}
            className="flex-1 py-3 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-2xl text-sm font-bold transition">
            LOAD
          </button>
          <button onClick={handleNextGame} disabled={!isLoading}
            className="flex-1 py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-2xl text-sm font-bold transition">
            NEXT
          </button>
        </div>

        <div className="mb-6">
          {isSmallTeamMatch ? (
            /* ── SMALL GAME: jackpots + 10 special assets ── */
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleJackpot} disabled={!fixture || jackpot}
                className={`py-3 rounded-xl text-xs font-bold transition ${jackpot ? "bg-green-500 text-white" : "bg-yellow-500 text-black"}`}>
                6–0<br /><span className="text-[10px]">({amounts.winnerAmount || "–"})</span>
              </button>
              <button onClick={handleZeroJackpot} disabled={!fixture}
                className="py-3 rounded-xl text-xs font-bold bg-yellow-600 text-black transition">
                5–0<br /><span className="text-[10px]">({zeroAmounts.winnerAmount || "–"})</span>
              </button>
              <button onClick={handleOneJackpot} disabled={!fixture}
                className="py-3 rounded-xl text-xs font-bold bg-orange-500 text-black transition">
                5–1<br /><span className="text-[10px]">({oneAmounts.winnerAmount || "–"})</span>
              </button>
              {specialKeys.map((key) => (
                <button key={key} onClick={() => handleSpecialWin(key)}
                  disabled={!fixture || gameStakes[key] === 0 || pressedWins.has(key)}
                  className={`py-3 rounded-xl text-xs font-bold transition ${pressedWins.has(key) ? "bg-green-500 text-white" : "bg-blue-700 text-white"} disabled:opacity-50`}>
                  {specialLabels[key]}<br />
                  <span className="text-[10px]">({gameStakes[key] || "–"})</span><br />
                  <span className="text-[8px] opacity-60">{privateDeficit[key] || 0}</span>
                </button>
              ))}
            </div>
          ) : (
            /* ── NORMAL GAME: jackpots + HDA only ── */
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleJackpot} disabled={!fixture || jackpot}
                className={`py-4 rounded-xl text-sm font-bold transition ${jackpot ? "bg-green-500 text-white" : "bg-yellow-500 text-black"}`}>
                6–0<br /><span className="text-xs">({amounts.winnerAmount || "–"})</span>
              </button>
              <button onClick={handleZeroJackpot} disabled={!fixture}
                className="py-4 rounded-xl text-sm font-bold bg-yellow-600 text-black transition">
                5–0<br /><span className="text-xs">({zeroAmounts.winnerAmount || "–"})</span>
              </button>
              <button onClick={handleOneJackpot} disabled={!fixture}
                className="py-4 rounded-xl text-sm font-bold bg-orange-500 text-black transition">
                5–1<br /><span className="text-xs">({oneAmounts.winnerAmount || "–"})</span>
              </button>
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
        </div>

        <div className="bg-black/30 rounded-2xl p-4 text-xs grid grid-cols-3 gap-2">
          <div>Base<br /><strong className="text-green-400">{baseStake}</strong></div>
          <div>Deficit<br /><strong className="text-red-400">{deficit}</strong></div>
          <div>Base Def<br /><strong className="text-orange-400">{baseDeficit}</strong></div>
          <div>5-0 Def<br /><strong className="text-yellow-400">{zeroDeficit}</strong></div>
          <div>5-1 Def<br /><strong className="text-yellow-300">{oneDeficit}</strong></div>
          <div>Small Def<br /><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div>Bad Games<br /><strong className="text-pink-400">{badGamesDeficit}</strong></div>
          <div>Shadow<br /><strong className="text-orange-300">{badGameShadow}</strong></div>
          <div>Bank<br /><strong className="text-emerald-400">{bank}</strong></div>
          {specialKeys.map((key) => (
            <div key={key}>{specialLabels[key]}<br /><strong className="text-purple-400">{privateDeficit[key] || 0}</strong></div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default Homepage;
