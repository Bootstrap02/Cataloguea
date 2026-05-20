
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

  // Team A - Private Deficits (start at 100 each, receive share of winner residue)
  const [oneXDef, setOneXDef] = useState(100);
  const [twoXDef, setTwoXDef] = useState(100);
  const [ht12Def, setHt12Def] = useState(100);
  const [ft40Def, setFt40Def] = useState(100);
  const [ft41Def, setFt41Def] = useState(100);

  // Team A - Targets (piled from their own stakes, reset on win)
  const [zeroTarget, setZeroTarget] = useState(100);
  const [sixTarget, setSixTarget] = useState(100);
  const [ht21Target, setHt21Target] = useState(100);
  const [ft40Target, setFt40Target] = useState(100);
  const [ft41Target, setFt41Target] = useState(100);

  // Team B - Private Deficits (start at 0, accumulate from their own losses)
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
     API - Backward compatible with existing fields
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
      
      // Team A Deficits (from backend oneXDeficit, twoXDeficit, etc.)
      setOneXDef(d.oneXDeficit ?? 100);
      setTwoXDef(d.twoXDeficit ?? 100);
      // For new fields, use defaults or map from existing
      setHt12Def(d.ht12Def ?? 100);
      setFt40Def(d.ft40Def ?? 100);
      setFt41Def(d.ft41Def ?? 100);
      
      // Targets
      setZeroTarget(d.zeroTarget ?? 100);
      setSixTarget(d.sixTarget ?? 100);
      setHt21Target(d.ht21Target ?? 100);
      setFt40Target(d.ft40Target ?? 100);
      setFt41Target(d.ft41Target ?? 100);
      
      // Team B Deficits
      setTg0Def(d.zeroSpecDef ?? 0);
      setTg6Def(d.sixSpecDef ?? 0);
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
        oneXDeficit: oneXDef,
        twoXDeficit: twoXDef,
        zeroTarget,
        sixTarget,
        zeroSpecDef: tg0Def,
        sixSpecDef: tg6Def,
        // Additional fields for new system
        ht12Def, ft40Def, ft41Def,
        ht21Target, ft40Target, ft41Target,
        ht21Def, ht30Def, x2Def,
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
    let found = odds.find((o) => o.home === home && o.away === away);
    if (!found) { alert(`No odds found for "${home}" vs "${away}"`); return; }

    setFixture(found);
    setClicked(new Set());

    // 1. Winner stake
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    setSmallDeficit(prev => prev + wStake);

    // 2. Winner residue handling with bank
    let bankNow = bank;
    let shareRemainder = 0;
    
    if (bankNow >= wStake) {
      bankNow -= wStake;
    } else {
      const residue = wStake - bankNow;
      bankNow = 0;
      shareRemainder = Math.ceil(residue / 5);
    }
    setBank(bankNow);

    // 3. Add share to each Team A deficit
    if (shareRemainder > 0) {
      setOneXDef(prev => prev + shareRemainder);
      setTwoXDef(prev => prev + shareRemainder);
      setHt12Def(prev => prev + shareRemainder);
      setFt40Def(prev => prev + shareRemainder);
      setFt41Def(prev => prev + shareRemainder);
    }

    // 4. Calculate all stakes
    const calcStake = (def, target, odd) => {
      if (!odd || odd <= 1.01) return 0;
      const total = def + target;
      return Math.max(Math.round(total / (odd - 1)), 10);
    };

    // Team A stakes: (own def + own target) / (odd - 1)
    const newStakes = {
      oneX: calcStake(oneXDef, zeroTarget, found.oneX),
      twoX: calcStake(twoXDef, sixTarget, found.twoX),
      ht12: calcStake(ht12Def, ht21Target, found.ht12),
      ft40: calcStake(ft40Def, ft40Target, found.ft40),
      ft41: calcStake(ft41Def, ft41Target, found.ft41),
      // Team B stakes: (target from Team A + own def) / (odd - 1)
      tg0: calcStake(zeroTarget, tg0Def, found.zeroGoals),
      tg6: calcStake(sixTarget, tg6Def, found.sixGoals),
      ht21: calcStake(ht21Target, ht21Def, found.ht21),
      ht30: calcStake(ft40Target, ht30Def, found.ht30),
      x2: calcStake(ft41Target, x2Def, found.x2),
    };
    setStakes(newStakes);
  };

  /* ================================================================
     LOSS HANDLER - Pile stakes into targets/defs
     ================================================================ */
  const handleLoss = () => {
    if (!fixture) return;
    setClicked(prev => new Set([...prev, "loss"]));
    
    // Team A stakes → add to their respective targets
    if (stakes.oneX > 0) setZeroTarget(prev => prev + stakes.oneX);
    if (stakes.twoX > 0) setSixTarget(prev => prev + stakes.twoX);
    if (stakes.ht12 > 0) setHt21Target(prev => prev + stakes.ht12);
    if (stakes.ft40 > 0) setFt40Target(prev => prev + stakes.ft40);
    if (stakes.ft41 > 0) setFt41Target(prev => prev + stakes.ft41);
    
    // Team B stakes → add to their own private deficits
    if (stakes.tg0 > 0) setTg0Def(prev => prev + stakes.tg0);
    if (stakes.tg6 > 0) setTg6Def(prev => prev + stakes.tg6);
    if (stakes.ht21 > 0) setHt21Def(prev => prev + stakes.ht21);
    if (stakes.ht30 > 0) setHt30Def(prev => prev + stakes.ht30);
    if (stakes.x2 > 0) setX2Def(prev => prev + stakes.x2);
    
    clearForNext();
  };

  /* ================================================================
     WIN HANDLERS - Reset to defaults, add to bank
     ================================================================ */
  const handleWin = (type, winData) => {
    if (!fixture || clicked.has(type)) return;
    setClicked(prev => new Set([...prev, type]));
    
    const { setDef, defValue, setTarget, targetValue, bankAdd } = winData;
    if (setDef) setDef(defValue);
    if (setTarget) setTarget(targetValue);
    setBank(prev => prev + bankAdd);
  };

  // Win configurations
  const wins = {
    oneX: { setDef: setOneXDef, defValue: 100, setTarget: setZeroTarget, targetValue: 150, bankAdd: 150 },
    twoX: { setDef: setTwoXDef, defValue: 100, setTarget: setSixTarget, targetValue: 150, bankAdd: 150 },
    ht12: { setDef: setHt12Def, defValue: 100, setTarget: setHt21Target, targetValue: 150, bankAdd: 150 },
    ft40: { setDef: setFt40Def, defValue: 100, setTarget: setFt40Target, targetValue: 150, bankAdd: 150 },
    ft41: { setDef: setFt41Def, defValue: 100, setTarget: setFt41Target, targetValue: 150, bankAdd: 150 },
    tg0: { setDef: setTg0Def, defValue: 0, setTarget: setZeroTarget, targetValue: 100, bankAdd: 100 },
    tg6: { setDef: setTg6Def, defValue: 0, setTarget: setSixTarget, targetValue: 100, bankAdd: 100 },
    ht21: { setDef: setHt21Def, defValue: 0, setTarget: setHt21Target, targetValue: 100, bankAdd: 100 },
    ht30: { setDef: setHt30Def, defValue: 0, setTarget: setFt40Target, targetValue: 100, bankAdd: 100 },
    x2: { setDef: setX2Def, defValue: 0, setTarget: setFt41Target, targetValue: 100, bankAdd: 100 },
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
        {/* WINNER + JACKPOT + NO WIN */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={handleJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] mt-0.5 opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleLoss} disabled={!fixture || clicked.has("loss")}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("loss") ? "bg-white text-red-500 ring-2 ring-red-400"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
              : "bg-red-700 text-white hover:bg-red-600"}`}>
            <div className="font-black">NO WIN</div>
            <div className="text-[9px] mt-0.5 opacity-70">pile all stakes</div>
          </button>
          <div className="bg-white/10 rounded-2xl flex items-center justify-center text-[10px] font-mono">
            <div>Sm: {smallDeficit}</div>
          </div>
        </div>

        {/* TEAM A */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM A (Def 100→share) —</div>
        <div className="grid grid-cols-5 gap-2">
          {[
            { key: "oneX", label: "1X", stake: stakes.oneX, def: oneXDef, tgt: zeroTarget, handler: () => handleWin("oneX", wins.oneX), color: "bg-purple-600" },
            { key: "twoX", label: "2X", stake: stakes.twoX, def: twoXDef, tgt: sixTarget, handler: () => handleWin("twoX", wins.twoX), color: "bg-pink-600" },
            { key: "ht12", label: "HT12", stake: stakes.ht12, def: ht12Def, tgt: ht21Target, handler: () => handleWin("ht12", wins.ht12), color: "bg-blue-600" },
            { key: "ft40", label: "FT40", stake: stakes.ft40, def: ft40Def, tgt: ft40Target, handler: () => handleWin("ft40", wins.ft40), color: "bg-indigo-600" },
            { key: "ft41", label: "FT41", stake: stakes.ft41, def: ft41Def, tgt: ft41Target, handler: () => handleWin("ft41", wins.ft41), color: "bg-violet-600" },
          ].map(({ key, label, stake, def, tgt, handler, color }) => (
            <button key={key} onClick={handler} disabled={!fixture || clicked.has(key)}
              className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${
                clicked.has(key) ? "bg-white text-gray-700 ring-1 ring-gray-300"
                : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                : `${color} text-white`}`}>
              <div className="font-black text-[11px]">{label}</div>
              <div className="text-[10px] mt-0.5">{stake || "–"}</div>
              <div className="text-[8px] opacity-60 mt-0.5">D:{def}</div>
              <div className="text-[8px] opacity-60">T:{tgt}</div>
            </button>
          ))}
        </div>

        {/* TEAM B */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM B (Def 0→pile) —</div>
        <div className="grid grid-cols-5 gap-2">
          {[
            { key: "tg0", label: "0G", stake: stakes.tg0, def: tg0Def, tgt: zeroTarget, handler: () => handleWin("tg0", wins.tg0), color: "bg-cyan-600" },
            { key: "tg6", label: "6G", stake: stakes.tg6, def: tg6Def, tgt: sixTarget, handler: () => handleWin("tg6", wins.tg6), color: "bg-teal-600" },
            { key: "ht21", label: "HT21", stake: stakes.ht21, def: ht21Def, tgt: ht21Target, handler: () => handleWin("ht21", wins.ht21), color: "bg-emerald-600" },
            { key: "ht30", label: "HT30", stake: stakes.ht30, def: ht30Def, tgt: ft40Target, handler: () => handleWin("ht30", wins.ht30), color: "bg-green-600" },
            { key: "x2", label: "X2", stake: stakes.x2, def: x2Def, tgt: ft41Target, handler: () => handleWin("x2", wins.x2), color: "bg-lime-600" },
          ].map(({ key, label, stake, def, tgt, handler, color }) => (
            <button key={key} onClick={handler} disabled={!fixture || clicked.has(key)}
              className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${
                clicked.has(key) ? "bg-white text-gray-700 ring-1 ring-gray-300"
                : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                : `${color} text-white`}`}>
              <div className="font-black text-[11px]">{label}</div>
              <div className="text-[10px] mt-0.5">{stake || "–"}</div>
              <div className="text-[8px] opacity-60 mt-0.5">D:{def}</div>
              <div className="text-[8px] opacity-60">T:{tgt}</div>
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
          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={!!fixture}
              className={`flex-1 py-3 font-bold text-sm rounded-xl transition active:scale-95 shadow ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
              CALCULATE
            </button>
            <button onClick={clearForNext} disabled={!fixture}
              className={`flex-1 py-3 font-bold text-sm rounded-xl transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-green-700 text-white hover:bg-green-600"}`}>
              NEXT
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-3 gap-x-4 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
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
