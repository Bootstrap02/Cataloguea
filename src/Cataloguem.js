
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { smallOdds, mediumOdds, bigOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

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
const defaultMap  = () => Object.fromEntries(ASSET_KEYS.map((k) => [k, 0]));
const defaultBases = () => Object.fromEntries(ASSETS.map((a) => [a.key, a.base]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  const [fixture,  setFixture]  = useState(null);
  const [gameType, setGameType] = useState("normal");

  const [assetBases,    setAssetBases]    = useState(defaultBases());
  const [assetDeficits, setAssetDeficits] = useState(defaultMap());
  const [assetStakes,   setAssetStakes]   = useState(defaultMap());
  const [assetCops,     setAssetCops]     = useState(defaultMap());
  const [assetSmallDef, setAssetSmallDef] = useState(defaultMap());
  const [retiredAssets, setRetiredAssets] = useState(new Set()); // permanently gone

  const [baseDeficit,  setBaseDeficit]  = useState(0);
  const [zeroDeficit,  setZeroDeficit]  = useState(0);
  const [oneDeficit,   setOneDeficit]   = useState(0);

  const [displayH, setDisplayH] = useState(0);
  const [displayD, setDisplayD] = useState(0);
  const [displayA, setDisplayA] = useState(0);

  const [zeroWinnerAmt, setZeroWinnerAmt] = useState(0);
  const [oneWinnerAmt,  setOneWinnerAmt]  = useState(0);

  const [orderedStakes, setOrderedStakes] = useState([]);
  const [clicked, setClicked] = useState(new Set());

  const basesRef = useRef(assetBases);
  useEffect(() => { basesRef.current = assetBases; }, [assetBases]);

  /* ── API ── */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) {
        setAssetBases(res.data.assetBases || defaultBases());
        setAssetDeficits(res.data.assetDeficits || defaultMap());
        setAssetSmallDef(res.data.assetSmallDef || defaultMap());
        setRetiredAssets(new Set(res.data.retiredAssets || []));
        setBaseDeficit(res.data.baseDeficit || 0);
        setZeroDeficit(res.data.zeroDeficit || 0);
        setOneDeficit(res.data.oneDeficit || 0);
      }
    } catch (err) { console.error("❌", err.message); }
    finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        assetBases: basesRef.current,
        assetDeficits,
        assetSmallDef,
        retiredAssets: Array.from(retiredAssets),
        baseDeficit,
        zeroDeficit,
        oneDeficit,
      });
    } catch (err) { console.error("❌", err.message); }
  };

  /* ── LADDER ── */
  const buildLadder = (startTotal, type, code, oddsMap) => {
    let running = startTotal;
    const ladder = [];
    let H = 0, D = 0, A = 0;
    for (const step of code) {
      const odd = oddsMap[step];
      if (!odd || odd <= 1.01) continue;
      const stake = Math.round(running / (odd - 1));
      ladder.push({ step, stake, type });
      if (step === "H") H = stake;
      if (step === "D") D = stake;
      if (step === "A") A = stake;
      running += stake;
    }
    return { ladder, homeAmount: H, drawAmount: D, awayAmount: A };
  };

  /* ── SUBMIT ── */
  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    let found = smallOdds.find((o) => o.home === home && o.away === away);
    let detectedType = "small";
    if (!found) { found = mediumOdds.find((o) => o.home === home && o.away === away); detectedType = "medium"; }
    if (!found) { found = bigOdds.find((o) => o.home === home && o.away === away); detectedType = "big"; }
    if (!found) { alert(`No odds found for "${home}" vs "${away}"`); return; }

    setGameType(detectedType);
    setFixture(found);
    setClicked(new Set());

    const isSmall = detectedType === "small";
    const isBig   = detectedType === "big";
    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    const code    = found.code || "";
    const newStakes = [];
    let totalH = 0, totalD = 0, totalA = 0;

    const newBases    = { ...assetBases };
    const newSmallDef = { ...assetSmallDef };
    const newStakeAmt = { ...assetStakes };
    const newCops     = { ...assetCops };

    for (const asset of ASSETS) {
      if (retiredAssets.has(asset.key)) continue;
      const assetOdds = found[asset.key];
      if (!assetOdds || assetOdds <= 1) continue;

      const assetDef = assetDeficits[asset.key] || 0;
      const newBase  = newBases[asset.key] + assetDef;
      newBases[asset.key] = newBase;

      let winnerAmt = Math.round(newBase / assetOdds);
      newStakeAmt[asset.key] = winnerAmt;

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

      const sd = newSmallDef[asset.key] || 0;
      newCops[asset.key] = sd > 0 ? Math.max(1, Math.round(sd / assetOdds)) : 0;
    }

    setAssetDeficits(defaultMap());
    setAssetBases(newBases);
    setAssetSmallDef(newSmallDef);
    setAssetStakes(newStakeAmt);
    setAssetCops(newCops);

    /* 5-0 */
    const base50 = baseDeficit + zeroDeficit;
    const zeroWinner = Math.round(base50 / found.fiveZero) ;
    const res50 = buildLadder(zeroWinner, "5-0", code, oddsMap);
    newStakes.push(...res50.ladder);
    setZeroWinnerAmt(zeroWinner);
    totalH += res50.homeAmount; totalD += res50.drawAmount; totalA += res50.awayAmount;

    /* 5-1 */
    const base51 = baseDeficit + oneDeficit;
    const oneWinner = Math.round(base51 / found.fiveOne);
    const res51 = buildLadder(oneWinner, "5-1", code, oddsMap);
    newStakes.push(...res51.ladder);
    setOneWinnerAmt(oneWinner);
    totalH += res51.homeAmount; totalD += res51.drawAmount; totalA += res51.awayAmount;

    setOrderedStakes(newStakes);
    setDisplayH(totalH);
    setDisplayD(totalD);
    setDisplayA(totalA);
  };

  /* ── RESOLVE HDA ── */
  const resolveResult = (step) => {
    if (!fixture) return;
    setClicked((prev) => new Set([...prev, step]));

    const calcLoss = (type) => {
      const stakes = orderedStakes.filter((s) => s.type === type);
      const idx = stakes.findIndex((s) => s.step === step);
      if (idx === -1) return 0;
      return stakes.slice(idx + 1).reduce((sum, s) => sum + s.stake, 0);
    };

    const newDeficits = { ...assetDeficits };
    const newBases    = { ...assetBases };
    let extraBaseDeficit = 0;

    for (const asset of ASSETS) {
      if (retiredAssets.has(asset.key)) continue;
      const loss = calcLoss(asset.key);
      newDeficits[asset.key] = (newDeficits[asset.key] || 0) + loss;

      // Every asset's HDA loss piles into baseDeficit so 5-0/5-1 chase all losses
      if (loss > 0) extraBaseDeficit += loss;

      // COP auto-feeds baseDeficit on every HDA click
      const cop = assetCops[asset.key] || 0;
      if (cop > 0) {
        newBases[asset.key] = (newBases[asset.key] || 0) + cop;
        extraBaseDeficit += cop;
      }
    }

    setAssetDeficits(newDeficits);
    setAssetBases(newBases);
    if (extraBaseDeficit > 0) setBaseDeficit((prev) => prev + extraBaseDeficit);

    setZeroDeficit((prev) => prev + calcLoss("5-0"));
    setOneDeficit((prev)  => prev + calcLoss("5-1"));

    clearForNext();
  };

  /* Any interaction with asset card — retires it permanently.
     If it has a COP stake, that goes into baseDeficit one last time. */
  const retireAsset = (assetKey) => {
    const cop = assetCops[assetKey] || 0;

    if (cop > 0) {
      setBaseDeficit((prev) => prev + cop);
      setAssetBases((prev) => ({ ...prev, [assetKey]: (prev[assetKey] || 0) + cop }));
    }

    setAssetSmallDef((prev) => ({ ...prev, [assetKey]: 0 }));
    setRetiredAssets((prev) => new Set([...prev, assetKey]));
  };

  /* ── JACKPOTS ── */
  const handleZeroJackpot = () => {
    setClicked((prev) => new Set([...prev, "zero"]));
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

  /* ── CLEAR ── */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null); setGameType("normal");
    setOrderedStakes([]); setClicked(new Set());
    setAssetStakes(defaultMap()); setAssetCops(defaultMap());
    setDisplayH(0); setDisplayD(0); setDisplayA(0);
    setZeroWinnerAmt(0); setOneWinnerAmt(0);
    saveBase();
  };

  const teamA    = sanitizeTeam(inputA) || "HME";
  const teamB    = sanitizeTeam(inputB) || "AWY";
  const gameLabel = gameType === "small" ? "SMALL" : gameType === "big" ? "BIG" : gameType === "medium" ? "MED" : null;
  const activeAssets = ASSETS.filter((a) => !retiredAssets.has(a.key));

  return (
    <div className="h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col overflow-hidden">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-sm font-extrabold text-red-400 tracking-tight">
          Virtual EPL
          {gameLabel && fixture && (
            <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold align-middle ${
              gameType === "small" ? "bg-yellow-500 text-black" :
              gameType === "big"   ? "bg-red-500 text-white" : "bg-orange-400 text-black"
            }`}>{gameLabel}</span>
          )}
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-3 py-1.5 bg-green-600 font-bold text-white text-[10px] hover:bg-green-700 transition">💾</button>
          <button onClick={fetchBase} disabled={isReloading} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 font-bold text-white text-[10px] hover:bg-red-700 transition disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={10} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 flex flex-col px-3 pb-3 gap-2 overflow-y-auto">

        {/* 5-0 / 5-1 */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button onClick={handleZeroJackpot} className={`py-2 rounded-xl font-extrabold text-xs transition active:scale-95 shadow ${clicked.has("zero") ? "bg-white text-yellow-600 ring-2 ring-yellow-500" : "bg-yellow-500 text-black"}`}>
            <div className="font-black">5–0</div>
            <div className="text-[10px] opacity-80">{zeroWinnerAmt || "–"}</div>
          </button>
          <button onClick={handleOneJackpot} className={`py-2 rounded-xl font-extrabold text-xs transition active:scale-95 shadow ${clicked.has("one") ? "bg-white text-orange-500 ring-2 ring-orange-400" : "bg-orange-400 text-black"}`}>
            <div className="font-black">5–1</div>
            <div className="text-[10px] opacity-80">{oneWinnerAmt || "–"}</div>
          </button>
        </div>

        {/* ASSET GRID — only active (non-retired) assets */}
        {activeAssets.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 shrink-0">
            {activeAssets.map((asset) => {
              const stakeAmt = assetStakes[asset.key]   || 0;
              const copAmt   = assetCops[asset.key]     || 0;
              const defAmt   = assetDeficits[asset.key] || 0;
              const sdAmt    = assetSmallDef[asset.key] || 0;

              return (
                <div
                  key={asset.key}
                  onClick={() => retireAsset(asset.key)}
                  className="bg-white/5 rounded-xl p-2 flex flex-col gap-1 cursor-pointer active:scale-95 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[10px] text-white">{asset.label}</span>
                    {defAmt > 0 && <span className="text-[8px] text-red-400">D:{defAmt}</span>}
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-black text-yellow-400">{stakeAmt || "–"}</span>
                    {sdAmt > 0 && <div className="text-[8px] text-blue-400">SD:{sdAmt}</div>}
                  </div>
                  {copAmt > 0 && (
                    <div className="w-full py-1 rounded-lg bg-blue-500 text-white text-center font-bold text-[9px]">
                      COP {copAmt}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* HDA */}
        <div className="grid grid-cols-3 gap-2 shrink-0">
          <button onClick={() => resolveResult("H")} disabled={!fixture}
            className={`py-3 rounded-xl font-bold text-xs transition active:scale-95 shadow text-white ${clicked.has("H") ? "bg-white text-green-600 ring-2 ring-green-500" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed" : "bg-green-500"}`}>
            <div className="font-extrabold uppercase text-[10px]">{teamA}</div>
            <div className="text-[10px] mt-0.5 opacity-80">{displayH || "–"}</div>
          </button>
          <button onClick={() => resolveResult("D")} disabled={!fixture}
            className={`py-3 rounded-xl font-bold text-xs transition active:scale-95 shadow text-white ${clicked.has("D") ? "bg-white text-gray-600 ring-2 ring-gray-400" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed" : "bg-gray-400"}`}>
            <div className="font-extrabold text-[10px]">DRAW</div>
            <div className="text-[10px] mt-0.5 opacity-80">{displayD || "–"}</div>
          </button>
          <button onClick={() => resolveResult("A")} disabled={!fixture}
            className={`py-3 rounded-xl font-bold text-xs transition active:scale-95 shadow text-white ${clicked.has("A") ? "bg-white text-red-600 ring-2 ring-red-500" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed" : "bg-red-500"}`}>
            <div className="font-extrabold uppercase text-[10px]">{teamB}</div>
            <div className="text-[10px] mt-0.5 opacity-80">{displayA || "–"}</div>
          </button>
        </div>

        {/* INPUTS */}
        <div className="shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-2 py-2 border border-red-600 rounded-lg text-center text-xs bg-transparent text-white placeholder-red-400 focus:outline-none" />
            <span className="font-black text-sm text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-2 py-2 border border-red-600 rounded-lg text-center text-xs bg-transparent text-white placeholder-red-400 focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={!!fixture}
              className={`flex-1 py-2.5 font-bold text-xs rounded-xl transition active:scale-95 shadow ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white"}`}>
              CALCULATE
            </button>
            <button onClick={clearForNext} disabled={!fixture}
              className={`flex-1 py-2.5 font-bold text-xs rounded-xl transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-green-700 text-white"}`}>
              NEXT
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-xl p-3 text-[10px] grid grid-cols-3 gap-x-4 gap-y-1 shrink-0">
          <div className="flex justify-between col-span-1">
            <span className="text-gray-400">BaseDef</span>
            <strong className="text-orange-400">{baseDeficit}</strong>
          </div>
          <div className="flex justify-between col-span-1">
            <span className="text-gray-400">5-0 Def</span>
            <strong className="text-yellow-400">{zeroDeficit}</strong>
          </div>
          <div className="flex justify-between col-span-1">
            <span className="text-gray-400">5-1 Def</span>
            <strong className="text-yellow-300">{oneDeficit}</strong>
          </div>
          {fixture && (
            <div className="col-span-3 pt-1 border-t border-white/10 text-center">
              <span className="text-white font-bold uppercase">{teamA}</span>
              <span className="text-gray-400 mx-1">vs</span>
              <span className="text-white font-bold uppercase">{teamB}</span>
              {gameLabel && <span className="ml-1 text-yellow-400 font-bold">· {gameLabel}</span>}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
