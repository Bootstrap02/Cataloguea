
import React, { useState, useEffect } from "react";
import { odds, smallOdds } from "./Scores";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) =>
  value.toLowerCase().replace(/[^a-z]/g, "");

const Homepage = () => {
  /* ---------------- INPUTS ---------------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  /* ---------------- FIXTURE ---------------- */
  const [fixture, setFixture] = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ---------------- STAKES ---------------- */
  const [amounts, setAmounts] = useState({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });

  /* ---------------- ORDERED LADDER ---------------- */
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------------- DEFICIT & BANK ---------------- */
  const [deficit, setDeficit] = useState(0);
  const [bank,    setBank]    = useState(0);
  const [baseStake,    setBaseStake]    = useState(10000);
  /* ---------------- LOAD SESSION ---------------- */
  useEffect(() => {
    const saved = localStorage.getItem("virtual-epl-session");
    if (saved) {
      const data = JSON.parse(saved);
      setDeficit(data.deficit || 0);
      setBank(data.bank || 0);
    }
  }, []);

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";
    
    /* Check smallOdds first */
    let found = smallOdds.find((o) => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!found) found = odds.find((o) => o.home === home && o.away === away);

    if (!found) {
      alert(`No odds for ${home} vs ${away}`);
      return;
    }

    setFixture(found);
    setIsSmallOddsGame(isSmall);
    const mainStake = baseStake + deficit 
    const base = Math.round(mainStake / found.winner);
    const winnerAmount = Math.max(Math.round(base), 10);

    if (isSmall) {
      /* Small odds: only 6-0 winner stake plays, no HDA ladder.
         Stake goes into bank. */
      setBank((prev) => prev + winnerAmount);
      setOrderedStakes([]);
      setAmounts({
        winnerAmount,
        homeAmount: 0,
        drawAmount: 0,
        awayAmount: 0,
      });
      return;
    }

    /* Normal game: full HDA ladder */
    const oddsMap = {
      H: found.win,
      D: found.draw,
      A: found.lose,
    };

    let runningTotal = winnerAmount;
    let homeAmount = 0, drawAmount = 0, awayAmount = 0;
    const ladder = [];

    for (const step of found.code) {
      const odd = oddsMap[step];
      const stake = Math.max(Math.round(runningTotal / (odd - 1)), 10);
      ladder.push({ step, stake });
      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;
      runningTotal += stake;
    }

    setOrderedStakes(ladder);
    setAmounts({ winnerAmount, homeAmount, drawAmount, awayAmount });
  };

  /* ---------------- RESOLVE RESULT (normal games only) ---------------- */
  const resolveResult = (step) => {
    if (!fixture || isSmallOddsGame) return;

    const index = orderedStakes.findIndex((s) => s.step === step);
    const newDeficit = orderedStakes
      .slice(index + 1)
      .reduce((sum, s) => sum + s.stake, 0);

    setBaseStake((prev) => prev + newDeficit);
    clearForNext();
  };

  /* ---------------- SMALL ODDS WIN (6-0 clicked in small game) ---------------- */
  const handleSmallWin = () => {
    if (!fixture) return;
    /* Win → bank += 10000 */
    setBaseStake(bank);
    setBank(0);
    clearForNext();
  };

  /* ---------------- CLEAR ---------------- */
  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setAmounts({
      winnerAmount: 0,
      homeAmount: 0,
      drawAmount: 0,
      awayAmount: 0,
    });
  };

  /* ---------------- SAVE ---------------- */
  const handleSave = () => {
    localStorage.setItem(
      "virtual-epl-session",
      JSON.stringify({ deficit, bank })
    );
    alert("Session saved");
  };

  const teamA = sanitizeTeam(inputA) || "che";
  const teamB = sanitizeTeam(inputB) || "che";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">

      {/* SAVE / RELOAD */}
      <div className="absolute top-5 right-5 flex rounded-full overflow-hidden shadow-xl">
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-green-600 font-bold hover:bg-green-700"
        >
          💾 Save
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2 bg-red-600 font-bold hover:bg-red-700"
        >
          🔄 Reload
        </button>
      </div>

      {/* HEADER */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-red-500">
          Virtual EPL Strategy
        </h1>
        <p className="text-gray-300">
          {fixture
            ? isSmallOddsGame
              ? "SMALL ODDS — winner only"
              : "Deficit-driven martingale balance"
            : "Deficit-driven martingale balance"}
        </p>
      </div>

      {/* CARD */}
      <div className="max-w-3xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

        {/* BET BUTTONS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">

          {/* 6-0 — clickable in small odds games to register a win */}
          <button
            onClick={handleSmallWin}
            className={`py-6 rounded-2xl text-center shadow-xl transition ${
              isSmallOddsGame && fixture
                ? "bg-yellow-400 text-black hover:bg-yellow-300 cursor-pointer"
                : "bg-yellow-400 text-black cursor-default"
            }`}
          >
            <div className="text-3xl font-extrabold">6–0</div>
            <div className="font-bold">({amounts.winnerAmount})</div>
            {isSmallOddsGame && fixture && (
              <div className="text-xs mt-1 opacity-70">tap if wins</div>
            )}
          </button>

          {/* HOME */}
          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture || isSmallOddsGame}
            className="py-6 rounded-2xl bg-green-600 text-white text-center shadow-xl disabled:opacity-40"
          >
            <div className="text-3xl font-extrabold">{teamA}</div>
            <div className="font-bold">({amounts.homeAmount})</div>
          </button>

          {/* DRAW */}
          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture || isSmallOddsGame}
            className="py-6 rounded-2xl bg-gray-500 text-white text-center shadow-xl disabled:opacity-40"
          >
            <div className="text-3xl font-extrabold">draw</div>
            <div className="font-bold">({amounts.drawAmount})</div>
          </button>

          {/* AWAY */}
          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture || isSmallOddsGame}
            className="py-6 rounded-2xl bg-red-600 text-white text-center shadow-xl disabled:opacity-40"
          >
            <div className="text-3xl font-extrabold">{teamB}</div>
            <div className="font-bold">({amounts.awayAmount})</div>
          </button>

        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center gap-4 items-center">
            <input
              value={inputA}
              onChange={(e) => setInputA(sanitizeTeam(e.target.value))}
              placeholder="che"
              className="w-28 px-4 py-2 border-2 border-red-400 rounded-xl text-center font-bold"
            />
            <span className="font-extrabold text-red-700">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(sanitizeTeam(e.target.value))}
              placeholder="che"
              className="w-28 px-4 py-2 border-2 border-red-400 rounded-xl text-center font-bold"
            />
          </div>
          <div className="text-center">
            <button
              type="submit"
              className="mt-4 px-8 py-3 bg-red-600 text-white font-extrabold rounded-full shadow-lg hover:bg-red-700"
            >
              Calculate Stakes
            </button>
          </div>
        </form>
            <button
              onClick={clearForNext} 
              className="mt-4 px-8 py-3 bg-green-600 text-white font-extrabold rounded-full shadow-lg hover:bg-red-700"
            >
              Next
            </button>
        {/* STATS */}
        <div className="mt-6 grid grid-cols-2 gap-4 text-center text-sm font-mono text-gray-600">
          <div>Base: <strong className="text-red-600">{baseStake}</strong></div>
          <div>Bank: <strong className="text-green-600">{bank}</strong></div>
        </div>

      </div>
    </div>
  );
};

export default Homepage;
