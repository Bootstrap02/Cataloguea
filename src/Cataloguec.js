
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

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

const CHAIN_KEYS = [
  "oneX","twoX","x2","zeroGoals","sixGoals",
  "ht12","ht21","ht30","ft40","ft41"
];

const CHAIN_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2",
  zeroGoals:"0G", sixGoals:"6G",
  ht12:"HT12", ht21:"HT21", ht30:"HT30",
  ft40:"FT40", ft41:"FT41"
};

const TARGET_DEFAULT = 100;

/* Per-team state shape */
const defaultTeamState = () =>
  Object.fromEntries(TEAMS.map(t => [t, {
    deficit: 0,
    target:  TARGET_DEFAULT,
    shadow:  0,
  }]));

const emptyGameStakes = () => Object.fromEntries(CHAIN_KEYS.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [isLoading,   setIsLoading]   = useState(false);

  /* ── FIXTURE ── */
  const [fixture,     setFixture]     = useState(null);
  const [activeTeam,  setActiveTeam]  = useState(null);
  const [pressedWins, setPressedWins] = useState(new Set());
  const [firstWinDone, setFirstWinDone] = useState(false);

  /* ── PER-TEAM STATE ── */
  const [teamState, setTeamState] = useState(defaultTeamState());

  /* ── ACTIVE GAME STAKES ── */
  const [gameStakes, setGameStakes] = useState(emptyGameStakes());

  /* ── REF FOR SAVE ── */
  const teamStateRef = useRef(teamState);
  useEffect(() => { teamStateRef.current = teamState; }, [teamState]);

  /* ── API ── */
  const fetchAll = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d   = res.data || {};
      const loaded = defaultTeamState();
      TEAMS.forEach(t => {
        loaded[t].deficit = d[`${t}_deficit`] ?? 0;
        loaded[t].target  = d[`${t}_target`]  ?? TARGET_DEFAULT;
        loaded[t].shadow  = d[`${t}_shadow`]  ?? 0;
      });
      setTeamState(loaded);
    } catch (err) { console.error("❌ Load:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveAll = async () => {
    try {
      const payload = {};
      TEAMS.forEach(t => {
        payload[`${t}_deficit`] = teamStateRef.current[t].deficit;
        payload[`${t}_target`]  = teamStateRef.current[t].target;
        payload[`${t}_shadow`]  = teamStateRef.current[t].shadow;
      });
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
    
    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";
    // Search by opponent team — user types just one team name (the opponent)
    // Find any fixture where that team appears as home or away against che
    const query = home || away; // use whichever input was filled
    const opponent = TEAMS.find(t => t === query);
    if (!opponent) { alert(`${query} is not one of the 19 tracked opponents`); return; }

    // Find fixture for this opponent (home or away)
    const found = odds.find(o =>
      (o.home === opponent && o.away === "che") ||
      (o.home === "che" && o.away === opponent)
    );

    if (!found) { alert(`No odds found for ${opponent}`); return; }

    const ts       = teamState[opponent];
    const base     = ts.target + ts.deficit; // this game's running start

    /* Build martingale chain from base */
    let running = base;
    const stakes = {};
    CHAIN_KEYS.forEach(key => {
      const odd = found[key] || 0;
      if (odd > 1.01) {
        stakes[key] = Math.max(Math.round(running / (odd - 1)), 10);
        running    += stakes[key];
      } else {
        stakes[key] = 0;
      }
    });

    /* Save shadow = base for this game */
    setTeamState(prev => ({
      ...prev,
      [opponent]: { ...prev[opponent], shadow: base }
    }));

    setFixture(found);
    setActiveTeam(opponent);
    setPressedWins(new Set());
    setFirstWinDone(false);
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

    const snap    = { ...gameStakes };
    const myIdx   = CHAIN_KEYS.indexOf(key);

    /* Stakes AFTER this winner */
    const afterTotal = CHAIN_KEYS.slice(myIdx + 1)
      .reduce((s, k) => s + (snap[k] || 0), 0);

    /* Stakes BEFORE this winner */
    const beforeTotal = CHAIN_KEYS.slice(0, myIdx)
      .reduce((s, k) => s + (snap[k] || 0), 0);

    const ts = teamState[activeTeam];

    if (!firstWinDone) {
      /* ── FIRST WIN ──
         Residue = afterTotal → push to deficit, target stays 100 */
      setTeamState(prev => ({
        ...prev,
        [activeTeam]: {
          ...prev[activeTeam],
          deficit: afterTotal,
          target:  TARGET_DEFAULT,
        }
      }));
      setFirstWinDone(true);
    } else {
      /* ── SECOND WIN ──
         beforeTotal + shadow covers what was owed (deficit).
         Subtract deficit from (beforeTotal + shadow) → if positive, deficit = 0.
         Target resets to 100. */
      const recovered = beforeTotal + ts.shadow;
      const newDeficit = Math.max(0, ts.deficit - recovered);
      setTeamState(prev => ({
        ...prev,
        [activeTeam]: {
          deficit: newDeficit,
          target:  TARGET_DEFAULT,
          shadow:  0,
        }
      }));
    }
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNextGame = async () => {
    if (!isLoading) return;

    if (activeTeam && !firstWinDone) {
      /* No win at all — full chain + base goes to deficit */
      const chainTotal = Object.values(gameStakes).reduce((s, v) => s + v, 0);
      const ts         = teamState[activeTeam];
      setTeamState(prev => ({
        ...prev,
        [activeTeam]: {
          deficit: ts.deficit + ts.shadow + chainTotal,
          target:  TARGET_DEFAULT,
          shadow:  0,
        }
      }));
    } else if (activeTeam) {
      /* Win happened — shadow clears */
      setTeamState(prev => ({
        ...prev,
        [activeTeam]: { ...prev[activeTeam], shadow: 0 }
      }));
    }

    setFixture(null);
    setActiveTeam(null);
    setPressedWins(new Set());
    setFirstWinDone(false);
    setGameStakes(emptyGameStakes());
    setInputA(""); setInputB("");
    setIsLoading(false);

    await saveAll();
  };

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
          <button onClick={saveAll}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 rounded-xl text-sm transition">
            💾 Save
          </button>
        </div>

        <div className="max-w-7xl mx-auto space-y-6">

          {/* Active game */}
          {fixture && activeTeam && (
            <div className="bg-white text-gray-900 rounded-3xl shadow-2xl p-6">
              <div className="text-center mb-4">
                <span className="text-2xl font-extrabold text-blue-600">{TEAM_LABELS[activeTeam]}</span>
                <span className="ml-3 text-sm text-gray-500">
                  Base: {teamState[activeTeam].target + teamState[activeTeam].deficit} &nbsp;|&nbsp;
                  Deficit: {teamState[activeTeam].deficit} &nbsp;|&nbsp;
                  Target: {teamState[activeTeam].target}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {CHAIN_KEYS.map(key => (
                  <button key={key} onClick={() => handleWin(key)}
                    disabled={gameStakes[key] === 0 || pressedWins.has(key)}
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

          {/* Inputs */}
          <div className="bg-white/5 rounded-3xl p-6">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <div className="flex items-center gap-4">
                <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Opponent (e.g. ars)"
                  className="w-48 px-6 py-3 border-2 border-blue-400 bg-transparent rounded-2xl text-center text-lg" />
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

          {/* 19-team grid */}
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-3">
            {TEAMS.map(t => {
              const ts       = teamState[t];
              const isActive = activeTeam === t;
              return (
                <div key={t} className={`rounded-2xl p-3 text-center border-2 transition ${
                  isActive           ? "border-blue-400 bg-blue-900/50" :
                  ts.deficit > 0     ? "border-red-500/50 bg-red-900/20" :
                                       "border-white/10 bg-white/5"
                }`}>
                  <div className="font-extrabold text-sm text-white">{TEAM_LABELS[t]}</div>
                  <div className="text-[10px] text-gray-400 mt-1">Def: {ts.deficit}</div>
                  <div className="text-[10px] text-blue-300">Tgt: {ts.target}</div>
                  {ts.shadow > 0 && <div className="text-[9px] text-orange-300">Shd: {ts.shadow}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══ MOBILE ══ */}
      <div className="hidden max-lg:block px-3 py-6">
        <div className="flex items-center justify-center gap-3 mb-4">
          <h1 className="text-lg font-extrabold text-blue-400">CHE Tracker</h1>
          <button onClick={fetchAll} disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-xs rounded-xl transition disabled:opacity-50">
            <FiRefreshCw className={`w-3 h-3 ${isReloading ? "animate-spin" : ""}`} />
            {isReloading ? "…" : "Reload"}
          </button>
          <button onClick={saveAll} className="px-3 py-1.5 bg-green-700 text-xs rounded-xl">💾</button>
        </div>

        <div className="flex gap-2 mb-3 justify-center items-center">
          <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Opponent (e.g. ars)"
            className="flex-1 max-w-[200px] px-3 py-2.5 border border-blue-500 bg-transparent rounded-2xl text-center text-sm" />
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

        {/* Active game */}
        {fixture && activeTeam && (
          <div className="mb-4 bg-white/5 rounded-2xl p-3">
            <div className="text-center text-sm font-bold text-blue-300 mb-2">
              {TEAM_LABELS[activeTeam]} &nbsp;·&nbsp;
              Base: {teamState[activeTeam].target + teamState[activeTeam].deficit} &nbsp;·&nbsp;
              Def: {teamState[activeTeam].deficit}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {CHAIN_KEYS.map(key => (
                <button key={key} onClick={() => handleWin(key)}
                  disabled={gameStakes[key] === 0 || pressedWins.has(key)}
                  className={`py-3 rounded-xl text-[10px] font-bold transition ${
                    pressedWins.has(key)
                      ? "bg-green-500 text-white"
                      : gameStakes[key] === 0
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-blue-700 text-white"
                  }`}>
                  {CHAIN_LABELS[key]}<br />
                  <span className="text-[9px]">({gameStakes[key] || "–"})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 19-team grid */}
        <div className="grid grid-cols-4 gap-2">
          {TEAMS.map(t => {
            const ts       = teamState[t];
            const isActive = activeTeam === t;
            return (
              <div key={t} className={`rounded-xl p-2 text-center border transition ${
                isActive       ? "border-blue-400 bg-blue-900/50" :
                ts.deficit > 0 ? "border-red-500/40 bg-red-900/20" :
                                  "border-white/10 bg-white/5"
              }`}>
                <div className="font-extrabold text-[11px] text-white">{TEAM_LABELS[t]}</div>
                <div className="text-[9px] text-gray-400">D:{ts.deficit}</div>
                <div className="text-[9px] text-blue-300">T:{ts.target}</div>
                {ts.shadow > 0 && <div className="text-[8px] text-orange-300">S:{ts.shadow}</div>}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default Homepage;
