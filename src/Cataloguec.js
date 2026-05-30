
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

/* ── Group A: chase smallDeficit ── */
const GROUP_A = ["zeroGoals", "sixGoals", "fiveGoals"];
const GROUP_A_LABELS = { zeroGoals: "0G", sixGoals: "6G", fiveGoals: "5G" };

/* ── Group B: private target + deficit ── */
const GROUP_B = ["oneGoal", "twoGoals", "threeGoals", "fourGoals"];
const GROUP_B_LABELS = { oneGoal: "1G", twoGoals: "2G", threeGoals: "3G", fourGoals: "4G" };
const GROUP_B_ODD_KEY = { oneGoal: "oneGoal", twoGoals: "twoGoals", threeGoals: "threeGoals", fourGoals: "fourGoals" };
const GROUP_A_ODD_KEY = { zeroGoals: "zeroGoals", sixGoals: "sixGoals", fiveGoals: "fiveGoals" };

const GROUP_A_COLORS = { zeroGoals: "bg-cyan-600", sixGoals: "bg-teal-600", fiveGoals: "bg-emerald-600" };
const GROUP_B_COLORS = { oneGoal: "bg-purple-600", twoGoals: "bg-pink-600", threeGoals: "bg-blue-600", fourGoals: "bg-indigo-600" };

const emptyGroupB = () => Object.fromEntries(GROUP_B.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ── NORMAL GAME STATES ── */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit,     setDeficit]     = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit,  setOneDeficit]  = useState(0);

  /* ── NORMAL STAKES ── */
  const [amounts,      setAmounts]      = useState({ winnerAmount:0, homeAmount:0, drawAmount:0, awayAmount:0 });
  const [zeroAmounts,  setZeroAmounts]  = useState({ winnerAmount:0, homeAmount:0, drawAmount:0, awayAmount:0 });
  const [oneAmounts,   setOneAmounts]   = useState({ winnerAmount:0, homeAmount:0, drawAmount:0, awayAmount:0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ── SMALL ODDS STATES ── */
  const [smallDeficit, setSmallDeficit] = useState(0);

  /* Group A stakes */
  const [groupAStakes, setGroupAStakes] = useState({ zeroGoals:0, sixGoals:0, fiveGoals:0 });

  /* Group B targets + deficits */
  const [groupBTargets,  setGroupBTargets]  = useState(emptyGroupB());
  const [groupBDeficits, setGroupBDeficits] = useState(emptyGroupB());
  const [groupBStakes,   setGroupBStakes]   = useState(emptyGroupB());

  /* ── CLICKED ── */
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
      setBaseDeficit(d.baseDeficit ?? 0);
      setDeficit(d.deficit ?? 0);
      setZeroDeficit(d.zeroDeficit ?? 0);
      setOneDeficit(d.oneDeficit ?? 0);
      setSmallDeficit(d.smallDeficit ?? 0);
      setGroupBTargets(d.groupBTargets || emptyGroupB());
      setGroupBDeficits(d.groupBDeficits || emptyGroupB());
    } catch (err) { console.error("❌ fetch:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        base: baseRef.current, baseDeficit, deficit, zeroDeficit, oneDeficit,
        smallDeficit, groupBTargets, groupBDeficits,
      });
    } catch (err) { console.error("❌ save:", err.message); }
  };

  useEffect(() => { fetchBase(); }, []);

  /* ================================================================
     BUILD HDA LADDER
     ================================================================ */
  const buildLadder = (startTotal, type, found) => {
    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    // Use found.code if present, otherwise default HDA order
    const sequence = found.code ? [...found.code] : ["H", "D", "A"];
    let running = startTotal;
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

    /* ── Winner stake (6-0) ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const winnerAmt = Math.max(Math.round(newBase / found.winner), 10);

    if (isSmall) {
      /* ── SMALL ODDS GAME ── */
      const newSD = smallDeficit + winnerAmt;
      setSmallDeficit(newSD);

      /* Group A stakes: smallDeficit / odd */
      const newGA = { zeroGoals: 0, sixGoals: 0, fiveGoals: 0 };
      let gaTotal = 0;
      GROUP_A.forEach(key => {
        const odd = found[GROUP_A_ODD_KEY[key]] || 0;
        if (odd > 1.01) {
          newGA[key] = Math.max(Math.round(newSD / odd), 10);
          gaTotal += newGA[key];
        }
      });
      setGroupAStakes(newGA);

      /* Distribute Group A total / 4 → each Group B target */
      // gaTotal is sum of all 3 Group A stakes. Each Group B asset gets gaTotal/4
      const share = Math.floor(gaTotal / 4);
      const newTargets = { ...groupBTargets };
      GROUP_B.forEach(k => { newTargets[k] = (newTargets[k] || 0) + share; });
      setGroupBTargets(newTargets);

      /* Group B stakes: (target + deficit) / (odd - 1) */
      const newGB = emptyGroupB();
      GROUP_B.forEach(key => {
        const odd = found[GROUP_B_ODD_KEY[key]] || 0;
        if (odd > 1.01) {
          const tgt = newTargets[key] || 0;
          const def = groupBDeficits[key] || 0;
          newGB[key] = Math.max(Math.round((tgt + def) / (odd - 1)), 10);
        }
      });
      setGroupBStakes(newGB);

      /* 5-0 and 5-1 still play HDA in small odds games */
      const base50 = baseDeficit + zeroDeficit;
      const zW = Math.max(Math.round(base50 / found.fiveZero), 10);
      const r50 = buildLadder(zW, "5-0", found);
      setZeroAmounts({ winnerAmount: zW, homeAmount: r50.H, drawAmount: r50.D, awayAmount: r50.A });

      const base51 = baseDeficit + oneDeficit;
      const oW = Math.max(Math.round(base51 / found.fiveOne), 10);
      const r51 = buildLadder(oW, "5-1", found);
      setOneAmounts({ winnerAmount: oW, homeAmount: r51.H, drawAmount: r51.D, awayAmount: r51.A });

      setOrderedStakes([...r50.ladder, ...r51.ladder]);
      setAmounts({ winnerAmount: winnerAmt, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    } else {
      /* ── NORMAL GAME: full HDA for all three ── */
      const r6  = buildLadder(winnerAmt, "6-0", found);
      setAmounts({ winnerAmount: winnerAmt, homeAmount: r6.H, drawAmount: r6.D, awayAmount: r6.A });

      const base50 = baseDeficit + zeroDeficit;
      const zW = Math.max(Math.round(base50 / found.fiveZero), 10);
      const r50 = buildLadder(zW, "5-0", found);
      setZeroAmounts({ winnerAmount: zW, homeAmount: r50.H, drawAmount: r50.D, awayAmount: r50.A });

      const base51 = baseDeficit + oneDeficit;
      const oW = Math.max(Math.round(base51 / found.fiveOne), 10);
      const r51 = buildLadder(oW, "5-1", found);
      setOneAmounts({ winnerAmount: oW, homeAmount: r51.H, drawAmount: r51.D, awayAmount: r51.A });

      setOrderedStakes([...r6.ladder, ...r50.ladder, ...r51.ladder]);
      setGroupAStakes({ zeroGoals: 0, sixGoals: 0, fiveGoals: 0 });
      setGroupBStakes(emptyGroupB());
    }
  };

  /* ================================================================
     RESOLVE HDA
     ================================================================ */
  const resolveResult = (step) => {
    if (!fixture) return;
    setClicked(prev => new Set([...prev, `hda_${step}`]));

    const calcLoss = (type) => {
      const s = orderedStakes.filter(x => x.type === type);
      const idx = s.findIndex(x => x.step === step);
      if (idx === -1) return 0;
      return s.slice(idx + 1).reduce((sum, x) => sum + x.stake, 0);
    };

    if (!isSmallOddsGame) {
      const mainLoss = calcLoss("6-0");
      setDeficit(mainLoss);
      setBaseDeficit(prev => prev + mainLoss);
    }
    const zLoss = calcLoss("5-0");
    const oLoss = calcLoss("5-1");
    setZeroDeficit(prev => prev + zLoss);
    setOneDeficit(prev => prev + oLoss);

    clearForNext();
  };

  /* ================================================================
     GROUP A WIN (zeroGoals, sixGoals, fiveGoals)
     ================================================================ */
  const handleGroupAWin = (key) => {
    if (!fixture || clicked.has(`ga_${key}`)) return;
    setClicked(prev => new Set([...prev, `ga_${key}`]));
    setSmallDeficit(0);
  };

  /* ================================================================
     GROUP B WIN (oneGoal, twoGoals, threeGoals, fourGoals)
     ================================================================ */
  const handleGroupBWin = (key) => {
    if (!fixture || clicked.has(`gb_${key}`)) return;
    setClicked(prev => new Set([...prev, `gb_${key}`]));

    const newTargets  = { ...groupBTargets };
    const newDeficits = { ...groupBDeficits };

    /* Winner: clear target and deficit first */
    newTargets[key]  = 0;
    newDeficits[key] = 0;

    /* Each of the other 3 assets gives 7 to the winner */
    let bonus = 0;
    GROUP_B.forEach(k => {
      if (k === key) return;
      const give = Math.min(7, newDeficits[k] || 0);
      newDeficits[k] = (newDeficits[k] || 0) - give;
      bonus += give;
    });
    /* Winner gets the total contributed (up to 21) */
    newDeficits[key] = bonus;

    /* Check if any Group B deficit >= 1000 → push to baseStake + deficit */
    let newBase   = baseStake;
    let newDeficit = deficit;
    GROUP_B.forEach(k => {
      if (newDeficits[k] >= 1000) {
        newBase    += newDeficits[k];
        newDeficit += newDeficits[k];
        newDeficits[k] = 0;
        newTargets[k]  = 0;
      }
    });

    setGroupBTargets(newTargets);
    setGroupBDeficits(newDeficits);
    setBaseStake(newBase);
    setDeficit(newDeficit);
  };

  /* ================================================================
     JACKPOTS
     ================================================================ */
  const handleJackpot = () => {
    setClicked(prev => new Set([...prev, "six"]));
    setBaseStake(10000); setBaseDeficit(0); setDeficit(0);
  };
  const handleZeroJackpot = () => {
    setClicked(prev => new Set([...prev, "zero"]));
    setBaseStake(10000 + oneDeficit); setBaseDeficit(oneDeficit);
    setOneDeficit(0); setZeroDeficit(0);
  };
  const handleOneJackpot = () => {
    setClicked(prev => new Set([...prev, "one"]));
    setBaseStake(10000 + zeroDeficit); setBaseDeficit(zeroDeficit);
    setZeroDeficit(0); setOneDeficit(0);
  };

  /* ── Clear ── */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null); setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setClicked(new Set());
    setGroupAStakes({ zeroGoals: 0, sixGoals: 0, fiveGoals: 0 });
    setGroupBStakes(emptyGroupB());
    setAmounts({ winnerAmount:0, homeAmount:0, drawAmount:0, awayAmount:0 });
    setZeroAmounts({ winnerAmount:0, homeAmount:0, drawAmount:0, awayAmount:0 });
    setOneAmounts({ winnerAmount:0, homeAmount:0, drawAmount:0, awayAmount:0 });
    saveBase();
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  const displayAmounts = {
    homeAmount:  amounts.homeAmount  + zeroAmounts.homeAmount  + oneAmounts.homeAmount,
    drawAmount:  amounts.drawAmount  + zeroAmounts.drawAmount  + oneAmounts.drawAmount,
    awayAmount:  amounts.awayAmount  + zeroAmounts.awayAmount  + oneAmounts.awayAmount,
  };

  /* ================================================================
     RENDER
     ================================================================ */
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
          <button onClick={saveBase} className="px-4 py-2 bg-green-600 font-bold text-white text-xs hover:bg-green-700">💾 Save</button>
          <button onClick={fetchBase} disabled={isReloading}
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
            { key:"six",  label:"6–0", amt:amounts.winnerAmount,    handler:handleJackpot,     color:"bg-yellow-400 text-black" },
            { key:"zero", label:"5–0", amt:zeroAmounts.winnerAmount, handler:handleZeroJackpot, color:"bg-yellow-500 text-black" },
            { key:"one",  label:"5–1", amt:oneAmounts.winnerAmount,  handler:handleOneJackpot,  color:"bg-orange-400 text-black" },
          ].map(({ key, label, amt, handler, color }) => (
            <button key={key} onClick={handler}
              className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has(key) ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : color}`}>
              <div className="text-xl font-black">{label}</div>
              <div className="text-[11px] mt-1 opacity-80">{amt || "–"}</div>
            </button>
          ))}
        </div>

        {/* ── GROUP A (small odds only) ── */}
        {isSmallOddsGame && (
          <>
            <div className="text-[9px] text-gray-400 text-center tracking-widest">— GROUP A: chase smallDef —</div>
            <div className="grid grid-cols-3 gap-3">
              {GROUP_A.map(key => (
                <button key={key} onClick={() => handleGroupAWin(key)}
                  disabled={!fixture || clicked.has(`ga_${key}`)}
                  className={`py-4 rounded-2xl font-bold text-sm transition active:scale-95 shadow ${
                    clicked.has(`ga_${key}`) ? "bg-white text-green-600 ring-2 ring-green-400"
                    : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                    : `${GROUP_A_COLORS[key]} text-white hover:opacity-90`}`}>
                  <div className="font-black">{GROUP_A_LABELS[key]}</div>
                  <div className="text-[11px] mt-0.5 opacity-80">{groupAStakes[key] || "–"}</div>
                  <div className="text-[9px] opacity-60 mt-0.5">SD:{smallDeficit}</div>
                </button>
              ))}
            </div>

            {/* ── GROUP B ── */}
            <div className="text-[9px] text-gray-400 text-center tracking-widest">— GROUP B: private target+deficit —</div>
            <div className="grid grid-cols-4 gap-2">
              {GROUP_B.map(key => (
                <button key={key} onClick={() => handleGroupBWin(key)}
                  disabled={!fixture || clicked.has(`gb_${key}`)}
                  className={`py-4 rounded-2xl font-bold text-sm transition active:scale-95 shadow ${
                    clicked.has(`gb_${key}`) ? "bg-white text-green-600 ring-2 ring-green-400"
                    : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                    : `${GROUP_B_COLORS[key]} text-white hover:opacity-90`}`}>
                  <div className="font-black text-xs">{GROUP_B_LABELS[key]}</div>
                  <div className="text-[10px] mt-0.5 opacity-80">{groupBStakes[key] || "–"}</div>
                  <div className="text-[8px] opacity-60 mt-0.5">T:{groupBTargets[key]}</div>
                  <div className="text-[8px] opacity-60">D:{groupBDeficits[key]}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── HDA ROW ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { step:"H", label:teamA, amt:displayAmounts.homeAmount, color:"bg-green-500" },
            { step:"D", label:"DRAW", amt:displayAmounts.drawAmount, color:"bg-gray-400" },
            { step:"A", label:teamB, amt:displayAmounts.awayAmount, color:"bg-red-500" },
          ].map(({ step, label, amt, color }) => (
            <button key={step} onClick={() => resolveResult(step)} disabled={!fixture}
              className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
                clicked.has(`hda_${step}`) ? "bg-white text-green-600 ring-2 ring-green-500"
                : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
                : `${color} hover:opacity-90`}`}>
              <div className="text-base font-extrabold uppercase">{label}</div>
              <div className="text-[11px] mt-1 opacity-80">{amt || "–"}</div>
            </button>
          ))}
        </div>

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
            <button onClick={clearForNext} disabled={!fixture}
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
