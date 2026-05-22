
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const ASSETS = [
  "oneX", "twoX", "x2", "tg0", "tg6", "ht12", "ht21", "ht30", "ft40", "ft41"
];

const Homepage = () => {

  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  /* ── WEEK COUNT ── */
  const [week, setWeek] = useState(1);

  /* ── WINNER ── */
  const [baseStake, setBaseStake] = useState(10000);
  const [deficit, setDeficit] = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);

  /* ── TOTAL DEFICIT (sum of all asset deficits) ── */
  const [totalDeficit, setTotalDeficit] = useState(0);

  /* ── RESIDUE ── */
  const [residue, setResidue] = useState(0);

  /* ── WINS COUNT (max 16) ── */
  const [winsCount, setWinsCount] = useState(0);
  const [martingaleActive, setMartingaleActive] = useState(true);

  /* ── QUALIFIED ARRAY (assets that have won and now chase totalDeficit + residue) ── */
  const [qualified, setQualified] = useState([]);

  /* ── ASSET DEFICITS (all start at 0) ── */
  const [assetDeficits, setAssetDeficits] = useState({
    oneX: 0, twoX: 0, x2: 0, tg0: 0, tg6: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0
  });

  /* ── CURRENT GAME STAKES ── */
  const [stakes, setStakes] = useState({
    oneX: 0, twoX: 0, x2: 0, tg0: 0, tg6: 0,
    ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0
  });

  /* ── WINNERS THIS GAME ── */
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     UPDATE TOTAL DEFICIT
     ================================================================ */
  const updateTotalDeficit = (deficits) => {
    const total = Object.values(deficits).reduce((sum, val) => sum + val, 0);
    setTotalDeficit(total);
    return total;
  };

  /* ================================================================
     API
     ================================================================ */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d = res.data || {};
      setWeek(d.week ?? 1);
      setBaseStake(d.base ?? 10000);
      setDeficit(d.deficit ?? 0);
      setSmallDeficit(d.smallDeficit ?? 0);
      setTotalDeficit(d.totalDeficit ?? 0);
      setResidue(d.residue ?? 0);
      setWinsCount(d.winsCount ?? 0);
      setMartingaleActive(d.martingaleActive ?? true);
      setQualified(d.qualified ?? []);
      setAssetDeficits(d.assetDeficits ?? {
        oneX: 0, twoX: 0, x2: 0, tg0: 0, tg6: 0,
        ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0
      });
    } catch (err) { console.error("❌ fetch:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        week, base: baseRef.current, deficit, smallDeficit,
        totalDeficit, residue, winsCount, martingaleActive,
        qualified, assetDeficits
      });
    } catch (err) { console.error("❌ save:", err.message); }
  };

  useEffect(() => { fetchBase(); }, []);

  /* ================================================================
     CALCULATE STAKE
     ================================================================ */
  const calcStake = (def, odd) => {
    if (!odd || odd <= 1.01) return 0;
    let chaseAmount = smallDeficit;
    
    // If asset is qualified, chase totalDeficit + residue
    if (qualified.includes(def.assetName)) {
      chaseAmount = totalDeficit + residue;
    }
    
    const total = def.amount + chaseAmount;
    return Math.max(Math.round(total / (odd - 1)), 10);
  };

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";
    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) { alert(`No odds found for "${home}" vs "${away}"`); return; }

    setFixture(found);
    setClicked(new Set());
    setWinners(new Set());

    /* ── Winner stake calculation ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    setSmallDeficit((prev) => prev + wStake);

    /* ── Calculate stakes for all assets ── */
    const oddsMap = {
      oneX: found.oneX, twoX: found.twoX, x2: found.x2,
      tg0: found.zeroGoals, tg6: found.sixGoals,
      ht12: found.ht12, ht21: found.ht21, ht30: found.ht30,
      ft40: found.ft40, ft41: found.ft41
    };

    const newStakes = {};
    for (const asset of ASSETS) {
      const odd = oddsMap[asset];
      const assetDef = assetDeficits[asset];
      
      if (martingaleActive) {
        let chaseAmount = smallDeficit;
        if (qualified.includes(asset)) {
          chaseAmount = totalDeficit + residue;
        }
        const total = assetDef + chaseAmount;
        newStakes[asset] = odd > 1.01 ? Math.max(Math.round(total / (odd - 1)), 10) : 0;
      } else {
        newStakes[asset] = 0;
      }
    }
    
    setStakes(newStakes);
  };

  /* ================================================================
     WIN HANDLER
     ================================================================ */
  const handleWin = (asset) => {
    if (!fixture || clicked.has(asset) || !martingaleActive) return;
    setClicked((prev) => new Set([...prev, asset]));
    setWinners((prev) => new Set([...prev, asset]));

    // Update wins count
    const newWinsCount = winsCount + 1;
    setWinsCount(newWinsCount);

    // If asset is already qualified, reset its deficit to 0
    if (qualified.includes(asset)) {
      setAssetDeficits(prev => {
        const newDefs = { ...prev, [asset]: 0 };
        updateTotalDeficit(newDefs);
        return newDefs;
      });
      setResidue(0);
      setTotalDeficit(0);
    } else {
      // Add to qualified array
      setQualified(prev => [...prev, asset]);
    }

    // Check if we reached 16 wins
    if (newWinsCount >= 16) {
      setMartingaleActive(false);
      // Push total deficit into residue
      setResidue(prev => prev + totalDeficit);
      // Reset total deficit and all asset deficits to 0
      const resetDefs = {};
      for (const a of ASSETS) {
        resetDefs[a] = 0;
      }
      setAssetDeficits(resetDefs);
      setTotalDeficit(0);
    }
  };

  /* ================================================================
     NEXT HANDLER
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    // Increment week
    const newWeek = week + 1;
    setWeek(newWeek);

    // Handle losses - add non-win stakes to their deficits
    const newDeficits = { ...assetDeficits };
    
    for (const asset of ASSETS) {
      if (!winners.has(asset) && stakes[asset] > 0) {
        newDeficits[asset] += stakes[asset];
      }
    }
    
    setAssetDeficits(newDeficits);
    updateTotalDeficit(newDeficits);

    // Check if week 38 is complete
    if (newWeek > 38) {
      // Reset everything
      setWeek(1);
      setMartingaleActive(true);
      setWinsCount(0);
      setQualified([]);
      setResidue(0);
      const resetDefs = {};
      for (const a of ASSETS) {
        resetDefs[a] = 0;
      }
      setAssetDeficits(resetDefs);
      setTotalDeficit(0);
      setSmallDeficit(0);
    }

    clearForNext();
  };

  /* ================================================================
     6-0 JACKPOT
     ================================================================ */
  const handleJackpot = () => {
    setClicked((prev) => new Set([...prev, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  /* ================================================================
     CLEAR
     ================================================================ */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setClicked(new Set());
    setWinners(new Set());
    setWinnerStake(0);
    setStakes({
      oneX: 0, twoX: 0, x2: 0, tg0: 0, tg6: 0,
      ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0
    });
    saveBase();
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  const btnClass = (key, color) =>
    `py-3 rounded-xl font-bold text-xs transition active:scale-95 ${
      winners.has(key)
        ? "bg-green-500 text-white ring-2 ring-green-300"
        : !fixture
        ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
        : `${color} text-white`
    }`;

  const assetColors = {
    oneX: "bg-purple-600", twoX: "bg-pink-600", x2: "bg-rose-600",
    tg0: "bg-cyan-600", tg6: "bg-teal-600",
    ht12: "bg-blue-600", ht21: "bg-emerald-600",
    ht30: "bg-green-600", ft40: "bg-indigo-600", ft41: "bg-violet-600"
  };

  const assetLabels = {
    oneX: "1X", twoX: "2X", x2: "X2",
    tg0: "0G", tg6: "6G",
    ht12: "HT12", ht21: "HT21", ht30: "HT30",
    ft40: "FT40", ft41: "FT41"
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
        <h1 className="text-sm font-extrabold text-red-400">
          Virtual EPL | Week {week}/38
          {!martingaleActive && <span className="ml-2 text-[10px] bg-orange-500 px-2 py-0.5 rounded-full">MARTINGALE OFF</span>}
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-3 py-1.5 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">💾</button>
          <button onClick={fetchBase} disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={11} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-4 gap-3 overflow-y-auto">

        {/* WINNER / JACKPOT / NEXT */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={handleJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] mt-0.5 opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-green-700 text-white hover:bg-green-600"}`}>
            <div className="font-black">NEXT</div>
            <div className="text-[9px] mt-0.5 opacity-70">week +1</div>
          </button>
          <div className="bg-white/10 rounded-2xl flex flex-col items-center justify-center text-[10px] font-mono gap-0.5">
            <div>Small Def: <strong className="text-blue-300">{smallDeficit}</strong></div>
            <div>Wins: <strong className="text-yellow-300">{winsCount}/16</strong></div>
          </div>
        </div>

        {/* ASSETS GRID */}
        <div className="grid grid-cols-5 gap-2">
          {ASSETS.map((asset) => (
            <button key={asset} onClick={() => handleWin(asset)} disabled={!fixture || !martingaleActive}
              className={btnClass(asset, assetColors[asset])}>
              <div className="font-black text-[11px]">{assetLabels[asset]}</div>
              <div className="text-[10px] mt-0.5">{stakes[asset] || "–"}</div>
              <div className="text-[8px] opacity-60 mt-0.5">D:{assetDeficits[asset]}</div>
              {qualified.includes(asset) && <div className="text-[7px] text-yellow-300">★Q</div>}
            </button>
          ))}
        </div>

        {/* INPUTS */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
            <span className="font-black text-lg text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
          </div>
          <button onClick={handleSubmit} disabled={!!fixture}
            className={`w-full py-3 font-bold text-sm rounded-xl transition active:scale-95 shadow ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
            CALCULATE
          </button>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px]">
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
            <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
            <div className="flex justify-between"><span className="text-gray-400">Total Def</span><strong className="text-orange-400">{totalDeficit}</strong></div>
            <div className="flex justify-between"><span className="text-gray-400">Residue</span><strong className="text-purple-400">{residue}</strong></div>
            <div className="flex justify-between"><span className="text-gray-400">Qualified</span><strong className="text-yellow-400">{qualified.length}/10</strong></div>
          </div>
          {fixture && (
            <div className="pt-2 mt-2 border-t border-white/10 text-center font-bold">
              <span className="uppercase">{teamA}</span>
              <span className="text-gray-400 mx-1">vs</span>
              <span className="uppercase">{teamB}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
