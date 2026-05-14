
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const specialKeys = [
  "oneX", "twoX", "x2", "zeroGoals", "sixGoals",
  "ht12", "ht21", "ht30", "ft40", "ft41",
];

const specialLabels = {
  oneX: "1X", twoX: "2X", x2: "X2",
  zeroGoals: "0 GOALS", sixGoals: "6 GOALS",
  ht12: "HT 1-2", ht21: "HT 2-1", ht30: "HT 3-0",
  ft40: "FT 4-0", ft41: "FT 4-1",
};

const emptySpecial = () => ({
  oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
  ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
});

const emptyDeficits = () => ({
  oneX: 0, twoX: 0, x2: 0, zeroGoals: 0, sixGoals: 0,
  ht12: 0, ht21: 0, ht30: 0, ft40: 0, ft41: 0,
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

  /* ── NORMAL GAME STATE ── */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [baseDeficit, setBaseDeficit] = useState(0);
  const [deficit,     setDeficit]     = useState(0);
  const [zeroDeficit, setZeroDeficit] = useState(0);
  const [oneDeficit,  setOneDeficit]  = useState(0);
  const baseRef = useRef(10000);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ── NORMAL STAKES ── */
  const [amounts,     setAmounts]     = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [zeroAmounts, setZeroAmounts] = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [oneAmounts,  setOneAmounts]  = useState({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ── SMALL ODDS STATE ── */
  const [smallDeficit, setSmallDeficit] = useState(0);           // Shared small deficit (from winner stake)
  const [privateDeficits, setPrivateDeficits] = useState(emptyDeficits()); // Per asset
  const [gameStakes, setGameStakes] = useState({ winner: 0, ...emptySpecial() });

  /* ── SMALL ODDS: 5-0 / 5-1 ── */
  const [smallZeroStake, setSmallZeroStake] = useState(0);
  const [smallOneStake,  setSmallOneStake]  = useState(0);

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
      setSmallDeficit(d.smallDeficit ?? 0);
      setPrivateDeficits(d.privateDeficits ?? emptyDeficits());
    } catch (err) { console.error("❌ Load:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveAll = async () => {
    try {
      await axios.put(API_BASE, {
        base: Math.max(10000, baseRef.current),
        baseDeficit, zeroDeficit, oneDeficit,
        smallDeficit,
        privateDeficits,
      });
    } catch (err) { console.error("❌ Save:", err.message); }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ── LADDER BUILDER (unchanged) ── */
  const buildLadder = (startTotal, type, code, oddsMap) => {
    let running = startTotal;
    const ladder = [];
    let H = 0, D = 0, A = 0;
    for (const step of code) {
      const odd = oddsMap[step];
      if (!odd || odd <= 1.01) continue;
      let stake = Math.round(running / (odd - 1));
      ladder.push({ step, stake, type });
      if (step === "H") H = stake;
      if (step === "D") D = stake;
      if (step === "A") A = stake;
      running += stake;
    }
    return { ladder, H, D, A };
  };

  /* ================================================================
     HANDLE LOAD GAME
     ================================================================ */
  const handleLoadGame = (e) => {
    e.preventDefault();
    if (isLoading) return;

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    let found = smallOdds.find((o) => o.home === home && o.away === away);
    const isSmall = !!found;
    if (!isSmall) found = odds.find((o) => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    setFixture(found);
    setIsSmallTeamMatch(isSmall);
    setPressedWins(new Set());
    setJackpot(false);
    setOrderedStakes([]);

    const oddsMap = { H: found.win, D: found.draw, A: found.lose };
    const code = found.code || "";

    /* ── 6-0 winner stake ── */
    const newBase6 = baseStake + deficit;
    setBaseStake(newBase6);
    setDeficit(0);
    const winnerAmt = Math.max(Math.round(newBase6 / found.winner), 10);

    if (!isSmall) {
      // Normal game (unchanged)
      const r6  = buildLadder(winnerAmt, "6-0", code, oddsMap);
      const r50 = buildLadder(Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10), "5-0", code, oddsMap);
      const r51 = buildLadder(Math.max(Math.round((baseDeficit + oneDeficit) / found.fiveOne), 10), "5-1", code, oddsMap);

      setOrderedStakes([...r6.ladder, ...r50.ladder, ...r51.ladder]);
      setAmounts({ winnerAmount: winnerAmt, homeAmount: r6.H, drawAmount: r6.D, awayAmount: r6.A });
      setZeroAmounts({ winnerAmount: Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10), homeAmount: r50.H, drawAmount: r50.D, awayAmount: r50.A });
      setOneAmounts({ winnerAmount: Math.max(Math.round((baseDeficit + oneDeficit) / found.fiveOne), 10), homeAmount: r51.H, drawAmount: r51.D, awayAmount: r51.A });
      setIsLoading(true);
      return;
    }

    /* ── SMALL TEAM GAME ── */
    setAmounts({ winnerAmount: winnerAmt, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    // 5-0 and 5-1 remain the same
    const sz = Math.max(Math.round((baseDeficit + zeroDeficit) / found.fiveZero), 10);
    setSmallZeroStake(sz);
    setZeroAmounts({ winnerAmount: sz, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    const so = Math.max(Math.round((baseDeficit + oneDeficit) / found.fiveOne), 10);
    setSmallOneStake(so);
    setOneAmounts({ winnerAmount: so, homeAmount: 0, drawAmount: 0, awayAmount: 0 });

    // Add winner stake to shared smallDeficit
    const newSmallDef = smallDeficit + winnerAmt;
    setSmallDeficit(newSmallDef);

    // Build independent stakes for each special asset
    const newGameStakes = { winner: winnerAmt };
    const newStakesForDisplay = { ...emptySpecial() };

    specialKeys.forEach((key) => {
      const odd = found[key] || 0;
      if (odd > 1.01) {
        const totalForThisAsset = (privateDeficits[key] || 0) + newSmallDef;
        const stake = Math.max(Math.round(totalForThisAsset / (odd - 1)), 10);
        newGameStakes[key] = stake;
        newStakesForDisplay[key] = stake;
      } else {
        newGameStakes[key] = 0;
      }
    });

    setGameStakes(newGameStakes);
    setIsLoading(true);
  };

  /* ================================================================
     SPECIAL WIN (Independent per asset)
     ================================================================ */
  const handleSpecialWin = (type) => {
    if (!fixture || !isSmallTeamMatch || gameStakes[type] === 0 || pressedWins.has(type)) return;

    setPressedWins((prev) => new Set([...prev, type]));

    // Clear this asset's private deficit
    setPrivateDeficits(prev => ({ ...prev, [type]: 0 }));

    // Clear shared small deficit on any win
    setSmallDeficit(0);
  };

  /* ── 6-0 WIN ── */
  const handleJackpot = () => {
    if (!fixture) return;
    setJackpot(true);
    setDeficit(0);
    setBaseStake(10000);
    setBaseDeficit(0);
    if (isSmallTeamMatch) {
      setSmallDeficit(0);
      setPrivateDeficits(emptyDeficits());
    }
  };

  /* ── 5-0 / 5-1 unchanged ── */
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
     HANDLE NEXT GAME
     ================================================================ */
  const handleNextGame = async () => {
    if (!fixture || !isLoading) return;

    let nextBase = baseStake + deficit;
    let nextBaseDeficit = baseDeficit;
    let nextZeroDef = zeroDeficit;
    let nextOneDef = oneDeficit;
    let nextSmallDef = smallDeficit;
    let nextPrivate = { ...privateDeficits };

    if (isSmallTeamMatch) {
      // Push 5-0/5-1 stakes into deficits
      nextZeroDef += smallZeroStake;
      nextOneDef += smallOneStake;

      // Accumulate losses into private deficits for each asset
      specialKeys.forEach(key => {
        if (gameStakes[key] > 0) {
          nextPrivate[key] = (nextPrivate[key] || 0) + gameStakes[key];
        }
      });

      // If any private deficit >= 1000, roll it into base
      Object.keys(nextPrivate).forEach(key => {
        if (nextPrivate[key] >= 1000) {
          nextBase += nextPrivate[key];
          nextBaseDeficit += nextPrivate[key];
          nextPrivate[key] = 0;
        }
      });

      // Keep remaining smallDeficit
      nextSmallDef = smallDeficit; // winner stake was already added on load
    }

    // Persist
    setBaseStake(nextBase);
    setDeficit(0);
    setBaseDeficit(nextBaseDeficit);
    setZeroDeficit(nextZeroDef);
    setOneDeficit(nextOneDef);
    setSmallDeficit(nextSmallDef);
    setPrivateDeficits(nextPrivate);

    // Reset UI
    setSmallZeroStake(0);
    setSmallOneStake(0);
    setGameStakes({ winner: 0, ...emptySpecial() });
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

  /* ── CLEAR (normal game) ── */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setOrderedStakes([]);
    setAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setZeroAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setOneAmounts({ winnerAmount: 0, homeAmount: 0, drawAmount: 0, awayAmount: 0 });
    setIsLoading(false);
    saveAll();
  };

  /* ── DERIVED ── */
  const teamA = sanitizeTeam(inputA) || "HOME";
  const teamB = sanitizeTeam(inputB) || "AWAY";

  const displayAmounts = {
    homeAmount: amounts.homeAmount + zeroAmounts.homeAmount + oneAmounts.homeAmount,
    drawAmount: amounts.drawAmount + zeroAmounts.drawAmount + oneAmounts.drawAmount,
    awayAmount: amounts.awayAmount + zeroAmounts.awayAmount + oneAmounts.awayAmount,
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white">
      {/* Desktop & Mobile UI unchanged except adding private deficits display if needed */}
      {/* ... (keep your existing UI structure) ... */}

      {/* Example: Add private deficits to the stats grid if you want visibility */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center font-mono text-sm bg-black/10 p-6 rounded-2xl">
        <div>Base<br /><strong className="text-green-600">{baseStake}</strong></div>
        <div>Deficit<br /><strong className="text-red-600">{deficit}</strong></div>
        <div>Base Def<br /><strong className="text-orange-600">{baseDeficit}</strong></div>
        <div>5-0 Def<br /><strong className="text-yellow-600">{zeroDeficit}</strong></div>
        <div>5-1 Def<br /><strong className="text-yellow-500">{oneDeficit}</strong></div>
        <div>Small Def<br /><strong className="text-purple-600">{smallDeficit}</strong></div>
        {specialKeys.slice(0, 3).map(k => (
          <div key={k}>{specialLabels[k]}<br /><strong className="text-pink-500">{privateDeficits[k]}</strong></div>
        ))}
        <div>Bank / Others...</div>
      </div>

      {/* Rest of your UI (buttons, inputs, etc.) remains the same */}
    </div>
  );
};

export default Homepage;
