
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

/* ---------------- API ---------------- */
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {
  /* ---------------- INPUTS ---------------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  /* ---------------- FIXTURE ---------------- */
  const [fixture, setFixture] = useState(null);
  const [baseDeficit, setBaseDeficit] = useState(0);

  /* ---------------- BASE & DEFICIT ---------------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [deficit, setDeficit] = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit, setOneDeficit] = useState(0);

  const baseRef = useRef(baseStake);

  /* ---------------- STAKES ---------------- */
  const [amounts, setAmounts] = useState({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });
  const [zeroAmounts, setZeroAmounts] = useState({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });
  const [oneAmounts, setOneAmounts] = useState({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });

  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------------- KEEP REF IN SYNC ---------------- */
  useEffect(() => {
    baseRef.current = baseStake;
  }, [baseStake]);

  useEffect(() => {
    const permanentDeficit = Math.max(0, baseStake - 10000);
    setBaseDeficit(permanentDeficit);
  }, [baseStake]);

  /* ---------------- FETCH & SAVE ---------------- */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (typeof res.data?.base === "number") {
        setBaseStake(res.data.base);
      }
    } catch (err) {
      console.error("❌ Failed to fetch base:", err.message);
    } finally {
      setIsReloading(false);
    }
  };

  const saveBase = async (value) => {
    try {
      await axios.put(API_BASE, { base: value });
      console.log("✅ Saved base:", value);
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => saveBase(baseRef.current), 300000);
    return () => clearInterval(interval);
  }, []);

  /* ---------------- INDIVIDUAL HANDLERS ---------------- */
  const handleSixZero = () => {
    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) return;

    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);

    let winnerAmount = Math.round(newBase / found.winner) || 10;
    winnerAmount = Math.max(winnerAmount, 10);

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };

    let runningTotal = winnerAmount;
    const ladder = [];
    let homeAmount = 0, drawAmount = 0, awayAmount = 0;

    for (const step of found.code || []) {
      const odd = oddsMap[step];
      if (!odd || odd <= 1) continue;

      let stake = Math.round(runningTotal / (odd - 1));
      stake = Math.max(stake, 10);

      ladder.push({ step, stake, type: "6-0" });

      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;

      runningTotal += stake;
    }

    setFixture(found);
    setOrderedStakes((prev) => [...prev, ...ladder]);

    setAmounts({
      winnerAmount,
      homeAmount,
      drawAmount,
      awayAmount,
    });
  };

  const handleFiveZero = () => {
    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) return;

    const newBase = baseDeficit + zeroDeficit;

    let winnerAmount = Math.round(newBase / found.fiveZero) || 10;
    winnerAmount = Math.max(winnerAmount, 10);
    const oddsMap = { H: found.win, D: found.draw, A: found.lose };

    let runningTotal = winnerAmount;
    const ladder = [];
    let homeAmount = 0, drawAmount = 0, awayAmount = 0;

    for (const step of found.code || []) {
      const odd = oddsMap[step];
      if (!odd || odd <= 1) continue;

      let stake = Math.round(runningTotal / (odd - 1));
      ladder.push({ step, stake, type: "5-0" });

      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;

      runningTotal += stake;
    }

    setOrderedStakes((prev) => [...prev, ...ladder]);

    setZeroAmounts({
      winnerAmount,
      homeAmount,
      drawAmount,
      awayAmount,
    });
  };

  const handleFiveOne = () => {
    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) return;

    const newBase = baseDeficit + oneDeficit;

    let winnerAmount = Math.round(newBase / found.fiveOne) || 10;
    winnerAmount = Math.max(winnerAmount, 10);

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };

    let runningTotal = winnerAmount;
    const ladder = [];
    let homeAmount = 0, drawAmount = 0, awayAmount = 0;

    for (const step of found.code || []) {
      const odd = oddsMap[step];
      if (!odd || odd <= 1) continue;

      let stake = Math.round(runningTotal / (odd - 1));

      ladder.push({ step, stake, type: "5-1" });

      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;

      runningTotal += stake;
    }

    setOrderedStakes((prev) => [...prev, ...ladder]);

    setOneAmounts({
      winnerAmount,
      homeAmount,
      drawAmount,
      awayAmount,
    });
  };

  /* ---------------- MAIN SUBMIT ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    await handleSixZero();
    handleFiveZero();
    handleFiveOne();
  };

  /* ---------------- RESOLVE RESULT - SPLITS CORRECTLY ---------------- */
//   const resolveResult = (step) => {
//     if (!fixture) return;

//     const index = orderedStakes.findIndex((s) => s.step === step);
//     if (index === -1) return;

//     const remaining = orderedStakes.slice(index + 1);

//     let mainLoss = 0;
//     let fiveZeroLoss = 0;
//     let fiveOneLoss = 0;

//     remaining.forEach((s) => {
//       if (s.type === "6-0") mainLoss += s.stake;
//       else if (s.type === "5-0") fiveZeroLoss += s.stake;
//       else if (s.type === "5-1") fiveOneLoss += s.stake;
//     });

//     setDeficit((prev) => prev + mainLoss);
//     setZeroDeficit((prev) => prev + fiveZeroLoss);
//     setOneDeficit((prev) => prev + fiveOneLoss);

//     clearForNext();
//   };
/* ---------------- RESOLVE RESULT - SPLITS CORRECTLY ---------------- */
const resolveResult = (step) => {
  if (!fixture) return;

  const index = orderedStakes.findIndex((s) => s.step === step);
  if (index === -1) return;

  const remaining = orderedStakes.slice(index + 1);

  let mainLoss = 0;
  let fiveZeroLoss = 0;
  let fiveOneLoss = 0;

  remaining.forEach((s) => {
    if (s.type === "6-0") mainLoss += s.stake;
    else if (s.type === "5-0") fiveZeroLoss += s.stake;
    else if (s.type === "5-1") fiveOneLoss += s.stake;
  });

  setDeficit((prev) => prev + mainLoss);
  setZeroDeficit((prev) => prev + fiveZeroLoss);
  setOneDeficit((prev) => prev + fiveOneLoss);

  clearForNext();
};
  /* ---------------- 6–0 WIN ---------------- */
  const handleJackpot = async () => {
    setBaseStake(10000);
    setDeficit(0);
    clearForNext();
    await saveBase(10000);
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
    setZeroAmounts({
      winnerAmount: 0,
      homeAmount: 0,
      drawAmount: 0,
      awayAmount: 0,
    });
    setOneAmounts({
      winnerAmount: 0,
      homeAmount: 0,
      drawAmount: 0,
      awayAmount: 0,
    });
  };

  const teamA = sanitizeTeam(inputA) || "che";
  const teamB = sanitizeTeam(inputB) || "che";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">

      {/* SAVE / RELOAD */}
      <div className="absolute top-5 right-5 flex rounded-full overflow-hidden shadow-xl">
        <button
          onClick={() => saveBase(baseStake)}
          className="px-6 py-3 bg-green-600 font-bold text-white text-lg hover:bg-green-700 transition"
        >
          💾 Save
        </button>
        <button
          onClick={fetchBase}
          disabled={isReloading}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 font-bold text-white text-lg hover:bg-red-700 transition disabled:opacity-50"
        >
          <FiRefreshCw className={`transition ${isReloading ? "animate-spin" : ""}`} />
          {isReloading ? "Reloading..." : "Reload"}
        </button>
      </div>

      {/* HEADER */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-red-500">
          Virtual EPL Strategy
        </h1>
      </div>

      {/* CARD */}
      <div className="max-w-3xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

        {/* RESULT BUTTONS */}
        {/* <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">

          <button
            onClick={handleJackpot}
            className="py-6 rounded-2xl bg-yellow-400 text-black font-extrabold"
          >
            <div className="text-4xl font-extrabold">6–0</div>
            <div>({amounts.winnerAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-yellow-300 text-black font-extrabold"
          >
            <div className="text-4xl font-extrabold">5–0</div>
            <div>({zeroAmounts.winnerAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-yellow-300 text-black font-extrabold"
          >
            <div className="text-4xl font-extrabold">5–1</div>
            <div>({oneAmounts.winnerAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-green-600 text-white font-extrabold"
          >
            <div className="text-4xl font-extrabold">{teamA}</div>
            <div>({amounts.homeAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-gray-500 text-white font-extrabold"
          >
            <div className="text-4xl font-extrabold">DRAW</div>
            <div>({amounts.drawAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-red-600 text-white font-extrabold"
          >
            <div className="text-4xl font-extrabold">{teamB}</div>
            <div>({amounts.awayAmount})</div>
          </button>

        </div> */}
        {/* RESULT BUTTONS */}
<div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">

  {/* 6-0 */}
  <button
    onClick={handleJackpot}
    className="py-6 rounded-2xl bg-yellow-400 text-black font-extrabold"
  >
    <div className="text-4xl font-extrabold">6–0</div>
    <div>({amounts.winnerAmount})</div>
  </button>

  {/* 5-0 Button */}
  <button
    onClick={() => resolveResult("H")}
    disabled={!fixture}
    className="py-6 rounded-2xl bg-yellow-300 text-black font-extrabold"
  >
    <div className="text-4xl font-extrabold">5–0</div>
    <div>({zeroAmounts.winnerAmount})</div>
  </button>

  {/* 5-1 Button */}
  <button
    onClick={() => resolveResult("H")}
    disabled={!fixture}
    className="py-6 rounded-2xl bg-yellow-300 text-black font-extrabold"
  >
    <div className="text-4xl font-extrabold">5–1</div>
    <div>({oneAmounts.winnerAmount})</div>
  </button>

  {/* Home - Merged Total */}
  <button
    onClick={() => resolveResult("H")}
    disabled={!fixture}
    className="py-6 rounded-2xl bg-green-600 text-white font-extrabold"
  >
    <div className="text-4xl font-extrabold">{teamA}</div>
    <div>({amounts.homeAmount + zeroAmounts.homeAmount + oneAmounts.homeAmount})</div>
  </button>

  {/* Draw - Merged Total */}
  <button
    onClick={() => resolveResult("D")}
    disabled={!fixture}
    className="py-6 rounded-2xl bg-gray-500 text-white font-extrabold"
  >
    <div className="text-4xl font-extrabold">DRAW</div>
    <div>({amounts.drawAmount + zeroAmounts.drawAmount + oneAmounts.drawAmount})</div>
  </button>

  {/* Away - Merged Total */}
  <button
    onClick={() => resolveResult("A")}
    disabled={!fixture}
    className="py-6 rounded-2xl bg-red-600 text-white font-extrabold"
  >
    <div className="text-4xl font-extrabold">{teamB}</div>
    <div>({amounts.awayAmount + zeroAmounts.awayAmount + oneAmounts.awayAmount})</div>
  </button>

</div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="text-center space-y-4">
          <div className="flex justify-center gap-4">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="che"
              className="w-28 px-4 py-2 border-2 rounded-xl text-center"
            />
            <span className="font-extrabold">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="che"
              className="w-28 px-4 py-2 border-2 rounded-xl text-center"
            />
          </div>
          <button
            type="submit"
            className="px-8 py-3 bg-red-600 text-white font-extrabold rounded-full"
          >
            Calculate Stakes
          </button>
        </form>

        {/* BASE & DEFICIT */}
        <div className="mt-6 text-center font-mono">
          <div>Base Amount: <strong>{baseStake}</strong></div>
          <div className="text-red-600 font-extrabold">Current Deficit: {deficit}</div>
          <div className="text-orange-600">5-0 Deficit: {zeroDeficit}</div>
          <div className="text-orange-600">5-1 Deficit: {oneDeficit}</div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;