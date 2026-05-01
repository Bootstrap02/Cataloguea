import React, { useState } from "react";
import { odd } from "./Scores";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

/* --- Constants outside component — no stale-closure / exhaustive-deps issues --- */
const MARTINGALE_ORDER = [
  "oneX", "twoX", "x2", "zeroGoals", "sixGoals",
  "ht12", "ht21", "ht30", "ft40", "ft41",
];

const SPECIAL_KEYS = [
  "oneX", "twoX", "x2", "zeroGoals", "sixGoals",
  "ht12", "ht21", "ht30", "ft40", "ft41",
];

const SPECIAL_LABELS = {
  oneX: "1X", twoX: "2X", x2: "X2",
  zeroGoals: "0 GOALS", sixGoals: "6 GOALS",
  ht12: "HT 1-2", ht21: "HT 2-1", ht30: "HT 3-0",
  ft40: "FT 4-0", ft41: "FT 4-1",
};

/* Pure helpers — no hooks, no closures */
const getAssetsBehind = (wonKey) => {
  const index = MARTINGALE_ORDER.indexOf(wonKey);
  return index === -1 ? [] : MARTINGALE_ORDER.slice(index + 1);
};

const calcStakes = (found, currentDeficit, currentBase) => {
  let runningTarget = currentBase;
  const stakes = {};
  SPECIAL_KEYS.forEach((k) => (stakes[k] = 0));
  MARTINGALE_ORDER.forEach((key) => {
    if (currentDeficit.includes(key)) {
      const oddValue = found[key] || 0;
      if (oddValue > 1.01) {
        const stakeAmount = Math.max(Math.round(runningTarget / (oddValue - 1)), 10);
        stakes[key] = stakeAmount;
        runningTarget += stakeAmount;
      }
    }
  });
  return stakes;
};

const btnColor = (mode, isInDeficit, isPressed, counter) => {
  if (isPressed) return "bg-yellow-500 opacity-50 cursor-not-allowed";
  if (mode === "active")
    return isInDeficit
      ? "bg-purple-600 hover:bg-purple-500"
      : "bg-blue-600 hover:bg-blue-500";
  if (mode === "noStake")
    return isInDeficit
      ? "bg-purple-600 hover:bg-purple-500"
      : "bg-gray-500 hover:bg-gray-400";
  // idle
  return isInDeficit || counter >= 30
    ? "bg-purple-600 hover:bg-purple-500"
    : "bg-green-600 hover:bg-green-500";
};

/* ================================================================
   COMPONENT
   ================================================================ */
const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [fixture, setFixture] = useState(null);

  const [baseAmount, setBaseAmount] = useState(1000);
  const [deficitArray, setDeficitArray] = useState([]);

  const [counters, setCounters] = useState({
    oneX: 0, twoX: 0, x2: 0,
    zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0,
    ft40: 0, ft41: 0,
  });

  const [pendingStakes, setPendingStakes] = useState({});
  const [pressedWins, setPressedWins] = useState(new Set());
  const [hasWon, setHasWon] = useState(false);

  /* ---------------- LOAD GAME ---------------- */
  const handleLoadGame = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";
    const found = odd.find((o) => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    setFixture(found);
    setPressedWins(new Set());
    setHasWon(false);
    setPendingStakes(calcStakes(found, deficitArray, baseAmount));
  };

  /* ---------------- WIN HANDLER ---------------- */
  const handleWin = (type) => {
    if (!fixture) return;
    if (pressedWins.has(type)) return;

    setPressedWins((prev) => new Set([...prev, type]));

    const isInDeficit = deficitArray.includes(type);

    if (!isInDeficit) {
      // Not in deficit — just reset counter (win prevents it reaching 30)
      setCounters((prev) => ({ ...prev, [type]: 0 }));
      return;
    }

    // Full deficit win logic
    setHasWon(true);

    const behindKeys = getAssetsBehind(type);
    const residue = behindKeys.reduce((sum, key) => sum + (pendingStakes[key] || 0), 0);

    setBaseAmount(1000 + residue);

    setDeficitArray((prev) => {
      const withoutWinner = prev.filter((item) => item !== type);
      const newArray = [...withoutWinner];
      behindKeys.forEach((key) => {
        if (!newArray.includes(key) && (pendingStakes[key] || 0) > 0) {
          newArray.push(key);
        }
      });
      return newArray;
    });

    setCounters((prev) => ({ ...prev, [type]: 0 }));
  };

  /* ---------------- NEXT GAME ---------------- */
  const handleNextGame = () => {
    if (!fixture) return;

    // 1. Increment every counter; check 30-threshold with fresh values
    setCounters((prev) => {
      const updated = { ...prev };
      SPECIAL_KEYS.forEach((key) => { updated[key] = (prev[key] || 0) + 1; });

      setDeficitArray((prevDeficit) => {
        let changed = false;
        const newDeficit = [...prevDeficit];
        SPECIAL_KEYS.forEach((key) => {
          if (updated[key] >= 30 && !newDeficit.includes(key)) {
            newDeficit.push(key);
            changed = true;
          }
        });
        return changed ? newDeficit : prevDeficit;
      });

      return updated;
    });

    // 2. Handle loss
    if (!hasWon) {
      const totalStaked = Object.values(pendingStakes).reduce((sum, v) => sum + (v || 0), 0);
      setBaseAmount((prev) => prev + totalStaked);

      setDeficitArray((prev) => {
        const newArray = [...prev];
        MARTINGALE_ORDER.forEach((key) => {
          if ((pendingStakes[key] || 0) > 0 && !newArray.includes(key)) {
            newArray.push(key);
          }
        });
        return newArray;
      });
    }

    // 3. Reset game state
    setFixture(null);
    setInputA("");
    setInputB("");
    setPendingStakes({});
    setPressedWins(new Set());
    setHasWon(false);
  };

  /* ---------------- DERIVED ---------------- */
  const isGameLoaded = !!fixture;

  const getButtonState = (key) => {
    const stake = pendingStakes[key] || 0;
    const isInDeficit = deficitArray.includes(key);
    const counter = counters[key] || 0;
    const isPressed = pressedWins.has(key);
    if (!isGameLoaded) return { mode: "idle", stake, isInDeficit, counter, isPressed };
    if (stake > 0)      return { mode: "active", stake, isInDeficit: true, counter, isPressed };
    return               { mode: "noStake", stake: 0, isInDeficit, counter, isPressed };
  };

  const handleButtonClick = (key) => {
    if (!isGameLoaded) {
      setCounters((prev) => ({ ...prev, [key]: 0 }));
    } else {
      handleWin(key);
    }
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div>
      {/* ===================== DESKTOP ===================== */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
            Deficit Array Strategy
          </h1>
          <p className="text-red-400 mt-2 text-sm">
            {fixture ? "GAME LOADED" : "Ready — click to register wins or reset counters"}
            &nbsp;|&nbsp; Array: [{deficitArray.join(", ")}]
          </p>
        </div>

        <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">
          {/* Bet Buttons */}
          <div className="mb-8">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {SPECIAL_KEYS.map((key) => {
                const { mode, stake, isInDeficit, counter, isPressed } = getButtonState(key);
                const color = btnColor(mode, isInDeficit, isPressed, counter);
                return (
                  <button
                    key={key}
                    onClick={() => handleButtonClick(key)}
                    disabled={isPressed}
                    className={`py-6 rounded-2xl text-white font-extrabold transition ${color}`}
                    title={
                      mode === "idle"
                        ? `Click to reset counter — ${counter}/30`
                        : mode === "active"
                        ? `Stake: ${stake} | Click if this wins`
                        : `No stake — click if this wins (resets counter)`
                    }
                  >
                    {SPECIAL_LABELS[key]}
                    <br />
                    {mode === "active"
                      ? <span className="text-sm">({stake})</span>
                      : <span className="text-sm">—</span>}
                    <br />
                    <span className={`text-xs ${counter >= 30 ? "text-yellow-300 font-bold" : ""}`}>
                      {counter}/30{counter >= 30 ? " ⚠" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            {!fixture && (
              <div className="text-center text-green-700 font-semibold py-3 bg-green-50 rounded-xl mt-4 text-sm">
                💡 Click any button to register a win (resets its counter).
                Counters increment each "Next Game". At 30 → enters deficit array and starts martingaling.
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-8">
            <div className="flex items-center gap-4">
              <input
                value={inputA}
                onChange={(e) => setInputA(e.target.value)}
                placeholder="home team"
                className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg"
              />
              <span className="font-black text-3xl text-red-500">VS</span>
              <input
                value={inputB}
                onChange={(e) => setInputB(e.target.value)}
                placeholder="away team"
                className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg"
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleLoadGame}
                disabled={isGameLoaded}
                className={`px-10 py-4 text-white font-extrabold text-xl rounded-2xl transition shadow-lg ${
                  isGameLoaded ? "bg-gray-400 opacity-50 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                LOAD GAME
              </button>
              <button
                onClick={handleNextGame}
                disabled={!isGameLoaded}
                className={`px-10 py-4 text-white font-extrabold text-xl rounded-2xl transition shadow-lg ${
                  !isGameLoaded ? "bg-gray-400 opacity-50 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                NEXT GAME
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>
              Base: <strong className="text-green-700">{baseAmount}</strong>
              <div className="text-xs text-gray-500">Recovery target</div>
            </div>
            <div className="col-span-2">
              Deficit Array: <strong className="text-purple-700">[{deficitArray.join(", ")}]</strong>
              <div className="text-xs text-gray-500">Assets being martingaled</div>
            </div>
            <div>
              Game Status:{" "}
              <strong className={hasWon ? "text-green-700" : "text-yellow-600"}>
                {hasWon ? "WON ✓" : "Pending"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== MOBILE ===================== */}
      <div className="hidden max-lg:flex flex-col min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4 overflow-x-hidden">
        <div className="text-center mb-3">
          <h1 className="text-xl font-extrabold text-red-500">Deficit Array</h1>
          <p className="text-red-400 text-xs mt-1">
            {fixture ? "GAME LOADED" : "Tap to register win / reset counter"}
          </p>
        </div>

        {/* Buttons */}
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-2">
            {SPECIAL_KEYS.map((key) => {
              const { mode, stake, isInDeficit, counter, isPressed } = getButtonState(key);
              const color = btnColor(mode, isInDeficit, isPressed, counter);
              return (
                <button
                  key={key}
                  onClick={() => handleButtonClick(key)}
                  disabled={isPressed}
                  className={`py-3 px-2 rounded-xl text-white font-bold text-xs transition active:scale-95 ${color}`}
                >
                  {SPECIAL_LABELS[key]}
                  <br />
                  {mode === "active"
                    ? <span className="text-[10px]">({stake})</span>
                    : <span className="text-[10px]">—</span>}
                  <br />
                  <span className={`text-[8px] ${counter >= 30 ? "text-yellow-300 font-bold" : ""}`}>
                    {counter}/30{counter >= 30 ? "⚠" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Inputs */}
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-center gap-2">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="Home"
              className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none"
            />
            <span className="font-black text-lg text-red-500 shrink-0">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="Away"
              className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleLoadGame}
              disabled={isGameLoaded}
              className={`flex-1 py-3 text-white font-bold text-sm rounded-xl active:scale-95 ${
                isGameLoaded ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-red-700 hover:bg-red-600"
              }`}
            >
              LOAD
            </button>
            <button
              onClick={handleNextGame}
              disabled={!isGameLoaded}
              className={`flex-1 py-3 text-white font-bold text-sm rounded-xl active:scale-95 ${
                !isGameLoaded ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-green-700 hover:bg-green-600"
              }`}
            >
              NEXT
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-black/20 rounded-xl p-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span>Base:</span>
            <strong className="text-green-400">{baseAmount}</strong>
          </div>
          <div className="flex justify-between items-start gap-2">
            <span className="shrink-0">Deficit Array:</span>
            <strong className="text-purple-400 text-right">[{deficitArray.join(", ")}]</strong>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <strong className={hasWon ? "text-green-400" : "text-yellow-400"}>
              {hasWon ? "WON ✓" : "Pending"}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
