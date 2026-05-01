import React, { useState, useEffect } from "react";
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
  
  // Base starts at 1000 now
  const [baseAmount, setBaseAmount] = useState(1000);
  
  // Assets currently in the deficit array (these are the only ones that get stakes)
  const [deficitArray, setDeficitArray] = useState([]);
  
  // Counter for each asset - increments every time Next Game is clicked
  const [counters, setCounters] = useState({
    oneX: 0,
    twoX: 0,
    x2: 0,
    zeroGoals: 0,
    sixGoals: 0,
    ht12: 0,
    ht21: 0,
    ht30: 0,
    ft40: 0,
    ft41: 0
  });
  
  // Pending stakes for the current game (only for assets in deficitArray)
  const [pendingStakes, setPendingStakes] = useState({});
  
  // Track pressed buttons
  const [pressedWins, setPressedWins] = useState(new Set());
  const [hasWon, setHasWon] = useState(false);
  
  // Martingale order for special outcomes
  const martingaleOrder = ["oneX", "twoX", "x2", "zeroGoals", "sixGoals", "ht12", "ht21", "ht30", "ft40", "ft41"];
  
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
  
  /* ---------------- HELPERS ---------------- */
  const getAssetsBehind = (wonKey) => {
    const index = martingaleOrder.indexOf(wonKey);
    return index === -1 ? [] : martingaleOrder.slice(index + 1);
  };
  
  /* ---------------- LOAD / SAVE ---------------- */
  const fetchData = async () => {
    try {
      const res = await axios.get(API_BASE);
      const data = res.data || {};
      setBaseAmount(data.baseAmount ?? 1000);
      setDeficitArray(data.deficitArray ?? []);
      setCounters(data.counters ?? {
        oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
        ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0
      });
    } catch (err) {
      console.error("❌ Load failed:", err.message);
    }
  };
  
  const saveData = async () => {
    try {
      const payload = {
        baseAmount: baseAmount,
        deficitArray: deficitArray,
        counters: counters,
      };
      await axios.put(API_BASE, payload);
      console.log("✅ Saved successfully");
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  // Auto-save when states change
  useEffect(() => {
    const timeout = setTimeout(() => {
      saveData();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [baseAmount, deficitArray, counters]);
  
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
    setHasWon(false);
    
    // Calculate stakes ONLY for assets in deficitArray
    // They target the baseAmount
    let runningTarget = baseAmount;
    const newPending = {};
    
    // Initialize all stakes to 0 first
    specialKeys.forEach(key => {
      newPending[key] = 0;
    });
    
    // Only calculate for assets in deficitArray, in martingale order
    martingaleOrder.forEach((key) => {
      if (deficitArray.includes(key)) {
        const odd = found[key] || 0;
        if (odd > 1.01) {
          let stakeAmount = Math.round(runningTarget / (odd - 1));
          stakeAmount = Math.max(stakeAmount, 10);
          newPending[key] = stakeAmount;
          runningTarget += stakeAmount;
        }
      }
    });
    
    setPendingStakes(newPending);
  };
  
  /* ---------------- WIN HANDLER ---------------- */
  const handleWin = (type) => {
    if (!fixture) return;
    
    const stakeAmount = pendingStakes[type];
    if (stakeAmount === 0) return;
    
    // Mark button as pressed
    setPressedWins((prev) => new Set([...prev, type]));
    setHasWon(true);
    
    // Calculate residue (stakes of assets after this one in martingale order)
    const behindKeys = getAssetsBehind(type);
    const residue = behindKeys.reduce((sum, key) => sum + (pendingStakes[key] || 0), 0);
    
    // NEW BASE = 1000 + residue
    const newBase = 1000 + residue;
    setBaseAmount(newBase);
    
    // Remove the won asset from deficit array
    setDeficitArray(prev => prev.filter(item => item !== type));
    
    // Reset counter for the won asset to 0
    setCounters(prev => ({
      ...prev,
      [type]: 0
    }));
    
    // Add any remaining assets (behind keys) to deficit array for next game
    setDeficitArray(prev => {
      const newArray = [...prev];
      behindKeys.forEach(key => {
        if (!newArray.includes(key) && pendingStakes[key] > 0) {
          newArray.push(key);
        }
      });
      return newArray;
    });
  };
  
  /* ---------------- NEXT GAME (LOSS HANDLER & COUNTER INCREMENT) ---------------- */
  const handleNextGame = () => {
    if (!fixture) return;
    
    // FIRST: Increment counters for ALL assets (whether in deficit array or not)
    setCounters(prev => {
      const newCounters = { ...prev };
      specialKeys.forEach(key => {
        newCounters[key] = (prev[key] || 0) + 1;
      });
      return newCounters;
    });
    
    // If NO win occurred this game
    if (!hasWon) {
      // Total loss: add total staked to base
      const totalStaked = Object.values(pendingStakes).reduce((sum, val) => sum + (val || 0), 0);
      const newBase = baseAmount + totalStaked;
      setBaseAmount(newBase);
      
      // Add all assets that had stakes this game to deficit array for next game
      const assetsToAdd = martingaleOrder.filter(key => pendingStakes[key] > 0);
      setDeficitArray(prev => {
        const newArray = [...prev];
        assetsToAdd.forEach(key => {
          if (!newArray.includes(key)) {
            newArray.push(key);
          }
        });
        return newArray;
      });
    } else {
      // If a win occurred, clear deficit array (as per your code)
      setDeficitArray([]);
    }
    
    // AFTER incrementing counters, check if any counter has reached 30
    // Use setTimeout to ensure we have the latest counters
    setTimeout(() => {
      setCounters(currentCounters => {
        const newDeficitArray = [...deficitArray];
        let updated = false;
        
        specialKeys.forEach(key => {
          // If counter reaches 30 and asset is not already in deficit array
          if (currentCounters[key] >= 30 && !newDeficitArray.includes(key)) {
            newDeficitArray.push(key);
            updated = true;
            console.log(`✅ ${key} reached counter ${currentCounters[key]} and was added to deficit array`);
          }
        });
        
        if (updated) {
          setDeficitArray(newDeficitArray);
        }
        
        return currentCounters;
      });
    }, 0);
    
    // Reset game state
    setFixture(null);
    setInputA("");
    setInputB("");
    setPendingStakes({});
    setPressedWins(new Set());
    setHasWon(false);
  };
  
  /* ---------------- DERIVED VALUES ---------------- */
  const isButtonPressed = (key) => pressedWins.has(key);
  const isGameLoaded = !!fixture;
  const hasStake = (key) => pendingStakes[key] > 0;
  
  return (
    <div>
      {/* DESKTOP VERSION */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
              Deficit Array Strategy
            </h1>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-semibold text-lg rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border border-red-500/30"
            >
              <FiRefreshCw className="w-5 h-5" />
              Reload Data
            </button>
          </div>
          <p className="text-red-400 mt-2">
            {fixture ? "GAME LOADED" : "Ready"} | Assets in array: [{deficitArray.join(", ")}]
          </p>
        </div>
        
        <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">
          {/* Bet Buttons - ALL buttons visible always */}
          <div className="mb-8">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {specialKeys.map((key) => {
                const stake = pendingStakes[key];
                const isInArray = deficitArray.includes(key);
                const showStake = hasStake(key);
                const isPressed = isButtonPressed(key);
                const counter = counters[key] || 0;
                const needsToBeAdded = counter >= 30 && !isInArray;
                
                if (fixture && showStake) {
                  // WIN BUTTON - has stake
                  return (
                    <button
                      key={key}
                      onClick={() => handleWin(key)}
                      disabled={isPressed}
                      className={`py-6 rounded-2xl text-white font-extrabold transition ${
                        isPressed
                          ? "bg-yellow-500"
                          : isInArray
                            ? "bg-purple-600 hover:bg-purple-500"
                            : "bg-blue-600 hover:bg-blue-500"
                      } ${isPressed ? "opacity-50 cursor-not-allowed" : ""}`}
                      title={isInArray ? "In Deficit Array" : "Normal Stake"}
                    >
                      {specialLabels[key]}<br />
                      ({stake})<br />
                      <span className="text-xs">C:{counter}</span>
                    </button>
                  );
                } else if (fixture && !showStake) {
                  // NO STAKE YET - show counter status
                  return (
                    <button
                      key={key}
                      disabled={true}
                      className={`py-6 rounded-2xl text-white font-bold transition ${
                        needsToBeAdded
                          ? "bg-orange-600"
                          : isInArray
                            ? "bg-purple-600"
                            : "bg-gray-500"
                      } cursor-not-allowed opacity-75`}
                      title={needsToBeAdded ? "Will be added next game!" : `Counter: ${counter}/30`}
                    >
                      {specialLabels[key]}<br />
                      <span className="text-sm">(−)</span>
                      <br />
                      <span className="text-xs">{counter}/30</span>
                    </button>
                  );
                } else {
                  // DISABLED BUTTON - game not loaded
                  return (
                    <button
                      key={key}
                      disabled={true}
                      className="py-6 rounded-2xl bg-gray-300 text-gray-500 font-bold opacity-50 cursor-not-allowed"
                    >
                      {specialLabels[key]}<br />
                      <span className="text-sm">(−)</span>
                      <br />
                      <span className="text-xs">C:{counter}</span>
                    </button>
                  );
                }
              })}
            </div>
            
            {/* Information about counters */}
            {!fixture && (
              <div className="text-center text-blue-600 font-bold py-4 bg-blue-50 rounded-xl mt-4">
                💡 Each asset has a counter that increments when you click NEXT GAME.<br />
                When counter reaches 30, the asset is automatically added to deficit array!
              </div>
            )}
            
            {/* Show which assets are about to be added */}
            {!fixture && (
              <div className="mt-4 text-center text-sm">
                <span className="text-gray-600">Assets close to 30: </span>
                {specialKeys.filter(key => counters[key] >= 25 && counters[key] < 30).map(key => (
                  <span key={key} className="inline-block bg-orange-200 text-orange-800 rounded-full px-2 py-1 text-xs mx-1">
                    {specialLabels[key]} ({counters[key]}/30)
                  </span>
                ))}
              </div>
            )}
          </div>
          
          {/* Input Controls */}
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
          
          {/* Stats Display */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>
              Current Base: <strong className="text-green-600">{baseAmount}</strong>
              <div className="text-xs text-gray-500">Target for stakes</div>
            </div>
            <div className="col-span-2">
              Deficit Array: <strong className="text-purple-600">[{deficitArray.join(", ")}]</strong>
              <div className="text-xs text-gray-500">Assets currently being chased</div>
            </div>
            <div>
              Status: <strong className={hasWon ? "text-green-600" : "text-yellow-600"}>
                {hasWon ? "Won This Game" : "No Win Yet"}
              </strong>
            </div>
          </div>
        </div>
      </div>
      
      {/* MOBILE VERSION */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4 flex flex-col overflow-x-hidden">
        {/* Header */}
        <div className="text-center mb-3">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <h1 className="text-xl font-extrabold text-red-500">Deficit Array</h1>
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-medium text-xs rounded-xl shadow transition active:scale-95 border border-red-500/30"
            >
              <FiRefreshCw className="w-3 h-3" />
              Reload
            </button>
          </div>
          <p className="text-red-400 text-xs mt-1">
            {fixture ? "GAME LOADED" : "Ready"} | [{deficitArray.slice(0, 3).join(", ")}]
          </p>
        </div>
        
        {/* Bet Buttons - 2 columns for mobile */}
        <div className="mb-4 flex-grow min-h-0">
          <div className="grid grid-cols-2 gap-2">
            {specialKeys.map((key) => {
              const stake = pendingStakes[key];
              const isInArray = deficitArray.includes(key);
              const showStake = hasStake(key);
              const isPressed = isButtonPressed(key);
              const counter = counters[key] || 0;
              
              if (fixture && showStake) {
                // WIN BUTTON
                return (
                  <button
                    key={key}
                    onClick={() => handleWin(key)}
                    disabled={isPressed}
                    className={`py-3 px-2 rounded-xl text-white font-bold text-xs transition active:scale-95 ${
                      isPressed
                        ? "bg-yellow-500"
                        : isInArray
                          ? "bg-purple-700 hover:bg-purple-600"
                          : "bg-blue-700 hover:bg-blue-600"
                    } ${isPressed ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {specialLabels[key]}<br />
                    <span className="text-[10px]">({stake})</span>
                    <br />
                    <span className="text-[8px]">C:{counter}</span>
                  </button>
                );
              } else if (fixture && !showStake) {
                // NO STAKE
                return (
                  <button
                    key={key}
                    disabled={true}
                    className={`py-3 px-2 rounded-xl text-white font-bold text-xs cursor-not-allowed opacity-75 ${
                      isInArray ? "bg-purple-700" : "bg-gray-600"
                    }`}
                  >
                    {specialLabels[key]}<br />
                    <span className="text-[10px]">(−)</span>
                    <br />
                    <span className="text-[8px]">{counter}/30</span>
                  </button>
                );
              } else {
                // DISABLED
                return (
                  <button
                    key={key}
                    disabled={true}
                    className="py-3 px-2 rounded-xl bg-gray-700 text-gray-400 font-bold text-xs opacity-50 cursor-not-allowed"
                  >
                    {specialLabels[key]}<br />
                    <span className="text-[10px]">(−)</span>
                    <br />
                    <span className="text-[8px]">C:{counter}</span>
                  </button>
                );
              }
            })}
          </div>
          
          {!fixture && (
            <div className="text-center text-green-400 text-xs py-2 bg-black/30 rounded-lg mt-2">
              Counters increase when you press NEXT. At 30, added to deficit array!
            </div>
          )}
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
        <div className="flex-grow min-h-0 overflow-auto bg-black/20 rounded-xl p-3 text-xs space-y-2">
          <div className="flex justify-between">
            <span>Base:</span>
            <strong className="text-green-400">{baseAmount}</strong>
          </div>
          <div className="flex justify-between">
            <span>Deficit Array:</span>
            <strong className="text-purple-400">[{deficitArray.join(", ")}]</strong>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <strong className={hasWon ? "text-green-400" : "text-yellow-400"}>
              {hasWon ? "Won" : "Pending"}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
