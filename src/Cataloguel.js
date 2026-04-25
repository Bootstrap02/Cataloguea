
// export default Homepage;
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
  
  // Deficit states - deficit only updated in handleNext
  const [deficit, setDeficit] = useState(0); // Max 1000, working deficit
  const [bigDeficit, setBigDeficit] = useState(0); // Storage for everything else
  
  // Track which assets are currently in array martingale (fighting for deficit)
  const [deficitArray, setDeficitArray] = useState([]);
  
  // Track if array martingale won
  const [winArrayState, setWinArrayState] = useState(false);
  
  // Martingale order for the special outcomes
  const martingaleOrder = ["oneX", "twoX", "x2", "zeroGoals", "sixGoals", "ht12", "ht21", "ht30", "ft40", "ft41"];
  
  const [pendingStakes, setPendingStakes] = useState({
    winnerAmount: 0,
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  // Track which win buttons have been pressed this game
  const [pressedWins, setPressedWins] = useState(new Set());
  const [win, setWin] = useState(false); // Track if first win has occurred

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

  // Helper function to get assets behind a given key
  const getAssetsBehind = (wonKey) => {
    const index = martingaleOrder.indexOf(wonKey);
    return index === -1 ? [] : martingaleOrder.slice(index + 1);
  };

  // Helper function to get assets before a given key
  const getAssetsBefore = (wonKey) => {
    const index = martingaleOrder.indexOf(wonKey);
    return index === -1 ? [] : martingaleOrder.slice(0, index);
  };

  // // Calculate each asset's share of the deficit for array martingale
const calculateDeficitShare = () => {
  if (!fixture || deficitArray.length === 0) return {};

  const shares = {};

  deficitArray.forEach((key) => {
    const odd = fixture[key] || 0;

    if (odd > 1.01) {
      // 🔥 Martingale logic: how much stake recovers the deficit
      shares[key] = Math.round(deficit / (odd - 1));
    } else {
      shares[key] = 0;
    }
  });

  return shares;
};
  useEffect(() => {
    baseRef.current = baseStake;
  }, [baseStake]);

  const fetchAll = async () => {
    try {
      const res = await axios.get(API_BASE);
      const data = res.data || {};

      setBaseStake(data.base ?? 10000);
      setDeficit(data.deficit ?? 0);
      setBigDeficit(data.bigDeficit ?? 0);
      setDeficitArray(data.deficitArray ?? []);
      setWinArrayState(data.winArrayState ?? false);
      setPressedWins(new Set());
      setWin(false);
    } catch (err) {
      console.error("❌ Load failed:", err.message);
    }
  };

  const saveAll = async () => {
    try {
      const payload = {
        base: Math.max(10000, baseRef.current),
        deficit,
        bigDeficit,
        deficitArray,
        winArrayState,
      };
      await axios.put(API_BASE, payload);
      console.log("✅ Saved successfully");
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

/* ---------------- LOAD GAME WITH DUAL MARTINGALE LOGIC ---------------- */
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
  setWin(false);
  setWinArrayState(false);

  // Calculate base winner amount
  let winnerAmount = Math.round(newBase / (found.winner)) || 10;
  winnerAmount = Math.max(winnerAmount, 10);

  // Calculate deficit shares for assets in deficitArray
  const deficitShares = calculateDeficitShare();
  
  // Calculate running target and stakes with dual martingale
  let runningTarget = winnerAmount;
  const newPending = { winnerAmount };
  
  specialKeys.forEach((key) => {
    const odd = found[key] || 0;
    if (odd > 1.01) {
      // Base stake calculation (without minimum 10 yet)
      let stakeAmount = Math.round(runningTarget / (odd - 1));
      
      // ONLY apply Math.max(..., 10) for assets NOT in deficit array
      if (!deficitArray.includes(key)) {
        stakeAmount = Math.max(stakeAmount, 10);
      } else if (stakeAmount < 1) {
        // For deficit array assets, if calculation gives less than 1, set to 1
        stakeAmount = Math.max(stakeAmount, 1);
      }
      
      // If this asset is in deficit array, add its deficit share as separate martingale
      if (deficitArray.includes(key)) {
        const deficitShare = deficitShares[key] || 0;
        if (deficitShare > 0) {
          // Calculate deficit stake - also NO minimum 10 rule for deficit array assets
          let additionalStake = Math.round(deficitShare / (odd - 1));
          if (additionalStake < 1) additionalStake = 1;
          stakeAmount += additionalStake;
        }
      }
      
      newPending[key] = stakeAmount;
      runningTarget += stakeAmount;
    } else {
      newPending[key] = 0;
    }
  });

  setPendingStakes(newPending);
};
 /* ---------------- JACKPOT (6-0) ---------------- */
  const handleJackpot = () => {
    if (!fixture) return;
    setBaseStake(10000);
    // Reset everything - deficit stays, but we reset game state
    setDeficitArray([]);
    setWinArrayState(false);
    setPendingStakes((prev) => ({ ...prev, winnerAmount: 0 }));
    setPressedWins((prev) => new Set([...prev, "winner"]));
    setWin(false);
  };
  const handleArrayWin = (key) => {
  if (!deficitArray.includes(key)) return;

  const shares = calculateDeficitShare();
  const recovered = shares[key] || 0;

  if (recovered <= 0) return;

  // Reduce deficit
  setDeficit(prev => Math.max(prev - recovered, 0));

  // Remove this asset from array
  setDeficitArray(prev => prev.filter(item => item !== key));

  // mark pressed (optional reuse)
  setPressedWins(prev => new Set([...prev, `array-${key}`]));
};

  /* ---------------- MARTINGALE WIN HANDLER ---------------- */
  

const handleWin = (type) => {
  if (!fixture) return;

  const dShares = calculateDeficitShare();
  const normalStake = pendingStakes[type] || 0;
  const deficitStake = dShares[type] || 0;

  if (normalStake + deficitStake === 0) return;

  // 1. Mark button as pressed
  setPressedWins((prev) => new Set([...prev, type]));

  // 2. Identify assets "Behind" and "Before" (for residue and subtraction)
  const behindKeys = getAssetsBehind(type);
  const beforeKeys = getAssetsBefore(type);

  // Normal Residue: Stakes of everything that comes after the won asset
  const normalResidue = behindKeys.reduce((sum, k) => sum + (pendingStakes[k] || 0), 0);
  // Deficit Residue: Stakes of everything that comes after the won asset in the deficit array
  const deficitResidue = behindKeys.reduce((sum, k) => sum + (dShares[k] || 0), 0);

  // Before Totals: For subtraction from Bad Deficits on second wins
  const normalBeforeTotal = beforeKeys.reduce((sum, k) => sum + (pendingStakes[k] || 0), 0);
  const deficitBeforeTotal = beforeKeys.reduce((sum, k) => sum + (dShares[k] || 0), 0);

  const isInDeficitArray = deficitArray.includes(type);

  // --- SUBTRACTION HELPER (Based on your Mock) ---
  const subtractFromBadDeficit = (totalToSubtract) => {
    const residue = totalToSubtract - bigDeficit
    setBigDeficit(0);
    if (deficit >= residue) {
      setDeficit(prev => prev - residue);
    } else {
      const remain = residue - deficit;
      setDeficit(0);
      setBigDeficit(prev => Math.max(0, prev - remain));
    }
  };

  if (!win) {
    // ================= FIRST WIN LOGIC =================
    setWin(true);
    
    if (isInDeficitArray) {
      setWinArrayState(true);
      // If deficit array wins, clear working deficit as requested
      setDeficit(0);
      setDeficitArray(prev => prev.filter(item => item !== type));
      // Push residues to Big Deficit
      setBigDeficit(prev => prev + normalResidue + deficitResidue);
    } else {
      // Normal win: Add asset to deficit tracker
      setDeficitArray(prev => [...prev, type]);
      // Push residues (Normal + any current deficit stakes) to Big Deficit
      setBigDeficit(prev => prev + normalResidue + deficitResidue);
    }
  } else {
    // ================= SECOND+ WIN LOGIC =================
    // Total amount to subtract from the bad game storage
    const totalToSubtract = normalBeforeTotal + pendingStakes.winnerAmount;
    const totalDeficitToSubtract = deficitBeforeTotal + deficit;
    console.log(normalBeforeTotal)
    console.log(deficitBeforeTotal)
    console.log(pendingStakes.winnerAmount)

    if (isInDeficitArray) {
      setWinArrayState(true);
      setDeficit(0); // Clear current working deficit
      setDeficitArray(prev => prev.filter(item => item !== type));
      subtractFromBadDeficit(totalToSubtract);
    } else {
      if (!deficitArray.includes(type)) setDeficitArray(prev => [...prev, type]);
      subtractFromBadDeficit(totalToSubtract);
    }
  }
};






const handleNextGame = () => {
  if (!fixture) return;

  // 1. Calculate the TOTAL loss (Normal Martingale + Deficit Shares)
  const dShares = calculateDeficitShare();
  const totalNormalStaked = Object.values(pendingStakes).reduce((sum, val) => sum + (val || 0), 0);
  const totalDeficitStaked = Object.values(dShares).reduce((sum, val) => sum + (val || 0), 0);
  
  const totalLossThisRound = totalNormalStaked + totalDeficitStaked;
  
  let currentBigDeficit = bigDeficit;
  let currentWorkingDeficit = deficit;

  // 2. If NO win happened at all, move the entire combined loss to Big Deficit
  if (!win && !winArrayState) {
    currentBigDeficit += totalLossThisRound;
  }

  // 3. REFILL LOGIC (Pull from Big Deficit back into Working Deficit)
  if (currentBigDeficit > 0) {
    const spaceLeftInWorking = 1000 - currentWorkingDeficit;
    if (spaceLeftInWorking > 0) {
      const amountToTransfer = Math.min(currentBigDeficit, spaceLeftInWorking);
      currentWorkingDeficit += amountToTransfer;
      currentBigDeficit -= amountToTransfer;
    }
  }

  // 4. Update states
  setBigDeficit(currentBigDeficit);
  setDeficit(currentWorkingDeficit);

  // 5. Cleanup
  setPressedWins(new Set());
  setPendingStakes({
    winnerAmount: 0, oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, 
    sixGoals: 0, ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });
  setWin(false);
  setWinArrayState(false); 
  setFixture(null);
  setInputA("");
  setInputB("");
  
  saveAll();
};
const isButtonPressed = (key) => pressedWins.has(key);
const isGameLoaded = !!fixture;

// Calculate total amount for 6-0 button (winner amount)
const totalWinnerAmount = pendingStakes.winnerAmount;

// Calculate deficit shares for display
const deficitShares = calculateDeficitShare();

// CREATE MERGED STAKES OBJECT (pendingStakes + deficitShares)
const mergedStakes = {
  oneX: (pendingStakes.oneX || 0) + (deficitShares.oneX || 0),
  twoX: (pendingStakes.twoX || 0) + (deficitShares.twoX || 0),
  x2: (pendingStakes.x2 || 0) + (deficitShares.x2 || 0),
  zeroGoals: (pendingStakes.zeroGoals || 0) + (deficitShares.zeroGoals || 0),
  sixGoals: (pendingStakes.sixGoals || 0) + (deficitShares.sixGoals || 0),
  ht12: (pendingStakes.ht12 || 0) + (deficitShares.ht12 || 0),
  ht21: (pendingStakes.ht21 || 0) + (deficitShares.ht21 || 0),
  ht30: (pendingStakes.ht30 || 0) + (deficitShares.ht30 || 0),
  ft40: (pendingStakes.ft40 || 0) + (deficitShares.ft40 || 0),
  ft41: (pendingStakes.ft41 || 0) + (deficitShares.ft41 || 0),
};

return (
  <div>
    {/* Desktop version */}
    <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
            Virtual Strategy - Dual Martingale System
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
          {fixture ? "MATCH LOADED — Dual Martingale Active" : "Ready"}
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
              6–0<br />
              ({totalWinnerAmount || "–"})
            </button>

            {specialKeys.map((key) => {
              const isInArray = deficitArray.includes(key);
              // USE THE MERGED VALUE FOR DISPLAY
              const displayValue = mergedStakes[key];
              
              return (
                <button
                  key={key}
                  onClick={() => handleWin(key)}
                  disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                  className={`py-6 rounded-2xl text-white font-extrabold transition ${
                    isButtonPressed(key) 
                      ? "bg-yellow-500" 
                      : isInArray
                        ? "bg-purple-600 hover:bg-purple-500"
                        : "bg-blue-600 hover:bg-blue-500"
                  } ${!fixture || pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={isInArray ? `Normal: ${pendingStakes[key]} | Deficit: ${deficitShares[key] || 0} | Total: ${displayValue}` : `Stake: ${displayValue}`}
                >
                  {specialLabels[key]}<br />
                  ({displayValue || "–"})
                </button>
              );
            })}
          </div>
          
          {/* REMOVED the separate deficit array buttons section */}
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

        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
          <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
          <div>Deficit: <strong className="text-purple-600">{deficit}</strong></div>
          <div>Big Deficit: <strong className="text-yellow-600">{bigDeficit}</strong></div>
          <div>Status: <strong className={win ? "text-green-600" : "text-red-600"}>{win ? "Win Mode" : "Initial"}</strong></div>
          <div className="col-span-2">Array Martingale: <strong className="text-blue-600">[{deficitArray.join(", ")}]</strong></div>
          <div>Win Array State: <strong className={winArrayState ? "text-green-600" : "text-gray-600"}>{winArrayState ? "Active" : "Inactive"}</strong></div>
          <div className="col-span-4 text-xs text-gray-600 mt-2">
            * Purple buttons include deficit martingale amounts | Hover to see breakdown
          </div>
        </div>
      </div>
    </div>

    {/* Mobile version */}
    <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4 flex flex-col overflow-x-hidden">
      {/* Header */}
      <div className="text-center mb-3">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <h1 className="text-2xl font-extrabold text-red-500">Dual Martingale</h1>
          <button
            onClick={fetchAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-medium text-xs rounded-xl shadow transition active:scale-95 border border-red-500/30 disabled:opacity-50"
          >
            Reload
          </button>
        </div>
        <p className="text-red-400 text-xs mt-1">
          {fixture ? "LOADED — Dual Martingale" : "Ready"}
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
            ({totalWinnerAmount || "–"})
          </button>

          {specialKeys.map((key) => {
            const isInArray = deficitArray.includes(key);
            // USE THE MERGED VALUE FOR DISPLAY
            const displayValue = mergedStakes[key];
            
            return (
              <button
                key={key}
                onClick={() => handleWin(key)}
                disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                className={`py-3 px-2 rounded-xl text-white font-bold text-xs transition active:scale-95 ${
                  isButtonPressed(key) 
                    ? "bg-yellow-500" 
                    : isInArray
                      ? "bg-purple-700 hover:bg-purple-600"
                      : "bg-blue-700 hover:bg-blue-600"
                } ${!fixture || pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {specialLabels[key]}<br />
                <span className="text-[10px]">({displayValue || "–"})</span>
              </button>
            );
          })}
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
      <div className="flex-grow min-h-0 overflow-auto bg-black/20 rounded-xl p-3 text-xs grid grid-cols-2 gap-2">
        <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
        <div>Deficit: <strong className="text-purple-400">{deficit}</strong></div>
        <div>Big Deficit: <strong className="text-yellow-400">{bigDeficit}</strong></div>
        <div>Status: <strong className={win ? "text-green-400" : "text-red-400"}>{win ? "Win Mode" : "Initial"}</strong></div>
        <div className="col-span-2">Array: <strong className="text-blue-400">[{deficitArray.join(", ")}]</strong></div>
        <div className="col-span-2">Win Array: <strong className={winArrayState ? "text-green-400" : "text-gray-400"}>{winArrayState ? "Active" : "Inactive"}</strong></div>
      </div>
    </div>
  </div>
);
};

export default Homepage;