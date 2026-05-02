import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

/* ================================================================
   COMPONENT
   ================================================================ */
const Homepage = () => {

  /* ---------- INPUTS ---------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  /* ---------- FIXTURE ---------- */
  const [fixture, setFixture] = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ---------- BASE & DEFICITS ----------
   *  baseStake   — main 6-0 target
   *  deficit     — 6-0 running loss
   *  baseDeficit — cumulative 6-0 losses (persisted)
   *  zeroDeficit — 5-0 running loss pile
   *  oneDeficit  — 5-1 running loss pile
   *  twoDeficit  — 4-2 personal HDA-loss pile (independent)
   *  smallDeficit— pile that 4-2 targets (fed by small-odds 6-0 winners + twoDeficit losses + 230 seed)
   *  bank        — 230 buffer that absorbs small-odds winners before smallDeficit
   * ------------------------------------------------------------ */
  const [baseStake,    setBaseStake]    = useState(10000);
  const [baseDeficit,  setBaseDeficit]  = useState(0);
  const [deficit,      setDeficit]      = useState(0);
  const [zeroDeficit,  setZeroDeficit]  = useState(0);
  const [oneDeficit,   setOneDeficit]   = useState(0);
  const [twoDeficit,   setTwoDeficit]   = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(230);
  const [bank,         setBank]         = useState(230);

  /* ---------- STAKES PER LINE ---------- */
  const [amounts,      setAmounts]      = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts,  setZeroAmounts]  = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts,   setOneAmounts]   = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [twoAmounts,   setTwoAmounts]   = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------- JACKPOT PRESSED STATE ----------
   * Once any jackpot button (6-0, 5-0, 5-1, 4-2) is pressed,
   * winner buttons are locked and only HDA buttons remain active.
   * Reset on clearForNext().
   * ----------------------------------------- */
  const [jackpotPressed, setJackpotPressed] = useState(null); // "six" | "zero" | "one" | "two" | null

  /* ---------- REF FOR AUTOSAVE ---------- */
  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     API
     ================================================================ */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) {
        setBaseStake(res.data.base        || 0);
        setBaseDeficit(res.data.baseDeficit || 0);
        setZeroDeficit(res.data.zeroDeficit || 0);
        setOneDeficit(res.data.oneDeficit   || 0);
        setTwoDeficit(res.data.twoDeficit   || 0);
        setSmallDeficit(res.data.smallDeficit !== undefined ? res.data.smallDeficit : 230);
        setBank(res.data.bank !== undefined ? res.data.bank : 230);
      }
    } catch (err) {
      console.error("❌ Failed to fetch:", err.message);
    } finally {
      setIsReloading(false);
    }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        base:         baseRef.current,
        baseDeficit,
        zeroDeficit,
        oneDeficit,
        twoDeficit,
        smallDeficit,
        bank,
      });
      console.log("✅ Saved");
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

  /* ================================================================
     HANDLE SUBMIT — calculate all four lines
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home  = sanitizeTeam(inputA) || "che";
    const away  = sanitizeTeam(inputB) || "che";
    const found = odds.find((o) => o.home === home && o.away === away);

    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    /* Is this a small-odds game? */
    const isSmall = smallOdds.some((o) => o.home === home && o.away === away);
    setIsSmallOddsGame(isSmall);
    setFixture(found);
    setJackpotPressed(null);

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };

    /* ---- Helper: build HDA ladder from a running total ---- */
    const buildLadder = (startTotal, type) => {
      let runningTotal = startTotal;
      const ladder = [];
      let homeAmount = 0, drawAmount = 0, awayAmount = 0;
      for (const step of found.code) {
        const odd = oddsMap[step];
        const stake = Math.max(Math.round(runningTotal / (odd - 1)), 10);
        ladder.push({ step, stake, type });
        if (step === "H") homeAmount = stake;
        if (step === "D") drawAmount = stake;
        if (step === "A") awayAmount = stake;
        runningTotal += stake;
      }
      return { ladder, homeAmount, drawAmount, awayAmount };
    };

    const newStakes = [];

    /* ==== LINE 1: 6-0 ==== */
    const newBase6 = baseStake + deficit;
    setBaseStake(newBase6);
    setDeficit(0);

    let sixWinner = Math.max(Math.round(newBase6 / found.winner), 10);

    if (isSmall) {
      /* Small-odds game: bank absorbs winner first */
      let bankAfter = bank;
      let smallDeficitAfter = smallDeficit;

      if (bankAfter >= sixWinner) {
        bankAfter -= sixWinner;
      } else {
        const remainder = sixWinner - bankAfter;
        bankAfter = 0;
        smallDeficitAfter += remainder;
      }
      setBank(bankAfter);
      setSmallDeficit(smallDeficitAfter);

      /* NO HDA ladder for 6-0 on small-odds games */
      setAmounts({ winnerAmount: sixWinner, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    } else {
      /* Normal game: full HDA ladder */
      const { ladder, homeAmount, drawAmount, awayAmount } = buildLadder(sixWinner, "6-0");
      newStakes.push(...ladder);
      setAmounts({ winnerAmount: sixWinner, homeAmount, drawAmount, awayAmount });
    }

    /* ==== LINE 2: 5-0 ==== */
    const newBase50 = baseDeficit + zeroDeficit;
    let zeroWinner = Math.max(Math.round(newBase50 / found.fiveZero), 10);
    const res50 = buildLadder(zeroWinner, "5-0");
    newStakes.push(...res50.ladder);
    setZeroAmounts({ winnerAmount: zeroWinner, homeAmount: res50.homeAmount, drawAmount: res50.drawAmount, awayAmount: res50.awayAmount });

    /* ==== LINE 3: 5-1 ==== */
    const newBase51 = baseDeficit + oneDeficit;
    let oneWinner = Math.max(Math.round(newBase51 / found.fiveOne), 10);
    const res51 = buildLadder(oneWinner, "5-1");
    newStakes.push(...res51.ladder);
    setOneAmounts({ winnerAmount: oneWinner, homeAmount: res51.homeAmount, drawAmount: res51.drawAmount, awayAmount: res51.awayAmount });

    /* ==== LINE 4: 4-2 ==== */
    /* 4-2 targets: smallDeficit + twoDeficit */
    const newBase42 = smallDeficit + twoDeficit;
    let twoWinner = Math.max(Math.round(newBase42 / found.fourTwo), 10);
    const res42 = buildLadder(twoWinner, "4-2");
    newStakes.push(...res42.ladder);
    setTwoAmounts({ winnerAmount: twoWinner, homeAmount: res42.homeAmount, drawAmount: res42.drawAmount, awayAmount: res42.awayAmount });

    setOrderedStakes(newStakes);
  };

  /* ================================================================
     RESOLVE RESULT (H / D / A button pressed)
     ================================================================ */
  const resolveResult = (step) => {
    if (!fixture) return;

    const calcLoss = (type) => {
      const stakes = orderedStakes.filter((s) => s.type === type);
      const index  = stakes.findIndex((s) => s.step === step);
      if (index === -1) return 0;
      return stakes.slice(index + 1).reduce((sum, s) => sum + s.stake, 0);
    };

    const mainLoss    = isSmallOddsGame ? 0 : calcLoss("6-0");
    const fiveZeroLoss = calcLoss("5-0");
    const fiveOneLoss  = calcLoss("5-1");
    const fourTwoLoss  = calcLoss("4-2");

    /* 6-0 loss on small-odds goes into smallDeficit for 4-2 to recover */
    if (isSmallOddsGame) {
      /* No main HDA ladder was active, so no loss to add */
    } else {
      setDeficit(mainLoss);
      setBaseDeficit((prev) => prev + mainLoss);
    }

    setZeroDeficit((prev) => prev + fiveZeroLoss);
    setOneDeficit((prev)  => prev + fiveOneLoss);

    /* 4-2 personal HDA losses go into twoDeficit (its own pile) */
    setTwoDeficit((prev) => prev + fourTwoLoss);

    clearForNext();
  };

  /* ================================================================
     JACKPOT HANDLERS
     ================================================================ */

  /* 6-0 jackpot wins */
  const handleJackpot = () => {
    setJackpotPressed("six");
    /* Full reset — also replenish smallDeficit & bank buffers */
    setBaseStake(10000);
    setBaseDeficit(0);
    setDeficit(0);
    setSmallDeficit(230);
    setBank(230);
  };

  /* 5-0 jackpot wins */
  const handleZeroJackpot = () => {
    setJackpotPressed("zero");
    /* Carry oneDeficit into base, reset zero */
    setBaseStake(10000 + oneDeficit);
    setBaseDeficit(oneDeficit);
    setOneDeficit(0);
    setZeroDeficit(0);
  };

  /* 5-1 jackpot wins */
  const handleOneJackpot = () => {
    setJackpotPressed("one");
    setBaseStake(10000 + zeroDeficit);
    setBaseDeficit(zeroDeficit);
    setZeroDeficit(0);
    setOneDeficit(0);
  };

  /* 4-2 jackpot wins — independent, does NOT touch baseStake */
  const handleTwoJackpot = () => {
    setJackpotPressed("two");
    /* Reset 4-2 pile and restore smallDeficit + bank buffers */
    setTwoDeficit(0);
    setSmallDeficit(230);
    setBank(230);
  };

  /* ================================================================
     CLEAR FOR NEXT GAME
     ================================================================ */
  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setJackpotPressed(null);
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setTwoAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    saveBase();
  };

  /* ================================================================
     DERIVED DISPLAY VALUES
     ================================================================ */
  const teamA = sanitizeTeam(inputA) || "che";
  const teamB = sanitizeTeam(inputB) || "che";

  /* Combined HDA display (sum of all active lines) */
  const displayAmounts = {
    homeAmount:  amounts.homeAmount  + zeroAmounts.homeAmount  + oneAmounts.homeAmount  + twoAmounts.homeAmount,
    drawAmount:  amounts.drawAmount  + zeroAmounts.drawAmount  + oneAmounts.drawAmount  + twoAmounts.drawAmount,
    awayAmount:  amounts.awayAmount  + zeroAmounts.awayAmount  + oneAmounts.awayAmount  + twoAmounts.awayAmount,
  };

  /* HDA buttons are active ONLY after a jackpot is pressed (or if game loaded without jackpot press yet) */
  const hdaDisabled   = !fixture || jackpotPressed === null;
  /* Winner buttons disabled after jackpot pressed */
  const jackpotLocked = jackpotPressed !== null;

  /* ================================================================
     RENDER — mobile-first, matching the requested UI style
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-lg font-extrabold text-red-400 tracking-tight">
          Virtual EPL Strategy
          {isSmallOddsGame && fixture && (
            <span className="ml-2 text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold">SMALL ODDS</span>
          )}
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button
            onClick={() => saveBase()}
            className="px-3 py-1.5 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition"
          >
            💾
          </button>
          <button
            onClick={fetchBase}
            disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50"
          >
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      {/* ── MAIN CARD ── */}
      <div className="flex-1 flex flex-col px-3 pb-4 gap-3 overflow-y-auto">

        {/* ── JACKPOT WINNER BUTTONS (row 1) ── */}
        <div className="grid grid-cols-4 gap-2">
          {/* 6-0 */}
          <button
            onClick={handleJackpot}
            disabled={jackpotLocked}
            className={`py-4 rounded-xl font-extrabold text-sm transition active:scale-95 ${
              jackpotLocked
                ? "bg-gray-600 opacity-40 cursor-not-allowed text-white"
                : jackpotPressed === "six"
                ? "bg-yellow-400 text-black"
                : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}
          >
            <div className="text-xl font-black">6–0</div>
            <div className="text-[10px]">({amounts.winnerAmount || "–"})</div>
          </button>

          {/* 5-0 */}
          <button
            onClick={handleZeroJackpot}
            disabled={jackpotLocked}
            className={`py-4 rounded-xl font-extrabold text-sm transition active:scale-95 ${
              jackpotLocked
                ? "bg-gray-600 opacity-40 cursor-not-allowed text-white"
                : "bg-yellow-500 text-black hover:bg-yellow-400"
            }`}
          >
            <div className="text-xl font-black">5–0</div>
            <div className="text-[10px]">({zeroAmounts.winnerAmount || "–"})</div>
          </button>

          {/* 5-1 */}
          <button
            onClick={handleOneJackpot}
            disabled={jackpotLocked}
            className={`py-4 rounded-xl font-extrabold text-sm transition active:scale-95 ${
              jackpotLocked
                ? "bg-gray-600 opacity-40 cursor-not-allowed text-white"
                : "bg-orange-400 text-black hover:bg-orange-300"
            }`}
          >
            <div className="text-xl font-black">5–1</div>
            <div className="text-[10px]">({oneAmounts.winnerAmount || "–"})</div>
          </button>

          {/* 4-2 */}
          <button
            onClick={handleTwoJackpot}
            disabled={jackpotLocked}
            className={`py-4 rounded-xl font-extrabold text-sm transition active:scale-95 ${
              jackpotLocked
                ? "bg-gray-600 opacity-40 cursor-not-allowed text-white"
                : "bg-purple-500 text-white hover:bg-purple-400"
            }`}
          >
            <div className="text-xl font-black">4–2</div>
            <div className="text-[10px]">({twoAmounts.winnerAmount || "–"})</div>
          </button>
        </div>

        {/* ── HDA BUTTONS (row 2) ── */}
        <div className="grid grid-cols-3 gap-2">
          {/* HOME */}
          <button
            onClick={() => resolveResult("H")}
            disabled={hdaDisabled}
            className={`py-4 rounded-xl font-bold text-sm transition active:scale-95 ${
              hdaDisabled
                ? "bg-gray-600 opacity-40 cursor-not-allowed text-white"
                : "bg-green-600 hover:bg-green-500 text-white"
            }`}
          >
            <div className="text-base font-extrabold uppercase">{teamA}</div>
            <div className="text-[10px]">({displayAmounts.homeAmount || "–"})</div>
          </button>

          {/* DRAW */}
          <button
            onClick={() => resolveResult("D")}
            disabled={hdaDisabled}
            className={`py-4 rounded-xl font-bold text-sm transition active:scale-95 ${
              hdaDisabled
                ? "bg-gray-600 opacity-40 cursor-not-allowed text-white"
                : "bg-gray-500 hover:bg-gray-400 text-white"
            }`}
          >
            <div className="text-base font-extrabold">DRAW</div>
            <div className="text-[10px]">({displayAmounts.drawAmount || "–"})</div>
          </button>

          {/* AWAY */}
          <button
            onClick={() => resolveResult("A")}
            disabled={hdaDisabled}
            className={`py-4 rounded-xl font-bold text-sm transition active:scale-95 ${
              hdaDisabled
                ? "bg-gray-600 opacity-40 cursor-not-allowed text-white"
                : "bg-red-600 hover:bg-red-500 text-white"
            }`}
          >
            <div className="text-base font-extrabold uppercase">{teamB}</div>
            <div className="text-[10px]">({displayAmounts.awayAmount || "–"})</div>
          </button>
        </div>

        {/* ── INDIVIDUAL LINE STAKES (compact breakdown) ── */}
        {fixture && (
          <div className="grid grid-cols-4 gap-1 text-[10px] text-center bg-black/20 rounded-xl p-2">
            <div className="font-bold text-yellow-300">6-0</div>
            <div className="font-bold text-yellow-400">5-0</div>
            <div className="font-bold text-orange-400">5-1</div>
            <div className="font-bold text-purple-400">4-2</div>
            <div>{amounts.homeAmount || "–"}</div>
            <div>{zeroAmounts.homeAmount || "–"}</div>
            <div>{oneAmounts.homeAmount || "–"}</div>
            <div>{twoAmounts.homeAmount || "–"}</div>
            <div>{amounts.drawAmount || "–"}</div>
            <div>{zeroAmounts.drawAmount || "–"}</div>
            <div>{oneAmounts.drawAmount || "–"}</div>
            <div>{twoAmounts.drawAmount || "–"}</div>
            <div>{amounts.awayAmount || "–"}</div>
            <div>{zeroAmounts.awayAmount || "–"}</div>
            <div>{oneAmounts.awayAmount || "–"}</div>
            <div>{twoAmounts.awayAmount || "–"}</div>
          </div>
        )}

        {/* ── INPUT + SUBMIT ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
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
              onClick={handleSubmit}
              disabled={!!fixture}
              className={`flex-1 py-3 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm ${
                fixture ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-red-700 hover:bg-red-600"
              }`}
            >
              CALCULATE
            </button>
            <button
              onClick={clearForNext}
              disabled={!fixture}
              className={`flex-1 py-3 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-sm ${
                !fixture ? "bg-gray-600 opacity-50 cursor-not-allowed" : "bg-green-700 hover:bg-green-600"
              }`}
            >
              NEXT
            </button>
          </div>
        </div>

        {/* ── STATS GRID ── */}
        <div className="bg-black/20 rounded-xl p-3 text-xs grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div>Base: <strong className="text-green-400">{baseStake}</strong></div>
          <div>Deficit: <strong className="text-red-400">{deficit}</strong></div>

          <div>Base Deficit: <strong className="text-orange-400">{baseDeficit}</strong></div>
          <div>5-0 Deficit: <strong className="text-yellow-400">{zeroDeficit}</strong></div>

          <div>5-1 Deficit: <strong className="text-yellow-300">{oneDeficit}</strong></div>
          <div>4-2 Deficit: <strong className="text-purple-400">{twoDeficit}</strong></div>

          <div>Small Deficit: <strong className="text-blue-400">{smallDeficit}</strong></div>
          <div>Bank: <strong className="text-emerald-400">{bank}</strong></div>

          {fixture && (
            <div className="col-span-2 pt-1 border-t border-white/10">
              Game: <strong className="text-white">{teamA} vs {teamB}</strong>
              {isSmallOddsGame && <span className="ml-2 text-yellow-400 font-bold">· small odds</span>}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
