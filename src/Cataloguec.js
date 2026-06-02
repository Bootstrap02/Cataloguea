

import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const ASSET_KEYS = ["oneX","twoX","x2","tg0","tg6","ht12","ht21","ht30","ft40","ft41"];
const ASSET_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2", tg0:"Tg0", tg6:"Tg6 ",
  ht12:"HT12", ht21:"HT21", ht30:"HT30", ft40:"FT40", ft41:"FT41"
};
const ASSET_ODD_KEY = {
  oneX:"oneX", twoX:"twoX", x2:"x2", tg0:"tg0", tg6:"tg6",
  ht12:"ht12", ht21:"ht21", ht30:"ht30", ft40:"ft40", ft41:"ft41"
};
const LEVEL_COLORS = [
  "bg-gray-600", "bg-purple-600", "bg-blue-600", "bg-cyan-600", 
  "bg-emerald-600", "bg-orange-600", "bg-red-600",
];

const MAX_LEVEL = 7;
const WIN_LIMIT = 18;

const emptyPerAsset = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 0]));
const defaultLevels = () => Object.fromEntries(ASSET_KEYS.map(k => [k, 1]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  const [baseStake, setBaseStake] = useState(10000);
  const [deficit, setDeficit] = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [bankDeposit, setBankDeposit] = useState(0);

  const [week, setWeek] = useState(1);
  const [winCount, setWinCount] = useState(0);
  const [paused, setPaused] = useState(false);

  const [assetLevels, setAssetLevels] = useState(defaultLevels());
  const [privDefs, setPrivDefs] = useState(emptyPerAsset());

  const [total1, setTotal1] = useState(0);
  const [total2, setTotal2] = useState(0);
  const [total3, setTotal3] = useState(0);
  const [total4, setTotal4] = useState(0);
  const [total5, setTotal5] = useState(0);
  const [total6, setTotal6] = useState(0);
  const [grandDeficit, setGrandDeficit] = useState(0);

  const [gameStakes, setGameStakes] = useState(emptyPerAsset());
  const [winners, setWinners] = useState(new Set());
  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  const LS_KEY = "virt-epl-7level";

  const applyData = useCallback((d) => {
    setBaseStake(d.base ?? 10000);
    setDeficit(d.deficit ?? 0);
    setSmallDeficit(d.smallDeficit ?? 0);
    setWeek(d.week ?? 1);
    setWinCount(d.winCount ?? 0);
    setPaused(d.paused ?? false);
    setAssetLevels(d.assetLevels || defaultLevels());
    setPrivDefs(d.privDefs || emptyPerAsset());
    setTotal1(d.total1 ?? 0);
    setTotal2(d.total2 ?? 0);
    setTotal3(d.total3 ?? 0);
    setTotal4(d.total4 ?? 0);
    setTotal5(d.total5 ?? 0);
    setTotal6(d.total6 ?? 0);
    setGrandDeficit(d.grandDeficit ?? 0);
    setBankDeposit(d.bankDeposit ?? 0);
  }, []);

  const fetchBase = useCallback(async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data) applyData(res.data);
    } catch (err) {
      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) applyData(JSON.parse(saved));
      } catch (_) {}
    } finally { setIsReloading(false); }
  }, [applyData]);

  const saveBase = useCallback(async (overrides = {}) => {
    const payload = {
      base: baseRef.current,
      deficit, smallDeficit, week, winCount, paused,
      assetLevels, privDefs, total1, total2, total3,
      total4, total5, total6, grandDeficit, bankDeposit,
      ...overrides
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch (_) {}
    try { await axios.put(API_BASE, payload); }
    catch (err) { console.error("❌ save:", err.message); }
  }, [deficit, smallDeficit, week, winCount, paused, assetLevels, privDefs, total1, total2, total3, total4, total5, total6, grandDeficit, bankDeposit]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  const calcStake = (key, found, levels, priv, sd, t1, t2, t3, t4, t5, t6, gd) => {
    const odd = found[ASSET_ODD_KEY[key]] || 0;
    if (odd <= 1.01) return 0;
    const lv = levels[key];
    const pd = priv[key] || 0;
    const ts = [0, sd, t1, t2, t3, t4, t5];
    let target = (lv === 7) ? (t6 + gd + pd) : ((ts[lv] || 0) + pd);
    return Math.max(Math.round(target / (odd - 1)), 10);
  };

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
    const nextSDValue = smallDeficit + wStake;

    let nt1 = 0, nt2 = 0, nt3 = 0, nt4 = 0, nt5 = 0, nt6 = 0;
    ASSET_KEYS.forEach(k => {
      const lv = assetLevels[k];
      const val = privDefs[k] || 0;
      if (lv === 1) nt1 += val;
      else if (lv === 2) nt2 += val;
      else if (lv === 3) nt3 += val;
      else if (lv === 4) nt4 += val;
      else if (lv === 5) nt5 += val;
      else if (lv === 6) nt6 += val;
    });

    setSmallDeficit(nextSDValue);
    setTotal1(nt1); setTotal2(nt2); setTotal3(nt3);
    setTotal4(nt4); setTotal5(nt5); setTotal6(nt6);

    const newStakes = emptyPerAsset();
    if (!paused) {
      ASSET_KEYS.forEach(key => {
        newStakes[key] = calcStake(
          key, found, assetLevels, privDefs,
          nextSDValue, nt1, nt2, nt3, nt4, nt5, nt6, grandDeficit
        );
      });
    }
    setGameStakes(newStakes);
  };

  const markWin = (key) => {
    if (!fixture || clicked.has(key) || paused) return;
    setClicked(p => new Set([...p, key]));
    setWinners(p => new Set([...p, key]));
  };

  const handleJackpot = () => {
    setClicked(p => new Set([...p, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  const handleNext = () => {
    if (!fixture) return;

    const newPriv = { ...privDefs };
    const newLevels = { ...assetLevels };
    let newSD = smallDeficit;
    let bank = bankDeposit || 0;
    let newWinCount = winCount;
    
    const nt1 = total1; const nt2 = total2; const nt3 = total3;
    const nt4 = total4; const nt5 = total5; const nt6 = total6;

    let sdShadow = null;
    let tShadows = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };

    // Set of assets that are "cleared" by a higher level win
    // These assets will end the round with ONLY their current stake as debt.
    const clearedByHigherWin = new Set();

    winners.forEach(winKey => {
      const winLv = newLevels[winKey];
      const target = winLv - 1;

      if (winLv === 1) {
        if (sdShadow === null) { sdShadow = newSD; newSD = 0; } 
        else { bank += sdShadow; }
      } else if (target >= 1 && target <= 6) {
        ASSET_KEYS.forEach(k => {
          if (newLevels[k] === target) clearedByHigherWin.add(k);
        });

        let currentTargetVal = 0;
        if (target === 1) currentTargetVal = nt1;
        else if (target === 2) currentTargetVal = nt2;
        else if (target === 3) currentTargetVal = nt3;
        else if (target === 4) currentTargetVal = nt4;
        else if (target === 5) currentTargetVal = nt5;
        else if (target === 6) currentTargetVal = nt6;

        if (tShadows[target] === null) { tShadows[target] = currentTargetVal; } 
        else { bank += tShadows[target]; }
      }
    });

    ASSET_KEYS.forEach(key => {
      const won = winners.has(key);
      const lv = newLevels[key];
      const stake = gameStakes[key] || 0;

      if (won) {
        newWinCount++;
        newPriv[key] = 0; 
        if (lv < MAX_LEVEL) newLevels[key] = lv + 1;
      } else if (clearedByHigherWin.has(key)) {
        // Asset lost, but its history was cleared by a higher win.
        // It keeps ONLY its current stake.
        newPriv[key] = stake;
      } else {
        // Standard loss: add current stake to existing debt.
        newPriv[key] += stake;
      }
    });

    let nextWk = week + 1;
    let finalWinCount = newWinCount;
    let finalPaused = paused;

    if (nextWk > 38) {
      nextWk = 1; finalWinCount = 0; finalPaused = false;
    } else if (newWinCount >= WIN_LIMIT) {
      finalPaused = true;
    }

    setSmallDeficit(newSD);
    setPrivDefs(newPriv);
    setAssetLevels(newLevels);
    setBankDeposit(bank);
    setWinCount(finalWinCount);
    setWeek(nextWk);
    setPaused(finalPaused);

    setFixture(null);
    setInputA(""); setInputB("");
    setGameStakes(emptyPerAsset());
    
    saveBase({
      smallDeficit: newSD,
      privDefs: newPriv,
      assetLevels: newLevels,
      bankDeposit: bank,
      winCount: finalWinCount,
      week: nextWk,
      paused: finalPaused
    });
  };

  const byLevel = {};
  ASSET_KEYS.forEach(key => {
    const lv = assetLevels[key];
    if (!byLevel[lv]) byLevel[lv] = [];
    byLevel[lv].push(key);
  });

  const levelTargetLabel = (lv) => {
    const ts = [0, smallDeficit, total1, total2, total3, total4, total5, total6];
    if (lv === 7) return `T6:${total6}+G:${grandDeficit}`;
    const labels = ["", "SD", "T1", "T2", "T3", "T4", "T5"];
    return `${labels[lv]}:${ts[lv]}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <h1 className="text-sm font-extrabold text-red-400">Virtual EPL</h1>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/10">WK {week}/38</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${paused ? "bg-yellow-400 text-black" : "bg-white/10"}`}>
              {winCount}/{WIN_LIMIT} W
            </span>
          </div>
        </div>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={() => saveBase()} className="px-3 py-1.5 bg-green-600 font-bold text-white text-xs">💾</button>
          <button onClick={fetchBase} disabled={isReloading} className="px-3 py-1.5 bg-red-600 font-bold text-white text-xs">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={10} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-3 pb-3 gap-2.5 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleJackpot} className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture} className="py-4 rounded-2xl font-extrabold text-sm bg-green-700 text-white">
            <div className="font-black">NEXT</div>
          </button>
        </div>

        {[1,2,3,4,5,6,7].map(lv => {
          const keys = byLevel[lv];
          if (!keys || keys.length === 0) return null;
          return (
            <div key={lv}>
              <div className="text-[8px] text-gray-400 text-center tracking-widest mb-1">— L{lv} · {levelTargetLabel(lv)} —</div>
              <div className="grid grid-cols-5 gap-1.5">
                {keys.map(key => (
                  <button key={key} onClick={() => markWin(key)} disabled={!fixture || paused || clicked.has(key)}
                    className={`py-3 rounded-xl font-bold text-[9px] transition active:scale-95 w-full ${winners.has(key) ? "bg-green-500 text-white ring-2 ring-green-300" : LEVEL_COLORS[lv-1] + " text-white"}`}>
                    <div className="font-black">{ASSET_LABELS[key]}</div>
                    <div className="mt-0.5">{gameStakes[key] || "–"}</div>
                    <div className="text-[7px] opacity-60">D:{privDefs[key]}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="Home" className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white" />
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="Away" className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white" />
          </div>
          <button onClick={handleSubmit} disabled={!!fixture} className="w-full py-3 font-bold text-sm rounded-xl bg-red-700 text-white">CALCULATE</button>
        </div>

        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">SmallDef</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-pink-400">{bankDeposit}</strong></div>
          <div className="col-span-2 border-t border-white/10 pt-1 grid grid-cols-3 gap-1">
            {[total1,total2,total3,total4,total5,total6].map((t,i) => (
              <div key={i} className="flex justify-between"><span className="text-gray-500">T{i+1}</span><strong className="text-orange-300">{t}</strong></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
