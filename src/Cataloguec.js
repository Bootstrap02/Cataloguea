import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

/* ---------------- API ---------------- */
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {
  /* ---------------- INPUTS ---------------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  /* ---------------- FIXTURE ---------------- */
  const [fixture, setFixture] = useState(null);

  /* ---------------- BASE ---------------- */
  const [baseStake, setBaseStake] = useState(10000);

  /* 🔒 REF HOLDS LATEST BASE (CRITICAL FIX) */
  const baseRef = useRef(baseStake);

  /* ---------------- DEFICITS ---------------- */
  const [deficitH, setDeficitH] = useState(0);
  const [deficitD, setDeficitD] = useState(0);
  const [deficitA, setDeficitA] = useState(0);

  /* ---------------- STAKES ---------------- */
  const [amounts, setAmounts] = useState({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });

  /* ---------------- KEEP REF IN SYNC ---------------- */
  useEffect(() => {
    baseRef.current = baseStake;
  }, [baseStake]);

  /* ---------------- LOAD DEFICITS ---------------- */
  useEffect(() => {
    const saved = localStorage.getItem("bet_deficits");
    if (saved) {
      const { H, D, A } = JSON.parse(saved);
      setDeficitH(H || 0);
      setDeficitD(D || 0);
      setDeficitA(A || 0);
    }
  }, []);

  /* ---------------- SAVE DEFICITS ---------------- */
  const saveDeficits = () => {
    localStorage.setItem(
      "bet_deficits",
      JSON.stringify({ H: deficitH, D: deficitD, A: deficitA })
    );
  };

  /* ---------------- LOAD BASE (RELOAD BUTTON) ---------------- */
  const fetchBase = async () => {
    try {
      const res = await axios.get(API_BASE);
      if (typeof res.data?.base === "number") {
        setBaseStake(res.data.base);
      }
    } catch (err) {
      console.error("❌ Failed to fetch base:", err.message);
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

  /* ---------------- AUTOSAVE EVERY 5 MINUTES ---------------- */
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     saveBase(baseRef.current);
  //     saveDeficits();
  //   }, 300000);
  //   return () => clearInterval(interval);
  // }, []);

  /* ---------------- HANDLE SAVE ---------------- */
  const handleSave = async () => {
    await saveBase(baseStake);
    saveDeficits();
  };

  /* ---------------- HANDLE RELOAD ---------------- */
  const handleReload = async () => {
    await fetchBase();
    const saved = localStorage.getItem("bet_deficits");
    if (saved) {
      const { H, D, A } = JSON.parse(saved);
      setDeficitH(H || 0);
      setDeficitD(D || 0);
      setDeficitA(A || 0);
    }
  };

  /* ---------------- SUBMIT (NEW GAME) ---------------- */
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

    /* -------- FIRST STAKE (6-0 / WINNER) -------- */
    let winnerAmount = Math.round(
      baseStake / (found.winner - 1)
    );
    winnerAmount = Math.max(winnerAmount, 10);

    const oddItems = [
      { key: "H", odd: found.win, deficit: deficitH, setDeficit: setDeficitH },
      { key: "D", odd: found.draw, deficit: deficitD, setDeficit: setDeficitD },
      { key: "A", odd: found.lose, deficit: deficitA, setDeficit: setDeficitA },
    ];

    oddItems.sort((a, b) => b.odd - a.odd); // Largest odd first

    const percentages = [0.45, 0.35, 0.20];
    const newAmounts = { winnerAmount };

    for (let i = 0; i < 3; i++) {
      const item = oddItems[i];
      const target = Math.round(winnerAmount * percentages[i]);
      const newDef = item.deficit + target;
      item.setDeficit(newDef);

      let stake = Math.round(
        newDef / (item.odd - 1)
      );
      stake = Math.max(stake, 10);

      if (item.key === "H") newAmounts.homeAmount = stake;
      if (item.key === "D") newAmounts.drawAmount = stake;
      if (item.key === "A") newAmounts.awayAmount = stake;
    }

    setAmounts(newAmounts);
    setFixture(found);
  };

  /* ---------------- RESOLVE RESULT ---------------- */
  const resolveResult = (step) => {
    if (!fixture) return;

    const keyToSetDef = {
      H: setDeficitH,
      D: setDeficitD,
      A: setDeficitA,
    };
    const keyToAmount = {
      H: amounts.homeAmount,
      D: amounts.drawAmount,
      A: amounts.awayAmount,
    };

    // Winner resets deficit
    keyToSetDef[step](0);

    // Losers add their stake
    const allKeys = ["H", "D", "A"];
    const losers = allKeys.filter((k) => k !== step);
    losers.forEach((k) => {
      const added = keyToAmount[k];
      keyToSetDef[k]((prev) => prev + added);
    });

    clearForNext();
  };

  /* ---------------- 6–0 WIN ---------------- */
  const handleJackpot = async () => {
    setDeficitH(0);
    setDeficitD(0);
    setDeficitA(0);
    saveDeficits();
    setBaseStake(10000);
    clearForNext();
    await saveBase(10000);
  };

  /* ---------------- CLEAR ---------------- */
  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setAmounts({
      winnerAmount: 0,
      homeAmount: 0,
      drawAmount: 0,
      awayAmount: 0,
    });
  };

  const teamA = sanitizeTeam(inputA) || "liv";
  const teamB = sanitizeTeam(inputB) || "liv";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
      {/* SAVE / RELOAD */}
      <div className="absolute top-5 right-5 flex rounded-full overflow-hidden shadow-xl">
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-green-600 font-bold"
        >
          💾 Save
        </button>
        <button
          onClick={handleReload}
          className="px-5 py-2 bg-red-600 font-bold"
        >
          🔄 Reload
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
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-green-600 text-white"
          >
            <div className="text-4xl font-extrabold">{teamA}</div>
            <div>({amounts.homeAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-gray-500 text-white"
          >
            <div className="text-4xl font-extrabold">DRAW</div>
            <div>({amounts.drawAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-red-600 text-white"
          >
            <div className="text-4xl font-extrabold">{teamB}</div>
            <div>({amounts.awayAmount})</div>
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="text-center space-y-4">
          <div className="flex justify-center gap-4">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="liv"
              className="w-28 px-4 py-2 border-2 rounded-xl text-center"
            />
            <span className="font-extrabold">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="liv"
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

        {/* BASE & DEFICITS */}
        <div className="mt-6 text-center font-mono">
          <div>
            Base Amount: <strong>{baseStake}</strong>
          </div>
          <div className="text-red-600 font-extrabold">
            Deficit Home ({teamA}): {deficitH}
          </div>
          <div className="text-red-600 font-extrabold">
            Deficit Draw: {deficitD}
          </div>
          <div className="text-red-600 font-extrabold">
            Deficit Away ({teamB}): {deficitA}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;