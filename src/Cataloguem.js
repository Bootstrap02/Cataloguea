import React, { useState, useEffect, useRef } from "react";
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
  const [baseStake,    setBaseStake]    = useState(10000);
  const [baseDeficit,  setBaseDeficit]  = useState(0);
  const [deficit,      setDeficit]      = useState(0);
  const [zeroDeficit,  setZeroDeficit]  = useState(0);
  const [oneDeficit,   setOneDeficit]   = useState(0);
  const [twoDeficit,   setTwoDeficit]   = useState(0);
  const [threeDeficit,   setThreeDeficit]   = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(230);
  const [genDef, setGenDef] = useState(0);
  const [bank,         setBank]         = useState(230);

  /* ---------- STAKES PER LINE ---------- */
  const [amounts,       setAmounts]       = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts,   setZeroAmounts]   = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts,    setOneAmounts]    = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [twoAmounts,    setTwoAmounts]    = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [threeAmounts,    setThreeAmounts]    = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------- CLICK INDICATORS ---------- */
  // Tracks which buttons have been pressed this game: "six"|"zero"|"one"|"two"|"H"|"D"|"A"
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
        setBaseStake(res.data.base          || 0);
        setBaseDeficit(res.data.baseDeficit || 0);
        setZeroDeficit(res.data.zeroDeficit || 0);
        setOneDeficit(res.data.oneDeficit   || 0);
        setTwoDeficit(res.data.twoDeficit   || 0);
        setThreeDeficit(res.data.threeDeficit   || 0);
        setSmallDeficit(res.data.smallDeficit ?? 230);
        setBank(res.data.bank               ?? 230);
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
        baseDeficit, zeroDeficit, oneDeficit,
        twoDeficit, smallDeficit, bank,threeDeficit
      });
      console.log("✅ Saved");
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    let found     = smallOdds.find((o) => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!found) found = odds.find((o) => o.home === home && o.away === away);

    if (!found) {
      alert(`No odds found for "${home}" vs "${away}"`);
      return;
    }

    setIsSmallOddsGame(isSmall);
    setFixture(found);
    setClicked(new Set()); // reset indicators on new game

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };

    const buildLadder = (startTotal, type) => {
      const code = found.code || "";
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

    const newStakes = [];

    /* LINE 1: 6-0 */
    const newBase6  = baseStake + deficit + genDef;
    setBaseStake(newBase6);
    setDeficit(0);
    let sixWinner = Math.round(newBase6 / found.winner);
    sixWinner = Math.max(sixWinner, 10);

    if (isSmall) {
      let bankNow = bank;
      let sdNow   = smallDeficit;
      if (bankNow >= sixWinner) {
        bankNow -= sixWinner;
      } else {
        sdNow  += sixWinner - bankNow;
        bankNow = 0;
      }
      setBank(bankNow);
      setSmallDeficit(sdNow);
      setAmounts({ winnerAmount: sixWinner, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    } else {
      const res6 = buildLadder(sixWinner, "6-0");
      newStakes.push(...res6.ladder);
      setAmounts({ winnerAmount: sixWinner, homeAmount: res6.homeAmount, drawAmount: res6.drawAmount, awayAmount: res6.awayAmount });
    }

    /* LINE 2: 5-0 */
    const base50     = baseDeficit + zeroDeficit + genDef;
    let zeroWinner   = Math.round(base50 / found.fiveZero);
    zeroWinner       = Math.max(zeroWinner, 10);
    const res50      = buildLadder(zeroWinner, "5-0");
    newStakes.push(...res50.ladder);
    setZeroAmounts({ winnerAmount: zeroWinner, homeAmount: res50.homeAmount, drawAmount: res50.drawAmount, awayAmount: res50.awayAmount });

    /* LINE 3: 5-1 */
    const base51   = baseDeficit + oneDeficit + genDef;
    let oneWinner  = Math.round(base51 / found.fiveOne);
    oneWinner      = Math.max(oneWinner, 10);
    const res51    = buildLadder(oneWinner, "5-1");
    newStakes.push(...res51.ladder);
    setOneAmounts({ winnerAmount: oneWinner, homeAmount: res51.homeAmount, drawAmount: res51.drawAmount, awayAmount: res51.awayAmount });

    /* LINE 4: 4-2 */
    const base42   = smallDeficit + twoDeficit + genDef;
    let twoWinner  = Math.round(base42 / found.fourTwo);
    twoWinner      = Math.max(twoWinner, 10);
    const res42    = buildLadder(twoWinner, "4-2");
    newStakes.push(...res42.ladder);
    setTwoAmounts({ winnerAmount: twoWinner, homeAmount: res42.homeAmount, drawAmount: res42.drawAmount, awayAmount: res42.awayAmount });

        /* LINE 5: 3-3 */
    const base33   = smallDeficit + twoDeficit + genDef;
    let threeWinner  = Math.round(base33 / found.threeThree);
    threeWinner      = Math.max(threeWinner, 10);
    const res33    = buildLadder(twoWinner, "3-3");
    newStakes.push(...res33.ladder);
    setThreeAmounts({ winnerAmount: threeWinner, homeAmount: res33.homeAmount, drawAmount: res33.drawAmount, awayAmount: res33.awayAmount });
    setOrderedStakes(newStakes);
  };

  /* ================================================================
     RESOLVE RESULT
     ================================================================ */
  const resolveResult = (step) => {
    if (!fixture) return;

    setClicked((prev) => new Set([...prev, step]));

    const calcLoss = (type) => {
      const stakes = orderedStakes.filter((s) => s.type === type);
      const idx    = stakes.findIndex((s) => s.step === step);
      if (idx === -1) return 0;
      return stakes.slice(idx + 1).reduce((sum, s) => sum + s.stake, 0);
    };

    if (!isSmallOddsGame) {
      const mainLoss = calcLoss("6-0");
      setDeficit(mainLoss);
      setBaseDeficit((prev) => prev + mainLoss);
    }

    setZeroDeficit((prev) => prev + calcLoss("5-0"));
    setOneDeficit((prev)  => prev + calcLoss("5-1"));
    setTwoDeficit((prev)  => prev + calcLoss("4-2"));
    setThreeDeficit((prev)  => prev + calcLoss("3-3"));

    clearForNext();
  };

  /* ================================================================
     JACKPOT HANDLERS
     ================================================================ */
  const handleJackpot = () => {
    setClicked((prev) => new Set([...prev, "six"]));
    setBaseStake(10000);
    setBaseDeficit(0);
    setDeficit(0);
    setGenDef(0);
    
  };

  const handleZeroJackpot = () => {
    setClicked((prev) => new Set([...prev, "zero"]));
    setBaseStake(10000 + oneDeficit);
    setBaseDeficit(oneDeficit);
    setOneDeficit(0);
    setZeroDeficit(0);
    setGenDef(0);
  };

  const handleOneJackpot = () => {
    setClicked((prev) => new Set([...prev, "one"]));
    setBaseStake(10000 + zeroDeficit);
    setBaseDeficit(zeroDeficit);
    setZeroDeficit(0);
    setOneDeficit(0);
    setGenDef(0);
  };

  const handleTwoJackpot = () => {
    setClicked((prev) => new Set([...prev, "two"]));
    setTwoDeficit(0);
    setSmallDeficit(0);
    setGenDef(threeDeficit);
    setThreeDeficit(0);
  };
  
const handleThreeJackpot = () => {
    setClicked((prev) => new Set([...prev, "two"]));
    setThreeDeficit(0);
    setSmallDeficit(0);
    setGenDef(twoDeficit);
    setTwoDeficit(0);
  };
  /* ================================================================
     CLEAR FOR NEXT
     ================================================================ */
  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setClicked(new Set());
    setAmounts(    { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts( { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setTwoAmounts( { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setThreeAmounts( { winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    saveBase();
  };

  /* ================================================================
     DERIVED
     ================================================================ */
  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  const displayAmounts = {
    homeAmount: amounts.homeAmount + zeroAmounts.homeAmount + oneAmounts.homeAmount + twoAmounts.homeAmount + threeAmounts.homeAmount,
    drawAmount: amounts.drawAmount + zeroAmounts.drawAmount + oneAmounts.drawAmount + twoAmounts.drawAmount + threeAmounts.drawAmount,
    awayAmount: amounts.awayAmount + zeroAmounts.awayAmount + oneAmounts.awayAmount + twoAmounts.awayAmount + threeAmounts.awayAmount,
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* ── TOP BAR ── */}
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
          <button
            onClick={saveBase}
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

        {/* ── JACKPOT ROW ── */}
        <div className="grid grid-cols-4 gap-3">

          <button
            onClick={handleJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("six")
                ? "bg-white text-yellow-500 ring-2 ring-yellow-400"
                : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}
          >
            <div className="text-2xl font-black">6–0</div>
            <div className="text-[11px] mt-1 opacity-80">{amounts.winnerAmount || "–"}</div>
          </button>

          <button
            onClick={handleZeroJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("zero")
                ? "bg-white text-yellow-600 ring-2 ring-yellow-500"
                : "bg-yellow-500 text-black hover:bg-yellow-400"
            }`}
          >
            <div className="text-2xl font-black">5–0</div>
            <div className="text-[11px] mt-1 opacity-80">{zeroAmounts.winnerAmount || "–"}</div>
          </button>

          <button
            onClick={handleOneJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("one")
                ? "bg-white text-orange-500 ring-2 ring-orange-400"
                : "bg-orange-400 text-black hover:bg-orange-300"
            }`}
          >
            <div className="text-2xl font-black">5–1</div>
            <div className="text-[11px] mt-1 opacity-80">{oneAmounts.winnerAmount || "–"}</div>
          </button>

          <button
            onClick={handleTwoJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("two")
                ? "bg-white text-purple-600 ring-2 ring-purple-500"
                : "bg-purple-500 text-white hover:bg-purple-400"
            }`}
          >
            <div className="text-2xl font-black">4–2</div>
            <div className="text-[11px] mt-1 opacity-80">{twoAmounts.winnerAmount || "–"}</div>
          </button>
<button
            onClick={handleThreeJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("three")
                ? "bg-white text-purple-600 ring-2 ring-purple-500"
                : "bg-purple-500 text-white hover:bg-purple-400"
            }`}
          >
            <div className="text-2xl font-black">3-3</div>
            <div className="text-[11px] mt-1 opacity-80">{threeAmounts.winnerAmount || "–"}</div>
          </button>
        </div>

        {/* ── HDA ROW — always active when fixture loaded ── */}
        <div className="grid grid-cols-3 gap-3">

          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("H")
                ? "bg-white text-green-600 ring-2 ring-green-500"
                : !fixture
                ? "bg-gray-700 opacity-40 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-400"
            }`}
          >
            <div className="text-base font-extrabold uppercase tracking-wide">{teamA}</div>
            <div className="text-[11px] mt-1 opacity-80">{displayAmounts.homeAmount || "–"}</div>
          </button>

          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("D")
                ? "bg-white text-gray-600 ring-2 ring-gray-400"
                : !fixture
                ? "bg-gray-700 opacity-40 cursor-not-allowed"
                : "bg-gray-400 hover:bg-gray-300"
            }`}
          >
            <div className="text-base font-extrabold">DRAW</div>
            <div className="text-[11px] mt-1 opacity-80">{displayAmounts.drawAmount || "–"}</div>
          </button>

          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("A")
                ? "bg-white text-red-600 ring-2 ring-red-500"
                : !fixture
                ? "bg-gray-700 opacity-40 cursor-not-allowed"
                : "bg-red-500 hover:bg-red-400"
            }`}
          >
            <div className="text-base font-extrabold uppercase tracking-wide">{teamB}</div>
            <div className="text-[11px] mt-1 opacity-80">{displayAmounts.awayAmount || "–"}</div>
          </button>

        </div>

        {/* ── PER-LINE BREAKDOWN ── */}
        {fixture && (
          <div className="bg-white/5 rounded-2xl p-4 text-[11px] text-center">
            <div className="grid grid-cols-4 gap-2 mb-2">
              <div className="font-bold text-yellow-300">6-0</div>
              <div className="font-bold text-yellow-400">5-0</div>
              <div className="font-bold text-orange-400">5-1</div>
              <div className="font-bold text-purple-400">4-2</div>
              <div className="font-bold text-pink-400">3-3</div>
            </div>
            {[
              ["H", amounts.homeAmount, zeroAmounts.homeAmount, oneAmounts.homeAmount, twoAmounts.homeAmount],
              ["D", amounts.drawAmount, zeroAmounts.drawAmount, oneAmounts.drawAmount, twoAmounts.drawAmount],
              ["A", amounts.awayAmount, zeroAmounts.awayAmount, oneAmounts.awayAmount, twoAmounts.awayAmount],
            ].map(([label, a, b, c, d]) => (
              <div key={label} className="grid grid-cols-4 gap-2 py-1 border-t border-white/10">
                <div className="text-gray-300">{a || "–"}</div>
                <div className="text-gray-300">{b || "–"}</div>
                <div className="text-gray-300">{c || "–"}</div>
                <div className="text-gray-300">{d || "–"}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── INPUTS + ACTIONS ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="Home"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400"
            />
            <span className="font-black text-xl text-red-500 shrink-0">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="Away"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={!!fixture}
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 shadow ${
                fixture
                  ? "bg-gray-700 opacity-50 cursor-not-allowed text-white"
                  : "bg-red-700 hover:bg-red-600 text-white"
              }`}
            >
              CALCULATE
            </button>
            <button
              onClick={clearForNext}
              disabled={!fixture}
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 shadow ${
                !fixture
                  ? "bg-gray-700 opacity-50 cursor-not-allowed text-white"
                  : "bg-green-700 hover:bg-green-600 text-white"
              }`}
            >
              NEXT
            </button>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="bg-white/5 rounded-2xl p-4 text-xs grid grid-cols-2 gap-x-6 gap-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Base</span>
            <strong className="text-green-400">{baseStake}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Deficit</span>
            <strong className="text-red-400">{deficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Base Def</span>
            <strong className="text-orange-400">{baseDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">5-0 Def</span>
            <strong className="text-yellow-400">{zeroDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">5-1 Def</span>
            <strong className="text-yellow-300">{oneDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">4-2 Def</span>
            <strong className="text-purple-400">{twoDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Small Def</span>
            <strong className="text-blue-400">{smallDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bank</span>
            <strong className="text-emerald-400">{bank}</strong>
          </div>
<div className="flex justify-between">
            <span className="text-gray-400">GenDef</span>
            <strong className="text-emerald-400">{genDef}</strong>
          </div>
          {fixture && (
            <div className="col-span-2 pt-2 border-t border-white/10 text-center">
              <span className="text-white font-bold uppercase">{teamA}</span>
              <span className="text-gray-400 mx-2">vs</span>
              <span className="text-white font-bold uppercase">{teamB}</span>
              {isSmallOddsGame && (
                <span className="ml-2 text-yellow-400 font-bold text-[10px]">· SMALL ODDS</span>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
