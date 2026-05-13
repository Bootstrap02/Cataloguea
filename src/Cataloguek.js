
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const specialKeys = ["oneX", "twoX", "zeroGoals", "sixGoals"];

const specialLabels = {
  oneX: "1X", twoX: "2X",
  zeroGoals: "0 GOALS", sixGoals: "6 GOALS",
};

const emptySpecialDeficits = () => ({
  oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0,
});

const Homepage = () => {
  /* ── INPUTS ── */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  /* ── FIXTURE ── */
  const [fixture, setFixture] = useState(null);
  const [isSmallTeamMatch, setIsSmallTeamMatch] = useState(false);
  const [pressedWins, setPressedWins] = useState(new Set());
  const [jackpot, setJackpot] = useState(false);

  /* ── BASE SYSTEM ── */
  const [baseStake, setBaseStake] = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit, setDeficit] = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit, setOneDeficit] = useState(0);
  const baseRef = useRef(10000);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ── SPECIAL DEFICITS ── */
  const [specialDeficits, setSpecialDeficits] = useState(emptySpecialDeficits());
  const [badGamesDeficit, setBadGamesDeficit] = useState(0); // current game target
  const [bank, setBank] = useState(0);

  /* ── STAKES ── */
  const [amounts, setAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts, setZeroAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts, setOneAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [specialStakes, setSpecialStakes] = useState({ oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ── API ── */
  const fetchAll = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d = res.data || {};
      setBaseStake(d.base ?? 10000);
      setBaseDeficit(d.baseDeficit ?? 0);
      setZeroDeficit(d.zeroDeficit ?? 0);
      setOneDeficit(d.oneDeficit ?? 0);
      setSpecialDeficits(d.specialDeficits ?? emptySpecialDeficits());
      setBadGamesDeficit(d.badGamesDeficit ?? 0);
      setBank(d.bank ?? 0);
    } catch (err) {
      console.error("❌ Load:", err.message);
    } finally {
      setIsReloading(false);
    }
  };

  const saveAll = async () => {
    try {
      await axios.put(API_BASE, {
        base: Math.max(10000, baseRef.current),
        baseDeficit,
        zeroDeficit,
        oneDeficit,
        specialDeficits,
        badGamesDeficit,
        bank,
      });
    } catch (err) {
      console.error("❌ Save:", err.message);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ── HELPER: Push deficit to base if >= 1000 ── */
  const processLargeDeficit = (defKey, currentDef) => {
    if (currentDef < 1000) return currentDef;

    setBank((prevBank) => {
      if (prevBank >= currentDef) {
        return prevBank - currentDef;
      } else {
        const residue = currentDef - prevBank;
        setBaseStake((p) => p + residue);
        setBaseDeficit((p) => p + residue);
        return 0;
      }
    });

    return 0; // reset this special deficit
  };

  /* ── LADDER BUILDER (HDA) ── */
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
    return { ladder, H, D, A };
  };

  /* ================================================================
     LOAD GAME
  ================================================================ */
  const handleLoadGame = (e) => {
    e.preventDefault();
    if (isLoading) return;

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    let found = smallOdds.find((o) => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!isSmall) found = odds.find((o) => o.home === home && o.away === away);
    if (!found) {
      alert(`No odds for ${home} vs ${away}`);
      return;
    }

    setFixture(found);
    setIsSmallTeamMatch(isSmall);
    setPressedWins(new Set());
    setJackpot(false);
    setOrderedStakes([]);

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    const code = found.code || "";

    /* Current game target */
    const newBad = baseStake + deficit;
    setBadGamesDeficit(newBad);

    /* 6-0 Winner */
    const winnerAmt = Math.max(Math.round(newBad / found.winner), 10);
    setAmounts({ winnerAmount: winnerAmt, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    /* 5-0 & 5-1 */
    const sz = Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10);
    const so = Math.max(Math.round((baseDeficit + oneDeficit) / found.fiveOne), 10);
    setZeroAmounts({ winnerAmount: sz, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({ winnerAmount: so, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    /* ── Special Assets (same logic for small + normal) ── */
    const newSpecialStakes = {};
    specialKeys.forEach((key) => {
      const personalDef = specialDeficits[key];
      const target = personalDef + newBad;
      const odd = found[key] || 0;
      const stake = (odd > 1.01) ? Math.max(Math.round(target / (odd - 1)), 10) : 0;
      newSpecialStakes[key] = stake;
    });
    setSpecialStakes(newSpecialStakes);

    /* Normal game HDA ladders */
    if (!isSmall) {
      const r6 = buildLadder(winnerAmt, "6-0", code, oddsMap);
      const r50 = buildLadder(sz, "5-0", code, oddsMap);
      const r51 = buildLadder(so, "5-1", code, oddsMap);

      setOrderedStakes([...r6.ladder, ...r50.ladder, ...r51.ladder]);
      setAmounts((prev) => ({ ...prev, homeAmount: r6.H, drawAmount: r6.D, awayAmount: r6.A }));
      setZeroAmounts((prev) => ({ ...prev, homeAmount: r50.H, drawAmount: r50.D, awayAmount: r50.A }));
      setOneAmounts((prev) => ({ ...prev, homeAmount: r51.H, drawAmount: r51.D, awayAmount: r51.A }));
    }

    setIsLoading(true);
  };

  /* ================================================================
     SPECIAL WIN
  ================================================================ */
  const handleSpecialWin = (key) => {
    if (!fixture || pressedWins.has(key) || specialStakes[key] === 0) return;

    setPressedWins((prev) => new Set([...prev, key]));

    setSpecialDeficits((prev) => {
      const newDefs = { ...prev };
      newDefs[key] = 100;                    // reset to 100
      return newDefs;
    });

    setBank((prev) => prev + 100);
  };

  /* ── 6-0 / 5-0 / 5-1 Wins ── */
  const handleJackpot = () => {
    if (!fixture) return;
    setJackpot(true);
    setDeficit(0);
    setBaseStake(10000);
    setBaseDeficit(0);
  };

  const handleZeroJackpot = () => {
    setBaseStake(10000 + oneDeficit);
    setBaseDeficit(oneDeficit);
    setOneDeficit(0);
    setZeroDeficit(0);
  };

  const handleOneJackpot = () => {
    setBaseStake(10000 + zeroDeficit);
    setBaseDeficit(zeroDeficit);
    setZeroDeficit(0);
    setOneDeficit(0);
  };

  /* ================================================================
     RESOLVE HDA (Normal Games Only)
  ================================================================ */
  const resolveResult = (step) => {
    if (!fixture || isSmallTeamMatch) return;

    const calcLoss = (type) => {
      const stakes = orderedStakes.filter((s) => s.type === type);
      const idx = stakes.findIndex((s) => s.step === step);
      if (idx === -1) return 0;
      return stakes.slice(idx + 1).reduce((sum, s) => sum + s.stake, 0);
    };

    const mainLoss = calcLoss("6-0");
    const zeroLoss = calcLoss("5-0");
    const oneLoss = calcLoss("5-1");

    setDeficit(mainLoss);
    setBaseDeficit((p) => p + mainLoss);
    setZeroDeficit((p) => p + zeroLoss);
    setOneDeficit((p) => p + oneLoss);

    clearForNext();
  };

  /* ================================================================
     NEXT GAME
  ================================================================ */
  const handleNextGame = async () => {
    if (!fixture || !isLoading) return;

    let nextBase = baseStake + deficit;
    let nextBaseDef = baseDeficit;
    let nextZeroDef = zeroDeficit + (isSmallTeamMatch ? zeroAmounts.winnerAmount : 0);
    let nextOneDef = oneDeficit + (isSmallTeamMatch ? oneAmounts.winnerAmount : 0);
    let nextBad = 0;

    /* Process special deficits */
    let nextSpecialDefs = { ...specialDeficits };

    specialKeys.forEach((key) => {
      let def = nextSpecialDefs[key];
      // Add current game stake to deficit if lost
      if (!pressedWins.has(key)) {
        def += specialStakes[key];
      }
      def = processLargeDeficit(key, def);
      nextSpecialDefs[key] = def;
    });

    /* Push large base deficit to baseStake if needed */
    if (nextBaseDef >= 1000) {
      // Similar logic can be extended if you want
    }

    setBaseStake(nextBase);
    setDeficit(0);
    setBaseDeficit(nextBaseDef);
    setZeroDeficit(nextZeroDef);
    setOneDeficit(nextOneDef);
    setSpecialDeficits(nextSpecialDefs);
    setBadGamesDeficit(nextBad);
    setSpecialStakes({ oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0 });

    setPressedWins(new Set());
    setJackpot(false);
    setFixture(null);
    setOrderedStakes([]);
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setIsSmallTeamMatch(false);
    setInputA("");
    setInputB("");
    setIsLoading(false);

    await saveAll();
  };

  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setOrderedStakes([]);
    setIsLoading(false);
    saveAll();
  };

  /* ── DISPLAY ── */
  const teamA = sanitizeTeam(inputA) || "HOME";
  const teamB = sanitizeTeam(inputB) || "AWAY";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white">
      {/* Desktop + Mobile UI (same as before, just updated buttons and stats) */}
      {/* ... I'll keep it compact — you can merge with your existing UI ... */}

      <div className="max-w-6xl mx-auto p-8">
        {/* Load inputs + buttons */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home" className="px-6 py-3 border-2 border-red-600 rounded-2xl" />
          <span className="text-3xl text-red-500 font-black self-center">VS</span>
          <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away" className="px-6 py-3 border-2 border-red-600 rounded-2xl" />
          <button onClick={handleLoadGame} disabled={isLoading} className="px-10 py-4 bg-red-600 font-bold rounded-2xl">LOAD</button>
          <button onClick={handleNextGame} disabled={!isLoading} className="px-10 py-4 bg-green-600 font-bold rounded-2xl">NEXT</button>
        </div>

        {/* Win Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <button onClick={handleJackpot} disabled={!fixture || jackpot} className="py-6 bg-yellow-400 text-black font-bold rounded-2xl">
            6–0 ({amounts.winnerAmount})
          </button>
          <button onClick={handleZeroJackpot} disabled={!fixture} className="py-6 bg-yellow-500 text-black font-bold rounded-2xl">
            5–0
          </button>
          <button onClick={handleOneJackpot} disabled={!fixture} className="py-6 bg-orange-400 text-black font-bold rounded-2xl">
            5–1
          </button>

          {specialKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleSpecialWin(key)}
              disabled={!fixture || specialStakes[key] === 0 || pressedWins.has(key)}
              className={`py-6 font-bold rounded-2xl transition ${pressedWins.has(key) ? "bg-green-500" : "bg-blue-600 hover:bg-blue-500"}`}
            >
              {specialLabels[key]}<br />({specialStakes[key] || "–"})
            </button>
          ))}

          {!isSmallTeamMatch && (
            <>
              <button onClick={() => resolveResult("H")} disabled={!fixture} className="py-6 bg-green-600 font-bold rounded-2xl"> {teamA} </button>
              <button onClick={() => resolveResult("D")} disabled={!fixture} className="py-6 bg-gray-500 font-bold rounded-2xl"> DRAW </button>
              <button onClick={() => resolveResult("A")} disabled={!fixture} className="py-6 bg-red-600 font-bold rounded-2xl"> {teamB} </button>
            </>
          )}
        </div>

        {/* Stats Panel */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center bg-black/30 p-6 rounded-2xl text-sm">
          <div>Base<br /><strong className="text-green-500">{baseStake}</strong></div>
          <div>Base Def<br /><strong className="text-orange-500">{baseDeficit}</strong></div>
          <div>5-0 Def<br /><strong className="text-yellow-500">{zeroDeficit}</strong></div>
          <div>5-1 Def<br /><strong className="text-yellow-400">{oneDeficit}</strong></div>
          <div>Bank<br /><strong className="text-emerald-500">{bank}</strong></div>
          <div>Bad Game<br /><strong className="text-pink-500">{badGamesDeficit}</strong></div>
          {specialKeys.map(k => (
            <div key={k}>{specialLabels[k]} Def<br /><strong className="text-purple-400">{specialDeficits[k]}</strong></div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Homepage;
