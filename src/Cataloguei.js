
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

/* ---------------- CONSTANTS & KEYS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

// Array 1: Small Array (Targets smallDeficit)
const ARRAY_1_KEYS = ["oneZero", "twoZero", "twoOne", "threeZero", "threeOne", "threeTwo"];
const ARRAY_1_LABELS = {
  oneZero: "1–0", twoZero: "2–0", twoOne: "2–1",
  threeZero: "3–0", threeOne: "3–1", threeTwo: "3–2"
};

// Array 2: Big Array (Targets bigDeficit) - 6-0 is LAST
const ARRAY_2_KEYS = ["fourZero", "fourOne", "fourTwo", "fiveZero", "fiveOne", "winner"];
const ARRAY_2_LABELS = {
  fourZero: "4–0", fourOne: "4–1", fourTwo: "4–2",
  fiveZero: "5–0", fiveOne: "5–1", winner: "6–0"
};

// Normal Games Layout Sequence
const HDA_KEYS = ["home", "draw", "away"];
const HDA_LABELS = { home: "Home (H)", draw: "Draw (D)", away: "Away (A)" };

// Code mapping for HDA sequences
const CODE_MAP = {
  "HDA": ["home", "draw", "away"],
  "ADH": ["away", "draw", "home"],
  "DHA": ["draw", "home", "away"]
};

const emptyStakesMap = () => {
  const obj = { winner: 0, array2Winner: 0 };
  [...ARRAY_1_KEYS, ...ARRAY_2_KEYS, ...HDA_KEYS].forEach(k => { obj[k] = 0; });
  return obj;
};

const Homepage = () => {
  /* ---------- INPUTS ---------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  /* ---------- FIXTURE ---------- */
  const [fixture, setFixture] = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ---------- THE THREE DEFICIT STATES + BASE ---------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [bigDeficit, setBigDeficit] = useState(0);
  const [finalDeficit, setFinalDeficit] = useState(0);

  /* ---------- STAKES & SETTLEMENTS ---------- */
  const [gameStakes, setGameStakes] = useState(emptyStakesMap());
  const [winnerKey, setWinnerKey] = useState(null);

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     DATABASE SYNC
     ================================================================ */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) {
        setBaseStake(res.data.base || 10000);
        setSmallDeficit(res.data.smallDeficit || 0);
        setBigDeficit(res.data.bigDeficit || 0);
        setFinalDeficit(res.data.finalDeficit || 0);
      }
    } catch (err) {
      console.error("❌ Sync read failure:", err.message);
    } finally {
      setIsReloading(false);
    }
  };

  const saveBase = async (overrides = {}) => {
    try {
      await axios.put(API_BASE, {
        base: overrides.baseStake ?? baseRef.current,
        smallDeficit: overrides.smallDeficit ?? smallDeficit,
        bigDeficit: overrides.bigDeficit ?? bigDeficit,
        finalDeficit: overrides.finalDeficit ?? finalDeficit,
      });
      console.log("✅ Deficit states successfully synchronized");
    } catch (err) {
      console.error("❌ Sync save failure:", err.message);
    }
  };

  useEffect(() => {
    fetchBase();
  }, []);

  /* ================================================================
     SUBMIT / PRE-GAME CONVEYOR ENGINE
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    let found = smallOdds.find((o) => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!found) found = odds.find((o) => o.home === home && o.away === away);

    if (!found) {
      alert(`No odds mapped for "${home}" vs "${away}"`);
      return;
    }

    setIsSmallOddsGame(isSmall);
    setFixture(found);
    setWinnerKey(null);

    const calculatedStakes = emptyStakesMap();

    // Core master winner jackpot stake (always targets baseStake / odds)
    const jackpotOdd = found.winner || found.jackpot || 50;
    const winnerJackpotStake = Math.max(Math.round(baseStake / jackpotOdd), 10);
    calculatedStakes["winner"] = winnerJackpotStake;

    if (isSmall) {
      // 1. Array 1 targets the current smallDeficit + the master jackpot line risk
      const targetSmallDeficit = smallDeficit + winnerJackpotStake;
      ARRAY_1_KEYS.forEach((key) => {
        const odd = found[key] || 0;
        if (odd > 1.01) {
          calculatedStakes[key] = Math.max(Math.round(targetSmallDeficit / (odd - 1)), 10);
        }
      });

      // 2. Array 2 targets the current bigDeficit + current finalDeficit
      const targetBigDeficit = bigDeficit + finalDeficit;
      ARRAY_2_KEYS.forEach((key) => {
        const odd = found[key] || 0;
        if (odd > 1.01) {
          const computedStake = Math.max(Math.round(targetBigDeficit / (odd - 1)), 10);
          if (key === "winner") {
            calculatedStakes["array2Winner"] = computedStake;
          } else {
            calculatedStakes[key] = computedStake;
          }
        }
      });

      // CRITICAL FIX: DO NOT update state variables here. 
      // Deficits are only updated at the end of the round inside handleNext.

    } else {
      // --- REGULAR ODD SYSTEM ---
      const oddsMap = { home: found.win, draw: found.draw, away: found.lose };
      const codeSequence = found.code || "HDA";
      const sequence = CODE_MAP[codeSequence] || ["home", "draw", "away"];

      let runningTotal = winnerJackpotStake;
      sequence.forEach((key) => {
        const odd = oddsMap[key] || 0;
        if (odd > 1.01) {
          const stake = Math.max(Math.round(runningTotal / (odd - 1)), 10);
          calculatedStakes[key] = stake;
          runningTotal += stake;
        }
      });

      HDA_KEYS.forEach(key => {
        if (!calculatedStakes[key]) calculatedStakes[key] = 0;
      });
    }

    setGameStakes(calculatedStakes);
  };

  /* ================================================================
     POST-GAME SETTLEMENT ENGINE
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    let nextSmallDeficit = smallDeficit;
    let nextBigDeficit = bigDeficit;
    let nextFinalDeficit = finalDeficit;
    let nextBaseStake = baseStake;

    if (isSmallOddsGame) {
      // Sum up what was spent in this current round
      const array1Sum = ARRAY_1_KEYS.reduce((sum, k) => sum + (gameStakes[k] || 0), 0);
      const array2Sum = ARRAY_2_KEYS.reduce((sum, k) => {
        return sum + (k === "winner" ? (gameStakes["array2Winner"] || 0) : (gameStakes[k] || 0));
      }, 0);
      const jackpotRisk = gameStakes["winner"] || 0;

      if (winnerKey) {
        // --- CASE A: A WIN OCCURRED ---
        
        if (ARRAY_1_KEYS.includes(winnerKey)) {
          // 1. Small Array wins naturally -> Clear small deficit to 0
          nextSmallDeficit = 0; 

          // 2. Deduct winning asset and everything before it from Big Deficit
          const winnerIndex = ARRAY_1_KEYS.indexOf(winnerKey);
          let deductionSum = 0;
          for (let i = 0; i <= winnerIndex; i++) {
            deductionSum += gameStakes[ARRAY_1_KEYS[i]] || 0;
          }

          // Apply loss additions of unrecovered lines, then subtract the recovered win scoop
          nextBigDeficit = Math.max(0, bigDeficit + array1Sum - deductionSum);
          nextFinalDeficit = finalDeficit + array2Sum;

        } else if (ARRAY_2_KEYS.includes(winnerKey) || winnerKey === "array2Winner") {
          // 1. Big Array wins naturally -> Clear big deficit to 0
          nextBigDeficit = 0; 

          // 2. Deduct winning asset and everything before it from Final Deficit
          const targetKey = winnerKey === "array2Winner" ? "winner" : winnerKey;
          const winnerIndex = ARRAY_2_KEYS.indexOf(targetKey);
          let deductionSum = 0;
          for (let i = 0; i <= winnerIndex; i++) {
            const key = ARRAY_2_KEYS[i];
            deductionSum += (key === "winner") ? (gameStakes["array2Winner"] || 0) : (gameStakes[key] || 0);
          }

          // Small Deficit absorbs its unmitigated round losses
          nextSmallDeficit = smallDeficit + jackpotRisk;
          nextFinalDeficit = Math.max(0, finalDeficit + array2Sum - deductionSum);
        }
      } else {
        // --- CASE B: TOTAL LOSS (NO WINNER SELECTED) ---
        // Accumulate stakes entirely into their matching deficit pools
        nextSmallDeficit = smallDeficit + jackpotRisk;
        nextBigDeficit = bigDeficit + array1Sum;
        nextFinalDeficit = finalDeficit + array2Sum;
      }
    } else {
      // --- REGULAR ODD SYSTEM SETTLEMENT ---
      if (winnerKey) {
        if (winnerKey === "winner") {
          nextBaseStake = 10000;
        } else {
          const codeSequence = fixture.code || "HDA";
          const sequence = CODE_MAP[codeSequence] || ["home", "draw", "away"];
          const winnerIndex = sequence.indexOf(winnerKey);
          if (winnerIndex !== -1) {
            const lossSum = sequence.slice(winnerIndex + 1)
              .reduce((sum, key) => sum + (gameStakes[key] || 0), 0);
            nextBaseStake = baseStake + lossSum;
          } else {
            nextBaseStake = 10000;
          }
        }
      } else {
        const totalNormalStakes = HDA_KEYS.reduce((sum, k) => sum + (gameStakes[k] || 0), 0);
        nextBaseStake = baseStake + totalNormalStakes;
      }
    }

    // Commit cleared, added, or subtracted balances to local and db states
    setSmallDeficit(nextSmallDeficit);
    setBigDeficit(nextBigDeficit);
    setFinalDeficit(nextFinalDeficit);
    setBaseStake(nextBaseStake);

    saveBase({
      baseStake: nextBaseStake,
      smallDeficit: nextSmallDeficit,
      bigDeficit: nextBigDeficit,
      finalDeficit: nextFinalDeficit
    });

    clearForNext();
  };

  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setWinnerKey(null);
    setGameStakes(emptyStakesMap());
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">
      
      {/* HEADER CONTROLS */}
      <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0">
        <h1 className="text-base font-extrabold text-red-400 tracking-tight">
          Virtual EPL
          <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold align-middle ${isSmallOddsGame ? "bg-amber-500 text-black" : "bg-blue-600 text-white"}`}>
            {isSmallOddsGame ? "SMALL ODDS MODE" : "REGULAR MODE"}
          </span>
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={() => saveBase()} className="px-4 py-2 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">
            💾 Save
          </button>
          <button onClick={fetchBase} disabled={isReloading} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      {/* WORKSPACE INTERFACE */}
      <div className="flex-1 flex flex-col justify-center px-4 pb-6 gap-4 overflow-y-auto">
        
        <div className="w-full">
          <button onClick={handleNext} disabled={!fixture} className={`w-full py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-green-700 hover:bg-green-600 text-white"}`}>
            <div className="text-base font-black">NEXT MATCH</div>
            <div className="text-[9px] opacity-70 font-normal">Settle Matrix & Sync Pools</div>
          </button>
        </div>

        {fixture ? (
          isSmallOddsGame ? (
            <>
              {/* MASTER JACKPOT LINE (Targets Base Stake) */}
              <div>
                <div className="text-[9px] text-yellow-400 font-bold tracking-wider uppercase mb-1.5 ml-1">
                  ⚡ 6-0 Jackpot Line (Targets Base Stake)
                </div>
                <button 
                  onClick={() => setWinnerKey("winner")} 
                  className={`w-full py-4 rounded-xl font-bold text-sm transition flex flex-col items-center justify-center ${
                    winnerKey === "winner" 
                      ? "bg-white text-green-600 ring-4 ring-green-500" 
                      : "bg-yellow-600/30 border-2 border-yellow-500 text-white hover:bg-yellow-600/50"
                  }`}
                >
                  <span className="text-[12px] text-yellow-300 font-black uppercase">6–0 Master Winner Stake</span>
                  <span className="text-xl font-black mt-1 text-yellow-400">{gameStakes["winner"] || "0"}</span>
                </button>
              </div>

              {/* ARRAY 1 VIEW CONTAINER */}
              <div>
                <div className="text-[9px] text-cyan-400 font-bold tracking-wider uppercase mb-1.5 ml-1">
                  ✦ Array 1 Matrix (Targets Small Deficit)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ARRAY_1_KEYS.map((key) => {
                    const isActive = winnerKey === key;
                    return (
                      <button key={key} onClick={() => setWinnerKey(key)} className={`py-3.5 rounded-xl font-bold text-xs transition active:scale-95 flex flex-col items-center justify-center ${isActive ? "bg-white text-green-600 ring-4 ring-green-500" : "bg-cyan-950/60 border border-cyan-800 text-white hover:bg-cyan-900/60"}`}>
                        <span className="text-[10px] text-cyan-300 font-black">{ARRAY_1_LABELS[key]}</span>
                        <span className="text-sm font-extrabold mt-0.5">{gameStakes[key] || "0"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ARRAY 2 VIEW CONTAINER */}
              <div>
                <div className="text-[9px] text-purple-400 font-bold tracking-wider uppercase mb-1.5 ml-1">
                  ✦ Array 2 Matrix (Targets Big Deficit)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ARRAY_2_KEYS.map((key) => {
                    const isWinnerKey = key === "winner";
                    const isActive = isWinnerKey ? winnerKey === "array2Winner" : winnerKey === key;
                    
                    return (
                      <button 
                        key={key} 
                        onClick={() => setWinnerKey(isWinnerKey ? "array2Winner" : key)} 
                        className={`py-3.5 rounded-xl font-bold text-xs transition active:scale-95 flex flex-col items-center justify-center ${
                          isActive 
                            ? "bg-white text-green-600 ring-4 ring-green-500" 
                            : isWinnerKey 
                              ? "bg-purple-900/40 border border-yellow-500/60 text-white hover:bg-purple-900/60" 
                              : "bg-purple-950/60 border border-purple-800 text-white hover:bg-purple-900/60"
                        }`}
                      >
                        <span className={`text-[10px] font-black ${isWinnerKey ? "text-yellow-300" : "text-purple-300"}`}>
                          {ARRAY_2_LABELS[key]}
                        </span>
                        <span className={`text-sm font-extrabold mt-0.5 ${isWinnerKey ? "text-yellow-400" : ""}`}>
                          {isWinnerKey ? (gameStakes["array2Winner"] || "0") : (gameStakes[key] || "0")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* NORMAL ODDS INTERFACE */
            <div>
              <div className="text-[9px] text-blue-400 font-bold tracking-wider uppercase mb-1.5 ml-1">
                ✦ Standard Match Matrix
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setWinnerKey("winner")} className={`w-full py-4 rounded-xl font-bold text-xs transition flex flex-col items-center justify-center ${winnerKey === "winner" ? "bg-white text-green-600 ring-4 ring-green-500" : "bg-red-950/40 border border-red-800 text-white"}`}>
                  <span className="text-[11px] text-red-400 font-black uppercase">6–0 Jackpot Line</span>
                  <span className="text-lg font-black mt-0.5 text-yellow-400">{gameStakes["winner"] || "0"}</span>
                </button>

                <div className="grid grid-cols-3 gap-2">
                  {HDA_KEYS.map((key) => {
                    const isActive = winnerKey === key;
                    return (
                      <button key={key} onClick={() => setWinnerKey(key)} className={`py-4 rounded-xl font-bold text-xs transition active:scale-95 flex flex-col items-center justify-center ${isActive ? "bg-white text-green-600 ring-4 ring-green-500" : "bg-blue-950/60 border border-blue-800 text-white hover:bg-blue-900/60"}`}>
                        <span className="text-[11px] text-blue-300 font-black uppercase">{HDA_LABELS[key]}</span>
                        <span className="text-base font-black mt-1 text-yellow-400">{gameStakes[key] || "0"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        ) : null}

        {/* CONTROLS */}
        <div className="space-y-3 mt-2">
          <div className="flex items-center gap-3">
            <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home" className="flex-1 min-w-0 px-3 py-3 border border-red-900 rounded-xl text-center text-sm bg-black/40 text-white placeholder-red-700 focus:outline-none focus:border-red-500" />
            <span className="font-black text-xl text-red-600 shrink-0">VS</span>
            <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away" className="flex-1 min-w-0 px-3 py-3 border border-red-900 rounded-xl text-center text-sm bg-black/40 text-white placeholder-red-700 focus:outline-none focus:border-red-500" />
          </div>

          <button onClick={handleSubmit} disabled={!!fixture} className={`w-full py-4 font-black text-sm rounded-xl tracking-wide transition active:scale-95 shadow ${fixture ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-red-700 hover:bg-red-600 text-white"}`}>
            EXECUTE GAME ANALYSIS
          </button>
        </div>

        {/* METRICS PANELS */}
        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 text-xs grid grid-cols-2 gap-x-6 gap-y-2 font-mono">
          <div className="flex justify-between"><span className="text-gray-400">Base Pool</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Small Def</span><strong className="text-cyan-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Big Def</span><strong className="text-blue-400">{bigDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Final Def</span><strong className="text-purple-400">{finalDeficit}</strong></div>
          
          {fixture && (
            <div className="col-span-2 pt-2 mt-1 border-t border-white/5 text-center font-sans tracking-wide">
              <span className="text-white font-black uppercase">{teamA}</span>
              <span className="text-red-500 mx-2 font-bold">vs</span>
              <span className="text-white font-black uppercase">{teamB}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
