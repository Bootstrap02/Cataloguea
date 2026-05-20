
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {

  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  // Winner states
  const [baseStake, setBaseStake] = useState(10000);
  const [deficit, setDeficit] = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);
  const [bank, setBank] = useState(1500);
  const [smallDeficit, setSmallDeficit] = useState(0);

  // TEAM A - Private Deficits (start at 200)
  const [oneXDef, setOneXDef] = useState(200);
  const [twoXDef, setTwoXDef] = useState(200);
  const [ht12Def, setHt12Def] = useState(200);
  const [ft40Def, setFt40Def] = useState(200);
  const [ft41Def, setFt41Def] = useState(200);

  // TEAM B - Private Deficits (start at 0)
  const [tg0Def, setTg0Def] = useState(0);
  const [tg6Def, setTg6Def] = useState(0);
  const [ht21Def, setHt21Def] = useState(0);
  const [ht30Def, setHt30Def] = useState(0);
  const [x2Def, setX2Def] = useState(0);

  // Current game stakes
  const [stakes, setStakes] = useState({
    oneX: 0, twoX: 0, ht12: 0, ft40: 0, ft41: 0,
    tg0: 0, tg6: 0, ht21: 0, ht30: 0, x2: 0
  });

  const [clicked, setClicked] = useState(new Set());
  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     API
     ================================================================ */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d = res.data || {};
      setBaseStake(d.base ?? 10000);
      setDeficit(d.deficit ?? 0);
      setBank(d.bank ?? 1500);
      setSmallDeficit(d.smallDeficit ?? 0);
      
      setOneXDef(d.oneXDef ?? 200);
      setTwoXDef(d.twoXDef ?? 200);
      setHt12Def(d.ht12Def ?? 200);
      setFt40Def(d.ft40Def ?? 200);
      setFt41Def(d.ft41Def ?? 200);
      
      setTg0Def(d.tg0Def ?? 0);
      setTg6Def(d.tg6Def ?? 0);
      setHt21Def(d.ht21Def ?? 0);
      setHt30Def(d.ht30Def ?? 0);
      setX2Def(d.x2Def ?? 0);
    } catch (err) { console.error("❌ fetch:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        base: baseRef.current,
        deficit,
        bank,
        smallDeficit,
        oneXDef, twoXDef, ht12Def, ft40Def, ft41Def,
        tg0Def, tg6Def, ht21Def, ht30Def, x2Def,
      });
    } catch (err) { console.error("❌ save:", err.message); }
  };

  useEffect(() => { fetchBase(); }, []);

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  
  const handleSubmit = (e) => {
  e.preventDefault();

  const home = sanitizeTeam(inputA) || "che";
  const away = sanitizeTeam(inputB) || "che";

  const found = odds.find(
    (o) => o.home === home && o.away === away
  );

  if (!found) {
    alert(`No odds found for "${home}" vs "${away}"`);
    return;
  }

  setFixture(found);
  setClicked(new Set());

  /* =========================================================
     MAIN WINNER SYSTEM
     ========================================================= */

  const newBase = baseStake + deficit;

  setBaseStake(newBase);
  setDeficit(0);

  const wStake = Math.max(
    Math.round(newBase / found.winner),
    10
  );

  setWinnerStake(wStake);

  setSmallDeficit((prev) => prev + wStake);

  /* =========================================================
     TEAM A TARGET STATES
     DEFAULT TARGET = 200
     ========================================================= */

  const TEAM_A_TARGET = 200;

  /* =========================================================
     BANK LOGIC
     ========================================================= */

  let bankNow = bank;

  const totalNeeded = TEAM_A_TARGET * 5;

  if (bankNow >= totalNeeded) {
    bankNow -= totalNeeded;
  } else {
    const residue = totalNeeded - bankNow;

    bankNow = 0;

    const residueShare = Math.ceil(residue / 5);

    setOneXDef((prev) => prev + residueShare);
    setTwoXDef((prev) => prev + residueShare);
    setHt12Def((prev) => prev + residueShare);
    setFt40Def((prev) => prev + residueShare);
    setFt41Def((prev) => prev + residueShare);
  }

  setBank(bankNow);

  /* =========================================================
     STAKE CALCULATORS
     ========================================================= */

  const calcStake = (target, deficitState, odd) => {
    if (!odd || odd <= 1.01) return 0;

    const total = target + deficitState;

    return Math.max(
      Math.round(total / (odd - 1)),
      10
    );
  };

  /* =========================================================
     TEAM A
     TARGET = 200
     DEFICIT = own deficit
     ========================================================= */

  const newStakes = {
    oneX: calcStake(
      TEAM_A_TARGET,
      oneXDef,
      found.oneX
    ),

    twoX: calcStake(
      TEAM_A_TARGET,
      twoXDef,
      found.twoX
    ),

    ht12: calcStake(
      TEAM_A_TARGET,
      ht12Def,
      found.ht12
    ),

    ft40: calcStake(
      TEAM_A_TARGET,
      ft40Def,
      found.ft40
    ),

    ft41: calcStake(
      TEAM_A_TARGET,
      ft41Def,
      found.ft41
    ),

    /* =====================================================
       TEAM B
       TARGET = TEAM A DEFICIT STATE
       + own deficit state
       ===================================================== */

    tg0: calcStake(
      oneXDef,
      tg0Def,
      found.zeroGoals
    ),

    tg6: calcStake(
      twoXDef,
      tg6Def,
      found.sixGoals
    ),

    ht21: calcStake(
      ht12Def,
      ht21Def,
      found.ht21
    ),

    ht30: calcStake(
      ft40Def,
      ht30Def,
      found.ht30
    ),

    x2: calcStake(
      ft41Def,
      x2Def,
      found.x2
    ),
  };

  setStakes(newStakes);
};
  

  /* ================================================================
     LOSS HANDLER (when NEXT is clicked with no wins)
     - All stakes go to their respective private deficits
     ================================================================ */
  
  const handleNextWithLoss = () => {
  if (!fixture) return;

  /* =========================================================
     TEAM A
     TARGET STATES stay at 200 permanently
     DEFICIT STATES receive the stakes
     ========================================================= */

  // 1X
  if (!clicked.has("oneX")) {
    setOneXDef((prev) => prev + stakes.oneX);
  }

  // 2X
  if (!clicked.has("twoX")) {
    setTwoXDef((prev) => prev + stakes.twoX);
  }

  // HT12
  if (!clicked.has("ht12")) {
    setHt12Def((prev) => prev + stakes.ht12);
  }

  // FT40
  if (!clicked.has("ft40")) {
    setFt40Def((prev) => prev + stakes.ft40);
  }

  // FT41
  if (!clicked.has("ft41")) {
    setFt41Def((prev) => prev + stakes.ft41);
  }

  /* =========================================================
     TEAM B
     Uses Team A deficit states as target states
     But also has its own deficits
     ========================================================= */

  // TG0 uses oneXDef as target
  if (!clicked.has("tg0")) {
    setTg0Def((prev) => prev + stakes.tg0);
  }

  // TG6 uses twoXDef as target
  if (!clicked.has("tg6")) {
    setTg6Def((prev) => prev + stakes.tg6);
  }

  // HT21 uses ht12Def as target
  if (!clicked.has("ht21")) {
    setHt21Def((prev) => prev + stakes.ht21);
  }

  // HT30 uses ft40Def as target
  if (!clicked.has("ht30")) {
    setHt30Def((prev) => prev + stakes.ht30);
  }

  // X2 uses ft41Def as target
  if (!clicked.has("x2")) {
    setX2Def((prev) => prev + stakes.x2);
  }

  clearForNext();
};

  /* ================================================================
     WIN HANDLERS
     - Reset specific asset, add to bank, other assets still lose
     ================================================================ */
  
  // Team A Win: deficit back to 200, bank +200
  const handleOneXWin = () => {
    if (!fixture || clicked.has("oneX")) return;
    setClicked(prev => new Set([...prev, "oneX"]));
    
    // Reset this asset
    setOneXDef(200);
    setBank(prev => prev + 200);
    
    // All other assets still lose (their stakes go to deficits)
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    // Team B stakes all lose (add to their deficits)
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  const handleTwoXWin = () => {
    if (!fixture || clicked.has("twoX")) return;
    setClicked(prev => new Set([...prev, "twoX"]));
    
    setTwoXDef(200);
    setBank(prev => prev + 200);
    
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  const handleHt12Win = () => {
    if (!fixture || clicked.has("ht12")) return;
    setClicked(prev => new Set([...prev, "ht12"]));
    
    setHt12Def(200);
    setBank(prev => prev + 200);
    
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  const handleFt40Win = () => {
    if (!fixture || clicked.has("ft40")) return;
    setClicked(prev => new Set([...prev, "ft40"]));
    
    setFt40Def(200);
    setBank(prev => prev + 200);
    
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  const handleFt41Win = () => {
    if (!fixture || clicked.has("ft41")) return;
    setClicked(prev => new Set([...prev, "ft41"]));
    
    setFt41Def(200);
    setBank(prev => prev + 200);
    
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  // Team B Win: deficit to 0, bank +100
  const handleTg0Win = () => {
    if (!fixture || clicked.has("tg0")) return;
    setClicked(prev => new Set([...prev, "tg0"]));
    
    setTg0Def(0);
    setBank(prev => prev + 100);
    
    // All other assets lose
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  const handleTg6Win = () => {
    if (!fixture || clicked.has("tg6")) return;
    setClicked(prev => new Set([...prev, "tg6"]));
    
    setTg6Def(0);
    setBank(prev => prev + 100);
    
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  const handleHt21Win = () => {
    if (!fixture || clicked.has("ht21")) return;
    setClicked(prev => new Set([...prev, "ht21"]));
    
    setHt21Def(0);
    setBank(prev => prev + 100);
    
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  const handleHt30Win = () => {
    if (!fixture || clicked.has("ht30")) return;
    setClicked(prev => new Set([...prev, "ht30"]));
    
    setHt30Def(0);
    setBank(prev => prev + 100);
    
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  const handleX2Win = () => {
    if (!fixture || clicked.has("x2")) return;
    setClicked(prev => new Set([...prev, "x2"]));
    
    setX2Def(0);
    setBank(prev => prev + 100);
    
    if (!clicked.has("oneX") && stakes.oneX > 0) setOneXDef(prev => prev + stakes.oneX);
    if (!clicked.has("twoX") && stakes.twoX > 0) setTwoXDef(prev => prev + stakes.twoX);
    if (!clicked.has("ht12") && stakes.ht12 > 0) setHt12Def(prev => prev + stakes.ht12);
    if (!clicked.has("ft40") && stakes.ft40 > 0) setFt40Def(prev => prev + stakes.ft40);
    if (!clicked.has("ft41") && stakes.ft41 > 0) setFt41Def(prev => prev + stakes.ft41);
    
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    
    clearForNext();
  };

  const handleJackpot = () => {
    setClicked(prev => new Set([...prev, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setClicked(new Set());
    setWinnerStake(0);
    setStakes({
      oneX: 0, twoX: 0, ht12: 0, ft40: 0, ft41: 0,
      tg0: 0, tg6: 0, ht21: 0, ht30: 0, x2: 0
    });
    saveBase();
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
        <h1 className="text-sm font-extrabold text-red-400">Virtual EPL</h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-3 py-1.5 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">💾</button>
          <button onClick={fetchBase} disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50">
            <FiRefreshCw className={`${isReloading ? "animate-spin" : ""}`} size={11} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-4 gap-3 overflow-y-auto">
        {/* WINNER + JACKPOT + LOSS */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={handleJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] mt-0.5 opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNextWithLoss} disabled={!fixture}
            className="py-4 rounded-2xl font-extrabold text-sm bg-red-600 text-white hover:bg-red-500 transition active:scale-95 shadow">
            <div className="font-black">LOSS → NEXT</div>
            <div className="text-[9px] mt-0.5 opacity-70">pile all stakes</div>
          </button>
          <div className="bg-white/10 rounded-2xl flex items-center justify-center text-[10px] font-mono">
            <div>Sm Def: {smallDeficit}</div>
          </div>
        </div>

        {/* TEAM A - 5 buttons */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM A (Def 200, Win +200) —</div>
        <div className="grid grid-cols-5 gap-2">
          <button onClick={handleOneXWin} disabled={!fixture || clicked.has("oneX")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("oneX") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-purple-600 text-white"}`}>
            <div className="font-black text-[11px]">1X</div>
            <div className="text-[10px] mt-0.5">{stakes.oneX || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{oneXDef}</div>
          </button>
          <button onClick={handleTwoXWin} disabled={!fixture || clicked.has("twoX")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("twoX") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-pink-600 text-white"}`}>
            <div className="font-black text-[11px]">2X</div>
            <div className="text-[10px] mt-0.5">{stakes.twoX || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{twoXDef}</div>
          </button>
          <button onClick={handleHt12Win} disabled={!fixture || clicked.has("ht12")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("ht12") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-blue-600 text-white"}`}>
            <div className="font-black text-[11px]">HT12</div>
            <div className="text-[10px] mt-0.5">{stakes.ht12 || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{ht12Def}</div>
          </button>
          <button onClick={handleFt40Win} disabled={!fixture || clicked.has("ft40")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("ft40") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-indigo-600 text-white"}`}>
            <div className="font-black text-[11px]">FT40</div>
            <div className="text-[10px] mt-0.5">{stakes.ft40 || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{ft40Def}</div>
          </button>
          <button onClick={handleFt41Win} disabled={!fixture || clicked.has("ft41")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("ft41") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-violet-600 text-white"}`}>
            <div className="font-black text-[11px]">FT41</div>
            <div className="text-[10px] mt-0.5">{stakes.ft41 || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{ft41Def}</div>
          </button>
        </div>

        {/* TEAM B - 5 buttons */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM B (Def 0, Win +100) —</div>
        <div className="grid grid-cols-5 gap-2">
          <button onClick={handleTg0Win} disabled={!fixture || clicked.has("tg0")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("tg0") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-cyan-600 text-white"}`}>
            <div className="font-black text-[11px]">0G</div>
            <div className="text-[10px] mt-0.5">{stakes.tg0 || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{tg0Def}</div>
          </button>
          <button onClick={handleTg6Win} disabled={!fixture || clicked.has("tg6")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("tg6") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-teal-600 text-white"}`}>
            <div className="font-black text-[11px]">6G</div>
            <div className="text-[10px] mt-0.5">{stakes.tg6 || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{tg6Def}</div>
          </button>
          <button onClick={handleHt21Win} disabled={!fixture || clicked.has("ht21")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("ht21") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-emerald-600 text-white"}`}>
            <div className="font-black text-[11px]">HT21</div>
            <div className="text-[10px] mt-0.5">{stakes.ht21 || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{ht21Def}</div>
          </button>
          <button onClick={handleHt30Win} disabled={!fixture || clicked.has("ht30")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("ht30") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-green-600 text-white"}`}>
            <div className="font-black text-[11px]">HT30</div>
            <div className="text-[10px] mt-0.5">{stakes.ht30 || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{ht30Def}</div>
          </button>
          <button onClick={handleX2Win} disabled={!fixture || clicked.has("x2")}
            className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${clicked.has("x2") ? "bg-white text-gray-700 ring-1 ring-gray-300" : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-lime-600 text-white"}`}>
            <div className="font-black text-[11px]">X2</div>
            <div className="text-[10px] mt-0.5">{stakes.x2 || "–"}</div>
            <div className="text-[8px] opacity-60 mt-0.5">D:{x2Def}</div>
          </button>
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
          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={!!fixture}
              className={`flex-1 py-3 font-bold text-sm rounded-xl transition active:scale-95 shadow ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
              CALCULATE
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-3 gap-x-4 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="flex justify-between col-span-3"><span className="text-gray-400">Small Def</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          {fixture && (
            <div className="col-span-3 pt-1 border-t border-white/10 text-center font-bold">
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
