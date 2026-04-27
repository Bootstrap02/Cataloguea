// // export default Homepage;
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
  
//   // Deficit states - deficit only updated in handleNext
//   const [deficit, setDeficit] = useState(0); // Max 1000, working deficit
//   const [bigDeficit, setBigDeficit] = useState(0); // Storage for everything else
  
//   // Track which assets are currently in array martingale (fighting for deficit)
//   const [deficitArray, setDeficitArray] = useState([]);
  
//   // Track if array martingale won
//   const [winArrayState, setWinArrayState] = useState(false);
  
//   // Martingale order for the special outcomes
//   const martingaleOrder = ["oneX", "twoX", "x2", "zeroGoals", "sixGoals", "ht12", "ht21", "ht30", "ft40", "ft41"];
  
//   const [pendingStakes, setPendingStakes] = useState({
//     winnerAmount: 0,
//     oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
//     ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
//   });

//   // Track which win buttons have been pressed this game
//   const [pressedWins, setPressedWins] = useState(new Set());
//   const [win, setWin] = useState(false); // Track if first win has occurred

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

//   // Helper function to get assets behind a given key
//   const getAssetsBehind = (wonKey) => {
//     const index = martingaleOrder.indexOf(wonKey);
//     return index === -1 ? [] : martingaleOrder.slice(index + 1);
//   };

//   // Helper function to get assets before a given key
//   const getAssetsBefore = (wonKey) => {
//     const index = martingaleOrder.indexOf(wonKey);
//     return index === -1 ? [] : martingaleOrder.slice(0, index);
//   };

//   // // Calculate each asset's share of the deficit for array martingale
// const calculateDeficitShare = () => {
//   if (!fixture || deficitArray.length === 0) return {};

//   const shares = {};

//   deficitArray.forEach((key) => {
//     const odd = fixture[key] || 0;

//     if (odd > 1.01) {
//       // 🔥 Martingale logic: how much stake recovers the deficit
//       shares[key] = Math.round(deficit / (odd - 1));
//     } else {
//       shares[key] = 0;
//     }
//   });

//   return shares;
// };
//   useEffect(() => {
//     baseRef.current = baseStake;
//   }, [baseStake]);

//   const fetchAll = async () => {
//     try {
//       const res = await axios.get(API_BASE);
//       const data = res.data || {};

//       setBaseStake(data.base ?? 10000);
//       setDeficit(data.deficit ?? 0);
//       setBigDeficit(data.bigDeficit ?? 0);
//       setDeficitArray(data.deficitArray ?? []);
//       setWinArrayState(data.winArrayState ?? false);
//       setPressedWins(new Set());
//       setWin(false);
//     } catch (err) {
//       console.error("❌ Load failed:", err.message);
//     }
//   };

//   const saveAll = async () => {
//     try {
//       const payload = {
//         base: Math.max(10000, baseRef.current),
//         deficit,
//         bigDeficit,
//         deficitArray,
//         winArrayState,
//       };
//       await axios.put(API_BASE, payload);
//       console.log("✅ Saved successfully");
//     } catch (err) {
//       console.error("❌ Save failed:", err.message);
//     }
//   };

//   useEffect(() => {
//     fetchAll();
//   }, []);

// /* ---------------- LOAD GAME WITH DUAL MARTINGALE LOGIC ---------------- */
// const handleLoadGame = (e) => {
//   e.preventDefault();

//   const home = sanitizeTeam(inputA) || "che";
//   const away = sanitizeTeam(inputB) || "che";

//   const found = odds.find((o) => o.home === home && o.away === away);

//   if (!found) {
//     alert(`No odds for ${home} vs ${away}`);
//     return;
//   }

//   const newBase = baseStake;
//   setFixture(found);
//   setPressedWins(new Set());
//   setWin(false);
//   setWinArrayState(false);

//   // Calculate base winner amount
//   let winnerAmount = Math.round(newBase / (found.winner)) || 10;
//   winnerAmount = Math.max(winnerAmount, 10);

//   // Calculate deficit shares for assets in deficitArray
//   const deficitShares = calculateDeficitShare();
  
//   // Calculate running target and stakes with dual martingale
//   let runningTarget = winnerAmount;
//   const newPending = { winnerAmount };
  
//   specialKeys.forEach((key) => {
//     const odd = found[key] || 0;
//     if (odd > 1.01) {
//       // Base stake calculation (without minimum 10 yet)
//       let stakeAmount = Math.round(runningTarget / (odd - 1));
      
//       // ONLY apply Math.max(..., 10) for assets NOT in deficit array
//       if (!deficitArray.includes(key)) {
//         stakeAmount = Math.max(stakeAmount, 10);
//       } else if (stakeAmount < 1) {
//         // For deficit array assets, if calculation gives less than 1, set to 1
//         stakeAmount = Math.max(stakeAmount, 1);
//       }
      
//       // If this asset is in deficit array, add its deficit share as separate martingale
//       if (deficitArray.includes(key)) {
//         const deficitShare = deficitShares[key] || 0;
//         if (deficitShare > 0) {
//           // Calculate deficit stake - also NO minimum 10 rule for deficit array assets
//           let additionalStake = Math.round(deficitShare / (odd - 1));
//           if (additionalStake < 1) additionalStake = 1;
//           stakeAmount += additionalStake;
//         }
//       }
      
//       newPending[key] = stakeAmount;
//       runningTarget += stakeAmount;
//     } else {
//       newPending[key] = 0;
//     }
//   });

//   setPendingStakes(newPending);
// };
//  /* ---------------- JACKPOT (6-0) ---------------- */
//   const handleJackpot = () => {
//     if (!fixture) return;
//     setBaseStake(10000);
//     // Reset everything - deficit stays, but we reset game state
//     setDeficitArray([]);
//     setWinArrayState(false);
//     setPendingStakes((prev) => ({ ...prev, winnerAmount: 0 }));
//     setPressedWins((prev) => new Set([...prev, "winner"]));
//     setWin(false);
//   };
//   // const handleArrayWin = (key) => {
//     // if (!deficitArray.includes(key)) return;

//    //  const shares = calculateDeficitShare();
//   //   const recovered = shares[key] || 0;

//   //   if (recovered <= 0) return;

//   // Reduce deficit
//   //   setDeficit(prev => Math.max(prev - recovered, 0));

//   // Remove this asset from array
//   //   setDeficitArray(prev => prev.filter(item => item !== key));

//     // mark pressed (optional reuse)
//   //   setPressedWins(prev => new Set([...prev, `array-${key}`]));
//   //    };

//   /* ---------------- MARTINGALE WIN HANDLER ---------------- */
  

// const handleWin = (type) => {
//   if (!fixture) return;

//   const dShares = calculateDeficitShare();
//   const normalStake = pendingStakes[type] || 0;
//   const deficitStake = dShares[type] || 0;

//   if (normalStake + deficitStake === 0) return;

//   // Mark button as pressed
//   setPressedWins((prev) => new Set([...prev, type]));

//   // Identify assets "Behind" and "Before"
//   const behindKeys = getAssetsBehind(type);
//   const beforeKeys = getAssetsBefore(type);

//   // Normal Residue: Stakes of everything AFTER the won asset
//   const normalResidue = behindKeys.reduce((sum, k) => sum + (pendingStakes[k] || 0), 0);
//   // Deficit Residue: Deficit stakes of everything AFTER the won asset
//   const deficitResidue = behindKeys.reduce((sum, k) => sum + (dShares[k] || 0), 0);

//   // Before Totals: For subtraction from Bad Deficits on second wins
//   const normalBeforeTotal = beforeKeys.reduce((sum, k) => sum + (pendingStakes[k] || 0), 0);
//   const deficitBeforeTotal = beforeKeys.reduce((sum, k) => sum + (dShares[k] || 0), 0);

//   const isInDeficitArray = deficitArray.includes(type);

//   if (!win) {
//     // ================= FIRST WIN LOGIC =================
//     setWin(true);
    
//     if (isInDeficitArray) {
//       setWinArrayState(true);
//       setDeficit(0);
//       setDeficitArray(prev => prev.filter(item => item !== type));
//       // Push residues to Big Deficit
//       const totalResidue = normalResidue + deficitResidue;
//       if (totalResidue > 0) {
//         setBigDeficit(prev => prev + totalResidue);
//       }
//     } else {
//       // Normal win: Add asset to deficit tracker
//       setDeficitArray(prev => [...prev, type]);
//       // Push only normal residue to Big Deficit
//       if (normalResidue > 0) {
//         setBigDeficit(prev => prev + normalResidue);
//       }
//     }
//   } else {
//     // ================= SECOND+ WIN LOGIC =================
    
//     if (isInDeficitArray) {
//       // DEFICIT ARRAY WIN
//       setWinArrayState(true);
      
//       // Calculate total to subtract from Big Deficit
//       const totalToSubtract = normalBeforeTotal + deficitBeforeTotal + pendingStakes.winnerAmount;
      
//       // Use functional updates to work with current state
//       setBigDeficit(prev => {
//         if (prev >= totalToSubtract) {
//           return prev - totalToSubtract;
//         } else {
//           // If not enough in bigDeficit, calculate remaining
//           const remaining = totalToSubtract - prev;
//           // Subtract remaining from deficit
//           setDeficit(def => {
//             if (def >= remaining) {
//               return def - remaining;
//             }
//             return 0;
//           });
//           return 0;
//         }
//       });
      
//       // Clear working deficit
//       setDeficit(0);
//       // Remove this asset from deficit array
//       setDeficitArray(prev => prev.filter(item => item !== type));
//       // Push remaining residues to Big Deficit
//       const remainingResidue = normalResidue + deficitResidue;
//       if (remainingResidue > 0) {
//         setBigDeficit(prev => prev + remainingResidue);
//       }
//     } else {
//       // NORMAL WIN ON SECOND+ WIN
//       if (!deficitArray.includes(type)) {
//         setDeficitArray(prev => [...prev, type]);
//       }
      
//       // Calculate total to subtract from Big Deficit
//       const totalToSubtract = normalBeforeTotal + pendingStakes.winnerAmount;
      
//       // Subtract from Big Deficit
//       setBigDeficit(prev => {
//         if (prev >= totalToSubtract) {
//           return prev - totalToSubtract;
//         }
//         return 0;
//       });
      
//       // ALL deficit stakes move to Big Deficit as loss
//       const totalDeficitStakes = Object.values(dShares).reduce((sum, val) => sum + val, 0);
//       if (totalDeficitStakes > 0) {
//         setBigDeficit(prev => prev + totalDeficitStakes);
//       }
//     }
//   }
// };

// const handleNextGame = () => {
//   if (!fixture) return;

//   const dShares = calculateDeficitShare();
//   const totalNormalStaked = Object.values(pendingStakes).reduce((sum, val) => sum + (val || 0), 0);
//   const totalDeficitStaked = Object.values(dShares).reduce((sum, val) => sum + (val || 0), 0);

//   // Use local variables to track the values through the function
//   let tempBigDeficit = bigDeficit;
//   let tempWorkingDeficit = deficit;

 

//   // 1. ADD LOSSES TO THE POOL
//   // ONLY add losses when there was NO WIN at all
//   if (!win && !winArrayState) {
//     // No win happened - add ALL stakes to bigDeficit
//     setBigDeficit((prev) => Math.max(0, prev - totalNormalStaked + totalDeficitStaked));
//     // tempBigDeficit += (totalNormalStaked + totalDeficitStaked);
//     console.log("No win - added total loss. New BigDeficit:", tempBigDeficit);
//   } else if(win && !winArrayState) {
//      // Normal won, but Deficit Martingale lost its whole stake
//     // tempWorkingDeficit += totalDeficitStaked;
//     setBigDeficit((prev) => Math.max(0, prev - totalDeficitStaked));

//    }
//   // If ANY win occurred (win=true OR winArrayState=true), 
//   // all losses were already handled in handleWin

//   // 2. THE RE-BALANCING (The 1000 Condition)
//   // Combine everything into one pool first to redistribute
//   let totalPool = bigDeficit + deficit;
//   console.log("Total Pool before rebalance:", totalPool);

//   if (totalPool > 1000) {
//     setDeficit(1000);
//     setBigDeficit( totalPool - 1000);
//     // tempBigDeficit = totalPool - 1000;
//     console.log("Pool > 1000 - Working Deficit set to 1000, BigDeficit set to:", tempBigDeficit);
//   } else {
//      setDeficit(totalPool);
//     setBigDeficit(0);
//     console.log("Pool ≤ 1000 - Working Deficit set to:", tempWorkingDeficit, "BigDeficit set to 0");
//   }

//   // 3. FINAL STATE UPDATES
//   // setDeficit(tempWorkingDeficit);
//   // setBigDeficit(tempBigDeficit);

//   if (winArrayState) {
//     setDeficitArray([]);
//   }

//   // 4. Cleanup
//   setPressedWins(new Set());
//   setPendingStakes({
//     winnerAmount: 0, oneX: 0, twoX: 0, x2: 0, zeroGoals: 0,
//     sixGoals: 0, ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
//   });
//   setWin(false);
//   setWinArrayState(false);
//   setFixture(null);
//   setInputA("");
//   setInputB("");
 
//   saveAll();
// };

// const isButtonPressed = (key) => pressedWins.has(key);
// const isGameLoaded = !!fixture;

// // Calculate total amount for 6-0 button (winner amount)
// const totalWinnerAmount = pendingStakes.winnerAmount;

// // Calculate deficit shares for display
// const deficitShares = calculateDeficitShare();

// // CREATE MERGED STAKES OBJECT (pendingStakes + deficitShares)
// const mergedStakes = {
//   oneX: (pendingStakes.oneX || 0) + (deficitShares.oneX || 0),
//   twoX: (pendingStakes.twoX || 0) + (deficitShares.twoX || 0),
//   x2: (pendingStakes.x2 || 0) + (deficitShares.x2 || 0),
//   zeroGoals: (pendingStakes.zeroGoals || 0) + (deficitShares.zeroGoals || 0),
//   sixGoals: (pendingStakes.sixGoals || 0) + (deficitShares.sixGoals || 0),
//   ht12: (pendingStakes.ht12 || 0) + (deficitShares.ht12 || 0),
//   ht21: (pendingStakes.ht21 || 0) + (deficitShares.ht21 || 0),
//   ht30: (pendingStakes.ht30 || 0) + (deficitShares.ht30 || 0),
//   ft40: (pendingStakes.ft40 || 0) + (deficitShares.ft40 || 0),
//   ft41: (pendingStakes.ft41 || 0) + (deficitShares.ft41 || 0),
// };

// return (
//   <div>
//     {/* Desktop version */}
//     <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
//       <div className="text-center mb-10">
//         <div className="flex items-center justify-center gap-6 flex-wrap">
//           <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
//             Virtual Strategy - Dual Martingale System
//           </h1>
//           <button
//             onClick={fetchAll}
//             className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-semibold text-lg rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border border-red-500/30 disabled:opacity-50"
//           >
//             <FiRefreshCw className="w-5 h-5" />
//             Reload Data
//           </button>
//         </div>
//         <p className="text-red-400 mt-2">
//           {fixture ? "MATCH LOADED — Dual Martingale Active" : "Ready"}
//         </p>
//       </div>

//       <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">
//         <div className="mb-8">
//           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
//             <button
//               onClick={handleJackpot}
//               disabled={!fixture || isButtonPressed("winner")}
//               className={`py-6 rounded-2xl text-black font-extrabold transition ${
//                 isButtonPressed("winner") ? "bg-yellow-500" : "bg-yellow-400 hover:bg-yellow-300"
//               } ${!fixture || isButtonPressed("winner") ? "opacity-50 cursor-not-allowed" : ""}`}
//             >
//               6–0<br />
//               ({totalWinnerAmount || "–"})
//             </button>

//             {specialKeys.map((key) => {
//               const isInArray = deficitArray.includes(key);
//               // USE THE MERGED VALUE FOR DISPLAY
//               const displayValue = mergedStakes[key];
              
//               return (
//                 <button
//                   key={key}
//                   onClick={() => handleWin(key)}
//                   disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
//                   className={`py-6 rounded-2xl text-white font-extrabold transition ${
//                     isButtonPressed(key) 
//                       ? "bg-yellow-500" 
//                       : isInArray
//                         ? "bg-purple-600 hover:bg-purple-500"
//                         : "bg-blue-600 hover:bg-blue-500"
//                   } ${!fixture || pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
//                   title={isInArray ? `Normal: ${pendingStakes[key]} | Deficit: ${deficitShares[key] || 0} | Total: ${displayValue}` : `Stake: ${displayValue}`}
//                 >
//                   {specialLabels[key]}<br />
//                   ({displayValue || "–"})
//                 </button>
//               );
//             })}
//           </div>
          
//           {/* REMOVED the separate deficit array buttons section */}
//         </div>

//         <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-8">
//           <div className="flex items-center gap-4">
//             <input
//               value={inputA}
//               onChange={(e) => setInputA(e.target.value)}
//               placeholder="home"
//               className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg"
//             />
//             <span className="font-black text-3xl text-red-500">VS</span>
//             <input
//               value={inputB}
//               onChange={(e) => setInputB(e.target.value)}
//               placeholder="away"
//               className="w-32 px-6 py-3 border-2 border-red-600 rounded-2xl text-center text-lg"
//             />
//           </div>

//           <div className="flex gap-4">
//             <button
//               onClick={handleLoadGame}
//               disabled={isGameLoaded}
//               className={`px-10 py-4 text-white font-extrabold text-xl rounded-2xl transition shadow-lg ${
//                 isGameLoaded
//                   ? "bg-gray-600 opacity-50 cursor-not-allowed"
//                   : "bg-red-600 hover:bg-red-700"
//               }`}
//             >
//               LOAD GAME
//             </button>
//             <button
//               onClick={handleNextGame}
//               className="px-10 py-4 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xl rounded-2xl transition shadow-lg"
//             >
//               NEXT GAME
//             </button>
//           </div>
//         </div>

//         <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
//           <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
//           <div>Deficit: <strong className="text-purple-600">{deficit}</strong></div>
//           <div>Big Deficit: <strong className="text-yellow-600">{bigDeficit}</strong></div>
//           <div>Status: <strong className={win ? "text-green-600" : "text-red-600"}>{win ? "Win Mode" : "Initial"}</strong></div>
//           <div className="col-span-2">Array Martingale: <strong className="text-blue-600">[{deficitArray.join(", ")}]</strong></div>
//           <div>Win Array State: <strong className={winArrayState ? "text-green-600" : "text-gray-600"}>{winArrayState ? "Active" : "Inactive"}</strong></div>
//           <div className="col-span-4 text-xs text-gray-600 mt-2">
//             * Purple buttons include deficit martingale amounts | Hover to see breakdown
//           </div>
//         </div>
//       </div>
//     </div>

//     {/* Mobile version */}
//     <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-4 flex flex-col overflow-x-hidden">
//       {/* Header */}
//       <div className="text-center mb-3">
//         <div className="flex items-center justify-center gap-3 flex-wrap">
//           <h1 className="text-2xl font-extrabold text-red-500">Dual Martingale</h1>
//           <button
//             onClick={fetchAll}
//             className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-medium text-xs rounded-xl shadow transition active:scale-95 border border-red-500/30 disabled:opacity-50"
//           >
//             Reload
//           </button>
//         </div>
//         <p className="text-red-400 text-xs mt-1">
//           {fixture ? "LOADED — Dual Martingale" : "Ready"}
//         </p>
//       </div>

//       {/* Outcomes */}
//       <div className="mb-4 flex-grow min-h-0">
//         <div className="grid grid-cols-3 gap-2">
//           <button
//             onClick={handleJackpot}
//             disabled={!fixture || isButtonPressed("winner")}
//             className={`py-3 px-2 rounded-xl text-black font-bold text-xs transition active:scale-95 ${
//               isButtonPressed("winner") ? "bg-yellow-500" : "bg-yellow-500 hover:bg-yellow-400"
//             } ${!fixture || isButtonPressed("winner") ? "opacity-50 cursor-not-allowed" : ""}`}
//           >
//             6–0<br />
//             ({totalWinnerAmount || "–"})
//           </button>

//           {specialKeys.map((key) => {
//             const isInArray = deficitArray.includes(key);
//             // USE THE MERGED VALUE FOR DISPLAY
//             const displayValue = mergedStakes[key];
            
//             return (
//               <button
//                 key={key}
//                 onClick={() => handleWin(key)}
//                 disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
//                 className={`py-3 px-2 rounded-xl text-white font-bold text-xs transition active:scale-95 ${
//                   isButtonPressed(key) 
//                     ? "bg-yellow-500" 
//                     : isInArray
//                       ? "bg-purple-700 hover:bg-purple-600"
//                       : "bg-blue-700 hover:bg-blue-600"
//                 } ${!fixture || pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50 cursor-not-allowed" : ""}`}
//               >
//                 {specialLabels[key]}<br />
//                 <span className="text-[10px]">({displayValue || "–"})</span>
//               </button>
//             );
//           })}
//         </div>
//       </div>

//       {/* Input + Actions */}
//       <div className="mb-4 space-y-3">
//         <div className="flex items-center justify-center gap-2 max-w-full">
//           <input
//             value={inputA}
//             onChange={(e) => setInputA(e.target.value)}
//             placeholder="Home"
//             className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400"
//           />
//           <span className="font-black text-lg text-red-500 shrink-0">VS</span>
//           <input
//             value={inputB}
//             onChange={(e) => setInputB(e.target.value)}
//             placeholder="Away"
//             className="flex-1 min-w-0 px-2.5 py-2 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400"
//           />
//         </div>

//         <div className="flex gap-2">
//           <button
//             onClick={handleLoadGame}
//             disabled={isGameLoaded}
//             className={`flex-1 py-3 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm ${
//               isGameLoaded ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-red-700 hover:bg-red-600"
//             }`}
//           >
//             LOAD
//           </button>
//           <button
//             onClick={handleNextGame}
//             className="flex-1 py-3 bg-green-700 hover:bg-green-600 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm"
//           >
//             NEXT
//           </button>
//         </div>
//       </div>

//       {/* Stats */}
//       <div className="flex-grow min-h-0 overflow-auto bg-black/20 rounded-xl p-3 text-xs grid grid-cols-2 gap-2">
//         <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
//         <div>Deficit: <strong className="text-purple-400">{deficit}</strong></div>
//         <div>Big Deficit: <strong className="text-yellow-400">{bigDeficit}</strong></div>
//         <div>Status: <strong className={win ? "text-green-400" : "text-red-400"}>{win ? "Win Mode" : "Initial"}</strong></div>
//         <div className="col-span-2">Array: <strong className="text-blue-400">[{deficitArray.join(", ")}]</strong></div>
//         <div className="col-span-2">Win Array: <strong className={winArrayState ? "text-green-400" : "text-gray-400"}>{winArrayState ? "Active" : "Inactive"}</strong></div>
//       </div>
//     </div>
//   </div>
// );
// };

// export default Homepage;
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

  // Deficit states
  const [deficit, setDeficit] = useState(0);       // Working deficit (max 1000)
  const [bigDeficit, setBigDeficit] = useState(0); // Storage for overflow

  // Track which assets are currently in array martingale (fighting for deficit)
  const [deficitArray, setDeficitArray] = useState([]);

  // Track if deficit array martingale won this game
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
  const [win, setWin] = useState(false); // Track if a normal win has occurred

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

  // Assets AFTER a given key in martingale order
  const getAssetsBehind = (wonKey) => {
    const index = martingaleOrder.indexOf(wonKey);
    return index === -1 ? [] : martingaleOrder.slice(index + 1);
  };

  // Assets BEFORE a given key in martingale order
  const getAssetsBefore = (wonKey) => {
    const index = martingaleOrder.indexOf(wonKey);
    return index === -1 ? [] : martingaleOrder.slice(0, index);
  };

  /**
   * Calculate each deficit-array asset's share of the working deficit.
   * Each asset's deficit stake = deficit / (odd - 1), because if it wins
   * you recover: stake * (odd - 1) = deficit.
   */
  const calculateDeficitShare = () => {
    if (!fixture || deficitArray.length === 0) return {};
    const shares = {};
    deficitArray.forEach((key) => {
      const odd = fixture[key] || 0;
      if (odd > 1.01) {
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

  /* ---------------- LOAD / SAVE ---------------- */

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

  const saveAll = async (payload) => {
    try {
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

    setFixture(found);
    setPressedWins(new Set());
    setWin(false);
    setWinArrayState(false);

    const newBase = baseStake;
    const deficitShares = (() => {
      // compute inline since state isn't updated yet
      if (deficitArray.length === 0) return {};
      const shares = {};
      deficitArray.forEach((key) => {
        const odd = found[key] || 0;
        if (odd > 1.01) {
          shares[key] = Math.round(deficit / (odd - 1));
        } else {
          shares[key] = 0;
        }
      });
      return shares;
    })();

    // Base winner amount
    let winnerAmount = Math.round(newBase / (found.winner)) || 10;
    winnerAmount = Math.max(winnerAmount, 10);

    let runningTarget = winnerAmount;
    const newPending = { winnerAmount };

    specialKeys.forEach((key) => {
      const odd = found[key] || 0;
      if (odd > 1.01) {
        let stakeAmount = Math.round(runningTarget / (odd - 1));

        if (!deficitArray.includes(key)) {
          stakeAmount = Math.max(stakeAmount, 10);
        } else {
          stakeAmount = Math.max(stakeAmount, 1);
          // Add deficit martingale stake on top
          const defShare = deficitShares[key] || 0;
          if (defShare > 0) {
            const additionalStake = Math.max(Math.round(defShare / (odd - 1)), 1);
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
    setDeficitArray([]);
    setWinArrayState(false);
    setPendingStakes((prev) => ({ ...prev, winnerAmount: 0 }));
    setPressedWins((prev) => new Set([...prev, "winner"]));
    setWin(false);
  };

  /* ------------------------------------------------------------------ */
  /*  MARTINGALE WIN HANDLER                                             */
  /*                                                                     */
  /*  KEY RULE:                                                          */
  /*  - A deficit-array win  → that asset's normal also won             */
  /*    (residues of both streams → bigDeficit)                         */
  /*  - A normal win with NO deficit-array win → deficit stakes are     */
  /*    treated as a TOTAL LOSS → all deficit stakes → bigDeficit       */
  /* ------------------------------------------------------------------ */

  const handleWin = (type) => {
    if (!fixture) return;

    const dShares = calculateDeficitShare();
    const normalStake = pendingStakes[type] || 0;

    if (normalStake === 0) return;

    // Mark button as pressed
    setPressedWins((prev) => new Set([...prev, type]));

    const behindKeys  = getAssetsBehind(type);
    const beforeKeys  = getAssetsBefore(type);
    const isInDeficitArray = deficitArray.includes(type);

    // Normal residue = sum of normal stakes AFTER won asset
    const normalResidue = behindKeys.reduce((sum, k) => sum + (pendingStakes[k] || 0), 0);

    // Deficit residue = sum of deficit stakes AFTER won asset
    const deficitResidue = behindKeys.reduce((sum, k) => sum + (dShares[k] || 0), 0);

    // Normal "before" total (used to cancel out already-lost stakes on 2nd+ wins)
    const normalBeforeTotal = beforeKeys.reduce((sum, k) => sum + (pendingStakes[k] || 0), 0);

    // Deficit "before" total (used to cancel out already-lost stakes on 2nd+ wins)
    const deficitBeforeTotal = beforeKeys.reduce((sum, k) => sum + (dShares[k] || 0), 0);

    // Total of ALL deficit stakes across every asset (needed when treating deficit as full loss)
    const totalDeficitStaked = Object.values(dShares).reduce((sum, v) => sum + v, 0);

    if (!win) {
      /* ====================================================
         FIRST WIN OF THIS GAME
         ==================================================== */
      setWin(true);

      if (isInDeficitArray) {
        /* --- Deficit-array asset won (normal also won for it) --- */
        setWinArrayState(true);

        // Working deficit is recovered — clear it
        setDeficit(0);

        // Remove won asset from array
        setDeficitArray((prev) => prev.filter((item) => item !== type));

        // Residues of BOTH normal and deficit streams go to bigDeficit
        const totalResidue = normalResidue + deficitResidue;
        if (totalResidue > 0) {
          setBigDeficit((prev) => prev + totalResidue);
        }
      } else {
        /* --- Normal asset won; deficit array did NOT win --- */

        // Add this normal asset to deficit array for next game
        setDeficitArray((prev) => [...prev, type]);

        // Normal residue goes to bigDeficit
        if (normalResidue > 0) {
          setBigDeficit((prev) => prev + normalResidue);
        }

        // ALL deficit stakes are a total loss → go to bigDeficit
        if (totalDeficitStaked > 0) {
          setBigDeficit((prev) => prev + totalDeficitStaked);
        }
      }
    } else {
      /* ====================================================
         SECOND+ WIN OF THIS GAME
         ==================================================== */

      if (isInDeficitArray) {
        /* --- Deficit-array asset won --- */
        if(!winArrayState){
           setWinArrayState(true);
        setDeficit(0);
        setDeficitArray((prev) => prev.filter((item) => item !== type));
        // Cancel out: subtract normal-before + winnerAmount from bigDeficit
        const toSubtract = deficitBeforeTotal + (deficit || 0);
        if(bigDeficit > toSubtract){
        setBigDeficit((prev) => Math.max(0, prev - toSubtract));
        }else{
          const residue = toSubtract - bigDeficit
          setBigDeficit(0)
          setDeficit((prev) => Math.max(0, prev - residue));
        }

        }
       

        
        // // Residues of both streams still go to bigDeficit
        // const totalResidue = normalResidue + deficitResidue;
        // if (totalResidue > 0) {
        //   setBigDeficit((prev) => prev + totalResidue);
        // }
      } else {
        /* --- Normal asset won; deficit array still did NOT win --- */

        if (!deficitArray.includes(type)) {
          setDeficitArray((prev) => [...prev, type]);
        }

        // Cancel out: subtract normal-before + winnerAmount from bigDeficit
        const toSubtract = normalBeforeTotal + (pendingStakes.winnerAmount || 0);
       if(bigDeficit > toSubtract){
        setBigDeficit((prev) => Math.max(0, prev - toSubtract));
        }else{
          const residue = toSubtract - bigDeficit
          setBigDeficit(0)
          setDeficit((prev) => Math.max(0, prev - residue));
        }

        // Normal residue → bigDeficit
        // if (normalResidue > 0) {
        //   setBigDeficit((prev) => prev + normalResidue);
        // }

        // // ALL deficit stakes are still a total loss → go to bigDeficit
        // if (totalDeficitStaked > 0) {
        //   setBigDeficit((prev) => prev + totalDeficitStaked);
        // }
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /*  NEXT GAME                                                          */
  /*                                                                     */
  /*  Scenarios:                                                         */
  /*  A) No win at all      → ALL stakes (normal + deficit) → bigDeficit*/
  /*  B) Normal win only    → losses already handled in handleWin        */
  /*  C) Deficit-array win  → losses already handled in handleWin        */
  /*                                                                     */
  /*  After accounting, rebalance: pool → deficit (max 1000) + bigDef   */
  /* ------------------------------------------------------------------ */

  const handleNextGame = () => {
    if (!fixture) return;

    const dShares = calculateDeficitShare();

    const totalNormalStaked = Object.values(pendingStakes).reduce(
      (sum, val) => sum + (val || 0), 0
    );
    const totalDeficitStaked = Object.values(dShares).reduce(
      (sum, val) => sum + (val || 0), 0
    );

    // Use refs to compute final values synchronously before setting state
    let newBigDeficit = bigDeficit;
    let newDeficit    = deficit;

    if (!win && !winArrayState) {
      /* Scenario A: no win at all — everything is a loss */
      newBigDeficit += totalNormalStaked + totalDeficitStaked;
    }
    // Scenarios B & C: all loss accounting was done inside handleWin already.
    // bigDeficit state was updated there; read latest via bigDeficit variable.
    // (React batches setState so newBigDeficit = bigDeficit is the pre-batch value.
    //  We need to rely on functional updates for safety — see below.)

    /* --- Rebalance pool --- */
    // We'll do this via functional updates to pick up any handleWin changes.
    if (!win && !winArrayState) {
      // Scenario A: we computed newBigDeficit inline, apply directly
      const pool = newBigDeficit + newDeficit;
      if (pool > 1000) {
        setDeficit(1000);
        setBigDeficit(pool - 1000);
      } else {
        setDeficit(pool);
        setBigDeficit(0);
      }
    } else {
      // Scenarios B & C: bigDeficit was mutated by handleWin via setState,
      // so we must use functional updates to read the latest value.
      setBigDeficit((latestBig) => {
        const pool = latestBig + deficit; // deficit unchanged by handleWin in these paths
        if (pool > 1000) {
          setDeficit(1000);
          return pool - 1000;
        } else {
          setDeficit(pool);
          return 0;
        }
      });
    }

    /* --- If deficit array martingale won, clear it --- */
    if (winArrayState) {
      setDeficitArray([]);
    }

    /* --- Reset game state --- */
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

    // Save with the latest computed values
    // Note: saveAll is called after a short delay so React state has settled
    setTimeout(() => {
      saveAll({
        base: Math.max(10000, baseRef.current),
        deficit: newDeficit,
        bigDeficit: newBigDeficit,
        deficitArray: winArrayState ? [] : deficitArray,
        winArrayState: false,
      });
    }, 300);
  };

  /* ---------------- DERIVED VALUES FOR DISPLAY ---------------- */

  const isButtonPressed = (key) => pressedWins.has(key);
  const isGameLoaded = !!fixture;
  const totalWinnerAmount = pendingStakes.winnerAmount;
  const deficitShares = calculateDeficitShare();

  // Merged display stakes (normal + deficit share)
  const mergedStakes = Object.fromEntries(
    specialKeys.map((key) => [
      key,
      (pendingStakes[key] || 0) + (deficitShares[key] || 0),
    ])
  );

  /* ---------------- RENDER ---------------- */

  return (
    <div>
      {/* ==================== DESKTOP ==================== */}
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
              {/* 6-0 / Jackpot button */}
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
                    title={
                      isInArray
                        ? `Normal: ${pendingStakes[key]} | Deficit: ${deficitShares[key] || 0} | Total: ${displayValue}`
                        : `Stake: ${displayValue}`
                    }
                  >
                    {specialLabels[key]}<br />
                    ({displayValue || "–"})
                  </button>
                );
              })}
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

      {/* ==================== MOBILE ==================== */}
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
