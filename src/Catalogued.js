
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {
  /* ---------- INPUTS ---------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  /* ---------- FIXTURE ---------- */
  const [fixture, setFixture] = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ---------- BASE & DEFICITS ---------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit, setDeficit] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);

  /* ---------- STAKES PER LINE ---------- */
  const [amounts, setAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------- CLICK INDICATORS ---------- */
  const [clicked, setClicked] = useState(new Set());

  /* ---------- REF FOR AUTOSAVE ---------- */
  const baseRef = useRef(baseStake);
  useEffect(() => {
    baseRef.current = baseStake;
  }, [baseStake]);

  /* ================================================================
      API & STORAGE
     ================================================================ */
  const fetchBase = useCallback(async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) {
        setBaseStake(res.data.base || 10000);
        setBaseDeficit(res.data.baseDeficit || 0);
        setDeficit(res.data.deficit || 0);
        setSmallDeficit(res.data.smallDeficit || 0);
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
        smallDeficit,
        ...overrides,
      });
      console.log("✅ Saved");
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  }, [baseDeficit, deficit, smallDeficit]);

  useEffect(() => {
    fetchBase();
  }, [fetchBase]);

  /* ================================================================
      BUILD LADDER FOR HDA
     ================================================================ */
  const buildLadder = (startTotal, type, code, oddsMap) => {
    let runningTotal = startTotal;
    const ladder = [];
    let homeAmount = 0, drawAmount = 0, awayAmount = 0;

    for (const step of code) {
      const odd = oddsMap[step];
      if (!odd || odd <= 1.01) continue;
      let stake = Math.round(runningTotal / (odd - 1));

      ladder.push({ step, stake, type });
      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;
      runningTotal += stake;
    }
    return { ladder, homeAmount, drawAmount, awayAmount };
  };

  /* ================================================================
      HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    let found = smallOdds.find((o) => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!found) found = odds.find((o) => o.home === home && o.away === away);

    if (!found) {
      alert(`No odds found for "${home}" vs "${away}"`);
      return;
    }

    setIsSmallOddsGame(isSmall);
    setFixture(found);
    setClicked(new Set());

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    const code = found.code || "";
    const newStakes = [];

    let targetWinner = 0;

    if (isSmall) {
      // Small game asset configuration: calculate COP target stake from smallDeficit pool
      let cop = smallDeficit > 0 ? Math.round(smallDeficit / found.winner) : 0;
      targetWinner = cop > 0 ? Math.max(cop, 1) : 0;

      // Accumulate the current winner stake directly into smallDeficit
      const nextSmallDeficit = smallDeficit + targetWinner;
      setSmallDeficit(nextSmallDeficit);

      // Build specific COP HDA chain
      const resCop = buildLadder(targetWinner, "COP", code, oddsMap);
      newStakes.push(...resCop.ladder);

      setAmounts({
        winnerAmount: targetWinner,
        homeAmount: resCop.homeAmount,
        drawAmount: resCop.drawAmount,
        awayAmount: resCop.awayAmount,
      });
    } else {
      // Standard game configuration
      const newBase6 = baseStake + deficit;
      setBaseStake(newBase6);
      setDeficit(0);

      targetWinner = Math.round(newBase6 / found.winner);
      const res6 = buildLadder(targetWinner, "6-0", code, oddsMap);
      newStakes.push(...res6.ladder);

      setAmounts({
        winnerAmount: targetWinner,
        homeAmount: res6.homeAmount,
        drawAmount: res6.drawAmount,
        awayAmount: res6.awayAmount,
      });
    }

    setOrderedStakes(newStakes);
  };

  /* ================================================================
      RESOLVE RESULT FOR HDA
     ================================================================ */
  const resolveResult = (step) => {
    if (!fixture) return;

    setClicked((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });

    const calcLoss = (type) => {
      const stakes = orderedStakes.filter((s) => s.type === type);
      const idx = stakes.findIndex((s) => s.step === step);
      if (idx === -1) return 0;
      return stakes.slice(idx + 1).reduce((sum, s) => sum + s.stake, 0);
    };

    let nextSmallDeficit = smallDeficit;
    let nextBaseStake = baseStake;
    let nextBaseDeficit = baseDeficit;
    let nextDeficit = deficit;

    if (isSmallOddsGame) {
      // Small Game Route: Losses fall into COP Deficit tracker
      const copLoss = calcLoss("COP");
      nextSmallDeficit += copLoss;

      // Trigger automatic baseline balance push if threshold cleared
      if (nextSmallDeficit >= 10000) {
        nextBaseStake += nextSmallDeficit;
        nextSmallDeficit = 0;
      }
    } else {
      // Standard 6-0 Route
      const mainLoss = calcLoss("6-0");
      nextDeficit = mainLoss;
      nextBaseDeficit += mainLoss;
    }

    setSmallDeficit(nextSmallDeficit);
    setBaseStake(nextBaseStake);
    setBaseDeficit(nextBaseDeficit);
    setDeficit(nextDeficit);

    clearForNext(nextBaseStake, nextBaseDeficit, nextDeficit, nextSmallDeficit);
  };

  /* ================================================================
      JACKPOT HANDLER
     ================================================================ */
  const handleJackpot = () => {
    if (!fixture) return;
    setClicked((prev) => {
      const next = new Set(prev);
      next.add("six");
      return next;
    });

    let nextSmallDeficit = smallDeficit;
    let nextBaseStake = baseStake;

    if (isSmallOddsGame) {
      // Direct COP target strike resets the small odds pool completely
      nextSmallDeficit = 0;
    } else {
      // Standard 6-0 strike handles default reset parameters
      nextBaseStake = 10000;
      setBaseDeficit(0);
      setDeficit(0);
    }

    setSmallDeficit(nextSmallDeficit);
    setBaseStake(nextBaseStake);
  };

  /* ================================================================
      CLEAR FOR NEXT
     ================================================================ */
  const clearForNext = (nxtBase = baseStake, nxtBaseDef = baseDeficit, nxtDef = deficit, nxtSmallDef = smallDeficit) => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setClicked(new Set());
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    saveBase({ base: nxtBase, baseDeficit: nxtBaseDef, deficit: nxtDef, smallDeficit: nxtSmallDef });
  };

  /* ================================================================
      DERIVED VARIABLES
     ================================================================ */
  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col font-sans">
      
      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0">
        <h1 className="text-base font-extrabold text-red-400 tracking-tight leading-tight uppercase">
          Virtual Engine
          {isSmallOddsGame && fixture && (
            <span className="ml-2 text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold align-middle">
              COP MODE
            </span>
          )}
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button
            onClick={() => saveBase()}
            className="px-4 py-2 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition"
          >
            💾 Save
          </button>
          <button
            onClick={fetchBase}
            disabled={isReloading}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50"
          >
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div className="flex-1 flex flex-col justify-center px-4 pb-6 gap-5 overflow-y-auto">

        {/* ── MAIN MERGED WINNER MATCH RESETSUBMIT BUTTON ── */}
        <button
          onClick={handleJackpot}
          disabled={!fixture}
          className={`w-full py-6 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow border-b-4 text-center ${
            clicked.has("six")
              ? "bg-white text-emerald-500 border-emerald-300"
              : !fixture 
              ? "bg-slate-800 border-slate-900 opacity-40 cursor-not-allowed"
              : isSmallOddsGame 
              ? "bg-blue-600 text-white border-blue-800 hover:bg-blue-500"
              : "bg-yellow-400 text-black border-yellow-600 hover:bg-yellow-300"
          }`}
        >
          <div className="text-xs uppercase opacity-70 font-black tracking-wider">
            {isSmallOddsGame ? "COP Winner Stake" : "6–0 Main Winner"}
          </div>
          <div className="text-2xl font-black mt-0.5">{amounts.winnerAmount || "–"}</div>
        </button>

        {/* ── HDA ROW ── */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white border-b-4 ${
              clicked.has("H")
                ? "bg-white text-green-600 border-green-300"
                : !fixture
                ? "bg-gray-700 border-gray-900 opacity-40 cursor-not-allowed"
                : "bg-green-600 border-green-800 hover:bg-green-500"
            }`}
          >
            <div className="text-base font-extrabold uppercase tracking-wide truncate px-1">{teamA}</div>
            <div className="text-lg font-black mt-1">{amounts.homeAmount || "–"}</div>
          </button>

          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white border-b-4 ${
              clicked.has("D")
                ? "bg-white text-gray-600 border-gray-300"
                : !fixture
                ? "bg-gray-700 border-gray-900 opacity-40 cursor-not-allowed"
                : "bg-gray-500 border-gray-700 hover:bg-gray-400"
            }`}
          >
            <div className="text-base font-extrabold tracking-wide">DRAW</div>
            <div className="text-lg font-black mt-1">{amounts.drawAmount || "–"}</div>
          </button>

          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white border-b-4 ${
              clicked.has("A")
                ? "bg-white text-red-600 border-gray-300"
                : !fixture
                ? "bg-gray-700 border-gray-900 opacity-40 cursor-not-allowed"
                : "bg-red-600 border-red-800 hover:bg-red-500"
            }`}
          >
            <div className="text-base font-extrabold uppercase tracking-wide truncate px-1">{teamB}</div>
            <div className="text-lg font-black mt-1">{amounts.awayAmount || "–"}</div>
          </button>
        </div>

        {/* ── INPUTS + ACTIONS ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="Home"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400 font-bold uppercase"
            />
            <span className="font-black text-xl text-red-500 shrink-0">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="Away"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400 font-bold uppercase"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={!!fixture}
              className={`flex-1 py-4 font-black text-xs tracking-wider rounded-xl transition active:scale-95 shadow uppercase ${
                fixture
                  ? "bg-gray-700 opacity-50 cursor-not-allowed text-white"
                  : "bg-red-700 hover:bg-red-600 text-white"
              }`}
            >
              Calculate Odds
            </button>
            <button
              onClick={() => clearForNext(baseStake, baseDeficit, deficit, smallDeficit)}
              disabled={!fixture}
              className={`flex-1 py-4 font-black text-xs tracking-wider rounded-xl transition active:scale-95 shadow uppercase ${
                !fixture
                  ? "bg-gray-700 opacity-50 cursor-not-allowed text-white"
                  : "bg-green-700 hover:bg-green-600 text-white"
              }`}
            >
              Skip / Next
            </button>
          </div>
        </div>

        {/* ── STATS DASHBOARD ── */}
        <div className="bg-white/5 rounded-2xl p-4 text-xs grid grid-cols-2 gap-x-6 gap-y-2 border border-white/5 shadow-inner">
          <div className="flex justify-between">
            <span className="text-gray-400 font-medium">Base Stake:</span>
            <strong className="text-green-400 font-bold">{baseStake}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 font-medium">Current Deficit:</span>
            <strong className="text-red-400 font-bold">{deficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 font-medium">Accumulated Def:</span>
            <strong className="text-orange-400 font-bold">{baseDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400 font-medium">COP Deficit Pool:</span>
            <strong className="text-blue-400 font-bold">{smallDeficit} / 10000</strong>
          </div>
          {fixture && (
            <div className="col-span-2 pt-2 mt-1 border-t border-white/10 text-center tracking-wide">
              <span className="text-white font-black uppercase">{teamA}</span>
              <span className="text-red-500 mx-2 font-black">⚡</span>
              <span className="text-white font-black uppercase">{teamB}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
