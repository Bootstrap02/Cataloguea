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

  /* ---------------- BAD GAMES DEFICIT & SHADOW ---------------- */
  const [badGamesDeficit, setBadGamesDeficit] = useState(0);
  const [badGameShadow, setBadGameShadow] = useState(0);

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

  useEffect(() => {
    baseRef.current = baseStake;
  }, [baseStake]);

  /* ---------------- LOAD / SAVE ---------------- */
  const fetchAll = async () => {
    try {
      const res = await axios.get(API_BASE);
      const data = res.data || {};
      setBaseStake(data.base ?? 10000);
      setBadGamesDeficit(data.badGamesDeficit ?? 0);
      setBadGameShadow(data.badGameShadow ?? 0);

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

  useEffect(() => {
    fetchAll();
  }, []);

  /* ---------------- GO FOR INPUT ---------------- */
const handleLoadGame = (e) => {
  e.preventDefault();

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

  let winnerAmount = Math.round(newBase / (found.winner - 1));
  winnerAmount = Math.max(winnerAmount, 10);

  // ──────────────────────────────────────────────────────────────
  // Compute the NEW bad deficit value FIRST (for both shadow and targets)
  // ──────────────────────────────────────────────────────────────
  let newBad = badGamesDeficit + (isSmall ? winnerAmount : 0);

  if (isSmall) {
    setBadGamesDeficit(newBad);           // set the displayed value
    setBadGameShadow(newBad);
  }

  let homeAmount = 0;
  let drawAmount = 0;
  let awayAmount = 0;
  let ladder = [];

  if (!isSmall) {
    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    let runningTotal = winnerAmount;

    for (const step of found.code || "") {
      const odd = oddsMap[step];
      if (!odd) continue;
      let stake = Math.round(runningTotal / (odd - 1));
      stake = Math.max(stake, 10);
      ladder.push({ step, stake });
      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;
      runningTotal += stake;
    }
  }

  setOrderedStakes(ladder);
  setAmounts({ winnerAmount, homeAmount, drawAmount, awayAmount });

  const calcStake = (target, odd) => {
    if (odd <= 1.01) return 0;
    let stake = Math.round(target / (odd - 1));
    return Math.max(stake, 10);
  };

  const newPending = {};
  specialKeys.forEach((key) => {
    const odd = found[key] || 0;
    // NOW use the UPDATED bad deficit + this special's carried deficit
    const target = newBad + (specialDeficits[key] || 0);
    newPending[key] = calcStake(target, odd);
  });

  setPendingSpecialStakes(newPending);

  // ──────────────────────────────────────────────────────────────
  // Reflect the new deficits IMMEDIATELY on small-team load
  // ──────────────────────────────────────────────────────────────
  if (isSmall) {
    let addedThisTime = 0;
    specialKeys.forEach((key) => {
      addedThisTime += newPending[key] || 0;
    });

    setSpecialDeficits((prev) => {
      const updated = { ...prev };
      specialKeys.forEach((key) => {
        updated[key] = (updated[key] || 0) + (newPending[key] || 0);
      });
      return updated;
    });

    setTotalSmallDeficits((prev) => prev + addedThisTime);
  }
};
  /* ---------------- JACKPOT (6-0) ---------------- */
  const handleJackpot = () => {
    if (!fixture) return;
    setDeficit(0);
    saveAll();
  };

  /* ---------------- MAIN RESULT (H/D/A) ---------------- */
  const handleMainResult = (step) => {
    if (!fixture || isSmallTeamMatch) return;

    const index = orderedStakes.findIndex((s) => s.step === step);
    if (index === -1) return;

    const newDeficit = orderedStakes.slice(index + 1).reduce((sum, s) => sum + s.stake, 0);
    setDeficit(newDeficit);
  };

  /* ---------------- SPECIAL WINS ---------------- */
 
const handleSpecialWinA = (type) => {
  if (!fixture || !isSmallTeamMatch || pendingSpecialStakes[type] === 0) return;

  const recovered = specialDeficits[type];   // e.g. 34 or whatever the stake was

  setBadGamesDeficit(0);
  setSmallTeamImpact(true);
  setTotalSmallDeficits((prev) => Math.max(0, prev - recovered));

  // 1. Clear only the winning special's deficit
  setSpecialDeficits((prev) => ({
    ...prev,
    [type]: 0,
  }));

  // 2. Remove only this game's stake from the winning special (already done above)
  //    → we do NOT touch the other 9 specials

  setPendingSpecialStakes((prev) => ({ ...prev, [type]: 0 }));

  // 3. Subtract ONLY the recovered amount from totalSmallDeficits
};
  const handleSpecialWinB = (type) => {
    if (!fixture || !isSmallTeamMatch || pendingSpecialStakes[type] === 0) return;

    const individualHistory = specialDeficits[type];
    const currentShadow = badGameShadow;

    setSpecialDeficits((prev) => ({ ...prev, [type]: 0 }));
    setPendingSpecialStakes((prev) => ({ ...prev, [type]: 0 }));

    setTotalSmallDeficits((prev) => {
      const deducted = individualHistory + currentShadow;
      return Math.max(0, prev - deducted);
    });

    setBadGameShadow(0);
  };

  /* ---------------- GO TO NEXT GAME ---------------- */
const handleNextGame = async () => {
  if (!fixture) return;

  const finalBaseThisGame = baseStake + deficit;

  let nextBase = finalBaseThisGame;
  let nextBadDeficit = badGamesDeficit;
  let nextBadShadow = badGameShadow;
  let nextSpecialDeficits = { ...specialDeficits };
  let nextTotalSmall = totalSmallDeficits; // temporary – will be overridden in recovery case


  if (smallTeamImpact) {
    // Recovery case: transfer remaining totalSmallDeficits → badGamesDeficit
    if (finalBaseThisGame > 10100) {
      nextBadDeficit = totalSmallDeficits + 100;
      nextBase = finalBaseThisGame - 100;
    } else {
      const residue = finalBaseThisGame - 10000;
      nextBadDeficit = totalSmallDeficits + residue;
      nextBase = finalBaseThisGame - residue;
    }

    nextBadShadow = 0;
    setSmallTeamImpact(false);

    // Full reset – this is the recovery completion
    nextSpecialDeficits = {
      oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
      ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
    };

    // HERE: explicitly set to 0 (and we won't overwrite it later)
    nextTotalSmall = 0;
  }
  // No else-if anymore – normal small games already added on load

  // Apply changes
  setBaseStake(nextBase);
  setDeficit(0);
  setBadGamesDeficit(nextBadDeficit);
  setBadGameShadow(nextBadShadow);
  setSpecialDeficits(nextSpecialDeficits);
  
  // This now correctly becomes 0 when smallTeamImpact was true
  setTotalSmallDeficits(nextTotalSmall);

  setPendingSpecialStakes({
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  setFixture(null);
  setOrderedStakes([]);
  setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  setIsSmallTeamMatch(false);
  setInputA("");
  setInputB("");

  await saveAll();
};
  const teamA = sanitizeTeam(inputA) || "HOME";
  const teamB = sanitizeTeam(inputB) || "AWAY";

  return (
    <div>
      {/* Desktop Screen */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
              Virtual EPL Strategy
            </h1>

            <button
              onClick={fetchAll}
              className={`
                flex items-center gap-2 px-5 py-3 
                bg-gradient-to-r from-red-700 to-red-900 
                hover:from-red-600 hover:to-red-800 
                text-white font-semibold text-lg 
                rounded-2xl shadow-lg 
                transition-all duration-300 
                transform hover:scale-105 active:scale-95
                border border-red-500/30
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <FiRefreshCw className="w-5 h-5" />
              Reload Data
            </button>
          </div>
          <p className="text-red-400 mt-2">
            {fixture
              ? isSmallTeamMatch
                ? "SMALL TEAM MATCH — 6-0 + 10 SPECIALS"
                : "NORMAL MATCH"
              : "Ready"}
          </p>
        </div>

        <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

          {/* OUTCOME BUTTONS */}
          <div className="mb-8">
            {isSmallTeamMatch ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <button
                  onClick={handleJackpot}
                  disabled={!fixture}
                  className="py-6 rounded-2xl bg-yellow-400 text-black font-extrabold hover:bg-yellow-300 transition"
                >
                  6–0<br />({amounts.winnerAmount || "–"})
                </button>

                {specialKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => !smallTeamImpact ? handleSpecialWinA(key) : handleSpecialWinB(key)}
                    disabled={!fixture || pendingSpecialStakes[key] === 0}
                    className="py-6 rounded-2xl bg-blue-600 text-white font-extrabold hover:bg-blue-500 transition"
                  >
                    {specialLabels[key]}<br />({pendingSpecialStakes[key] || "–"})
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={handleJackpot}
                  disabled={!fixture}
                  className="py-6 rounded-2xl bg-yellow-400 text-black font-extrabold hover:bg-yellow-300 transition"
                >
                  6–0<br />({amounts.winnerAmount || "–"})
                </button>

                <button
                  onClick={() => handleMainResult("H")}
                  disabled={!fixture}
                  className="py-6 rounded-2xl bg-green-600 text-white font-extrabold hover:bg-green-500 transition"
                >
                  {teamA}<br />({amounts.homeAmount || "–"})
                </button>

                <button
                  onClick={() => handleMainResult("D")}
                  disabled={!fixture}
                  className="py-6 rounded-2xl bg-gray-500 text-white font-extrabold hover:bg-gray-400 transition"
                >
                  DRAW<br />({amounts.drawAmount || "–"})
                </button>

                <button
                  onClick={() => handleMainResult("A")}
                  disabled={!fixture}
                  className="py-6 rounded-2xl bg-red-600 text-white font-extrabold hover:bg-red-500 transition"
                >
                  {teamB}<br />({amounts.awayAmount || "–"})
                </button>
              </div>
            )}
          </div>

          {/* INPUTS + GO BUTTONS */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-8">
            <div className="flex items-center gap-4">
              <input
                value={inputA}
                onChange={(e) => setInputA(e.target.value)}
                placeholder="home"
                className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg"
              />
              <span className="font-black text-3xl text-red-500">VS</span>
              <input
                value={inputB}
                onChange={(e) => setInputB(e.target.value)}
                placeholder="away"
                className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleLoadGame}
                className="px-10 py-4 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xl rounded-2xl transition shadow-lg"
              >
                GO FOR INPUT
              </button>
              <button
                onClick={handleNextGame}
                className="px-10 py-4 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xl rounded-2xl transition shadow-lg"
              >
                GO TO NEXT GAME
              </button>
            </div>
          </div>

          {/* STATES DISPLAY */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
            <div>Main Deficit: <strong className="text-red-600">{deficit}</strong></div>
            <div>Bad Games: <strong className="text-yellow-600">{badGamesDeficit}</strong></div>
            <div>Bad Shadow: <strong className="text-orange-600">{badGameShadow}</strong></div>
            <div>Total Small Deficits: <strong className="text-purple-600">{totalSmallDeficits}</strong></div>
            <div>1X Def: <strong>{specialDeficits.oneX}</strong></div>
            <div>2X Def: <strong>{specialDeficits.twoX}</strong></div>
            <div>X2 Def: <strong>{specialDeficits.x2}</strong></div>
            <div>0 Goals Def: <strong>{specialDeficits.zeroGoals}</strong></div>
            <div>6 Goals Def: <strong>{specialDeficits.sixGoals}</strong></div>
            <div>HT 1-2 Def: <strong>{specialDeficits.ht12}</strong></div>
            <div>HT 2-1 Def: <strong>{specialDeficits.ht21}</strong></div>
            <div>HT 3-0 Def: <strong>{specialDeficits.ht30}</strong></div>
            <div>FT 4-0 Def: <strong>{specialDeficits.ft40}</strong></div>
            <div>FT 4-1 Def: <strong>{specialDeficits.ft41}</strong></div>
          </div>
        </div>
      </div>

      {/* Mobile Screen */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4 flex flex-col overflow-x-hidden">
  {/* Header */}
  <div className="text-center mb-3">
    <div className="flex items-center justify-center gap-3 flex-wrap">
      <h1 className="text-2xl font-extrabold text-red-500">Virtual EPL</h1>

      <button
        onClick={fetchAll}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-medium text-xs rounded-xl shadow transition active:scale-95 border border-red-500/30 disabled:opacity-50"
      >
        Reload Data
      </button>
    </div>

    <p className="text-red-400 text-xs mt-1">
      {fixture
        ? isSmallTeamMatch
          ? "SMALL — 6-0 + SPECIALS"
          : "NORMAL MATCH"
        : "Ready"}
    </p>
  </div>

  {/* Outcome Buttons */}
  <div className="mb-4 flex-grow min-h-0">
    {isSmallTeamMatch ? (
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={handleJackpot}
          disabled={!fixture}
          className="py-3 px-2 rounded-xl bg-yellow-500 text-black font-bold text-xs hover:bg-yellow-400 transition active:scale-95"
        >
          6–0<br />
          <span className="text-[10px]">({amounts.winnerAmount || "–"})</span>
        </button>

        {specialKeys.map((key) => (
          <button
            key={key}
            onClick={() => !smallTeamImpact ? handleSpecialWinA(key) : handleSpecialWinB(key)}
            disabled={!fixture || pendingSpecialStakes[key] === 0}
            className="py-3 px-2 rounded-xl bg-blue-700 text-white font-bold text-xs hover:bg-blue-600 transition active:scale-95"
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
          disabled={!fixture}
          className="py-4 px-3 rounded-xl bg-yellow-500 text-black font-bold text-sm hover:bg-yellow-400 transition active:scale-95"
        >
          6–0<br />
          <span className="text-xs">({amounts.winnerAmount || "–"})</span>
        </button>

        <button
          onClick={() => handleMainResult("H")}
          disabled={!fixture}
          className="py-4 px-3 rounded-xl bg-green-700 text-white font-bold text-sm hover:bg-green-600 transition active:scale-95"
        >
          {teamA}<br />
          <span className="text-xs">({amounts.homeAmount || "–"})</span>
        </button>

        <button
          onClick={() => handleMainResult("D")}
          disabled={!fixture}
          className="py-4 px-3 rounded-xl bg-gray-600 text-white font-bold text-sm hover:bg-gray-500 transition active:scale-95 col-span-2"
        >
          DRAW<br />
          <span className="text-xs">({amounts.drawAmount || "–"})</span>
        </button>

        <button
          onClick={() => handleMainResult("A")}
          disabled={!fixture}
          className="py-4 px-3 rounded-xl bg-red-700 text-white font-bold text-sm hover:bg-red-600 transition active:scale-95"
        >
          {teamB}<br />
          <span className="text-xs">({amounts.awayAmount || "–"})</span>
        </button>
      </div>
    )}
  </div>

  {/* Input + Action Buttons */}
  <div className="mb-4 space-y-3">
    <div className="flex items-center justify-center gap-2 max-w-full">
      <input
        value={inputA}
        onChange={(e) => setInputA(e.target.value)}
        placeholder="Home"
        className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400 overflow-hidden"
      />
      <span className="font-black text-lg text-red-500 shrink-0">VS</span>
      <input
        value={inputB}
        onChange={(e) => setInputB(e.target.value)}
        placeholder="Away"
        className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400 overflow-hidden"
      />
    </div>

    <div className="flex gap-2">
      <button
        onClick={handleLoadGame}
        className="flex-1 py-3 bg-red-700 hover:bg-red-600 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm"
      >
        LOAD
      </button>
      <button
        onClick={handleNextGame}
        className="flex-1 py-3 bg-green-700 hover:bg-green-600 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm"
      >
        NEXT
      </button>
    </div>
  </div>

  {/* Stats Display - scrollable if needed */}
  <div className="flex-grow min-h-0 overflow-auto bg-black/20 rounded-xl p-3 text-xs grid grid-cols-3 gap-2">
    <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
    <div>Def: <strong className="text-red-400">{deficit}</strong></div>
    <div>Bad: <strong className="text-yellow-400">{badGamesDeficit}</strong></div>

    <div>Shadow: <strong className="text-orange-400">{badGameShadow}</strong></div>
    <div>Total: <strong className="text-purple-400">{totalSmallDeficits}</strong></div>
    <div></div>

    <div className="col-span-3 grid grid-cols-5 gap-1 text-[10px] text-center">
      <div>1X: {specialDeficits.oneX}</div>
      <div>2X: {specialDeficits.twoX}</div>
      <div>X2: {specialDeficits.x2}</div>
      <div>0G: {specialDeficits.zeroGoals}</div>
      <div>6G: {specialDeficits.sixGoals}</div>
      <div>HT12: {specialDeficits.ht12}</div>
      <div>HT21: {specialDeficits.ht21}</div>
      <div>HT30: {specialDeficits.ht30}</div>
      <div>FT40: {specialDeficits.ft40}</div>
      <div>FT41: {specialDeficits.ft41}</div>
    </div>
  </div>
</div>
    </div>
  );
};

export default Homepage;