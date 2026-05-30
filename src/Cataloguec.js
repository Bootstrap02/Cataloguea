
import React, { useState, useEffect, useRef } from "react";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const LOCAL_STORAGE_KEY = "virtual_epl_betking_data";

/* ── Group A: chase smallDeficit (1X, 2X, 0G, 6G) ── */
const GROUP_A = ["oneX", "twoX", "zeroGoals", "sixGoals"];
const GROUP_A_LABELS = { oneX: "1X", twoX: "2X", zeroGoals: "0G", sixGoals: "6G" };
const GROUP_A_ODD_KEY = { 
  oneX: "oneX", 
  twoX: "twoX", 
  zeroGoals: "zeroGoals", 
  sixGoals: "sixGoals" 
};
const GROUP_A_COLORS = { 
  oneX: "bg-purple-600", 
  twoX: "bg-pink-600", 
  zeroGoals: "bg-cyan-600", 
  sixGoals: "bg-teal-600" 
};

/* ── Group B: private target + deficit (x1, ht11, O45, ft11, fourGoals) ── */
const GROUP_B = ["x1", "ht11", "O45", "ft11", "fourGoals"];
const GROUP_B_LABELS = { x1: "X1", ht11: "HT11", O45: "O4.5", ft11: "FT11", fourGoals: "4G" };
const GROUP_B_ODD_KEY = { x1: "x1", ht11: "ht11", O45: "O45", ft11: "ft11", fourGoals: "fourGoals" };
const GROUP_B_COLORS = {
  x1: "bg-cyan-600",
  ht11: "bg-blue-600",
  O45: "bg-teal-600",
  ft11: "bg-indigo-600",
  fourGoals: "bg-emerald-600"
};

const emptyGroupB = () => Object.fromEntries(GROUP_B.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ── NORMAL GAME STATES ── */
  const [baseStake, setBaseStake] = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit, setDeficit] = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit, setOneDeficit] = useState(0);

  /* ── NORMAL STAKES ── */
  const [amounts, setAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts, setZeroAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts, setOneAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ── SMALL ODDS STATES ── */
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [smallDeficitShadow, setSmallDeficitShadow] = useState(0);
  const [groupAWinCount, setGroupAWinCount] = useState(0);

  /* Group A stakes */
  const [groupAStakes, setGroupAStakes] = useState({ oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0 });

  /* Group B targets + deficits */
  const [groupBTargets, setGroupBTargets] = useState(emptyGroupB());
  const [groupBDeficits, setGroupBDeficits] = useState(emptyGroupB());
  const [groupBStakes, setGroupBStakes] = useState(emptyGroupB());

  /* ── CLICKED ── */
  const [clicked, setClicked] = useState(new Set());
  const [groupBWinHappened, setGroupBWinHappened] = useState(false);

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     LOCAL STORAGE ACTIONS
     ================================================================ */
  const loadLocalData = () => {
    setIsReloading(true);
    try {
      const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedData) {
        const d = JSON.parse(savedData);
        setBaseStake(Number(d.base) || 10000);
        setBaseDeficit(Number(d.baseDeficit) || 0);
        setDeficit(Number(d.deficit) || 0);
        setZeroDeficit(Number(d.zeroDeficit) || 0);
        setOneDeficit(Number(d.oneDeficit) || 0);
        setSmallDeficit(Number(d.smallDeficit) || 0);
        setSmallDeficitShadow(Number(d.smallDeficitShadow) || 0);
        
        // Ensure accurate property mapping fallback for group arrays
        const safeBTargets = emptyGroupB();
        if (d.groupBTargets) GROUP_B.forEach(k => { safeBTargets[k] = Number(d.groupBTargets[k]) || 0; });
        setGroupBTargets(safeBTargets);

        const safeBDeficits = emptyGroupB();
        if (d.groupBDeficits) GROUP_B.forEach(k => { safeBDeficits[k] = Number(d.groupBDeficits[k]) || 0; });
        setGroupBDeficits(safeBDeficits);

        setGroupAWinCount(Number(d.groupAWinCount) || 0);
      }
    } catch (err) {
      console.error("❌ localStorage load error:", err.message);
    } finally {
      setIsReloading(false);
    }
  };

  const saveLocalData = () => {
    try {
      const dataToSave = {
        base: Number(baseRef.current) || 10000,
        baseDeficit: Number(baseDeficit) || 0,
        deficit: Number(deficit) || 0,
        zeroDeficit: Number(zeroDeficit) || 0,
        oneDeficit: Number(oneDeficit) || 0,
        smallDeficit: Number(smallDeficit) || 0,
        smallDeficitShadow: Number(smallDeficitShadow) || 0,
        groupBTargets,
        groupBDeficits,
        groupAWinCount: Number(groupAWinCount) || 0,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (err) {
      console.error("❌ localStorage save error:", err.message);
    }
  };

  useEffect(() => {
    loadLocalData();
  }, []);

  /* ================================================================
     BUILD HDA LADDER
     ================================================================ */
  const buildLadder = (startTotal, type, found) => {
    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    const sequence = found.code
      ? [...found.code]
      : ["H", "D", "A"].sort((a, b) => (oddsMap[b] || 0) - (oddsMap[a] || 0));
    let running = Number(startTotal) || 0;
    const ladder = [];
    let H = 0, D = 0, A = 0;
    for (const step of sequence) {
      const odd = oddsMap[step];
      if (!odd || odd <= 1.01) continue;
      const stake = Math.max(Math.round(running / (odd - 1)), 10);
      ladder.push({ step, stake, type });
      if (step === "H") H = stake;
      if (step === "D") D = stake;
      if (step === "A") A = stake;
      running += stake;
    }
    return { ladder, H, D, A };
  };

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    let found = smallOdds.find(o => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!found) found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    setFixture(found);
    setIsSmallOddsGame(isSmall);
    setClicked(new Set());
    setGroupBWinHappened(false);

    /* ── Winner stake (6-0) ── */
    const newBase = Number(baseStake || 0) + Number(deficit || 0);
    setBaseStake(newBase);
    setDeficit(0);
    const winnerAmt = Math.max(Math.round(newBase / found.winner), 10);

    /* ── 5-0 stake ── */
    const base50 = Number(baseDeficit || 0) + Number(zeroDeficit || 0);
    const fiveZeroStake = found.fiveZero ? Math.max(Math.round(base50 / found.fiveZero), 10) : 0;

    /* ── 5-1 stake ── */
    const base51 = Number(baseDeficit || 0) + Number(oneDeficit || 0);
    const fiveOneStake = found.fiveOne ? Math.max(Math.round(base51 / found.fiveOne), 10) : 0;

    if (isSmall) {
      /* ── SMALL ODDS GAME ── */
      const newSD = Number(smallDeficit || 0) + winnerAmt;
      setSmallDeficit(newSD);
      setSmallDeficitShadow(newSD);

      setZeroDeficit(prev => (Number(prev) || 0) + fiveZeroStake);
      setOneDeficit(prev => (Number(prev) || 0) + fiveOneStake);

      setAmounts({ winnerAmount: winnerAmt, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
      setZeroAmounts({ winnerAmount: fiveZeroStake, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
      setOneAmounts({ winnerAmount: fiveOneStake, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

      const newGA = { oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0 };
      let gaTotal = 0;
      GROUP_A.forEach(key => {
        const odd = found[GROUP_A_ODD_KEY[key]] || 0;
        if (odd > 1.01) {
          newGA[key] = Math.max(Math.round(newSD / (odd - 1)), 10);
          gaTotal += newGA[key];
        }
      });
      setGroupAStakes(newGA);

      const share = Math.floor(gaTotal / 5);
      const newTargets = { ...groupBTargets };
      GROUP_B.forEach(k => { newTargets[k] = (Number(newTargets[k]) || 0) + share; });
      setGroupBTargets(newTargets);

      const newGB = emptyGroupB();
      GROUP_B.forEach(key => {
        const odd = found[GROUP_B_ODD_KEY[key]] || 0;
        if (odd > 1.01) {
          const tgt = Number(newTargets[key]) || 0;
          const def = Number(groupBDeficits[key]) || 0;
          newGB[key] = Math.max(Math.round((tgt + def) / (odd - 1)), 10);
        }
      });
      setGroupBStakes(newGB);
      setOrderedStakes([]);

    } else {
      /* ── NORMAL GAME: full HDA for all three ── */
      const r6 = buildLadder(winnerAmt, "6-0", found);
      setAmounts({ winnerAmount: winnerAmt, homeAmount: r6.H, drawAmount: r6.D, awayAmount: r6.A });

      const r50 = buildLadder(fiveZeroStake, "5-0", found);
      setZeroAmounts({ winnerAmount: fiveZeroStake, homeAmount: r50.H, drawAmount: r50.D, awayAmount: r50.A });

      const r51 = buildLadder(fiveOneStake, "5-1", found);
      setOneAmounts({ winnerAmount: fiveOneStake, homeAmount: r51.H, drawAmount: r51.D, awayAmount: r51.A });

      const allStakes = [...r6.ladder, ...r50.ladder, ...r51.ladder];
      setOrderedStakes(allStakes);

      setGroupAStakes({ oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0 });
      setGroupBStakes(emptyGroupB());
      setSmallDeficit(0);
      setSmallDeficitShadow(0);
    }
  };

  /* ================================================================
     RESOLVE HDA (only for normal games)
     ================================================================ */
  const resolveResult = (step) => {
    if (!fixture || isSmallOddsGame) return;

    setClicked(prev => new Set([...prev, `hda_${step}`]));

    const calcLoss = (type) => {
      const stakes = orderedStakes.filter(x => x.type === type);
      const idx = stakes.findIndex(x => x.step === step);
      if (idx === -1) return 0;
      return stakes.slice(idx + 1).reduce((sum, item) => sum + Number(item.stake), 0);
    };

    const mainLoss = calcLoss("6-0");
    setDeficit(mainLoss);
    setBaseDeficit(prev => (Number(prev) || 0) + mainLoss);

    const zeroLoss = calcLoss("5-0");
    setZeroDeficit(prev => (Number(prev) || 0) + zeroLoss);

    const oneLoss = calcLoss("5-1");
    setOneDeficit(prev => (Number(prev) || 0) + oneLoss);
  };

  /* ================================================================
     GROUP A WIN (1X, 2X, 0G, 6G)
     ================================================================ */
  const handleGroupAWin = (key) => {
    if (!fixture || clicked.has(`ga_${key}`)) return;
    setClicked(prev => new Set([...prev, `ga_${key}`]));

    const newWinCount = groupAWinCount + 1;
    setGroupAWinCount(newWinCount);

    if (newWinCount === 1) {
      setSmallDeficitShadow(smallDeficit);
      setSmallDeficit(0);
    } else if (newWinCount >= 2) {
      setBaseStake(prev => (Number(prev) || 0) + Number(smallDeficitShadow || 0));
      setSmallDeficitShadow(0);
      setSmallDeficit(0);
    }
  };

  /* ================================================================
     GROUP B WIN (x1, ht11, O45, ft11, fourGoals)
     ================================================================ */
  const handleGroupBWin = (key) => {
    if (!fixture || clicked.has(`gb_${key}`)) return;
    setClicked(prev => new Set([...prev, `gb_${key}`]));
    setGroupBWinHappened(true);

    const newTargets = { ...groupBTargets };
    const newDeficits = { ...groupBDeficits };

    newTargets[key] = 0;
    newDeficits[key] = 0;

    setGroupBTargets(newTargets);
    setGroupBDeficits(newDeficits);
  };

  /* ================================================================
     JACKPOTS
     ================================================================ */
  const handleJackpot = () => {
    setClicked(prev => new Set([...prev, "six"]));
    setBaseStake(10000);
    setBaseDeficit(0);
    setDeficit(0);
  };

  const handleZeroJackpot = () => {
    setClicked(prev => new Set([...prev, "zero"]));
    setBaseStake(10000 + Number(oneDeficit || 0));
    setBaseDeficit(Number(oneDeficit || 0));
    setOneDeficit(0);
    setZeroDeficit(0);
  };

  const handleOneJackpot = () => {
    setClicked(prev => new Set([...prev, "one"]));
    setBaseStake(10000 + Number(zeroDeficit || 0));
    setBaseDeficit(Number(zeroDeficit || 0));
    setZeroDeficit(0);
    setOneDeficit(0);
  };

  /* ================================================================
     NEXT FUNCTION
     ================================================================ */

  
    const handleNext = () => {
    if (!fixture) return;

    if (isSmallOddsGame) {
      // 1. Create a local copy of current deficits to work with immediately
      let currentDeficits = { ...groupBDeficits };

      // 2. Add losing stakes to the deficits of assets that didn't win
      GROUP_B.forEach(k => {
        if (!clicked.has(`gb_${k}`) && groupBStakes[k] > 0) {
          currentDeficits[k] = (Number(currentDeficits[k]) || 0) + Number(groupBStakes[k]);
        }
        // Note: Winners were already set to 0 in handleGroupBWin
      });

      // 3. If any win happened, redistribute the TOTAL of this local object
      if (groupBWinHappened) {
        const totalDeficit = GROUP_B.reduce((sum, k) => sum + (Number(currentDeficits[k]) || 0), 0);
        const equalShare = Math.floor(totalDeficit / 5);

        // Apply the equal share to ALL assets (including the previous winners)
        GROUP_B.forEach(k => {
          currentDeficits[k] = equalShare;
        });
      }
      
      // 4. Update the state once with the final calculated object
      setGroupBDeficits(currentDeficits);
      setGroupAWinCount(0);
    }

    clearForNext();
  };

  /* ── Clear & Sync Next ── */
  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setClicked(new Set());
    setGroupBWinHappened(false);
    setGroupAStakes({ oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0 });
    setGroupBStakes(emptyGroupB());
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    setTimeout(() => { saveLocalData(); }, 50);
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  const displayAmounts = {
    homeAmount: (Number(amounts.homeAmount) || 0) + (Number(zeroAmounts.homeAmount) || 0) + (Number(oneAmounts.homeAmount) || 0),
    drawAmount: (Number(amounts.drawAmount) || 0) + (Number(zeroAmounts.drawAmount) || 0) + (Number(oneAmounts.drawAmount) || 0),
    awayAmount: (Number(amounts.awayAmount) || 0) + (Number(zeroAmounts.awayAmount) || 0) + (Number(oneAmounts.awayAmount) || 0),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <h1 className="text-base font-extrabold text-red-400 tracking-tight">
          Virtual EPL
          {isSmallOddsGame && fixture && (
            <span className="ml-2 text-[10px] bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold">SMALL ODDS</span>
          )}
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveLocalData} className="px-4 py-2 bg-green-600 font-bold text-white text-xs hover:bg-green-700">💾 Save</button>
          <button onClick={loadLocalData} disabled={isReloading}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 font-bold text-white text-xs hover:bg-red-700 disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={11} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-6 gap-4 overflow-y-auto">

        {/* ── JACKPOT ROW ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "six", label: "6–0", amt: amounts.winnerAmount, handler: handleJackpot, color: "bg-yellow-400 text-black" },
            { key: "zero", label: "5–0", amt: zeroAmounts.winnerAmount, handler: handleZeroJackpot, color: "bg-yellow-500 text-black" },
            { key: "one", label: "5–1", amt: oneAmounts.winnerAmount, handler: handleOneJackpot, color: "bg-orange-400 text-black" },
          ].map(({ key, label, amt, handler, color }) => (
            <button key={key} onClick={handler}
              className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has(key) ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : color}`}>
              <div className="text-xl font-black">{label}</div>
              <div className="text-[11px] mt-1 opacity-80">{amt || "–"}</div>
            </button>
          ))}
        </div>

        {/* ── GROUP A (only in small odds) ── */}
        {isSmallOddsGame && (
          <>
            <div className="text-[9px] text-gray-400 text-center tracking-widest">— GROUP A: chase smallDeficit —</div>
            <div className="grid grid-cols-4 gap-2">
              {GROUP_A.map(key => (
                <button key={key} onClick={() => handleGroupAWin(key)}
                  disabled={!fixture || clicked.has(`ga_${key}`)}
                  className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 shadow ${clicked.has(`ga_${key}`) ? "bg-white text-green-600 ring-2 ring-green-400"
                      : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                        : `${GROUP_A_COLORS[key]} text-white hover:opacity-90`}`}>
                  <div className="font-black text-[11px]">{GROUP_A_LABELS[key]}</div>
                  <div className="text-[10px] mt-0.5 opacity-80">{groupAStakes[key] || "–"}</div>
                  <div className="text-[8px] opacity-60 mt-0.5">SD:{smallDeficit}</div>
                </button>
              ))}
            </div>

            {/* ── GROUP B ── */}
            <div className="text-[9px] text-gray-400 text-center tracking-widest">— GROUP B: private target+deficit —</div>
            <div className="grid grid-cols-5 gap-2">
              {GROUP_B.map(key => (
                <button key={key} onClick={() => handleGroupBWin(key)}
                  disabled={!fixture || clicked.has(`gb_${key}`)}
                  className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 shadow ${clicked.has(`gb_${key}`) ? "bg-white text-green-600 ring-2 ring-green-400"
                      : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                        : `${GROUP_B_COLORS[key]} text-white hover:opacity-90`}`}>
                  <div className="font-black text-[11px]">{GROUP_B_LABELS[key]}</div>
                  <div className="text-[10px] mt-0.5 opacity-80">{groupBStakes[key] || "–"}</div>
                  <div className="text-[8px] opacity-60 mt-0.5">T:{groupBTargets[key]}</div>
                  <div className="text-[8px] opacity-60">D:{groupBDeficits[key]}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── HDA ROW (only for normal games) ── */}
        {!isSmallOddsGame && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: "H", label: teamA, amt: displayAmounts.homeAmount, color: "bg-green-500" },
              { step: "D", label: "DRAW", amt: displayAmounts.drawAmount, color: "bg-gray-400" },
              { step: "A", label: teamB, amt: displayAmounts.awayAmount, color: "bg-red-500" },
            ].map(({ step, label, amt, color }) => (
              <button key={step} onClick={() => resolveResult(step)} disabled={!fixture}
                className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${clicked.has(`hda_${step}`) ? "bg-white text-green-600 ring-2 ring-green-500"
                    : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
                      : `${color} hover:opacity-90`}`}>
                <div className="text-base font-extrabold uppercase">{label}</div>
                <div className="text-[11px] mt-1 opacity-80">{amt || "–"}</div>
              </button>
            ))}
          </div>
        )}

        {/* ── INPUTS ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
            <span className="font-black text-xl text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={!!fixture}
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
              CALCULATE
            </button>
            <button onClick={handleNext} disabled={!fixture}
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 ${!fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-green-700 text-white hover:bg-green-600"}`}>
              NEXT
            </button>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="bg-white/5 rounded-2xl p-4 text-xs grid grid-cols-2 gap-x-6 gap-y-2">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Base Def</span><strong className="text-orange-400">{baseDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">5-0 Def</span><strong className="text-yellow-400">{zeroDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">5-1 Def</span><strong className="text-yellow-300">{oneDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Small Def</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">SD Shadow</span><strong className="text-blue-300">{smallDeficitShadow}</strong></div>
          {isSmallOddsGame && (
            <div className="col-span-2 border-t border-white/10 pt-2 grid grid-cols-2 gap-x-6 gap-y-1">
              {GROUP_B.map(key => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-500">{GROUP_B_LABELS[key]}</span>
                  <strong className="text-white">T:{groupBTargets[key]} D:{groupBDeficits[key]}</strong>
                </div>
              ))}
            </div>
          )}
          {fixture && (
            <div className="col-span-2 pt-2 border-t border-white/10 text-center font-bold">
              <span className="uppercase">{teamA}</span>
              <span className="text-gray-400 mx-2">vs</span>
              <span className="uppercase">{teamB}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Homepage;
