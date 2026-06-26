import React, { useState, useEffect, useRef } from "react";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

/* ---------------- CONSTANTS & KEYS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

// Unified Master Array: All scores combined into one clear flow
const UNIFIED_KEYS = [
  "oneZero", "twoZero", "twoOne", "threeZero", "threeOne", "threeTwo",
  "fourZero", "fourOne", "fourTwo", "fiveZero", "fiveOne", "winner"
];

const UNIFIED_LABELS = {
  oneZero: "1–0", twoZero: "2–0", twoOne: "2–1",
  threeZero: "3–0", threeOne: "3–1", threeTwo: "3–2",
  fourZero: "4–0", fourOne: "4–1", fourTwo: "4–2",
  fiveZero: "5–0", fiveOne: "5–1", winner: "6–0"
};

const HDA_KEYS = ["home", "draw", "away"];
const HDA_LABELS = { home: "Home (H)", draw: "Draw (D)", away: "Away (A)" };

const CODE_MAP = {
  "HDA": ["home", "draw", "away"],
  "ADH": ["away", "draw", "home"],
  "DHA": ["draw", "home", "away"]
};

const emptyStakesMap = () => {
  const obj = { normalWinner: 0 };
  [...UNIFIED_KEYS, ...HDA_KEYS].forEach(k => { obj[k] = 0; });
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

  /* ---------- TWO COHESIVE DEFICIT STATES + BASE ---------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [finalDeficit, setFinalDeficit] = useState(0);

  /* ---------- STAKES & SETTLEMENTS ---------- */
  const [gameStakes, setGameStakes] = useState(emptyStakesMap());
  const [winnerKey, setWinnerKey] = useState(null);

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     LOCAL STORAGE SYNC
     ================================================================ */
  const fetchBase = () => {
    setIsReloading(true);
    try {
      const localData = localStorage.getItem("virtual_epl_data");
      if (localData) {
        const data = JSON.parse(localData);
        setBaseStake(data.base ?? 10000);
        setSmallDeficit(data.smallDeficit ?? 0);
        setFinalDeficit(data.finalDeficit ?? 0);
        console.log("✅ State loaded from LocalStorage");
      }
    } catch (err) {
      console.error("❌ LocalStorage read failure:", err.message);
    } finally {
      setTimeout(() => setIsReloading(false), 400);
    }
  };

  const saveBase = (overrides = {}) => {
    try {
      const dataToSave = {
        base: overrides.baseStake ?? baseRef.current,
        smallDeficit: overrides.smallDeficit ?? smallDeficit,
        finalDeficit: overrides.finalDeficit ?? finalDeficit,
      };
      localStorage.setItem("virtual_epl_data", JSON.stringify(dataToSave));
      console.log("✅ State saved to LocalStorage:", dataToSave);
    } catch (err) {
      console.error("❌ LocalStorage save failure:", err.message);
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

    if (isSmall) {
      // 1. Core jackpot calculation added directly to small deficit
      const jackpotOdd = found.winner || found.jackpot || 50;
      const jackpotStake = Math.max(Math.round(baseStake / jackpotOdd), 10);
      const updatedSmallDeficit = smallDeficit + jackpotStake;
      
      // 2. Compute Unified Array using (smallDeficit + finalDeficit) / (odd - 1)
      let totalArrayStakesSum = 0;
      const targetingDeficit = updatedSmallDeficit + finalDeficit;

      UNIFIED_KEYS.forEach((key) => {
        const odd = found[key] || 0;
        if (odd > 1.01) {
          calculatedStakes[key] = Math.max(Math.round(targetingDeficit / (odd - 1)), 10);
          totalArrayStakesSum += calculatedStakes[key];
        }
      });

      // 3. Pre-game Conveyor Belt: Push total stakes directly into finalDeficit
      const updatedFinalDeficit = finalDeficit + totalArrayStakesSum;

      setSmallDeficit(updatedSmallDeficit);
      setFinalDeficit(updatedFinalDeficit);

      saveBase({
        baseStake: baseStake,
        smallDeficit: updatedSmallDeficit,
        finalDeficit: updatedFinalDeficit
      });

    } else {
      // --- REGULAR ODD SYSTEM ---
      const jackpotOdd = found.winner || found.jackpot || 50;
      const normalJackpotStake = Math.max(Math.round(baseStake / jackpotOdd), 10);
      calculatedStakes["normalWinner"] = normalJackpotStake;

      let runningTotal = normalJackpotStake;
      const oddsMap = { home: found.win, draw: found.draw, away: found.lose };
      const codeSequence = found.code || "HDA";
      const sequence = CODE_MAP[codeSequence] || ["home", "draw", "away"];

      sequence.forEach((key) => {
        const odd = oddsMap[key] || 0;
        if (odd > 1.01) {
          const stake = Math.max(Math.round(runningTotal / (odd - 1)), 10);
          calculatedStakes[key] = stake;
          runningTotal += stake;
        }
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
    let nextFinalDeficit = finalDeficit;
    let nextBaseStake = baseStake;

    if (isSmallOddsGame) {
      if (winnerKey && UNIFIED_KEYS.includes(winnerKey)) {
        // Any win in the unified array makes small deficit 0 instantly
        nextSmallDeficit = 0;

        // Calculate After Total: total stakes of all assets AFTER the winning one
        const winnerIndex = UNIFIED_KEYS.indexOf(winnerKey);
        let afterTotalSum = 0;
        for (let i = winnerIndex + 1; i < UNIFIED_KEYS.length; i++) {
          afterTotalSum += gameStakes[UNIFIED_KEYS[i]] || 0;
        }

        // Push the after total directly into final deficit
        nextFinalDeficit = afterTotalSum;
      }
      // Total loss retains the values updated during handleSubmit
    } else {
      // --- REGULAR GAMES SETTLEMENT ---
      if (winnerKey) {
        if (winnerKey === "normalWinner") {
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

    setSmallDeficit(nextSmallDeficit);
    setFinalDeficit(nextFinalDeficit);
    setBaseStake(nextBaseStake);

    saveBase({
      baseStake: nextBaseStake,
      smallDeficit: nextSmallDeficit,
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
            <div>
              <div className="text-[9px] text-cyan-400 font-bold tracking-wider uppercase mb-1.5 ml-1">
                ✦ Unified Strategy Grid (Targets Small + Final Deficit)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {UNIFIED_KEYS.map((key) => {
                  const isActive = winnerKey === key;
                  const isJackpot = key === "winner";
                  return (
                    <button 
                      key={key} 
                      onClick={() => setWinnerKey(key)} 
                      className={`py-3.5 rounded-xl font-bold text-xs transition active:scale-95 flex flex-col items-center justify-center ${
                        isActive 
                          ? "bg-white text-green-600 ring-4 ring-green-500" 
                          : isJackpot
                            ? "bg-yellow-600/20 border border-yellow-500/60 text-white hover:bg-yellow-600/40"
                            : "bg-cyan-950/40 border border-cyan-900 text-white hover:bg-cyan-900/40"
                      }`}
                    >
                      <span className={`text-[10px] font-black ${isJackpot ? "text-yellow-300" : "text-cyan-300"}`}>
                        {UNIFIED_LABELS[key]}
                      </span>
                      <span className={`text-sm font-extrabold mt-0.5 ${isJackpot ? "text-yellow-400" : ""}`}>
                        {gameStakes[key] || "0"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* NORMAL ODDS INTERFACE */
            <div>
              <div className="text-[9px] text-blue-400 font-bold tracking-wider uppercase mb-1.5 ml-1">
                ✦ Standard Match Matrix
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setWinnerKey("normalWinner")} className={`w-full py-4 rounded-xl font-bold text-xs transition flex flex-col items-center justify-center ${winnerKey === "normalWinner" ? "bg-white text-green-600 ring-4 ring-green-500" : "bg-red-950/40 border border-red-800 text-white"}`}>
                  <span className="text-[11px] text-red-400 font-black uppercase">6–0 Jackpot Line</span>
                  <span className="text-lg font-black mt-0.5 text-yellow-400">{gameStakes["normalWinner"] || "0"}</span>
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
        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 text-sm grid grid-cols-3 gap-x-2 text-center font-mono">
          <div className="flex flex-col"><span className="text-gray-400 text-[10px]">Base Pool</span><strong className="text-green-400 text-xs">{baseStake}</strong></div>
          <div className="flex flex-col border-x border-white/10"><span className="text-gray-400 text-[10px]">Small Def</span><strong className="text-cyan-400 text-xs">{smallDeficit}</strong></div>
          <div className="flex flex-col"><span className="text-gray-400 text-[10px]">Final Def</span><strong className="text-purple-400 text-xs">{finalDeficit}</strong></div>
          
          {fixture && (
            <div className="col-span-3 pt-2 mt-2 border-t border-white/5 text-center font-sans tracking-wide">
              <span className="text-white font-black uppercase text-xs">{teamA}</span>
              <span className="text-red-500 mx-2 font-bold">vs</span>
              <span className="text-white font-black uppercase text-xs">{teamB}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
