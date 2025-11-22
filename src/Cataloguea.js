import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

const GideonBanquetRSVP = () => {
  const [step, setStep] = useState('welcome'); // welcome | count | thankYou
  const [guestName, setGuestName] = useState('Friend');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('No email provided');
  const [partySize, setPartySize] = useState(0);

  // Google Apps Script Web App URL - CHANGE THIS LATER
  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwc_6Szg0pMXMp21O0Xq2E6GvR0JJXDszMZ-cgrLgns/dev";

  useEffect(() => {
  const params = new URLSearchParams(window.location.search);

  const name  = params.get('name')  || 'Friend';
  const phone = params.get('phone') || 'Unknown';
  const email = params.get('email') || 'No email provided';

  setGuestName(name);
  setGuestPhone(phone.replace(/\D/g, ''));  // remove all non-digits
  setGuestEmail(email);  // make sure you have this state
}, []);

  const submitRSVP = async (rsvp, size = 0) => {
  try {
    await axios.post(GOOGLE_SCRIPT_URL, {
      Timestamp: new Date().toLocaleString('en-NG'),
      Name: guestName,
      Phone: guestPhone,
      Email: guestEmail,           // ← NEW: we dey send email now
      RSVP: rsvp,
      People: size,
    });
    console.log("RSVP saved successfully!");
  } catch (err) {
    console.log("Still saved locally:", { guestName, guestPhone, guestEmail, rsvp, size });
  }
};
  const handleYes = () => {
    setStep('count');
  };

  const handleNo = () => {
    submitRSVP('NO', 0);
    setStep('thankYou');
  };

  const confirmAttendance = (size) => {
    setPartySize(size);
    submitRSVP('YES', size);
    setStep('thankYou');
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-red-900 to-black text-white overflow-hidden relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23FFD700' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}></div>
        </div>

        {/* Hero Image Placeholder - Replace src with your own */}
        <div className="relative h-96 md:h-[500px] bg-cover bg-center" 
             style={{ backgroundImage: "url('https://images.unsplash.com/photo-1518568814502-977fab39b018?ixlib=rb-4.0.3&auto=format&fit=crop&q=80')" }}>
          <div className="absolute inset-0 bg-gradient-to-t from-red-950 via-red-950/70 to-transparent"></div>
          <div className="relative h-full flex items-center justify-center text-center px-6">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 1 }}>
              <h1 className="text-5xl md:text-7xl font-bold text-gold-400 drop-shadow-2xl">
                Christmas Banquet 2025
              </h1>
              <p className="text-2xl md:text-4xl mt-4 text-gold-300">Hardin / South Jasper Camp</p>
              <p className="text-xl md:text-2xl mt-2 text-white font-light">The Gideons International</p>
            </motion.div>
          </div>
        </div>

        <div className="relative max-w-4xl mx-auto px-6 py-16 -mt-20 z-10">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            transition={{ delay: 0.5 }}
            className="bg-white/95 backdrop-blur-lg rounded-3xl shadow-2xl overflow-hidden border border-gold-200"
          >
            <div className="bg-gradient-to-r from-red-800 to-red-900 p-8 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-gold-300">You Are Cordially Invited</h2>
              <p className="text-xl text-gold-100 mt-3">Thursday, December 11th, 2025 • 6:00 PM</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 p-10 bg-white text-gray-800">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-4xl">Calendar</span>
                </div>
                <h3 className="font-bold text-xl text-red-800">Date & Time</h3>
                <p className="mt-2">Thursday<br/>11th December 2025<br/>6:00 PM</p>
              </div>

              <div className="text-center">
                <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-4xl">Location</span>
                </div>
                <h3 className="font-bold text-xl text-red-800">Venue</h3>
                <p className="mt-2 font-medium">[Venue Name]<br/>[Full Address Here]<br/>[City, State]</p>
              </div>

              <div className="text-center">
                <div className="w-20 h-20 mx-auto bg-gold-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-4xl">Bible</span>
                </div>
                <h3 className="font-bold text-xl text-red-800">Theme</h3>
                <p className="mt-2 italic">"The Word Became Flesh"<br/>John 1:14</p>
              </div>
            </div>

            {/* RSVP Section */}
            {step === 'welcome' && (
              <div className="p-10 bg-gradient-to-b from-gray-50 to-white">
                <h3 className="text-3xl font-bold text-center text-gray-800 mb-8">
                  <p className="text-xl text-yellow-500 mt-4">
                   Hello {guestName.split(' ')[0]}! ({guestEmail !== 'No email provided' ? guestEmail : 'Guest'})      
                 </p>    
                   {guestName.split(' ')[0]}! Will you join us?
                </h3>
                <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleYes}
                    className="w-full sm:w-auto px-12 py-6 bg-gradient-to-r from-green-600 to-green-700 text-white text-xl font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300"
                  >
                    YES, I'll be there!
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleNo}
                    className="w-full sm:w-auto px-12 py-6 bg-gradient-to-r from-red-600 to-red-700 text-white text-xl font-bold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300"
                  >
                    No, I can't make it
                  </motion.button>
                </div>
              </div>
            )}

            {step === 'count' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-10 bg-green-50"
              >
                <h3 className="text-3xl font-bold text-center text-green-800 mb-8">
                  Wonderful! We're delighted!
                </h3>
                <p className="text-center text-xl text-gray-700 mb-10">
                  Just one quick question for catering:
                </p>
                <div className="flex flex-col sm:flex-row gap-8 justify-center">
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => confirmAttendance(1)}
                    className="px-10 py-8 bg-white border-4 border-green-600 text-green-700 text-2xl font-bold rounded-3xl shadow-2xl hover:bg-green-600 hover:text-white transition-all"
                  >
                    1 Person<br/><span className="text-lg font-normal">(Just me)</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => confirmAttendance(2)}
                    className="px-10 py-8 bg-gradient-to-br from-gold-400 to-yellow-500 text-[#FFD700] text-2xl font-bold rounded-3xl shadow-2xl hover:shadow-3xl transition-all border-4 border-gold-600"
                  >
                    2 People<br/><span className="text-lg font-normal">(Me + Spouse/Guest)</span>
                  </motion.button>
                </div>
              </motion.div>
            )}

            {step === 'thankYou' && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="p-16 bg-gradient-to-b from-green-600 to-green-800 text-center"
              >
                <h2 className="text-5xl md:text-6xl font-bold text-gold-300 mb-6">
                  {partySize > 0 ? "See You on December 11th!" : "Thank You!"}
                </h2>
                <p className="text-2xl text-gold-100">
                  {partySize === 1 && "We're excited to fellowship with you!"}
                  {partySize === 2 && "We look forward to welcoming you and your guest!"}
                  {partySize === 0 && "We will miss you, but thank you for letting us know."}
                </p>
                <p className="mt-8 text-xl text-gold-200 italic">
                  "Go ye into all the world, and preach the gospel..." – Mark 16:15
                </p>
              </motion.div>
            )}
          </motion.div>

          {/* Footer */}
          <div className="text-center mt-12 text-gold-300">
            <p className="text-lg">For inquiries: <a href="tel:+1234567890" className="underline">+1 (234) 567-890</a></p>
            <p className="mt-4 text-3xl font-bold text-gold-400">The Gideons International</p>
            <p className="text-sm mt-2 opacity-80">Placing God’s Word. Changing Lives.</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default GideonBanquetRSVP;