
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

  /* ---------------- BASE & DEFICIT ---------------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit, setDeficit] = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit, setOneDeficit] = useState(0);

  /* 🔒 REF HOLDS LATEST BASE (CRITICAL FIX) */
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

  /* ---------------- LOAD BASE (RELOAD BUTTON) ---------------- */
  const fetchBase = async () => {
    setIsReloading(true); // 🔄 start spin
    try {
      const res = await axios.get(API_BASE);
      if (typeof res.data?.base === "number") {
        setBaseStake(res.data.base);
      }
    } catch (err) {
      console.error("❌ Failed to fetch base:", err.message);
    }finally {
    setIsReloading(false); // 🛑 stop spin
  }
  };

  /* ---------------- SAVE BASE ---------------- */
  const saveBase = async (value) => {
    try {
      await axios.put(API_BASE, { base: value });
      console.log("✅ Autosaved base:", value);
    } catch (err) {
      console.error("❌ Autosave failed:", err.message);
    }
  };

  /* ---------------- AUTOSAVE EVERY 10 SECONDS ---------------- */
  useEffect(() => {
    const interval = setInterval(() => {
      saveBase(baseRef.current);
    }, 300000); // ⏱ 10 seconds (change to 600000 later)
    return () => clearInterval(interval);
  }, []);

  /* ---------------- SUBMIT (NEW GAME) ---------------- */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    const found = odds.find(
      (o) => o.home === home && o.away === away
    );

    if (!found) {
      alert(`No odds for ${home} vs ${away}`);
      return;
    }
    const sixZero = ()=>{
/* ✅ ABSORB DEFICIT HERE (ONLY ON SUBMIT) */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);

    /* -------- FIRST STAKE (6-0 / WINNER) -------- */
    let winnerAmount = Math.round(
      newBase / (found.winner)
    );
    winnerAmount = Math.max(winnerAmount, 10);
 console.log(winnerAmount)
    const oddsMap = {
      H: found.win,
      D: found.draw,
      A: found.lose,
    };

    let runningTotal = winnerAmount;
    const ladder = [];
    let homeAmount = 0;
    let drawAmount = 0;
    let awayAmount = 0;

    for (const step of found.code) {
      const odd = oddsMap[step];
      let stake = Math.round(runningTotal / (odd - 1));
      
      ladder.push({ step, stake, type: "6-0" }); // in sixZero
      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;
      runningTotal += stake;
      console.log(stake)
    }

    setFixture(found);
    setOrderedStakes((prev) => [...prev, ...ladder]);
    setAmounts({
      winnerAmount,
      homeAmount,
      drawAmount,
      awayAmount,
    });
    }

     const fiveZero = ()=>{
/* ✅ ABSORB DEFICIT HERE (ONLY ON SUBMIT) */
    const newBase = baseDeficit + zeroDeficit;
   

    /* -------- FIRST STAKE (5-0 / WINNER) -------- */
    let winnerAmount = Math.round(
      newBase / (found.fiveZero)
    );
    winnerAmount = Math.max(winnerAmount, 10);
    console.log(winnerAmount)

    const oddsMap = {
      H: found.win,
      D: found.draw,
      A: found.lose,
    };

    let runningTotal = winnerAmount;
    const ladder = [];
    let homeAmount = 0;
    let drawAmount = 0;
    let awayAmount = 0;

    for (const step of found.code) {
      const odd = oddsMap[step];
      let stake = Math.round(runningTotal / (odd - 1));
      
      ladder.push({ step, stake, type: "5-0" }); // in sixZero
      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;
      runningTotal += stake;
      console.log(stake)
    }

    setFixture(found);
    setOrderedStakes((prev) => [...prev, ...ladder]);
    setZeroAmounts({
      winnerAmount,
      homeAmount,
      drawAmount,
      awayAmount,
    });
    }
     const fiveOne = ()=>{
/* ✅ ABSORB DEFICIT HERE (ONLY ON SUBMIT) */
    const newBase = baseDeficit + oneDeficit;
   

    /* -------- FIRST STAKE (5-0 / WINNER) -------- */
    let winnerAmount = Math.round(
      newBase / (found.fiveOne)
    );
    winnerAmount = Math.max(winnerAmount, 10);
 console.log(winnerAmount)
    const oddsMap = {
      H: found.win,
      D: found.draw,
      A: found.lose,
    };

    let runningTotal = winnerAmount;
    const ladder = [];
    let homeAmount = 0;
    let drawAmount = 0;
    let awayAmount = 0;

    for (const step of found.code) {
      const odd = oddsMap[step];
      let stake = Math.round(runningTotal / (odd - 1));
      
      ladder.push({ step, stake, type: "5-1" }); // in sixZero
      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;
      runningTotal += stake;
      console.log(stake)
    }

    setFixture(found);
    setOrderedStakes((prev) => [...prev, ...ladder]);
    setOneAmounts({
      winnerAmount,
      homeAmount,
      drawAmount,
      awayAmount,
    });
    }
    sixZero();
    fiveZero();
    fiveOne();
  };

  // /* ---------------- RESOLVE RESULT ---------------- */
const resolveResult = (step) => {
  if (!fixture) return;

  const calculateLoss = (type) => {
    const stakes = orderedStakes.filter((s) => s.type === type);

    const index = stakes.findIndex((s) => s.step === step);
    if (index === -1) return 0;

    return stakes
      .slice(index + 1)
      .reduce((sum, s) => sum + s.stake, 0);
  };

  const mainLoss = calculateLoss("6-0");
  const fiveZeroLoss = calculateLoss("5-0");
  const fiveOneLoss = calculateLoss("5-1");

  setDeficit(mainLoss);
 setZeroDeficit((prev) => prev + fiveZeroLoss);
setOneDeficit((prev) => prev + fiveOneLoss);
setBaseDeficit((prev) => prev + mainLoss);

  clearForNext();
};

  /* ---------------- 6–0 WIN ---------------- */
  const handleJackpot = async () => {
    setBaseStake(10000);
    setDeficit(0);
  };
  const handleZeroJackpot = async () => {
    await setBaseStake(10000 + oneDeficit);
    setDeficit(0);
    setOneDeficit(0);
    setZeroDeficit(0);
  };
  const handleOneJackpot = async () => {
    await setBaseStake(10000 + oneDeficit);
    setDeficit(0);
    setZeroDeficit(0);
    setOneDeficit(0);
   
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

  const displayAmounts = {
  winnerAmount:
    amounts.winnerAmount +
    zeroAmounts.winnerAmount +
    oneAmounts.winnerAmount,

  homeAmount:
    amounts.homeAmount +
    zeroAmounts.homeAmount +
    oneAmounts.homeAmount,

  drawAmount:
    amounts.drawAmount +
    zeroAmounts.drawAmount +
    oneAmounts.drawAmount,

  awayAmount:
    amounts.awayAmount +
    zeroAmounts.awayAmount +
    oneAmounts.awayAmount,
};
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">

      {/* SAVE / RELOAD */}
      <div className="absolute top-5 right-5 flex rounded-full overflow-hidden shadow-xl">

  {/* SAVE */}
  <button
    onClick={() => saveBase(baseStake)}
    className="px-6 py-3 bg-green-600 font-bold text-white text-lg hover:bg-green-700 transition"
  >
    💾 Save
  </button>

  {/* RELOAD (SPINNING) */}
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

          <button
            onClick={handleJackpot}
            className="py-6 rounded-2xl bg-yellow-400 text-black"
          >
            <div className="text-4xl font-extrabold">6–0</div>
            <div>({amounts.winnerAmount})</div>
          </button>
          <button
            onClick={handleZeroJackpot}
            className="py-6 rounded-2xl bg-yellow-400 text-black"
          >
            <div className="text-4xl font-extrabold">5–0</div>
            <div>({zeroAmounts.winnerAmount})</div>
          </button>
          <button
            onClick={handleOneJackpot}
            className="py-6 rounded-2xl bg-yellow-400 text-black"
          >
            <div className="text-4xl font-extrabold">5–1</div>
            <div>({oneAmounts.winnerAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-green-600 text-white"
          >
            <div className="text-4xl font-extrabold">{teamA}</div>
            <div>({displayAmounts.homeAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-gray-500 text-white"
          >
            <div className="text-4xl font-extrabold">DRAW</div>
            <div>({displayAmounts.drawAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-red-600 text-white"
          >
            <div className="text-4xl font-extrabold">{teamB}</div>
            <div>({displayAmounts.awayAmount})</div>
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
          <div>
            Base Amount: <strong>{baseStake}</strong>
          </div>
          <div className="text-red-600 font-extrabold">
            Current Deficit: {deficit}
          </div>
          <div className="text-red-600 font-extrabold">
            5-0 Deficit: {zeroDeficit}
          </div>
          <div className="text-red-600 font-extrabold">
            5-1 Deficit: {oneDeficit}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;