import React, { useState, useEffect } from "react";
import { odds } from "./Scores";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z]/g, ""); // remove spaces & symbols

const Homepage = () => {
  /* ---------------- INPUTS ---------------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  /* ---------------- FIXTURE ---------------- */
  const [fixture, setFixture] = useState(null);

  /* ---------------- STAKES ---------------- */
  const [amounts, setAmounts] = useState({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });

  /* ---------------- ORDERED LADDER ---------------- */
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------------- DEFICIT ---------------- */
  const [deficit, setDeficit] = useState(0);

  /* ---------------- LOAD SESSION ---------------- */
  useEffect(() => {
    const saved = localStorage.getItem("virtual-epl-session");
    if (saved) {
      const { deficit } = JSON.parse(saved);
      setDeficit(deficit || 0);
    }
  }, []);

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    const found = odds.find(
      (o) => o.home === home && o.away === away
    );

    if (!found) {
      alert(`No odds for ${home} vs ${away}`);
      return;
    }

    const base = Math.round(10000 / (found.winner - 1));
    const winnerAmount = Math.round(base + deficit);

    const oddsMap = {
      H: found.win,
      D: found.draw,
      A: found.lose,
    };

    let runningTotal = winnerAmount;

    let homeAmount = 0;
    let drawAmount = 0;
    let awayAmount = 0;

    const ladder = [];

    for (const step of found.code) {
      const odd = oddsMap[step];
      const stake = Math.round(runningTotal / (odd - 1));

      ladder.push({ step, stake });

      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;

      runningTotal += stake;
    }

    setFixture(found);
    setOrderedStakes(ladder);
    setAmounts({
      winnerAmount,
      homeAmount,
      drawAmount,
      awayAmount,
    });
  };

  /* ---------------- RESOLVE RESULT ---------------- */
  const resolveResult = (step) => {
    if (!fixture) return;

    const index = orderedStakes.findIndex(
      (s) => s.step === step
    );

    const newDeficit = orderedStakes
      .slice(index + 1)
      .reduce((sum, s) => sum + s.stake, 0);

    setDeficit(newDeficit);
    clearForNext();
  };

  /* ---------------- CLEAR ---------------- */
  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
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
      JSON.stringify({ deficit })
    );
    alert("Session saved");
  };

  const teamA = sanitizeTeam(inputA) || "liv";
  const teamB = sanitizeTeam(inputB) || "liv";

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
          Deficit-driven martingale balance
        </p>
      </div>

      {/* CARD */}
      <div className="max-w-3xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

        {/* BET BUTTONS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">

          <div className="py-6 rounded-2xl bg-yellow-400 text-black text-center shadow-xl">
            <div className="text-3xl font-extrabold">6–0</div>
            <div className="font-bold">
              ({amounts.winnerAmount})
            </div>
          </div>

          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-green-600 text-white text-center shadow-xl disabled:opacity-40"
          >
            <div className="text-3xl font-extrabold">{teamA}</div>
            <div className="font-bold">
              ({amounts.homeAmount})
            </div>
          </button>

          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-gray-500 text-white text-center shadow-xl disabled:opacity-40"
          >
            <div className="text-3xl font-extrabold">draw</div>
            <div className="font-bold">
              ({amounts.drawAmount})
            </div>
          </button>

          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-red-600 text-white text-center shadow-xl disabled:opacity-40"
          >
            <div className="text-3xl font-extrabold">{teamB}</div>
            <div className="font-bold">
              ({amounts.awayAmount})
            </div>
          </button>

        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center gap-4 items-center">
            <input
              value={inputA}
              onChange={(e) => setInputA(sanitizeTeam(e.target.value))}
              placeholder="liv"
              className="w-28 px-4 py-2 border-2 border-red-400 rounded-xl text-center font-bold"
            />

            <span className="font-extrabold text-red-700">VS</span>

            <input
              value={inputB}
              onChange={(e) => setInputB(sanitizeTeam(e.target.value))}
              placeholder="liv"
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

        {/* DEFICIT */}
        <div className="mt-6 text-center text-sm font-mono text-gray-600">
          Homepage Deficit: {deficit}
        </div>
      </div>
    </div>
  );
};

export default Homepage;
