
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds, mediumOdds, bigOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

/* ----------------------------------------------------------------
   ASSET DEFINITIONS
   - key       : matches the odds field name in the fixture object
   - label     : display name on the button
   - base      : starting base amount for this asset
   - smallGate : if true → no HDA in smallOdds games (stake → smallDef)
   - bigGate   : if true → no HDA in bigOdds games (stake → smallDef)
---------------------------------------------------------------- */
const ASSETS = [
  { key: "winner",     label: "6-0",   base: 10000, smallGate: true,  bigGate: false },
  { key: "fourTwo",    label: "4-2",   base: 1500,  smallGate: false, bigGate: false },
  { key: "threeThree", label: "3-3",   base: 1500,  smallGate: false, bigGate: false },
  { key: "e0",         label: "E0",    base: 1500,  smallGate: true,  bigGate: false },
  { key: "e1",         label: "E1",    base: 1500,  smallGate: true,  bigGate: false },
  { key: "oneThree",   label: "1-3",   base: 700,   smallGate: false, bigGate: true  },
  { key: "zeroThree",  label: "0-3",   base: 700,   smallGate: false, bigGate: true  },
  { key: "twoThree",   label: "2-3",   base: 700,   smallGate: false, bigGate: true  },
  { key: "zeroFour",   label: "0-4",   base: 10000, smallGate: false, bigGate: true  },
  { key: "oneFour",    label: "1-4",   base: 4000,  smallGate: false, bigGate: true  },
  { key: "twoFour",    label: "2-4",   base: 6000,  smallGate: false, bigGate: true  },
  { key: "oneTwo",     label: "1-2",   base: 1000,  smallGate: false, bigGate: true  },
  { key: "twoOne",     label: "2-1",   base: 700,   smallGate: false, bigGate: true  },
  { key: "ht30",       label: "HT3-0", base: 3500,  smallGate: false, bigGate: true  },
];

const ASSET_KEYS = ASSETS.map((a) => a.key);

const defaultDeficits = () => Object.fromEntries(ASSET_KEYS.map((k) => [k, 0]));
const defaultBases    = () => Object.fromEntries(ASSETS.map((a) => [a.key, a.base]));

const Homepage = () => {

  /* ---------- INPUTS ---------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  /* ---------- FIXTURE ---------- */
  const [fixture, setFixture] = useState(null);
  const [gameType, setGameType] = useState("normal"); // "small" | "medium" | "big" | "normal"

  /* ---------- PER-ASSET STATE ---------- */
  // Each asset has its own base, deficit, stake, copAmount
  const [assetBases,    setAssetBases]    = useState(defaultBases());
  const [assetDeficits, setAssetDeficits] = useState(defaultDeficits());
  const [assetStakes,   setAssetStakes]   = useState(defaultDeficits()); // winnerAmount per asset
  const [assetCops,     setAssetCops]     = useState(defaultDeficits()); // cop stake per asset
  const [assetSmallDef, setAssetSmallDef] = useState(defaultDeficits()); // small deficit per asset

  /* ---------- 5-0 / 5-1 SHARED PROTECTION ---------- */
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit,  setOneDeficit]  = useState(0);
  // baseDeficit is used by 5-0/5-1 calc
  const [baseDeficit, setBaseDeficit] = useState(0);

  /* ---------- HDA DISPLAY AMOUNTS ---------- */
  // Combined H/D/A across all active assets + 5-0 + 5-1
  const [displayH, setDisplayH] = useState(0);
  const [displayD, setDisplayD] = useState(0);
  const [displayA, setDisplayA] = useState(0);

  /* ---------- 5-0 / 5-1 JACKPOT AMOUNTS ---------- */
  const [zeroWinnerAmt, setZeroWinnerAmt] = useState(0);
  const [oneWinnerAmt,  setOneWinnerAmt]  = useState(0);

  /* ---------- ORDERED STAKES FOR LOSS CALC ---------- */
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------- CLICK INDICATORS ---------- */
  const [clicked, setClicked] = useState(new Set());

  /* ---------- REF FOR AUTOSAVE ---------- */
  const basesRef = useRef(assetBases);
  useEffect(() => { basesRef.current = assetBases; }, [assetBases]);

  /* ================================================================
     API
     ================================================================ */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) {
        setAssetBases(res.data.assetBases || defaultBases());
        setAssetDeficits(res.data.assetDeficits || defaultDeficits());
        setAssetSmallDef(res.data.assetSmallDef || defaultDeficits());
        setBaseDeficit(res.data.baseDeficit || 0);
        setZeroDeficit(res.data.zeroDeficit || 0);
        setOneDeficit(res.data.oneDeficit || 0);
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
        assetBases: basesRef.current,
        assetDeficits,
        assetSmallDef,
        baseDeficit,
        zeroDeficit,
        oneDeficit,
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
      stake = Math.max(stake, 10);

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

    // Detect game type by checking each array in order
    let found = smallOdds.find((o) => o.home === home && o.away === away);
    let detectedType = "small";
    if (!found) { found = mediumOdds.find((o) => o.home === home && o.away === away); detectedType = "medium"; }
    if (!found) { found = bigOdds.find((o) => o.home === home && o.away === away); detectedType = "big"; }
    if (!found) { found = odds.find((o) => o.home === home && o.away === away); detectedType = "normal"; }

    if (!found) {
      alert(`No odds found for "${home}" vs "${away}"`);
      return;
    }

    setGameType(detectedType);
    setFixture(found);
    setClicked(new Set());

    const isSmall  = detectedType === "small";
    const isBig    = detectedType === "big";

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    const code    = found.code || "";
    const newStakes = [];

    let totalH = 0;
    let totalD = 0;
    let totalA = 0;

    // Local copies of mutable state to compute correctly in one pass
    const newBases    = { ...assetBases };
    const newSmallDef = { ...assetSmallDef };
    const newStakeAmt = { ...assetStakes };
    const newCops     = { ...assetCops };

    /* ===================== EACH ASSET ===================== */
    for (const asset of ASSETS) {
      const assetOdds = found[asset.key];
      if (!assetOdds || assetOdds <= 1) continue;

      // Merge asset's own deficit into its base (same as how 6-0 merges deficit into baseStake)
      const assetDef = assetDeficits[asset.key] || 0;
      const newBase  = newBases[asset.key] + assetDef;
      newBases[asset.key] = newBase;

      let winnerAmt = Math.round(newBase / assetOdds);
      winnerAmt = Math.max(winnerAmt, 10);
      newStakeAmt[asset.key] = winnerAmt;

      // Determine if this asset is gated (no HDA → stake goes to smallDef)
      const isGated = (isSmall && asset.smallGate) || (isBig && asset.bigGate);

      if (isGated) {
        newSmallDef[asset.key] = (newSmallDef[asset.key] || 0) + winnerAmt;
      } else {
        const res = buildLadder(winnerAmt, asset.key, code, oddsMap);
        newStakes.push(...res.ladder);
        totalH += res.homeAmount;
        totalD += res.drawAmount;
        totalA += res.awayAmount;
      }

      // COP = smallDef[asset] / assetOdds
      const sd = newSmallDef[asset.key] || 0;
      newCops[asset.key] = sd > 0 ? Math.max(1, Math.round(sd / assetOdds)) : 0;
    }

    // Reset each asset's own deficit to 0 after merging into base
    setAssetDeficits(defaultDeficits());
    setAssetBases(newBases);
    setAssetSmallDef(newSmallDef);
    setAssetStakes(newStakeAmt);
    setAssetCops(newCops);

    /* ===================== 5-0 — always HDA ===================== */
    const base50 = baseDeficit + zeroDeficit;
    let zeroWinner = Math.round(base50 / found.fiveZero);
    zeroWinner = Math.max(zeroWinner, 10);

    const res50 = buildLadder(zeroWinner, "5-0", code, oddsMap);
    newStakes.push(...res50.ladder);
    setZeroWinnerAmt(zeroWinner);

    totalH += res50.homeAmount;
    totalD += res50.drawAmount;
    totalA += res50.awayAmount;

    /* ===================== 5-1 — always HDA ===================== */
    const base51 = baseDeficit + oneDeficit;
    let oneWinner = Math.round(base51 / found.fiveOne);
    oneWinner = Math.max(oneWinner, 10);

    const res51 = buildLadder(oneWinner, "5-1", code, oddsMap);
    newStakes.push(...res51.ladder);
    setOneWinnerAmt(oneWinner);

    totalH += res51.homeAmount;
    totalD += res51.drawAmount;
    totalA += res51.awayAmount;

    setOrderedStakes(newStakes);
    setDisplayH(totalH);
    setDisplayD(totalD);
    setDisplayA(totalA);
  };

  /* ================================================================
     RESOLVE RESULT (HDA clicked)
     - Each asset's HDA loss → back into that asset's deficit
     - COP stake of each asset auto-feeds that asset's base
     - 5-0 / 5-1 losses go to zeroDeficit / oneDeficit
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

    // Each asset takes its own HDA loss back into its deficit
    const newDeficits = { ...assetDeficits };
    const newBases    = { ...assetBases };

    for (const asset of ASSETS) {
      const loss = calcLoss(asset.key);
      newDeficits[asset.key] = (newDeficits[asset.key] || 0) + loss;

      // COP auto-feeds this asset's base
      const cop = assetCops[asset.key] || 0;
      if (cop > 0) {
        newBases[asset.key] = (newBases[asset.key] || 0) + cop;
        setBaseDeficit((prev) => prev + cop);
      }
    }

    setAssetDeficits(newDeficits);
    setAssetBases(newBases);

    /* 5-0 */
    const zeroLoss = calcLoss("5-0");
    setZeroDeficit((prev) => prev + zeroLoss);

    /* 5-1 */
    const oneLoss = calcLoss("5-1");
    setOneDeficit((prev) => prev + oneLoss);

    clearForNext();
  };

  /* ================================================================
     COP HANDLER (per asset — win → smallDef for that asset = 0)
     ================================================================ */
  const handleCop = (assetKey) => {
    if (!fixture) return;
    setClicked((prev) => new Set([...prev, `cop_${assetKey}`]));
    setAssetSmallDef((prev) => ({ ...prev, [assetKey]: 0 }));
  };

  /* ================================================================
     JACKPOT HANDLERS (5-0 and 5-1 wins)
     ================================================================ */
  const handleZeroJackpot = () => {
    setClicked((prev) => new Set([...prev, "zero"]));
    // 5-0 wins: reset zeroDeficit, carry oneDeficit into baseDeficit
    setBaseDeficit(oneDeficit);
    setZeroDeficit(0);
    setOneDeficit(0);
  };

  const handleOneJackpot = () => {
    setClicked((prev) => new Set([...prev, "one"]));
    setBaseDeficit(zeroDeficit);
    setZeroDeficit(0);
    setOneDeficit(0);
  };

  /* ================================================================
     CLEAR FOR NEXT
     ================================================================ */
  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setGameType("normal");
    setOrderedStakes([]);
    setClicked(new Set());
    setAssetStakes(defaultDeficits());
    setAssetCops(defaultDeficits());
    setDisplayH(0);
    setDisplayD(0);
    setDisplayA(0);
    setZeroWinnerAmt(0);
    setOneWinnerAmt(0);
    saveBase();
  };

  /* ================================================================
     DERIVED
     ================================================================ */
  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  const gameLabel = gameType === "small" ? "SMALL" : gameType === "big" ? "BIG" : gameType === "medium" ? "MED" : null;

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-5 pt-6 pb-3 shrink-0">
        <h1 className="text-base font-extrabold text-red-400 tracking-tight leading-tight">
          Virtual EPL
          {gameLabel && fixture && (
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold align-middle ${
              gameType === "small" ? "bg-yellow-500 text-black" :
              gameType === "big"   ? "bg-red-500 text-white" :
                                     "bg-orange-400 text-black"
            }`}>
              {gameLabel}
            </span>
          )}
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-4 py-2 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">
            💾 Save
          </button>
          <button onClick={fetchBase} disabled={isReloading} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div className="flex-1 flex flex-col px-4 pb-6 gap-4 overflow-y-auto">

        {/* ── 5-0 / 5-1 JACKPOT ROW ── */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            onClick={handleZeroJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("zero")
                ? "bg-white text-yellow-600 ring-2 ring-yellow-500"
                : "bg-yellow-500 text-black hover:bg-yellow-400"
            }`}
          >
            <div className="text-lg font-black">5–0</div>
            <div className="text-[11px] mt-1 opacity-80">{zeroWinnerAmt || "–"}</div>
          </button>
          <button
            onClick={handleOneJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("one")
                ? "bg-white text-orange-500 ring-2 ring-orange-400"
                : "bg-orange-400 text-black hover:bg-orange-300"
            }`}
          >
            <div className="text-lg font-black">5–1</div>
            <div className="text-[11px] mt-1 opacity-80">{oneWinnerAmt || "–"}</div>
          </button>
        </div>

        {/* ── ASSET GRID ── */}
        <div className="grid grid-cols-2 gap-3">
          {ASSETS.map((asset) => {
            const stakeAmt  = assetStakes[asset.key]  || 0;
            const copAmt    = assetCops[asset.key]    || 0;
            const defAmt    = assetDeficits[asset.key]|| 0;
            const sdAmt     = assetSmallDef[asset.key]|| 0;
            const baseAmt   = assetBases[asset.key]   || asset.base;
            const copClicked = clicked.has(`cop_${asset.key}`);

            return (
              <div key={asset.key} className="bg-white/5 rounded-2xl p-3 flex flex-col gap-2">
                {/* Asset header */}
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-white">{asset.label}</span>
                  <span className="text-[10px] text-gray-400">Base: {baseAmt}</span>
                </div>

                {/* Stake */}
                <div className="text-center">
                  <span className="text-lg font-black text-yellow-400">{stakeAmt || "–"}</span>
                  {defAmt > 0 && <div className="text-[9px] text-red-400">Def: {defAmt}</div>}
                  {sdAmt > 0  && <div className="text-[9px] text-blue-400">SD: {sdAmt}</div>}
                </div>

                {/* COP button */}
                <button
                  onClick={() => handleCop(asset.key)}
                  disabled={!fixture || copClicked || copAmt === 0}
                  className={`w-full py-1.5 rounded-xl font-bold text-xs transition active:scale-95 ${
                    copClicked
                      ? "bg-white text-blue-600 ring-1 ring-blue-400"
                      : !fixture || copAmt === 0
                      ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                      : "bg-blue-500 text-white hover:bg-blue-400"
                  }`}
                >
                  COP {copAmt > 0 ? copAmt : "–"}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── HDA ROW ── */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("H") ? "bg-white text-green-600 ring-2 ring-green-500"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-green-500 hover:bg-green-400"
            }`}
          >
            <div className="text-base font-extrabold uppercase tracking-wide">{teamA}</div>
            <div className="text-[11px] mt-1 opacity-80">{displayH || "–"}</div>
          </button>

          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("D") ? "bg-white text-gray-600 ring-2 ring-gray-400"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-gray-400 hover:bg-gray-300"
            }`}
          >
            <div className="text-base font-extrabold">DRAW</div>
            <div className="text-[11px] mt-1 opacity-80">{displayD || "–"}</div>
          </button>

          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("A") ? "bg-white text-red-600 ring-2 ring-red-500"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-red-500 hover:bg-red-400"
            }`}
          >
            <div className="text-base font-extrabold uppercase tracking-wide">{teamB}</div>
            <div className="text-[11px] mt-1 opacity-80">{displayA || "–"}</div>
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
                fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 hover:bg-red-600 text-white"
              }`}
            >
              CALCULATE
            </button>
            <button
              onClick={clearForNext}
              disabled={!fixture}
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 shadow ${
                !fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-green-700 hover:bg-green-600 text-white"
              }`}
            >
              NEXT
            </button>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="bg-white/5 rounded-2xl p-4 text-xs grid grid-cols-2 gap-x-6 gap-y-2">
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
          {fixture && (
            <div className="col-span-2 pt-2 border-t border-white/10 text-center">
              <span className="text-white font-bold uppercase">{teamA}</span>
              <span className="text-gray-400 mx-2">vs</span>
              <span className="text-white font-bold uppercase">{teamB}</span>
              {gameLabel && (
                <span className="ml-2 text-yellow-400 font-bold text-[10px]">· {gameLabel} ODDS</span>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
