
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY   = "virt-epl-chain-v3";

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

  /* ── CHAIN DEFICIT ── */
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [shadow,       setShadow]       = useState(0); // captured at submit
  const [bank,         setBank]         = useState(0);

  /* ── GAME STAKES ── */
  const [chainStakes, setChainStakes] = useState({});

  /* ── WINNERS / CLICKED THIS GAME ── */
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     PERSIST
     ================================================================ */
  const applyData = useCallback((d) => {
    setBaseStake(d.base          ?? 10000);
    setDeficit(d.deficit         ?? 0);
    setSmallDeficit(d.smallDeficit ?? 0);
    setShadow(d.shadow           ?? 0);
    setBank(d.bank               ?? 0);
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
      base: baseRef.current, deficit,
      smallDeficit, shadow, bank,
      ...overrides,
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
    try { await axios.put(API_BASE, p); } catch (err) { console.error("❌", err.message); }
  }, [deficit, smallDeficit, shadow, bank]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  /* ================================================================
     BUILD CHAIN
     running starts at smallDeficit
     each asset: stake = running / (odd - 1), running += stake
     ================================================================ */
  const buildChain = (found, sd) => {
    const stakes = {};
    let running = sd;
    ALL_ASSETS.forEach(key => {
      const odd = found[ASSET_ODD_KEY[key]] || 0;
      if (odd > 1.01) {
        stakes[key] = Math.round(running / (odd - 1));
        running += stakes[key];
      }
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

    /* ── 6-0 winner stake ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);

    /* Shadow = smallDeficit BEFORE winner is added */
    setShadow(smallDeficit);

    const curSD = smallDeficit + wStake;
    setSmallDeficit(curSD);

    setChainStakes(buildChain(found, curSD));
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
    setShadow(0);
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    let newSD     = smallDeficit;
    let newShadow = shadow;
    let newBank   = bank;
    let newDef    = deficit;
    let newBase   = baseStake;

    const winList = ALL_ASSETS.filter(k => winners.has(k));

    if (winList.length === 0) {
      /* No wins — all stakes pile into smallDeficit */
      const totalStaked = ALL_ASSETS.reduce((s, k) => s + (chainStakes[k] || 0), 0);
      newSD = smallDeficit + totalStaked;

    } else {
      winList.forEach((winKey, wi) => {
        const myIdx = ALL_ASSETS.indexOf(winKey);

        const beforeTotal = ALL_ASSETS
          .slice(0, myIdx)
          .reduce((s, k) => s + (chainStakes[k] || 0), 0);

        const afterTotal = ALL_ASSETS
          .slice(myIdx + 1)
          .reduce((s, k) => s + (chainStakes[k] || 0), 0);

        if (wi === 0) {
          /* First win:
             afterTotal (stakes after winner) → pushed into smallDeficit
             beforeTotal already lost — gone */
          newSD = afterTotal;
        } else {
          /* Second+ win:
             beforeTotal of this winner + shadow → bank */
          newBank += beforeTotal + newShadow;
          newShadow = 0;
          newSD = afterTotal;
        }
      });
    }

    /* Overflow: smallDeficit >= 10000 → push to baseStake */
    if (newSD >= 10000) {
      newBase += newSD;
      newDef  += newSD;
      newSD    = 0;
    }

    setSmallDeficit(newSD);
    setShadow(newShadow);
    setBank(newBank);
    setDeficit(newDef);
    setBaseStake(newBase);

    setFixture(null); setInputA(""); setInputB("");
    setChainStakes({}); setWinners(new Set()); setClicked(new Set()); setWinnerStake(0);

    saveBase({
      base: newBase, deficit: newDef,
      smallDeficit: newSD, shadow: newShadow, bank: newBank,
    });
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

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
            smallDef: {smallDeficit} · shadow: {shadow} · bank: {bank}
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

        {/* CHAIN GRID — all 13 always visible */}
        <div className="bg-slate-900/60 rounded-2xl p-2 border border-white/5">
          <div className="text-[8px] text-slate-500 text-center tracking-widest uppercase mb-2">
            — martingale chain · f0 → ... → 2-1 —
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {ALL_ASSETS.map((key, idx) => {
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
            <span className="text-slate-400">SmallDef</span>
            <strong className="text-purple-400">{smallDeficit}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Shadow</span>
            <strong className="text-blue-300">{shadow}</strong>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-slate-400">Bank</span>
            <strong className="text-emerald-300">{bank}</strong>
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
