
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY   = "virt-epl-chain-v1";

/* ── Martingale order ── */
const ALL_ASSETS = ["f0","e0","e1","4-2","3-3","1-3","0-3","2-3","0-4","1-4","2-4","12","21"];

const ASSET_LABELS = {
  "f0":"F0","e0":"E0","e1":"E1","4-2":"4-2","3-3":"3-3",
  "1-3":"1-3","0-3":"0-3","2-3":"2-3","0-4":"0-4",
  "1-4":"1-4","2-4":"2-4","12":"1-2","21":"2-1"
};

const ASSET_ODD_KEY = {
  "f0":"f0","e0":"e0","e1":"e1","4-2":"fourTwo","3-3":"threeThree",
  "1-3":"oneThree","0-3":"zeroThree","2-3":"twoThree","0-4":"zeroFour",
  "1-4":"oneFour","2-4":"twoFour","12":"oneTwo","21":"twoOne"
};

const OVERFLOW = 10000;

const emptyDefs = () => Object.fromEntries(ALL_ASSETS.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture,     setFixture]     = useState(null);

  /* ── WINNER ── */
  const [baseStake,    setBaseStake]    = useState(10000);
  const [baseDeficit,  setBaseDeficit]  = useState(0);
  const [deficit,      setDeficit]      = useState(0);   // shared chain deficit
  const [winnerStake,  setWinnerStake]  = useState(0);

  /* ── CHAIN STATE ── */
  const [privateDefs,  setPrivateDefs]  = useState(emptyDefs()); // per-asset private pile
  const [wonAssets,    setWonAssets]    = useState([]);           // removed from chain
  const [shadow,       setShadow]       = useState(0);            // first-win shadow
  const [bank,         setBank]         = useState(0);

  /* ── GAME STAKES (computed on submit) ── */
  const [chainStakes,  setChainStakes]  = useState({});   // { assetKey: stake }
  const [chainOrder,   setChainOrder]   = useState([]);   // active order this game

  /* ── CLICKED / WINNERS ── */
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     PERSIST
     ================================================================ */
  const applyData = useCallback((d) => {
    setBaseStake(d.base        ?? 10000);
    setBaseDeficit(d.baseDeficit ?? 0);
    setDeficit(d.deficit       ?? 0);
    setPrivateDefs(d.privateDefs || emptyDefs());
    setWonAssets(d.wonAssets   || []);
    setShadow(d.shadow         ?? 0);
    setBank(d.bank             ?? 0);
  }, []);

  const buildPayload = useCallback((overrides = {}) => ({
    base: baseRef.current, baseDeficit, deficit,
    privateDefs, wonAssets, shadow, bank,
    ...overrides,
  }), [baseDeficit, deficit, privateDefs, wonAssets, shadow, bank]);

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
    const p = buildPayload(overrides);
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
    try { await axios.put(API_BASE, p); } catch (err) { console.error("❌", err.message); }
  }, [buildPayload]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  /* ================================================================
     BUILD CHAIN STAKES
     Chain order = ALL_ASSETS minus wonAssets (in original order)
     Asset[0] stake = (deficit + privateDef[0]) / (odd - 1)
     Asset[1] stake = (deficit + privateDef[0] + stake[0] + privateDef[1]) / (odd - 1)
     i.e. running = deficit + sum of all privDefs and stakes before this asset
  ================================================================ */
  const buildChain = (found, def, privMap, wonArr) => {
    const active = ALL_ASSETS.filter(k => !wonArr.includes(k));
    const stakes = {};
    let running = def; // starts from shared deficit

    active.forEach(key => {
      const odd = found[ASSET_ODD_KEY[key]] || 0;
      const pd  = privMap[key] || 0;
      running += pd; // add this asset's private def to running
      if (odd > 1.01) {
        stakes[key] = Math.max(Math.round(running / (odd - 1)), 10);
        running += stakes[key];
      }
    });

    return { stakes, order: active };
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

    /* Winner stake */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);

    /* Add winner to deficit for chain calc */
    const curDef = deficit + wStake;
    setDeficit(curDef);

    const { stakes, order } = buildChain(found, curDef, privateDefs, wonAssets);
    setChainStakes(stakes);
    setChainOrder(order);
  };

  /* ── Mark win ── */
  const markWin = (key) => {
    if (!fixture || clicked.has(key) || wonAssets.includes(key)) return;
    setClicked(p => new Set([...p, key]));
    setWinners(p => new Set([...p, key]));
  };

  /* ── 6-0 jackpot ── */
  const handleJackpot = () => {
    setClicked(p => new Set([...p, "six"]));
    setBaseStake(10000);
    setBaseDeficit(0);
    setDeficit(0);
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    let newPriv    = { ...privateDefs };
    let newWon     = [...wonAssets];
    let newDef     = deficit;
    let newBase    = baseStake;
    let newBaseDef = baseDeficit;
    let newShadow  = shadow;
    let newBank    = bank;

    /* Process each win in chain order */
    const winList = chainOrder.filter(k => winners.has(k));

    winList.forEach((winKey, winIdx) => {
      const myIdx      = chainOrder.indexOf(winKey);
      const beforeKeys = chainOrder.slice(0, myIdx);
      const afterKeys  = chainOrder.slice(myIdx + 1);

      const beforeTotal = beforeKeys.reduce((s, k) => s + (chainStakes[k] || 0), 0);
      const afterTotal  = afterKeys.reduce((s, k)  => s + (chainStakes[k] || 0), 0);

      if (winIdx === 0) {
        /* First win: beforeTotal → deficit, afterTotal saved as shadow */
        newDef    = beforeTotal;
        newShadow = afterTotal;
        newBaseDef += beforeTotal;
      } else {
        /* Second+ win: shadow → bank */
        newBank  += newShadow;
        newShadow = afterTotal;
        newDef    = beforeTotal;
        newBaseDef += beforeTotal;
      }

      /* Clear winner's private def, push to wonAssets */
      newPriv[winKey] = 0;
      if (!newWon.includes(winKey)) newWon.push(winKey);
    });

    /* Non-winners: pile stakes into private defs */
    chainOrder.forEach(key => {
      if (winners.has(key)) return;
      newPriv[key] = (newPriv[key] || 0) + (chainStakes[key] || 0);

      /* Overflow check */
      if (newPriv[key] >= OVERFLOW) {
        newBase    += newPriv[key];
        newBaseDef += newPriv[key];
        newPriv[key] = 0;
      }
    });

    /* All assets won → reset */
    if (newWon.length === ALL_ASSETS.length) {
      newWon    = [];
      newPriv   = emptyDefs();
      newDef    = 0;
      newShadow = 0;
    }

    setPrivateDefs(newPriv);
    setWonAssets(newWon);
    setDeficit(newDef);
    setBaseStake(newBase);
    setBaseDeficit(newBaseDef);
    setShadow(newShadow);
    setBank(newBank);

    setFixture(null); setInputA(""); setInputB("");
    setChainStakes({}); setChainOrder([]);
    setWinners(new Set()); setClicked(new Set()); setWinnerStake(0);

    saveBase({
      base: newBase, baseDeficit: newBaseDef, deficit: newDef,
      privateDefs: newPriv, wonAssets: newWon, shadow: newShadow, bank: newBank,
    });
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";
  const active = ALL_ASSETS.filter(k => !wonAssets.includes(k));

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-black to-slate-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0 border-b border-white/5">
        <div>
          <h1 className="text-sm font-black text-slate-300 tracking-wider uppercase">⚡ Chain Matrix</h1>
          <div className="text-[9px] text-slate-500 mt-0.5">
            {active.length} active · {wonAssets.length} won
          </div>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button onClick={() => saveBase()}
            className="px-3 py-1.5 bg-emerald-600 font-bold text-white text-xs">💾</button>
          <button onClick={fetchBase} disabled={isReloading}
            className="px-3 py-1.5 bg-slate-800 font-bold text-white text-xs disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={11} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-3 pb-3 gap-3 overflow-y-auto">

        {/* 6-0 + NEXT */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={handleJackpot} disabled={!fixture}
            className={`py-4 rounded-2xl font-black text-sm transition active:scale-95 border-b-4 ${
              clicked.has("six") ? "bg-white text-emerald-600 border-emerald-300"
              : !fixture ? "bg-slate-900 border-slate-950 opacity-30 cursor-not-allowed"
              : "bg-yellow-400 text-black border-yellow-600"
            }`}>
            <div className="text-[10px] opacity-70 uppercase tracking-widest">6–0</div>
            <div className="text-xl font-black">{winnerStake || "—"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture}
            className={`py-4 rounded-2xl font-black text-sm transition active:scale-95 border-b-4 ${
              !fixture ? "bg-slate-900 border-slate-950 opacity-30 cursor-not-allowed text-white"
              : "bg-emerald-600 border-emerald-800 text-white"
            }`}>
            <div className="text-[10px] opacity-70 uppercase tracking-widest">settle</div>
            <div className="text-xl font-black">NEXT</div>
          </button>
        </div>

        {/* CHAIN GRID */}
        <div className="bg-slate-900/60 rounded-2xl p-2 border border-white/5">
          <div className="text-[8px] text-slate-500 text-center tracking-widest uppercase mb-2">
            — martingale chain · shared deficit: {deficit} —
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {active.map((key, idx) => {
              const stake  = chainStakes[key];
              const pd     = privateDefs[key] || 0;
              const isWon  = winners.has(key);
              return (
                <button key={key} onClick={() => markWin(key)}
                  disabled={!fixture || clicked.has(key)}
                  className={`py-3 rounded-xl font-black text-center transition active:scale-95 border-b-2 flex flex-col items-center ${
                    isWon
                      ? "bg-green-500 text-white border-green-700"
                      : !fixture
                      ? "bg-slate-800/40 border-slate-950 opacity-25 cursor-not-allowed text-slate-500"
                      : "bg-purple-600 text-white border-purple-900"
                  }`}>
                  <div className="text-[9px] opacity-70 font-bold">#{idx + 1}</div>
                  <div className="text-xs font-black">{ASSET_LABELS[key]}</div>
                  <div className="text-sm font-black mt-0.5">{stake ?? "—"}</div>
                  {pd > 0 && (
                    <div className="text-[7px] mt-0.5 px-1 bg-black/40 text-yellow-400 rounded font-bold">
                      D:{pd}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* WON */}
        {wonAssets.length > 0 && (
          <div className="bg-black/20 rounded-2xl p-2 border border-white/5">
            <div className="text-[8px] text-slate-500 text-center tracking-widest uppercase mb-1">— dormant —</div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {wonAssets.map(k => (
                <span key={k} className="px-2 py-1 rounded-lg text-[9px] font-bold text-white bg-slate-700 opacity-50">
                  {ASSET_LABELS[k]} ✓
                </span>
              ))}
            </div>
          </div>
        )}

        {/* INPUTS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-2.5 border border-slate-700 rounded-xl text-center text-sm bg-slate-900/60 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-bold uppercase" />
            <span className="font-black text-sm text-slate-600 shrink-0">VS</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-2.5 border border-slate-700 rounded-xl text-center text-sm bg-slate-900/60 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-bold uppercase" />
          </div>
          <button onClick={handleSubmit} disabled={!!fixture}
            className={`w-full py-3 font-black text-sm rounded-xl transition active:scale-95 uppercase tracking-widest ${
              fixture ? "bg-slate-900 text-slate-600 cursor-not-allowed opacity-40"
              : "bg-slate-100 text-black hover:bg-white"
            }`}>
            Calculate Setup
          </button>
        </div>

        {/* STATS */}
        <div className="bg-slate-900/80 rounded-xl p-3 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1.5 border border-white/5">
          <div className="flex justify-between">
            <span className="text-slate-400">Base</span>
            <strong className="text-emerald-400">{baseStake}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Deficit</span>
            <strong className="text-red-400">{deficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Base Def</span>
            <strong className="text-orange-400">{baseDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Shadow</span>
            <strong className="text-blue-300">{shadow}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Bank</span>
            <strong className="text-emerald-300">{bank}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Active</span>
            <strong className="text-purple-400">{active.length}/13</strong>
          </div>
          <div className="col-span-2 border-t border-white/5 pt-1.5 grid grid-cols-2 gap-1">
            {ALL_ASSETS.filter(k => !wonAssets.includes(k)).map(k => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-500">{ASSET_LABELS[k]}</span>
                <strong className="text-purple-400">{privateDefs[k]}</strong>
              </div>
            ))}
          </div>
          {fixture && (
            <div className="col-span-2 pt-1 border-t border-white/5 text-center font-black text-[9px] text-purple-400 uppercase tracking-widest">
              {teamA} ⚔️ {teamB}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Homepage;
