import React, { useState, useEffect, } from "react";
import { odds } from "./Scores";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  const [fixture, setFixture] = useState(null);
  const [jackpot, setJackpot] = useState(false);

  const [bigDeficit, setBigDeficit] = useState(0);
  const [mediumDeficit, setMediumDeficit] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
 const [bigDeficitShadow, setBigDeficitShadow] = useState(0);
  const [mediumDeficitShadow, setMediumDeficitShadow] = useState(0);
  const [smallDeficitShadow, setSmallDeficitShadow] = useState(0);

  // Accumulates all small stakes every game
  const [smallPrivateDeficit, setSmallPrivateDeficit] = useState(0);

  const [pendingStakes, setPendingStakes] = useState({
    oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0,     // Big
    x1: 0, ht11: 0, ft11: 0, O45: 0,                 // Medium
    wingg: 0, htgg: 0, fourGoals: 0,                 // Small
  });

  const [pressedWins, setPressedWins] = useState(new Set());

  // No winner button anymore
  const allKeys = ["oneX", "twoX", "zeroGoals", "sixGoals", "x1", "ht11", "ft11", "O45", "wingg", "htgg", "fourGoals"];

  const labels = {
    oneX: "1X", twoX: "2X", zeroGoals: "0 GOALS", sixGoals: "6 GOALS",
    x1: "X1", ht11: "HT 1-1", ft11: "FT 1-1", O45: "O45",
    wingg: "Win GG", htgg: "HT GG", fourGoals: "4 Goals",
  };
useEffect(()=>{
  setBigDeficit(400)
},[])

  /* ---------------- LOAD GAME ---------------- */
//   const handleLoadGame = (e) => {
//     e.preventDefault();

//     const home = sanitizeTeam(inputA) || "che";
//     const away = sanitizeTeam(inputB) || "che";

//     const found = odds.find((o) => o.home === home && o.away === away);
//     if (!found) {
//       alert(`No odds for ${home} vs ${away}`);
//       return;
//     }

//     setFixture(found);
//     setPressedWins(new Set());

//     const newPending = {};

//     ["oneX", "twoX", "zeroGoals", "sixGoals"].forEach((key) => {
//       const odd = found[key] || 0;
//       let stake = odd > 1.01 ? Math.round(bigDeficit / odd) : 0;
//       newPending[key] = Math.max(stake, 10);
//     });
//  // Big stakes total always added to Medium Deficit
//     const bigStakesTotal = ["oneX", "twoX", "zeroGoals", "sixGoals"].reduce(
//       (sum, key) => sum + (newPending[key] || 0), 0
//     );
//     setBigDeficitShadow(bigDeficit)
//     setMediumDeficit((prev) => prev + bigStakesTotal);
//     setMediumDeficitShadow(mediumDeficit);

//     ["x1", "ht11", "ft11", "O45"].forEach((key) => {
//       const odd = found[key] || 0;
//       let stake = odd > 1.01 ? Math.round(mediumDeficit / odd) : 0;
//       newPending[key] = Math.max(stake, 10);
//     });
// // Medium stakes total always added to Medium Deficit
//     const mediumStakesTotal = ["x1", "ht11", "ft11", "O45"].reduce(
//       (sum, key) => sum + (newPending[key] || 0), 0
//     );
//     setSmallDeficit((prev) => prev + mediumStakesTotal);
//     setSmallDeficitShadow(smallDeficit);
//     ["wingg", "htgg", "fourGoals"].forEach((key) => {
//       const odd = found[key] || 0;
//       let stake = odd > 1.01 ? Math.round(smallDeficit / (odd - 1)) : 0;
//       newPending[key] = Math.max(stake, 10);
//     });
//     setPendingStakes(newPending);

   

//     // Small stakes total added to smallPrivateDeficit
//     const smallStakesTotal = ["wingg", "htgg", "fourGoals"].reduce(
//       (sum, key) => sum + (newPending[key] || 0), 0
//     );
//     setSmallPrivateDeficit((prev) => prev + smallStakesTotal);
//   };
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

    const newPending = {};

    // 1. Big stakes: bigDeficit / odd (no -1)
    ["oneX", "twoX", "zeroGoals", "sixGoals"].forEach((key) => {
      const odd = found[key] || 0;
      let stake = odd > 1.01 ? Math.round(bigDeficit / odd) : 0;
      newPending[key] = Math.max(stake, 10);
    });

    // Big stakes total → Medium Deficit
    const bigStakesTotal = ["oneX", "twoX", "zeroGoals", "sixGoals"].reduce(
      (sum, key) => sum + (newPending[key] || 0), 0
    );
    const newMedium = mediumDeficit + bigStakesTotal;
    setMediumDeficit(newMedium);

    // 2. Medium stakes: newMedium / odd (no -1)
    ["x1", "ht11", "ft11", "O45"].forEach((key) => {
      const odd = found[key] || 0;
      let stake = odd > 1.01 ? Math.round(newMedium / odd) : 0;
      newPending[key] = Math.max(stake, 10);
    });

    // Medium stakes total → Small Deficit
    const mediumStakesTotal = ["x1", "ht11", "ft11", "O45"].reduce(
      (sum, key) => sum + (newPending[key] || 0), 0
    );
    const newSmall = smallDeficit + mediumStakesTotal;
    setSmallDeficit(newSmall);

    // 3. Small stakes: newSmall / (odd - 1)
    ["wingg", "htgg", "fourGoals"].forEach((key) => {
      const odd = found[key] || 0;
      let stake = odd > 1.01 ? Math.round(newSmall / (odd - 1)) : 0;
      newPending[key] = Math.max(stake, 10);   // lower min for small if you want, or remove
    });

    setPendingStakes(newPending);

    // Small stakes total → smallPrivateDeficit
    const smallStakesTotal = ["wingg", "htgg", "fourGoals"].reduce(
      (sum, key) => sum + (newPending[key] || 0), 0
    );
    setSmallPrivateDeficit((prev) => prev + smallStakesTotal);

    // Update shadows
    setBigDeficitShadow(bigDeficit);
    setMediumDeficitShadow(newMedium);
    setSmallDeficitShadow(newSmall);
  };
  /* ---------------- WIN HANDLER ---------------- */
  const handleWin = (type) => {
    if (!fixture) return;
    const stake = pendingStakes[type];
    if (stake <= 0) return;

    setPressedWins((prev) => new Set([...prev, type]));

    // Big win → clear bigDeficit
    if (["oneX", "twoX", "zeroGoals", "sixGoals"].includes(type)) {
      setJackpot(true)
      if(bigDeficit > 400){
      setBigDeficit(400);
      }else if(jackpot === true){
        if(smallPrivateDeficit >= bigDeficitShadow ){
          setSmallPrivateDeficit((prev) => Math.max(0, prev - bigDeficitShadow))
        }else{
        const residue = bigDeficitShadow - smallPrivateDeficit
        setSmallPrivateDeficit(0)
        if(smallDeficit >= residue){
          setSmallDeficit((prev) => Math.max(0, prev - residue))
        }else{
          const smallResidue = residue - smallDeficit
          setSmallDeficit(0)
          if(mediumDeficit >= smallResidue){
          setMediumDeficit((prev) => Math.max(0, prev - smallResidue))
        }else{
          setSmallDeficit(0)
        }
        }
        }
      }
    } 
    // Medium win → clear mediumDeficit
    else if (["x1", "ht11", "ft11", "O45"].includes(type)) {
       if(mediumDeficit > 0){
      setMediumDeficit(0);
      }else{
        if(smallPrivateDeficit >= mediumDeficitShadow ){
          setSmallPrivateDeficit((prev) => Math.max(0, prev - mediumDeficitShadow))
        }else{
        const residue = mediumDeficitShadow - smallPrivateDeficit
        setSmallPrivateDeficit(0)
        if(smallDeficit >= residue){
          setSmallDeficit((prev) => Math.max(0, prev - residue))
        }else{
          const smallResidue = residue - smallDeficit
          setSmallDeficit(0)
          if(bigDeficit >= smallResidue){
          setBigDeficit((prev) => Math.max(0, prev - smallResidue))
        }else{
          setBigDeficit(0)
        }
        }
        }
      }
    } 
    // Small win → subtract only this stake from smallPrivateDeficit + wipe smallDeficit
    else if (["wingg", "htgg", "fourGoals"].includes(type)) {
  if(smallDeficit > 0){
      setSmallDeficit(0);
      setSmallPrivateDeficit((prev) => Math.max(0, prev - stake));
      setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
      }else{
        if(smallPrivateDeficit >= smallDeficitShadow ){
          setSmallPrivateDeficit((prev) => Math.max(0, prev - smallDeficitShadow - stake))
          setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
        }else{
        const residue = smallDeficitShadow - smallPrivateDeficit
        setSmallPrivateDeficit(0)
        setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
        if(mediumDeficit >= residue){
          setMediumDeficit((prev) => Math.max(0, prev - residue))
        }else{
          const smallResidue = residue - mediumDeficit
          setMediumDeficit(0)
          if(bigDeficit >= smallResidue){
          setBigDeficit((prev) => Math.max(0, prev - smallResidue))
        }else{
          setBigDeficit(0)
        }
        }
        }
      }
    }
  };

  /* ---------------- NEXT GAME ---------------- */
  const handleNextGame = () => {
    if (!fixture) return;

    setPendingStakes({
      oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0,
      x1: 0, ht11: 0, ft11: 0, O45: 0,
      wingg: 0, htgg: 0, fourGoals: 0,
    });
    if(jackpot ){
      setBigDeficit(400 + smallPrivateDeficit)
      setSmallPrivateDeficit(0)
      setJackpot(false)
    }else if(bigDeficit < 400){
      setBigDeficit(400)
    }
    setFixture(null);
    setInputA("");
    setInputB("");
    setPressedWins(new Set());
  };

  const isButtonPressed = (key) => pressedWins.has(key);
  const isGameLoaded = !!fixture;

  return (
    <div>
      {/* Desktop */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
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

          <div className="mb-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {allKeys.map((key) => (
              <button
                key={key}
                onClick={() => handleWin(key)}
                disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                className={`py-6 rounded-2xl font-extrabold transition text-white ${
                  isButtonPressed(key) ? "bg-yellow-500" 
                  : "bg-blue-600 hover:bg-blue-500"
                } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50" : ""}`}
              >
                {labels[key]}<br />
                <span className="text-sm">({pendingStakes[key] || "–"})</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Big Deficit: <strong className="text-red-600">{bigDeficit}</strong></div>
            <div>Medium Deficit: <strong className="text-orange-600">{mediumDeficit}</strong></div>
            <div>Small Deficit: <strong className="text-purple-600">{smallDeficit}</strong></div>
            <div>Small Private: <strong className="text-purple-600">{smallPrivateDeficit}</strong></div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4">
        <div className="text-center mb-3">
          <h1 className="text-2xl font-extrabold text-red-500">4 Deficits</h1>
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-center gap-2">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="Home"
              className="flex-1 max-w-[110px] px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white"
            />
            <span className="font-black text-lg text-red-500">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="Away"
              className="flex-1 max-w-[110px] px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white"
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
                isButtonPressed(key) ? "bg-yellow-500" 
                : "bg-blue-700 text-white"
              } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {labels[key]}<br />
              <span className="text-[10px]">({pendingStakes[key] || "–"})</span>
            </button>
          ))}
        </div>

        <div className="flex-grow min-h-0 overflow-auto bg-black/20 rounded-xl p-3 text-xs grid grid-cols-2 gap-2">
          <div>Big: <strong className="text-red-400">{bigDeficit}</strong></div>
          <div>Medium: <strong className="text-orange-400">{mediumDeficit}</strong></div>
          <div>Small: <strong className="text-purple-400">{smallDeficit}</strong></div>
          <div>Private: <strong className="text-purple-400">{smallPrivateDeficit}</strong></div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
