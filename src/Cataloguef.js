import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";

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

  const [bigDeficit, setBigDeficit] = useState(0);
  const [mediumDeficit, setMediumDeficit] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);

  const [pendingStakes, setPendingStakes] = useState({
    winnerAmount: 0,
    oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0,
    x1: 0, ht11: 0, ft11: 0, o45: 0,
    winGG: 0, htGG: 0, fourGoals: 0,
  });

  const [pressedWins, setPressedWins] = useState(new Set());

  const allKeys = ["winner", "oneX", "twoX", "zeroGoals", "sixGoals", "x1", "ht11", "ft11", "o45", "winGG", "htGG", "fourGoals"];

  const labels = {
    winner: "6–0",
    oneX: "1X",
    twoX: "2X",
    zeroGoals: "0 GOALS",
    sixGoals: "6 GOALS",
    x1: "X1",
    ht11: "HT 1-1",
    ft11: "FT 1-1",
    o45: "O45",
    winGG: "Win GG",
    htGG: "HT GG",
    fourGoals: "4+ Goals",
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
      setBigDeficit(data.bigDeficit ?? 0);
      setMediumDeficit(data.mediumDeficit ?? 0);
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
        bigDeficit,
        mediumDeficit,
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

    // Calculate 6-0 stake
    let winnerStake = Math.round(baseStake / found.winner);
    winnerStake = Math.max(winnerStake, 10);

    const newBigDeficit = bigDeficit + winnerStake;
    setBigDeficit(newBigDeficit);

    // Create pendingStakes with correct key "winner"
    const newPending = { 
      winner: winnerStake,           // ← This is what the button needs
      winnerAmount: winnerStake      // keep old key if you want
    };

    // Big Deficit dynamic stakes
    ["oneX", "twoX", "zeroGoals", "sixGoals"].forEach((key) => {
      const odd = found[key] || 0;
      if (odd <= 1.01) {
        newPending[key] = 0;
        return;
      }
      const stake = Math.round(newBigDeficit / odd);
      newPending[key] = Math.max(stake, 10);
    });

    // Medium & Small - fixed 25
    ["x1", "ht11", "ft11", "o45", "winGG", "htGG", "fourGoals"].forEach((key) => {
      newPending[key] = 25;
    });

    setPendingStakes(newPending);

    // Add Big stakes total to Medium
    const bigStakesTotal = ["oneX", "twoX", "zeroGoals", "sixGoals"].reduce(
      (sum, key) => sum + (newPending[key] || 0), 0
    );
    setMediumDeficit((prev) => prev + bigStakesTotal);

    // Add 100 to Small from Medium
    setSmallDeficit((prev) => prev + 100);

  };
  
  
  
  
  
  
  /* ---------------- WIN HANDLER - FINAL FIXED VERSION ---------------- */
  const handleWin = (type) => {
    if (!fixture) return;

    const stake = pendingStakes[type];
    if (stake <= 0) return;

    // Correct odd lookup from your array
    let oddKey = type;
    if (type === "winGG") oddKey = "wingg";
    if (type === "htGG") oddKey = "htgg";
    if (type === "o45") oddKey = "O45";

    const odd = fixture[oddKey] || 2;
    const winAmount = Math.round(stake * odd);

    console.log(`Clicked: ${type} | Odd: ${odd} | Win Amount: ${winAmount}`);

    // Mark button pressed (gold)
    setPressedWins((prev) => new Set([...prev, type]));

    if (type === "winner") {
      console.log("Jackpot!!");
      return;
    }

    // Big Deficit buttons → clear entire bigDeficit
    if (["oneX", "twoX", "zeroGoals", "sixGoals"].includes(type)) {
      setBigDeficit(0);
    } 
    // Medium Deficit buttons
    else if (["x1", "ht11", "ft11", "o45"].includes(type)) {

    if (mediumDeficit >= winAmount) {
        setMediumDeficit((prev) => prev - winAmount);
      } else {
        // medium is not enough → clear medium and carry residue
        const residue = winAmount - mediumDeficit;
        setMediumDeficit(0);

        // Residue to Big
        if (smallDeficit >= residue) {
          setSmallDeficit((prev) => prev - residue);
        } else {
          const newResidue = residue - smallDeficit;
          setSmallDeficit(0);

          // Final residue to Medium
          if (bigDeficit >= newResidue) {
            setBigDeficit((prev) => prev - newResidue);
          } else {
            setBigDeficit(0);
          }
        }
      }
    } 
    // Small Deficit buttons - CORRECTED
    else if (["winGG", "htGG", "fourGoals"].includes(type)) {

      // Small first
      if (smallDeficit >= winAmount) {
        console.log("great!")
        setSmallDeficit((prev) => prev - winAmount);
      } else {
        // Small is not enough → clear Small and carry residue
        const residue = winAmount - smallDeficit;
        setSmallDeficit(0);

        // Residue to Big
        if (bigDeficit >= residue) {
          setBigDeficit((prev) => prev - residue);
        } else {
          const newResidue = residue - bigDeficit;
          setBigDeficit(0);

          // Final residue to Medium
          if (mediumDeficit >= newResidue) {
            setMediumDeficit((prev) => prev - newResidue);
          } else {
            setMediumDeficit(0);
          }
        }
      }
    }

  };
  
  const handleNextGame = async () => {
  if (!fixture) return;

  let newBig = bigDeficit;
  let newMedium = mediumDeficit;
  let newSmall = smallDeficit;

  /* ---------------- SHIFT LOGIC ---------------- */

  // Move from SMALL → BIG
  while (newSmall >= 1000) {
    newSmall -= 1000;
    newBig += 1000;
  }

  // Move from MEDIUM → BIG
  while (newMedium >= 1000) {
    newMedium -= 1000;
    newBig += 1000;
  }

  /* ---------------- APPLY UPDATED VALUES ---------------- */

  setSmallDeficit(newSmall);
  setMediumDeficit(newMedium);
  setBigDeficit(newBig + 75); // keep your existing +75 logic

  /* ---------------- RESET GAME ---------------- */

  setPendingStakes({
    winnerAmount: 0,
    oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0,
    x1: 0, ht11: 0, ft11: 0, o45: 0,
    winGG: 0, htGG: 0, fourGoals: 0,
  });

  setFixture(null);
  setInputA("");
  setInputB("");
  setPressedWins(new Set());

  await saveAll();
};

  const isButtonPressed = (key) => pressedWins.has(key);
  const isGameLoaded = !!fixture;

  return (
    <div>
      {/* Desktop */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
            3-Level Deficit System
          </h1>
        </div>

        <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

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
                disabled={isGameLoaded}
                className={`px-10 py-4 text-white font-extrabold text-xl rounded-2xl transition shadow-lg ${
                  isGameLoaded ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                LOAD GAME
              </button>
              <button
                onClick={handleNextGame}
                className="px-10 py-4 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xl rounded-2xl transition shadow-lg"
              >
                NEXT GAME
              </button>
            </div>
          </div>

          {/* All buttons together */}
          <div className="mb-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {allKeys.map((key) => (
              <button
                key={key}
                onClick={() => handleWin(key)}
                disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                className={`py-6 rounded-2xl font-extrabold transition text-white ${
                  isButtonPressed(key) 
                    ? "bg-yellow-500" 
                    : key === "winner" 
                      ? "bg-yellow-400 text-black hover:bg-yellow-300" 
                      : "bg-blue-600 hover:bg-blue-500"
                } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {labels[key]}<br />
                <span className="text-sm">({pendingStakes[key] || "–"})</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
            <div>Big Deficit: <strong className="text-red-600">{bigDeficit}</strong></div>
            <div>Medium Deficit: <strong className="text-orange-600">{mediumDeficit}</strong></div>
            <div>Small Deficit: <strong className="text-purple-600">{smallDeficit}</strong></div>
          </div>
        </div>
      </div>

      {/* Mobile version */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4 flex flex-col overflow-x-hidden">
        <div className="text-center mb-3">
          <h1 className="text-2xl font-extrabold text-red-500">3 Deficits</h1>
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-center gap-2">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="Home"
              className="flex-1 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white"
            />
            <span className="font-black text-lg text-red-500">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="Away"
              className="flex-1 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleLoadGame}
              disabled={isGameLoaded}
              className={`flex-1 py-3 text-white font-bold text-sm rounded-xl transition ${
                isGameLoaded ? "bg-gray-600" : "bg-red-700 hover:bg-red-600"
              }`}
            >
              LOAD
            </button>
            <button
              onClick={handleNextGame}
              className="flex-1 py-3 bg-green-700 hover:bg-green-600 text-white font-bold text-sm rounded-xl transition"
            >
              NEXT
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {allKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleWin(key)}
              disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
              className={`py-3 px-2 rounded-xl font-bold text-xs transition active:scale-95 ${
                isButtonPressed(key) 
                  ? "bg-yellow-500" 
                  : key === "winner" 
                    ? "bg-yellow-500 text-black" 
                    : "bg-blue-700 text-white"
              } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {labels[key]}<br />
              <span className="text-[10px]">({pendingStakes[key] || "–"})</span>
            </button>
          ))}
        </div>

        <div className="flex-grow min-h-0 overflow-auto bg-black/20 rounded-xl p-3 text-xs grid grid-cols-2 gap-2">
          <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
          <div>Big: <strong className="text-red-400">{bigDeficit}</strong></div>
          <div>Medium: <strong className="text-orange-400">{mediumDeficit}</strong></div>
          <div>Small: <strong className="text-purple-400">{smallDeficit}</strong></div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;