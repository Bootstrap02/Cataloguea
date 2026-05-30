
import React, { useState, useEffect, useRef } from "react";
import { FiRefreshCw, FiZap, FiTarget, FiGrid, FiShield, FiTrendingUp } from "react-icons/fi";

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

const GROUP_A = ["oneX", "twoX", "zeroGoals", "sixGoals", "ht21"];
const GROUP_A_LABELS = { oneX: "1X", twoX: "2X", zeroGoals: "0G", sixGoals: "6G", ht21: "HT21" };
const GROUP_A_ODD_KEY = { oneX: "oneX", twoX: "twoX", zeroGoals: "zeroGoals", sixGoals: "sixGoals", ht21: "ht21" };
const GROUP_A_COLORS = { 
  oneX: "bg-indigo-600 hover:bg-indigo-500 border-indigo-400/30", 
  twoX: "bg-pink-600 hover:bg-pink-500 border-pink-400/30", 
  zeroGoals: "bg-cyan-600 hover:bg-cyan-500 border-cyan-400/30", 
  sixGoals: "bg-teal-600 hover:bg-teal-500 border-teal-400/30", 
  ht21: "bg-amber-600 hover:bg-amber-500 border-amber-400/30" 
};

const GROUP_B = ["x1", "ht11", "O45", "ft11", "fourGoals", "htgg"];
const GROUP_B_LABELS = { x1: "X1", ht11: "HT11", O45: "O4.5", ft11: "FT11", fourGoals: "4G", htgg: "HTGG" };
const GROUP_B_ODD_KEY = { x1: "x1", ht11: "ht11", O45: "O45", ft11: "ft11", fourGoals: "fourGoals", htgg: "htgg" };

const emptyGroupB = () => Object.fromEntries(GROUP_B.map(k => [k, 0]));
const emptyGroupA = () => Object.fromEntries(GROUP_A.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  const [baseStake, setBaseStake] = useState(10000);
  const [bank, setBank] = useState(0); 
  const [winnerAmount, setWinnerAmount] = useState(0);
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [smallDeficitShadow, setSmallDeficitShadow] = useState(0);
  const [groupAWinCount, setGroupAWinCount] = useState(0);

  const [groupAStakes, setGroupAStakes] = useState(emptyGroupA());
  const [groupBTargets, setGroupBTargets] = useState(emptyGroupB());
  const [groupBDeficits, setGroupBDeficits] = useState(emptyGroupB());
  const [groupBStakes, setGroupBStakes] = useState(emptyGroupB());

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
      const dataToSave = { base: Number(baseRef.current), bank: Number(bank), smallDeficit, smallDeficitShadow, groupBTargets, groupBDeficits, groupAWinCount };
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
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased text-sm select-none p-3 gap-3 overflow-hidden max-h-screen">
      
      {/* ── TOP CONTROL & TELEMETRY NAV BAR ── */}
      <header className="flex items-center justify-between bg-slate-900 border border-slate-800/80 rounded-xl p-2 px-3 shadow-xl shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-black text-sm tracking-wider text-red-500 uppercase">EPL Matrix V2</span>
          <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 px-2 py-0.5 rounded-lg">
            <span className="text-[10px] font-mono uppercase text-slate-400">A-Sequence</span>
            <div className={`h-2 w-2 rounded-full transition-all duration-300 ${groupAWinCount >= 1 ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-800'}`}></div>
            <div className={`h-2 w-2 rounded-full transition-all duration-300 ${groupAWinCount >= 2 ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-800'}`}></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveLocalData} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors shadow-md shadow-emerald-900/20">Save</button>
          <button onClick={loadLocalData} disabled={isReloading} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors">
            <FiRefreshCw className={isReloading ? "animate-spin text-red-400" : "text-slate-300"} size={12} />
            Sync Engine
          </button>
        </div>
      </header>

      {/* ── METRICS TRACKING DASHBOARD (HIGH READABILITY) ── */}
      <section className="bg-slate-900/60 border border-slate-900 rounded-xl p-2.5 shadow-inner shrink-0">
        <div className="grid grid-cols-4 gap-2.5 font-mono text-center">
          <div className="bg-slate-950/40 border border-slate-800/60 rounded-lg p-1.5 flex flex-col justify-center">
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-tight flex items-center justify-center gap-1"><FiTarget size={11}/> Base Stake</span>
            <span className="text-slate-300 font-extrabold text-sm">{baseStake.toLocaleString()}</span>
          </div>
          <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-1.5 flex flex-col justify-center">
            <span className="text-emerald-400 text-[10px] uppercase font-bold tracking-tight flex items-center justify-center gap-1"><FiShield size={11}/> Vault Bank</span>
            <span className="text-emerald-400 font-black text-sm">{bank.toLocaleString()}</span>
          </div>
          <div className="bg-blue-950/20 border border-blue-900/40 rounded-lg p-1.5 flex flex-col justify-center">
            <span className="text-blue-400 text-[10px] uppercase font-bold tracking-tight flex items-center justify-center gap-1"><FiTrendingUp size={11}/> Pursuit Def.</span>
            <span className="text-blue-400 font-extrabold text-sm">{smallDeficit.toLocaleString()}</span>
          </div>
          <div className="bg-purple-950/20 border border-purple-900/40 rounded-lg p-1.5 flex flex-col justify-center">
            <span className="text-purple-400 text-[10px] uppercase font-bold tracking-tight flex items-center justify-center gap-1"><FiZap size={11}/> Mirror Shadow</span>
            <span className="text-purple-400 font-extrabold text-sm">{smallDeficitShadow.toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* ── CRISP EMERGENCY ACTION CONTROLLER ── */}
      <section className="shrink-0">
        <button onClick={handleJackpot}
          className={`w-full py-1.5 px-3 rounded-xl border text-center transition-all flex items-center justify-between font-bold shadow-lg ${
            clicked.has("winnerJackpot") 
              ? "bg-amber-500 border-amber-400 text-slate-950 shadow-amber-500/10" 
              : "bg-amber-950/30 border-amber-800/60 text-amber-300 hover:bg-amber-950/50 hover:border-amber-700"
          }`}>
          <span className="text-[10px] uppercase font-black tracking-wider opacity-60">System Overlap</span>
          <span className="font-black text-xs tracking-wide">RESET WINNER JACKPOT</span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-950/80 text-amber-400 border border-slate-800">Alloc: {winnerAmount || "0"}</span>
        </button>
      </section>

      {/* ── MAIN INTERACTION VIEWPORT (DYNAMIC FIT) ── */}
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        {fixture ? (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            
            {/* GROUP A MATRIX */}
            <section className="bg-slate-900/50 border border-slate-900 rounded-xl p-2.5 flex flex-col justify-center shrink-0">
              <div className="text-[11px] text-purple-400 font-extrabold tracking-widest uppercase mb-1.5 px-0.5 flex items-center gap-1">⚡ Group A Matrix // Deficit Targets</div>
              <div className="grid grid-cols-5 gap-2">
                {GROUP_A.map(key => (
                  <button key={key} onClick={() => handleGroupAWin(key)} disabled={clicked.has(`ga_${key}`)}
                    className={`p-2.5 rounded-xl border transition-all flex flex-col items-center justify-center shadow-md relative group ${
                      clicked.has(`ga_${key}`) 
                        ? "bg-slate-800/80 border-emerald-500/40 text-emerald-400 line-through opacity-50" 
                        : `${GROUP_A_COLORS[key]} border-white/10 text-white active:scale-[0.98]`
                    }`}>
                    <span className="text-xs font-black tracking-wider opacity-90">{GROUP_A_LABELS[key]}</span>
                    <span className="text-xs font-mono font-black mt-0.5">{groupAStakes[key] ? groupAStakes[key].toLocaleString() : "–"}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* GROUP B DATA BLOCK */}
            <section className="flex-1 min-h-0 bg-slate-900/50 border border-slate-900 rounded-xl p-2.5 flex flex-col">
              <div className="text-[11px] text-cyan-400 font-extrabold tracking-widest uppercase mb-1.5 px-0.5 flex items-center gap-1 shrink-0"><FiGrid size={12}/> Group B Matrix // Dynamic Allocated Stack</div>
              <div className="flex-1 min-h-0 grid grid-cols-3 gap-2">
                {GROUP_B.map(key => (
                  <button key={key} onClick={() => handleGroupBWin(key)} disabled={clicked.has(`gb_${key}`)}
                    className={`p-2 rounded-xl border text-left flex flex-col justify-between transition-all min-h-0 overflow-hidden shadow-md active:scale-[0.98] ${
                      clicked.has(`gb_${key}`) 
                        ? "bg-slate-800/80 border-emerald-500/40 text-emerald-400 line-through opacity-50" 
                        : "bg-slate-950/60 hover:bg-slate-950 border-slate-800 text-white"
                    }`}>
                    <div className="flex items-center justify-between w-full border-b border-slate-800/80 pb-1.5 mb-1 shrink-0">
                      <span className="font-black text-xs tracking-wider text-slate-200">{GROUP_B_LABELS[key]}</span>
                      <span className="text-xs font-mono text-cyan-400 font-black bg-slate-900 px-1.5 py-0.5 rounded-md border border-slate-800">S: {groupBStakes[key].toLocaleString()}</span>
                    </div>
                    <div className="flex-1 w-full flex flex-col justify-center gap-0.5 font-mono text-[11px] text-slate-400">
                      <div className="flex justify-between"><span>Target:</span><span className="font-bold text-slate-300">{groupBTargets[key].toLocaleString()}</span></div>
                      <div className="flex justify-between border-t border-slate-900 pt-0.5"><span>Deficit:</span><span className="font-bold text-rose-400">{groupBDeficits[key].toLocaleString()}</span></div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          /* STANDARD EMPTY/IDLE HUB STATE */
          <div className="flex-1 bg-slate-900/10 border-2 border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center p-6 text-center shadow-inner">
            <span className="text-3xl mb-2 animate-pulse">🎲</span>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest font-bold">Engine Idle // Input Fixture Parameters Below</p>
          </div>
        )}
      </div>

      {/* ── FOOTER MATRIX CONTROLS ── */}
      <footer className="shrink-0 bg-slate-900 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-2.5 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-black text-slate-500 uppercase font-mono">Home:</span>
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="LIV"
              className="w-full bg-transparent text-xs text-white font-mono placeholder-slate-700 outline-none uppercase font-black tracking-wide" />
          </div>
          <span className="font-black text-[11px] text-slate-600 italic shrink-0">VS</span>
          <div className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-black text-slate-500 uppercase font-mono">Away:</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="MNU"
              className="w-full bg-transparent text-xs text-white font-mono placeholder-slate-700 outline-none uppercase font-black tracking-wide" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleSubmit} disabled={!!fixture}
            className={`py-2 px-4 font-black text-xs rounded-lg uppercase tracking-wider transition-all border shadow-md ${
              fixture 
                ? "bg-slate-800 border-transparent text-slate-600 cursor-not-allowed" 
                : "bg-red-600 hover:bg-red-500 border-red-700 text-white active:scale-[0.99]"
            }`}>
            Execute Matrix
          </button>
          <button onClick={handleNext} disabled={!fixture}
            className={`py-2 px-4 font-black text-xs rounded-lg uppercase tracking-wider transition-all border shadow-md ${
              !fixture 
                ? "bg-slate-800 border-transparent text-slate-600 cursor-not-allowed" 
                : "bg-slate-100 hover:bg-white border-white text-slate-950 active:scale-[0.99]"
            }`}>
            Next Round
          </button>
        </div>
      </footer>

    </div>
  );
};

export default Homepage;
