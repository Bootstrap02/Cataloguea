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

  const [bigDeficit, setBigDeficit] = useState(0);
  const [bigShadow, setBigShadow] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [smallShadow, setSmallShadow] = useState(0);
  const [isReloading, setIsReloading] = useState(false);

  const [privateDeficits, setPrivateDeficits] = useState({
    oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
  });
  const [privateTotal, setPrivateTotal] = useState(0);

  const [pendingStakes, setPendingStakes] = useState({
    winner: 0,
    ht12: 0, x2: 0, ht30: 0, ft40: 0, ft41: 0,
    oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
  });

  const [pressedWins, setPressedWins] = useState(new Set());

  const bigGameKeys = ["ht12", "x2", "ht30", "ft40", "ft41"];
  const smallGameKeys = ["oneX", "twoX", "zeroGoals", "sixGoals", "ht21"];

  const allKeys = ["winner", ...bigGameKeys, ...smallGameKeys];

  const labels = {
    winner: "6–0",
    ht12: "HT 1-2", x2: "X2", ht30: "HT 3-0", ft40: "FT 4-0", ft41: "FT 4-1",
    oneX: "1X", twoX: "2X", zeroGoals: "0 GOALS", sixGoals: "6 GOALS", ht21: "HT 2-1",
  };

  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

/* ---------------- LOAD / SAVE - FULLY MATCHING YOUR BACKEND ---------------- */
const fetchAll = async () => {
  try {
    const res = await axios.get(API_BASE);
    const data = res.data || {};
    console.log("Fetched data:", data);   // ← Helpful for debugging

    setBaseStake(data.base ?? 10000);

    setBigDeficit(data.bigDeficit ?? 0);
    setSmallDeficit(data.smallDeficit ?? 0);

    // Shadows
    setBigShadow(data.badGameShadow ?? 0);
    setSmallShadow(data.deficitBank ?? 0);

    // Private deficits (using exact field names from your schema)
    setPrivateDeficits({
      oneX: data.oneXDeficit ?? 0,
      twoX: data.twoXDeficit ?? 0,
      zeroGoals: data.zeroGoalsDeficit ?? 0,
      sixGoals: data.sixGoalsDeficit ?? 0,
      ht21: data.htTwoOneDeficit ?? 0,
    });

    setPrivateTotal(data.privateTotal ?? 0);

    setPressedWins(new Set());
  } catch (err) {
    console.error("❌ Load failed:", err.message);
  }
};

const saveAll = async () => {
  try {
    const payload = {
      base: Math.max(10000, baseRef.current),

      bigDeficit: bigDeficit,
      smallDeficit: smallDeficit,

      // Private deficits - exact field names from your schema
      oneXDeficit: privateDeficits.oneX,
      twoXDeficit: privateDeficits.twoX,
      zeroGoalsDeficit: privateDeficits.zeroGoals,
      sixGoalsDeficit: privateDeficits.sixGoals,
      htTwoOneDeficit: privateDeficits.ht21,
      privateTotal: privateTotal,
    };

    await axios.put(API_BASE, payload);
    alert("✅ Saved payload:");
    console.log("✅ Saved payload:", payload);
  } catch (err) {
    alert("❌ Save failed:");
    console.log("❌ Save failed:", err.message);
  }
};

/* ---------------- RELOAD WITH PROPER LOADING ---------------- */
const handleReload = async () => {
  setIsReloading(true);
  try {
    await fetchAll();        // Wait for full data to load
  } catch (err) {
    console.error("Reload failed", err);
  } finally {
    setIsReloading(false);
  }
};  
useEffect(() => { fetchAll(); }, []);

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

    let winnerStake = Math.round(baseStake / found.winner);
    winnerStake = Math.max(winnerStake, 10);

    const newBig = bigDeficit + winnerStake;
    setBigDeficit(newBig);
    setBigShadow(newBig);

    const newPending = { winner: winnerStake };

    bigGameKeys.forEach((key) => {
      const odd = found[key] || 0;
      let stake = odd > 1.01 ? Math.round(newBig / odd) : 0;
      newPending[key] = Math.max(stake, 10);
    });

    const bigStakesTotal = bigGameKeys.reduce((sum, key) => sum + (newPending[key] || 0), 0);
    const newSmall = smallDeficit + bigStakesTotal;
    setSmallDeficit(newSmall);
    setSmallShadow(newSmall);

    // smallGameKeys.forEach((key) => {
    //   const odd = found[key] || 0;
    //   let stake = odd > 1.01 ? Math.round(newSmall / (odd - 1)) : 0;
    //   newPending[key] = Math.max(stake, 10);

    //   setPrivateDeficits((prev) => ({
    //     ...prev,
    //     [key]: (prev[key] || 0) + newPending[key],
    //   }));
    // });
smallGameKeys.forEach((key) => {
  const odd = found[key] || 0;
  
  // Combine smallDeficit + this asset's private deficit
  const target = newSmall + (privateDeficits[key] || 0);
  
  let stake = odd > 1.01 ? Math.round(target / (odd - 1)) : 0;
  newPending[key] = Math.max(stake, 10);

  // Update private deficit history
  setPrivateDeficits((prev) => ({
    ...prev,
    [key]: (prev[key] || 0) + newPending[key],
  }));
});
    setPendingStakes(newPending);

    // Update privateTotal
    const updatedPrivateTotal = smallGameKeys.reduce((sum, key) => 
      sum + ((privateDeficits[key] || 0) + (newPending[key] || 0)), 0
    );
    setPrivateTotal(updatedPrivateTotal);

  };

  /* ---------------- WIN HANDLER - FIXED ---------------- */
  const handleWin = (type) => {
    if (!fixture) return;
    const stake = pendingStakes[type];
    if (stake <= 0) return;

    setPressedWins((prev) => new Set([...prev, type]));

    if (type === "winner") {
      console.log("Jackpot!!");
      return;
    }

    if (bigGameKeys.includes(type)) {
      if (bigDeficit > 0) {
        setBigDeficit(0);
      } else {
        if (bigShadow > privateTotal) {
          const residue = bigShadow - privateTotal
          setPrivateTotal(0);
          if(smallDeficit > residue){
            setSmallDeficit((prev) => Math.max(0, prev - residue));
          }else {
              setSmallDeficit(0)
          }
        } else {
          setPrivateTotal((prev) => Math.max(0, prev - bigShadow));
        }
      }
    } 
    else if (smallGameKeys.includes(type)) {
      if (smallDeficit > 0) {
        setSmallDeficit(0);
        setPrivateDeficits((prev) => ({ ...prev, [type]: 0 }));
        setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
        setPrivateTotal((prev) => Math.max(0, prev - (privateDeficits[type] || 0)));
      } else {
         if (smallShadow > bigDeficit) {
          const residue = smallShadow - bigDeficit
          setBigDeficit(0);
          setPrivateDeficits((prev) => ({ ...prev, [type]: 0 }));
          setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
          setPrivateTotal((prev) => Math.max(0, prev - (privateDeficits[type] || 0)));
          if(privateTotal > residue){
           const newPrivateTotal=  Math.max(0, privateTotal - residue)
           const newValuePerAsset = Math.floor(newPrivateTotal / 5);
        setPrivateDeficits({
          oneX: newValuePerAsset,
          twoX: newValuePerAsset,
          zeroGoals: newValuePerAsset,
          sixGoals: newValuePerAsset,
          ht21: newValuePerAsset,
        });

        setPrivateTotal(newPrivateTotal);
          }else{
            setPrivateTotal(0)
             setPrivateDeficits({
        oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
      });
          }
        } else {
         setBigDeficit((prev) => Math.max(0, prev - smallShadow));
          setPrivateDeficits((prev) => ({ ...prev, [type]: 0 }));
          setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
          setPrivateTotal((prev) => Math.max(0, prev - (privateDeficits[type] || 0)));
        }
      }
    }
  };

  /* ---------------- NEXT GAME ---------------- */
  const handleNextGame = async () => {
    if (!fixture) return;

    setPendingStakes({
      winner: 0, ht12: 0, x2: 0, ht30: 0, ft40: 0, ft41: 0,
      oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
    });

    if (bigDeficit <= 0) {
      setPrivateDeficits({
        oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
      });
      setBigDeficit(privateTotal);
      setBigShadow(privateTotal);
      setPrivateTotal(0);
    }

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
      {/* Compact Desktop */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-red-500">Two Deficit Strategy</h1>
            <button 
  onClick={handleReload} 
  disabled={isReloading}
  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-xl font-medium text-sm transition"
>
  <FiRefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} /> 
  {isReloading ? "Reloading..." : "Reload"}
</button>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/10">
            <div className="flex justify-center gap-4 mb-6">
              <input 
                value={inputA} 
                onChange={(e) => setInputA(e.target.value)} 
                placeholder="Home" 
                className="w-28 px-4 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
              />
              <span className="self-center text-2xl text-red-500 font-black">VS</span>
              <input 
                value={inputB} 
                onChange={(e) => setInputB(e.target.value)} 
                placeholder="Away" 
                className="w-28 px-4 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
              />
            </div>

            <div className="flex justify-center gap-3 mb-8">
              <button 
                onClick={handleLoadGame} 
                disabled={isGameLoaded} 
                className={`px-8 py-3 text-white font-bold rounded-2xl transition text-sm ${isGameLoaded ? "bg-gray-600" : "bg-red-600 hover:bg-red-700"}`}
              >
                LOAD GAME
              </button>
              <button 
                onClick={handleNextGame} 
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl text-sm transition"
              >
                NEXT GAME
              </button>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-8">
              {allKeys.map((key) => (
                <button 
                  key={key}
                  onClick={() => handleWin(key)}
                  disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                  className={`py-4 rounded-2xl font-medium text-xs transition ${
                    isButtonPressed(key) ? "bg-yellow-500 text-black"
                    : key === "winner" ? "bg-yellow-400 text-black"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                  } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50" : ""}`}
                >
                  {labels[key]}<br />
                  <span className="text-[10px]">({pendingStakes[key] || "–"})</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs bg-black/30 p-5 rounded-2xl">
              <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
              <div>Big Def: <strong className="text-red-400">{bigDeficit}</strong> (S: {bigShadow})</div>
              <div>Small Def: <strong className="text-purple-400">{smallDeficit}</strong> (S: {smallShadow})</div>
              <div>Private Tot: <strong className="text-orange-400">{privateTotal}</strong></div>

              {smallGameKeys.map((key) => (
                <div key={key} className="col-span-2 md:col-span-1">
                  {labels[key]}: <strong>{privateDeficits[key] || 0}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile */}
      {/* <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-red-500">Two Deficit</h1>
          <button onClick={handleReload} className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm">
            <FiRefreshCw className="inline mr-1" /> Reload
          </button>
        </div>

        <div className="flex gap-3 mb-6 justify-center">
          <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home" className="flex-1 px-4 py-3 border border-red-600 bg-transparent rounded-2xl text-center text-sm" />
          <span className="self-center text-xl text-red-500 font-black">VS</span>
          <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away" className="flex-1 px-4 py-3 border border-red-600 bg-transparent rounded-2xl text-center text-sm" />
        </div>

        <div className="flex gap-3 mb-8">
          <button onClick={handleLoadGame} disabled={isGameLoaded} className={`flex-1 py-3 font-bold rounded-2xl text-sm ${isGameLoaded ? "bg-gray-600" : "bg-red-600 hover:bg-red-700"}`}>LOAD</button>
          <button onClick={handleNextGame} className="flex-1 py-3 bg-green-600 hover:bg-green-700 font-bold rounded-2xl text-sm">NEXT</button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {allKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleWin(key)}
              disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
              className={`py-5 rounded-2xl font-medium text-sm transition ${
                isButtonPressed(key) ? "bg-yellow-500 text-black" 
                : key === "winner" ? "bg-yellow-400 text-black" 
                : "bg-blue-600 text-white"
              } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50" : ""}`}
            >
              {labels[key]}<br />
              <span className="text-xs">({pendingStakes[key] || "–"})</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs bg-black/30 p-5 rounded-3xl">
          <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
          <div>Big: <strong className="text-red-400">{bigDeficit}</strong></div>
          <div>Small: <strong className="text-purple-400">{smallDeficit}</strong></div>
          <div>Private: <strong className="text-orange-400">{privateTotal}</strong></div>
        </div>
      </div> */}
            {/* Mobile - Fixed Horizontal Overflow */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-red-500">Two Deficit</h1>
          <button 
  onClick={handleReload} 
  disabled={isReloading}
  className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-xl text-sm flex items-center gap-2 mx-auto transition"
>
  <FiRefreshCw className={`inline ${isReloading ? 'animate-spin' : ''}`} /> 
  {isReloading ? "Reloading..." : "Reload"}
</button>
        </div>

        {/* Inputs - Made more compact to prevent overflow */}
        <div className="flex gap-2 mb-6 justify-center items-center">
          <input 
            value={inputA} 
            onChange={(e) => setInputA(e.target.value)} 
            placeholder="Home" 
            className="flex-1 max-w-[110px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
          />
          <span className="text-xl text-red-500 font-black px-1">VS</span>
          <input 
            value={inputB} 
            onChange={(e) => setInputB(e.target.value)} 
            placeholder="Away" 
            className="flex-1 max-w-[110px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
          />
        </div>

        {/* Load & Next Buttons */}
        <div className="flex gap-3 mb-8">
          <button 
            onClick={handleLoadGame} 
            disabled={isGameLoaded} 
            className={`flex-1 py-3 font-bold rounded-2xl text-sm transition ${
              isGameLoaded ? "bg-gray-600" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            LOAD
          </button>
          <button 
            onClick={handleNextGame} 
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 font-bold rounded-2xl text-sm transition"
          >
            NEXT
          </button>
        </div>

        {/* Win Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {allKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleWin(key)}
              disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
              className={`py-5 rounded-2xl font-medium text-sm transition ${
                isButtonPressed(key) ? "bg-yellow-500 text-black" 
                : key === "winner" ? "bg-yellow-400 text-black" 
                : "bg-blue-600 text-white"
              } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50" : ""}`}
            >
              {labels[key]}<br />
              <span className="text-xs">({pendingStakes[key] || "–"})</span>
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 text-xs bg-black/30 p-5 rounded-3xl">
          <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
          <div>Big: <strong className="text-red-400">{bigDeficit}</strong></div>
          <div>Small: <strong className="text-purple-400">{smallDeficit}</strong></div>
          <div>Private: <strong className="text-orange-400">{privateTotal}</strong></div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;