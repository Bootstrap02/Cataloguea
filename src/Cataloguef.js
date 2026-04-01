import React, { useState, useEffect, } from "react";
import axios from "axios";
import { odds } from "./Scores";
import { FiRefreshCw } from 'react-icons/fi';

/* ---------------- UTILS ---------------- */
const sanitizeTeam = (value) => value.toLowerCase().replace(/[^a-z]/g, "");

/* ---------------- API ---------------- */
const API_BASE = "https://campusbuy-backend-nkmx.onrender.com/betking";

const Homepage = () => {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  const [fixture, setFixture] = useState(null);

  const [bigDeficit, setBigDeficit] = useState(400);
  const [bigShadow, setBigShadow] = useState(0);

  const [smallDeficit, setSmallDeficit] = useState(0);
  const [smallShadow, setSmallShadow] = useState(0);
  const [isReloading, setIsReloading] = useState(false);

  const [privateDeficits, setPrivateDeficits] = useState({
    oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
  });
  const [privateTotal, setPrivateTotal] = useState(0);

  const [pendingStakes, setPendingStakes] = useState({
    ht12: 0, x2: 0, ht30: 0, ft40: 0, ft41: 0,
    oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
  });

  const [pressedWins, setPressedWins] = useState(new Set());

  const bigGameKeys = ["ht12", "x2", "ht30", "ft40", "ft41"];
  const smallGameKeys = ["oneX", "twoX", "zeroGoals", "sixGoals", "ht21"];

  const allKeys = [...bigGameKeys, ...smallGameKeys];

  const labels = {
    ht12: "HT 1-2", x2: "X2", ht30: "HT 3-0", ft40: "FT 4-0", ft41: "FT 4-1",
    oneX: "1X", twoX: "2X", zeroGoals: "0 GOALS", sixGoals: "6 GOALS", ht21: "HT 2-1",
  };

  /* ---------------- LOAD / SAVE ---------------- */
  const fetchAll = async () => {
    try {
      const res = await axios.get(API_BASE);
      const data = res.data || {};

      setBigDeficit(data.bigDeficit < 400 ?  400 : 0);
      setBigShadow(data.bigDeficit < 400 ?  400 : 0);

      setSmallDeficit(data.smallDeficit ?? 0);
      setSmallShadow(data.deficitBank ?? 0);

      setPrivateDeficits({
        oneX: data.oneXDeficit ?? 0,
        twoX: data.twoXDeficit ?? 0,
        zeroGoals: data.zeroGoalsDeficit ?? 0,
        sixGoals: data.sixGoalsDeficit ?? 0,
        ht21: data.htTwoOneDeficit ?? 0,
      });

      setPrivateTotal(data.privateTotal ?? 0);
      setPressedWins(new Set());
    } catch (err) {
      console.error("❌ Load failed:", err.message);
    }
  };

  const saveAll = async () => {
    try {
      const payload = {
        bigDeficit: bigDeficit,
        badGameShadow: bigShadow,
        smallDeficit: smallDeficit,
        deficitBank: smallShadow,

        oneXDeficit: privateDeficits.oneX,
        twoXDeficit: privateDeficits.twoX,
        zeroGoalsDeficit: privateDeficits.zeroGoals,
        sixGoalsDeficit: privateDeficits.sixGoals,
        htTwoOneDeficit: privateDeficits.ht21,
        privateTotal: privateTotal,
      };

      await axios.put(API_BASE, payload);
      alert("✅ Saved:", payload);
    } catch (err) {
      console.error("❌ Save failed:", err.message);
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    await fetchAll();
    setIsReloading(false);
  };
// 1
  useEffect(() => { fetchAll(); }, []);

  /* ---------------- LOAD GAME ---------------- */
  const handleLoadGame = (e) => {
    e.preventDefault();

    const home = sanitizeTeam(inputA) || "che";
    const away = sanitizeTeam(inputB) || "che";

    const found = odds.find((o) => o.home === home && o.away === away);
    if (!found) {
      alert(`No odds for ${home} vs ${away}`);
      return;
    }

    setFixture(found);
    setPressedWins(new Set());

    // Big games stake based on bigDeficit (default 400)
    const currentBig = bigDeficit;
    setBigShadow(currentBig)
    const newPending = {};

    bigGameKeys.forEach((key) => {
      const odd = found[key] || 0;
      let stake = odd > 1.01 ? Math.round(currentBig / odd) : 0;
      newPending[key] = Math.max(stake, 10);
    });

    const bigStakesTotal = bigGameKeys.reduce((sum, key) => sum + (newPending[key] || 0), 0);

    const newSmall = smallDeficit + bigStakesTotal;
    setSmallDeficit(newSmall);
    setSmallShadow(newSmall);

    smallGameKeys.forEach((key) => {
      const odd = found[key] || 0;
      const target = newSmall + (privateDeficits[key] || 0);
      
      let stake = odd > 1.01 ? Math.round(target / (odd - 1)) : 0;
      newPending[key] = Math.max(stake, 10);

      setPrivateDeficits((prev) => ({
        ...prev,
        [key]: (prev[key] || 0) + newPending[key],
      }));
    });

    setPendingStakes(newPending);

    const updatedPrivateTotal = smallGameKeys.reduce((sum, key) => 
      sum + ((privateDeficits[key] || 0) + (newPending[key] || 0)), 0
    );
    setPrivateTotal(updatedPrivateTotal);
  };




  const handleWin = (type) => {
    if (!fixture) return;
    const stake = pendingStakes[type];
    if (stake <= 0) return;

    setPressedWins((prev) => new Set([...prev, type]));

    

    if (bigGameKeys.includes(type)) {
      if (bigDeficit > 0) {
        setBigDeficit(0);
      } else {
        if (bigShadow > privateTotal) {
          const residue = bigShadow - privateTotal
          setPrivateTotal(0);
          if(smallDeficit > residue){
            setSmallDeficit((prev) => Math.max(0, prev - residue));
          }else {
              setSmallDeficit(0)
          }
        } else {
          setPrivateTotal((prev) => Math.max(0, prev - bigShadow));
        }
      }
    } 
    else if (smallGameKeys.includes(type)) {
      if (smallDeficit > 0) {
        setSmallDeficit(0);
        setPrivateDeficits((prev) => ({ ...prev, [type]: 0 }));
        setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
        setPrivateTotal((prev) => Math.max(0, prev - (privateDeficits[type] || 0)));
      } else {
         if (smallShadow > bigDeficit) {
          const residue = smallShadow - bigDeficit
          setBigDeficit(0);
          setPrivateDeficits((prev) => ({ ...prev, [type]: 0 }));
          setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
          setPrivateTotal((prev) => Math.max(0, prev - (privateDeficits[type] || 0)));
          if(privateTotal > residue){
           const newPrivateTotal=  Math.max(0, privateTotal - residue)
           const newValuePerAsset = Math.floor(newPrivateTotal / 5);
        setPrivateDeficits({
          oneX: newValuePerAsset,
          twoX: newValuePerAsset,
          zeroGoals: newValuePerAsset,
          sixGoals: newValuePerAsset,
          ht21: newValuePerAsset,
        });

        setPrivateTotal(newPrivateTotal);
          }else{
            setPrivateTotal(0)
             setPrivateDeficits({
        oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
      });
          }
        } else {
         setBigDeficit((prev) => Math.max(0, prev - smallShadow));
          setPrivateDeficits((prev) => ({ ...prev, [type]: 0 }));
          setPendingStakes((prev) => ({ ...prev, [type]: 0 }));
          setPrivateTotal((prev) => Math.max(0, prev - (privateDeficits[type] || 0)));
        }
      }
    }
  };


  /* ---------------- NEXT GAME ---------------- */
  const handleNextGame = async () => {
    if (!fixture) return;

    setPendingStakes({
      ht12: 0, x2: 0, ht30: 0, ft40: 0, ft41: 0,
      oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
    });
   

    // After big win, increase bigDeficit using shadow + privateTotal
    if (bigDeficit === 0 ) {
      const newBig = 400 + privateTotal;

      setBigDeficit(newBig);
      setBigShadow(newBig);        
      setPrivateTotal(0);        
       setPrivateDeficits({
       oneX: 0, twoX: 0, zeroGoals: 0, sixGoals: 0, ht21: 0,
    });
    }

    setFixture(null);
    setInputA("");
    setInputB("");
    setPressedWins(new Set());

    await saveAll();
  };

  const isButtonPressed = (key) => pressedWins.has(key);
  const isGameLoaded = !!fixture;

  return (
    <div>
      <div className="max-lg:hidden min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-red-500">Two Deficit Strategy</h1>
            <div className="flex gap-3">
              <button onClick={saveAll} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm">
                <FiRefreshCw className="w-4 h-4" /> Save
              </button>
              <button 
                onClick={handleReload} 
                disabled={isReloading}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-xl text-sm"
              >
                <FiRefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} /> 
                {isReloading ? "Reloading..." : "Reload"}
              </button>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/10">
            <div className="flex justify-center gap-4 mb-6">
              <input 
                value={inputA} 
                onChange={(e) => setInputA(e.target.value)} 
                placeholder="Home" 
                className="w-28 px-4 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
              />
              <span className="self-center text-2xl text-red-500 font-black">VS</span>
              <input 
                value={inputB} 
                onChange={(e) => setInputB(e.target.value)} 
                placeholder="Away" 
                className="w-28 px-4 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
              />
            </div>

            <div className="flex justify-center gap-3 mb-8">
              <button 
                onClick={handleLoadGame} 
                disabled={isGameLoaded} 
                className={`px-8 py-3 text-white font-bold rounded-2xl transition text-sm ${isGameLoaded ? "bg-gray-600" : "bg-red-600 hover:bg-red-700"}`}
              >
                LOAD GAME
              </button>
              <button 
                onClick={handleNextGame} 
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl text-sm transition"
              >
                NEXT GAME
              </button>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-8">
              {allKeys.map((key) => (
                <button 
                  key={key}
                  onClick={() => handleWin(key)}
                  disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
                  className={`py-4 rounded-2xl font-medium text-xs transition ${
                    isButtonPressed(key) ? "bg-yellow-500 text-black" : "bg-blue-600 hover:bg-blue-500 text-white"
                  } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50" : ""}`}
                >
                  {labels[key]}<br />
                  <span className="text-[10px]">({pendingStakes[key] || "–"})</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs bg-black/30 p-5 rounded-2xl">
              <div>Big Def: <strong className="text-red-400">{bigDeficit}</strong> (Shadow: {bigShadow})</div>
              <div>Small Def: <strong className="text-purple-400">{smallDeficit}</strong> (S: {smallShadow})</div>
              <div>Private Tot: <strong className="text-orange-400">{privateTotal}</strong></div>

              {smallGameKeys.map((key) => (
                <div key={key} className="col-span-2 md:col-span-1">
                  {labels[key]}: <strong>{privateDeficits[key] || 0}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile version - you can adjust similarly */}
      <div className="hidden max-lg:block min-h-screen bg-gradient-to-br from-red-950 via-black to-red-900 text-white px-3 py-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-red-500">Two Deficit</h1>
          <button 
            onClick={handleReload} 
            disabled={isReloading}
            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-xl text-sm flex items-center gap-2 mx-auto transition"
          >
            <FiRefreshCw className={`inline ${isReloading ? 'animate-spin' : ''}`} /> 
            {isReloading ? "Reloading..." : "Reload"}
          </button>
        </div>

        {/* Inputs */}
        <div className="flex gap-2 mb-6 justify-center items-center">
          <input 
            value={inputA} 
            onChange={(e) => setInputA(e.target.value)} 
            placeholder="Home" 
            className="flex-1 max-w-[110px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
          />
          <span className="text-xl text-red-500 font-black px-1">VS</span>
          <input 
            value={inputB} 
            onChange={(e) => setInputB(e.target.value)} 
            placeholder="Away" 
            className="flex-1 max-w-[110px] px-3 py-2.5 border border-red-600 bg-transparent rounded-2xl text-center text-sm" 
          />
        </div>

        {/* Load & Next Buttons */}
        <div className="flex gap-3 mb-8">
          <button 
            onClick={handleLoadGame} 
            disabled={isGameLoaded} 
            className={`flex-1 py-3 font-bold rounded-2xl text-sm transition ${
              isGameLoaded ? "bg-gray-600" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            LOAD
          </button>
          <button 
            onClick={handleNextGame} 
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 font-bold rounded-2xl text-sm transition"
          >
            NEXT
          </button>
        </div>

        {/* Win Buttons - 2 columns for mobile */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {allKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleWin(key)}
              disabled={!fixture || pendingStakes[key] === 0 || isButtonPressed(key)}
              className={`py-5 rounded-2xl font-medium text-sm transition ${
                isButtonPressed(key) ? "bg-yellow-500 text-black" 
                : "bg-blue-600 text-white"
              } ${pendingStakes[key] === 0 || isButtonPressed(key) ? "opacity-50" : ""}`}
            >
              {labels[key]}<br />
              <span className="text-xs">({pendingStakes[key] || "–"})</span>
            </button>
          ))}
        </div>

        {/* Stats - Mobile friendly */}
        <div className="grid grid-cols-2 gap-4 text-xs bg-black/30 p-5 rounded-3xl">
          <div>Big Def: <strong className="text-red-400">{bigDeficit}</strong></div>
          <div>Shadow: <strong className="text-red-400">{bigShadow}</strong></div>
          <div>Small Def: <strong className="text-purple-400">{smallDeficit}</strong></div>
          <div>Private: <strong className="text-orange-400">{privateTotal}</strong></div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;