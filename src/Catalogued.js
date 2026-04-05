import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from 'react-icons/fi';

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

/* ---------------- API ---------------- */
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {
  /* ---------------- INPUTS ---------------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  /* ---------------- FIXTURE & FLAGS ---------------- */
  const [fixture, setFixture] = useState(null);
  const [isSmallTeamMatch, setIsSmallTeamMatch] = useState(false);
  const [smallTeamImpact, setSmallTeamImpact] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [pressedWins, setPressedWins] = useState(new Set());
  const [jackpot, setJackpot] = useState(false);
  const [isLoading, setIsLoading] = useState(false);     // for LOAD button
  /* ---------------- BASE & MAIN DEFICIT ---------------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [deficit, setDeficit] = useState(0);
  const baseRef = useRef(10000);

  /* ---------------- MAIN STAKES (normal matches only) ---------------- */
  const [amounts, setAmounts] = useState({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------------- BAD GAMES + MARTINGALE ---------------- */
  const [badGamesDeficit, setBadGamesDeficit] = useState(0);
  const [badGameShadow, setBadGameShadow] = useState(0);
  const [martingaleDeficit, setMartingaleDeficit] = useState(0);   // NEW: Martingale bucket
  const [cumulativeMap, setCumulativeMap] = useState({});
  /* ---------------- TOTAL SMALL DEFICITS ---------------- */
  const [totalSmallDeficits, setTotalSmallDeficits] = useState(0);

  /* ---------------- 10 INDIVIDUAL SPECIAL DEFICITS ---------------- */
  const [specialDeficits, setSpecialDeficits] = useState({
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  /* ---------------- PENDING STAKES ---------------- */
  const [pendingSpecialStakes, setPendingSpecialStakes] = useState({
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  const specialKeys = [
    "oneX", "twoX", "x2", "zeroGoals", "sixGoals",
    "ht12", "ht21", "ht30", "ft40", "ft41"
  ];

  const specialLabels = {
    oneX: "1X", twoX: "2X", x2: "X2",
    zeroGoals: "0 GOALS", sixGoals: "6 GOALS",
    ht12: "HT 1-2", ht21: "HT 2-1", ht30: "HT 3-0",
    ft40: "FT 4-0", ft41: "FT 4-1",
  };

  // Martingale order as you specified
  const martingaleOrder = ["oneX", "twoX", "sixGoals", "zeroGoals", "ht12", "ht21", "ht30", "ft40", "ft41"];

  useEffect(() => {
    baseRef.current = baseStake;
  }, [baseStake]);
  
const handleReload = async () => {
  setIsReloading(true);
  try {
    await fetchAll();
  } catch (err) {
    console.error(err);
  } finally {
    setIsReloading(false);
  }
};
  /* ---------------- LOAD / SAVE ---------------- */
  const fetchAll = async () => {
    try {
      const res = await axios.get(API_BASE);
      const data = res.data || {};

      setBaseStake(data.base ?? 10000);
      setBadGamesDeficit(data.badGamesDeficit ?? 0);
      setBadGameShadow(data.badGameShadow ?? 0);
      setMartingaleDeficit(data.martingaleDeficit ?? 0);

      setSpecialDeficits({
        oneX: data.oneXDeficit ?? 0,
        twoX: data.twoXDeficit ?? 0,
        x2: data.x2Deficit ?? 0,
        zeroGoals: data.zeroGoalsDeficit ?? 0,
        sixGoals: data.sixGoalsDeficit ?? 0,
        ht12: data.ht12Deficit ?? 0,
        ht21: data.ht21Deficit ?? 0,
        ht30: data.ht30Deficit ?? 0,
        ft40: data.ft40Deficit ?? 0,
        ft41: data.ft41Deficit ?? 0,
      });
    } catch (err) {
      console.error("❌ Load failed:", err.message);
    }
  };

  const saveAll = async () => {
    try {
      const payload = {
        base: Math.max(10000, baseRef.current),
        badGamesDeficit,
        badGameShadow,
        martingaleDeficit,                    // NEW
        oneXDeficit: specialDeficits.oneX,
        twoXDeficit: specialDeficits.twoX,
        x2Deficit: specialDeficits.x2,
        zeroGoalsDeficit: specialDeficits.zeroGoals,
        sixGoalsDeficit: specialDeficits.sixGoals,
        ht12Deficit: specialDeficits.ht12,
        ht21Deficit: specialDeficits.ht21,
        ht30Deficit: specialDeficits.ht30,
        ft40Deficit: specialDeficits.ft40,
        ft41Deficit: specialDeficits.ft41,
      };
      await axios.put(API_BASE, payload);
      console.log("✅ Saved:", payload);
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ---------------- HELPERS ---------------- */
  // const calcStake = (target, odd) => {
  //   if (odd <= 1.01) return 0;
  //   let stake = Math.round(target / (odd - 1));
  //   return Math.max(stake, 10);
  // };

  const getAssetsBehind = (wonKey) => {
    const index = martingaleOrder.indexOf(wonKey);
    return index === -1 ? [] : martingaleOrder.slice(index + 1);
  };
  // const getAssetsBefore = (wonKey) => {
  //   const index = martingaleOrder.indexOf(wonKey);
  //   return index === -1 ? [] : martingaleOrder.slice(0, index);
  // };
  
const handleLoadGame = (e) => {
  e.preventDefault();
  if (isLoading) return;
  const home = sanitizeTeam(inputA) || "che";
  const away = sanitizeTeam(inputB) || "che";

  let found = smallOdds.find((o) => o.home === home && o.away === away);
  const isSmall = !!found;

  if (!isSmall) {
    found = odds.find((o) => o.home === home && o.away === away);
  }

  if (!found) {
    alert(`No odds for ${home} vs ${away}`);
    return;
  }

  const newBase = baseStake + deficit;
  setBaseStake(newBase);
  setDeficit(0);

  setIsSmallTeamMatch(isSmall);
  setFixture(found);
  setSmallTeamImpact(false);

  // ✅ FIX 1: Correct winner calculation
  let winnerAmount = Math.round(newBase / (found.winner - 1)) || 10;
  winnerAmount = Math.max(winnerAmount, 10);

  // =========================
  // ✅ NORMAL MATCH LOGIC (YOU LOST THIS)
  // =========================
  let homeAmount = 0, drawAmount = 0, awayAmount = 0;
  let ladder = [];

  if (!isSmall) {
    const oddsMap = {
      H: found.win,
      D: found.draw,
      A: found.lose,
    };

    let runningTotal = winnerAmount;

    for (const step of found.code || "") {
      const odd = oddsMap[step];
      if (!odd || odd <= 1.01) continue;

      let stake = Math.round(runningTotal / (odd - 1));
      stake = Math.max(stake, 10);

      ladder.push({ step, stake });

      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;

      runningTotal += stake;
    }
  }

  // ✅ IMPORTANT: THIS WAS MISSING
  setOrderedStakes(ladder);
  setAmounts({
    winnerAmount,
    homeAmount,
    drawAmount,
    awayAmount,
  });
setIsLoading(true) // ✅ VERY IMPORTANT

  // =========================
  // SMALL MATCH (MARTINGALE)
  // =========================
  let newMartingale = martingaleDeficit;
  let newBad = badGamesDeficit;

  if (isSmall) {
    newMartingale += winnerAmount;

    let toBad = 0;
    if (newMartingale <= 300) toBad = newMartingale;
    else if (newMartingale <= 600) toBad = Math.floor(newMartingale / 2);
    else if (newMartingale <= 10000) toBad = Math.floor(newMartingale / 3);
    else if (newMartingale <= 15000) toBad = Math.floor(newMartingale / 4);
    else if (newMartingale <= 20000) toBad = Math.floor(newMartingale / 5);
    else if (newMartingale <= 25000) toBad = Math.floor(newMartingale / 6);
    else if (newMartingale <= 30000) toBad = Math.floor(newMartingale / 7);
    else if (newMartingale <= 35000) toBad = Math.floor(newMartingale / 8);
    else if (newMartingale <= 40000) toBad = Math.floor(newMartingale / 9);
    else toBad = Math.floor(newMartingale / 10);

    newBad += toBad;
    newMartingale -= toBad;

    setMartingaleDeficit(newMartingale);
    setBadGamesDeficit(newBad);
    setBadGameShadow(newBad);
  }

  // =========================
  // SPECIAL STAKES (MARTINGALE)
  // =========================
  const newPending = {};
  const newCumulative = {};

  let runningTarget = newBad;

  specialKeys.forEach((key) => {
    const odd = found[key] || 0;

    if (odd > 1.01) {
      const stake = Math.max(
        Math.round(runningTarget / (odd - 1)),
        10
      );

      newPending[key] = stake;
      newCumulative[key] = runningTarget;

      runningTarget += stake;
    } else {
      newPending[key] = 0;
      newCumulative[key] = runningTarget;
    }
  });

  setPendingSpecialStakes(newPending);
  setCumulativeMap(newCumulative);

  if (isSmall) {
    const addedThisTime = Object.values(newPending).reduce((sum, v) => sum + v, 0);
    setTotalSmallDeficits((prev) => prev + addedThisTime);
  }
};
const handleSpecialWin = (type) => {
  if (!fixture || !isSmallTeamMatch || pendingSpecialStakes[type] === 0) return;
  setPressedWins((prev) => new Set([...prev, type]));
  // ✅ snapshot (prevents React async issues)
  const stakesSnapshot = { ...pendingSpecialStakes };

  const stake = stakesSnapshot[type];

  const behindKeys = getAssetsBehind(type);
  const behindTotal = behindKeys.reduce(
    (sum, k) => sum + (stakesSnapshot[k] || 0),
    0
  );

  // ✅ TRUE before (from cumulative map)
  const beforeTotal = cumulativeMap[type] || 0;

  // ---- CLEAR CURRENT ----
  setPendingSpecialStakes((prev) => ({ ...prev, [type]: 0 }));
  setTotalSmallDeficits((prev) => Math.max(0, prev - stake));

  if (!smallTeamImpact) {
    // ✅ FIRST WIN
    setBadGamesDeficit(0);

    // Add only assets behind
    setMartingaleDeficit((prev) => prev + behindTotal);

    setSmallTeamImpact(true);
    setTotalSmallDeficits(0);
  } else {
    // ✅ SECOND+ WIN
    if(martingaleDeficit > beforeTotal){
      setMartingaleDeficit((prev) =>
      Math.max(0, prev - beforeTotal)
    );
    }else{
      const residue = beforeTotal - martingaleDeficit
      setMartingaleDeficit(0)
      setBaseStake((prev) => prev + residue)
    }
    
  }
};
  /* ---------------- JACKPOT (6-0) ---------------- */
  const handleJackpot = () => {
    if (!fixture) return;
    setJackpot(true);
    setDeficit(0);
    setBaseStake(10000);
  };

  /* ---------------- MAIN RESULT (H/D/A) ---------------- */
  const handleMainResult = (step) => {
    if (!fixture || isSmallTeamMatch) return;

    const index = orderedStakes.findIndex((s) => s.step === step);
    if (index === -1) return;

    const newDeficit = orderedStakes.slice(index + 1).reduce((sum, s) => sum + s.stake, 0);
    setDeficit(newDeficit);
  };
    /* ---------------- NEXT GAME ---------------- */
  const handleNextGame = async () => {
    if (!fixture || !isLoading) return;
    const finalBaseThisGame = baseStake + deficit;

    let nextBase = finalBaseThisGame;
    let nextBad = 0;                    // We usually clear bad on next game for small matches
    let nextShadow = 0;
    let nextMartingale = martingaleDeficit;
    let nextTotalSmall = totalSmallDeficits;

    // === MAIN REQUEST: Push badGamesDeficit into martingaleDeficit ===
    if (isSmallTeamMatch) {
      nextMartingale = Math.max(0, martingaleDeficit + badGamesDeficit + totalSmallDeficits);

      // Optional: reset totalSmallDeficits if you want clean slate
      nextTotalSmall = 0;

      // Clear bad deficit and shadow so next load can re-split from martingale
      nextBad = 0;
      nextShadow = 0;

      setSmallTeamImpact(false);
    }

    // Apply all updates
    setBaseStake(nextBase);
    setDeficit(0);
    setBadGamesDeficit(nextBad);
    setBadGameShadow(nextShadow);
    setMartingaleDeficit(nextMartingale);        // ← This is the important line
    setTotalSmallDeficits(nextTotalSmall);

    // Reset pending stakes
    setPendingSpecialStakes({
      oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
      ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
    });
    setSpecialDeficits({
      oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
      ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
    });

    setFixture(null);
    setOrderedStakes([]);
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setIsSmallTeamMatch(false);
    setInputA("");
    setInputB("");
    setIsLoading(false);

    await saveAll();
  };

  const teamA = sanitizeTeam(inputA) || "HOME";
  const teamB = sanitizeTeam(inputB) || "AWAY";

  return (
    <div>
      {/* ====================== DESKTOP ====================== */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
              Virtual EPL Strategy
            </h1>
<button 
  onClick={handleReload} 
  disabled={isReloading}
  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-xl text-sm transition"
>
  <FiRefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} /> 
  {isReloading ? "Reloading..." : "Reload"}
</button>          
</div>
          <p className="text-red-400 mt-2">
            {fixture ? (isSmallTeamMatch ? "SMALL TEAM MATCH — Martingale Active" : "NORMAL MATCH") : "Ready"}
          </p>
        </div>

        <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">
          {/* Outcome Buttons */}
          <div className="mb-8">
            {isSmallTeamMatch ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <button onClick={handleJackpot} disabled={!fixture || jackpot} 
                className={`py-6 rounded-2xl font-extrabold transition ${
                        jackpot 
                          ? "bg-green-500 text-white scale-105" 
                          : "bg-yellow-400 text-black hover:bg-yellow-500"
                      }`}
                >
                  6–0<br />({amounts.winnerAmount || "–"})
                </button>
                {specialKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => handleSpecialWin(key)}
                    disabled={!fixture || pendingSpecialStakes[key] === 0 || pressedWins.has(key)}
                    className={`py-6 rounded-2xl font-bold transition ${
                        pressedWins.has(key) 
                          ? "bg-green-500 text-white scale-105" 
                          : "bg-blue-600 text-white hover:bg-blue-500"
                      }`}

                  >
                    {specialLabels[key]}<br />({pendingSpecialStakes[key] || "–"})
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button onClick={handleJackpot} disabled={!fixture || jackpot} 
                className={`py-6 rounded-2xl font-extrabold transition ${
                        jackpot 
                          ? "bg-green-500 text-white scale-105" 
                          : "bg-yellow-400 text-black hover:bg-yellow-500"
                      }`}
                      >
                  6–0<br />({amounts.winnerAmount || "–"})
                </button>
               {/* Home */}
      <button 
        onClick={() => handleMainResult("H")} 
        disabled={!fixture || pressedWins.has("H")}
        className={`py-6 rounded-2xl font-extrabold transition ${
          pressedWins.has("H") ? "bg-green-500 text-white scale-105" : "bg-green-600 text-white hover:bg-green-500"
        }`}
      >
        {teamA}<br />({amounts.homeAmount || "–"})
      </button>

      {/* Draw */}
      <button 
        onClick={() => handleMainResult("D")} 
        disabled={!fixture || pressedWins.has("D")}
        className={`py-6 rounded-2xl font-extrabold transition ${
          pressedWins.has("D") ? "bg-green-500 text-white scale-105" : "bg-gray-500 text-white hover:bg-gray-400"
        }`}
      >
        DRAW<br />({amounts.drawAmount || "–"})
      </button>

      {/* Away */}
      <button 
        onClick={() => handleMainResult("A")} 
        disabled={!fixture || pressedWins.has("A")}
        className={`py-6 rounded-2xl font-extrabold transition ${
          pressedWins.has("A") ? "bg-green-500 text-white scale-105" : "bg-red-600 text-white hover:bg-red-500"
        }`}
      >
        {teamB}<br />({amounts.awayAmount || "–"})
      </button>
              </div>
            )}
          </div>

          {/* Inputs + Buttons */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-8">
            <div className="flex items-center gap-4">
              <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="home" className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg" />
              <span className="font-black text-3xl text-red-500">VS</span>
              <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="away" className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg" />
            </div>
            <div className="flex gap-4">
              <button onClick={handleLoadGame} disabled={isLoading} className="px-10 py-4 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xl rounded-2xl">GO FOR INPUT</button>
              <button onClick={handleNextGame} disabled={!isLoading} className="px-10 py-4 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xl rounded-2xl">GO TO NEXT GAME</button>
            </div>
          </div>

          {/* Stats Display */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
            <div>Main Def: <strong className="text-red-600">{deficit}</strong></div>
            <div>Bad Games: <strong className="text-yellow-600">{badGamesDeficit}</strong></div>
            <div>Bad Shadow: <strong className="text-orange-600">{badGameShadow}</strong></div>
            <div>Martingale: <strong className="text-purple-600">{martingaleDeficit}</strong></div>
            <div>Total Small: <strong className="text-purple-600">{totalSmallDeficits}</strong></div>
            {specialKeys.map(key => (
              <div key={key}>{specialLabels[key]}: <strong>{specialDeficits[key]}</strong></div>
            ))}
          </div>
        </div>
      </div>

      {/* ====================== MOBILE ====================== */}
<div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-6">
  <div className="text-center mb-6">
    <h1 className="text-2xl font-extrabold text-red-500">Virtual EPL</h1>
    <button 
  onClick={handleReload} 
  disabled={isReloading}
 className="mt-3 px-5 py-1.5 bg-red-700 hover:bg-red-600 text-xs rounded-xl transition"
>
  <FiRefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} /> 
  {isReloading ? "Reloading..." : "Reload"}
</button>    
  </div>

  {/* Inputs - Made smaller */}
  <div className="flex gap-2 mb-6 justify-center items-center">
    <input 
      value={inputA} 
      onChange={(e) => setInputA(e.target.value)} 
      placeholder="Home" 
      className="flex-1 max-w-[105px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
    />
    <span className="text-xl text-red-500 font-black px-1">VS</span>
    <input 
      value={inputB} 
      onChange={(e) => setInputB(e.target.value)} 
      placeholder="Away" 
      className="flex-1 max-w-[105px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
    />
  </div>

  {/* Load & Next Buttons */}
  <div className="flex gap-3 mb-8">
    <button 
      onClick={handleLoadGame}
      disabled={isLoading} 
      className="flex-1 py-3 bg-red-700 hover:bg-red-600 rounded-2xl text-sm font-bold transition"
    >
      LOAD
    </button>
    <button 
      onClick={handleNextGame} 
      disabled={!isLoading}
      className="flex-1 py-3 bg-green-700 hover:bg-green-600 rounded-2xl text-sm font-bold transition"
    >
      NEXT
    </button>
  </div>

  {/* Outcome Buttons */}
  <div className="mb-8">
    {isSmallTeamMatch ? (
      <div className="grid grid-cols-3 gap-2">
        <button 
          onClick={handleJackpot} 
          disabled={!fixture || jackpot} 
       className={`py-3 rounded-xl text-xs font-bold transition ${
                        jackpot 
                          ? "bg-green-500 text-white scale-105" 
                          : "bg-yellow-500 text-black hover:bg-yellow-500"
                      }`}
       >
          6–0<br />
          <span className="text-[10px]">({amounts.winnerAmount || "–"})</span>
        </button>
        {specialKeys.map((key) => (
          <button
            key={key}
            onClick={() => handleSpecialWin(key)}
            disabled={!fixture || pendingSpecialStakes[key] === 0 || pressedWins.has(key)}
            className={`py-3 rounded-xl text-xs font-bold  transition ${
                        pressedWins.has(key) 
                          ? "bg-green-500 text-white scale-105" 
                          : "bg-blue-700 text-white hover:bg-blue-600"
                      }`}
          >
            {specialLabels[key]}<br />
            <span className="text-[10px]">({pendingSpecialStakes[key] || "–"})</span>
          </button>
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-2">
        <button 
          onClick={handleJackpot} 
          disabled={!fixture || jackpot} 
        className={`py-4 rounded-xl text-sm font-bold transition ${
                        jackpot 
                          ? "bg-green-500 text-white scale-105" 
                          : "bg-yellow-500 text-black hover:bg-yellow-500"
                      }`}
        
        >
          6–0<br />
          <span className="text-xs">({amounts.winnerAmount || "–"})</span>
        </button>


{/* Home */}
      <button 
        onClick={() => handleMainResult("H")} 
        disabled={!fixture || pressedWins.has("H")}
        className={`py-6 rounded-2xl font-extrabold transition ${
          pressedWins.has("H") ? "bg-green-500 text-white scale-105" : "bg-green-600 text-white hover:bg-green-500"
        }`}
      >
        {teamA}<br />({amounts.homeAmount || "–"})
      </button>

      {/* Draw */}
      <button 
        onClick={() => handleMainResult("D")} 
        disabled={!fixture || pressedWins.has("D")}
        className={`py-6 rounded-2xl font-extrabold transition ${
          pressedWins.has("D") ? "bg-green-500 text-white scale-105" : "bg-gray-500 text-white hover:bg-gray-400"
        }`}
      >
        DRAW<br />({amounts.drawAmount || "–"})
      </button>

      {/* Away */}
      <button 
        onClick={() => handleMainResult("A")} 
        disabled={!fixture || pressedWins.has("A")}
        className={`py-6 rounded-2xl font-extrabold transition ${
          pressedWins.has("A") ? "bg-green-500 text-white scale-105" : "bg-red-600 text-white hover:bg-red-500"
        }`}
      >
        {teamB}<br />({amounts.awayAmount || "–"})
      </button>




        <button 
          onClick={() => handleMainResult("H")} 
          disabled={!fixture} 
          className="py-4 rounded-xl bg-green-700 text-white text-sm font-bold hover:bg-green-600 transition active:scale-95"
        >
          {teamA}<br />
          <span className="text-xs">({amounts.homeAmount || "–"})</span>
        </button>
        <button 
          onClick={() => handleMainResult("D")} 
          disabled={!fixture} 
          className="py-4 rounded-xl bg-gray-600 text-white text-sm font-bold col-span-2 hover:bg-gray-500 transition active:scale-95"
        >
          DRAW<br />
          <span className="text-xs">({amounts.drawAmount || "–"})</span>
        </button>
        <button 
          onClick={() => handleMainResult("A")} 
          disabled={!fixture} 
          className="py-4 rounded-xl bg-red-700 text-white text-sm font-bold hover:bg-red-600 transition active:scale-95"
        >
          {teamB}<br />
          <span className="text-xs">({amounts.awayAmount || "–"})</span>
        </button>
      </div>
    )}
  </div>

  {/* Stats */}
  <div className="bg-black/30 rounded-2xl p-4 text-xs grid grid-cols-2 gap-3">
    <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
    <div>Bad: <strong className="text-yellow-400">{deficit}</strong></div>
    <div>Def: <strong className="text-yellow-400">{badGamesDeficit}</strong></div>
    <div>Martingale: <strong className="text-purple-400">{martingaleDeficit}</strong></div>
    <div>Shadow: <strong className="text-orange-400">{badGameShadow}</strong></div>
  </div>
</div>
    </div>
  );
};

export default Homepage;