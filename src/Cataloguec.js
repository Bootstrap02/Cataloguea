
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

             <p> Hello </p>

    </div>
  );
};

export default Homepage;
