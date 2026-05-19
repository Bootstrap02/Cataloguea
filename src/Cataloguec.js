
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
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
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ---------- BASE & DEFICITS ---------- */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit,     setDeficit]     = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit,  setOneDeficit]  = useState(0);

  /* ---------- SPECIAL STATES ---------- */
  // Team A: 1X + zeroTarget/zeroDeficit
  // Team B: 2X + sixTarget/sixDeficit
  const [bank,          setBank]          = useState(600);
  const [oneXDeficit,   setOneXDeficit]   = useState(200);
  const [twoXDeficit,   setTwoXDeficit]   = useState(200);
  const [zeroTarget,    setZeroTarget]    = useState(100); // accumulates 1X stakes
  const [sixTarget,     setSixTarget]     = useState(100); // accumulates 2X stakes
  const [zeroSpecDef,   setZeroSpecDef]   = useState(100); // tg0 deficit (0-Goals protection)
  const [sixSpecDef,    setSixSpecDef]    = useState(100); // tg6 deficit (6-Goals protection)

  /* ---------- STAKES PER LINE ---------- */
  const [amounts,     setAmounts]     = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts, setZeroAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts,  setOneAmounts]  = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------- SPECIAL STAKES THIS GAME ---------- */
  const [oneXStake,  setOneXStake]  = useState(0);
  const [twoXStake,  setTwoXStake]  = useState(0);
  const [tg0Stake,   setTg0Stake]   = useState(0);
  const [tg6Stake,   setTg6Stake]   = useState(0);

  /* ---------- CLICK INDICATORS ---------- */
  const [clicked, setClicked] = useState(new Set());

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
        setBaseStake(res.data.base || 0);
        setBaseDeficit(res.data.baseDeficit || 0);
        setDeficit(res.data.deficit || 0);
        setZeroDeficit(res.data.zeroDeficit || 0);
        setOneDeficit(res.data.oneDeficit || 0);
        setBank(res.data.bank ?? 600);
        setOneXDeficit(res.data.oneXDeficit ?? 200);
        setTwoXDeficit(res.data.twoXDeficit ?? 200);
        setZeroTarget(res.data.zeroTarget ?? 100);
        setSixTarget(res.data.sixTarget ?? 100);
        setZeroSpecDef(res.data.zeroSpecDef ?? 100);
        setSixSpecDef(res.data.sixSpecDef ?? 100);
      }
    } catch (err) {
      console.error("❌ fetch failed:", err.message);
    } finally {
      setIsReloading(false);
    }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        base: baseRef.current,
        baseDeficit, deficit, zeroDeficit, oneDeficit,
        bank, oneXDeficit, twoXDeficit,
        zeroTarget, sixTarget, zeroSpecDef, sixSpecDef,
      });
      console.log("✅ Saved");
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

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

  const home = sanitizeTeam(inputA) || "che";
  const away = sanitizeTeam(inputB) || "che";

  let found = smallOdds.find(
    (o) => o.home === home && o.away === away
  );

  const isSmall = !!found;

  if (!found) {
    found = odds.find(
      (o) => o.home === home && o.away === away
    );
  }

  if (!found) {
    alert(`No odds found for "${home}" vs "${away}"`);
    return;
  }

  setIsSmallOddsGame(isSmall);
  setFixture(found);
  setClicked(new Set());

  const oddsMap = {
    H: found.win,
    D: found.draw,
    A: found.lose,
  };

  const code = found.code || "";

  const newStakes = [];

  let totalH = 0;
  let totalD = 0;
  let totalA = 0;

  /* =========================================================
     6-0
     ========================================================= */

  const newBase6 = baseStake + deficit;

  setBaseStake(newBase6);
  setDeficit(0);

  let sixWinner = Math.max(
    Math.round(newBase6 / found.winner),
    10
  );

  /* =========================================================
     ONLY SMALL ODDS GAMES TOUCH BANK / 1XDEF / 2XDEF
     ========================================================= */

  let currentOneXDef = oneXDeficit;
  let currentTwoXDef = twoXDeficit;

  if (isSmall) {
    let bankNow = bank;

    if (bankNow >= sixWinner) {
      bankNow -= sixWinner;
    } else {
      const residue = sixWinner - bankNow;

      bankNow = 0;

      const half = Math.ceil(residue / 2);

      currentOneXDef += half;
      currentTwoXDef += residue - half;
    }

    setBank(bankNow);
    setOneXDeficit(currentOneXDef);
    setTwoXDeficit(currentTwoXDef);
  }

  /* =========================================================
     6-0 HDA ALWAYS PLAYS
     ========================================================= */

  const res6 = buildLadder(
    sixWinner,
    "6-0",
    code,
    oddsMap
  );

  newStakes.push(...res6.ladder);

  setAmounts({
    winnerAmount: sixWinner,
    homeAmount: res6.homeAmount,
    drawAmount: res6.drawAmount,
    awayAmount: res6.awayAmount,
  });

  totalH += res6.homeAmount;
  totalD += res6.drawAmount;
  totalA += res6.awayAmount;

  /* =========================================================
     1X ALWAYS PLAYS
     ========================================================= */

  const oneXOdd = found.oneX || 0;

  let oneXS = 0;

  if (oneXOdd > 1.01) {
    oneXS = Math.max(
      Math.round(
        (currentOneXDef + zeroTarget) /
          (oneXOdd - 1)
      ),
      10
    );
  }

  setOneXStake(oneXS);

  /* =========================================================
     2X ALWAYS PLAYS
     ========================================================= */

  const twoXOdd = found.twoX || 0;

  let twoXS = 0;

  if (twoXOdd > 1.01) {
    twoXS = Math.max(
      Math.round(
        (currentTwoXDef + sixTarget) /
          (twoXOdd - 1)
      ),
      10
    );
  }

  setTwoXStake(twoXS);

  /* =========================================================
     TG0 ALWAYS PLAYS
     ========================================================= */

  const tg0Odd = found.zeroGoals || 0;

  let tg0S = 0;

  if (tg0Odd > 1.01) {
    tg0S = Math.max(
      Math.round(
        (zeroTarget + zeroSpecDef) /
          (tg0Odd - 1)
      ),
      10
    );
  }

  setTg0Stake(tg0S);

  /* =========================================================
     TG6 ALWAYS PLAYS
     ========================================================= */

  const tg6Odd = found.sixGoals || 0;

  let tg6S = 0;

  if (tg6Odd > 1.01) {
    tg6S = Math.max(
      Math.round(
        (sixTarget + sixSpecDef) /
          (tg6Odd - 1)
      ),
      10
    );
  }

  setTg6Stake(tg6S);

  /* =========================================================
     5-0
     ========================================================= */

  const base50 =
    baseDeficit + zeroDeficit;

  const zeroWinner = Math.max(
    Math.round(base50 / found.fiveZero),
    10
  );

  const res50 = buildLadder(
    zeroWinner,
    "5-0",
    code,
    oddsMap
  );

  newStakes.push(...res50.ladder);

  setZeroAmounts({
    winnerAmount: zeroWinner,
    homeAmount: res50.homeAmount,
    drawAmount: res50.drawAmount,
    awayAmount: res50.awayAmount,
  });

  totalH += res50.homeAmount;
  totalD += res50.drawAmount;
  totalA += res50.awayAmount;

  /* =========================================================
     5-1
     ========================================================= */

  const base51 =
    baseDeficit + oneDeficit;

  const oneWinner = Math.max(
    Math.round(base51 / found.fiveOne),
    10
  );

  const res51 = buildLadder(
    oneWinner,
    "5-1",
    code,
    oddsMap
  );

  newStakes.push(...res51.ladder);

  setOneAmounts({
    winnerAmount: oneWinner,
    homeAmount: res51.homeAmount,
    drawAmount: res51.drawAmount,
    awayAmount: res51.awayAmount,
  });

  totalH += res51.homeAmount;
  totalD += res51.drawAmount;
  totalA += res51.awayAmount;

  /* =========================================================
     FINAL
     ========================================================= */

  setOrderedStakes(newStakes);

  setAmounts((prev) => ({
    ...prev,
    homeAmount: totalH,
    drawAmount: totalD,
    awayAmount: totalA,
  }));
};



  
      

  /* ================================================================
     RESOLVE RESULT (HDA)
     ================================================================ */
  
  
  const resolveResult = (step) => {
  if (!fixture) return;

  setClicked((prev) => new Set([...prev, step]));

  const calcLoss = (type) => {
    const stakes = orderedStakes.filter(
      (s) => s.type === type
    );

    const idx = stakes.findIndex(
      (s) => s.step === step
    );

    if (idx === -1) return 0;

    return stakes
      .slice(idx + 1)
      .reduce((sum, s) => sum + s.stake, 0);
  };

  /* =========================================================
     6-0 LOSS LOGIC
     ========================================================= */

  if (!isSmallOddsGame) {
    const mainLoss = calcLoss("6-0");

    setDeficit(mainLoss);

    setBaseDeficit((prev) => prev + mainLoss);
  }

  /* =========================================================
     5-0 / 5-1 LOGIC
     ========================================================= */

  if (isSmallOddsGame) {

    const total50Stake =
      zeroAmounts.winnerAmount +
      orderedStakes
        .filter((s) => s.type === "5-0")
        .reduce((sum, s) => sum + s.stake, 0);

    const total51Stake =
      oneAmounts.winnerAmount +
      orderedStakes
        .filter((s) => s.type === "5-1")
        .reduce((sum, s) => sum + s.stake, 0);

    setZeroDeficit((prev) => prev + total50Stake);

    setOneDeficit((prev) => prev + total51Stake);

  } else {

    const zeroLoss = calcLoss("5-0");

    setZeroDeficit((prev) => prev + zeroLoss);

    const oneLoss = calcLoss("5-1");

    setOneDeficit((prev) => prev + oneLoss);
  }

  /* =========================================================
     SPECIAL SYSTEMS ALWAYS ACCUMULATE
     ========================================================= */

  if (oneXStake > 0) {
    setZeroTarget((prev) => prev + oneXStake);
  }

  if (twoXStake > 0) {
    setSixTarget((prev) => prev + twoXStake);
  }

  if (tg0Stake > 0) {
    setZeroSpecDef((prev) => prev + tg0Stake);
  }

  if (tg6Stake > 0) {
    setSixSpecDef((prev) => prev + tg6Stake);
  }

  clearForNext();
};
  

  /* ================================================================
     1X WIN
     ================================================================ */
  const handleOneXWin = () => {
    if (!fixture ) return;
    setClicked((prev) => new Set([...prev, "oneX"]));

    if (twoXDeficit > 500) {
      setOneXDeficit(150);
      setTwoXDeficit((prev) => prev - 150);
      setZeroTarget(100);
      setOneXStake(0);
    } else {
      setOneXDeficit(150);
      setBank((prev) => prev + 150);
      setZeroTarget(100);
      setOneXStake(0);
    }
  };

  /* ================================================================
     2X WIN
     ================================================================ */
  const handleTwoXWin = () => {
    if (!fixture ) return;
    setClicked((prev) => new Set([...prev, "twoX"]));

    if (oneXDeficit > 500) {
      setTwoXDeficit(150);
      setOneXDeficit((prev) => prev - 150);
      setSixTarget(100);
      setTwoXStake(0);
    } else {
      setTwoXDeficit(150);
      setBank((prev) => prev + 150);
      setSixTarget(100);
      setTwoXStake(0);
    }
  };

  /* ================================================================
     TG0 WIN
     ================================================================ */
  const handleTg0Win = () => {
    if (!fixture ) return;
    setClicked((prev) => new Set([...prev, "tg0"]));

    if (sixTarget > 500) {
      setZeroSpecDef(0);
      setZeroTarget(100);
      setSixTarget((prev) => prev - 100);
      setTg0Stake(0);
    } else {
      setZeroSpecDef(0);
      setZeroTarget(100);
      setBank((prev) => prev + 100);
      setTg0Stake(0);
    }
  };

  /* ================================================================
     TG6 WIN
     ================================================================ */
  const handleTg6Win = () => {
    if (!fixture ) return;
    setClicked((prev) => new Set([...prev, "tg6"]));

    if (zeroTarget > 500) {
      setSixSpecDef(0);
      setSixTarget(100);
      setZeroTarget((prev) => prev - 100);
      setTg6Stake(0);
    } else {
      setSixSpecDef(0);
      setSixTarget(100);
      setBank((prev) => prev + 100);
      setTg6Stake(0);
    }
  };

  /* ================================================================
     JACKPOT HANDLERS
     ================================================================ */
  const handleJackpot = () => {
    setClicked((prev) => new Set([...prev, "six"]));
    setBaseStake(10000);
    setBaseDeficit(0);
    setDeficit(0);
  };

  const handleZeroJackpot = () => {
    setClicked((prev) => new Set([...prev, "zero"]));
    setBaseStake(10000 + oneDeficit);
    setBaseDeficit(oneDeficit);
    setOneDeficit(0);
    setZeroDeficit(0);
  };

  const handleOneJackpot = () => {
    setClicked((prev) => new Set([...prev, "one"]));
    setBaseStake(10000 + zeroDeficit);
    setBaseDeficit(zeroDeficit);
    setZeroDeficit(0);
    setOneDeficit(0);
  };

  /* ================================================================
     CLEAR FOR NEXT
     ================================================================ */
  
  const clearForNext = () => {

  /* =========================================================
     SMALL ODDS AUTO-CARRY
     ========================================================= */

  if (fixture && isSmallOddsGame) {

    const total50Stake =
      zeroAmounts.winnerAmount +
      orderedStakes
        .filter((s) => s.type === "5-0")
        .reduce((sum, s) => sum + s.stake, 0);

    const total51Stake =
      oneAmounts.winnerAmount +
      orderedStakes
        .filter((s) => s.type === "5-1")
        .reduce((sum, s) => sum + s.stake, 0);

    setZeroDeficit((prev) => prev + total50Stake);

    setOneDeficit((prev) => prev + total51Stake);
  }

  setInputA("");
  setInputB("");
  setFixture(null);
  setIsSmallOddsGame(false);
  setOrderedStakes([]);
  setClicked(new Set());

  setOneXStake(0);
  setTwoXStake(0);
  setTg0Stake(0);
  setTg6Stake(0);

  setAmounts({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });

  setZeroAmounts({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });

  setOneAmounts({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });

  saveBase();
};

  /* ── DERIVED ── */
  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  const displayAmounts = {
    homeAmount: amounts.homeAmount,
    drawAmount: amounts.drawAmount,
    awayAmount: amounts.awayAmount,
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0">
        <h1 className="text-base font-extrabold text-red-400 tracking-tight leading-tight">
          Virtual EPL
          {isSmallOddsGame && fixture && (
            <span className="ml-2 text-[10px] bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold align-middle">
              SMALL ODDS
            </span>
          )}
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-4 py-2 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">
            💾 Save
          </button>
          <button onClick={fetchBase} disabled={isReloading}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-4 pb-6 gap-4 overflow-y-auto">

        {/* JACKPOT ROW */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={handleJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black hover:bg-yellow-300"}`}>
            <div className="text-xl font-black">6–0</div>
            <div className="text-[11px] mt-1 opacity-80">{amounts.winnerAmount || "–"}</div>
          </button>
          <button onClick={handleZeroJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("zero") ? "bg-white text-yellow-600 ring-2 ring-yellow-500" : "bg-yellow-500 text-black hover:bg-yellow-400"}`}>
            <div className="text-xl font-black">5–0</div>
            <div className="text-[11px] mt-1 opacity-80">{zeroAmounts.winnerAmount || "–"}</div>
          </button>
          <button onClick={handleOneJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("one") ? "bg-white text-orange-500 ring-2 ring-orange-400" : "bg-orange-400 text-black hover:bg-orange-300"}`}>
            <div className="text-xl font-black">5–1</div>
            <div className="text-[11px] mt-1 opacity-80">{oneAmounts.winnerAmount || "–"}</div>
          </button>
        </div>

        {/* SPECIAL BUTTONS — only active in small odds games */}
        <div className="grid grid-cols-2 gap-3">
          {/* 1X */}
          <button onClick={handleOneXWin}
            disabled={!fixture || clicked.has("oneX")}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("oneX") ? "bg-white text-purple-600 ring-2 ring-purple-400"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
              : "bg-purple-500 text-white hover:bg-purple-400"
            }`}>
            <div className="font-black">1X</div>
            <div className="text-[11px] mt-0.5 opacity-80">{oneXStake || "–"}</div>
            <div className="text-[9px] opacity-60">1XDef:{oneXDeficit} | 0Tgt:{zeroTarget}</div>
          </button>

          {/* 2X */}
          <button onClick={handleTwoXWin}
            disabled={!fixture || clicked.has("twoX")}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("twoX") ? "bg-white text-pink-600 ring-2 ring-pink-400"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
              : "bg-pink-500 text-white hover:bg-pink-400"
            }`}>
            <div className="font-black">2X</div>
            <div className="text-[11px] mt-0.5 opacity-80">{twoXStake || "–"}</div>
            <div className="text-[9px] opacity-60">2XDef:{twoXDeficit} | 6Tgt:{sixTarget}</div>
          </button>

          {/* TG0 */}
          <button onClick={handleTg0Win}
            disabled={!fixture  || clicked.has("tg0")}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("tg0") ? "bg-white text-cyan-600 ring-2 ring-cyan-400"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
              : "bg-cyan-500 text-white hover:bg-cyan-400"
            }`}>
            <div className="font-black">0G</div>
            <div className="text-[11px] mt-0.5 opacity-80">{tg0Stake || "–"}</div>
            <div className="text-[9px] opacity-60">0Def:{zeroSpecDef} | 0Tgt:{zeroTarget}</div>
          </button>

          {/* TG6 */}
          <button onClick={handleTg6Win}
            disabled={!fixture || clicked.has("tg6")}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("tg6") ? "bg-white text-teal-600 ring-2 ring-teal-400"
              : !fixture  ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
              : "bg-teal-500 text-white hover:bg-teal-400"
            }`}>
            <div className="font-black">6G</div>
            <div className="text-[11px] mt-0.5 opacity-80">{tg6Stake || "–"}</div>
            <div className="text-[9px] opacity-60">6Def:{sixSpecDef} | 6Tgt:{sixTarget}</div>
          </button>
        </div>

        {/* HDA ROW */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => resolveResult("H")} disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("H") ? "bg-white text-green-600 ring-2 ring-green-500"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-green-500 hover:bg-green-400"
            }`}>
            <div className="text-base font-extrabold uppercase tracking-wide">{teamA}</div>
            <div className="text-[11px] mt-1 opacity-80">{displayAmounts.homeAmount || "–"}</div>
          </button>
          <button onClick={() => resolveResult("D")} disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("D") ? "bg-white text-gray-600 ring-2 ring-gray-400"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-gray-400 hover:bg-gray-300"
            }`}>
            <div className="text-base font-extrabold">DRAW</div>
            <div className="text-[11px] mt-1 opacity-80">{displayAmounts.drawAmount || "–"}</div>
          </button>
          <button onClick={() => resolveResult("A")} disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("A") ? "bg-white text-red-600 ring-2 ring-red-500"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-red-500 hover:bg-red-400"
            }`}>
            <div className="text-base font-extrabold uppercase tracking-wide">{teamB}</div>
            <div className="text-[11px] mt-1 opacity-80">{displayAmounts.awayAmount || "–"}</div>
          </button>
        </div>

        {/* INPUTS */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400" />
            <span className="font-black text-xl text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={!!fixture}
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 shadow ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 hover:bg-red-600 text-white"}`}>
              CALCULATE
            </button>
            <button onClick={clearForNext} disabled={!fixture}
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-green-700 hover:bg-green-600 text-white"}`}>
              NEXT
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-4 text-xs grid grid-cols-2 gap-x-6 gap-y-2">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Base Def</span><strong className="text-orange-400">{baseDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">5-0 Def</span><strong className="text-yellow-400">{zeroDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">5-1 Def</span><strong className="text-yellow-300">{oneDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">1X Def</span><strong className="text-purple-400">{oneXDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">2X Def</span><strong className="text-pink-400">{twoXDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">0 Tgt</span><strong className="text-cyan-400">{zeroTarget}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">6 Tgt</span><strong className="text-teal-400">{sixTarget}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">0G Def</span><strong className="text-cyan-300">{zeroSpecDef}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">6G Def</span><strong className="text-teal-300">{sixSpecDef}</strong></div>
          {fixture && (
            <div className="col-span-2 pt-2 border-t border-white/10 text-center">
              <span className="text-white font-bold uppercase">{teamA}</span>
              <span className="text-gray-400 mx-2">vs</span>
              <span className="text-white font-bold uppercase">{teamB}</span>
              {isSmallOddsGame && <span className="ml-2 text-yellow-400 font-bold text-[10px]">· SMALL ODDS</span>}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
