import React, { useState, useEffect, useRef } from "react";
import { odds } from "./Scores";
import axios from "axios";
import { FiRefreshCw } from 'react-icons/fi';

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

const Homepage = () => {
  /* ---------------- INPUTS ---------------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  /* ---------------- FIXTURE & FLAGS ---------------- */
  const [fixture, setFixture] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pressedWins, setPressedWins] = useState(new Set());
  const [jackpot, setJackpot] = useState(false);
  const [win, setWin] = useState(false);
  const [isReloading, setIsReloading] = useState(false);   // ← New for reload spinner
  /* ---------------- BASE ---------------- */
  const [winner, setWinner] = useState(0);
  const [shadow, setShadow] = useState(0);
  const [baseStake, setBaseStake] = useState(10000);
  const baseRef = useRef(10000);

  /* ---------------- BANK & CURRENT STATE ---------------- */
  const [deficitBank, setDeficitBank] = useState(0);
  const [deficit, setDeficit] = useState("");   // "astChe", "cheLee", etc.

  /* ==================== 14 CATEGORIZED STATES ==================== */
  const [cheLee, setCheLee] = useState(0);
  const [cheTot, setCheTot] = useState(0);
  const [cheWhu, setCheWhu] = useState(0);
  const [cheBur, setCheBur] = useState(0);
  const [bouChe, setBouChe] = useState(0);
  const [cheWol, setCheWol] = useState(0);
  const [leeChe, setLeeChe] = useState(0);
  const [cheNew, setCheNew] = useState(0);
  const [whuChe, setWhuChe] = useState(0);
  const [mnuChe, setMnuChe] = useState(0);
  const [cheAst, setCheAst] = useState(0);
  const [mncChe, setMncChe] = useState(0);
  const [breChe, setBreChe] = useState(0);
  const [astChe, setAstChe] = useState(0);
  /* ==================== 14 CATEGORIZED STATES ==================== */
 const [bigCheLee, setBigCheLee] = useState(0);
  const [bigCheTot, setBigCheTot] = useState(0);
  const [bigCheWhu, setBigCheWhu] = useState(0);
  const [bigCheBur, setBigCheBur] = useState(0);
  const [bigBouChe, setBigBouChe] = useState(0);
  const [bigCheWol, setBigCheWol] = useState(0);
  const [bigLeeChe, setBigLeeChe] = useState(0);
  const [bigCheNew, setBigCheNew] = useState(0);
  const [bigWhuChe, setBigWhuChe] = useState(0);
  const [bigMnuChe, setBigMnuChe] = useState(0);
  const [bigCheAst, setBigCheAst] = useState(0);
  const [bigMncChe, setBigMncChe] = useState(0);
  const [bigBreChe, setBigBreChe] = useState(0);
  const [bigAstChe, setBigAstChe] = useState(0);

  /* ---------------- SPECIAL STAKES ---------------- */
  const [pendingSpecialStakes, setPendingSpecialStakes] = useState({
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });

  const specialKeys = ["oneX", "twoX", "x2", "zeroGoals", "sixGoals", "ht12", "ht21", "ht30", "ft40", "ft41"];

  const specialLabels = {
    oneX: "1X", twoX: "2X", x2: "X2",
    zeroGoals: "0 GOALS", sixGoals: "6 GOALS",
    ht12: "HT 1-2", ht21: "HT 2-1", ht30: "HT 3-0",
    ft40: "FT 4-0", ft41: "FT 4-1",
  };

const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const fetchAll = async () => {
  setIsReloading(true);
  try {
    const res = await axios.get(API_BASE);
    const data = res.data || {};

    setBaseStake(data.base ?? 10000);
    setShadow(data.shadow ?? 0);
    setDeficitBank(data.deficitBank ?? 0);
    setWinner(data.winner ?? 0);
    setDeficit(data.deficit ?? "");
    setBigDeficit(data.deficit ?? "");
    setBadGameShadow(data.deficit ?? "");
    
 
    // Pending stakes
    if (data.pendingSpecialStakes) {
      const pendingObj = {};
      specialKeys.forEach(key => {
        pendingObj[key] = data.pendingSpecialStakes.get(key) ?? 0;
      });
      setPendingSpecialStakes(pendingObj);
    }

  } catch (err) {
    console.error("Fetch failed:", err.message);
  }finally {
      setIsReloading(false);
    }
};

const saveAll = async () => {
  try {
    const payload = {
      base: baseStake,
      shadow,
      deficitBank,
      winner,
      deficit,
      bigDeficit: bigDeficit,
      badGameShadow: bigShadow,
     
    };

    await axios.put(API_BASE, payload);
    console.log("✅ Saved successfully");
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  }
};


  // Martingale order for behind logic
  const martingaleOrder = ["oneX", "twoX", "x2", "zeroGoals", "sixGoals", "ht12", "ht21", "ht30", "ft40", "ft41"];

  const getAssetsBehind = (wonKey) => {
    const index = martingaleOrder.indexOf(wonKey);
    return index === -1 ? [] : martingaleOrder.slice(index + 1);
  };

 
  useEffect(() => {
    baseRef.current = baseStake;
  }, [baseStake]);

const handleLoadGame = (e) => {
  e.preventDefault();
  if (isLoading) return;

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

  let winnerAmount = Math.round(newBase / (found.winner)) || 10;
  winnerAmount = Math.max(winnerAmount, 10);
  setWinner(winnerAmount);

  // ================= DETERMINE DEFICIT =================
  let currentDeficitState = "";

  if (found.winner === 1226) { currentDeficitState = "astChe"; setAstChe(prev => prev + winnerAmount); }
  else if (found.winner === 1140) { currentDeficitState = "breChe"; setBreChe(prev => prev + winnerAmount); }
  else if (found.winner === 847) { currentDeficitState = "mncChe"; setMncChe(prev => prev + winnerAmount); }
  else if (found.winner === 568) { currentDeficitState = "cheAst"; setCheAst(prev => prev + winnerAmount); }
  else if (found.winner === 560) { currentDeficitState = "mnuChe"; setMnuChe(prev => prev + winnerAmount); }
  else if (found.winner === 416) { currentDeficitState = "whuChe"; setWhuChe(prev => prev + winnerAmount); }
  else if (found.winner === 327) { currentDeficitState = "cheNew"; setCheNew(prev => prev + winnerAmount); }
  else if (found.winner === 262) { currentDeficitState = "leeChe"; setLeeChe(prev => prev + winnerAmount); }
  else if (found.winner === 229) { currentDeficitState = "cheWol"; setCheWol(prev => prev + winnerAmount); }
  else if (found.winner === 168) { currentDeficitState = "bouChe"; setBouChe(prev => prev + winnerAmount); }
  else if (found.winner === 144) { currentDeficitState = "cheBur"; setCheBur(prev => prev + winnerAmount); }
  else if (found.winner === 105) { currentDeficitState = "cheWhu"; setCheWhu(prev => prev + winnerAmount); }
  else if (found.winner === 46.3) { currentDeficitState = "cheTot"; setCheTot(prev => prev + winnerAmount); }
  else if (found.winner === 66.1) { currentDeficitState = "cheLee"; setCheLee(prev => prev + winnerAmount); }

  setDeficit(currentDeficitState);

  // ================= FIXED RUNNING TARGET =================
  let runningTarget = 0;

  if (currentDeficitState === "astChe") runningTarget = astChe + winnerAmount;
  else if (currentDeficitState === "breChe") runningTarget = breChe + winnerAmount;
  else if (currentDeficitState === "mncChe") runningTarget = mncChe + winnerAmount;
  else if (currentDeficitState === "cheAst") runningTarget = cheAst + winnerAmount;
  else if (currentDeficitState === "mnuChe") runningTarget = mnuChe + winnerAmount;
  else if (currentDeficitState === "whuChe") runningTarget = whuChe + winnerAmount;
  else if (currentDeficitState === "cheNew") runningTarget = cheNew + winnerAmount;
  else if (currentDeficitState === "leeChe") runningTarget = leeChe + winnerAmount;
  else if (currentDeficitState === "cheWol") runningTarget = cheWol + winnerAmount;
  else if (currentDeficitState === "bouChe") runningTarget = bouChe + winnerAmount;
  else if (currentDeficitState === "cheBur") runningTarget = cheBur + winnerAmount;
  else if (currentDeficitState === "cheWhu") runningTarget = cheWhu + winnerAmount;
  else if (currentDeficitState === "cheTot") runningTarget = cheTot + winnerAmount;
  else if (currentDeficitState === "cheLee") runningTarget = cheLee + winnerAmount;

  // ✅ THIS is now correct
  setShadow(runningTarget);

  // ================= MARTINGALE =================
  const newPending = {};

  specialKeys.forEach((key) => {
    const odd = found[key] || 0;

    if (odd > 1.01) {
      const stake = Math.max(Math.round(runningTarget / (odd - 1)), 10);
      newPending[key] = stake;
      runningTarget += stake;
    } else {
      newPending[key] = 0;
    }
  });

  setPendingSpecialStakes(newPending);

  setIsLoading(false);
};
    
const handleWin = (type) => {
  if (!fixture || pendingSpecialStakes[type] === 0) return;

  setPressedWins((prev) => new Set([...prev, type]));

  const stakesSnapshot = { ...pendingSpecialStakes };
  const behindKeys = getAssetsBehind(type);
  const behindTotal = behindKeys.reduce((sum, k) => sum + (stakesSnapshot[k] || 0), 0);

  const beforeKeys = martingaleOrder.slice(0, martingaleOrder.indexOf(type));
  const beforeTotal = beforeKeys.reduce((sum, k) => sum + (stakesSnapshot[k] || 0), 0);

  const currentState = deficit;

  if (!win) {
    setWin(true);

    if (currentState === "astChe") setAstChe(behindTotal);
    else if (currentState === "breChe") setBreChe(behindTotal);
    else if (currentState === "mncChe") setMncChe(behindTotal);
    else if (currentState === "cheAst") setCheAst(behindTotal);
    else if (currentState === "mnuChe") setMnuChe(behindTotal);
    else if (currentState === "whuChe") setWhuChe(behindTotal);
    else if (currentState === "cheNew") setCheNew(behindTotal);
    else if (currentState === "leeChe") setLeeChe(behindTotal);
    else if (currentState === "cheWol") setCheWol(behindTotal);
    else if (currentState === "bouChe") setBouChe(behindTotal);
    else if (currentState === "cheBur") setCheBur(behindTotal);
    else if (currentState === "cheWhu") setCheWhu(behindTotal);
    else if (currentState === "cheTot") setCheTot(behindTotal);
    else if (currentState === "cheLee") setCheLee(behindTotal);

  } else {
    const totalToSubtract = beforeTotal + shadow;

    const handleDual = (value, bigValue, setValue, setBigValue) => {
      if (value >= totalToSubtract) {
        setValue(prev => prev - totalToSubtract);
      } else {
        const remain = totalToSubtract - value;
        setValue(0);

        if (bigValue > remain) {
          setBigValue(prev => prev - remain);
        } else {
          const remainder = remain - bigValue;
          setBigValue(0);
          setDeficitBank(prev => prev + remainder);
        }
      }
    };

    if (currentState === "astChe") {
      handleDual(astChe, bigAstChe, setAstChe, setBigAstChe);
    } else if (currentState === "breChe") {
      handleDual(breChe, bigBreChe, setBreChe, setBigBreChe);
    } else if (currentState === "mncChe") {
      handleDual(mncChe, bigMncChe, setMncChe, setBigMncChe);
    } else if (currentState === "cheAst") {
      handleDual(cheAst, bigCheAst, setCheAst, setBigCheAst);
    } else if (currentState === "mnuChe") {
      handleDual(mnuChe, bigMnuChe, setMnuChe, setBigMnuChe);
    } else if (currentState === "whuChe") {
      handleDual(whuChe, bigWhuChe, setWhuChe, setBigWhuChe);
    } else if (currentState === "cheNew") {
      handleDual(cheNew, bigCheNew, setCheNew, setBigCheNew);
    } else if (currentState === "leeChe") {
      handleDual(leeChe, bigLeeChe, setLeeChe, setBigLeeChe);
    } else if (currentState === "cheWol") {
      handleDual(cheWol, bigCheWol, setCheWol, setBigCheWol);
    } else if (currentState === "bouChe") {
      handleDual(bouChe, bigBouChe, setBouChe, setBigBouChe);
    } else if (currentState === "cheBur") {
      handleDual(cheBur, bigCheBur, setCheBur, setBigCheBur);
    } else if (currentState === "cheWhu") {
      handleDual(cheWhu, bigCheWhu, setCheWhu, setBigCheWhu);
    } else if (currentState === "cheTot") {
      handleDual(cheTot, bigCheTot, setCheTot, setBigCheTot);
    } else if (currentState === "cheLee") {
      handleDual(cheLee, bigCheLee, setCheLee, setBigCheLee);
    }

    setShadow(prev => prev + beforeTotal);
  }
};
  /* ---------------- JACKPOT (6-0) ---------------- */
  const handleJackpot = () => {
    if (!fixture) return;
    setJackpot(true);
    setBaseStake(10000);
    setWinner(0);
    setShadow(0);
    setPressedWins((prev) => new Set([...prev, "winner"]));
  };

const handleNextGame = () => {
  if (!fixture) return;

  const currentState = deficit;

  // ================= GET TOTAL REMAINING =================
  const totalRemaining = !win
    ? specialKeys.reduce((sum, key) => sum + (pendingSpecialStakes[key] || 0), 0)
    : 0;

  // ================= HELPER =================
  const process = (main, big, setMain, setBig) => {
    let newMain = main + totalRemaining;
    let newBig = big;

    // 🔼 OVERFLOW
    if (newMain > 10000) {
      const excess = newMain - 10000;
      newMain = 10000;
      newBig += excess;
    }

    // 🔽 UNDERFLOW (REVERSE)
    else if (newMain < 10000 && newBig > 0) {
      const missing = 10000 - newMain;

      if (newBig >= missing) {
        newMain = 10000;
        newBig -= missing;
      } else {
        newMain += newBig;
        newBig = 0;
      }
    }

    // ✅ SET ONCE (no stale state)
    setMain(newMain);
    setBig(newBig);
  };

  // ================= APPLY =================
  if (currentState === "astChe") {
    process(astChe, bigAstChe, setAstChe, setBigAstChe);
  } else if (currentState === "breChe") {
    process(breChe, bigBreChe, setBreChe, setBigBreChe);
  } else if (currentState === "mncChe") {
    process(mncChe, bigMncChe, setMncChe, setBigMncChe);
  } else if (currentState === "cheAst") {
    process(cheAst, bigCheAst, setCheAst, setBigCheAst);
  } else if (currentState === "mnuChe") {
    process(mnuChe, bigMnuChe, setMnuChe, setBigMnuChe);
  } else if (currentState === "whuChe") {
    process(whuChe, bigWhuChe, setWhuChe, setBigWhuChe);
  } else if (currentState === "cheNew") {
    process(cheNew, bigCheNew, setCheNew, setBigCheNew);
  } else if (currentState === "leeChe") {
    process(leeChe, bigLeeChe, setLeeChe, setBigLeeChe);
  } else if (currentState === "cheWol") {
    process(cheWol, bigCheWol, setCheWol, setBigCheWol);
  } else if (currentState === "bouChe") {
    process(bouChe, bigBouChe, setBouChe, setBigBouChe);
  } else if (currentState === "cheBur") {
    process(cheBur, bigCheBur, setCheBur, setBigCheBur);
  } else if (currentState === "cheWhu") {
    process(cheWhu, bigCheWhu, setCheWhu, setBigCheWhu);
  } else if (currentState === "cheTot") {
    process(cheTot, bigCheTot, setCheTot, setBigCheTot);
  } else if (currentState === "cheLee") {
    process(cheLee, bigCheLee, setCheLee, setBigCheLee);
  }

  // ================= RESET =================
  setPressedWins(new Set());
  setPendingSpecialStakes({
    oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
  });
  setWin(false);
  setWinner(0);
  setShadow(0);
  setJackpot(false);
  setFixture(null);
  setInputA("");
  setInputB("");
  setIsLoading(false);

  saveAll();
};
  
  const isButtonPressed = (key) => pressedWins.has(key);

  return (
    <div>
      {/* ====================== DESKTOP ====================== */}
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <h1 className="text-4xl md:text-5xl font-extrabold text-red-500 tracking-tight">
              Virtual EPL Strategy
            </h1>
            {/* <button 
              onClick={fetchAll} 
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm transition"
            >
              <FiRefreshCw className="w-4 h-4" /> Reload
            </button> */}
            <button 
              onClick={fetchAll} 
              disabled={isReloading}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-xl text-sm transition"
            >
              <FiRefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} /> 
              {isReloading ? "Reloading..." : "Reload"}
            </button>
          </div>
          <p className="text-red-400 mt-2">
            {fixture ? "MATCH LOADED" : "Ready"}
          </p>
        </div>

        <div className="max-w-6xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">
          {/* Buttons */}
          <div className="mb-8">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {/* 6-0 Button */}
              <button 
                onClick={handleJackpot} 
                disabled={!fixture || jackpot} 
                className={`py-6 rounded-2xl font-extrabold transition ${
                  jackpot ? "bg-green-500 text-white scale-105" : "bg-yellow-400 text-black hover:bg-yellow-500"
                }`}
              >
                6–0<br />({winner || "–"})
              </button>

              {/* Special Outcome Buttons */}
              {specialKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => handleWin(key)}
                  disabled={!fixture || pendingSpecialStakes[key] === 0 || isButtonPressed(key)}
                  className={`py-6 rounded-2xl font-medium text-sm transition ${
                    isButtonPressed(key)
                      ? "bg-green-500 text-white scale-105"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {specialLabels[key]}<br />
                  <span className="text-xs">({pendingSpecialStakes[key] || "–"})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Inputs + Action Buttons */}
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
                disabled={isLoading} 
                className="px-10 py-4 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xl rounded-2xl"
              >
                LOAD GAME
              </button>
              <button 
                onClick={handleNextGame} 
                className="px-10 py-4 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xl rounded-2xl"
              >
                NEXT GAME
              </button>
            </div>
          </div>

          {/* Stats */}
          {/* <div className="mt-10 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
            <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
            <div>Shadow: <strong className="text-green-600">{shadow}</strong></div>
            <div>Bank: <strong className="text-cyan-600">{deficitBank}</strong></div>
            
            <div>AstChe: <strong>{astChe}</strong> <span className="font-bold text-red-600">({bigAstChe})</span></div>

<div>CheAst: <strong>{cheAst}</strong> <span className="font-bold text-red-600">({bigCheAst})</span></div>

<div>BreChe: <strong>{breChe}</strong> <span className="font-bold text-red-600">({bigBreChe})</span></div>

<div>CheNew: <strong>{cheNew}</strong> <span className="font-bold text-red-600">({bigCheNew})</span></div>

<div>MncChe: <strong>{mncChe}</strong> <span className="font-bold text-red-600">({bigMncChe})</span></div>

<div>CheWol: <strong>{cheWol}</strong> <span className="font-bold text-red-600">({bigCheWol})</span></div>

<div>CheBur: <strong>{cheBur}</strong> <span className="font-bold text-red-600">({bigCheBur})</span></div>

<div>CheWhu: <strong>{cheWhu}</strong> <span className="font-bold text-red-600">({bigCheWhu})</span></div>

<div>CheTot: <strong>{cheTot}</strong> <span className="font-bold text-red-600">({bigCheTot})</span></div>

<div>CheLee: <strong>{cheLee}</strong> <span className="font-bold text-red-600">({bigCheLee})</span></div>
          </div> */}
          {/* Stats - Desktop */}
<div className="mt-10 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
  <div>Base: <strong className="text-green-600">{baseStake}</strong></div>
  <div>Shadow: <strong className="text-yellow-400">{shadow}</strong></div>
  <div>Bank: <strong className="text-cyan-600">{deficitBank}</strong></div>

  <div>AstChe: <strong>{astChe}</strong> <span className="font-bold text-red-500">({bigAstChe})</span></div>
  <div>CheAst: <strong>{cheAst}</strong> <span className="font-bold text-red-500">({bigCheAst})</span></div>
  <div>BreChe: <strong>{breChe}</strong> <span className="font-bold text-red-500">({bigBreChe})</span></div>
  <div>CheNew: <strong>{cheNew}</strong> <span className="font-bold text-red-500">({bigCheNew})</span></div>
  <div>MncChe: <strong>{mncChe}</strong> <span className="font-bold text-red-500">({bigMncChe})</span></div>
  <div>CheWol: <strong>{cheWol}</strong> <span className="font-bold text-red-500">({bigCheWol})</span></div>
  <div>CheBur: <strong>{cheBur}</strong> <span className="font-bold text-red-500">({bigCheBur})</span></div>
  <div>CheWhu: <strong>{cheWhu}</strong> <span className="font-bold text-red-500">({bigCheWhu})</span></div>
  <div>CheTot: <strong>{cheTot}</strong> <span className="font-bold text-red-500">({bigCheTot})</span></div>
  <div>CheLee: <strong>{cheLee}</strong> <span className="font-bold text-red-500">({bigCheLee})</span></div>

  <div>BouChe: <strong>{bouChe}</strong> <span className="font-bold text-red-500">({bigBouChe})</span></div>
  <div>LeeChe: <strong>{leeChe}</strong> <span className="font-bold text-red-500">({bigLeeChe})</span></div>
  <div>WhuChe: <strong>{whuChe}</strong> <span className="font-bold text-red-500">({bigWhuChe})</span></div>
  <div>MnuChe: <strong>{mnuChe}</strong> <span className="font-bold text-red-500">({bigMnuChe})</span></div>
</div>
        </div>
      </div>

      {/* Mobile version */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-6">

  {/* HEADER */}
  <div className="text-center mb-6">
    <h1 className="text-2xl font-extrabold text-red-500">Virtual EPL Strategy</h1>
    {/* <button 
      onClick={fetchAll} 
      className="mt-3 px-5 py-1.5 bg-red-700 hover:bg-red-600 text-xs rounded-xl transition flex items-center justify-center gap-1 mx-auto"
    >
      <FiRefreshCw className="w-4 h-4" /> Reload
    </button> */}
    <button 
            onClick={fetchAll}
            disabled={isReloading}
            className="mt-3 px-5 py-1.5 bg-red-700 hover:bg-red-600 disabled:bg-red-800 text-xs rounded-xl transition flex items-center justify-center gap-1 mx-auto"
          >
            <FiRefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} /> 
            {isReloading ? "Reloading..." : "Reload"}
          </button>
    <p className="text-red-400 text-xs mt-2">
      {fixture ? "MATCH LOADED" : "Ready"}
    </p>
  </div>

  {/* INPUTS */}
  <div className="flex gap-2 mb-6 justify-center items-center">
    <input 
      value={inputA} 
      onChange={(e) => setInputA(e.target.value)} 
      placeholder="Home" 
      className="flex-1 max-w-[105px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
    />
    <span className="text-xl text-red-500 font-black px-1">VS</span>
    <input 
      value={inputB} 
      onChange={(e) => setInputB(e.target.value)} 
      placeholder="Away" 
      className="flex-1 max-w-[105px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
    />
  </div>

  {/* LOAD + NEXT */}
  <div className="flex gap-3 mb-8">
    <button 
      onClick={handleLoadGame}
      disabled={isLoading} 
      className="flex-1 py-3 bg-red-700 hover:bg-red-600 rounded-2xl text-sm font-bold transition"
    >
      LOAD
    </button>
    <button 
      onClick={handleNextGame} 
      disabled={!fixture}
      className="flex-1 py-3 bg-green-700 hover:bg-green-600 rounded-2xl text-sm font-bold transition"
    >
      NEXT
    </button>
  </div>

  {/* OUTCOME BUTTONS */}
  <div className="mb-8">
    <div className="grid grid-cols-3 gap-2">

      {/* 6-0 */}
      <button 
        onClick={handleJackpot} 
        disabled={!fixture || jackpot} 
        className={`py-3 rounded-xl text-xs font-bold transition ${
          jackpot 
            ? "bg-green-500 text-white scale-105" 
            : "bg-yellow-500 text-black hover:bg-yellow-400"
        }`}
      >
        6–0<br />
        <span className="text-[10px]">({winner || "–"})</span>
      </button>

      {/* SPECIALS */}
      {specialKeys.map((key) => (
        <button
          key={key}
          onClick={() => handleWin(key)}
          disabled={!fixture || pendingSpecialStakes[key] === 0 || isButtonPressed(key)}
          className={`py-3 rounded-xl text-xs font-bold transition ${
            isButtonPressed(key)
              ? "bg-green-500 text-white scale-105"
              : "bg-blue-700 text-white hover:bg-blue-600"
          }`}
        >
          {specialLabels[key]}<br />
          <span className="text-[10px]">({pendingSpecialStakes[key] || "–"})</span>
        </button>
      ))}

    </div>
  </div>

  {/* STATS */}
  {/* <div className="bg-black/30 rounded-2xl p-4 text-xs grid grid-cols-2 gap-3 font-mono">

    <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
    <div>Shadow: <strong className="text-yellow-400">{shadow}</strong></div>
    <div>Bank: <strong className="text-cyan-400">{deficitBank}</strong></div>

    <div>AstChe: <strong>{astChe}</strong> <span className="font-bold text-red-500">({bigAstChe})</span></div>
    <div>CheAst: <strong>{cheAst}</strong> <span className="font-bold text-red-500">({bigCheAst})</span></div>
    <div>BreChe: <strong>{breChe}</strong> <span className="font-bold text-red-500">({bigBreChe})</span></div>
    <div>CheNew: <strong>{cheNew}</strong> <span className="font-bold text-red-500">({bigCheNew})</span></div>
    <div>MncChe: <strong>{mncChe}</strong> <span className="font-bold text-red-500">({bigMncChe})</span></div>
    <div>CheWol: <strong>{cheWol}</strong> <span className="font-bold text-red-500">({bigCheWol})</span></div>
    <div>CheBur: <strong>{cheBur}</strong> <span className="font-bold text-red-500">({bigCheBur})</span></div>
    <div>CheWhu: <strong>{cheWhu}</strong> <span className="font-bold text-red-500">({bigCheWhu})</span></div>
    <div>CheTot: <strong>{cheTot}</strong> <span className="font-bold text-red-500">({bigCheTot})</span></div>
    <div>CheLee: <strong>{cheLee}</strong> <span className="font-bold text-red-500">({bigCheLee})</span></div>

  </div> */}
  {/* STATS - Mobile */}
<div className="bg-black/30 rounded-2xl p-4 text-xs grid grid-cols-2 gap-3 font-mono mt-6">

  <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
  <div>Shadow: <strong className="text-yellow-400">{shadow}</strong></div>
  <div>Bank: <strong className="text-cyan-400">{deficitBank}</strong></div>

  <div>AstChe: <strong>{astChe}</strong> <span className="font-bold text-red-500">({bigAstChe})</span></div>
  <div>CheAst: <strong>{cheAst}</strong> <span className="font-bold text-red-500">({bigCheAst})</span></div>
  <div>BreChe: <strong>{breChe}</strong> <span className="font-bold text-red-500">({bigBreChe})</span></div>
  <div>CheNew: <strong>{cheNew}</strong> <span className="font-bold text-red-500">({bigCheNew})</span></div>
  <div>MncChe: <strong>{mncChe}</strong> <span className="font-bold text-red-500">({bigMncChe})</span></div>
  <div>CheWol: <strong>{cheWol}</strong> <span className="font-bold text-red-500">({bigCheWol})</span></div>
  <div>CheBur: <strong>{cheBur}</strong> <span className="font-bold text-red-500">({bigCheBur})</span></div>
  <div>CheWhu: <strong>{cheWhu}</strong> <span className="font-bold text-red-500">({bigCheWhu})</span></div>
  <div>CheTot: <strong>{cheTot}</strong> <span className="font-bold text-red-500">({bigCheTot})</span></div>
  <div>CheLee: <strong>{cheLee}</strong> <span className="font-bold text-red-500">({bigCheLee})</span></div>

  <div>BouChe: <strong>{bouChe}</strong> <span className="font-bold text-red-500">({bigBouChe})</span></div>
  <div>LeeChe: <strong>{leeChe}</strong> <span className="font-bold text-red-500">({bigLeeChe})</span></div>
  <div>WhuChe: <strong>{whuChe}</strong> <span className="font-bold text-red-500">({bigWhuChe})</span></div>
  <div>MnuChe: <strong>{mnuChe}</strong> <span className="font-bold text-red-500">({bigMnuChe})</span></div>
</div>

</div>
    </div>
  );
};

export default Homepage;