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

  /* ---------- BASE & DEFICITS (Original untouched lines) ---------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit, setDeficit] = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit, setOneDeficit] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(230);
  const [bank, setBank] = useState(230);

  /* ---------- ARRAYED ASSETS (f0, e0, e1, 4-2, 3-3, 1-3, 0-3, 2-3, 12, 21) ---------- */
  const arrayedAssets = ["f0", "e0", "e1", "4-2", "3-3", "1-3", "0-3", "2-3", "12", "21"];
  
  // Individual deficits for each arrayed asset
  const [arrayDeficits, setArrayDeficits] = useState({
    "f0": 0, "e0": 0, "e1": 0, "4-2": 0, "3-3": 0,
    "1-3": 0, "0-3": 0, "2-3": 0, "12": 0, "21": 0
  });
  
  // Stakes for arrayed assets
  const [arrayStakes, setArrayStakes] = useState({});
  
  // Track which arrayed assets have been won (to remove button)
  const [wonArrayAssets, setWonArrayAssets] = useState(new Set());

  /* ---------- STAKES PER LINE (Original untouched) ---------- */
  const [amounts, setAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts, setZeroAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts, setOneAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------- CLICK INDICATORS ---------- */
  const [clicked, setClicked] = useState(new Set());

  /* ---------- REF FOR AUTOSAVE ---------- */
  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  // Asset labels for display
  const assetLabels = {
    "f0": "F0",
    "e0": "E0", 
    "e1": "E1",
    "4-2": "4-2",
    "3-3": "3-3",
    "1-3": "1-3",
    "0-3": "0-3",
    "2-3": "2-3",
    "12": "1-2",
    "21": "2-1"
  };

  // Map arrayed asset names to odds keys
  

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
        setSmallDeficit(res.data.smallDeficit ?? 230);
        setBank(res.data.bank ?? 230);
        setArrayDeficits(res.data.arrayDeficits || {
          "f0": 0, "e0": 0, "e1": 0, "4-2": 0, "3-3": 0,
          "1-3": 0, "0-3": 0, "2-3": 0, "12": 0, "21": 0
        });
        setWonArrayAssets(new Set(res.data.wonArrayAssets || []));
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
        baseDeficit, 
        deficit, 
        zeroDeficit, 
        oneDeficit,
        smallDeficit, 
        bank,
        arrayDeficits,
        wonArrayAssets: Array.from(wonArrayAssets)
      });
      console.log("✅ Saved");
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

  /* ================================================================
     BUILD LADDER FOR HDA (Original untouched)
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
    return { ladder, homeAmount, drawAmount, awayAmount, totalStaked: runningTotal - startTotal };
  };

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
  e.preventDefault();

  const home = sanitizeTeam(inputA) || "che";
  const away = sanitizeTeam(inputB) || "che";

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

  // ✅ LOCAL TOTALS (fix async bug)
  let totalHomeAmount = 0;
  let totalDrawAmount = 0;
  let totalAwayAmount = 0;

  /* ===================== 6-0 ===================== */
  const newBase6 = baseStake + deficit;
  setBaseStake(newBase6);
  setDeficit(0);

  const base = newBase6;
  let sixWinner = Math.round(base / found.winner);
  sixWinner = Math.max(sixWinner, 10);

  if (isSmall) {
    // No HDA for 6-0 in small odds
    let bankNow = bank;
    let sdNow = smallDeficit;

    if (bankNow >= sixWinner) {
      bankNow -= sixWinner;
    } else {
      sdNow += sixWinner - bankNow;
      bankNow = 0;
    }

    setBank(bankNow);
    setSmallDeficit(sdNow);

    setAmounts({
      winnerAmount: sixWinner,
      homeAmount: 0,
      drawAmount: 0,
      awayAmount: 0,
    });
  } else {
    const res6 = buildLadder(sixWinner, "6-0", code, oddsMap);
    newStakes.push(...res6.ladder);

    setAmounts({
      winnerAmount: sixWinner,
      homeAmount: res6.homeAmount,
      drawAmount: res6.drawAmount,
      awayAmount: res6.awayAmount,
    });

    
  }
  };
  /* ===================== 5-0 ===================== */
  const base50 = baseDeficit + zeroDeficit;
  let zeroWinner = Math.round(base50 / found.fiveZero);
  zeroWinner = Math.max(zeroWinner, 10);
   
  /* ================================================================
     RESOLVE RESULT FOR HDA (affects arrayed assets deficits)
     ================================================================ */
  
  const resolveResult = (step) => {
  if (!fixture) return;

  setClicked((prev) => new Set([...prev, step]));

  const calcLoss = (type) => {
    const stakes = orderedStakes.filter((s) => s.type === type);
    const idx = stakes.findIndex((s) => s.step === step);
    if (idx === -1) return 0;
    return stakes.slice(idx + 1).reduce((sum, s) => sum + s.stake, 0);
  };

  /* ===================== 6-0 ===================== */
  if (!isSmallOddsGame) {
    const mainLoss = calcLoss("6-0");
    setDeficit(mainLoss);
    setBaseDeficit((prev) => prev + mainLoss);
  }
  // ❌ small odds → skip entirely

  /* ===================== 5-0 ===================== */
  const zeroLoss = calcLoss("5-0");
  setZeroDeficit((prev) => prev + zeroLoss);

  /* ===================== 5-1 ===================== */
  const oneLoss = calcLoss("5-1");
  setOneDeficit((prev) => prev + oneLoss);

  /* ===================== ARRAYED ASSETS ===================== */
  setArrayDeficits((prev) => {
    const updated = { ...prev };

    for (const asset of arrayedAssets) {
      if (wonArrayAssets.has(asset)) continue;

      const stakeAmount = arrayStakes[asset]?.winnerAmount || 0;

      if (stakeAmount > 0) {
        updated[asset] = (updated[asset] || 0) + stakeAmount;
      }
    }

    return updated;
  });

  clearForNext();
};
  const resolveArrayAssetWin = (asset) => {
  if (!fixture) return;

  const stakeData = arrayStakes[asset];
  if (!stakeData) return;

  setClicked((prev) => new Set([...prev, asset]));

  // ✅ Reset ONLY this asset deficit
  setArrayDeficits((prev) => ({
    ...prev,
    [asset]: 0,
  }));

  // ✅ Mark as won
  setWonArrayAssets((prev) => new Set([...prev, asset]));

  // ✅ Reset small deficit
  setSmallDeficit(0);

  // ✅ Add ONLY actual stake (NOT ladder total)
  const residue = stakeData.winnerAmount || 0;

  if (residue > 0) {
    setBaseStake((prev) => prev + residue);
  }

  clearForNext();
};
  /* ================================================================
     JACKPOT HANDLERS (Original - UNTOUCHED)
     ================================================================ */
  const handleJackpot = () => {
    setClicked((prev) => new Set([...prev, "six"]));
    setBaseStake(10000);
    setBaseDeficit(0);
    setDeficit(0);
  };

  const handleZeroJackpot = () => {
    setClicked((prev) => new Set([...prev, "zero"]));
    const totalOtherDeficits = oneDeficit;
    setBaseStake(10000 + totalOtherDeficits);
    setBaseDeficit(totalOtherDeficits);
    setOneDeficit(0);
    setZeroDeficit(0);
  };

  const handleOneJackpot = () => {
    setClicked((prev) => new Set([...prev, "one"]));
    const totalOtherDeficits = zeroDeficit;
    setBaseStake(10000 + totalOtherDeficits);
    setBaseDeficit(totalOtherDeficits);
    setOneDeficit(0);
    setZeroDeficit(0);
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
    setArrayStakes({});
    setClicked(new Set());
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    saveBase();
  };

  /* ================================================================
     DERIVED
     ================================================================ */
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

        {/* ── JACKPOT ROW (Original 6-0, 5-0, 5-1 only) ── */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={handleJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("six")
                ? "bg-white text-yellow-500 ring-2 ring-yellow-400"
                : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}
          >
            <div className="text-xl font-black">6–0</div>
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
            <div className="text-xl font-black">5–0</div>
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
            <div className="text-xl font-black">5–1</div>
            <div className="text-[11px] mt-1 opacity-80">{oneAmounts.winnerAmount || "–"}</div>
          </button>
        </div>

        {/* ── ARRAYED ASSETS ROW (f0, e0, e1, 4-2, 3-3, 1-3, 0-3, 2-3, 12, 21) ── */}
        <div className="grid grid-cols-5 gap-3">
          {arrayedAssets.map((asset) => {
            // Don't show if already won
            if (wonArrayAssets.has(asset)) return null;
            
            const stakeAmount = arrayStakes[asset]?.winnerAmount;
            const deficitAmount = arrayDeficits[asset];
            const isActive = fixture && stakeAmount;
            
            if (isActive) {
              // Active asset with stake - clickable to win
              return (
                <button
                  key={asset}
                  onClick={() => resolveArrayAssetWin(asset)}
                  className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
                    clicked.has(asset)
                      ? "bg-white text-purple-600 ring-2 ring-purple-500"
                      : "bg-purple-500 text-white hover:bg-purple-400"
                  }`}
                >
                  <div className="text-xl font-black">{assetLabels[asset]}</div>
                  <div className="text-[11px] mt-1 opacity-80">{stakeAmount}</div>
                  {deficitAmount > 0 && (
                    <div className="text-[8px] mt-1 text-yellow-300">Def: {deficitAmount}</div>
                  )}
                </button>
              );
            } else {
              // Inactive - show deficit if any
              return (
                <button
                  key={asset}
                  disabled={true}
                  className="py-5 rounded-2xl font-extrabold text-sm shadow bg-gray-700 opacity-50 cursor-not-allowed"
                >
                  <div className="text-xl font-black">{assetLabels[asset]}</div>
                  <div className="text-[10px] mt-1">
                    {deficitAmount > 0 ? `Def: ${deficitAmount}` : "–"}
                  </div>
                </button>
              );
            }
          })}
        </div>

        {/* ── HDA ROW ── */}
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
            <span className="text-gray-400">Small Def</span>
            <strong className="text-blue-400">{smallDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bank</span>
            <strong className="text-emerald-400">{bank}</strong>
          </div>
          <div className="col-span-2">
            <div className="text-gray-400 text-center mb-1">Array Asset Deficits</div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {arrayedAssets.map(asset => (
                !wonArrayAssets.has(asset) && (
                  <div key={asset} className="flex justify-between">
                    <span>{assetLabels[asset]}:</span>
                    <strong className="text-purple-400">{arrayDeficits[asset]}</strong>
                  </div>
                )
              ))}
            </div>
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
