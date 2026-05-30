
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
  { id: "livlee", home: "liv", away: "lee", winner: 66.1, oneX: 24.9, twoX: 24.9, x1: 6, zeroGoals: 17.7, sixGoals: 13, ht11: 6.8, ht21: 11.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
  { id: "liveve", home: "liv", away: "eve", winner: 66.1, oneX: 24.9, twoX: 24.9, x1: 6, zeroGoals: 17.7, sixGoals: 13, ht11: 6.8, ht21: 11.6, ft11: 8.5, O45: 5.8, fourGoals: 5.3, htgg: 4.3 },
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
const GROUP_A_COLORS = { oneX: "bg-purple-600", twoX: "bg-pink-600", zeroGoals: "bg-cyan-600", sixGoals: "bg-teal-600", ht21: "bg-amber-700" };

const GROUP_B = ["x1", "ht11", "O45", "ft11", "fourGoals", "htgg"];
const GROUP_B_LABELS = { x1: "X1", ht11: "HT11", O45: "O4.5", ft11: "FT11", fourGoals: "4G", htgg: "HTGG" };
const GROUP_B_ODD_KEY = { x1: "x1", ht11: "ht11", O45: "O45", ft11: "ft11", fourGoals: "fourGoals", htgg: "htgg" };
const GROUP_B_COLORS = { x1: "bg-cyan-600", ht11: "bg-blue-600", O45: "bg-teal-600", ft11: "bg-indigo-600", fourGoals: "bg-emerald-600", htgg: "bg-rose-600" };

const emptyGroupB = () => Object.fromEntries(GROUP_B.map(k => [k, 0]));
const emptyGroupA = () => Object.fromEntries(GROUP_A.map(k => [k, 0]));

/* ── COMPONENT ── */
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

  /* ── DATA PERSISTENCE ── */
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
    } catch (err) {
      console.error("Storage load error:", err);
    } finally {
      setIsReloading(false);
    }
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
    } catch (err) { console.error("Storage save error:", err); }
  };

  useEffect(() => { loadLocalData(); }, []);

  /* ── CORE CALCULATIONS ── */
  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    let found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert(`Fixture not found: ${home} vs ${away}`); return; }

    setFixture(found);
    setClicked(new Set());
    setGroupBWinHappened(false);

    // 1. Calculate Winner Jackpot
    const currentBase = Number(baseStake || 0);
    const calculatedWinner = found.winner ? Math.max(Math.round(currentBase / found.winner), 10) : 0;
    setWinnerAmount(calculatedWinner);

    // 2. Sync Small Deficit Mirror
    const nextSmallDeficit = Number(smallDeficit || 0) + calculatedWinner;
    setSmallDeficit(nextSmallDeficit);
    setSmallDeficitShadow(nextSmallDeficit);

    // 3. Group A Stakes (Chase Small Deficit)
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

    // 4. Distribute GA Total to GB Targets
    const splitShare = Math.floor(gaTotalStakes / 6);
    const nextTargets = { ...groupBTargets };
    GROUP_B.forEach(k => { nextTargets[k] = (Number(nextTargets[k]) || 0) + splitShare; });
    setGroupBTargets(nextTargets);

    // 5. Calculate Group B Stakes (Target + Accrued Deficit)
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

  /* ── WIN HANDLERS ── */
  const handleGroupAWin = (key) => {
    if (!fixture || clicked.has(`ga_${key}`)) return;
    setClicked(prev => new Set([...prev, `ga_${key}`]));

    const nextWinCount = groupAWinCount + 1;
    setGroupAWinCount(nextWinCount);

    if (nextWinCount === 1) {
      setSmallDeficit(0); // Clear current pursuit
    } else if (nextWinCount >= 2) {
      // Recovery success: Transfer shadow value to Bank
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

  /* ── TRANSITION LOGIC ── */
  const handleNext = () => {
    if (!fixture) return;

    let localDeficits = { ...groupBDeficits };

    // Accumulate missed stakes into deficits
    GROUP_B.forEach(k => {
      if (!clicked.has(`gb_${k}`) && groupBStakes[k] > 0) {
        localDeficits[k] = (Number(localDeficits[k]) || 0) + Number(groupBStakes[k]);
      }
    });

    // Handle Pooling and Bank Offset
    if (groupBWinHappened) {
      const completeDeficitPool = GROUP_B.reduce((sum, k) => sum + (Number(localDeficits[k]) || 0), 0);
      
      let remainingPool = completeDeficitPool;
      let currentBank = Number(bank);

      // Subtract bank from deficit pool before splitting
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

  /* ── UI ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col font-sans">
      {/* HEADER */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-base font-extrabold text-red-400 tracking-tight uppercase">
          Virtual EPL Matrix Hub
        </h1>
        <div className="flex rounded-full overflow-hidden shadow-lg border border-red-500/30">
          <button onClick={saveLocalData} className="px-4 py-2 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">💾 SAVE</button>
          <button onClick={loadLocalData} disabled={isReloading}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 font-bold text-white text-xs hover:bg-red-700 disabled:opacity-50">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={11} />
            {isReloading ? "…" : "RELOAD"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-6 gap-4 overflow-y-auto">
        {/* JACKPOT TRIGGER */}
        <button onClick={handleJackpot}
          className={`w-full py-5 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow-xl text-center bg-gradient-to-r from-yellow-500 to-amber-500 text-black ${clicked.has("winnerJackpot") ? "ring-4 ring-yellow-400 brightness-125" : ""}`}>
          <div className="text-xl font-black">WINNER JACKPOT</div>
          <div className="text-[12px] mt-1 opacity-90 font-bold uppercase">Target Stake: {winnerAmount || "–"}</div>
        </button>

        {fixture && (
          <>
            {/* GROUP A */}
            <div className="text-[10px] text-red-400/60 text-center font-bold tracking-[0.2em] uppercase">Group A: Shadow Pursuit</div>
            <div className="grid grid-cols-5 gap-2">
              {GROUP_A.map(key => (
                <button key={key} onClick={() => handleGroupAWin(key)}
                  disabled={clicked.has(`ga_${key}`)}
                  className={`py-4 rounded-xl font-bold transition-all active:scale-95 shadow-lg ${clicked.has(`ga_${key}`) ? "bg-white text-green-600 ring-2 ring-green-400 scale-95" : `${GROUP_A_COLORS[key]} text-white`}`}>
                  <div className="font-black text-[11px]">{GROUP_A_LABELS[key]}</div>
                  <div className="text-[10px] mt-0.5 font-mono">{groupAStakes[key] || "–"}</div>
                </button>
              ))}
            </div>

            {/* GROUP B */}
            <div className="text-[10px] text-red-400/60 text-center font-bold tracking-[0.2em] uppercase mt-2">Group B: Deficit Management</div>
            <div className="grid grid-cols-3 gap-2">
              {GROUP_B.map(key => (
                <button key={key} onClick={() => handleGroupBWin(key)}
                  disabled={clicked.has(`gb_${key}`)}
                  className={`py-4 rounded-xl font-bold transition-all active:scale-95 shadow-lg flex flex-col items-center ${clicked.has(`gb_${key}`) ? "bg-white text-green-600 ring-2 ring-green-400" : `${GROUP_B_COLORS[key]} text-white`}`}>
                  <div className="font-black text-[12px]">{GROUP_B_LABELS[key]}</div>
                  <div className="text-[11px] font-mono mt-1">S: {groupBStakes[key]}</div>
                  <div className="text-[8px] opacity-70 mt-1 uppercase">T:{groupBTargets[key]} | D:{groupBDeficits[key]}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* CONTROLS */}
        <div className="mt-auto space-y-3">
          <div className="flex items-center gap-3">
            <input value={inputA} onChange={e => setInputA(e.target.value)} placeholder="HOME ID"
              className="flex-1 px-3 py-4 border-2 border-red-900/50 rounded-2xl text-center text-sm bg-black/40 text-white placeholder-red-800 focus:border-red-600 outline-none transition-all uppercase font-bold" />
            <span className="font-black text-xl text-red-600 italic">VS</span>
            <input value={inputB} onChange={e => setInputB(e.target.value)} placeholder="AWAY ID"
              className="flex-1 px-3 py-4 border-2 border-red-900/50 rounded-2xl text-center text-sm bg-black/40 text-white placeholder-red-800 focus:border-red-600 outline-none transition-all uppercase font-bold" />
          </div>
          
          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={!!fixture}
              className={`flex-1 py-4 font-black text-xs rounded-2xl uppercase tracking-widest transition active:scale-95 ${fixture ? "bg-gray-800 text-gray-500" : "bg-red-700 text-white shadow-red-900/50 shadow-lg"}`}>
              Calc Stakes
            </button>
            <button onClick={handleNext} disabled={!fixture}
              className={`flex-1 py-4 font-black text-xs rounded-2xl uppercase tracking-widest transition active:scale-95 ${!fixture ? "bg-gray-800 text-gray-500" : "bg-green-700 text-white shadow-green-900/50 shadow-lg"}`}>
              Next Round
            </button>
          </div>
        </div>

        {/* ANALYTICS PANEL */}
        <div className="bg-black/60 border border-white/10 rounded-2xl p-4 text-[11px] grid grid-cols-2 gap-x-6 gap-y-3 font-mono">
          <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-gray-500 uppercase">Base</span><strong className="text-white">{baseStake}</strong></div>
          <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-emerald-500 uppercase">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="flex justify-between"><span className="text-blue-500 uppercase">Deficit</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="flex justify-between"><span className="text-purple-500 uppercase">Shadow</span><strong className="text-purple-400">{smallDeficitShadow}</strong></div>
          <div className="flex justify-between col-span-2"><span className="text-yellow-600 uppercase">Group A Win Count</span><strong className="text-yellow-400">{groupAWinCount} / 2</strong></div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
