
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY   = "virt-epl-helper-v1";

/* ── Martingale order ── */
const ASSET_KEYS = ["oneX","twoX","x2","tg0","tg6","ht12","ht21","ht30","ft40","ft41"];
const ASSET_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2", tg0:"TG0", tg6:"TG6",
  ht12:"HT12", ht21:"HT21", ht30:"HT30", ft40:"FT40", ft41:"FT41"
};
const ASSET_ODD_KEY = {
  oneX:"oneX", twoX:"twoX", x2:"x2", tg0:"tg0", tg6:"tg6",
  ht12:"ht12", ht21:"ht21", ht30:"ht30", ft40:"ft40", ft41:"ft41"
};
const ASSET_COLORS = {
  oneX:"bg-purple-600", twoX:"bg-pink-600", x2:"bg-lime-600",
  tg0:"bg-cyan-600", tg6:"bg-teal-600", ht12:"bg-blue-600",
  ht21:"bg-emerald-600", ht30:"bg-green-600", ft40:"bg-indigo-600", ft41:"bg-violet-600"
};

const emptyObj  = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));
const emptyArr  = () => Object.fromEntries(ASSET_KEYS.map(k => [k, []]));
// helpers: { assetKey: [helperKey, ...] }  — ordered list of helpers assigned to each loser

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture,      setFixture]     = useState(null);

  /* ── WINNER ── */
  const [baseStake,    setBaseStake]    = useState(10000);
  const [deficit,      setDeficit]      = useState(0);
  const [winnerStake,  setWinnerStake]  = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);

  /* ── WEEK ── */
  const [week, setWeek] = useState(1);

  /* ── ASSET STATE ── */
  // privateDef: accumulated loss per asset
  const [privateDef, setPrivateDef] = useState(emptyObj());
  // won: set of asset keys that have won this season
  const [wonAssets,  setWonAssets]  = useState([]);
  // helpers: map from loser-key → [helperKey, ...] in order
  const [helpers,    setHelpers]    = useState({});

  /* ── CURRENT GAME STAKES ── */
  const [gameStakes, setGameStakes] = useState(emptyObj());

  /* ── WINNERS THIS GAME ── */
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  /* ── BANK ── */
  const [bank, setBank] = useState(0);

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     PERSIST
     ================================================================ */
  const applyData = useCallback((d) => {
    setBaseStake(d.base        ?? 10000);
    setDeficit(d.deficit       ?? 0);
    setSmallDeficit(d.smallDeficit ?? 0);
    setWeek(d.week             ?? 1);
    setPrivateDef(d.privateDef || emptyObj());
    setWonAssets(d.wonAssets   || []);
    setHelpers(d.helpers       || {});
    setBank(d.bank             ?? 0);
  }, []);

  const buildPayload = useCallback(() => ({
    base: baseRef.current, deficit, smallDeficit, week,
    privateDef, wonAssets, helpers, bank,
  }), [deficit, smallDeficit, week, privateDef, wonAssets, helpers, bank]);

  const fetchBase = useCallback(async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) applyData(res.data);
    } catch {
      try { const s = localStorage.getItem(LS_KEY); if (s) applyData(JSON.parse(s)); } catch {}
    } finally { setIsReloading(false); }
  }, [applyData]);

  const saveBase = useCallback(async (overrides = {}) => {
    const p = { ...buildPayload(), ...overrides };
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
    try { await axios.put(API_BASE, p); } catch (err) { console.error("❌ save:", err.message); }
  }, [buildPayload]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  /* ================================================================
     HELPERS: given current won/loser state, assign helpers
     ================================================================
     Algorithm:
       losers = ASSET_KEYS not in wonAssets (in order)
       available helpers = wonAssets (in win order)
       First pass:  each loser gets 1 helper (round-robin)
       Second pass: each loser gets 2nd helper
       etc.
  ================================================================ */
  const assignHelpers = (wonArr) => {
    const losers    = ASSET_KEYS.filter(k => !wonArr.includes(k));
    const helpPool  = [...wonArr]; // helpers available in win order
    const map = {};
    losers.forEach(k => { map[k] = []; });
    if (losers.length === 0 || helpPool.length === 0) return map;

    let hi = 0;
    // Keep assigning helpers round-robin across losers until pool exhausted
    while (hi < helpPool.length) {
      for (let li = 0; li < losers.length && hi < helpPool.length; li++) {
        map[losers[li]].push(helpPool[hi]);
        hi++;
      }
    }
    return map;
  };

  /* ================================================================
     CALC STAKES
     ── For a loser: (smallDef + privateDef) / (odd-1)
     ── For a helper[0] of loser L:
           (smallDef + loserStake + loserPrivDef) / (odd-1)
     ── For a helper[1]:
           (smallDef + loserStake + helper0Stake + loserPrivDef) / (odd-1)
     etc.  (martingale chain: each helper recovers everything before it)
  ================================================================ */
  const buildGameStakes = (found, sd, privMap, wonArr, helpMap) => {
    const stakes = emptyObj();
    const losers = ASSET_KEYS.filter(k => !wonArr.includes(k));

    losers.forEach(loser => {
      const odd  = found[ASSET_ODD_KEY[loser]] || 0;
      const pd   = privMap[loser] || 0;
      if (odd > 1.01) {
        stakes[loser] = Math.max(Math.round((sd + pd) / (odd - 1)), 10);
      }

      /* Helpers form a martingale chain on top of loser's stake */
      let running = (sd + pd) + stakes[loser]; // loser recovered this
      const myHelpers = helpMap[loser] || [];
      myHelpers.forEach(hk => {
        const hodd = found[ASSET_ODD_KEY[hk]] || 0;
        if (hodd > 1.01) {
          stakes[hk] = Math.max(Math.round(running / (hodd - 1)), 10);
          running += stakes[hk];
        }
      });
    });

    return stakes;
  };

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";
    const found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    setFixture(found);
    setClicked(new Set());
    setWinners(new Set());

    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    const curSD = smallDeficit + wStake;
    setSmallDeficit(curSD);

    const helpMap = assignHelpers(wonAssets);
    setHelpers(helpMap);

    const stakes = buildGameStakes(found, curSD, privateDef, wonAssets, helpMap);
    setGameStakes(stakes);
  };

  /* ── Mark win ── */
  const markWin = (key) => {
    if (!fixture || clicked.has(key)) return;
    setClicked(p => new Set([...p, key]));
    setWinners(p => new Set([...p, key]));
  };

  /* ── 6-0 jackpot ── */
  const handleJackpot = () => {
    setClicked(p => new Set([...p, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    const newPriv = { ...privateDef };
    let newWon    = [...wonAssets];
    let newSD     = smallDeficit;
    let newBank   = bank;

    /* ── Settle each asset ── */
    ASSET_KEYS.forEach(key => {
      if (wonAssets.includes(key)) return; // already won previously, skip

      if (winners.has(key)) {
        /* This asset won → clear its privateDef, add to wonAssets */
        newPriv[key] = 0;
        if (!newWon.includes(key)) newWon.push(key);

        /* Martingale win logic:
           Find this asset's position in its group (loser or helper).
           Stakes before it in the chain are lost → pile into smallDeficit.
           Stakes after it are recovered → add to bank or smallDeficit credit. */
        const loserKey  = key; // if it's the lead loser
        const myHelpers = helpers[key] || [];
        const isHelper  = !ASSET_KEYS.filter(k => !wonAssets.includes(k)).includes(key)
                          || false;

        /* Determine chain for this group */
        // Find which loser this key belongs to (as lead or helper)
        let leadLoser = null;
        if (!wonAssets.includes(key) && !(Object.values(helpers).flat().includes(key))) {
          leadLoser = key; // it's a lead loser
        } else {
          // it's a helper — find its lead loser
          Object.entries(helpers).forEach(([loser, hArr]) => {
            if (hArr.includes(key)) leadLoser = loser;
          });
        }

        if (leadLoser !== null) {
          const chain = [leadLoser, ...(helpers[leadLoser] || [])];
          const myIdx = chain.indexOf(key);
          const beforeTotal = chain.slice(0, myIdx).reduce((s, k) => s + (gameStakes[k] || 0), 0);
          const afterTotal  = chain.slice(myIdx + 1).reduce((s, k) => s + (gameStakes[k] || 0), 0);

          /* Before total (already lost) → pile into privateDef of the loser for next game */
          if (beforeTotal > 0 && leadLoser !== key) {
            newPriv[leadLoser] = (newPriv[leadLoser] || 0) + beforeTotal;
          }
          /* After total (still need to recover) → push into smallDeficit */
          if (afterTotal > 0) newSD += afterTotal;
          /* If smallDef was cleared by this win → shadow → bank */
          else if (newSD === 0) { newBank += 0; /* future: shadow logic here */ }
        }

      } else {
        /* Lost → pile stake into privateDef */
        newPriv[key] = (newPriv[key] || 0) + (gameStakes[key] || 0);
      }
    });

    /* Helpers that won also clear their privateDef */
    ASSET_KEYS.forEach(key => {
      if (wonAssets.includes(key) && winners.has(key)) {
        newPriv[key] = 0;
      }
    });

    /* ── Week progression ── */
    let newWeek = week + 1;
    if (newWeek > 38) {
      newWeek  = 1;
      /* Reset: all assets back to solo, keep privateDefs */
      newWon   = [];
      /* Any remaining privateDef carries into next season */
    }

    const newHelpers = assignHelpers(newWon);

    setPrivateDef(newPriv);
    setWonAssets(newWon);
    setHelpers(newHelpers);
    setSmallDeficit(newSD);
    setBank(newBank);
    setWeek(newWeek);

    setFixture(null); setInputA(""); setInputB("");
    setGameStakes(emptyObj()); setWinners(new Set()); setClicked(new Set());
    setWinnerStake(0);

    saveBase({
      base: baseRef.current, deficit, smallDeficit: newSD, week: newWeek,
      privateDef: newPriv, wonAssets: newWon, helpers: newHelpers, bank: newBank,
    });
  };

  /* ================================================================
     RENDER HELPERS
     ================================================================ */
  const losers  = ASSET_KEYS.filter(k => !wonAssets.includes(k));
  const helpMap = helpers;

  /* Build display groups:
     Each "group" = { lead: loserKey, helpers: [helperKeys] } */
  const groups = losers.map(loser => ({
    lead: loser,
    helpersOf: helpMap[loser] || [],
  }));

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  const btnCls = (key, isWon) =>
    `py-3 rounded-xl font-bold text-[9px] transition active:scale-95 w-full shadow-sm border border-white/10 ${
      isWon ? "bg-green-500 text-white ring-2 ring-green-300"
      : !fixture ? `${ASSET_COLORS[key]} opacity-40 cursor-not-allowed text-white`
      : `${ASSET_COLORS[key]} text-white`
    }`;

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <h1 className="text-sm font-extrabold text-red-400">Virtual EPL</h1>
          <div className="flex gap-1.5 mt-0.5">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${week >= 35 ? "bg-red-500" : "bg-white/10"} text-white`}>
              WK {week}/38
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/10 text-white">
              {wonAssets.length}/10 WON
            </span>
          </div>
        </div>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={() => saveBase()} className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold">💾</button>
          <button onClick={fetchBase} disabled={isReloading}
            className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={10} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-3 pb-3 gap-2.5 overflow-y-auto">

        {/* 6-0 + NEXT */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 ${!fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-green-700 text-white"}`}>
            <div className="font-black">NEXT</div>
            <div className="text-[9px] opacity-70">settle + week</div>
          </button>
        </div>

        {/* GROUPS: each loser with its helpers */}
        {groups.map(({ lead, helpersOf }) => (
          <div key={lead} className="bg-black/20 rounded-2xl p-2 border border-white/5">
            {/* Lead loser */}
            <div className="text-[8px] text-gray-400 text-center tracking-widest mb-1">
              SD:{smallDeficit} + D:{privateDef[lead]}
            </div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${1 + helpersOf.length}, 1fr)` }}>
              {/* Lead button */}
              <button onClick={() => markWin(lead)} disabled={!fixture || clicked.has(lead)}
                className={btnCls(lead, winners.has(lead))}>
                <div className="font-black">{ASSET_LABELS[lead]}</div>
                <div className="mt-0.5">{gameStakes[lead] || "–"}</div>
                <div className="text-[7px] opacity-60">D:{privateDef[lead]}</div>
              </button>
              {/* Helper buttons */}
              {helpersOf.map((hk, i) => (
                <button key={hk} onClick={() => markWin(hk)} disabled={!fixture || clicked.has(hk)}
                  className={btnCls(hk, winners.has(hk))}>
                  <div className="font-black">{ASSET_LABELS[hk]}</div>
                  <div className="mt-0.5">{gameStakes[hk] || "–"}</div>
                  <div className="text-[7px] opacity-60">H{i+1}</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Won assets display */}
        {wonAssets.length > 0 && (
          <div className="bg-black/10 rounded-2xl p-2 border border-green-500/20">
            <div className="text-[8px] text-green-400 text-center tracking-widest mb-1">— WON THIS SEASON —</div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {wonAssets.map(k => (
                <span key={k} className={`px-2 py-1 rounded-lg text-[9px] font-bold text-white ${ASSET_COLORS[k]} opacity-70`}>
                  {ASSET_LABELS[k]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* INPUTS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
            <span className="font-black text-lg text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
          </div>
          <button onClick={handleSubmit} disabled={!!fixture}
            className={`w-full py-3 font-bold text-sm rounded-xl transition active:scale-95 ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
            CALCULATE
          </button>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">SmallDef</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="col-span-2 border-t border-white/10 pt-1.5 grid grid-cols-2 gap-1">
            {ASSET_KEYS.map(k => (
              <div key={k} className="flex justify-between">
                <span className={`${wonAssets.includes(k) ? "text-green-400" : "text-gray-500"}`}>
                  {ASSET_LABELS[k]}{wonAssets.includes(k) ? "✓" : ""}
                </span>
                <strong className="text-white">{privateDef[k]}</strong>
              </div>
            ))}
          </div>
          {fixture && (
            <div className="col-span-2 pt-1 border-t border-white/10 text-center font-bold text-[9px]">
              <span className="uppercase">{teamA}</span>
              <span className="text-gray-400 mx-1">vs</span>
              <span className="uppercase">{teamB}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
