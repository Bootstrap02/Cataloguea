
import React, { useState, useEffect } from "react";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

// Standardized key names
const TEAM_A_KEYS = ["oneX", "twoX"];
const TEAM_A_LABELS = { oneX: "1X", twoX: "2X" };
const TEAM_A_ODD_KEY = { oneX: "oneX", twoX: "twoX" };
const TEAM_A_COLORS = { oneX: "bg-purple-600", twoX: "bg-pink-600" };

const TEAM_B_KEYS = ["tg0", "tg6"];
const TEAM_B_LABELS = { tg0: "0G", tg6: "6G" };
const TEAM_B_ODD_KEY = { tg0: "zeroGoals", tg6: "sixGoals" };
const TEAM_B_COLORS = { tg0: "bg-cyan-600", tg6: "bg-teal-600" };

const emptyTeamADefs = () => Object.fromEntries(TEAM_A_KEYS.map(k => [k, 0]));
const emptyTeamBDefs = () => Object.fromEntries(TEAM_B_KEYS.map(k => [k, 0]));
const emptyTeamAStakes = () => Object.fromEntries(TEAM_A_KEYS.map(k => [k, 0]));
const emptyTeamBStakes = () => Object.fromEntries(TEAM_B_KEYS.map(k => [k, 0]));

const Homepage = () => {
  /* ── INPUTS ── */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  /* ── FIXTURE ── */
  const [fixture, setFixture] = useState(null);
  const [isSmallOddsGame, setIsSmallOddsGame] = useState(false);

  /* ── WINNER / HDA ── */
  const [baseStake, setBaseStake] = useState(10000);
  const [deficit, setDeficit] = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(100); // Default 100
  const [residueDeficit, setResidueDeficit] = useState(0);
  const [bank, setBank] = useState(100); // Default 100
  const [orderedStakes, setOrderedStakes] = useState([]);
  const [amounts, setAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

  /* ── TEAM A ASSETS (1X, 2X) - chase smallDeficit ── */
  const [teamAStakes, setTeamAStakes] = useState(emptyTeamAStakes());
  const [teamADefs, setTeamADefs] = useState(emptyTeamADefs());

  /* ── TEAM B ASSETS (TG0, TG6) - chase residueDeficit ── */
  const [teamBStakes, setTeamBStakes] = useState(emptyTeamBStakes());
  const [teamBDefs, setTeamBDefs] = useState(emptyTeamBDefs());

  /* ── CLICKED / WINNERS ── */
  const [clicked, setClicked] = useState(new Set());
  const [teamAWinners, setTeamAWinners] = useState(new Set());
  const [teamBWinners, setTeamBWinners] = useState(new Set());

  /* ── LOAD SESSION ── */
  useEffect(() => {
    const saved = localStorage.getItem("virt-epl");
    if (saved) {
      const d = JSON.parse(saved);
      setDeficit(d.deficit || 0);
      setBaseStake(d.baseStake || 10000);
      setSmallDeficit(d.smallDeficit ?? 100);
      setResidueDeficit(d.residueDeficit || 0);
      setBank(d.bank ?? 100);
      setTeamADefs(d.teamADefs || emptyTeamADefs());
      setTeamBDefs(d.teamBDefs || emptyTeamBDefs());
    }
  }, []);

  const handleSaveState = (updatedValues) => {
    localStorage.setItem("virt-epl", JSON.stringify({
      deficit: updatedValues.deficit !== undefined ? updatedValues.deficit : deficit,
      baseStake: updatedValues.baseStake !== undefined ? updatedValues.baseStake : baseStake,
      smallDeficit: updatedValues.smallDeficit !== undefined ? updatedValues.smallDeficit : smallDeficit,
      residueDeficit: updatedValues.residueDeficit !== undefined ? updatedValues.residueDeficit : residueDeficit,
      bank: updatedValues.bank !== undefined ? updatedValues.bank : bank,
      teamADefs: updatedValues.teamADefs !== undefined ? updatedValues.teamADefs : teamADefs,
      teamBDefs: updatedValues.teamBDefs !== undefined ? updatedValues.teamBDefs : teamBDefs
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
    setTeamAWinners(new Set());
    setTeamBWinners(new Set());

    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);

    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);

    // Bank logic: if bank >= winner, subtract from bank, else push residue to smallDeficit
    let curSD = smallDeficit;
    let currentBank = bank;
    
    if (currentBank >= wStake) {
      currentBank -= wStake;
      setBank(currentBank);
      // Only add winnerStake to smallDeficit for Small Odds games
      if (isSmall) {
        curSD = smallDeficit + wStake;
        setSmallDeficit(curSD);
      }
    } else {
      const residue = wStake - currentBank;
      currentBank = 0;
      setBank(0);
      // Add residue to smallDeficit
      curSD = smallDeficit + residue;
      setSmallDeficit(curSD);
    }

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

    /* ── TEAM A (1X, 2X) - chase smallDeficit (NO -1, just divide by odd) ── */
    const newTeamAStakes = emptyTeamAStakes();
    TEAM_A_KEYS.forEach((key) => {
      const odd = found[TEAM_A_ODD_KEY[key]] || 0;
      if (odd <= 1.01) return;
      const def = teamADefs[key] || 0;
      newTeamAStakes[key] = Math.max(Math.round((curSD + def) / odd), 10);
    });
    setTeamAStakes(newTeamAStakes);

    /* ── TEAM B (TG0, TG6) - chase residueDeficit ── */
    const newTeamBStakes = emptyTeamBStakes();
    TEAM_B_KEYS.forEach((key) => {
      const odd = found[TEAM_B_ODD_KEY[key]] || 0;
      if (odd <= 1.01) return;
      const def = teamBDefs[key] || 0;
      newTeamBStakes[key] = Math.max(Math.round((residueDeficit + def) / (odd - 1)), 10);
    });
    setTeamBStakes(newTeamBStakes);
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
     TEAM A WIN (1X or 2X)
     ================================================================ */
  const markTeamAWin = (key) => {
    if (!fixture || clicked.has(`teamA_${key}`)) return;

    setClicked(prev => new Set([...prev, `teamA_${key}`]));
    setTeamAWinners(prev => new Set([...prev, key]));

    // Reset this asset's deficit to 0
    setTeamADefs(prev => ({ ...prev, [key]: 0 }));

    // Clear smallDeficit (it gets reset to 0 on win)
    setSmallDeficit(0);
  };

  /* ================================================================
     TEAM B WIN (TG0 or TG6)
     ================================================================ */
  const markTeamBWin = (key) => {
    if (!fixture || clicked.has(`teamB_${key}`)) return;

    setClicked(prev => new Set([...prev, `teamB_${key}`]));
    setTeamBWinners(prev => new Set([...prev, key]));

    // When TG0 or TG6 wins, push the other's deficit to smallDeficit
    const otherKey = key === "tg0" ? "tg6" : "tg0";
    const otherDeficit = teamBDefs[otherKey] || 0;
    
    if (otherDeficit > 0) {
      setSmallDeficit(prev => prev + otherDeficit);
      setTeamBDefs(prev => ({ ...prev, [otherKey]: 0 }));
    }

    // Reset the winner's deficit to 0
    setTeamBDefs(prev => ({ ...prev, [key]: 0 }));
    
    // Clear residueDeficit
    setResidueDeficit(0);
  };

  /* ================================================================
     NEXT — settle all assets + clear
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    let newTeamADefs = { ...teamADefs };
    let newTeamBDefs = { ...teamBDefs };
    let newSD = smallDeficit;
    let newResidue = residueDeficit;
    let newBank = bank;

    // Team A losses: add stakes to their deficits
    const teamALostKeys = TEAM_A_KEYS.filter(k => !teamAWinners.has(k));
    teamALostKeys.forEach(k => {
      newTeamADefs[k] += (teamAStakes[k] || 0);
    });

    // Team B losses: add stakes to their deficits
    const teamBLostKeys = TEAM_B_KEYS.filter(k => !teamBWinners.has(k));
    teamBLostKeys.forEach(k => {
      newTeamBDefs[k] += (teamBStakes[k] || 0);
    });

    // Update all states
    setTeamADefs(newTeamADefs);
    setTeamBDefs(newTeamBDefs);
    setSmallDeficit(newSD);
    setResidueDeficit(newResidue);
    setBank(newBank);

    handleSaveState({
      smallDeficit: newSD,
      residueDeficit: newResidue,
      bank: newBank,
      teamADefs: newTeamADefs,
      teamBDefs: newTeamBDefs
    });

    settleAndClear();
  };

  /* ── 6-0 jackpot ── */
  const handleJackpot = () => {
    setClicked(prev => new Set([...prev, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(100);
    setResidueDeficit(0);
    setBank(100);
    setTeamADefs(emptyTeamADefs());
    setTeamBDefs(emptyTeamBDefs());
  };

  /* ── settle & clear ── */
  const settleAndClear = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setIsSmallOddsGame(false);
    setOrderedStakes([]);
    setClicked(new Set());
    setTeamAWinners(new Set());
    setTeamBWinners(new Set());
    setWinnerStake(0);
    setTeamAStakes(emptyTeamAStakes());
    setTeamBStakes(emptyTeamBStakes());
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

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
        {/* 6-0 Jackpot */}
        <div className="grid grid-cols-1 gap-3">
          <button onClick={handleJackpot}
            className={`py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}>
            <div className="text-xl font-black">6–0</div>
            <div className="text-[11px] mt-1 opacity-80">{winnerStake || "–"}</div>
          </button>
        </div>

        {/* Team A Assets (1X, 2X) - chase smallDeficit */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM A (chase Small Deficit) —</div>
        <div className="grid grid-cols-2 gap-3">
          {TEAM_A_KEYS.map(key => {
            const won = teamAWinners.has(key);
            const color = TEAM_A_COLORS[key];
            return (
              <button key={key} onClick={() => markTeamAWin(key)}
                disabled={!fixture || clicked.has(`teamA_${key}`)}
                className={`py-4 rounded-2xl font-bold text-sm transition active:scale-95 shadow ${
                  won
                    ? "bg-white text-green-600 ring-2 ring-green-400"
                    : !fixture
                    ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                    : `${color} text-white hover:opacity-90`
                }`}>
                <div className="font-black">{TEAM_A_LABELS[key]}</div>
                <div className="text-[11px] mt-0.5 opacity-80">{teamAStakes[key] || "–"}</div>
                <div className="text-[9px] opacity-60 mt-0.5">D:{teamADefs[key]}</div>
              </button>
            );
          })}
        </div>

        {/* Team B Assets (TG0, TG6) - chase residueDeficit */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM B (chase Residue Deficit) —</div>
        <div className="grid grid-cols-2 gap-3">
          {TEAM_B_KEYS.map(key => {
            const won = teamBWinners.has(key);
            const color = TEAM_B_COLORS[key];
            return (
              <button key={key} onClick={() => markTeamBWin(key)}
                disabled={!fixture || clicked.has(`teamB_${key}`)}
                className={`py-4 rounded-2xl font-bold text-sm transition active:scale-95 shadow ${
                  won
                    ? "bg-white text-green-600 ring-2 ring-green-400"
                    : !fixture
                    ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                    : `${color} text-white hover:opacity-90`
                }`}>
                <div className="font-black">{TEAM_B_LABELS[key]}</div>
                <div className="text-[11px] mt-0.5 opacity-80">{teamBStakes[key] || "–"}</div>
                <div className="text-[9px] opacity-60 mt-0.5">D:{teamBDefs[key]}</div>
              </button>
            );
          })}
        </div>

        {/* HDA Row */}
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

        {/* INPUTS + ACTIONS */}
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

        {/* STATS */}
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
            <span className="text-gray-400">Residue Def</span>
            <strong className="text-orange-400">{residueDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bank</span>
            <strong className="text-emerald-400">{bank}</strong>
          </div>
          <div className="col-span-2 border-t border-white/10 pt-2 grid grid-cols-2 gap-x-6 gap-y-1">
            {TEAM_A_KEYS.map(key => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-500">{TEAM_A_LABELS[key]} Def</span>
                <strong className="text-white">{teamADefs[key]}</strong>
              </div>
            ))}
            {TEAM_B_KEYS.map(key => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-500">{TEAM_B_LABELS[key]} Def</span>
                <strong className="text-white">{teamBDefs[key]}</strong>
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
