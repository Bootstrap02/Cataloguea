
import React, { useState, useEffect } from "react";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

const SMALL_KEYS   = ["oneX", "twoX", "tg0", "tg6"];
const SMALL_LABELS = { oneX: "1X", twoX: "2X", tg0: "0G", tg6: "6G" };
const SMALL_ODD_KEY = { oneX: "oneX", twoX: "twoX", tg0: "zeroGoals", tg6: "sixGoals" };
const SMALL_COLORS  = { oneX: "bg-purple-600", twoX: "bg-pink-600", tg0: "bg-cyan-600", tg6: "bg-teal-600" };

const emptySmallDefs   = () => Object.fromEntries(SMALL_KEYS.map(k => [k, 0]));
const emptySmallStakes = () => Object.fromEntries(SMALL_KEYS.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  const [fixture,         setFixture]         = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ── WINNER / HDA ── */
  const [baseStake,    setBaseStake]    = useState(10000);
  const [deficit,      setDeficit]      = useState(0);
  const [winnerStake,  setWinnerStake]  = useState(0);
  const [orderedStakes, setOrderedStakes] = useState([]);
  const [amounts,      setAmounts]      = useState({ winnerAmount:0, homeAmount:0, drawAmount:0, awayAmount:0 });

  /* ── SMALL DEFICIT + SHADOW + BANK ── */
  const [smallDeficit,       setSmallDeficit]       = useState(0);
  const [smallDeficitShadow, setSmallDeficitShadow] = useState(0);
  const [bank,               setBank]               = useState(0);

  /* ── RESIDUE DEFICIT (1X and 2X stakes pile here) ── */
  const [residueDeficit, setResidueDeficit] = useState(0);

  /* ── PRIVATE DEFS + STAKES ── */
  const [smallDefs,   setSmallDefs]   = useState(emptySmallDefs());
  const [smallStakes, setSmallStakes] = useState(emptySmallStakes());

  /* ── CLICKED / WINNERS ── */
  const [clicked,      setClicked]      = useState(new Set());
  const [smallWinners, setSmallWinners] = useState(new Set());

  /* ── LOAD SESSION ── */
  useEffect(() => {
    const saved = localStorage.getItem("virt-epl");
    if (saved) {
      const d = JSON.parse(saved);
      setDeficit(d.deficit         || 0);
      setBaseStake(d.baseStake     || 10000);
      setSmallDeficit(d.smallDeficit           || 0);
      setSmallDeficitShadow(d.smallDeficitShadow || 0);
      setBank(d.bank               || 0);
      setResidueDeficit(d.residueDeficit        || 0);
      setSmallDefs(d.smallDefs     || emptySmallDefs());
    }
  }, []);

  const handleSaveState = (overrides = {}) => {
    localStorage.setItem("virt-epl", JSON.stringify({
      deficit:             overrides.deficit             ?? deficit,
      baseStake:           overrides.baseStake           ?? baseStake,
      smallDeficit:        overrides.smallDeficit        ?? smallDeficit,
      smallDeficitShadow:  overrides.smallDeficitShadow  ?? smallDeficitShadow,
      bank:                overrides.bank                ?? bank,
      residueDeficit:      overrides.residueDeficit      ?? residueDeficit,
      smallDefs:           overrides.smallDefs           ?? smallDefs,
    }));
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
    setSmallWinners(new Set());

    /* ── Winner stake ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);

    /* ── SmallOdds: bank absorbs winner stake first ── */
    let curSD = smallDeficit;
    if (isSmall) {
      let bankNow = bank;
      if (bankNow >= wStake) {
        bankNow -= wStake;
        setBank(bankNow);
        /* smallDeficit unchanged */
      } else {
        const residue = wStake - bankNow;
        bankNow = 0;
        setBank(0);
        curSD = smallDeficit + residue;
        setSmallDeficit(curSD);
      }
    }

    /* ── Normal game: build HDA ladder ── */
    if (!isSmall) {
      const oddsMap = { H: found.win, D: found.draw, A: found.lose };
      const sequence = found.code ? [...found.code] : ["H","D","A"].sort((a,b)=>(oddsMap[b]||0)-(oddsMap[a]||0));
      let running = wStake;
      let homeAmount = 0, drawAmount = 0, awayAmount = 0;
      const ladder = [];
      for (const step of sequence) {
        const odd = oddsMap[step];
        if (!odd || odd <= 1.01) continue;
        const stake = Math.max(Math.round(running / (odd - 1)), 10);
        ladder.push({ step, stake });
        if (step === "H") homeAmount = stake;
        if (step === "D") drawAmount = stake;
        if (step === "A") awayAmount = stake;
        running += stake;
      }
      setOrderedStakes(ladder);
      setAmounts({ winnerAmount: wStake, homeAmount, drawAmount, awayAmount });
    } else {
      setOrderedStakes([]);
      setAmounts({ winnerAmount: wStake, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    }

    /* ── Calc all 4 small asset stakes ── */
    const newStakes = emptySmallStakes();
    const curRes = residueDeficit;

    /* 1X: (smallDeficit + privateDef) / odd   — no (odd-1) */
    const odd1X = found[SMALL_ODD_KEY["oneX"]] || 0;
    if (odd1X > 1.01) {
      newStakes["oneX"] = Math.max(Math.round((curSD + (smallDefs["oneX"] || 0)) / odd1X), 10);
    }

    /* 2X: (smallDeficit + privateDef) / odd   — no (odd-1) */
    const odd2X = found[SMALL_ODD_KEY["twoX"]] || 0;
    if (odd2X > 1.01) {
      newStakes["twoX"] = Math.max(Math.round((curSD + (smallDefs["twoX"] || 0)) / odd2X), 10);
    }

    /* TG0: (residueDeficit + privateDef) / (odd - 1) */
    const oddTg0 = found[SMALL_ODD_KEY["tg0"]] || 0;
    if (oddTg0 > 1.01) {
      newStakes["tg0"] = Math.max(Math.round((curRes + (smallDefs["tg0"] || 0)) / (oddTg0 - 1)), 10);
    }

    /* TG6: (residueDeficit + privateDef) / (odd - 1) */
    const oddTg6 = found[SMALL_ODD_KEY["tg6"]] || 0;
    if (oddTg6 > 1.01) {
      newStakes["tg6"] = Math.max(Math.round((curRes + (smallDefs["tg6"] || 0)) / (oddTg6 - 1)), 10);
    }

    setSmallStakes(newStakes);
  };

  /* ================================================================
     RESOLVE HDA (normal games only)
     ================================================================ */
  const resolveResult = (step) => {
    if (!fixture || isSmallOddsGame) return;
    setClicked(prev => new Set([...prev, `hda_${step}`]));

    const idx = orderedStakes.findIndex(s => s.step === step);
    const loss = idx === -1 ? 0 : orderedStakes.slice(0, idx).reduce((sum, s) => sum + s.stake, 0);
    setDeficit(loss);
    settleAndClear();
  };

  /* ================================================================
     SMALL ASSET WIN
     ================================================================ */
  const markSmallWin = (key) => {
    if (!fixture || clicked.has(`small_${key}`)) return;
    setClicked(prev => new Set([...prev, `small_${key}`]));
    setSmallWinners(prev => new Set([...prev, key]));

    /* Clear this asset's private def */
    setSmallDefs(prev => ({ ...prev, [key]: 0 }));

    if (key === "oneX" || key === "twoX") {
      /* 1X or 2X win: smallDeficit → 0, save shadow */
      if (smallDeficit > 0) {
        setSmallDeficitShadow(smallDeficit);
        setSmallDeficit(0);
      } else {
        /* Second win: shadow → bank */
        setBank(prev => prev + smallDeficitShadow);
        setSmallDeficitShadow(0);
      }
    }

    if (key === "tg0" || key === "tg6") {
      /* TG0 or TG6 win: push the OTHER one's deficit into smallDeficit */
      const other = key === "tg0" ? "tg6" : "tg0";
      const otherDef = smallDefs[other] || 0;
      if (otherDef > 0) {
        setSmallDeficit(prev => prev + otherDef);
        setSmallDefs(prev => ({ ...prev, [other]: 0 }));
      }
      /* Clear residueDeficit */
      setResidueDeficit(0);
    }
  };

  /* ================================================================
     NEXT
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    const newDefs  = { ...smallDefs };
    let newSD      = smallDeficit;
    let newShadow  = smallDeficitShadow;
    let newBank    = bank;
    let newResidue = residueDeficit;

    const lostKeys = SMALL_KEYS.filter(k => !smallWinners.has(k));

    /* Pile losing stakes into private defs */
    lostKeys.forEach(k => { newDefs[k] += (smallStakes[k] || 0); });

    /* 1X and 2X stakes (won or lost) always pile into residueDeficit */
    newResidue += (smallStakes["oneX"] || 0) + (smallStakes["twoX"] || 0);

    /* If a 1X/2X win happened, collapse all defs → smallDeficit */
    const hadSmallWin = smallWinners.has("oneX") || smallWinners.has("twoX");
    if (hadSmallWin && newSD === 0) {
      const totalDef = SMALL_KEYS.reduce((s, k) => s + (newDefs[k] || 0), 0);
      newSD = totalDef;
      SMALL_KEYS.forEach(k => { newDefs[k] = 0; });
    }

    setSmallDefs(newDefs);
    setSmallDeficit(newSD);
    setSmallDeficitShadow(newShadow);
    setBank(newBank);
    setResidueDeficit(newResidue);

    handleSaveState({
      smallDeficit: newSD,
      smallDeficitShadow: newShadow,
      bank: newBank,
      residueDeficit: newResidue,
      smallDefs: newDefs,
    });

    settleAndClear();
  };

  /* ── 6-0 jackpot ── */
  const handleJackpot = () => {
    setClicked(prev => new Set([...prev, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
    setSmallDeficitShadow(0);
  };

  /* ── settle & clear ── */
  const settleAndClear = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setClicked(new Set());
    setSmallWinners(new Set());
    setWinnerStake(0);
    setSmallStakes(emptySmallStakes());
    setAmounts({ winnerAmount:0, homeAmount:0, drawAmount:0, awayAmount:0 });
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

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
            <span className="ml-2 text-[10px] bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold align-middle">
              SMALL ODDS
            </span>
          )}
        </h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={() => handleSaveState()}
            className="px-4 py-2 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">
            💾 Save
          </button>
          <button onClick={() => window.location.reload()}
            className="flex items-center gap-1 px-4 py-2 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition">
            <FiRefreshCw size={11} />
            Reload
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-6 gap-4 overflow-y-auto">

        {/* 6-0 */}
        <button onClick={handleJackpot}
          className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
            clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black hover:bg-yellow-300"
          }`}>
          <div className="text-xl font-black">6–0</div>
          <div className="text-[11px] mt-1 opacity-80">{winnerStake || "–"}</div>
        </button>

        {/* Small Assets */}
        <div className="grid grid-cols-4 gap-3">
          {SMALL_KEYS.map(key => {
            const won   = smallWinners.has(key);
            const color = SMALL_COLORS[key];
            return (
              <button key={key} onClick={() => markSmallWin(key)}
                disabled={!fixture || clicked.has(`small_${key}`)}
                className={`py-4 rounded-2xl font-bold text-sm transition active:scale-95 shadow ${
                  won ? "bg-white text-green-600 ring-2 ring-green-400"
                  : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                  : `${color} text-white hover:opacity-90`
                }`}>
                <div className="font-black">{SMALL_LABELS[key]}</div>
                <div className="text-[11px] mt-0.5 opacity-80">{smallStakes[key] || "–"}</div>
                <div className="text-[9px] opacity-60 mt-0.5">D:{smallDefs[key]}</div>
              </button>
            );
          })}
        </div>

        {/* HDA (normal only) */}
        <div className={`grid grid-cols-3 gap-3 transition-opacity ${isSmallOddsGame ? "opacity-30 pointer-events-none" : ""}`}>
          {[
            { step:"H", label:teamA, color:"bg-green-500", amt:amounts.homeAmount },
            { step:"D", label:"DRAW", color:"bg-gray-400",  amt:amounts.drawAmount },
            { step:"A", label:teamB, color:"bg-red-500",   amt:amounts.awayAmount },
          ].map(({ step, label, color, amt }) => (
            <button key={step} onClick={() => resolveResult(step)} disabled={!fixture || isSmallOddsGame}
              className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
                clicked.has(`hda_${step}`) ? "bg-white text-green-600 ring-2 ring-green-500"
                : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
                : `${color} hover:opacity-90`
              }`}>
              <div className="text-base font-extrabold uppercase">{label}</div>
              <div className="text-[11px] mt-1 opacity-80">{amt || "–"}</div>
            </button>
          ))}
        </div>

        {/* Inputs */}
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
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 shadow ${
                fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 hover:bg-red-600 text-white"
              }`}>
              CALCULATE
            </button>
            <button onClick={handleNext} disabled={!fixture}
              className={`flex-1 py-3.5 font-bold text-sm rounded-xl transition active:scale-95 shadow ${
                !fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-green-700 hover:bg-green-600 text-white"
              }`}>
              NEXT
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white/5 rounded-2xl p-4 text-xs grid grid-cols-2 gap-x-6 gap-y-2">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Small Def</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">SD Shadow</span><strong className="text-blue-300">{smallDeficitShadow}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Residue Def</span><strong className="text-orange-400">{residueDeficit}</strong></div>
          <div className="col-span-2 border-t border-white/10 pt-2 grid grid-cols-2 gap-x-6 gap-y-1">
            {SMALL_KEYS.map(key => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-500">{SMALL_LABELS[key]} Def</span>
                <strong className="text-white">{smallDefs[key]}</strong>
              </div>
            ))}
          </div>
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
