
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

/*
  TEAM A — handle smallDeficit (winner pile):
    1X  (def 200) ↔ zeroTarget   (def 100) — accumulates 1X stakes
    2X  (def 200) ↔ sixTarget    (def 100) — accumulates 2X stakes
    HT12(def 200) ↔ ht21Target   (def 100) — accumulates HT12 stakes
    FT40(def 200) ↔ ft40Target   (def 100) — accumulates FT40 stakes
    FT41(def 200) ↔ ft41Target   (def 100) — accumulates FT41 stakes

  TEAM B — protect targets:
    TG0 (def 100) ↔ zeroTarget
    TG6 (def 100) ↔ sixTarget
    HT21(def 100) ↔ ht21Target
    HT30(def 100) ↔ ft40Target   (HT30 protects FT40 target)
    X2  (def 100) ↔ ft41Target

  Winner stake / 5 → each of the 5 Team-A deficits gets an equal share
*/

const Homepage = () => {

  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  const [fixture, setFixture] = useState(null);

  /* ── WINNER ── */
  const [baseStake, setBaseStake] = useState(10000);
  const [deficit,   setDeficit]   = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);

  /* ── BANK ── */
  const [bank, setBank] = useState(1500);

  /* ── SMALL DEFICIT (piled by winner stakes) ── */
  const [smallDeficit, setSmallDeficit] = useState(0);

  /* ── TEAM A DEFICITS (200 default) ── */
  const [oneXDef,  setOneXDef]  = useState(200);
  const [twoXDef,  setTwoXDef]  = useState(200);
  const [ht12Def,  setHt12Def]  = useState(200);
  const [ft40Def,  setFt40Def]  = useState(200);
  const [ft41Def,  setFt41Def]  = useState(200);

  /* ── TEAM A TARGETS (100 default, accumulate from their own stakes) ── */
  const [zeroTarget,  setZeroTarget]  = useState(100);
  const [sixTarget,   setSixTarget]   = useState(100);
  const [ht21Target,  setHt21Target]  = useState(100);
  const [ft40Target,  setFt40Target]  = useState(100);
  const [ft41Target,  setFt41Target]  = useState(100);

  /* ── TEAM B DEFICITS (100 default) ── */
  const [tg0Def,  setTg0Def]  = useState(100);
  const [tg6Def,  setTg6Def]  = useState(100);
  const [ht21Def, setHt21Def] = useState(100);
  const [ht30Def, setHt30Def] = useState(100);
  const [x2Def,   setX2Def]   = useState(100);

  /* ── STAKES THIS GAME ── */
  const [oneXStake,  setOneXStake]  = useState(0);
  const [twoXStake,  setTwoXStake]  = useState(0);
  const [ht12Stake,  setHt12Stake]  = useState(0);
  const [ft40Stake,  setFt40Stake]  = useState(0);
  const [ft41Stake,  setFt41Stake]  = useState(0);
  const [tg0Stake,   setTg0Stake]   = useState(0);
  const [tg6Stake,   setTg6Stake]   = useState(0);
  const [ht21Stake,  setHt21Stake]  = useState(0);
  const [ht30Stake,  setHt30Stake]  = useState(0);
  const [x2Stake,    setX2Stake]    = useState(0);

  const [clicked, setClicked] = useState(new Set());

  const baseRef = useRef(baseStake);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     API
     ================================================================ */
  const fetchBase = async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const d = res.data || {};
      setBaseStake(d.base ?? 10000);
      setDeficit(d.deficit ?? 0);
      setBank(d.bank ?? 1500);
      setSmallDeficit(d.smallDeficit ?? 0);
      setOneXDef(d.oneXDef ?? 200);
      setTwoXDef(d.twoXDef ?? 200);
      setHt12Def(d.ht12Def ?? 200);
      setFt40Def(d.ft40Def ?? 200);
      setFt41Def(d.ft41Def ?? 200);
      setZeroTarget(d.zeroTarget ?? 100);
      setSixTarget(d.sixTarget ?? 100);
      setHt21Target(d.ht21Target ?? 100);
      setFt40Target(d.ft40Target ?? 100);
      setFt41Target(d.ft41Target ?? 100);
      setTg0Def(d.tg0Def ?? 100);
      setTg6Def(d.tg6Def ?? 100);
      setHt21Def(d.ht21Def ?? 100);
      setHt30Def(d.ht30Def ?? 100);
      setX2Def(d.x2Def ?? 100);
    } catch (err) { console.error("❌ fetch:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        base: baseRef.current, deficit, bank, smallDeficit,
        oneXDef, twoXDef, ht12Def, ft40Def, ft41Def,
        zeroTarget, sixTarget, ht21Target, ft40Target, ft41Target,
        tg0Def, tg6Def, ht21Def, ht30Def, x2Def,
      });
    } catch (err) { console.error("❌ save:", err.message); }
  };

  useEffect(() => { fetchBase(); }, []);

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    let found = odds.find((o) => o.home === home && o.away === away);

    if (!found) { alert(`No odds found for "${home}" vs "${away}"`); return; }

    setFixture(found);
    setClicked(new Set());

    /* ── Winner stake ── */
    const newBase  = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);

    /* ── Winner stake → smallDeficit ── */
    let sdNow = smallDeficit + wStake;
    setSmallDeficit(sdNow);

    /* ── Winner stake / 5 → each Team-A deficit (bank absorbs if possible) ── */
    const share = Math.ceil(wStake / 5);

    let bankNow   = bank;
    let ox = oneXDef, tx = twoXDef, h12 = ht12Def, f40 = ft40Def, f41 = ft41Def;

    const applyShare = (def, share, bankRef) => {
      if (bankRef >= share) { bankRef -= share; return { def, bank: bankRef }; }
      const residue = share - bankRef;
      bankRef = 0;
      return { def: def + residue, bank: bankRef };
    };

    let r;
    r = applyShare(ox,  share, bankNow); ox  = r.def; bankNow = r.bank;
    r = applyShare(tx,  share, bankNow); tx  = r.def; bankNow = r.bank;
    r = applyShare(h12, share, bankNow); h12 = r.def; bankNow = r.bank;
    r = applyShare(f40, share, bankNow); f40 = r.def; bankNow = r.bank;
    r = applyShare(f41, share, bankNow); f41 = r.def; bankNow = r.bank;

    setBank(bankNow);
    setOneXDef(ox); setTwoXDef(tx); setHt12Def(h12); setFt40Def(f40); setFt41Def(f41);

    /* ── Calculate all 10 stakes ── */

    // TEAM A: (def + target) / (odd - 1)
    const calc = (def, target, odd) =>
      odd > 1.01 ? Math.max(Math.round((def + target) / (odd - 1)), 10) : 0;

    const s1x   = calc(ox,  zeroTarget,  found.oneX      || 0);
    const s2x   = calc(tx,  sixTarget,   found.twoX      || 0);
    const sHt12 = calc(h12, ht21Target,  found.ht12      || 0);
    const sFt40 = calc(f40, ft40Target,  found.ft40      || 0);
    const sFt41 = calc(f41, ft41Target,  found.ft41      || 0);

    // TEAM B: (target + def) / (odd - 1)
    const sTg0  = calc(tg0Def,  zeroTarget,  found.zeroGoals || 0);
    const sTg6  = calc(tg6Def,  sixTarget,   found.sixGoals  || 0);
    const sHt21 = calc(ht21Def, ht21Target,  found.ht21      || 0);
    const sHt30 = calc(ht30Def, ft40Target,  found.ht30      || 0);
    const sX2   = calc(x2Def,   ft41Target,  found.x2        || 0);

    setOneXStake(s1x);   setTwoXStake(s2x);  setHt12Stake(sHt12);
    setFt40Stake(sFt40); setFt41Stake(sFt41);
    setTg0Stake(sTg0);   setTg6Stake(sTg6);  setHt21Stake(sHt21);
    setHt30Stake(sHt30); setX2Stake(sX2);
  };

  /* ================================================================
     LOSS — no win clicked, pile stakes into targets/defs
     ================================================================ */
  const handleLoss = () => {
    if (!fixture) return;
    setClicked((prev) => new Set([...prev, "loss"]));

    // Team A stakes pile into their targets
    if (oneXStake  > 0) setZeroTarget((p) => p + oneXStake);
    if (twoXStake  > 0) setSixTarget((p)  => p + twoXStake);
    if (ht12Stake  > 0) setHt21Target((p) => p + ht12Stake);
    if (ft40Stake  > 0) setFt40Target((p) => p + ft40Stake);
    if (ft41Stake  > 0) setFt41Target((p) => p + ft41Stake);

    // Team B stakes pile into their own defs
    if (tg0Stake   > 0) setTg0Def((p)  => p + tg0Stake);
    if (tg6Stake   > 0) setTg6Def((p)  => p + tg6Stake);
    if (ht21Stake  > 0) setHt21Def((p) => p + ht21Stake);
    if (ht30Stake  > 0) setHt30Def((p) => p + ht30Stake);
    if (x2Stake    > 0) setX2Def((p)   => p + x2Stake);

    clearForNext();
  };

  /* ================================================================
     WIN HANDLERS
     Each win: reset its own def to default, reset its paired target to 100,
     add default amount to bank.
     ================================================================ */

  // ── 1X WIN ──
  const handle1XWin = () => {
    if (!fixture || clicked.has("oneX")) return;
    setClicked((p) => new Set([...p, "oneX"]));
    setOneXDef(200);
    setZeroTarget(100);
    setBank((p) => p + 200);
  };

  // ── 2X WIN ──
  const handle2XWin = () => {
    if (!fixture || clicked.has("twoX")) return;
    setClicked((p) => new Set([...p, "twoX"]));
    setTwoXDef(200);
    setSixTarget(100);
    setBank((p) => p + 200);
  };

  // ── HT12 WIN ──
  const handleHt12Win = () => {
    if (!fixture || clicked.has("ht12")) return;
    setClicked((p) => new Set([...p, "ht12"]));
    setHt12Def(200);
    setHt21Target(100);
    setBank((p) => p + 200);
  };

  // ── FT40 WIN ──
  const handleFt40Win = () => {
    if (!fixture || clicked.has("ft40")) return;
    setClicked((p) => new Set([...p, "ft40"]));
    setFt40Def(200);
    setFt40Target(100);
    setBank((p) => p + 200);
  };

  // ── FT41 WIN ──
  const handleFt41Win = () => {
    if (!fixture || clicked.has("ft41")) return;
    setClicked((p) => new Set([...p, "ft41"]));
    setFt41Def(200);
    setFt41Target(100);
    setBank((p) => p + 200);
  };

  // ── TG0 WIN ──
  const handleTg0Win = () => {
    if (!fixture || clicked.has("tg0")) return;
    setClicked((p) => new Set([...p, "tg0"]));
    setTg0Def(100);
    setZeroTarget(100);
    setBank((p) => p + 100);
  };

  // ── TG6 WIN ──
  const handleTg6Win = () => {
    if (!fixture || clicked.has("tg6")) return;
    setClicked((p) => new Set([...p, "tg6"]));
    setTg6Def(100);
    setSixTarget(100);
    setBank((p) => p + 100);
  };

  // ── HT21 WIN ──
  const handleHt21Win = () => {
    if (!fixture || clicked.has("ht21")) return;
    setClicked((p) => new Set([...p, "ht21"]));
    setHt21Def(100);
    setHt21Target(100);
    setBank((p) => p + 100);
  };

  // ── HT30 WIN ──
  const handleHt30Win = () => {
    if (!fixture || clicked.has("ht30")) return;
    setClicked((p) => new Set([...p, "ht30"]));
    setHt30Def(100);
    setFt40Target(100);
    setBank((p) => p + 100);
  };

  // ── X2 WIN ──
  const handleX2Win = () => {
    if (!fixture || clicked.has("x2")) return;
    setClicked((p) => new Set([...p, "x2"]));
    setX2Def(100);
    setFt41Target(100);
    setBank((p) => p + 100);
  };

  /* ── 6-0 jackpot ── */
  const handleJackpot = () => {
    setClicked((p) => new Set([...p, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  /* ================================================================
     CLEAR FOR NEXT
     ================================================================ */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setClicked(new Set());
    setWinnerStake(0);
    setOneXStake(0);  setTwoXStake(0);  setHt12Stake(0);
    setFt40Stake(0);  setFt41Stake(0);  setTg0Stake(0);
    setTg6Stake(0);   setHt21Stake(0);  setHt30Stake(0);
    setX2Stake(0);
    saveBase();
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
        <h1 className="text-sm font-extrabold text-red-400">Virtual EPL</h1>
        <div className="flex rounded-full overflow-hidden shadow">
          <button onClick={saveBase} className="px-3 py-1.5 bg-green-600 font-bold text-white text-xs hover:bg-green-700 transition">💾</button>
          <button onClick={fetchBase} disabled={isReloading}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 font-bold text-white text-xs hover:bg-red-700 transition disabled:opacity-50">
            <FiRefreshCw className={`${isReloading ? "animate-spin" : ""}`} size={11} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-4 gap-3 overflow-y-auto">

        {/* WINNER + JACKPOT */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] mt-0.5 opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleLoss} disabled={!fixture || clicked.has("loss")}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${
              clicked.has("loss") ? "bg-white text-red-500 ring-2 ring-red-400"
              : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
              : "bg-red-700 text-white hover:bg-red-600"}`}>
            <div className="font-black">NO WIN</div>
            <div className="text-[9px] mt-0.5 opacity-70">pile all stakes</div>
          </button>
        </div>

        {/* TEAM A — 5 buttons (200 default) */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM A —</div>
        <div className="grid grid-cols-5 gap-2">
          {[
            { key: "oneX",  label: "1X",   stake: oneXStake,  def: oneXDef,  tgt: zeroTarget,  handler: handle1XWin,  color: "bg-purple-600" },
            { key: "twoX",  label: "2X",   stake: twoXStake,  def: twoXDef,  tgt: sixTarget,   handler: handle2XWin,  color: "bg-pink-600"   },
            { key: "ht12",  label: "HT12", stake: ht12Stake,  def: ht12Def,  tgt: ht21Target,  handler: handleHt12Win,color: "bg-blue-600"   },
            { key: "ft40",  label: "FT40", stake: ft40Stake,  def: ft40Def,  tgt: ft40Target,  handler: handleFt40Win,color: "bg-indigo-600" },
            { key: "ft41",  label: "FT41", stake: ft41Stake,  def: ft41Def,  tgt: ft41Target,  handler: handleFt41Win,color: "bg-violet-600" },
          ].map(({ key, label, stake, def, tgt, handler, color }) => (
            <button key={key} onClick={handler} disabled={!fixture || clicked.has(key)}
              className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${
                clicked.has(key) ? "bg-white text-gray-700 ring-1 ring-gray-300"
                : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                : `${color} text-white`}`}>
              <div className="font-black text-[11px]">{label}</div>
              <div className="text-[10px] mt-0.5">{stake || "–"}</div>
              <div className="text-[8px] opacity-60 mt-0.5">D:{def}</div>
              <div className="text-[8px] opacity-60">T:{tgt}</div>
            </button>
          ))}
        </div>

        {/* TEAM B — 5 buttons (100 default) */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM B —</div>
        <div className="grid grid-cols-5 gap-2">
          {[
            { key: "tg0",  label: "0G",   stake: tg0Stake,  def: tg0Def,  tgt: zeroTarget,  handler: handleTg0Win,  color: "bg-cyan-600"   },
            { key: "tg6",  label: "6G",   stake: tg6Stake,  def: tg6Def,  tgt: sixTarget,   handler: handleTg6Win,  color: "bg-teal-600"   },
            { key: "ht21", label: "HT21", stake: ht21Stake, def: ht21Def, tgt: ht21Target,  handler: handleHt21Win, color: "bg-emerald-600" },
            { key: "ht30", label: "HT30", stake: ht30Stake, def: ht30Def, tgt: ft40Target,  handler: handleHt30Win, color: "bg-green-600"   },
            { key: "x2",   label: "X2",   stake: x2Stake,   def: x2Def,   tgt: ft41Target,  handler: handleX2Win,   color: "bg-lime-600"    },
          ].map(({ key, label, stake, def, tgt, handler, color }) => (
            <button key={key} onClick={handler} disabled={!fixture || clicked.has(key)}
              className={`py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${
                clicked.has(key) ? "bg-white text-gray-700 ring-1 ring-gray-300"
                : !fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
                : `${color} text-white`}`}>
              <div className="font-black text-[11px]">{label}</div>
              <div className="text-[10px] mt-0.5">{stake || "–"}</div>
              <div className="text-[8px] opacity-60 mt-0.5">D:{def}</div>
              <div className="text-[8px] opacity-60">T:{tgt}</div>
            </button>
          ))}
        </div>

        {/* INPUTS */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input value={inputA} onChange={(e) => setInputA(e.target.value)} placeholder="Home"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
            <span className="font-black text-lg text-red-500 shrink-0">VS</span>
            <input value={inputB} onChange={(e) => setInputB(e.target.value)} placeholder="Away"
              className="flex-1 min-w-0 px-3 py-2.5 border border-red-600 rounded-xl text-center text-sm bg-transparent text-white placeholder-red-400 focus:outline-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={!!fixture}
              className={`flex-1 py-3 font-bold text-sm rounded-xl transition active:scale-95 shadow ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
              CALCULATE
            </button>
            <button onClick={clearForNext} disabled={!fixture}
              className={`flex-1 py-3 font-bold text-sm rounded-xl transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-green-700 text-white hover:bg-green-600"}`}>
              NEXT
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-3 gap-x-4 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="flex justify-between col-span-3"><span className="text-gray-400">Small Def</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          {fixture && (
            <div className="col-span-3 pt-1 border-t border-white/10 text-center font-bold">
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
