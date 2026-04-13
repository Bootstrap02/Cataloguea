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
  const [isReloading, setIsReloading] = useState(false);
  const [baseStake, setBaseStake] = useState(10000);
  const baseRef = useRef(10000);
  const [baseDivider, setBaseDivider] = useState(0); 

  

  const [deficitBank, setDeficitBank] = useState(2000);
  const [assetTargets, setAssetTargets] = useState({
  oneX: 200, twoX: 200, x2: 200, zeroGoals: 200, sixGoals: 200,
  ht12: 200, ht21: 200, ht30: 200, ft40: 200, ft41: 200,
});


  const [specialDeficits, setSpecialDeficits] = useState({
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  const [specialBigDeficits, setSpecialBigDeficits] = useState({
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
    setBaseDivider(baseStake / 50)
  }, [baseStake]);

const fetchAll = async () => {
   setIsReloading(true); // start spinning
  try {
    const res = await axios.get(API_BASE);
    const data = res.data || {};

    setBaseStake(data.base ?? 10000);
    setDeficitBank(data.deficitBank ?? 0);

    // Load the 10 targets
    setAssetTargets({
      oneX: data.oneXTarget ?? 200,
      twoX: data.twoXTarget ?? 200,
      x2: data.xTwoTarget ?? 200,
      zeroGoals: data.zeroGoalsTarget ?? 200,
      sixGoals: data.sixGoalsTarget ?? 200,
      ht12: data.htOneTwoTarget ?? 200,
      ht21: data.htTwoOneTarget ?? 200,
      ht30: data.htThreeZeroTarget ?? 200,
      ft40: data.ftFourZeroTarget ?? 200,
      ft41: data.ftFourOneTarget ?? 200,
    });

    setSpecialDeficits({
      oneX: data.oneXDeficit ?? 0,
      twoX: data.twoXDeficit ?? 0,
      x2: data.xTwoDeficit ?? 0,
      zeroGoals: data.zeroGoalsDeficit ?? 0,
      sixGoals: data.sixGoalsDeficit ?? 0,
      ht12: data.htOneTwoDeficit ?? 0,
      ht21: data.htTwoOneDeficit ?? 0,
      ht30: data.htThreeZeroDeficit ?? 0,
      ft40: data.ftFourZeroDeficit ?? 0,
      ft41: data.ftFourOneDeficit ?? 0,
    });

    setSpecialBigDeficits({
      oneX: data.oneXBigDeficit ?? 0,
      twoX: data.twoXBigDeficit ?? 0,
      x2: data.xTwoBigDeficit ?? 0,
      zeroGoals: data.zeroGoalsBigDeficit ?? 0,
      sixGoals: data.sixGoalsBigDeficit ?? 0,
      ht12: data.htOneTwoBigDeficit ?? 0,
      ht21: data.htTwoOneBigDeficit ?? 0,
      ht30: data.htThreeZeroBigDeficit ?? 0,
      ft40: data.ftFourZeroBigDeficit ?? 0,
      ft41: data.ftFourOneBigDeficit ?? 0,
    });
    setBaseDivider(baseStake / 50)
    setPressedWins(new Set());
  } catch (err) {
    console.error("❌ Load failed:", err.message);
  } finally {
    setIsReloading(false); // stop spinning
  }
};

const saveAll = async () => {
  try {
    const payload = {
      base: Math.max(10000, baseRef.current),
      deficitBank,

      // 10 Targets
      oneXTarget: assetTargets.oneX,
      twoXTarget: assetTargets.twoX,
      xTwoTarget: assetTargets.x2,
      zeroGoalsTarget: assetTargets.zeroGoals,
      sixGoalsTarget: assetTargets.sixGoals,
      htOneTwoTarget: assetTargets.ht12,
      htTwoOneTarget: assetTargets.ht21,
      htThreeZeroTarget: assetTargets.ht30,
      ftFourZeroTarget: assetTargets.ft40,
      ftFourOneTarget: assetTargets.ft41,

      // 10 Deficits
      oneXDeficit: specialDeficits.oneX,
      twoXDeficit: specialDeficits.twoX,
      xTwoDeficit: specialDeficits.x2,
      zeroGoalsDeficit: specialDeficits.zeroGoals,
      sixGoalsDeficit: specialDeficits.sixGoals,
      htOneTwoDeficit: specialDeficits.ht12,
      htTwoOneDeficit: specialDeficits.ht21,
      htThreeZeroDeficit: specialDeficits.ht30,
      ftFourZeroDeficit: specialDeficits.ft40,
      ftFourOneDeficit: specialDeficits.ft41,

      // 10 Deficits
      oneXBigDeficit: specialBigDeficits.oneX,
      twoXBigDeficit: specialBigDeficits.twoX,
      xTwoBigDeficit: specialBigDeficits.x2,
      zeroGoalsBigDeficit: specialBigDeficits.zeroGoals,
      sixGoalsBigDeficit: specialBigDeficits.sixGoals,
      htOneTwoBigDeficit: specialBigDeficits.ht12,
      htTwoOneBigDeficit: specialBigDeficits.ht21,
      htThreeZeroBigDeficit: specialBigDeficits.ht30,
      ftFourZeroBigDeficit: specialBigDeficits.ft40,
      ftFourOneBigDeficit: specialBigDeficits.ft41,
    };

    await axios.put(API_BASE, payload);
    console.log("✅ Saved successfully");
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  }
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

  const newBase = baseStake;
  setFixture(found);
  setPressedWins(new Set());

  let winnerAmount = Math.round(newBase / (found.winner)) || 10;
  winnerAmount = Math.max(winnerAmount, 10);

  const targetPerAsset = Math.floor(winnerAmount / 10);

  // Step 1: Update targets
  setAssetTargets((prev) => {
    const updatedTargets = {
      oneX: prev.oneX + targetPerAsset,
      twoX: prev.twoX + targetPerAsset,
      x2: prev.x2 + targetPerAsset,
      zeroGoals: prev.zeroGoals + targetPerAsset,
      sixGoals: prev.sixGoals + targetPerAsset,
      ht12: prev.ht12 + targetPerAsset,
      ht21: prev.ht21 + targetPerAsset,
      ht30: prev.ht30 + targetPerAsset,
      ft40: prev.ft40 + targetPerAsset,
      ft41: prev.ft41 + targetPerAsset,
    };

    return updatedTargets;
  });

  // Step 2: Calculate stakes and update deficits + pending in one go
  setSpecialDeficits((prevDeficits) => {
    const calcStake = (target, odd) => {
      if (odd <= 1.01) return 0;
      let stake = Math.round(target / (odd - 1));
      return Math.max(stake, 10);
    };

    const newPending = { winnerAmount };

    const updatedDeficits = { ...prevDeficits };

    specialKeys.forEach((key) => {
      const odd = found[key] || 0;
      const currentTarget = (assetTargets[key] || 0) + targetPerAsset; // use the new target
      const totalForThisAsset = currentTarget + (prevDeficits[key] || 0);

      const stake = calcStake(totalForThisAsset, odd);
      newPending[key] = stake;

      // Push the calculated stake into the deficit
      updatedDeficits[key] = (prevDeficits[key] || 0) + stake;
    });

    setPendingStakes(newPending);

    return updatedDeficits;
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
      [type]: 0,
    }));
    setPendingStakes((prev) => ({ ...prev, [type]: 0 }));

    // Mark this button as pressed
    setPressedWins((prev) => new Set([...prev, type]));    
    setSpecialDeficits((prev) => ({ ...prev, [type]: 0 }));
    setAssetTargets((prev) => ({ ...prev, [type]: baseDivider }));
    
      setDeficitBank((prev) => prev + baseDivider );

  };

  /* ---------------- 6-0 JACKPOT ---------------- */
  const handleJackpot = () => {
    if (!fixture) return;
    // Reset base stake
    setBaseStake(10000);

    setPendingStakes((prev) => ({ ...prev, winnerAmount: 0 }));

    // Mark jackpot button pressed
    setPressedWins((prev) => new Set([...prev, "winner"]));

  };
// /* ---------------- NEXT GAME ---------------- */
// const handleNextGame = async () => {
//   if (!fixture) return;
//   const divider = baseStake / 10
//   // Process each private deficit
//   setSpecialDeficits((prev) => {
//     const updated = { ...prev };
//     let remainingBank = deficitBank;
//     let baseIncrease = 0;

//     specialKeys.forEach((key) => {
//       let def = updated[key] || 0;

//       if (def >= divider) {
//         if (remainingBank >= def) {
//           // Bank can cover the full deficit
//           const deal = remainingBank + baseDivider
//           deal -= def;
//           updated[key] = baseDivider;                    // reset to 100
//         } else {
//           // Bank is not enough
//           const coveredByBank = remainingBank;
//           const remainder = def - coveredByBank;
//           remainingBank = 0;
//           const secondDeal = baseIncrease - baseDivider
//           secondDeal += remainder;
//           updated[key] = baseDivider;                    // reset to 100
//         }
//       }
//     });

//     // Apply bank and base changes
//     if (remainingBank !== deficitBank) {
//       setDeficitBank(remainingBank);
//     }
//     if (baseIncrease > 0) {
//       setBaseStake((prev) => prev + baseIncrease);
//     }

//     return updated;
//   });

//   // Simple cleanup
//   setPressedWins(new Set());
//   setBaseDivider(baseStake / 50)
//   setPendingStakes({
//     winnerAmount: 0,
//     oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
//     ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
//   });

//   setFixture(null);
//   setInputA("");
//   setInputB("");

//   await saveAll();
// };
/* ---------------- NEXT GAME ---------------- */
const handleNextGame = async () => {
  if (!fixture) return;

  const divider = baseStake / 10;

  // Process each private deficit
  setSpecialDeficits((prev) => {
    const updated = { ...prev };
    let remainingBank = deficitBank;
    let baseIncrease = 0;

    specialKeys.forEach((key) => {
      let def = updated[key] || 0;

      if (def >= divider) {
        if (remainingBank >= def) {
          // Bank can cover the full deficit
          remainingBank -= def;
          updated[key] = baseDivider;                    // reset to 100
        } else {
          // Bank is not enough
          const coveredByBank = remainingBank;
          const remainder = def - coveredByBank;
          remainingBank = 0;
          baseIncrease += remainder;
          updated[key] = baseDivider;                    // reset to 100
        }
      }
    });

    // Apply bank and base changes
    if (remainingBank !== deficitBank) {
      setDeficitBank(remainingBank);
    }
    if (baseIncrease > 0) {
      setBaseStake((prev) => prev + baseIncrease);
    }

    return updated;
  });

  // Simple cleanup
  setPressedWins(new Set());
  setBaseDivider(baseStake / 50);
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
  disabled={isReloading}
  className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-bold text-xl rounded-2xl shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 border border-red-500/30 disabled:opacity-50"
>
  <FiRefreshCw
    className={`w-6 h-6 ${isReloading ? "animate-spin" : ""}`}
  />
  {isReloading ? "Reloading..." : "Reload Data"}
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
            <div>Bank: <strong className="text-cyan-600">{deficitBank}</strong></div>
            {specialKeys.map((key) => (
    <div key={key}>
      {specialLabels[key]} Tag<strong className="text-purple-600">(Def)</strong>: {assetTargets[key]}<strong className="text-purple-600">({specialDeficits[key]})</strong><br />
    </div>
  ))}
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
  disabled={isReloading}
  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-700 to-red-900 text-white font-semibold text-sm rounded-xl shadow transition active:scale-95 border border-red-500/30 disabled:opacity-50"
>
  <FiRefreshCw
    className={`w-4 h-4 ${isReloading ? "animate-spin" : ""}`}
  />
  {isReloading ? "..." : "Reload"}
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
          <div>Bank: <strong className="text-cyan-400">{deficitBank}</strong></div>

          <div className="col-span-3 grid grid-cols-5 gap-1 text-[10px] text-center">
            {specialKeys.map((key) => (
    <div key={key}>
      {specialLabels[key]} Tag<strong className="text-purple-600">(Def)</strong>: {assetTargets[key]}<strong className="text-purple-600">({specialDeficits[key]})</strong><br />

    </div>
  ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
