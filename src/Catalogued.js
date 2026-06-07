
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY   = "virt-epl-chain-v2";

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

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture,     setFixture]     = useState(null);

  /* ── WINNER (6-0) ── */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [deficit,     setDeficit]     = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);

  /* ── SINGLE CHAIN DEFICIT — all 13 assets pile into this ── */
  const [chainDeficit, setChainDeficit] = useState(0);
  const [shadow,       setShadow]       = useState(0);
  const [bank,         setBank]         = useState(0);

  /* ── WON ASSETS (removed from active chain) ── */
  const [wonAssets, setWonAssets] = useState([]);

  /* ── GAME STAKES (computed on submit) ── */
  // stakes[key] = stake for that asset this game
  const [chainStakes, setChainStakes] = useState({});
  // active order this game (ALL_ASSETS minus wonAssets)
  const [activeOrder, setActiveOrder] = useState([]);

  /* ── CLICKED / WINNERS THIS GAME ── */
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     PERSIST
     ================================================================ */
  const applyData = useCallback((d) => {
    setBaseStake(d.base         ?? 10000);
    setDeficit(d.deficit        ?? 0);
    setChainDeficit(d.chainDeficit ?? 0);
    setShadow(d.shadow          ?? 0);
    setBank(d.bank              ?? 0);
    setWonAssets(d.wonAssets    || []);
  }, []);

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
    const p = {
      base: baseRef.current, deficit, chainDeficit, shadow, bank, wonAssets,
      ...overrides,
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
    try { await axios.put(API_BASE, p); } catch (err) { console.error("❌", err.message); }
  }, [deficit, chainDeficit, shadow, bank, wonAssets]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  /* ================================================================
     BUILD CHAIN
     Pure single-deficit martingale line:
       running starts at chainDeficit
       each asset: stake = running / (odd - 1), running += stake
     So each asset recovers everything before it if it wins.
     ================================================================ */
  const buildChain = (found, cd, wonArr) => {
    const active = ALL_ASSETS.filter(k => !wonArr.includes(k));
    const stakes = {};
    let running = cd;

    active.forEach(key => {
      const odd = found[ASSET_ODD_KEY[key]] || 0;
      if (odd > 1.01) {
        stakes[key] = Math.round(running / (odd - 1));
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

    /* ── 6-0 winner stake → piles into chainDeficit ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);

    const curCD = chainDeficit + wStake;
    setChainDeficit(curCD);

    /* ── Build martingale chain from curCD ── */
    const { stakes, order } = buildChain(found, curCD, wonAssets);
    setChainStakes(stakes);
    setActiveOrder(order);
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
    setDeficit(0);
    setChainDeficit(0);
    setShadow(0);
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    let newCD     = chainDeficit;
    let newShadow = shadow;
    let newBank   = bank;
    let newWon    = [...wonAssets];
    let newDef    = deficit;
    let newBase   = baseStake;

    /* ── Wins: process in chain order ── */
    const winList = activeOrder.filter(k => winners.has(k));

    if (winList.length > 0) {
      winList.forEach((winKey, wi) => {
        const myIdx = activeOrder.indexOf(winKey);

        /* Before total = sum of stakes of assets BEFORE this one in chain */
        const beforeTotal = activeOrder
          .slice(0, myIdx)
          .reduce((s, k) => s + (chainStakes[k] || 0), 0);

        /* After total = sum of stakes of assets AFTER this one in chain */
        const afterTotal = activeOrder
          .slice(myIdx + 1)
          .reduce((s, k) => s + (chainStakes[k] || 0), 0);

        if (wi === 0) {
          /* First win: before total stays in chainDeficit (already lost),
             after total saved as shadow (recovered by this win) */
          newCD     = beforeTotal;
          newShadow = afterTotal;
        } else {
          /* Second+ win: previous shadow → bank */
          newBank  += newShadow;
          newShadow = afterTotal;
          newCD     = beforeTotal;
        }

        /* Mark asset as won */
        if (!newWon.includes(winKey)) newWon.push(winKey);
      });

    } else {
      /* No wins: all stakes pile into chainDeficit */
      const totalStaked = activeOrder.reduce((s, k) => s + (chainStakes[k] || 0), 0);
      newCD = chainDeficit + totalStaked;
    }

    /* Overflow: if chainDeficit >= 10000 → push to baseStake */
    if (newCD >= 10000) {
      newBase += newCD;
      newDef  += newCD;
      newCD    = 0;
    }

    /* All won → full reset */
    if (newWon.length === ALL_ASSETS.length) {
      newWon    = [];
      newCD     = 0;
      newShadow = 0;
    }

    setChainDeficit(newCD);
    setShadow(newShadow);
    setBank(newBank);
    setWonAssets(newWon);
    setDeficit(newDef);
    setBaseStake(newBase);

    setFixture(null); setInputA(""); setInputB("");
    setChainStakes({}); setActiveOrder([]);
    setWinners(new Set()); setClicked(new Set()); setWinnerStake(0);

    saveBase({
      base: newBase, deficit: newDef, chainDeficit: newCD,
      shadow: newShadow, bank: newBank, wonAssets: newWon,
    });
  };

  const teamA  = sanitizeTeam(inputA) || "HME";
  const teamB  = sanitizeTeam(inputB) || "AWY";
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
            {active.length} active · {wonAssets.length} dormant · chainDef: {chainDeficit}
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
            — single martingale · f0 → e0 → e1 → ... → 2-1 —
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {active.map((key, idx) => {
              const stake = chainStakes[key];
              const isWon = winners.has(key);
              return (
                <button key={key} onClick={() => markWin(key)}
                  disabled={!fixture || clicked.has(key)}
                  className={`py-3 rounded-xl font-black text-center transition active:scale-95 border-b-2 flex flex-col items-center gap-0.5 ${
                    isWon
                      ? "bg-green-500 text-white border-green-700"
                      : !fixture
                      ? "bg-slate-800/40 border-slate-950 opacity-25 cursor-not-allowed text-slate-500"
                      : "bg-purple-600 text-white border-purple-900"
                  }`}>
                  <div className="text-[8px] opacity-60 font-bold">#{idx + 1}</div>
                  <div className="text-xs font-black">{ASSET_LABELS[key]}</div>
                  <div className="text-sm font-black">{stake ?? "—"}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* DORMANT */}
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
            <span className="text-slate-400">Chain Def</span>
            <strong className="text-purple-400">{chainDeficit}</strong>
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
