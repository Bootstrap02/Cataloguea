
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";

const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

/*
  STATE STRUCTURE:
  ─────────────────────────────────────────────────────
  TEAM A:  target (200 default) + deficit (100 default)
    stake = (target + deficit) / (odd - 1)
    On loss → deficit += stake
    On win  → deficit = 100, target = 200, bank += 200

  TEAM B:  uses TeamA's deficit as its target + own deficit (0 default)
    stake = (teamADef + ownDef) / (odd - 1)
    On loss → ownDef += stake
    On win  → ownDef = 0, bank += 100

  PAIRINGS:
    1X   ↔ TG0   (1X deficit = TG0 target)
    2X   ↔ TG6   (2X deficit = TG6 target)
    HT12 ↔ HT21  (HT12 deficit = HT21 target)
    FT40 ↔ HT30  (FT40 deficit = HT30 target)
    FT41 ↔ X2    (FT41 deficit = X2 target)
  ─────────────────────────────────────────────────────
*/

const Homepage = () => {

  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture, setFixture] = useState(null);

  /* ── WINNER ── */
  const [baseStake,    setBaseStake]    = useState(10000);
  const [deficit,      setDeficit]      = useState(0);
  const [winnerStake,  setWinnerStake]  = useState(0);
  const [bank,         setBank]         = useState(1500);
  const [smallDeficit, setSmallDeficit] = useState(0);

  /* ── TEAM A: target (200) + deficit (100) ── */
  const [oneXTgt,  setOneXTgt]  = useState(200);
  const [twoXTgt,  setTwoXTgt]  = useState(200);
  const [ht12Tgt,  setHt12Tgt]  = useState(200);
  const [ft40Tgt,  setFt40Tgt]  = useState(200);
  const [ft41Tgt,  setFt41Tgt]  = useState(200);

  const [oneXDef,  setOneXDef]  = useState(100);
  const [twoXDef,  setTwoXDef]  = useState(100);
  const [ht12Def,  setHt12Def]  = useState(100);
  const [ft40Def,  setFt40Def]  = useState(100);
  const [ft41Def,  setFt41Def]  = useState(100);

  /* ── TEAM B: own deficit (0 default), target = paired TeamA deficit ── */
  const [tg0Def,  setTg0Def]  = useState(0);
  const [tg6Def,  setTg6Def]  = useState(0);
  const [ht21Def, setHt21Def] = useState(0);
  const [ht30Def, setHt30Def] = useState(0);
  const [x2Def,   setX2Def]   = useState(0);

  /* ── CURRENT GAME STAKES (mutable per game) ── */
  const [stakes, setStakes] = useState({
    oneX: 0, twoX: 0, ht12: 0, ft40: 0, ft41: 0,
    tg0: 0,  tg6: 0,  ht21: 0, ht30: 0, x2: 0,
  });

  /* ── WHICH ASSETS WON THIS GAME ── */
  const [winners, setWinners] = useState(new Set());
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
      const d   = res.data || {};
      setBaseStake(d.base         ?? 10000);
      setDeficit(d.deficit        ?? 0);
      setBank(d.bank              ?? 1500);
      setSmallDeficit(d.smallDeficit ?? 0);
      setOneXTgt(d.oneXTgt   ?? 200); setOneXDef(d.oneXDef   ?? 100);
      setTwoXTgt(d.twoXTgt   ?? 200); setTwoXDef(d.twoXDef   ?? 100);
      setHt12Tgt(d.ht12Tgt   ?? 200); setHt12Def(d.ht12Def   ?? 100);
      setFt40Tgt(d.ft40Tgt   ?? 200); setFt40Def(d.ft40Def   ?? 100);
      setFt41Tgt(d.ft41Tgt   ?? 200); setFt41Def(d.ft41Def   ?? 100);
      setTg0Def(d.tg0Def     ?? 0);
      setTg6Def(d.tg6Def     ?? 0);
      setHt21Def(d.ht21Def   ?? 0);
      setHt30Def(d.ht30Def   ?? 0);
      setX2Def(d.x2Def       ?? 0);
    } catch (err) { console.error("❌ fetch:", err.message); }
    finally { setIsReloading(false); }
  };

  const saveBase = async () => {
    try {
      await axios.put(API_BASE, {
        base: baseRef.current, deficit, bank, smallDeficit,
        oneXTgt, oneXDef, twoXTgt, twoXDef,
        ht12Tgt, ht12Def, ft40Tgt, ft40Def, ft41Tgt, ft41Def,
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
    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) { alert(`No odds found for "${home}" vs "${away}"`); return; }

    setFixture(found);
    setClicked(new Set());
    setWinners(new Set());

    /* ── Winner stake → smallDeficit ── */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);
    const wStake = Math.max(Math.round(newBase / found.winner), 10);
    setWinnerStake(wStake);
    setSmallDeficit((prev) => prev + wStake);

    /* ── Bank absorbs winner/5 per Team A slot ── */
    const share = Math.ceil(wStake / 5);
    let bankNow = bank;
    let ox = oneXDef, tx = twoXDef, h12 = ht12Def, f40 = ft40Def, f41 = ft41Def;

    const absorb = (defVal, sh, bnk) => {
      if (bnk >= sh) return { def: defVal, bank: bnk - sh };
      return { def: defVal + (sh - bnk), bank: 0 };
    };

    let r;
    r = absorb(ox,  share, bankNow); ox  = r.def; bankNow = r.bank;
    r = absorb(tx,  share, bankNow); tx  = r.def; bankNow = r.bank;
    r = absorb(h12, share, bankNow); h12 = r.def; bankNow = r.bank;
    r = absorb(f40, share, bankNow); f40 = r.def; bankNow = r.bank;
    r = absorb(f41, share, bankNow); f41 = r.def; bankNow = r.bank;

    setBank(bankNow);
    /* Note: these updated defs are used for stake calc below */

    /* ── Calc stakes ── */
    const c = (tgt, def, odd) =>
      odd > 1.01 ? Math.max(Math.round((tgt + def) / (odd - 1)), 10) : 0;

    // Use local vars (ox,tx,h12,f40,f41) so bank adjustment reflects in stakes
    setStakes({
      oneX:  c(oneXTgt,  ox,  found.oneX      || 0),
      twoX:  c(twoXTgt,  tx,  found.twoX      || 0),
      ht12:  c(ht12Tgt,  h12, found.ht12      || 0),
      ft40:  c(ft40Tgt,  f40, found.ft40      || 0),
      ft41:  c(ft41Tgt,  f41, found.ft41      || 0),
      // Team B: target = paired TeamA deficit (local vars), own def
      tg0:   c(ox,  tg0Def,  found.zeroGoals || 0),
      tg6:   c(tx,  tg6Def,  found.sixGoals  || 0),
      ht21:  c(h12, ht21Def, found.ht21      || 0),
      ht30:  c(f40, ht30Def, found.ht30      || 0),
      x2:    c(f41, x2Def,   found.x2        || 0),
    });

    // Persist updated Team A deficits after bank absorption
    setOneXDef(ox); setTwoXDef(tx); setHt12Def(h12);
    setFt40Def(f40); setFt41Def(f41);
  };

  /* ================================================================
     WIN HANDLERS — just mark asset as winner, don't clear yet
     ================================================================ */
  const markWin = (key) => {
    if (!fixture || clicked.has(key)) return;
    setClicked((prev) => new Set([...prev, key]));
    setWinners((prev) => new Set([...prev, key]));
  };

  /* ================================================================
     NEXT — accumulate losses, reset wins, then clear
     ================================================================ */
  const handleNext = () => {
    if (!fixture) return;

    /* For each asset: if it won → stake is 0 (already won, no loss).
       If it lost → add stake to its deficit. */

    const lost = (key) => !winners.has(key);

    /* Team A deficits */
    if (lost("oneX") && stakes.oneX > 0) setOneXDef((p) => p + stakes.oneX);
    if (lost("twoX") && stakes.twoX > 0) setTwoXDef((p) => p + stakes.twoX);
    if (lost("ht12") && stakes.ht12 > 0) setHt12Def((p) => p + stakes.ht12);
    if (lost("ft40") && stakes.ft40 > 0) setFt40Def((p) => p + stakes.ft40);
    if (lost("ft41") && stakes.ft41 > 0) setFt41Def((p) => p + stakes.ft41);

    /* Team A wins → reset deficit to 100, target stays 200, bank +200 */
    if (winners.has("oneX"))  { setOneXDef(100);  setOneXTgt(200);    setBank((p) => p + 200); }
    if (winners.has("twoX"))  { setTwoXDef(100);  setTwoXTgt(200);    setBank((p) => p + 200); }
    if (winners.has("ht12"))  { setHt12Def(100);  setHt12Tgt(200);    setBank((p) => p + 200); }
    if (winners.has("ft40"))  { setFt40Def(100);  setFt40Tgt(200);    setBank((p) => p + 200); }
    if (winners.has("ft41"))  { setFt41Def(100);  setFt41Tgt(200);    setBank((p) => p + 200); }

    /* Team B deficits */
    if (lost("tg0")  && stakes.tg0  > 0) setTg0Def((p)  => p + stakes.tg0);
    if (lost("tg6")  && stakes.tg6  > 0) setTg6Def((p)  => p + stakes.tg6);
    if (lost("ht21") && stakes.ht21 > 0) setHt21Def((p) => p + stakes.ht21);
    if (lost("ht30") && stakes.ht30 > 0) setHt30Def((p) => p + stakes.ht30);
    if (lost("x2")   && stakes.x2   > 0) setX2Def((p)   => p + stakes.x2);

    /* Team B wins → reset own deficit to 0, bank +100 */
    if (winners.has("tg0"))  { setTg0Def(0);  setOneXDef(100);  setBank((p) => p + 100); }
    if (winners.has("tg6"))  { setTg6Def(0);  setTwoXDef(100);  setBank((p) => p + 100); }
    if (winners.has("ht21")) { setHt21Def(0); setHt12Def(100);   setBank((p) => p + 100); }
    if (winners.has("ht30")) { setHt30Def(0); setFt40Def(100);   setBank((p) => p + 100); }
    if (winners.has("x2"))   { setX2Def(0);   setFt41Def(100);     setBank((p) => p + 100); }

    clearForNext();
  };

  /* ================================================================
     6-0 JACKPOT
     ================================================================ */
  const handleJackpot = () => {
    setClicked((prev) => new Set([...prev, "six"]));
    setBaseStake(10000);
    setDeficit(0);
    setSmallDeficit(0);
  };

  /* ================================================================
     CLEAR
     ================================================================ */
  const clearForNext = () => {
    setInputA(""); setInputB("");
    setFixture(null);
    setClicked(new Set());
    setWinners(new Set());
    setWinnerStake(0);
    setStakes({
      oneX: 0, twoX: 0, ht12: 0, ft40: 0, ft41: 0,
      tg0: 0,  tg6: 0,  ht21: 0, ht30: 0, x2: 0,
    });
    if(tg0Def > 1000) {
      setBaseStake((prev) => prev + 1000);
      setTg0Def((prev) => prev - 1000);
    } 
    if(tg6Def > 1000) {
      setBaseStake((prev) => prev + 1000);
      setTg6Def((prev) => prev - 1000);
    } 
    if(ht21Def > 1000) {
      setBaseStake((prev) => prev + 1000);
      setHt21Def((prev) => prev - 1000);
    } 
    if(ht30Def > 1000) {
      setBaseStake((prev) => prev + 1000);
      setHt30Def((prev) => prev - 1000);
    } 
    if(x2Def > 1000) {
      setBaseStake((prev) => prev + 1000);
      setX2Def((prev) => prev - 1000);
    } 
    saveBase();
  };

  const teamA = sanitizeTeam(inputA) || "HME";
  const teamB = sanitizeTeam(inputB) || "AWY";

  /* ── Button style helper ── */
  const btnClass = (key, color) =>
    `py-4 rounded-2xl font-bold text-xs transition active:scale-95 ${
      winners.has(key)
        ? "bg-green-500 text-white ring-2 ring-green-300"
        : !fixture
        ? "bg-gray-700 opacity-40 cursor-not-allowed text-white"
        : `${color} text-white`
    }`;

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
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={11} />
            {isReloading ? "…" : "Reload"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 pb-4 gap-3 overflow-y-auto">

        {/* WINNER / JACKPOT / NEXT */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={handleJackpot}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${clicked.has("six") ? "bg-white text-yellow-500 ring-2 ring-yellow-400" : "bg-yellow-400 text-black"}`}>
            <div className="font-black">6–0</div>
            <div className="text-[11px] mt-0.5 opacity-80">{winnerStake || "–"}</div>
          </button>
          <button onClick={handleNext} disabled={!fixture}
            className={`py-4 rounded-2xl font-extrabold text-sm transition active:scale-95 shadow ${!fixture ? "bg-gray-700 opacity-40 cursor-not-allowed text-white" : "bg-green-700 text-white hover:bg-green-600"}`}>
            <div className="font-black">NEXT</div>
            <div className="text-[9px] mt-0.5 opacity-70">settle + continue</div>
          </button>
          <div className="bg-white/10 rounded-2xl flex flex-col items-center justify-center text-[10px] font-mono gap-0.5">
            <div>SmDef: <strong className="text-blue-300">{smallDeficit}</strong></div>
            <div>Bank: <strong className="text-emerald-300">{bank}</strong></div>
          </div>
        </div>

        {/* TEAM A */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM A — (Tgt:200 | Def:100 default)</div>
        <div className="grid grid-cols-5 gap-2">
          {[
            { key: "oneX",  label: "1X",   stake: stakes.oneX,  tgt: oneXTgt,  def: oneXDef,  color: "bg-purple-600" },
            { key: "twoX",  label: "2X",   stake: stakes.twoX,  tgt: twoXTgt,  def: twoXDef,  color: "bg-pink-600"   },
            { key: "ht12",  label: "HT12", stake: stakes.ht12,  tgt: ht12Tgt,  def: ht12Def,  color: "bg-blue-600"   },
            { key: "ft40",  label: "FT40", stake: stakes.ft40,  tgt: ft40Tgt,  def: ft40Def,  color: "bg-indigo-600" },
            { key: "ft41",  label: "FT41", stake: stakes.ft41,  tgt: ft41Tgt,  def: ft41Def,  color: "bg-violet-600" },
          ].map(({ key, label, stake, tgt, def, color }) => (
            <button key={key} onClick={() => markWin(key)} disabled={!fixture}
              className={btnClass(key, color)}>
              <div className="font-black text-[11px]">{label}</div>
              <div className="text-[10px] mt-0.5">{stake || "–"}</div>
              <div className="text-[8px] opacity-60 mt-0.5">T:{tgt}</div>
              <div className="text-[8px] opacity-60">D:{def}</div>
            </button>
          ))}
        </div>

        {/* TEAM B */}
        <div className="text-[9px] text-gray-400 text-center tracking-widest">— TEAM B — (uses TeamA def as target)</div>
        <div className="grid grid-cols-5 gap-2">
          {[
            { key: "tg0",  label: "0G",   stake: stakes.tg0,  tgt: oneXDef,  def: tg0Def,  color: "bg-cyan-600"    },
            { key: "tg6",  label: "6G",   stake: stakes.tg6,  tgt: twoXDef,  def: tg6Def,  color: "bg-teal-600"    },
            { key: "ht21", label: "HT21", stake: stakes.ht21, tgt: ht12Def,  def: ht21Def, color: "bg-emerald-600" },
            { key: "ht30", label: "HT30", stake: stakes.ht30, tgt: ft40Def,  def: ht30Def, color: "bg-green-600"   },
            { key: "x2",   label: "X2",   stake: stakes.x2,   tgt: ft41Def,  def: x2Def,   color: "bg-lime-600"    },
          ].map(({ key, label, stake, tgt, def, color }) => (
            <button key={key} onClick={() => markWin(key)} disabled={!fixture}
              className={btnClass(key, color)}>
              <div className="font-black text-[11px]">{label}</div>
              <div className="text-[10px] mt-0.5">{stake || "–"}</div>
              <div className="text-[8px] opacity-60 mt-0.5">T:{tgt}</div>
              <div className="text-[8px] opacity-60">D:{def}</div>
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
          <button onClick={handleSubmit} disabled={!!fixture}
            className={`w-full py-3 font-bold text-sm rounded-xl transition active:scale-95 shadow ${fixture ? "bg-gray-700 opacity-50 cursor-not-allowed text-white" : "bg-red-700 text-white hover:bg-red-600"}`}>
            CALCULATE
          </button>
        </div>

        {/* STATS */}
        <div className="bg-white/5 rounded-2xl p-3 text-[10px] grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div className="flex justify-between"><span className="text-gray-400">Base</span><strong className="text-green-400">{baseStake}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Deficit</span><strong className="text-red-400">{deficit}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Bank</span><strong className="text-emerald-400">{bank}</strong></div>
          <div className="flex justify-between"><span className="text-gray-400">Small Def</span><strong className="text-blue-400">{smallDeficit}</strong></div>
          <div className="col-span-2 border-t border-white/10 pt-1 grid grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex justify-between"><span className="text-gray-500">1X T:{oneXTgt}</span><strong className="text-purple-300">D:{oneXDef}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">2X T:{twoXTgt}</span><strong className="text-pink-300">D:{twoXDef}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">HT12 T:{ht12Tgt}</span><strong className="text-blue-300">D:{ht12Def}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">FT40 T:{ft40Tgt}</span><strong className="text-indigo-300">D:{ft40Def}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">FT41 T:{ft41Tgt}</span><strong className="text-violet-300">D:{ft41Def}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">0G</span><strong className="text-cyan-300">D:{tg0Def}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">6G</span><strong className="text-teal-300">D:{tg6Def}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">HT21</span><strong className="text-emerald-300">D:{ht21Def}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">HT30</span><strong className="text-green-300">D:{ht30Def}</strong></div>
            <div className="flex justify-between"><span className="text-gray-500">X2</span><strong className="text-lime-300">D:{x2Def}</strong></div>
          </div>
          {fixture && (
            <div className="col-span-2 pt-1 border-t border-white/10 text-center font-bold">
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
