
import React, { useState, useEffect } from "react";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

// Standardized key names to fix the camelCase vs lowercase bugs
const SMALL_KEYS   = ["oneX", "twoX", "tg0", "tg6"];
const SMALL_LABELS = { oneX: "1X", twoX: "2X", tg0: "0G", tg6: "6G" };
const SMALL_ODD_KEY = { oneX: "oneX", twoX: "twoX", tg0: "zeroGoals", tg6: "sixGoals" };
const SMALL_COLORS  = { oneX: "bg-purple-600", twoX: "bg-pink-600", tg0: "bg-cyan-600", tg6: "bg-teal-600" };

const emptySmallDefs   = () => Object.fromEntries(SMALL_KEYS.map(k => [k, 0]));
const emptySmallStakes = () => Object.fromEntries(SMALL_KEYS.map(k => [k, 0]));

const Homepage = () => {
  /* ── INPUTS ── */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  
  /* ── FIXTURE ── */
  const [fixture,        setFixture]        = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ── WINNER / HDA ── */
  const [baseStake,    setBaseStake]    = useState(10000);
  const [deficit,      setDeficit]      = useState(0);
  const [winnerStake,  setWinnerStake]  = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [smallDeficitShadow, setSmallDeficitShadow] = useState(0);
  const [bank,         setBank]         = useState(0);
  const [orderedStakes, setOrderedStakes] = useState([]);
  const [amounts, setAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

  /* ── SMALL ODDS ASSETS ── */
  const  [smallStakes, setSmallStakes] = useState(emptySmallStakes());
  const  [smallDefs,   setSmallDefs]   = useState(emptySmallDefs()); // Using clean helper to ensure keys match exactly

  /* ── CLICKED / WINNERS ── */
  const [clicked,      setClicked]      = useState(new Set());
  const [smallWinners, setSmallWinners] = useState(new Set());

  /* ── LOAD SESSION ── */
  useEffect(() => {
    const saved = localStorage.getItem("virt-epl");
    if (saved) {
      const d = JSON.parse(saved);
      setDeficit(d.deficit     || 0);
      setBaseStake(d.baseStake || 10000);
      setSmallDeficit(d.smallDeficit || 0);
      setSmallDeficitShadow(d.smallDeficitShadow || 0);
      setBank(d.bank || 0);
      setSmallDefs(d.smallDefs || emptySmallDefs());
    }
  }, []);

  const handleSaveState = (updatedValues) => {
    localStorage.setItem("virt-epl", JSON.stringify({
      deficit: updatedValues.deficit !== undefined ? updatedValues.deficit : deficit,
      baseStake: updatedValues.baseStake !== undefined ? updatedValues.baseStake : baseStake,
      smallDeficit: updatedValues.smallDeficit !== undefined ? updatedValues.smallDeficit : smallDeficit,
      smallDeficitShadow: updatedValues.smallDeficitShadow !== undefined ? updatedValues.smallDeficitShadow : smallDeficitShadow,
      bank: updatedValues.bank !== undefined ? updatedValues.bank : bank,
      smallDefs: updatedValues.smallDefs !== undefined ? updatedValues.smallDefs : smallDefs
    }));
  };

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    let found = smallOdds.find((o) => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!found) found = odds.find((o) => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    setFixture(found);
    setIsSmallOddsGame(isSmall);
    setClicked(new Set());
    setSmallWinners(new Set());

    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    
    const curSD = smallDeficit + wStake;
    setSmallDeficit(curSD);

    /* ── Normal game: build HDA ladder ── */
    if (!isSmall) {
      const oddsMap = { H: found.win, D: found.draw, A: found.lose };
      let running = wStake;
      let homeAmount = 0, drawAmount = 0, awayAmount = 0;
      const ladder = [];
      
      const gameCode = found.code || "HDA"; 

      for (const step of gameCode) {
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

    /* ── Small odds assets ── */
    const newSmallStakes = emptySmallStakes();
    SMALL_KEYS.forEach((key) => {
      const odd = found[SMALL_ODD_KEY[key]] || 0;
      if (odd <= 1.01) return;
      const def = smallDefs[key] || 0;
      newSmallStakes[key] = Math.max(Math.round((curSD + def) / (odd - 1)), 10);
    });
    setSmallStakes(newSmallStakes);
  };
  

  /* ================================================================
     RESOLVE HDA (normal games only)
     ================================================================ */
  const resolveResult = (step) => {
    if (!fixture || isSmallOddsGame) return;
    setClicked(prev => new Set([...prev, `hda_${step}`]));

    const idx = orderedStakes.findIndex(s => s.step === step);
    const newDeficit = orderedStakes.slice(idx + 1).reduce((sum, s) => sum + s.stake, 0);
    setDeficit(newDeficit);
  };

  /* ================================================================
     SMALL ODDS ASSET WIN
     ================================================================ */
  const markSmallWin = (key) => {
    if (!fixture || clicked.has(`small_${key}`)) return;

    setClicked(prev => new Set([...prev, `small_${key}`]));
    setSmallWinners(prev => new Set([...prev, key]));

    setSmallDefs(prev => ({ ...prev, [key]: 0 }));

    setSmallDeficit((prevSD) => {
      if (prevSD > 0) {
        setSmallDeficitShadow(prevSD);
        return 0;
      } else {
        setBank((prevBank) => prevBank + smallDeficitShadow);
        setSmallDeficitShadow(0);
        return 0;
      }
    });
  };

  /* ================================================================
     NEXT — settle small odds assets + clear
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    let newDefs = { ...smallDefs };
    let newSD = smallDeficit;
    let newShadow = smallDeficitShadow;
    let newBank = bank;

    const lostKeys = SMALL_KEYS.filter(k => !smallWinners.has(k));

    // First handle normal losing asset stake accumulation
    lostKeys.forEach(k => {
      newDefs[k] += smallStakes[k] || 0;
    });

    // Rounding Up logic: If there was a win during this fixture (meaning SD drops to 0)
    if (newSD === 0) {
      // Sum up the deficits of all losing assets
      const totalLosingDeficit = lostKeys.reduce((sum, k) => sum + newDefs[k], 0);
      newSD = totalLosingDeficit;

      // Wipe out all individual asset deficits to 0
      SMALL_KEYS.forEach(k => {
        newDefs[k] = 0;
      });
    }

    // Apply accurate batch update states
    setSmallDefs(newDefs);
    setSmallDeficit(newSD);
    setSmallDeficitShadow(newShadow);
    setBank(newBank);

    // Write straight to storage avoiding standard async state-delay lag
    handleSaveState({
      smallDeficit: newSD,
      smallDeficitShadow: newShadow,
      bank: newBank,
      smallDefs: newDefs
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
    setInputA(""); 
    setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setClicked(new Set());
    setSmallWinners(new Set());
    setWinnerStake(0);
    setSmallStakes(emptySmallStakes());
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
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
          <button onClick={() => handleSaveState({})}
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

        {/* ── WINNER ROW (6-0) ── */}
        <div className="grid grid-cols-1 gap-3">
          <button onClick={handleJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}>
            <div className="text-xl font-black">6–0</div>
            <div className="text-[11px] mt-1 opacity-80">{winnerStake || "–"}</div>
          </button>
        </div>

        {/* ── SMALL ODDS ASSETS — always shown ── */}
        <div className="grid grid-cols-4 gap-3">
          {SMALL_KEYS.map(key => {
            const won = smallWinners.has(key);
            const color = SMALL_COLORS[key];
            return (
              <button key={key} onClick={() => markSmallWin(key)}
                disabled={!fixture || clicked.has(`small_${key}`)}
                className={`py-4 rounded-2xl font-bold text-sm transition active:scale-95 shadow ${
                  won
                    ? "bg-white text-green-600 ring-2 ring-green-400"
                    : !fixture
                    ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                    : `${color} text-white hover:opacity-90`
                }`}>
                <div className="font-black">{SMALL_LABELS[key]}</div>
                <div className="text-[11px] mt-0.5 opacity-80">{smallStakes[key] || "–"}</div>
                <div className="text-[9px] opacity-60 mt-0.5">D:{smallDefs[key]}</div>
              </button>
            );
          })}
        </div>

        {/* ── HDA ROW (normal games only) ── */}
        <div className={`grid grid-cols-3 gap-3 transition-opacity ${isSmallOddsGame ? "opacity-30 pointer-events-none" : ""}`}>
          <button onClick={() => resolveResult("H")} disabled={!fixture || isSmallOddsGame}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("hda_H") ? "bg-white text-green-600 ring-2 ring-green-500"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-green-500 hover:bg-green-400"
            }`}>
            <div className="text-base font-extrabold uppercase">{teamA}</div>
            <div className="text-[11px] mt-1 opacity-80">{amounts.homeAmount || "–"}</div>
          </button>
          <button onClick={() => resolveResult("D")} disabled={!fixture || isSmallOddsGame}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("hda_D") ? "bg-white text-gray-600 ring-2 ring-gray-400"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-gray-400 hover:bg-gray-300"
            }`}>
            <div className="text-base font-extrabold">DRAW</div>
            <div className="text-[11px] mt-1 opacity-80">{amounts.drawAmount || "–"}</div>
          </button>
          <button onClick={() => resolveResult("A")} disabled={!fixture || isSmallOddsGame}
            className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 shadow text-white ${
              clicked.has("hda_A") ? "bg-white text-red-600 ring-2 ring-red-500"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed"
              : "bg-red-500 hover:bg-red-400"
            }`}>
            <div className="text-base font-extrabold uppercase">{teamB}</div>
            <div className="text-[11px] mt-1 opacity-80">{amounts.awayAmount || "–"}</div>
          </button>
        </div>

        {/* ── INPUTS + ACTIONS ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400" />
            <span className="font-black text-xl text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-3 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none focus:border-red-400" />
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
            <span className="text-gray-400">Small Def</span>
            <strong className="text-blue-400">{smallDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">SD Shadow</span>
            <strong className="text-blue-300">{smallDeficitShadow}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bank</span>
            <strong className="text-emerald-400">{bank}</strong>
          </div>
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
