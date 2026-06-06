
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {
  /* ---------- INPUTS ---------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  /* ---------- FIXTURE ---------- */
  const [fixture, setFixture] = useState(null);
  const [week, setWeek] = useState(0);

  /* ---------- ENGINE FINANCES ---------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit, setDeficit] = useState(0);

  /* ---------- ASSET HOOKS ---------- */
  const arrayedAssets = ["f0", "e0", "e1", "4-2", "3-3", "1-3", "0-3", "2-3", "0-4", "1-4", "2-4", "12", "21"];

  const [arrayDeficits, setArrayDeficits] = useState({
    "f0": 0, "e0": 0, "e1": 0, "4-2": 0, "3-3": 0,
    "1-3": 0, "0-3": 0, "2-3": 0, "0-4": 0, "1-4": 0, "2-4": 0, "12": 0, "21": 0
  });

  const [arrayStakes, setArrayStakes] = useState({});
  const [wonArrayAssets, setWonArrayAssets] = useState(new Set());
  const [winnerAmount, setWinnerAmount] = useState(0);
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  const assetLabels = {
    "f0": "F0", "e0": "E0", "e1": "E1", "4-2": "4-2", "3-3": "3-3",
    "1-3": "1-3", "0-3": "0-3", "2-3": "2-3", "0-4": "0-4", "1-4": "1-4", "2-4": "2-4",
    "12": "1-2", "21": "2-1"
  };

  const assetToOddsKey = {
    "f0": "f0", "e0": "e0", "e1": "e1", "4-2": "fourTwo", "3-3": "threeThree",
    "1-3": "oneThree", "0-3": "zeroThree", "2-3": "twoThree", "0-4": "zeroFour",
    "1-4": "oneFour", "2-4": "twoFour", "12": "oneTwo", "21": "twoOne"
  };

  /* ================================================================
      API INTEGRATION
     ================================================================ */
  const fetchBase = useCallback(async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) {
        setBaseStake(res.data.base || 10000);
        setBaseDeficit(res.data.baseDeficit || 0);
        setDeficit(res.data.deficit || 0);
        setWeek(res.data.week || 0);
        setArrayDeficits(res.data.arrayDeficits || {
          "f0": 0, "e0": 0, "e1": 0, "4-2": 0, "3-3": 0,
          "1-3": 0, "0-3": 0, "2-3": 0, "0-4": 0, "1-4": 0, "2-4": 0, "12": 0, "21": 0
        });
        setWonArrayAssets(new Set(res.data.wonArrayAssets || []));
      }
    } catch (err) {
      console.error("❌ fetch failed:", err.message);
    } finally {
      setIsReloading(false);
    }
  }, []);

  const saveBase = useCallback(async (overrides = {}) => {
    try {
      await axios.put(API_BASE, {
        base: baseRef.current,
        baseDeficit,
        deficit,
        week,
        arrayDeficits,
        wonArrayAssets: Array.from(wonArrayAssets),
        ...overrides
      });
      console.log("✅ Saved");
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  }, [baseDeficit, deficit, week, arrayDeficits, wonArrayAssets]);

  useEffect(() => {
    fetchBase();
  }, [fetchBase]);

  /* ================================================================
      HANDLE CALCULATE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) {
      alert(`No matches discovered for "${home}" vs "${away}"`);
      return;
    }

    setWeek((prev) => prev + 1);
    setFixture(found);
    setClicked(new Set());

    // Main 6-0 Line Calculation
    const targetBase = baseStake + deficit;
    setBaseStake(targetBase);
    setDeficit(0);

    let calculated60 = Math.max(10, Math.round(targetBase / found.winner));
    setWinnerAmount(calculated60);

    // Active Assets Stakes (Flat 10 max strategy)
    const nextStakes = {};
    for (const asset of arrayedAssets) {
      if (wonArrayAssets.has(asset)) continue;
      const key = assetToOddsKey[asset];
      if (found[key] && found[key] > 1.01) {
        nextStakes[asset] = 10;
      }
    }
    setArrayStakes(nextStakes);
  };

  /* ================================================================
      RESOLVE ASSET WIN STRATEGY
     ================================================================ */
  const resolveArrayAssetWin = (asset) => {
    if (!fixture) return;

    setClicked((prev) => new Set([...prev, asset]));
    
    const newWonSet = new Set([...wonArrayAssets, asset]);
    setWonArrayAssets(newWonSet);

    // Reset targeted asset parameters cleanly
    setArrayDeficits((prev) => ({ ...prev, [asset]: 0 }));
    clearForNext(baseStake, baseDeficit, deficit, { ...arrayDeficits, [asset]: 0 }, newWonSet);
  };

  /* ================================================================
      MAIN GAME SKIP OR MISS (LOSS RESOLUTION)
     ================================================================ */
  const handleGameLossResolution = () => {
    if (!fixture) return;

    let totalBaseStakePush = 0;
    const updatedDeficits = { ...arrayDeficits };

    // Accumulate losses and test for the 10,000 baseline trigger limit
    for (const asset of arrayedAssets) {
      if (wonArrayAssets.has(asset)) continue;
      
      const currentStakeValue = arrayStakes[asset] || 0;
      if (currentStakeValue > 0) {
        let ongoingDeficit = (updatedDeficits[asset] || 0) + currentStakeValue;
        
        if (ongoingDeficit >= 10000) {
          totalBaseStakePush += ongoingDeficit;
          ongoingDeficit = 0; // Return asset to 0 tracking state
        }
        updatedDeficits[asset] = ongoingDeficit;
      }
    }

    // Capture main line parameters logic rules
    const nextDeficitPool = winnerAmount;
    const nextAccumulatedDef = baseDeficit + winnerAmount;
    const finalBaseStake = baseStake + totalBaseStakePush;

    setArrayDeficits(updatedDeficits);
    setDeficit(nextDeficitPool);
    setBaseDeficit(nextAccumulatedDef);
    setBaseStake(finalBaseStake);

    // Clean Season reset trigger sequence at Week 38
    if (week >= 38) {
      let unrecoveredDeficits = 0;
      for (const asset of arrayedAssets) {
        if (!wonArrayAssets.has(asset)) {
          unrecoveredDeficits += updatedDeficits[asset] || 0;
        }
        updatedDeficits[asset] = 0;
      }

      const finalBaseWithSeasonClose = finalBaseStake + unrecoveredDeficits;
      setBaseStake(finalBaseWithSeasonClose);
      setBaseDeficit(0);
      setDeficit(0);
      setArrayDeficits(updatedDeficits);
      setWonArrayAssets(new Set());
      setWeek(0);

      clearForNext(finalBaseWithSeasonClose, 0, 0, updatedDeficits, new Set());
      return;
    }

    clearForNext(finalBaseStake, nextAccumulatedDef, nextDeficitPool, updatedDeficits, wonArrayAssets);
  };

  /* ================================================================
      6-0 JACKPOT ROUTE HIT
     ================================================================ */
  const handleJackpot60 = () => {
    setClicked((prev) => new Set([...prev, "six"]));
    setBaseStake(10000);
    setBaseDeficit(0);
    setDeficit(0);
  };

  /* ================================================================
      CLEAR & AUTOSAVE UTILITY
     ================================================================ */
  const clearForNext = (
    nxtBase = baseStake, 
    nxtBaseDef = baseDeficit, 
    nxtDef = deficit, 
    nxtArrDef = arrayDeficits, 
    nxtWonSet = wonArrayAssets
  ) => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setArrayStakes({});
    setWinnerAmount(0);
    setClicked(new Set());
    
    saveBase({
      base: nxtBase,
      baseDeficit: nxtBaseDef,
      deficit: nxtDef,
      arrayDeficits: nxtArrDef,
      wonArrayAssets: Array.from(nxtWonSet)
    });
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-black to-slate-900 text-white flex flex-col font-sans select-none">
      
      {/* HEADER BAR */}
      <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0 border-b border-white/5 bg-black/20">
        <h1 className="text-sm font-black text-slate-300 tracking-wider uppercase flex items-center gap-2">
          ⚡ Engine Matrix
          <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-md font-black">
            WK {week}/38
          </span>
        </h1>
        <div className="flex rounded-lg overflow-hidden shadow-lg border border-white/10">
          <button onClick={() => saveBase()} className="px-3 py-1.5 bg-emerald-600 font-bold text-white text-xs hover:bg-emerald-700 transition">
            💾 Save
          </button>
          <button onClick={fetchBase} disabled={isReloading} className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 font-bold text-white text-xs hover:bg-slate-700 transition disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
            {isReloading ? "..." : "Reload"}
          </button>
        </div>
      </div>

      {/* CORE FRAME LAYOUT */}
      <div className="flex-1 flex flex-col justify-center px-4 pb-6 gap-4 overflow-y-auto max-w-md mx-auto w-full">
        
        {/* PRIMARY 6-0 TRIGGER ENGINE BUTTON */}
        <button
          onClick={handleJackpot60}
          disabled={!fixture}
          className={`w-full py-5 rounded-2xl font-black transition active:scale-95 border-b-4 text-center ${
            clicked.has("six")
              ? "bg-white text-emerald-600 border-emerald-300"
              : !fixture 
              ? "bg-slate-900 border-slate-950 opacity-30 cursor-not-allowed"
              : "bg-yellow-400 text-black border-yellow-600 hover:bg-yellow-300 shadow-yellow-500/10 shadow-xl"
          }`}
        >
          <div className="text-[10px] uppercase font-black tracking-widest opacity-70">6–0 Main Line Winner</div>
          <div className="text-2xl font-black tracking-tight mt-0.5">{winnerAmount || "—"}</div>
        </button>

        {/* PENDING ASSET MATRIX DISPLAY POOL */}
        <div className="grid grid-cols-4 gap-2">
          {arrayedAssets.map((asset) => {
            if (wonArrayAssets.has(asset)) return null;

            const stakeAmount = arrayStakes[asset];
            const deficitAmount = arrayDeficits[asset];
            const isSelectable = fixture && stakeAmount;

            return (
              <button
                key={asset}
                onClick={() => resolveArrayAssetWin(asset)}
                disabled={!isSelectable}
                className={`py-3.5 rounded-xl font-black text-center transition tracking-tight border-b-2 flex flex-col justify-center items-center ${
                  clicked.has(asset)
                    ? "bg-white text-purple-600 border-purple-300"
                    : !isSelectable
                    ? "bg-slate-900/40 border-slate-950 opacity-25 cursor-not-allowed text-slate-500"
                    : "bg-purple-600 text-white border-purple-800 hover:bg-purple-500 shadow-lg"
                }`}
              >
                <div className="text-xs opacity-90 font-black">{assetLabels[asset]}</div>
                <div className="text-sm font-black mt-0.5">{stakeAmount || 10}</div>
                {deficitAmount > 0 && (
                  <div className="text-[8px] mt-0.5 px-1 bg-black/40 text-yellow-400 rounded font-bold">
                    {deficitAmount}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* CONTROLS AREA */}
        <div className="space-y-2 mt-2">
          <div className="flex items-center gap-2">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="Home"
              className="flex-1 min-w-0 px-3 py-3 border border-slate-800 rounded-xl text-center text-sm bg-slate-900/60 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-extrabold uppercase tracking-wider"
            />
            <span className="font-black text-sm text-slate-600 shrink-0 tracking-widest">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="Away"
              className="flex-1 min-w-0 px-3 py-3 border border-slate-800 rounded-xl text-center text-sm bg-slate-900/60 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-extrabold uppercase tracking-wider"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!!fixture}
              className={`flex-1 py-3.5 font-black text-xs tracking-wider rounded-xl transition active:scale-95 uppercase border-b-2 ${
                fixture
                  ? "bg-slate-900 border-slate-950 text-slate-600 cursor-not-allowed opacity-40"
                  : "bg-slate-100 hover:bg-white text-black border-slate-300"
              }`}
            >
              Calculate Setup
            </button>
            <button
              onClick={handleGameLossResolution}
              disabled={!fixture}
              className={`flex-1 py-3.5 font-black text-xs tracking-wider rounded-xl transition active:scale-95 uppercase border-b-2 ${
                !fixture
                  ? "bg-slate-900 border-slate-950 text-slate-600 cursor-not-allowed opacity-40"
                  : "bg-red-600 hover:bg-red-500 border-red-800 text-white"
              }`}
            >
              Match Loss / Next
            </button>
          </div>
        </div>

        {/* METRICS TRACKING PANELS */}
        <div className="bg-slate-900/80 rounded-xl p-3 text-[11px] grid grid-cols-2 gap-x-4 gap-y-1.5 border border-white/5 shadow-inner">
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-slate-400">Base Investment:</span>
            <strong className="text-emerald-400 font-mono font-bold">{baseStake}</strong>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-slate-400">Current Loss Deficit:</span>
            <strong className="text-red-400 font-mono font-bold">{deficit}</strong>
          </div>
          <div className="col-span-2 flex justify-between border-b border-white/5 pb-1">
            <span className="text-slate-400">Accumulated Base Deficit:</span>
            <strong className="text-orange-400 font-mono font-bold">{baseDeficit}</strong>
          </div>
          
          <div className="col-span-2 mt-1">
            <div className="text-slate-500 font-bold text-center text-[10px] uppercase tracking-wider mb-1">
              Active Deficit Pool Assets
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
              {arrayedAssets.map(asset => (
                !wonArrayAssets.has(asset) && (
                  <div key={asset} className="flex justify-between bg-black/20 px-2 py-0.5 rounded border border-white/5">
                    <span className="text-slate-400 font-sans font-bold">{assetLabels[asset]}:</span>
                    <strong className="text-purple-400 font-bold">{arrayDeficits[asset]}</strong>
                  </div>
                )
              ))}
            </div>
          </div>

          {fixture && (
            <div className="col-span-2 pt-2 mt-1 border-t border-white/5 text-center tracking-widest font-black text-xs text-purple-400 uppercase">
              {teamA} ⚔️ {teamB}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
