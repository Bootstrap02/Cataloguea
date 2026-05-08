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

const martingaleOrder = [
  "oneX", "twoX", "sixGoals", "zeroGoals",
  "ht12", "ht21", "ht30", "ft40", "ft41",
];

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
  const [smallTeamImpact, setSmallTeamImpact] = useState(false);
  const [pressedWins, setPressedWins] = useState(new Set());
  const [jackpot, setJackpot] = useState(false);

  /* ── NORMAL GAME STATE (cataloguem) ── */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit,     setDeficit]     = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit,  setOneDeficit]  = useState(0);
  const baseRef = useRef(10000);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ── NORMAL STAKES ── */
  const [amounts,    setAmounts]    = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts, setZeroAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts,  setOneAmounts]  = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ── SMALL ODDS STATE (catalogued martingale) ── */
  const [martingaleDeficit, setMartingaleDeficit] = useState(0);
  const [badGamesDeficit,   setBadGamesDeficit]   = useState(0);
  const [badGameShadow,     setBadGameShadow]     = useState(0);
  const [bank,              setBank]              = useState(0);
  const [cumulativeMap,     setCumulativeMap]     = useState({});
  const [pendingSpecialStakes, setPendingSpecialStakes] = useState(emptySpecial());
  const [totalSmallDeficits,   setTotalSmallDeficits]   = useState(0);

  /* ── SMALL ODDS: 5-0 / 5-1 plain stakes (no HDA) ── */
  const [smallZeroStake, setSmallZeroStake] = useState(0);
  const [smallOneStake,  setSmallOneStake]  = useState(0);

  /* ── API ── */
  const fetchAll = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d = res.data || {};
      setBaseStake(d.base ?? 10000);
      setBaseDeficit(d.baseDeficit ?? 0);
      setZeroDeficit(d.zeroDeficit ?? 0);
      setOneDeficit(d.oneDeficit ?? 0);
      setMartingaleDeficit(d.martingaleDeficit ?? 0);
      setBadGamesDeficit(d.badGamesDeficit ?? 0);
      setBadGameShadow(d.badGameShadow ?? 0);
      setBank(d.bank ?? 0);
    } catch (err) { console.error("❌ Load:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveAll = async () => {
    try {
      await axios.put(API_BASE, {
        base: Math.max(10000, baseRef.current),
        baseDeficit, zeroDeficit, oneDeficit,
        martingaleDeficit, badGamesDeficit, badGameShadow, bank,
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
      let stake = Math.round(running / (odd - 1));
      
      ladder.push({ step, stake, type });
      if (step === "H") H = stake;
      if (step === "D") D = stake;
      if (step === "A") A = stake;
      running += stake;
    }
    return { ladder, H, D, A };
  };

  /* ── HELPERS ── */
  const getAssetsBehind = (wonKey) => {
    const idx = martingaleOrder.indexOf(wonKey);
    return idx === -1 ? [] : martingaleOrder.slice(idx + 1);
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
    setSmallTeamImpact(false);
    setPressedWins(new Set());
    setJackpot(false);
    setOrderedStakes([]);

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    const code    = found.code || "";

    /* ── 6-0 (winner) stake ── */
    const newBase6 = baseStake + deficit;
    setBaseStake(newBase6);
    setDeficit(0);
    let winnerAmt = Math.max(Math.round(newBase6 / found.winner), 10);

    /* ── NORMAL GAME: full HDA ladders ── */
    if (!isSmall) {
      const r6  = buildLadder(winnerAmt, "6-0", code, oddsMap);
      const r50 = buildLadder(Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10), "5-0", code, oddsMap);
      const r51 = buildLadder(Math.max(Math.round((baseDeficit + oneDeficit)  / found.fiveOne),  10), "5-1", code, oddsMap);

      setOrderedStakes([...r6.ladder, ...r50.ladder, ...r51.ladder]);

      setAmounts({    winnerAmount: winnerAmt,        homeAmount: r6.H,  drawAmount: r6.D,  awayAmount: r6.A  });
      setZeroAmounts({ winnerAmount: Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10), homeAmount: r50.H, drawAmount: r50.D, awayAmount: r50.A });
      setOneAmounts({  winnerAmount: Math.max(Math.round((baseDeficit + oneDeficit)  / found.fiveOne),  10), homeAmount: r51.H, drawAmount: r51.D, awayAmount: r51.A });

      setIsLoading(true);
      return;
    }

    /* ── SMALL GAME ── */

    // 6-0 → martingale
    let newMartingale = martingaleDeficit + winnerAmt;
    let toBad = 0;
    if      (newMartingale <= 300)   toBad = newMartingale;
    else if (newMartingale <= 600)   toBad = Math.floor(newMartingale / 2);
    else if (newMartingale <= 10000) toBad = Math.floor(newMartingale / 3);
    else if (newMartingale <= 15000) toBad = Math.floor(newMartingale / 4);
    else if (newMartingale <= 20000) toBad = Math.floor(newMartingale / 5);
    else if (newMartingale <= 25000) toBad = Math.floor(newMartingale / 6);
    else if (newMartingale <= 30000) toBad = Math.floor(newMartingale / 7);
    else if (newMartingale <= 35000) toBad = Math.floor(newMartingale / 8);
    else if (newMartingale <= 40000) toBad = Math.floor(newMartingale / 9);
    else                              toBad = Math.floor(newMartingale / 10);

    const newBad = badGamesDeficit + toBad;
    newMartingale -= toBad;
    setMartingaleDeficit(newMartingale);
    setBadGamesDeficit(newBad);
    setBadGameShadow(newBad);

    setAmounts({ winnerAmount: winnerAmt, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    // 5-0 plain stake (no HDA in small games)
    const sz = Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10);
    setSmallZeroStake(sz);
    setZeroAmounts({ winnerAmount: sz, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    // 5-1 plain stake (no HDA in small games)
    const so = Math.max(Math.round((baseDeficit + oneDeficit) / found.fiveOne), 10);
    setSmallOneStake(so);
    setOneAmounts({ winnerAmount: so, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    // Special martingale stakes
    const newPending  = {};
    const newCumulative = {};
    let runningTarget = newBad;
    specialKeys.forEach((key) => {
      const odd = found[key] || 0;
      if (odd > 1.01) {
        const stake = Math.max(Math.round(runningTarget / (odd - 1)), 10);
        newPending[key]    = stake;
        newCumulative[key] = runningTarget;
        runningTarget += stake;
      } else {
        newPending[key]    = 0;
        newCumulative[key] = runningTarget;
      }
    });
    setPendingSpecialStakes(newPending);
    setCumulativeMap(newCumulative);
    const addedThisTime = Object.values(newPending).reduce((s, v) => s + v, 0);
    setTotalSmallDeficits((prev) => prev + addedThisTime);

    setIsLoading(true);
  };

  /* ================================================================
     SPECIAL WIN (small odds martingale)
     ================================================================ */
  const handleSpecialWin = (type) => {
    if (!fixture || !isSmallTeamMatch || pendingSpecialStakes[type] === 0) return;
    setPressedWins((prev) => new Set([...prev, type]));

    const stakesSnap   = { ...pendingSpecialStakes };
    const stake        = stakesSnap[type];
    const behindKeys   = getAssetsBehind(type);
    const behindTotal  = behindKeys.reduce((s, k) => s + (stakesSnap[k] || 0), 0);
    const beforeTotal  = cumulativeMap[type] || 0;

    setPendingSpecialStakes((prev) => ({ ...prev, [type]: 0 }));
    setTotalSmallDeficits((prev) => Math.max(0, prev - stake));

    if (!smallTeamImpact) {
      // First win
      setBadGamesDeficit(0);
      setMartingaleDeficit((prev) => prev + behindTotal);
      setSmallTeamImpact(true);
      setTotalSmallDeficits(0);
    } else {
      // Second+ win → wipe martingale, wipe badGames, send remainder to bank
      const residue = beforeTotal - martingaleDeficit;
      setMartingaleDeficit(0);
      setBadGamesDeficit(0);
      if (residue > 0) {
        setBank((prev) => prev + residue);
      }
    }
  };

  /* ================================================================
     JACKPOTS
     ================================================================ */
  const handleJackpot = () => {
    if (!fixture) return;
    setJackpot(true);
    setDeficit(0);
    setBaseStake(10000);
    setBaseDeficit(0);
  };

  const handleZeroJackpot = () => {
    setBaseStake(10000 + oneDeficit);
    setBaseDeficit(oneDeficit);
    setOneDeficit(0);
    setZeroDeficit(0);
  };

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

    const mainLoss  = calcLoss("6-0");
    const zeroLoss  = calcLoss("5-0");
    const oneLoss   = calcLoss("5-1");

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
    let nextMartingale  = martingaleDeficit;
    let nextBad         = 0;
    let nextShadow      = 0;
    let nextBank        = bank;

    if (isSmallTeamMatch) {
      // Push small game 5-0/5-1 stakes into their deficits
      nextZeroDef += smallZeroStake;
      nextOneDef  += smallOneStake;

      // Roll leftover martingale + bad + small into next martingale
      nextMartingale = Math.max(0, martingaleDeficit + badGamesDeficit + totalSmallDeficits);
      nextBad    = 0;
      nextShadow = 0;
    }

    // Check martingale > 1000 → push to baseStake + baseDeficit
    // First check bank: if bank >= martingale, absorb from bank
    if (nextMartingale > 1000) {
      if (nextBank >= nextMartingale) {
        nextBank -= nextMartingale;
        nextMartingale = 0;
      } else {
        const residue = nextMartingale - nextBank;
        nextBank = 0;
        nextBase        += residue;
        nextBaseDeficit += residue;
        nextMartingale   = 0;
      }
    }

    setBaseStake(nextBase);
    setDeficit(0);
    setBaseDeficit(nextBaseDeficit);
    setZeroDeficit(nextZeroDef);
    setOneDeficit(nextOneDef);
    setMartingaleDeficit(nextMartingale);
    setBadGamesDeficit(nextBad);
    setBadGameShadow(nextShadow);
    setBank(nextBank);
    setTotalSmallDeficits(0);
    setSmallZeroStake(0);
    setSmallOneStake(0);

    setPressedWins(new Set());
    setJackpot(false);
    setPendingSpecialStakes(emptySpecial());
    setFixture(null);
    setOrderedStakes([]);
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setIsSmallTeamMatch(false);
    setSmallTeamImpact(false);
    setInputA(""); setInputB("");
    setIsLoading(false);

    await saveAll();
  };

  /* ── CLEAR (used after normal game resolve) ── */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setOrderedStakes([]);
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setIsLoading(false);
    saveAll();
  };

  /* ── DERIVED ── */
  const teamA = sanitizeTeam(inputA) || "HOME";
  const teamB = sanitizeTeam(inputB) || "AWAY";

  const displayAmounts = {
    homeAmount:  amounts.homeAmount  + zeroAmounts.homeAmount  + oneAmounts.homeAmount,
    drawAmount:  amounts.drawAmount  + zeroAmounts.drawAmount  + oneAmounts.drawAmount,
    awayAmount:  amounts.awayAmount  + zeroAmounts.awayAmount  + oneAmounts.awayAmount,
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

          {/* Outcome Buttons */}
          <div className="mb-8">
            {isSmallTeamMatch ? (
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
                    disabled={!fixture || pendingSpecialStakes[key] === 0 || pressedWins.has(key)}
                    className={`py-6 rounded-2xl font-bold transition ${pressedWins.has(key) ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-500"}`}>
                    {specialLabels[key]}<br />({pendingSpecialStakes[key] || "–"})
                  </button>
                ))}
              </div>
            ) : (
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
                  className="py-6 rounded-2xl bg-green-600 text-white font-extrabold hover:bg-green-500 transition">
                  {teamA}<br />({displayAmounts.homeAmount || "–"})
                </button>
                <button onClick={() => resolveResult("D")} disabled={!fixture}
                  className="py-6 rounded-2xl bg-gray-500 text-white font-extrabold hover:bg-gray-400 transition">
                  DRAW<br />({displayAmounts.drawAmount || "–"})
                </button>
                <button onClick={() => resolveResult("A")} disabled={!fixture}
                  className="py-6 rounded-2xl bg-red-600 text-white font-extrabold hover:bg-red-500 transition">
                  {teamB}<br />({displayAmounts.awayAmount || "–"})
                </button>
              </div>
            )}
          </div>

          {/* Inputs */}
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

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Base<br /><strong className="text-green-600">{baseStake}</strong></div>
            <div>Deficit<br /><strong className="text-red-600">{deficit}</strong></div>
            <div>Base Def<br /><strong className="text-orange-600">{baseDeficit}</strong></div>
            <div>5-0 Def<br /><strong className="text-yellow-600">{zeroDeficit}</strong></div>
            <div>5-1 Def<br /><strong className="text-yellow-500">{oneDeficit}</strong></div>
            <div>Martingale<br /><strong className="text-purple-600">{martingaleDeficit}</strong></div>
            <div>Bad Games<br /><strong className="text-pink-600">{badGamesDeficit}</strong></div>
            <div>Shadow<br /><strong className="text-orange-500">{badGameShadow}</strong></div>
            <div>Bank<br /><strong className="text-emerald-600">{bank}</strong></div>
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

        {/* Inputs */}
        <div className="flex gap-2 mb-4 justify-center items-center">
          <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home"
            className="flex-1 max-w-[105px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" />
          <span className="text-xl text-red-500 font-black px-1">VS</span>
          <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away"
            className="flex-1 max-w-[105px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" />
        </div>

        {/* Load / Next */}
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

        {/* Outcome Buttons */}
        <div className="mb-6">
          {isSmallTeamMatch ? (
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
                  disabled={!fixture || pendingSpecialStakes[key] === 0 || pressedWins.has(key)}
                  className={`py-3 rounded-xl text-xs font-bold transition ${pressedWins.has(key) ? "bg-green-500 text-white" : "bg-blue-700 text-white"}`}>
                  {specialLabels[key]}<br /><span className="text-[10px]">({pendingSpecialStakes[key] || "–"})</span>
                </button>
              ))}
            </div>
          ) : (
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
                className="py-4 rounded-xl font-bold bg-green-600 text-white transition">
                {teamA}<br /><span className="text-xs">({displayAmounts.homeAmount || "–"})</span>
              </button>
              <button onClick={() => resolveResult("D")} disabled={!fixture}
                className="py-4 rounded-xl font-bold bg-gray-500 text-white transition">
                DRAW<br /><span className="text-xs">({displayAmounts.drawAmount || "–"})</span>
              </button>
              <button onClick={() => resolveResult("A")} disabled={!fixture}
                className="py-4 rounded-xl font-bold bg-red-600 text-white transition">
                {teamB}<br /><span className="text-xs">({displayAmounts.awayAmount || "–"})</span>
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="bg-black/30 rounded-2xl p-4 text-xs grid grid-cols-3 gap-2">
          <div>Base<br /><strong className="text-green-400">{baseStake}</strong></div>
          <div>Deficit<br /><strong className="text-red-400">{deficit}</strong></div>
          <div>Base Def<br /><strong className="text-orange-400">{baseDeficit}</strong></div>
          <div>5-0 Def<br /><strong className="text-yellow-400">{zeroDeficit}</strong></div>
          <div>5-1 Def<br /><strong className="text-yellow-300">{oneDeficit}</strong></div>
          <div>Martingale<br /><strong className="text-purple-400">{martingaleDeficit}</strong></div>
          <div>Bad Games<br /><strong className="text-pink-400">{badGamesDeficit}</strong></div>
          <div>Shadow<br /><strong className="text-orange-300">{badGameShadow}</strong></div>
          <div>Bank<br /><strong className="text-emerald-400">{bank}</strong></div>
        </div>
      </div>

    </div>
  );
};

export default Homepage;
