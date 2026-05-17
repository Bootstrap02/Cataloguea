
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds, smallOdds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

/* ── 19 opponent teams ── */
const TEAMS = [
  "ast","liv","bre","ars","new","wol","mnc","mnu","bur",
  "not","whu","ful","bou","tot","cry","eve","bha","sun","lee"
];

const TEAM_LABELS = {
  ast:"AST", liv:"LIV", bre:"BRE", ars:"ARS", new:"NEW",
  wol:"WOL", mnc:"MNC", mnu:"MNU", bur:"BUR", not:"NOT",
  whu:"WHU", ful:"FUL", bou:"BOU", tot:"TOT", cry:"CRY",
  eve:"EVE", bha:"BHA", sun:"SUN", lee:"LEE"
};

/* ── martingale chain order per team ── */
const CHAIN_KEYS = [
  "oneX","twoX","x2","zeroGoals","sixGoals",
  "ht12","ht21","ht30","ft40","ft41"
];

const CHAIN_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2",
  zeroGoals:"0 GOALS", sixGoals:"6 GOALS",
  ht12:"HT 1-2", ht21:"HT 2-1", ht30:"HT 3-0",
  ft40:"FT 4-0", ft41:"FT 4-1"
};

const TARGET_DEFAULT = 100;

/* ── helpers ── */
const defaultTeamDeficits = () => Object.fromEntries(TEAMS.map(t => [t, 0]));
const emptyGameStakes     = () => Object.fromEntries(CHAIN_KEYS.map(k => [k, 0]));

const Homepage = () => {
  /* ── INPUTS ── */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [isLoading,   setIsLoading]   = useState(false);

  /* ── ACTIVE FIXTURE ── */
  const [fixture,       setFixture]       = useState(null);
  const [activeTeam,    setActiveTeam]    = useState(null); // which of the 19
  const [isSmallMatch,  setIsSmallMatch]  = useState(false);
  const [pressedWins,   setPressedWins]   = useState(new Set());
  const [smallImpact,   setSmallImpact]   = useState(false); // first win happened

  /* ── PER-TEAM DEFICIT (persisted) ── */
  const [teamDeficits, setTeamDeficits] = useState(defaultTeamDeficits());

  /* ── PER-GAME EPHEMERAL ── */
  const [gameTarget,   setGameTarget]   = useState(0);   // target + deficit for this game
  const [gameShadow,   setGameShadow]   = useState(0);   // snapshot of gameTarget at load
  const [gameStakes,   setGameStakes]   = useState(emptyGameStakes());

  /* ── API ── */
  const teamDeficitsRef = useRef(teamDeficits);
  useEffect(() => { teamDeficitsRef.current = teamDeficits; }, [teamDeficits]);

  const fetchAll = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d = res.data || {};
      const loaded = {};
      TEAMS.forEach(t => { loaded[t] = d[`${t}Deficit`] ?? 0; });
      setTeamDeficits(loaded);
    } catch (err) { console.error("❌ Load:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveAll = async () => {
    try {
      const payload = {};
      TEAMS.forEach(t => { payload[`${t}Deficit`] = teamDeficitsRef.current[t]; });
      await axios.put(API_BASE, payload);
    } catch (err) { console.error("❌ Save:", err.message); }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ================================================================
     HANDLE LOAD
     ================================================================ */
  const handleLoadGame = (e) => {
    e.preventDefault();
    if (isLoading) return;

    const home = sanitizeTeam(inputA);
    const away = sanitizeTeam(inputB);

    /* Detect which of the 19 opponents is playing */
    let opponent = null;
    let found    = null;
    let isSmall  = false;

    /* Try smallOdds first */
    found = smallOdds.find(o => o.home === home && o.away === away);
    if (found) {
      isSmall  = true;
      opponent = TEAMS.includes(home) ? home : TEAMS.includes(away) ? away : null;
    } else {
      found = odds.find(o => o.home === home && o.away === away);
      if (found) {
        opponent = TEAMS.includes(home) ? home : TEAMS.includes(away) ? away : null;
      }
    }

    if (!found)    { alert(`No odds for ${home} vs ${away}`); return; }
    if (!opponent) { alert(`Neither ${home} nor ${away} is one of the 19 tracked opponents`); return; }

    setFixture(found);
    setActiveTeam(opponent);
    setIsSmallMatch(isSmall);
    setSmallImpact(false);
    setPressedWins(new Set());

    /* Base for this game = TARGET_DEFAULT + team's accumulated deficit */
    const teamDef  = teamDeficits[opponent] || 0;
    const target   = TARGET_DEFAULT + teamDef;
    setGameTarget(target);
    setGameShadow(target);

    /* Build martingale chain starting from target */
    let running = target;
    const stakes = {};
    CHAIN_KEYS.forEach(key => {
      const odd = found[key] || 0;
      if (odd > 1.01) {
        const stake = Math.max(Math.round(running / (odd - 1)), 10);
        stakes[key] = stake;
        running    += stake;
      } else {
        stakes[key] = 0;
      }
    });
    setGameStakes(stakes);
    setIsLoading(true);
  };

  /* ================================================================
     WIN HANDLER
     ================================================================ */
  const handleWin = (key) => {
    if (!fixture || !activeTeam) return;
    if (pressedWins.has(key)) return;
    setPressedWins(prev => new Set([...prev, key]));

    const snap = { ...gameStakes };
    const myIdx = CHAIN_KEYS.indexOf(key);

    /* Stakes AFTER this winner (still unpaid) */
    const afterKeys  = CHAIN_KEYS.slice(myIdx + 1);
    const afterTotal = afterKeys.reduce((s, k) => s + (snap[k] || 0), 0);

    /* Stakes BEFORE this winner */
    const beforeKeys  = CHAIN_KEYS.slice(0, myIdx);
    const beforeTotal = beforeKeys.reduce((s, k) => s + (snap[k] || 0), 0);

    if (!smallImpact) {
      /* ── FIRST WIN ──
         Residue = afterTotal (stakes still above that weren't covered)
         Push afterTotal + 100 into team deficit for next round */
      setTeamDeficits(prev => ({
        ...prev,
        [activeTeam]: afterTotal + TARGET_DEFAULT
      }));
      setSmallImpact(true);
    } else {
      /* ── SECOND WIN ──
         Total recovered = beforeTotal + gameShadow (original target)
         Subtract martingale still owed (afterTotal from first win = current teamDeficit - 100)
         Remainder: clear deficit, reset to target 100 */
      const currentDeficit = teamDeficits[activeTeam] || 0;
      const totalRecovered = beforeTotal + gameShadow;
      const residue        = totalRecovered - (currentDeficit - TARGET_DEFAULT);
      /* deficit resets to 0, target back to 100 */
      setTeamDeficits(prev => ({
        ...prev,
        [activeTeam]: residue > 0 ? 0 : Math.abs(residue)
      }));
    }
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNextGame = async () => {
    if (!fixture || !isLoading) return;

    /* If no win at all → push entire gameTarget (full chain) into team deficit */
    if (!smallImpact && activeTeam) {
      /* Sum of all chain stakes + target = total unpaid */
      const chainTotal = Object.values(gameStakes).reduce((s, v) => s + v, 0);
      const totalUnpaid = gameShadow + chainTotal;
      setTeamDeficits(prev => ({
        ...prev,
        [activeTeam]: totalUnpaid + TARGET_DEFAULT
      }));
    }

    /* Reset ephemeral state */
    setFixture(null);
    setActiveTeam(null);
    setIsSmallMatch(false);
    setSmallImpact(false);
    setPressedWins(new Set());
    setGameTarget(0);
    setGameShadow(0);
    setGameStakes(emptyGameStakes());
    setInputA(""); setInputB("");
    setIsLoading(false);

    await saveAll();
  };

  /* ── DERIVED ── */
  const opp = activeTeam ? TEAM_LABELS[activeTeam] : "OPP";

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-black to-slate-800 text-white">

      {/* ══ DESKTOP ══ */}
      <div className="max-lg:hidden px-6 py-10">
        <div className="flex items-center justify-center gap-6 mb-8 flex-wrap">
          <h1 className="text-4xl font-extrabold text-blue-400">Chelsea Opponent Tracker</h1>
          <button onClick={fetchAll} disabled={isReloading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-sm transition">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} />
            {isReloading ? "Reloading…" : "Reload"}
          </button>
        </div>

        <div className="max-w-7xl mx-auto space-y-8">

          {/* ── ACTIVE GAME ── */}
          {fixture && (
            <div className="bg-white text-gray-900 rounded-3xl shadow-2xl p-6">
              <div className="text-center mb-4">
                <span className="text-xl font-extrabold text-blue-600">{opp}</span>
                <span className="mx-2 text-gray-400">vs CHE</span>
                <span className="text-sm text-gray-500">Target: {gameTarget}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {CHAIN_KEYS.map(key => (
                  <button key={key} onClick={() => handleWin(key)}
                    disabled={!fixture || gameStakes[key] === 0 || pressedWins.has(key)}
                    className={`py-5 rounded-2xl font-bold text-sm transition active:scale-95 ${
                      pressedWins.has(key)
                        ? "bg-green-500 text-white"
                        : gameStakes[key] === 0
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-500"
                    }`}>
                    {CHAIN_LABELS[key]}<br />
                    <span className="text-xs opacity-80">({gameStakes[key] || "–"})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── INPUTS ── */}
          <div className="bg-white text-gray-900 rounded-3xl shadow-xl p-6">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <div className="flex items-center gap-4">
                <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home"
                  className="w-32 px-6 py-3 border-2 border-blue-400 rounded-2xl text-center text-lg" />
                <span className="font-black text-3xl text-blue-500">VS</span>
                <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away"
                  className="w-32 px-6 py-3 border-2 border-blue-400 rounded-2xl text-center text-lg" />
              </div>
              <div className="flex gap-4">
                <button onClick={handleLoadGame} disabled={isLoading}
                  className="px-10 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xl rounded-2xl">
                  LOAD
                </button>
                <button onClick={handleNextGame} disabled={!isLoading}
                  className="px-10 py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-extrabold text-xl rounded-2xl">
                  NEXT
                </button>
              </div>
            </div>
          </div>

          {/* ── 19-TEAM DEFICIT GRID ── */}
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {TEAMS.map(t => {
              const def    = teamDeficits[t] || 0;
              const target = TARGET_DEFAULT + def;
              const isActive = activeTeam === t;
              return (
                <div key={t} className={`rounded-2xl p-3 text-center border-2 transition ${
                  isActive
                    ? "border-blue-400 bg-blue-900/60"
                    : def > 0
                    ? "border-red-500/50 bg-red-900/20"
                    : "border-white/10 bg-white/5"
                }`}>
                  <div className="font-extrabold text-sm text-white">{TEAM_LABELS[t]}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Def: {def}</div>
                  <div className="text-[10px] text-blue-300">Tgt: {target}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ MOBILE ══ */}
      <div className="hidden max-lg:block px-3 py-6">
        <div className="flex items-center justify-center gap-3 mb-4">
          <h1 className="text-xl font-extrabold text-blue-400">CHE Opponent Tracker</h1>
          <button onClick={fetchAll} disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-xs rounded-xl transition disabled:opacity-50">
            <FiRefreshCw className={`w-3 h-3 ${isReloading ? "animate-spin" : ""}`} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>

        {/* Inputs */}
        <div className="flex gap-2 mb-3 justify-center items-center">
          <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home"
            className="flex-1 max-w-[105px] px-3 py-2.5 border border-blue-500 bg-transparent rounded-2xl text-center text-sm" />
          <span className="text-xl text-blue-400 font-black px-1">VS</span>
          <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away"
            className="flex-1 max-w-[105px] px-3 py-2.5 border border-blue-500 bg-transparent rounded-2xl text-center text-sm" />
        </div>

        <div className="flex gap-3 mb-4">
          <button onClick={handleLoadGame} disabled={isLoading}
            className="flex-1 py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-2xl text-sm font-bold transition">
            LOAD
          </button>
          <button onClick={handleNextGame} disabled={!isLoading}
            className="flex-1 py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-2xl text-sm font-bold transition">
            NEXT
          </button>
        </div>

        {/* Active game chain buttons */}
        {fixture && (
          <div className="mb-4">
            <div className="text-center text-xs mb-2 text-blue-300 font-bold">
              {opp} · Target: {gameTarget}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CHAIN_KEYS.map(key => (
                <button key={key} onClick={() => handleWin(key)}
                  disabled={!fixture || gameStakes[key] === 0 || pressedWins.has(key)}
                  className={`py-3 rounded-xl text-xs font-bold transition ${
                    pressedWins.has(key)
                      ? "bg-green-500 text-white"
                      : gameStakes[key] === 0
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-blue-700 text-white"
                  }`}>
                  {CHAIN_LABELS[key]}<br />
                  <span className="text-[10px]">({gameStakes[key] || "–"})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 19-team deficit grid */}
        <div className="grid grid-cols-4 gap-2">
          {TEAMS.map(t => {
            const def    = teamDeficits[t] || 0;
            const target = TARGET_DEFAULT + def;
            const isActive = activeTeam === t;
            return (
              <div key={t} className={`rounded-xl p-2 text-center border transition ${
                isActive
                  ? "border-blue-400 bg-blue-900/60"
                  : def > 0
                  ? "border-red-500/40 bg-red-900/20"
                  : "border-white/10 bg-white/5"
              }`}>
                <div className="font-extrabold text-[11px] text-white">{TEAM_LABELS[t]}</div>
                <div className="text-[9px] text-gray-400">D:{def}</div>
                <div className="text-[9px] text-blue-300">T:{target}</div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default Homepage;
