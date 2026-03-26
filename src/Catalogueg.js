import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from 'react-icons/fi';

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

/* ---------------- API ---------------- */
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  const [fixture, setFixture] = useState(null);

  const [baseStake, setBaseStake] = useState(10000);
  const baseRef = useRef(10000);

  const [badDeficit, setBadDeficit] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);

  const [pendingStakes, setPendingStakes] = useState({
    winner: 0,
    fiveGoals: 0,
    sixGoals: 0,
    zeroGoal: 0,
    oneGoal: 0,
    twoGoals: 0,
    fourGoals: 0,
    threeGoals: 0,
  });

  const [pressedWins, setPressedWins] = useState(new Set());

  const allKeys = ["winner", "fiveGoals", "sixGoals", "zeroGoal", "oneGoal", "twoGoals", "fourGoals", "threeGoals"];

  const labels = {
    winner: "6–0",
    fiveGoals: "5 GOALS",
    sixGoals: "6 GOALS",
    zeroGoal: "0 GOALS",
    oneGoal: "1 GOAL",
    twoGoals: "2 GOALS",
    fourGoals: "4 GOALS",
    threeGoals: "3 GOALS",
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
      setBadDeficit(data.badDeficit ?? 0);
      setSmallDeficit(data.smallDeficit ?? 0);
      setPressedWins(new Set());
    } catch (err) {
      console.error("❌ Load failed:", err.message);
    }
  };

  const saveAll = async () => {
    try {
      const payload = {
        base: Math.max(10000, baseRef.current),
        badDeficit,
        smallDeficit,
      };
      await axios.put(API_BASE, payload);
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  /* ---------------- RELOAD ---------------- */
  const handleReload = () => {
    fetchAll();
  };

  /* ---------------- LOAD GAME ---------------- */
  const handleLoadGame = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) {
      alert(`No odds for ${home} vs ${away}`);
      return;
    }

    setFixture(found);
    setPressedWins(new Set());

    // Winner → badDeficit
    let winnerStake = Math.round(baseStake / found.winner);
    winnerStake = Math.max(winnerStake, 10);

    let currentBad = badDeficit + winnerStake;
    setBadDeficit(currentBad);

    const newPending = { winner: winnerStake };

    // Big Martingale: 5Goals → 6Goals → zeroGoal
    let target = currentBad;

    let s5 = Math.round(target / (found.fiveGoals - 1));
    s5 = Math.max(s5, 10);
    newPending.fiveGoals = s5;
    target += s5;

    let s6 = Math.round(target / (found.sixGoals - 1));
    s6 = Math.max(s6, 10);
    newPending.sixGoals = s6;
    target += s6;

    let s0 = Math.round(target / (found.zeroGoal - 1));
    s0 = Math.max(s0, 10);
    newPending.zeroGoal = s0;

    // Small Martingale: 1Goal → 2Goals → 4Goals → 3Goals (3Goals last)
    const bigStakesTotal = s5 + s6 + s0;
    let smallTarget = smallDeficit + bigStakesTotal;

    let s1 = Math.round(smallTarget / (found.oneGoal - 1)) || 25;
    s1 = Math.max(s1, 10);
    newPending.oneGoal = s1;
    smallTarget += s1;

    let s2 = Math.round(smallTarget / (found.twoGoals - 1)) || 25;
    s2 = Math.max(s2, 10);
    newPending.twoGoals = s2;
    smallTarget += s2;

    let s4 = Math.round(smallTarget / (found.fourGoals - 1)) || 25;
    s4 = Math.max(s4, 10);
    newPending.fourGoals = s4;
    smallTarget += s4;

    let s3 = Math.round(smallTarget / (found.threeGoals - 1)) || 25;
    s3 = Math.max(s3, 10);
    newPending.threeGoals = s3;

    setPendingStakes(newPending);

    // Small gets filled with big stakes total
    setSmallDeficit((prev) => prev + bigStakesTotal);

    // Save only on next game as requested - not here
  };

  /* ---------------- WIN HANDLER - Fixed as per your request ---------------- */
  const handleWin = (type) => {
    if (!fixture) return;

    const stake = pendingStakes[type];
    if (stake <= 0) return;

    setPressedWins((prev) => new Set([...prev, type]));

    if (type === "winner") {
      console.log("Jackpot!!");
      return;
    }

    // const odd = fixture[type] || 2;
    // const winAmount = Math.round(stake * (odd - 1));

    // Big Martingale Wins
    if (type === "fiveGoals") {
      setBadDeficit(pendingStakes.sixGoals + pendingStakes.zeroGoal);
    } else if (type === "sixGoals") {
      setBadDeficit(pendingStakes.zeroGoal);
    } else if (type === "zeroGoal") {
      setBadDeficit(0);
    } 
    // Small Martingale Wins
    else if (type === "oneGoal") {
      setSmallDeficit(pendingStakes.twoGoals + pendingStakes.fourGoals + pendingStakes.threeGoals);
    } else if (type === "twoGoals") {
      setSmallDeficit(pendingStakes.fourGoals + pendingStakes.threeGoals);
    } else if (type === "fourGoals") {
      setSmallDeficit(pendingStakes.threeGoals);
    } else if (type === "threeGoals") {
      setSmallDeficit(0);
    }

    // Note: saveAll is only in handleNextGame as you requested
  };

  /* ---------------- NEXT GAME ---------------- */
  const handleNextGame = async () => {
    if (!fixture) return;


    setPendingStakes({
      winner: 0,
      fiveGoals: 0,
      sixGoals: 0,
      zeroGoal: 0,
      oneGoal: 0,
      twoGoals: 0,
      fourGoals: 0,
      threeGoals: 0,
    });

    setFixture(null);
    setInputA("");
    setInputB("");
    setPressedWins(new Set());

    await saveAll();   // Only save here
  };

  const isButtonPressed = (key) => pressedWins.has(key);
  const isGameLoaded = !!fixture;

  return (
    <div>
      {/* Desktop - More compact */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-extrabold text-red-500 tracking-tight">
              Martingale Round
            </h1>
            <button
              onClick={handleReload}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition"
            >
              <FiRefreshCw /> Reload
            </button>
          </div>

          <div className="bg-white text-gray-900 rounded-3xl shadow-2xl p-6">

            <div className="flex justify-center gap-4 mb-8">
              <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="home"
                className="w-36 px-5 py-3 border-2 border-red-600 rounded-2xl text-center text-lg" />
              <span className="font-black text-3xl text-red-500 self-center">VS</span>
              <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="away"
                className="w-36 px-5 py-3 border-2 border-red-600 rounded-2xl text-center text-lg" />
            </div>

            <div className="flex justify-center gap-4 mb-8">
              <button onClick={handleLoadGame} disabled={isGameLoaded}
                className={`px-10 py-4 text-white font-bold text-xl rounded-2xl transition ${
                  isGameLoaded ? "bg-gray-500" : "bg-red-600 hover:bg-red-700"
                }`}>
                LOAD GAME
              </button>
              <button onClick={handleNextGame}
                className="px-10 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-2xl transition">
                NEXT GAME
              </button>
            </div>

            <div className="mb-10 grid grid-cols-2 md:grid-cols-4 gap-3">
              {allKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => handleWin(key)}
                  disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                  className={`py-6 rounded-2xl font-bold text-lg transition-all ${
                    isButtonPressed(key) ? "bg-yellow-500 text-black"
                    : key === "winner" ? "bg-yellow-400 text-black hover:bg-yellow-300"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                  } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {labels[key]}
                  <br />
                  <span className="text-sm">({pendingStakes[key] || "–"})</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-base bg-black/10 p-6 rounded-3xl">
              <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
              <div>Bad Deficit: <strong className="text-red-600">{badDeficit}</strong></div>
              <div>Small Deficit: <strong className="text-purple-600">{smallDeficit}</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile - Compact */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-red-500">Martingale Round</h1>
          <button onClick={handleReload} className="mt-4 flex items-center gap-2 mx-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg">
            <FiRefreshCw /> Reload
          </button>
        </div>

        <div className="flex justify-center gap-4 mb-6">
          <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home" 
            className="flex-1 px-4 py-3 border border-red-600 rounded-xl text-center bg-transparent text-lg" />
          <span className="self-center text-2xl text-red-500 font-black">VS</span>
          <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away" 
            className="flex-1 px-4 py-3 border border-red-600 rounded-xl text-center bg-transparent text-lg" />
        </div>

        <div className="flex gap-3 mb-8">
          <button onClick={handleLoadGame} disabled={isGameLoaded}
            className={`flex-1 py-4 text-lg font-bold rounded-2xl transition ${isGameLoaded ? "bg-gray-600" : "bg-red-600 hover:bg-red-700"}`}>
            LOAD
          </button>
          <button onClick={handleNextGame} className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-lg font-bold rounded-2xl transition">
            NEXT
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {allKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleWin(key)}
              disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
              className={`py-6 rounded-2xl font-bold text-base transition ${
                isButtonPressed(key) ? "bg-yellow-500 text-black"
                : key === "winner" ? "bg-yellow-400 text-black"
                : "bg-blue-600 text-white"
              } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50" : ""}`}
            >
              {labels[key]}
              <br />
              <span className="text-sm">({pendingStakes[key] || "–"})</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm bg-black/20 p-6 rounded-3xl">
          <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
          <div>Bad: <strong className="text-red-400">{badDeficit}</strong></div>
          <div>Small: <strong className="text-purple-400">{smallDeficit}</strong></div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;