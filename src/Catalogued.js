

import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from "react-icons/fi";
import {
  applySoloMatrixJackpot,
  persistStrategyState,
  settleSoloMatrixState,
  submitSoloMatrixFixture,
} from "./strategy/soloMatrixSettlement";
import { createCatalogueaAutomationPort } from "./strategy/catalogueaAutomationPort";
import {
  createBackupMeta,
  readStoredStrategyState,
  shouldUseBackendRecovery,
  withBackupMeta,
} from "./strategy/localStatePersistence";

const sanitizeTeam = (v) => v.toLowerCase().replace(/[^a-z]/g, "");
const API_BASE = process.env.REACT_APP_CATALOGUEA_API_BASE
  || "https://campusbuy-backend-nkmx.onrender.com/betking";
const LS_KEY   = "virt-epl-solo-v1";
const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

const ALL_ASSETS = ["oneX","twoX","x2","tg0","tg6","ht12","ht21","ht30","ft40","ft41"];

const ASSET_LABELS = {
  oneX:"1X", twoX:"2X", x2:"X2", tg0:"TG0", tg6:"TG6",
  ht12:"HT12", ht21:"HT21", ht30:"HT30", ft40:"FT40", ft41:"FT41"
};

const ASSET_COLORS = {
  oneX:"bg-purple-600", twoX:"bg-pink-600", x2:"bg-lime-600",
  tg0:"bg-cyan-600", tg6:"bg-teal-600", ht12:"bg-blue-600",
  ht21:"bg-emerald-600", ht30:"bg-green-700", ft40:"bg-indigo-600", ft41:"bg-violet-600"
};

const emptyMap = () => Object.fromEntries(ALL_ASSETS.map(k => [k, 0]));

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [fixture,     setFixture]     = useState(null);

  /* ── WINNER (6-0) ── */
  const [baseStake,   setBaseStake]   = useState(10000);
  const [deficit,     setDeficit]     = useState(0);
  const [winnerStake, setWinnerStake] = useState(0);

  /* ── SHARED SMALL DEFICIT ── */
  const [smallDeficit, setSmallDeficit] = useState(0);
  const [shadow,       setShadow]       = useState(0);
  const [bank,         setBank]         = useState(0);

  /* ── PER-ASSET STATES ── */
  const [privateDef,   setPrivateDef]   = useState(emptyMap());
  const [bigDef,       setBigDef]       = useState(emptyMap());
  const [brokenTarget, setBrokenTarget] = useState(emptyMap());

  /* ── GAME STAKES ── */
  const [gameStakes, setGameStakes] = useState(emptyMap());
  const [bigStakes,  setBigStakes]  = useState({});

  /* ── WINNERS / CLICKED ── */
  const [winners,    setWinners]    = useState(new Set());
  const [bigWinners, setBigWinners] = useState(new Set());
  const [clicked,    setClicked]    = useState(new Set());

  const baseRef = useRef(baseStake);
  const automationSettlementsRef = useRef([]);
  const backupInFlightRef = useRef(false);
  const backupTimerRef = useRef(null);
  useEffect(() => { baseRef.current = baseStake; }, [baseStake]);

  /* ================================================================
     PERSIST CORE DATA PARSER
     ================================================================ */
  const applyData = useCallback((d) => {
    setBaseStake(d.base            ?? 10000);
    setDeficit(d.deficit           ?? 0);
    setSmallDeficit(d.smallDeficit ?? 0);
    setShadow(d.shadow             ?? 0);
    setBank(d.bank                 ?? 0);
    setPrivateDef(d.privateDef     || emptyMap());
    setBigDef(d.bigDef             || emptyMap());
    setBrokenTarget(d.brokenTarget || emptyMap());
    if (Array.isArray(d.automationSettlements)) {
      automationSettlementsRef.current = d.automationSettlements;
    }
  }, []);

  /* ================================================================
     PERSIST LAYER 1: LOCAL STORAGE (AUTOMATIC & IMMEDIATE)
     ================================================================ */
  const fetchBase = useCallback(() => {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) {
        const parsed = readStoredStrategyState(s);
        if (parsed) {
          applyData(parsed);
          console.log("💾 L1: Loaded authoritative local strategy state");
        } else {
          console.warn("⚠️ L1: Ignored malformed local strategy state.");
        }
      }
    } catch (err) {
      console.error("❌ L1 Load error:", err.message);
    }
  }, [applyData]);

  const updateBackupMeta = useCallback((meta) => {
    try {
      const current = localStorage.getItem(LS_KEY);
      const parsed = current ? JSON.parse(current) : {};
      localStorage.setItem(LS_KEY, JSON.stringify({
        ...parsed,
        backupMeta: {
          ...(parsed.backupMeta || {}),
          ...meta,
        },
      }));
    } catch (err) {
      console.error("❌ L1 Backup metadata update error:", err.message);
    }
  }, []);

  const saveBase = useCallback((overrides = {}, { throwOnError = false } = {}) => {
    const p = withBackupMeta({
      base: baseRef.current, deficit,
      smallDeficit, shadow, bank,
      privateDef, bigDef, brokenTarget,
      automationSettlements: automationSettlementsRef.current,
      observedAt: new Date().toISOString(),
      ...overrides,
    }, {
      status: "local-authoritative",
      lastAttemptAt: new Date().toISOString(),
    });
    try {
      persistStrategyState(localStorage, LS_KEY, p, p.automationSettlements);
      console.log("💾 L1: Saved to Local Storage");
    } catch (err) {
      console.error("❌ L1 Save error:", err.message);
      if (throwOnError) {
        throw new Error(`Cataloguea strategy persistence failed: ${err.message}`, {
          cause: err,
        });
      }
    }
  }, [deficit, smallDeficit, shadow, bank, privateDef, bigDef, brokenTarget]);

  /* ================================================================
     PERSIST LAYER 2: BACKEND API (MANUAL VIA BUTTONS ONLY)
     ================================================================ */
  const fetchFromAPI = useCallback(async () => {
    setIsReloading(true);
    try {
      const res = await axios.get(API_BASE);
      const backendState = res.data && typeof res.data === "object" ? res.data : null;
      if (!backendState) {
        console.warn("☁️ L2: API returned no valid state; local state remains authoritative.");
        return;
      }

      const localState = readStoredStrategyState(localStorage.getItem(LS_KEY));
      if (localState && !shouldUseBackendRecovery(localState, backendState)) {
        console.warn("☁️ L2: Local strategy state is newer than backend snapshot. Recovery skipped.");
        alert("Local strategy state is still newer than the backend backup. Recovery was skipped.");
        return;
      }

      const mergedState = {
        ...backendState,
        automationSettlements: automationSettlementsRef.current,
        backupMeta: createBackupMeta({
          status: "manual-recovery",
          lastAttemptAt: new Date().toISOString(),
          lastSuccessfulBackupAt: new Date().toISOString(),
        }),
      };
      applyData(mergedState);
      persistStrategyState(localStorage, LS_KEY, mergedState, automationSettlementsRef.current);
      console.log("☁️ L2: Manual recovery accepted from API without overwriting newer local state");
    } catch (err) {
      console.error("❌ L2 Fetch failed:", err.message);
      updateBackupMeta(createBackupMeta({
        status: "manual-recovery-failed",
        errorMessage: err.message,
        lastAttemptAt: new Date().toISOString(),
      }));
      alert("API fetch failed. Local Storage remains the runtime source of truth.");
    } finally {
      setIsReloading(false);
    }
  }, [applyData, updateBackupMeta]);

  const triggerHourlyBackup = useCallback(async () => {
    if (backupInFlightRef.current) {
      return;
    }

    const nextAttempt = new Date().toISOString();
    updateBackupMeta(createBackupMeta({
      status: "backup-attempt",
      errorMessage: null,
      lastAttemptAt: nextAttempt,
    }));

    backupInFlightRef.current = true;
    const payload = {
      base: baseRef.current,
      deficit,
      smallDeficit,
      shadow,
      bank,
      privateDef,
      bigDef,
      brokenTarget,
    };

    try {
      await axios.put(API_BASE, payload);
      const successAt = new Date().toISOString();
      updateBackupMeta(createBackupMeta({
        status: "backup-success",
        lastAttemptAt: nextAttempt,
        lastSuccessfulBackupAt: successAt,
      }));
      console.log("✅ L2: Hourly backup synced to API");
    } catch (err) {
      updateBackupMeta(createBackupMeta({
        status: "backup-failed",
        errorMessage: err.message,
        lastAttemptAt: nextAttempt,
      }));
      console.error("❌ L2 Hourly backup failed:", err.message);
    } finally {
      backupInFlightRef.current = false;
    }
  }, [deficit, smallDeficit, shadow, bank, privateDef, bigDef, brokenTarget, updateBackupMeta]);

  const saveToAPI = useCallback(async () => {
    const p = {
      base: baseRef.current, deficit,
      smallDeficit, shadow, bank,
      privateDef, bigDef, brokenTarget,
    };
    try {
      await axios.put(API_BASE, p);
      updateBackupMeta(createBackupMeta({
        status: "manual-backup-success",
        lastAttemptAt: new Date().toISOString(),
        lastSuccessfulBackupAt: new Date().toISOString(),
      }));
      console.log("✅ L2: Master Backup Synced to API");
      alert("State fully backed up to API successfully.");
    } catch (err) {
      updateBackupMeta(createBackupMeta({
        status: "manual-backup-failed",
        errorMessage: err.message,
        lastAttemptAt: new Date().toISOString(),
      }));
      console.error("❌ L2 Sync failed:", err.message);
      alert("API backup failed. Local Storage is still active.");
    }
  }, [deficit, smallDeficit, shadow, bank, privateDef, bigDef, brokenTarget, updateBackupMeta]);

  // Handle baseline initial app mount load via L1 Local Storage
  useEffect(() => {
    fetchBase();
    return () => {
      if (backupTimerRef.current) {
        clearInterval(backupTimerRef.current);
      }
    };
  }, [fetchBase]);

  useEffect(() => {
    if (backupTimerRef.current) {
      clearInterval(backupTimerRef.current);
    }
    backupTimerRef.current = setInterval(() => {
      void triggerHourlyBackup();
    }, BACKUP_INTERVAL_MS);
    return () => {
      if (backupTimerRef.current) {
        clearInterval(backupTimerRef.current);
      }
    };
  }, [triggerHourlyBackup]);

  /* ================================================================
     HANDLE SUBMIT
     ================================================================ */
  const handleSubmit = (e) => {
    e.preventDefault();
    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";
    const found = odds.find(o => o.home === home && o.away === away);
    if (!found) { alert(`No odds for ${home} vs ${away}`); return; }

    const submitted = submitSoloMatrixFixture({
      baseStake,
      deficit,
      smallDeficit,
      privateDef,
      bigDef,
      brokenTarget,
      clicked,
      winners,
      bigWinners,
    }, found, ALL_ASSETS);
    setFixture(submitted.fixture);
    setBaseStake(submitted.baseStake);
    setDeficit(submitted.deficit);
    setWinnerStake(submitted.winnerStake);
    setSmallDeficit(submitted.smallDeficit);
    setShadow(submitted.shadow);
    setGameStakes(submitted.gameStakes);
    setBigStakes(submitted.bigStakes);
    setBrokenTarget(submitted.brokenTarget);
    setClicked(submitted.clicked);
    setWinners(submitted.winners);
    setBigWinners(submitted.bigWinners);
  };

  const markWin    = (key) => {
    if (!fixture || clicked.has(`n_${key}`)) return;
    setClicked(p => new Set([...p, `n_${key}`]));
    setWinners(p => new Set([...p, key]));
  };

  const markBigWin = (key) => {
    if (!fixture || clicked.has(`b_${key}`)) return;
    setClicked(p => new Set([...p, `b_${key}`]));
    setBigWinners(p => new Set([...p, key]));
  };

  /* ── 6-0 jackpot ── */
  const handleJackpot = () => {
    const jackpotState = applySoloMatrixJackpot({
      baseStake,
      deficit,
      smallDeficit,
      shadow,
      clicked,
    });
    setClicked(jackpotState.clicked);
    setBaseStake(jackpotState.baseStake);
    setDeficit(jackpotState.deficit);
    setSmallDeficit(jackpotState.smallDeficit);
    setShadow(jackpotState.shadow);
    saveBase({
      base: jackpotState.baseStake,
      deficit: jackpotState.deficit,
      smallDeficit: jackpotState.smallDeficit,
      shadow: jackpotState.shadow,
    });
  };

  /* ================================================================
     HANDLE NEXT
     ================================================================ */

  /* ================================================================
     HANDLE NEXT
     ================================================================ */
  const handleNext = (settlement = {}) => {
    if (!fixture) return { status: "not_settled" };
    const resultId = typeof settlement?.resultId === "string"
      ? settlement.resultId
      : null;
    if (resultId && automationSettlementsRef.current.some((receipt) => (
      typeof receipt === "string" ? receipt === resultId : receipt.resultId === resultId
    ))) {
      return { status: "already_settled", resultId };
    }

    const settledState = settleSoloMatrixState({
      fixture,
      baseStake,
      deficit,
      smallDeficit,
      shadow,
      bank,
      privateDef,
      bigDef,
      brokenTarget,
      gameStakes,
      winners,
      bigWinners,
    }, ALL_ASSETS);
    const automationSettlements = resultId
      ? [
        ...automationSettlementsRef.current,
        {
          resultId,
          fixture: { id: fixture.id, home: fixture.home, away: fixture.away },
          result: settlement.result,
          actionOperationId: settlement.actionOperationId,
        },
      ]
      : automationSettlementsRef.current;

    saveBase({
      base: settledState.baseStake,
      deficit: settledState.deficit,
      smallDeficit: settledState.smallDeficit,
      shadow: settledState.shadow,
      bank: settledState.bank,
      privateDef: { ...settledState.privateDef },
      bigDef: { ...settledState.bigDef },
      brokenTarget: { ...settledState.brokenTarget },
      automationSettlements,
    }, { throwOnError: Boolean(resultId) });
    automationSettlementsRef.current = automationSettlements;

    setSmallDeficit(settledState.smallDeficit);
    setShadow(settledState.shadow);
    setBank(settledState.bank);
    setDeficit(settledState.deficit);
    setBaseStake(settledState.baseStake);
    setPrivateDef(settledState.privateDef);
    setBigDef(settledState.bigDef);
    setBrokenTarget(settledState.brokenTarget);

    setFixture(null); setInputA(""); setInputB("");
    setGameStakes(emptyMap()); setBigStakes({});
    setWinners(new Set()); setBigWinners(new Set());
    setClicked(new Set()); setWinnerStake(0);

    return {
      status: "settled",
      resultId,
      strategyState: {
        status: "settled",
        financialState: {
          baseStake: settledState.baseStake,
          deficit: settledState.deficit,
          smallDeficit: settledState.smallDeficit,
          shadow: settledState.shadow,
          bank: settledState.bank,
          privateDef: { ...settledState.privateDef },
          bigDef: { ...settledState.bigDef },
          brokenTarget: { ...settledState.brokenTarget },
        },
      },
    };
  };

  const readStrategySnapshot = useCallback(() => ({
    fixture: fixture ? { ...fixture } : null,
    baseStake,
    deficit,
    winnerStake,
    smallDeficit,
    shadow,
    bank,
    privateDef: { ...privateDef },
    bigDef: { ...bigDef },
    brokenTarget: { ...brokenTarget },
    gameStakes: { ...gameStakes },
    bigStakes: { ...bigStakes },
    winners: [...winners],
    bigWinners: [...bigWinners],
    clicked: [...clicked],
    automationSettlements: automationSettlementsRef.current.map((receipt) => (
      typeof receipt === "string"
        ? receipt
        : {
          ...receipt,
          fixture: receipt.fixture ? { ...receipt.fixture } : undefined,
          result: receipt.result ? { ...receipt.result } : undefined,
        }
    )),
    observedAt: new Date().toISOString(),
  }), [
    fixture, baseStake, deficit, winnerStake, smallDeficit, shadow, bank,
    privateDef, bigDef, brokenTarget, gameStakes, bigStakes, winners,
    bigWinners, clicked,
  ]);

  const strategyPort = createCatalogueaAutomationPort({
    readSnapshot: readStrategySnapshot,
    settleStrategyResult: (normalizedResult, resultId, snapshot, actionOperationId) => (
      handleNext({
        resultId,
        result: normalizedResult.result,
        actionOperationId,
      })
    ),
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return undefined;
    window.catalogueaAutomation = strategyPort;
    return () => {
      if (window.catalogueaAutomation === strategyPort) {
        delete window.catalogueaAutomation;
      }
    };
  }, [strategyPort]);
  const teamA     = sanitizeTeam(inputA) || "HME";
  const teamB     = sanitizeTeam(inputB) || "AWY";
  const hasBigDefs = ALL_ASSETS.some(k => (bigDef[k] || 0) > 0);

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-black to-slate-900 text-white flex flex-col">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0 border-b border-white/5">
        <div>
          <h1 className="text-sm font-black text-slate-300 tracking-wider uppercase">⚡ Solo Matrix</h1>
          <div className="text-[9px] text-slate-500 mt-0.5">
            SD:{smallDeficit} · shadow:{shadow} · bank:{bank}
          </div>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button onClick={saveToAPI}
            className="px-4 py-1.5 bg-emerald-600 font-bold text-white text-xs tracking-wide active:bg-emerald-700 transition">💾 API</button>
          <button onClick={fetchFromAPI} disabled={isReloading}
            className="px-4 py-1.5 bg-slate-800 font-bold text-white text-xs disabled:opacity-50 active:bg-slate-700 transition flex items-center justify-center gap-1">
            <FiRefreshCw className={isReloading ? "animate-spin" : ""} size={11} />
            <span>API</span>
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

        {/* BIG DEFICIT SECTION */}
        {hasBigDefs && (
          <div className="bg-red-950/60 rounded-2xl p-2 border border-red-500/20">
            <div className="text-[8px] text-red-400 text-center tracking-widest uppercase mb-1">
              — big deficit · bigDef / odd —
            </div>
            {fixture && (() => {
              const totalBig = ALL_ASSETS.filter(k => (bigDef[k] || 0) > 0)
                .reduce((s, k) => s + (bigStakes[k] || 0), 0);
              return totalBig > 0 ? (
                <div className="text-center mb-2">
                  <span className="text-[9px] text-red-300 font-black bg-red-900/50 px-3 py-0.5 rounded-full">
                    TOTAL BIG STAKE: {totalBig}
                  </span>
                </div>
              ) : null;
            })()}
            <div className="grid grid-cols-5 gap-1.5">
              {ALL_ASSETS.filter(k => (bigDef[k] || 0) > 0).map(key => {
                const bStake = bigStakes[key] || 0;
                const sStake = gameStakes[key] || 0;
                const combinedTotal = bStake + sStake;
                const isWon  = bigWinners.has(key);
                return (
                  <button key={key} onClick={() => markBigWin(key)}
                    disabled={!fixture || clicked.has(`b_${key}`)}
                    className={`py-3 rounded-xl font-black text-center transition active:scale-95 border-b-2 flex flex-col items-center justify-between min-h-[72px] gap-0.5 ${
                      isWon ? "bg-green-500 text-white border-green-700"
                      : !fixture ? "bg-red-900/40 border-red-950 opacity-40 cursor-not-allowed"
                      : "bg-red-600 text-white border-red-900"
                    }`}>
                    <div className="text-[8px] opacity-60 tracking-wider">BIG {ASSET_LABELS[key]}</div>
                    
                    {/* ENHANCED VISIBILITY: Large, highlighted total absolute stake readout */}
                    <div className="text-base font-black tracking-tight text-white scale-105 my-0.5 drop-shadow-md">
                      {fixture ? combinedTotal : "—"}
                    </div>

                    <div className="text-[7px] opacity-75 leading-none text-red-200">
                      B:{bStake} · S:{sStake}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SOLO ASSET GRID */}
        <div className="bg-slate-900/60 rounded-2xl p-2 border border-white/5">
          <div className="text-[8px] text-slate-500 text-center tracking-widest uppercase mb-2">
            — solo · (bt + sd + pd) / (odd-1) —
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {ALL_ASSETS.map(key => {
              const stake = gameStakes[key];
              const isWon = winners.has(key);
              const pd    = privateDef[key]   || 0;
              const bt    = brokenTarget[key] || 0;
              return (
                <button key={key} onClick={() => markWin(key)}
                  disabled={!fixture || clicked.has(`n_${key}`)}
                  className={`py-3 rounded-xl font-black text-center transition active:scale-95 border-b-2 flex flex-col items-center gap-0.5 ${
                    isWon ? "bg-green-500 text-white border-green-700"
                    : !fixture ? `${ASSET_COLORS[key]} opacity-25 cursor-not-allowed text-slate-500`
                    : `${ASSET_COLORS[key]} text-white`
                  }`}>
                  <div className="text-xs font-black">{ASSET_LABELS[key]}</div>
                  <div className="text-sm font-black">{stake ?? "—"}</div>
                  <div className="text-[7px] opacity-60 leading-tight">
                    {pd > 0 && <div>P:{pd}</div>}
                    {bt > 0 && <div>T:{bt}</div>}
                  </div>
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
          <div className="col-span-2 border-t border-white/5 pt-1.5">
            <div className="text-[8px] text-slate-500 uppercase tracking-widest text-center mb-1">Per-Asset Deficits</div>
            <div className="grid grid-cols-1 gap-y-1">
              {ALL_ASSETS.map(k => (
                <div key={k} className="flex justify-between items-center text-[9px] bg-white/5 rounded px-2 py-0.5">
                  <span className="text-slate-400 font-bold w-10">{ASSET_LABELS[k]}</span>
                  <span className="text-purple-300">P:<strong>{privateDef[k]}</strong></span>
                  <span className="text-yellow-400">T:<strong>{brokenTarget[k]}</strong></span>
                  {(bigDef[k] || 0) > 0
                    ? <span className="text-red-400">B:<strong>{bigDef[k]}</strong></span>
                    : <span className="text-slate-700">B:—</span>
                  }
                </div>
              ))}
            </div>
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
