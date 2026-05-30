
import React, { useState, useEffect, useRef } from "react";
import { FiRefreshCw } from "react-icons/fi";

/* ── CONFIGURATION & DATA ── */
export const odds = [
  { id: "livmnu", home: "liv", away: "mnu", winner: 327, oneX: 14.8, twoX: 14.8, x1: 6, zeroGoals: 15, sixGoals: 17.3, ht11: 6.8, ht21: 13.4, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livnew", home: "liv", away: "new", winner: 327, oneX: 14.8, twoX: 14.8, x1: 6, zeroGoals: 15, sixGoals: 17.3, ht11: 6.8, ht21: 13.4, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livche", home: "liv", away: "che", winner: 327, oneX: 14.8, twoX: 14.8, x1: 6, zeroGoals: 15, sixGoals: 17.3, ht11: 6.8, ht21: 13.4, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "mnuliv", home: "mnu", away: "liv", winner: 1140, oneX: 15.7, twoX: 15.7, x1: 6, zeroGoals: 12.9, sixGoals: 22, ht11: 6.8, ht21: 16.4, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "newliv", home: "new", away: "liv", winner: 1140, oneX: 15.7, twoX: 15.7, x1: 6, zeroGoals: 12.9, sixGoals: 22, ht11: 6.8, ht21: 16.4, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "cheliv", home: "che", away: "liv", winner: 1140, oneX: 15.7, twoX: 15.7, x1: 6, zeroGoals: 12.9, sixGoals: 22, ht11: 6.8, ht21: 16.4, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "astliv", home: "ast", away: "liv", winner: 847, oneX: 16.8, twoX: 16.8, x1: 6, zeroGoals: 13, sixGoals: 23.7, ht11: 6.8, ht21: 16.2, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "totliv", home: "tot", away: "liv", winner: 847, oneX: 16.8, twoX: 16.8, x1: 6, zeroGoals: 13, sixGoals: 23.7, ht11: 6.8, ht21: 16.2, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "mncliv", home: "mnc", away: "liv", winner: 1226, oneX: 14.8, twoX: 14.8, x1: 6, zeroGoals: 13.8, sixGoals: 20.5, ht11: 6.8, ht21: 17, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "arsliv", home: "ars", away: "liv", winner: 1226, oneX: 14.8, twoX: 14.8, x1: 6, zeroGoals: 13.8, sixGoals: 20.5, ht11: 6.8, ht21: 17, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livmnc", home: "liv", away: "mnc", winner: 568, oneX: 13.8, twoX: 13.8, x1: 6, zeroGoals: 11.1, sixGoals: 19, ht11: 6.8, ht21: 15.2, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livars", home: "liv", away: "ars", winner: 568, oneX: 13.8, twoX: 13.8, x1: 6, zeroGoals: 11.1, sixGoals: 19, ht11: 6.8, ht21: 15.2, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "notliv", home: "not", away: "liv", winner: 560, oneX: 16.4, twoX: 16.4, x1: 6, zeroGoals: 14.8, sixGoals: 21.2, ht11: 6.8, ht21: 14.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "bhaliv", home: "bha", away: "liv", winner: 560, oneX: 16.4, twoX: 16.4, x1: 6, zeroGoals: 14.8, sixGoals: 21.2, ht11: 6.8, ht21: 14.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "bouliv", home: "bou", away: "liv", winner: 416, oneX: 18.4, twoX: 18.4, x1: 6, zeroGoals: 16.7, sixGoals: 20.1, ht11: 6.8, ht21: 13.5, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "fulliv", home: "ful", away: "liv", winner: 416, oneX: 18.4, twoX: 18.4, x1: 6, zeroGoals: 16.7, sixGoals: 20.1, ht11: 6.8, ht21: 13.5, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "cryliv", home: "cry", away: "liv", winner: 416, oneX: 18.4, twoX: 18.4, x1: 6, zeroGoals: 16.7, sixGoals: 20.1, ht11: 6.8, ht21: 13.5, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "whuliv", home: "whu", away: "liv", winner: 262, oneX: 19.4, twoX: 19.4, x1: 6, zeroGoals: 18, sixGoals: 17.1, ht11: 6.8, ht21: 12, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "breliv", home: "bre", away: "liv", winner: 262, oneX: 19.4, twoX: 19.4, x1: 6, zeroGoals: 18, sixGoals: 17.1, ht11: 6.8, ht21: 12, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "wolliv", home: "wol", away: "liv", winner: 262, oneX: 19.4, twoX: 19.4, x1: 6, zeroGoals: 18, sixGoals: 17.1, ht11: 6.8, ht21: 12, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "leeliv", home: "lee", away: "liv", winner: 262, oneX: 19.4, twoX: 19.4, x1: 6, zeroGoals: 18, sixGoals: 17.1, ht11: 6.8, ht21: 12, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "eveliv", home: "eve", away: "liv", winner: 262, oneX: 19.4, twoX: 19.4, x1: 6, zeroGoals: 18, sixGoals: 17.1, ht11: 6.8, ht21: 12, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livbha", home: "liv", away: "bha", winner: 144, oneX: 18.6, twoX: 18.6, x1: 6, zeroGoals: 16, sixGoals: 15.1, ht11: 6.8, ht21: 12, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livnot", home: "liv", away: "not", winner: 144, oneX: 18.6, twoX: 18.6, x1: 6, zeroGoals: 16, sixGoals: 15.1, ht11: 6.8, ht21: 12, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "burliv", home: "bur", away: "liv", winner: 168, oneX: 22.3, twoX: 22.3, x1: 6, zeroGoals: 15.3, sixGoals: 17.4, ht11: 6.8, ht21: 12.7, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "sunliv", home: "sun", away: "liv", winner: 168, oneX: 22.3, twoX: 22.3, x1: 6, zeroGoals: 15.3, sixGoals: 17.4, ht11: 6.8, ht21: 12.7, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livcry", home: "liv", away: "cry", winner: 105, oneX: 20.4, twoX: 20.4, x1: 6, zeroGoals: 14.7, sixGoals: 15.5, ht11: 6.8, ht21: 12.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livbou", home: "liv", away: "bou", winner: 105, oneX: 20.4, twoX: 20.4, x1: 6, zeroGoals: 14.7, sixGoals: 15.5, ht11: 6.8, ht21: 12.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livful", home: "liv", away: "ful", winner: 105, oneX: 20.4, twoX: 20.4, x1: 6, zeroGoals: 14.7, sixGoals: 15.5, ht11: 6.8, ht21: 12.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livwhu", home: "liv", away: "whu", winner: 66.1, oneX: 24.9, twoX: 24.9, x1: 6, zeroGoals: 17.7, sixGoals: 13, ht11: 6.8, ht21: 11.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livbre", home: "liv", away: "bre", winner: 66.1, oneX: 24.9, twoX: 24.9, x1: 6, zeroGoals: 17.7, sixGoals: 13, ht11: 6.8, ht21: 11.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livwol", home: "liv", away: "wol", winner: 66.1, oneX: 24.9, twoX: 24.9, x1: 6, zeroGoals: 17.7, sixGoals: 13, ht11: 6.8, ht21: 11.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livlee", home: "lee", away: "liv", winner: 66.1, oneX: 24.9, twoX: 24.9, x1: 6, zeroGoals: 17.7, sixGoals: 13, ht11: 6.8, ht21: 11.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "liveve", home: "eve", away: "liv", winner: 66.1, oneX: 24.9, twoX: 24.9, x1: 6, zeroGoals: 17.7, sixGoals: 13, ht11: 6.8, ht21: 11.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livsun", home: "liv", away: "sun", winner: 46.3, oneX: 31.2, twoX: 31.2, x1: 6, zeroGoals: 16.6, sixGoals: 13.3, ht11: 6.8, ht21: 13.1, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livbur", home: "liv", away: "bur", winner: 46.3, oneX: 31.2, twoX: 31.2, x1: 6, zeroGoals: 16.6, sixGoals: 13.3, ht11: 6.8, ht21: 13.1, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livast", home: "liv", away: "ast", winner: 229, oneX: 16.6, twoX: 16.6, x1: 6, zeroGoals: 16, sixGoals: 17.2, ht11: 6.8, ht21: 13, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "livtot", home: "liv", away: "tot", winner: 229, oneX: 16.6, twoX: 16.6, x1: 6, zeroGoals: 16, sixGoals: 17.2, ht11: 6.8, ht21: 13, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 }
];

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const LOCAL_STORAGE_KEY = "virtual_epl_betking_v2_data";

/* ── ASSET GROUPING ── */
const GROUP_A = ["oneX", "twoX", "zeroGoals", "sixGoals", "ht21"];
const GROUP_A_LABELS = { oneX: "1X", twoX: "2X", zeroGoals: "0G", sixGoals: "6G", ht21: "HT21" };
const GROUP_A_ODD_KEY = { oneX: "oneX", twoX: "twoX", zeroGoals: "zeroGoals", sixGoals: "sixGoals", ht21: "ht21" };
const GROUP_A_COLORS = { oneX: "bg-purple-600 hover:bg-purple-700", twoX: "bg-pink-600 hover:bg-pink-700", zeroGoals: "bg-cyan-600 hover:bg-cyan-700", sixGoals: "bg-teal-600 hover:bg-teal-700", ht21: "bg-amber-700 hover:bg-amber-800" };

const GROUP_B = ["x1", "ht11", "O45", "ft11", "fourGoals", "htgg"];
const GROUP_B_LABELS = { x1: "X1", ht11: "HT11", O45: "O4.5", ft11: "FT11", fourGoals: "4G", htgg: "HTGG" };
const GROUP_B_ODD_KEY = { x1: "x1", ht11: "ht11", O45: "O45", ft11: "ft11", fourGoals: "fourGoals", htgg: "htgg" };
const GROUP_B_COLORS = { x1: "bg-cyan-600 hover:bg-cyan-700", ht11: "bg-blue-600 hover:bg-blue-700", O45: "bg-teal-600 hover:bg-teal-700", ft11: "bg-indigo-600 hover:bg-indigo-700", fourGoals: "bg-emerald-600 hover:bg-emerald-700", htgg: "bg-rose-600 hover:bg-rose-700" };

const emptyGroupB = () => Object.fromEntries(GROUP_B.map(k => [k, 0]));
const emptyGroupA = () => Object.fromEntries(GROUP_A.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  /* ENGINE STATES */
  const [baseStake, setBaseStake] = useState(10000);
  const [bank, setBank] = useState(0); 
  const [winnerAmount, setWinnerAmount] = useState(0);

  /* SMALL ODDS / SHADOW STATES */
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [smallDeficitShadow, setSmallDeficitShadow] = useState(0);
  const [groupAWinCount, setGroupAWinCount] = useState(0);

  /* STAKES & DEFICITS */
  const [groupAStakes, setGroupAStakes] = useState(emptyGroupA());
  const [groupBTargets, setGroupBTargets] = useState(emptyGroupB());
  const [groupBDeficits, setGroupBDeficits] = useState(emptyGroupB());
  const [groupBStakes, setGroupBStakes] = useState(emptyGroupB());

  /* UI STATES */
  const [clicked, setClicked] = useState(new Set());
  const [groupBWinHappened, setGroupBWinHappened] = useState(false);

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  const loadLocalData = () => {
    setIsReloading(true);
    try {
      const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedData) {
        const d = JSON.parse(savedData);
        setBaseStake(Number(d.base) || 10000);
        setBank(Number(d.bank) || 0);
        setSmallDeficit(Number(d.smallDeficit) || 0);
        setSmallDeficitShadow(Number(d.smallDeficitShadow) || 0);
        setGroupAWinCount(Number(d.groupAWinCount) || 0);
        
        const safeBTargets = emptyGroupB();
        if (d.groupBTargets) GROUP_B.forEach(k => { safeBTargets[k] = Number(d.groupBTargets[k]) || 0; });
        setGroupBTargets(safeBTargets);

        const safeBDeficits = emptyGroupB();
        if (d.groupBDeficits) GROUP_B.forEach(k => { safeBDeficits[k] = Number(d.groupBDeficits[k]) || 0; });
        setGroupBDeficits(safeBDeficits);
      }
    } catch (err) { console.error(err); } finally { setIsReloading(false); }
  };

  const saveLocalData = () => {
    try {
      const dataToSave = {
        base: Number(baseRef.current),
        bank: Number(bank),
        smallDeficit,
        smallDeficitShadow,
        groupBTargets,
        groupBDeficits,
        groupAWinCount,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadLocalData(); }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    let found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert(`Fixture not found: ${home} vs ${away}`); return; }

    setFixture(found);
    setClicked(new Set());
    setGroupBWinHappened(false);

    const currentBase = Number(baseStake || 0);
    const calculatedWinner = found.winner ? Math.max(Math.round(currentBase / found.winner), 10) : 0;
    setWinnerAmount(calculatedWinner);

    const nextSmallDeficit = Number(smallDeficit || 0) + calculatedWinner;
    setSmallDeficit(nextSmallDeficit);
    setSmallDeficitShadow(nextSmallDeficit);

    const newGA = emptyGroupA();
    let gaTotalStakes = 0;
    GROUP_A.forEach(key => {
      const odd = found[GROUP_A_ODD_KEY[key]] || 0;
      if (odd > 1.01) {
        newGA[key] = Math.max(Math.round(nextSmallDeficit / (odd - 1)), 10);
        gaTotalStakes += newGA[key];
      }
    });
    setGroupAStakes(newGA);

    const splitShare = Math.floor(gaTotalStakes / 6);
    const nextTargets = { ...groupBTargets };
    GROUP_B.forEach(k => { nextTargets[k] = (Number(nextTargets[k]) || 0) + splitShare; });
    setGroupBTargets(nextTargets);

    const newGB = emptyGroupB();
    GROUP_B.forEach(key => {
      const odd = found[GROUP_B_ODD_KEY[key]] || 0;
      if (odd > 1.01) {
        const targetValue = Number(nextTargets[key]) || 0;
        const accruedDeficit = Number(groupBDeficits[key]) || 0;
        newGB[key] = Math.max(Math.round((targetValue + accruedDeficit) / (odd - 1)), 10);
      }
    });
    setGroupBStakes(newGB);
  };

  const handleGroupAWin = (key) => {
    if (!fixture || clicked.has(`ga_${key}`)) return;
    setClicked(prev => new Set([...prev, `ga_${key}`]));

    const nextWinCount = groupAWinCount + 1;
    setGroupAWinCount(nextWinCount);

    if (nextWinCount === 1) {
      setSmallDeficit(0);
    } else if (nextWinCount >= 2) {
      setBank(prev => prev + Number(smallDeficitShadow));
      setSmallDeficitShadow(0);
      setSmallDeficit(0);
    }
  };

  const handleGroupBWin = (key) => {
    if (!fixture || clicked.has(`gb_${key}`)) return;
    setClicked(prev => new Set([...prev, `gb_${key}`]));
    setGroupBWinHappened(true);

    const nextTargets = { ...groupBTargets };
    const nextDeficits = { ...groupBDeficits };
    nextTargets[key] = 0;
    nextDeficits[key] = 0;
    setGroupBTargets(nextTargets);
    setGroupBDeficits(nextDeficits);
  };

  const handleJackpot = () => {
    setClicked(prev => new Set([...prev, "winnerJackpot"]));
    setBaseStake(10000);
    setSmallDeficit(0);
    setSmallDeficitShadow(0);
    setBank(0);
  };

  const handleNext = () => {
    if (!fixture) return;

    let localDeficits = { ...groupBDeficits };

    GROUP_B.forEach(k => {
      if (!clicked.has(`gb_${k}`) && groupBStakes[k] > 0) {
        localDeficits[k] = (Number(localDeficits[k]) || 0) + Number(groupBStakes[k]);
      }
    });

    if (groupBWinHappened) {
      const completeDeficitPool = GROUP_B.reduce((sum, k) => sum + (Number(localDeficits[k]) || 0), 0);
      let remainingPool = completeDeficitPool;
      let currentBank = Number(bank);

      if (currentBank > 0) {
        const reduction = Math.min(currentBank, remainingPool);
        remainingPool -= reduction;
        setBank(currentBank - reduction);
      }

      const pooledSplitShare = Math.floor(remainingPool / 6);
      GROUP_B.forEach(k => { localDeficits[k] = pooledSplitShare; });
    }
    
    setGroupBDeficits(localDeficits);
    setGroupAWinCount(0);
    clearAndCleanStates();
  };

  const clearAndCleanStates = () => {
    setInputA(""); setInputB("");
    setFixture(null); setClicked(new Set());
    setGroupBWinHappened(false); setWinnerAmount(0);
    setGroupAStakes(emptyGroupA()); setGroupBStakes(emptyGroupB());
    setTimeout(() => { saveLocalData(); }, 50);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans antialiased selection:bg-red-500/30">
      
      {/* GLOBAL HEADER BAR */}
      <header className="sticky top-0 z-50 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 px-4 py-3.5 shadow-md flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-sm font-black uppercase tracking-wider text-red-500">
            EPL Matrix Engine
          </h1>
          <span className="text-[10px] text-neutral-400 font-mono tracking-tight">V2.4 Live Sync</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveLocalData} className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-lg shadow-md transition-all uppercase tracking-wide">
            Save
          </button>
          <button onClick={loadLocalData} disabled={isReloading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40 font-bold text-xs rounded-lg transition-all active:scale-95">
            <FiRefreshCw className={isReloading ? "animate-spin text-red-400" : ""} size={12} />
            {isReloading ? "Loading" : "Sync"}
          </button>
        </div>
      </header>

      {/* PRIMARY WORKSPACE */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col gap-5 overflow-y-auto">
        
        {/* JACKPOT INTERACTION CARD */}
        <section className="w-full">
          <button onClick={handleJackpot}
            className={`w-full p-4 rounded-xl border transition-all duration-200 active:scale-[0.99] text-center flex flex-col items-center justify-center gap-1 group ${
              clicked.has("winnerJackpot") 
                ? "bg-white border-yellow-400 text-black shadow-lg shadow-yellow-500/10" 
                : "bg-gradient-to-b from-amber-500/20 to-amber-600/5 border-amber-500/40 hover:border-amber-400 text-amber-200"
            }`}>
            <span className={`text-[10px] font-bold tracking-[0.25em] ${clicked.has("winnerJackpot") ? "text-neutral-500" : "text-amber-500 uppercase"}`}>
              Emergency Override
            </span>
            <div className="text-lg font-black tracking-tight group-hover:scale-[1.01] transition-transform">
              RESET WINNER JACKPOT
            </div>
            <div className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-md mt-1 bg-black/20 text-white/90">
              Target Allocation: {winnerAmount || "0.00"}
            </div>
          </button>
        </section>

        {/* CORE INTERACTION ENGINE BOARDS */}
        {fixture ? (
          <div className="flex flex-col gap-6 animate-fadeIn">
            
            {/* GROUP A GRID PLATFORM */}
            <section className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] text-purple-400 font-bold tracking-widest uppercase">
                  ⚡ Group A // Shadow Pursuit
                </span>
                <span className="text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  Deficit Catch
                </span>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {GROUP_A.map(key => (
                  <button key={key} onClick={() => handleGroupAWin(key)} disabled={clicked.has(`ga_${key}`)}
                    className={`p-3 rounded-xl font-bold flex flex-col items-center justify-center transition-all duration-150 active:scale-95 border ${
                      clicked.has(`ga_${key}`) 
                        ? "bg-neutral-800 border-emerald-500/40 text-emerald-400 shadow-inner" 
                        : `${GROUP_A_COLORS[key]} border-transparent text-white shadow-sm`
                    }`}>
                    <span className="text-xs font-black tracking-wide opacity-90">{GROUP_A_LABELS[key]}</span>
                    <span className="text-[11px] font-mono mt-1 opacity-80">{groupAStakes[key] || "–"}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* GROUP B GRID PLATFORM */}
            <section className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">
                  📊 Group B // Target Allocation
                </span>
                <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                  Accrued Matrix
                </span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                {GROUP_B.map(key => (
                  <button key={key} onClick={() => handleGroupBWin(key)} disabled={clicked.has(`gb_${key}`)}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all duration-150 active:scale-95 min-h-[76px] ${
                      clicked.has(`gb_${key}`) 
                        ? "bg-neutral-800 border-emerald-500/40 text-emerald-400 shadow-inner" 
                        : `${GROUP_B_COLORS[key]} border-white/5 text-white shadow-sm`
                    }`}>
                    <div className="flex items-center justify-between w-full border-b border-white/10 pb-1">
                      <span className="font-black text-xs tracking-wider">{GROUP_B_LABELS[key]}</span>
                      <span className="text-[10px] font-mono opacity-90 font-bold">S: {groupBStakes[key]}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[9px] font-mono opacity-70 w-full">
                      <span>T: {groupBTargets[key]}</span>
                      <span className="text-neutral-400">|</span>
                      <span>D: {groupBDeficits[key]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          /* EMPTY FALLBACK BOARD */
          <div className="bg-neutral-900/30 border-2 border-dashed border-neutral-800 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2">
            <span className="text-xl">🎲</span>
            <p className="text-xs text-neutral-400 font-medium">No live calculations generated.</p>
            <p className="text-[10px] text-neutral-500 max-w-[240px]">Provide target fixture identity arrays below to index live operational matrices.</p>
          </div>
        )}

        {/* INPUT HARDWARE & ACTION SYSTEM */}
        <section className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 flex flex-col gap-3.5 mt-auto shadow-xl">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 px-1">Home Team</label>
              <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="e.g. LIV"
                className="w-full px-3.5 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-center text-xs text-white font-mono placeholder-neutral-700 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 outline-none transition-all uppercase font-bold" />
            </div>
            
            <span className="font-black text-xs text-neutral-600 mt-4 italic shrink-0">VS</span>
            
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 px-1">Away Team</label>
              <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="e.g. MNU"
                className="w-full px-3.5 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-center text-xs text-white font-mono placeholder-neutral-700 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 outline-none transition-all uppercase font-bold" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button onClick={handleSubmit} disabled={!!fixture}
              className={`py-3.5 px-4 font-bold text-xs rounded-xl uppercase tracking-wider transition-all border ${
                fixture 
                  ? "bg-neutral-800 border-transparent text-neutral-500 cursor-not-allowed" 
                  : "bg-red-600 hover:bg-red-500 border-red-700 text-white shadow-lg shadow-red-950/40 active:scale-[0.98]"
              }`}>
              Execute Matrix
            </button>
            <button onClick={handleNext} disabled={!fixture}
              className={`py-3.5 px-4 font-bold text-xs rounded-xl uppercase tracking-wider transition-all border ${
                !fixture 
                  ? "bg-neutral-800 border-transparent text-neutral-500 cursor-not-allowed" 
                  : "bg-neutral-100 hover:bg-white border-white text-black font-black shadow-lg active:scale-[0.98]"
              }`}>
              Next Round
            </button>
          </div>
        </section>

        {/* METRICS & TELEMETRY FOOTER PANEL */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-md">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 font-mono text-[11px]">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <span className="text-neutral-500 text-[10px] uppercase font-sans tracking-wide font-semibold">Engine Core Base</span>
              <strong className="text-neutral-200 font-bold">{baseStake}</strong>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <span className="text-emerald-500 text-[10px] uppercase font-sans tracking-wide font-semibold">Vault Bank Balance</span>
              <strong className="text-emerald-400 font-black">{bank}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-blue-500 text-[10px] uppercase font-sans tracking-wide font-semibold">Pursuit Deficit</span>
              <strong className="text-blue-400 font-bold">{smallDeficit}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-purple-500 text-[10px] uppercase font-sans tracking-wide font-semibold">Shadow Mirror</span>
              <strong className="text-purple-400 font-bold">{smallDeficitShadow}</strong>
            </div>
            <div className="col-span-2 pt-2 border-t border-neutral-800 flex items-center justify-between">
              <span className="text-neutral-400 text-[10px] uppercase font-sans tracking-wide font-semibold">Group A Win Sequence</span>
              <div className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${groupAWinCount >= 1 ? 'bg-yellow-400 shadow shadow-yellow-400/50' : 'bg-neutral-700'}`}></span>
                <span className={`h-2 w-2 rounded-full ${groupAWinCount >= 2 ? 'bg-yellow-400 shadow shadow-yellow-400/50' : 'bg-neutral-700'}`}></span>
                <strong className="text-yellow-400 text-xs font-bold ml-1">{groupAWinCount} / 2 Hits</strong>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};

export default Homepage;
