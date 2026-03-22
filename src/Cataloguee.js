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

  const [badGamesDeficit, setBadGamesDeficit] = useState(0);
  const [badGameShadow, setBadGameShadow] = useState(0);
  const [win, setWin] = useState(false);

  const [deficitBank, setDeficitBank] = useState(0);

  const [specialDeficits, setSpecialDeficits] = useState({
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  const [pendingStakes, setPendingStakes] = useState({
    winnerAmount: 0,
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  // Track which win buttons have been pressed this game
  const [pressedWins, setPressedWins] = useState(new Set()); // "winner", "oneX", "twoX", ...

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
//   const fetchAll = async () => {
//     try {
//       const res = await axios.get(API_BASE);
//       const data = res.data || {};
//       console.log(data)
//       setBaseStake(data.base ?? 10000);
//       setBadGamesDeficit(data.badGamesDeficit ?? 0);
//       setBadGameShadow(data.badGameShadow ?? 0);
//       setDeficitBank(data.deficitBank ?? 0);
//       setWin(false);
//       setPressedWins(new Set());

//       setSpecialDeficits({
//   oneX: data.oneXDeficit ?? 0,
//   twoX: data.twoXDeficit ?? 0,
//   x2: data.xTwoDeficit ?? 0,                // ← changed
//   zeroGoals: data.zeroGoalsDeficit ?? 0,
//   sixGoals: data.sixGoalsDeficit ?? 0,
//   ht12: data.htOneTwoDeficit ?? 0,          // ← changed
//   ht21: data.htTwoOneDeficit ?? 0,          // ← changed
//   ht30: data.htThreeZeroDeficit ?? 0,       // ← changed
//   ft40: data.ftFourZeroDeficit ?? 0,        // ← changed
//   ft41: data.ftFourOneDeficit ?? 0,         // ← changed
// });
//     } catch (err) {
//       console.error("❌ Load failed:", err.message);
//     }
//   };

//  const saveAll = async () => {
//   try {
//     const payload = {
//       base: Math.max(10000, baseRef.current),
//       badGamesDeficit,
//       badGameShadow,
//       deficitBank,
//       oneXDeficit: specialDeficits.oneX,
//       twoXDeficit: specialDeficits.twoX,
//       xTwoDeficit: specialDeficits.x2,
//       zeroGoalsDeficit: specialDeficits.zeroGoals,
//       sixGoalsDeficit: specialDeficits.sixGoals,
//       htOneTwoDeficit: specialDeficits.ht12,
//       htTwoOneDeficit: specialDeficits.ht21,
//       htThreeZeroDeficit: specialDeficits.ht30,
//       ftFourZeroDeficit: specialDeficits.ft40,
//       ftFourOneDeficit: specialDeficits.ft41,
//     };
//     console.log("Saving payload:", payload); // ← debug
//     await axios.put(API_BASE, payload);
//     console.log("✅ Saved successfully");
//   } catch (err) {
//     console.error("❌ Save failed:", err.message);
//   }
// };
/* ---------------- LOAD / SAVE ---------------- */
const fetchAll = async () => {
  try {
    const res = await axios.get(API_BASE);
    const data = res.data || {};
    console.log("Raw API response:", data); // ← keep this for debugging

    setBaseStake(data.base ?? 10000);
    setBadGamesDeficit(data.badGamesDeficit ?? 0);
    setBadGameShadow(data.badGameShadow ?? 0);
    setDeficitBank(data.deficitBank ?? 0);
    setWin(false);
    setPressedWins(new Set());

    setSpecialDeficits({
      oneX: data.oneXDeficit ?? 0,
      twoX: data.twoXDeficit ?? 0,
      x2: data.xTwoDeficit ?? 0,               // ← use schema name
      zeroGoals: data.zeroGoalsDeficit ?? 0,
      sixGoals: data.sixGoalsDeficit ?? 0,
      ht12: data.htOneTwoDeficit ?? 0,         // ← use schema name
      ht21: data.htTwoOneDeficit ?? 0,         // ← use schema name
      ht30: data.htThreeZeroDeficit ?? 0,      // ← use schema name
      ft40: data.ftFourZeroDeficit ?? 0,       // ← use schema name
      ft41: data.ftFourOneDeficit ?? 0,        // ← use schema name
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
      deficitBank,
      oneXDeficit: specialDeficits.oneX,
      twoXDeficit: specialDeficits.twoX,
      xTwoDeficit: specialDeficits.x2,           // ← save as schema name
      zeroGoalsDeficit: specialDeficits.zeroGoals,
      sixGoalsDeficit: specialDeficits.sixGoals,
      htOneTwoDeficit: specialDeficits.ht12,     // ← save as schema name
      htTwoOneDeficit: specialDeficits.ht21,     // ← save as schema name
      htThreeZeroDeficit: specialDeficits.ht30,  // ← save as schema name
      ftFourZeroDeficit: specialDeficits.ft40,   // ← save as schema name
      ftFourOneDeficit: specialDeficits.ft41,    // ← save as schema name
    };
    console.log("Saving payload:", payload); // ← keep for debug
    await axios.put(API_BASE, payload);
    console.log("✅ Saved successfully");
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  }
};
  useEffect(() => {
    fetchAll();
  }, []);

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

    const newBase = baseStake;
    setFixture(found);
    setWin(false);
    setPressedWins(new Set());

    let winnerAmount = Math.round(newBase / (found.winner - 1));
    winnerAmount = Math.max(winnerAmount, 10);

    const newBad = badGamesDeficit + winnerAmount;
    setBadGamesDeficit(newBad);
    setBadGameShadow(newBad);

    const calcStake = (target, odd) => {
      if (odd <= 1.01) return 0;
      let stake = Math.round(target / (odd - 1));
      return Math.max(stake, 10);
    };

    const newPending = { winnerAmount };
    specialKeys.forEach((key) => {
      const odd = found[key] || 0;
      const target = (specialDeficits[key] || 0) + newBad;
      newPending[key] = calcStake(target, odd);
    });

    setPendingStakes(newPending);

    setSpecialDeficits((prev) => {
      const updated = { ...prev };
      specialKeys.forEach((key) => {
        updated[key] += newPending[key] || 0;
      });
      return updated;
    });
  };

  /* ---------------- SPECIAL WIN HANDLER ---------------- */
  const handleWin = (type) => {
    if (!fixture) return;

    const recovered = specialDeficits[type] || 0;
    if (recovered <= 0 || pendingStakes[type] === 0) return;

    // Always zero out this special's deficit and stake
    setSpecialDeficits((prev) => ({
      ...prev,
      [type]: 100,
    }));
    setPendingStakes((prev) => ({ ...prev, [type]: 0 }));

    // Mark this button as pressed
    setPressedWins((prev) => new Set([...prev, type]));

    // First win in game
    if (!win) {
      setWin(true);
      setBadGamesDeficit(0);
      setDeficitBank((prev) => prev + 100);
    }
    // Subsequent wins
    else {
      setDeficitBank((prev) => prev + badGameShadow + 100);
    }

  };

  /* ---------------- 6-0 JACKPOT ---------------- */
  const handleJackpot = () => {
    if (!fixture) return;
    // Reset base stake
    setBaseStake(10000);

    setPendingStakes((prev) => ({ ...prev, winnerAmount: 0 }));

    // Mark jackpot button pressed
    setPressedWins((prev) => new Set([...prev, "winner"]));

    setWin(false);

  };

  /* ---------------- NEXT GAME + PROTECTION LOGIC ---------------- */

const handleNextGame = async () => {
  if (!fixture) return;

  // Protection logic: reduce high deficits (≥1000) by up to 900 each
  const allDeficits = {
    winner: badGamesDeficit,
    ...specialDeficits,
  };

  let bankDeduction = 0;
  let baseStakeIncrease = 0;

  // First pass: try to use bank to cover reductions
  Object.entries(allDeficits).forEach(([key, def]) => {
    if (def >= 1000) {
      const wantedReduction = 900;
      const canDeductFromBank = Math.min(wantedReduction, deficitBank - bankDeduction);

      if (canDeductFromBank > 0) {
        bankDeduction += canDeductFromBank;

        // Apply reduction to the asset
        if (key === "winner") {
          setBadGamesDeficit((prev) => Math.max(0, prev - canDeductFromBank));
        } else {
          setSpecialDeficits((prev) => ({
            ...prev,
            [key]: Math.max(0, prev[key] - canDeductFromBank),
          }));
        }
      }

      // If bank couldn't cover full 900 → add remainder to baseStake
      const remaining = wantedReduction - canDeductFromBank;
      if (remaining > 0) {
        baseStakeIncrease += remaining;
      }
    }
  });

  // Deduct from bank what was used
  if (bankDeduction > 0) {
    setDeficitBank((prev) => Math.max(0, prev - bankDeduction));
  }

  // If we need to increase baseStake (bank was insufficient)
  if (baseStakeIncrease > 0) {
    setBaseStake((prev) => prev + baseStakeIncrease);
  }

  // Final cleanup
  setBadGameShadow(0);
  setWin(false);
  setPressedWins(new Set());

  setPendingStakes({
    winnerAmount: 0,
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  setFixture(null);
  setInputA("");
  setInputB("");

  await saveAll();
};
  const isButtonPressed = (key) => pressedWins.has(key);
  const isGameLoaded = !!fixture;

  return (
    <div>
      {/* Desktop version */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
              Virtual Strategy
            </h1>
            <button
              onClick={fetchAll}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-semibold text-lg rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border border-red-500/30 disabled:opacity-50"
            >
              <FiRefreshCw className="w-5 h-5" />
              Reload Data
            </button>
          </div>
          <p className="text-red-400 mt-2">
            {fixture ? "MATCH LOADED — 6-0 + SPECIALS" : "Ready"}
          </p>
        </div>

        <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

          <div className="mb-8">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <button
                onClick={handleJackpot}
                disabled={!fixture || isButtonPressed("winner")}
                className={`py-6 rounded-2xl text-black font-extrabold transition ${
                  isButtonPressed("winner") ? "bg-yellow-500" : "bg-yellow-400 hover:bg-yellow-300"
                } ${!fixture || isButtonPressed("winner") ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                6–0<br />({pendingStakes.winnerAmount || "–"})
              </button>

              {specialKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => handleWin(key)}
                  disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                  className={`py-6 rounded-2xl text-white font-extrabold transition ${
                    isButtonPressed(key) ? "bg-yellow-500" : "bg-blue-600 hover:bg-blue-500"
                  } ${!fixture || pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {specialLabels[key]}<br />({pendingStakes[key] || "–"})
                </button>
              ))}
            </div>
          </div>

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
                  isGameLoaded
                    ? "bg-gray-600 opacity-50 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700"
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

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
            <div>6-0 Hist: <strong className="text-yellow-600">{badGamesDeficit}</strong></div>
            <div>Shadow: <strong className="text-orange-600">{badGameShadow}</strong></div>
            <div>Bank: <strong className="text-cyan-600">{deficitBank}</strong></div>
            <div>Win: <strong>{win ? "Yes" : "No"}</strong></div>
            <div>1X: <strong>{specialDeficits.oneX}</strong></div>
            <div>2X: <strong>{specialDeficits.twoX}</strong></div>
            <div>X2: <strong>{specialDeficits.x2}</strong></div>
            <div>0G: <strong>{specialDeficits.zeroGoals}</strong></div>
            <div>6G: <strong>{specialDeficits.sixGoals}</strong></div>
            <div>HT12: <strong>{specialDeficits.ht12}</strong></div>
            <div>HT21: <strong>{specialDeficits.ht21}</strong></div>
            <div>HT30: <strong>{specialDeficits.ht30}</strong></div>
            <div>FT40: <strong>{specialDeficits.ft40}</strong></div>
            <div>FT41: <strong>{specialDeficits.ft41}</strong></div>
          </div>
        </div>
      </div>

      {/* Mobile version – similar changes applied */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4 flex flex-col overflow-x-hidden">
        {/* Header */}
        <div className="text-center mb-3">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-red-500">Virtual Strategy</h1>
            <button
              onClick={fetchAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-medium text-xs rounded-xl shadow transition active:scale-95 border border-red-500/30 disabled:opacity-50"
            >
              Reload
            </button>
          </div>
          <p className="text-red-400 text-xs mt-1">
            {fixture ? "LOADED — 6-0 + SPECIALS" : "Ready"}
          </p>
        </div>

        {/* Outcomes */}
        <div className="mb-4 flex-grow min-h-0">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleJackpot}
              disabled={!fixture || isButtonPressed("winner")}
              className={`py-3 px-2 rounded-xl text-black font-bold text-xs transition active:scale-95 ${
                isButtonPressed("winner") ? "bg-yellow-500" : "bg-yellow-500 hover:bg-yellow-400"
              } ${!fixture || isButtonPressed("winner") ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              6–0<br />
              <span className="text-[10px]">({pendingStakes.winnerAmount || "–"})</span>
            </button>

            {specialKeys.map((key) => (
              <button
                key={key}
                onClick={() => handleWin(key)}
                disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                className={`py-3 px-2 rounded-xl text-white font-bold text-xs transition active:scale-95 ${
                  isButtonPressed(key) ? "bg-yellow-500" : "bg-blue-700 hover:bg-blue-600"
                } ${!fixture || pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {specialLabels[key]}<br />
                <span className="text-[10px]">({pendingStakes[key] || "–"})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input + Actions */}
        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-center gap-2 max-w-full">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="Home"
              className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400"
            />
            <span className="font-black text-lg text-red-500 shrink-0">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="Away"
              className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleLoadGame}
              disabled={isGameLoaded}
              className={`flex-1 py-3 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm ${
                isGameLoaded ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-red-700 hover:bg-red-600"
              }`}
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

        {/* Stats */}
        <div className="flex-grow min-h-0 overflow-auto bg-black/20 rounded-xl p-3 text-xs grid grid-cols-3 gap-2">
          <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
          <div>6-0: <strong className="text-yellow-400">{badGamesDeficit}</strong></div>
          <div>Shdw: <strong className="text-orange-400">{badGameShadow}</strong></div>
          <div>Bank: <strong className="text-cyan-400">{deficitBank}</strong></div>
          <div>Win: <strong>{win ? "Yes" : "No"}</strong></div>

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
// import React, { useState, useEffect, useRef } from "react";
// import axios from "axios";
// import { odds } from "./Scores";
// import { FiRefreshCw } from 'react-icons/fi';

// /* ---------------- UTILS ---------------- */
// const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

// /* ---------------- API ---------------- */
// const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

// const Homepage = () => {
//   const [inputA, setInputA] = useState("");
//   const [inputB, setInputB] = useState("");

//   const [fixture, setFixture] = useState(null);

//   const [baseStake, setBaseStake] = useState(10000);
//   const baseRef = useRef(10000);

//   const [badGamesDeficit, setBadGamesDeficit] = useState(0);
//   const [badGameShadow, setBadGameShadow] = useState(0);
//   const [win, setWin] = useState(false);

//   const [deficitBank, setDeficitBank] = useState(0);

//   const [divider, setDivider] = useState(0);
//   const [divideCount, setDivideCount] = useState(0);

//   const [specialDeficits, setSpecialDeficits] = useState({
//     oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
//     ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
//   });

//   const [pendingStakes, setPendingStakes] = useState({
//     winnerAmount: 0,
//     oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
//     ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
//   });

//   const [pressedWins, setPressedWins] = useState(new Set());

//   const specialKeys = [
//     "oneX", "twoX", "x2", "zeroGoals", "sixGoals",
//     "ht12", "ht21", "ht30", "ft40", "ft41"
//   ];

//   const specialLabels = {
//     oneX: "1X", twoX: "2X", x2: "X2",
//     zeroGoals: "0 GOALS", sixGoals: "6 GOALS",
//     ht12: "HT 1-2", ht21: "HT 2-1", ht30: "HT 3-0",
//     ft40: "FT 4-0", ft41: "FT 4-1",
//   };

//   useEffect(() => {
//     baseRef.current = baseStake;
//   }, [baseStake]);

//   /* ---------------- LOAD / SAVE ---------------- */
//   const fetchAll = async () => {
//     try {
//       const res = await axios.get(API_BASE);
//       const data = res.data || {};
//       setBaseStake(data.base ?? 10000);
//       setBadGamesDeficit(data.badGamesDeficit ?? 0);
//       setBadGameShadow(data.badGameShadow ?? 0);
//       setDeficitBank(data.deficitBank ?? 0);
//       setDivider(data.divider ?? 0);
//       setDivideCount(data.divideCount ?? 0);
//       setWin(false);
//       setPressedWins(new Set());

//       setSpecialDeficits({
//         oneX: data.oneXDeficit ?? 0,
//         twoX: data.twoXDeficit ?? 0,
//         x2: data.xTwoDeficit ?? 0,
//         zeroGoals: data.zeroGoalsDeficit ?? 0,
//         sixGoals: data.sixGoalsDeficit ?? 0,
//         ht12: data.htOneTwoDeficit ?? 0,
//         ht21: data.htTwoOneDeficit ?? 0,
//         ht30: data.htThreeZeroDeficit ?? 0,
//         ft40: data.ftFourZeroDeficit ?? 0,
//         ft41: data.ftFourOneDeficit ?? 0,
//       });
//     } catch (err) {
//       console.error("❌ Load failed:", err.message);
//     }
//   };

//   const saveAll = async () => {
//     try {
//       const payload = {
//         base: Math.max(10000, baseRef.current),
//         badGamesDeficit,
//         badGameShadow,
//         deficitBank,
//         divider,
//         divideCount,
//         oneXDeficit: specialDeficits.oneX,
//         twoXDeficit: specialDeficits.twoX,
//         xTwoDeficit: specialDeficits.x2,
//         zeroGoalsDeficit: specialDeficits.zeroGoals,
//         sixGoalsDeficit: specialDeficits.sixGoals,
//         htOneTwoDeficit: specialDeficits.ht12,
//         htTwoOneDeficit: specialDeficits.ht21,
//         htThreeZeroDeficit: specialDeficits.ht30,
//         ftFourZeroDeficit: specialDeficits.ft40,
//         ftFourOneDeficit: specialDeficits.ft41,
//       };
//       await axios.put(API_BASE, payload);
//       console.log("✅ Saved:", payload);
//     } catch (err) {
//       console.error("❌ Save failed:", err.message);
//     }
//   };

//   useEffect(() => {
//     fetchAll();
//   }, []);

//   /* ---------------- DIVIDER RESET ---------------- */
//   const handleDividerReset = () => {
//     if (window.confirm("Reset all specials + bank and calculate new divider?")) {
//       const total = specialKeys.reduce((sum, key) => sum + (specialDeficits[key] || 0), 0);
//       const newDivider = Math.floor(total / 100);

//       setDivider(newDivider);
//       setDivideCount(0);
//       setDeficitBank(0);

//       setSpecialDeficits({
//         oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
//         ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
//       });

//       saveAll();
//     }
//   };

//   /* ---------------- LOAD GAME ---------------- */
//   const handleLoadGame = (e) => {
//     e.preventDefault();

//     const home = sanitizeTeam(inputA) || "che";
//     const away = sanitizeTeam(inputB) || "che";

//     const found = odds.find((o) => o.home === home && o.away === away);

//     if (!found) {
//       alert(`No odds for ${home} vs ${away}`);
//       return;
//     }

//     const newBase = baseStake;
//     setFixture(found);
//     setWin(false);
//     setPressedWins(new Set());

//     let winnerAmount = Math.round(newBase / (found.winner - 1));
//     winnerAmount = Math.max(winnerAmount, 10);

//     const newBad = badGamesDeficit + winnerAmount;
//     setBadGamesDeficit(newBad);
//     setBadGameShadow(newBad);

//     const calcStake = (target, odd) => {
//       if (odd <= 1.01) return 0;
//       let stake = Math.round(target / (odd - 1));
//       return Math.max(stake, 10);
//     };

//     const newPending = { winnerAmount };
//     specialKeys.forEach((key) => {
//       const odd = found[key] || 0;
//       const target = (specialDeficits[key] || 0) + newBad;
//       newPending[key] = calcStake(target, odd);
//     });

//     setPendingStakes(newPending);

//     setSpecialDeficits((prev) => {
//       const updated = { ...prev };
//       specialKeys.forEach((key) => {
//         updated[key] += newPending[key] || 0;
//       });
//       return updated;
//     });
//   };

//   /* ---------------- SPECIAL WIN ---------------- */
//   const handleWin = (type) => {
//     if (!fixture) return;

//     const recovered = specialDeficits[type] || 0;
//     if (recovered <= 0 || pendingStakes[type] === 0) return;

//     setSpecialDeficits((prev) => ({
//       ...prev,
//       [type]: 0,
//     }));
//     setPendingStakes((prev) => ({ ...prev, [type]: 0 }));

//     setPressedWins((prev) => new Set([...prev, type]));

//     setDivideCount((prev) => {
//       const newCount = prev + 1;
//       if (newCount >= 100) setDivider(0);
//       return newCount;
//     });

//     if (!win) {
//       setWin(true);
//       setBadGamesDeficit(divider > 0 ? divider : 0);
//       setDeficitBank((prev) => prev + 100);
//     } else {
//       setDeficitBank((prev) => prev + badGameShadow + 100);
//     }

//     setDeficitBank((prev) => prev + recovered);

//     saveAll();
//   };

//   /* ---------------- JACKPOT (6-0) ---------------- */
//   const handleJackpot = () => {
//     if (!fixture) return;

//     const recovered = badGamesDeficit;
//     if (recovered <= 0) return;

//     setDeficitBank((prev) => prev + recovered);
//     setBadGamesDeficit(0);
//     setBadGameShadow(0);

//     setBaseStake(10000);

//     setPendingStakes((prev) => ({ ...prev, winnerAmount: 0 }));

//     setPressedWins((prev) => new Set([...prev, "winner"]));

//     setDivideCount((prev) => {
//       const newCount = prev + 1;
//       if (newCount >= 100) setDivider(0);
//       return newCount;
//     });

//     setWin(false);

//     saveAll();
//   };

//   /* ---------------- NEXT GAME + PROTECTION ---------------- */
//   const handleNextGame = async () => {
//     if (!fixture) return;

//     const allDeficits = {
//       winner: badGamesDeficit,
//       ...specialDeficits,
//     };

//     let bankDeduction = 0;
//     let baseStakeIncrease = 0;

//     Object.entries(allDeficits).forEach(([key, def]) => {
//       if (def >= 1000) {
//         const wanted = 900;
//         const canDeduct = Math.min(wanted, deficitBank - bankDeduction);

//         if (canDeduct > 0) {
//           bankDeduction += canDeduct;
//           if (key === "winner") {
//             setBadGamesDeficit((prev) => Math.max(0, prev - canDeduct));
//           } else {
//             setSpecialDeficits((prev) => ({
//               ...prev,
//               [key]: Math.max(0, prev[key] - canDeduct),
//             }));
//           }
//         }

//         const remaining = wanted - canDeduct;
//         if (remaining > 0) {
//           baseStakeIncrease += remaining;
//         }
//       }
//     });

//     if (bankDeduction > 0) {
//       setDeficitBank((prev) => Math.max(0, prev - bankDeduction));
//     }

//     if (baseStakeIncrease > 0) {
//       setBaseStake((prev) => prev + baseStakeIncrease);
//     }

//     setBadGameShadow(0);
//     setWin(false);
//     setPressedWins(new Set());

//     setPendingStakes({
//       winnerAmount: 0,
//       oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
//       ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
//     });

//     setFixture(null);
//     setInputA("");
//     setInputB("");

//     await saveAll();
//   };

//   const isButtonPressed = (key) => pressedWins.has(key);
//   const isGameLoaded = !!fixture;

//   return (
//     <div>
//       {/* ────────────── DESKTOP ────────────── */}
//       <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
//         <div className="text-center mb-10">
//           <div className="flex items-center justify-center gap-6 flex-wrap">
//             <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
//               Virtual Strategy
//             </h1>

//             <div className="flex gap-4">
//               <button
//                 onClick={fetchAll}
//                 className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-semibold text-lg rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border border-red-500/30 disabled:opacity-50"
//               >
//                 <FiRefreshCw className="w-5 h-5" />
//                 Reload Data
//               </button>

//               <button
//                 onClick={handleDividerReset}
//                 className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-700 to-purple-900 hover:from-purple-600 hover:to-purple-800 text-white font-semibold text-lg rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border border-purple-500/30"
//               >
//                 Divider Reset
//               </button>
//             </div>
//           </div>
//           <p className="text-red-400 mt-2">
//             {fixture ? "MATCH LOADED — 6-0 + SPECIALS" : "Ready"}
//           </p>
//         </div>

//         <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">
//           <div className="mb-8">
//             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
//               <button
//                 onClick={handleJackpot}
//                 disabled={!fixture || isButtonPressed("winner")}
//                 className={`py-6 rounded-2xl text-black font-extrabold transition ${
//                   isButtonPressed("winner") ? "bg-yellow-500" : "bg-yellow-400 hover:bg-yellow-300"
//                 } ${!fixture || isButtonPressed("winner") ? "opacity-50 cursor-not-allowed" : ""}`}
//               >
//                 6–0<br />({pendingStakes.winnerAmount || "–"})
//               </button>

//               {specialKeys.map((key) => (
//                 <button
//                   key={key}
//                   onClick={() => handleWin(key)}
//                   disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
//                   className={`py-6 rounded-2xl text-white font-extrabold transition ${
//                     isButtonPressed(key) ? "bg-yellow-500" : "bg-blue-600 hover:bg-blue-500"
//                   } ${!fixture || pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
//                 >
//                   {specialLabels[key]}<br />({pendingStakes[key] || "–"})
//                 </button>
//               ))}
//             </div>
//           </div>

//           <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-8">
//             <div className="flex items-center gap-4">
//               <input
//                 value={inputA}
//                 onChange={(e) => setInputA(e.target.value)}
//                 placeholder="home"
//                 className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg"
//               />
//               <span className="font-black text-3xl text-red-500">VS</span>
//               <input
//                 value={inputB}
//                 onChange={(e) => setInputB(e.target.value)}
//                 placeholder="away"
//                 className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg"
//               />
//             </div>

//             <div className="flex gap-4">
//               <button
//                 onClick={handleLoadGame}
//                 disabled={isGameLoaded}
//                 className={`px-10 py-4 text-white font-extrabold text-xl rounded-2xl transition shadow-lg ${
//                   isGameLoaded ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
//                 }`}
//               >
//                 LOAD GAME
//               </button>
//               <button
//                 onClick={handleNextGame}
//                 className="px-10 py-4 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xl rounded-2xl transition shadow-lg"
//               >
//                 NEXT GAME
//               </button>
//             </div>
//           </div>

//           <div className="mt-10 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
//             <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
//             <div>6-0 Hist: <strong className="text-yellow-600">{badGamesDeficit}</strong></div>
//             <div>Shadow: <strong className="text-orange-600">{badGameShadow}</strong></div>
//             <div>Bank: <strong className="text-cyan-600">{deficitBank}</strong></div>
//             <div>Divider: <strong className="text-purple-400">{divider}</strong></div>
//             <div>Count: <strong className="text-purple-400">{divideCount} / 100</strong></div>
//             <div>1X: <strong>{specialDeficits.oneX}</strong></div>
//             <div>2X: <strong>{specialDeficits.twoX}</strong></div>
//             <div>X2: <strong>{specialDeficits.x2}</strong></div>
//             <div>0G: <strong>{specialDeficits.zeroGoals}</strong></div>
//             <div>6G: <strong>{specialDeficits.sixGoals}</strong></div>
//             <div>HT12: <strong>{specialDeficits.ht12}</strong></div>
//             <div>HT21: <strong>{specialDeficits.ht21}</strong></div>
//             <div>HT30: <strong>{specialDeficits.ht30}</strong></div>
//             <div>FT40: <strong>{specialDeficits.ft40}</strong></div>
//             <div>FT41: <strong>{specialDeficits.ft41}</strong></div>
//           </div>
//         </div>
//       </div>

//       {/* ────────────── MOBILE ────────────── */}
//       <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4 flex flex-col overflow-x-hidden">
//         <div className="text-center mb-3">
//           <div className="flex items-center justify-center gap-3 flex-wrap">
//             <h1 className="text-2xl font-extrabold text-red-500">Virtual Strategy</h1>

//             <div className="flex gap-2">
//               <button
//                 onClick={fetchAll}
//                 className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-medium text-xs rounded-xl shadow transition active:scale-95 border border-red-500/30 disabled:opacity-50"
//               >
//                 Reload
//               </button>

//               <button
//                 onClick={handleDividerReset}
//                 className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-700 to-purple-900 hover:from-purple-600 hover:to-purple-800 text-white font-medium text-xs rounded-xl shadow transition active:scale-95 border border-purple-500/30"
//               >
//                 Reset Div
//               </button>
//             </div>
//           </div>
//           <p className="text-red-400 text-xs mt-1">
//             {fixture ? "LOADED — 6-0 + SPECIALS" : "Ready"}
//           </p>
//         </div>

//         <div className="mb-4 flex-grow min-h-0">
//           <div className="grid grid-cols-3 gap-2">
//             <button
//               onClick={handleJackpot}
//               disabled={!fixture || isButtonPressed("winner")}
//               className={`py-3 px-2 rounded-xl text-black font-bold text-xs transition active:scale-95 ${
//                 isButtonPressed("winner") ? "bg-yellow-500" : "bg-yellow-500 hover:bg-yellow-400"
//               } ${!fixture || isButtonPressed("winner") ? "opacity-50 cursor-not-allowed" : ""}`}
//             >
//               6–0<br />
//               <span className="text-[10px]">({pendingStakes.winnerAmount || "–"})</span>
//             </button>

//             {specialKeys.map((key) => (
//               <button
//                 key={key}
//                 onClick={() => handleWin(key)}
//                 disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
//                 className={`py-3 px-2 rounded-xl text-white font-bold text-xs transition active:scale-95 ${
//                   isButtonPressed(key) ? "bg-yellow-500" : "bg-blue-700 hover:bg-blue-600"
//                 } ${!fixture || pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
//               >
//                 {specialLabels[key]}<br />
//                 <span className="text-[10px]">({pendingStakes[key] || "–"})</span>
//               </button>
//             ))}
//           </div>
//         </div>

//         <div className="mb-4 space-y-3">
//           <div className="flex items-center justify-center gap-2 max-w-full">
//             <input
//               value={inputA}
//               onChange={(e) => setInputA(e.target.value)}
//               placeholder="Home"
//               className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400"
//             />
//             <span className="font-black text-lg text-red-500 shrink-0">VS</span>
//             <input
//               value={inputB}
//               onChange={(e) => setInputB(e.target.value)}
//               placeholder="Away"
//               className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400"
//             />
//           </div>

//           <div className="flex gap-2">
//             <button
//               onClick={handleLoadGame}
//               disabled={isGameLoaded}
//               className={`flex-1 py-3 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm ${
//                 isGameLoaded ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-red-700 hover:bg-red-600"
//               }`}
//             >
//               LOAD
//             </button>
//             <button
//               onClick={handleNextGame}
//               className="flex-1 py-3 bg-green-700 hover:bg-green-600 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm"
//             >
//               NEXT
//             </button>
//           </div>
//         </div>

//         <div className="flex-grow min-h-0 overflow-auto bg-black/20 rounded-xl p-3 text-xs grid grid-cols-3 gap-2">
//           <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
//           <div>6-0: <strong className="text-yellow-400">{badGamesDeficit}</strong></div>
//           <div>Shdw: <strong className="text-orange-400">{badGameShadow}</strong></div>
//           <div>Bank: <strong className="text-cyan-400">{deficitBank}</strong></div>
//           <div>Div: <strong className="text-purple-400">{divider}</strong></div>
//           <div>Cnt: <strong className="text-purple-400">{divideCount}/100</strong></div>

//           <div className="col-span-3 grid grid-cols-5 gap-1 text-[10px] text-center">
//             <div>1X: {specialDeficits.oneX}</div>
//             <div>2X: {specialDeficits.twoX}</div>
//             <div>X2: {specialDeficits.x2}</div>
//             <div>0G: {specialDeficits.zeroGoals}</div>
//             <div>6G: {specialDeficits.sixGoals}</div>
//             <div>HT12: {specialDeficits.ht12}</div>
//             <div>HT21: {specialDeficits.ht21}</div>
//             <div>HT30: {specialDeficits.ht30}</div>
//             <div>FT40: {specialDeficits.ft40}</div>
//             <div>FT41: {specialDeficits.ft41}</div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Homepage;