// import React, { useState, useEffect, useRef } from "react";
// import axios from "axios";
// import { odds } from "./Scores";

// /* ---------------- UTILS ---------------- */
// const sanitizeTeam = (value) =>
//   value.toLowerCase().replace(/[^a-z]/g, "");

// /* ---------------- API ---------------- */
// const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

// const Homepage = () => {
//   /* ---------------- INPUTS ---------------- */
//   const [inputA, setInputA] = useState("");
//   const [inputB, setInputB] = useState("");

//   /* ---------------- FIXTURE ---------------- */
//   const [fixture, setFixture] = useState(null);

//   /* ---------------- BASE & DEFICIT ---------------- */
//   const [baseStake, setBaseStake] = useState(10000);
//   const [deficit, setDeficit] = useState(0);

//   /* ---------------- STAKES ---------------- */
//   const [amounts, setAmounts] = useState({
//     winnerAmount: 0,
//     homeAmount: 0,
//     drawAmount: 0,
//     awayAmount: 0,
//   });

//   const [orderedStakes, setOrderedStakes] = useState([]);

//   const autosaveRef = useRef(null);

//   /* ---------------- LOAD BASE (RELOAD BUTTON USES SAME LOGIC) ---------------- */
//   const fetchBase = async () => {
//     try {
//       const res = await axios.get(API_BASE);
//       if (res.data?.base !== undefined) {
//         setBaseStake(res.data.base);
//         console.log(res.data.base)
//       }
//     } catch (err) {
//       console.error("Failed to fetch base:", err);
//     }
//   };

//   /* ---------------- SAVE BASE ---------------- */
//   const saveBase = async (value = baseStake) => {
//     try {
//       await axios.put(API_BASE, { base: value });
//     } catch (err) {
//       console.error("Auto/Manual save failed:", err);
//     }
//   };

//   /* ---------------- AUTOSAVE EVERY 10 MINUTES ---------------- */
//   useEffect(() => {
//     autosaveRef.current = setInterval(() => {
//       saveBase();
//     }, 600000);

//     return () => clearInterval(autosaveRef.current);
//   }, [baseStake]);

//   /* ---------------- SUBMIT (NEW GAME) ---------------- */
//   const handleSubmit = (e) => {
//     e.preventDefault();

//     const home = sanitizeTeam(inputA) || "liv";
//     const away = sanitizeTeam(inputB) || "liv";

//     const found = odds.find(
//       (o) => o.home === home && o.away === away
//     );

//     if (!found) {
//       alert(`No odds for ${home} vs ${away}`);
//       return;
//     }

//     /* ✅ ABSORB DEFICIT HERE */
//     const newBase = baseStake + deficit;
//     setBaseStake(newBase);
//     setDeficit(0);

//     /* -------- FIRST STAKE -------- */
//     const winnerAmount = Math.round(
//       newBase / (found.winner - 1)
//     );

//     const oddsMap = {
//       H: found.win,
//       D: found.draw,
//       A: found.lose,
//     };

//     let runningTotal = winnerAmount;
//     const ladder = [];

//     let homeAmount = 0;
//     let drawAmount = 0;
//     let awayAmount = 0;

//     for (const step of found.code) {
//       const odd = oddsMap[step];
//       const stake = Math.round(runningTotal / (odd - 1));

//       ladder.push({ step, stake });

//       if (step === "H") homeAmount = stake;
//       if (step === "D") drawAmount = stake;
//       if (step === "A") awayAmount = stake;

//       runningTotal += stake;
//     }

//     setFixture(found);
//     setOrderedStakes(ladder);
//     setAmounts({
//       winnerAmount,
//       homeAmount,
//       drawAmount,
//       awayAmount,
//     });
//   };

//   /* ---------------- RESOLVE RESULT ---------------- */
//   const resolveResult = (step) => {
//     if (!fixture) return;

//     const index = orderedStakes.findIndex(
//       (s) => s.step === step
//     );

//     const newDeficit = orderedStakes
//       .slice(index + 1)
//       .reduce((sum, s) => sum + s.stake, 0);

//     setDeficit(newDeficit);
//     clearForNext();
//   };

//   /* ---------------- 6–0 WIN ---------------- */
//   const handleJackpot = () => {
//     setBaseStake(10000);
//     setDeficit(0);
//     clearForNext();
//     saveBase(10000);
//   };

//   /* ---------------- CLEAR ---------------- */
//   const clearForNext = () => {
//     setInputA("");
//     setInputB("");
//     setFixture(null);
//     setOrderedStakes([]);
//     setAmounts({
//       winnerAmount: 0,
//       homeAmount: 0,
//       drawAmount: 0,
//       awayAmount: 0,
//     });
//   };

//   const teamA = sanitizeTeam(inputA) || "liv";
//   const teamB = sanitizeTeam(inputB) || "liv";

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">

//       {/* SAVE / RELOAD */}
//       <div className="absolute top-5 right-5 flex rounded-full overflow-hidden shadow-xl">
//         <button
//           onClick={() => saveBase()}
//           className="px-5 py-2 bg-green-600 font-bold"
//         >
//           💾 Save
//         </button>
//         <button
//           onClick={fetchBase}
//           className="px-5 py-2 bg-red-600 font-bold"
//         >
//           🔄 Reload
//         </button>
//       </div>

//       {/* HEADER */}
//       <div className="text-center mb-10">
//         <h1 className="text-4xl font-extrabold text-red-500">
//           Virtual EPL Strategy
//         </h1>
//       </div>

//       {/* CARD */}
//       <div className="max-w-3xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

//         {/* BIG RESULT BUTTONS */}
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
//           <button
//             onClick={handleJackpot}
//             className="py-6 rounded-2xl bg-yellow-400 text-black text-center"
//           >
//             <div className="text-4xl font-extrabold">6–0</div>
//             <div>({amounts.winnerAmount})</div>
//           </button>

//           <button
//             onClick={() => resolveResult("H")}
//             disabled={!fixture}
//             className="py-6 rounded-2xl bg-green-600 text-white"
//           >
//             <div className="text-4xl font-extrabold">{teamA}</div>
//             <div>({amounts.homeAmount})</div>
//           </button>

//           <button
//             onClick={() => resolveResult("D")}
//             disabled={!fixture}
//             className="py-6 rounded-2xl bg-gray-500 text-white"
//           >
//             <div className="text-4xl font-extrabold">draw</div>
//             <div>({amounts.drawAmount})</div>
//           </button>

//           <button
//             onClick={() => resolveResult("A")}
//             disabled={!fixture}
//             className="py-6 rounded-2xl bg-red-600 text-white"
//           >
//             <div className="text-4xl font-extrabold">{teamB}</div>
//             <div>({amounts.awayAmount})</div>
//           </button>
//         </div>

//         {/* FORM */}
//         <form onSubmit={handleSubmit} className="text-center space-y-4">
//           <div className="flex justify-center gap-4">
//             <input
//               value={inputA}
//               onChange={(e) => setInputA(e.target.value)}
//               placeholder="liv"
//               className="w-28 px-4 py-2 border-2 rounded-xl text-center"
//             />
//             <span className="font-extrabold">VS</span>
//             <input
//               value={inputB}
//               onChange={(e) => setInputB(e.target.value)}
//               placeholder="liv"
//               className="w-28 px-4 py-2 border-2 rounded-xl text-center"
//             />
//           </div>

//           <button
//             type="submit"
//             className="px-8 py-3 bg-red-600 text-white font-extrabold rounded-full"
//           >
//             Calculate Stakes
//           </button>
//         </form>

//         {/* BASE & DEFICIT */}
//         <div className="mt-6 text-center font-mono">
//           <div>
//             Base Amount: <strong>{baseStake}</strong>
//           </div>
//           <div className="text-red-600 font-extrabold">
//             Current Deficit: {deficit}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Homepage;
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { odds } from "./Scores";

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) =>
  value.toLowerCase().replace(/[^a-z]/g, "");

/* ---------------- API ---------------- */
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {
  /* ---------------- INPUTS ---------------- */
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  /* ---------------- FIXTURE ---------------- */
  const [fixture, setFixture] = useState(null);

  /* ---------------- BASE & DEFICIT ---------------- */
  const [baseStake, setBaseStake] = useState(10000);
  const [deficit, setDeficit] = useState(0);

  /* 🔒 REF HOLDS LATEST BASE (CRITICAL FIX) */
  const baseRef = useRef(baseStake);

  /* ---------------- STAKES ---------------- */
  const [amounts, setAmounts] = useState({
    winnerAmount: 0,
    homeAmount: 0,
    drawAmount: 0,
    awayAmount: 0,
  });

  const [orderedStakes, setOrderedStakes] = useState([]);

  /* ---------------- KEEP REF IN SYNC ---------------- */
  useEffect(() => {
    baseRef.current = baseStake;
  }, [baseStake]);

  /* ---------------- LOAD BASE (RELOAD BUTTON) ---------------- */
  const fetchBase = async () => {
    try {
      const res = await axios.get(API_BASE);
      if (typeof res.data?.base === "number") {
        setBaseStake(res.data.base);
      }
    } catch (err) {
      console.error("❌ Failed to fetch base:", err.message);
    }
  };

  /* ---------------- SAVE BASE ---------------- */
  const saveBase = async (value) => {
    try {
      await axios.put(API_BASE, { base: value });
      console.log("✅ Autosaved base:", value);
    } catch (err) {
      console.error("❌ Autosave failed:", err.message);
    }
  };

  /* ---------------- AUTOSAVE EVERY 10 SECONDS ---------------- */
  useEffect(() => {
    const interval = setInterval(() => {
      saveBase(baseRef.current);
    }, 10000); // ⏱ 10 seconds (change to 600000 later)

    return () => clearInterval(interval);
  }, []);

  /* ---------------- SUBMIT (NEW GAME) ---------------- */
  const handleSubmit = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "liv";
    const away = sanitizeTeam(inputB) || "liv";

    const found = odds.find(
      (o) => o.home === home && o.away === away
    );

    if (!found) {
      alert(`No odds for ${home} vs ${away}`);
      return;
    }

    /* ✅ ABSORB DEFICIT HERE (ONLY ON SUBMIT) */
    const newBase = baseStake + deficit;
    setBaseStake(newBase);
    setDeficit(0);

    /* -------- FIRST STAKE -------- */
    const winnerAmount = Math.round(
      newBase / (found.winner - 1)
    );

    const oddsMap = {
      H: found.win,
      D: found.draw,
      A: found.lose,
    };

    let runningTotal = winnerAmount;
    const ladder = [];

    let homeAmount = 0;
    let drawAmount = 0;
    let awayAmount = 0;

    for (const step of found.code) {
      const odd = oddsMap[step];
      const stake = Math.round(runningTotal / (odd - 1));

      ladder.push({ step, stake });

      if (step === "H") homeAmount = stake;
      if (step === "D") drawAmount = stake;
      if (step === "A") awayAmount = stake;

      runningTotal += stake;
    }

    setFixture(found);
    setOrderedStakes(ladder);
    setAmounts({
      winnerAmount,
      homeAmount,
      drawAmount,
      awayAmount,
    });
  };

  /* ---------------- RESOLVE RESULT ---------------- */
  const resolveResult = (step) => {
    if (!fixture) return;

    const index = orderedStakes.findIndex(
      (s) => s.step === step
    );

    const newDeficit = orderedStakes
      .slice(index + 1)
      .reduce((sum, s) => sum + s.stake, 0);

    setDeficit(newDeficit);
    clearForNext();
  };

  /* ---------------- 6–0 WIN ---------------- */
  const handleJackpot = async () => {
    setBaseStake(10000);
    setDeficit(0);
    clearForNext();
    await saveBase(10000);
  };

  /* ---------------- CLEAR ---------------- */
  const clearForNext = () => {
    setInputA("");
    setInputB("");
    setFixture(null);
    setOrderedStakes([]);
    setAmounts({
      winnerAmount: 0,
      homeAmount: 0,
      drawAmount: 0,
      awayAmount: 0,
    });
  };

  const teamA = sanitizeTeam(inputA) || "liv";
  const teamB = sanitizeTeam(inputB) || "liv";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-10">

      {/* SAVE / RELOAD */}
      <div className="absolute top-5 right-5 flex rounded-full overflow-hidden shadow-xl">
        <button
          onClick={() => saveBase(baseStake)}
          className="px-5 py-2 bg-green-600 font-bold"
        >
          💾 Save
        </button>
        <button
          onClick={fetchBase}
          className="px-5 py-2 bg-red-600 font-bold"
        >
          🔄 Reload
        </button>
      </div>

      {/* HEADER */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-red-500">
          Virtual EPL Strategy
        </h1>
      </div>

      {/* CARD */}
      <div className="max-w-3xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-8">

        {/* RESULT BUTTONS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <button
            onClick={handleJackpot}
            className="py-6 rounded-2xl bg-yellow-400 text-black"
          >
            <div className="text-4xl font-extrabold">6–0</div>
            <div>({amounts.winnerAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("H")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-green-600 text-white"
          >
            <div className="text-4xl font-extrabold">{teamA}</div>
            <div>({amounts.homeAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("D")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-gray-500 text-white"
          >
            <div className="text-4xl font-extrabold">DRAW</div>
            <div>({amounts.drawAmount})</div>
          </button>

          <button
            onClick={() => resolveResult("A")}
            disabled={!fixture}
            className="py-6 rounded-2xl bg-red-600 text-white"
          >
            <div className="text-4xl font-extrabold">{teamB}</div>
            <div>({amounts.awayAmount})</div>
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="text-center space-y-4">
          <div className="flex justify-center gap-4">
            <input
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              placeholder="liv"
              className="w-28 px-4 py-2 border-2 rounded-xl text-center"
            />
            <span className="font-extrabold">VS</span>
            <input
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              placeholder="liv"
              className="w-28 px-4 py-2 border-2 rounded-xl text-center"
            />
          </div>

          <button
            type="submit"
            className="px-8 py-3 bg-red-600 text-white font-extrabold rounded-full"
          >
            Calculate Stakes
          </button>
        </form>

        {/* BASE & DEFICIT */}
        <div className="mt-6 text-center font-mono">
          <div>
            Base Amount: <strong>{baseStake}</strong>
          </div>
          <div className="text-red-600 font-extrabold">
            Current Deficit: {deficit}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
