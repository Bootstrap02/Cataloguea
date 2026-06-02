
export const odds = [
  // winner: 327 - Liverpool home vs weaker teams
  { id: "livmnu", home: "liv", away: "mnu", winner: 327, code: "ADH", fiveZero: 98.5, fiveOne: 86.1, oneX: 14.8, twoX: 14.8, tg0: 15, tg6: 17.3, x2: 14.7, ht12: 22.4, ht21: 13.4, ht30: 26.2, ft40: 36, ft41: 30.3 },
  { id: "livnew", home: "liv", away: "new", winner: 327, code: "ADH", fiveZero: 98.5, fiveOne: 86.1, oneX: 14.8, twoX: 14.8, tg0: 15, tg6: 17.3, x2: 14.7, ht12: 22.4, ht21: 13.4, ht30: 26.2, ft40: 36, ft41: 30.3 },
  { id: "livche", home: "liv", away: "che", winner: 327, code: "ADH", fiveZero: 98.5, fiveOne: 86.1, oneX: 14.8, twoX: 14.8, tg0: 15, tg6: 17.3, x2: 14.7, ht12: 22.4, ht21: 13.4, ht30: 26.2, ft40: 36, ft41: 30.3 },

  // winner: 1140 - Liverpool away vs Brentford/Newcastle/Chelsea
  { id: "mnuliv", home: "mnu", away: "liv", winner: 1140, code: "DHA", fiveZero: 269, fiveOne: 183, oneX: 15.7, twoX: 15.7, tg0: 12.9, tg6: 22, x2: 11.6, ht12: 21.5, ht21: 16.4, ht30: 46, ft40: 72.8, ft41: 50.6 },
  { id: "newliv", home: "new", away: "liv", winner: 1140, code: "DHA", fiveZero: 269, fiveOne: 183, oneX: 15.7, twoX: 15.7, tg0: 12.9, tg6: 22, x2: 11.6, ht12: 21.5, ht21: 16.4, ht30: 46, ft40: 72.8, ft41: 50.6 },
  { id: "cheliv", home: "che", away: "liv", winner: 1140, code: "DHA", fiveZero: 269, fiveOne: 183, oneX: 15.7, twoX: 15.7, tg0: 12.9, tg6: 22, x2: 11.6, ht12: 21.5, ht21: 16.4, ht30: 46, ft40: 72.8, ft41: 50.6 },

  // winner: 847 - Liverpool away vs Aston Villa/Tottenham
  { id: "astliv", home: "ast", away: "liv", winner: 847, code: "HDA", fiveZero: 211, fiveOne: 156, oneX: 16.8, twoX: 16.8, tg0: 13, tg6: 23.7, x2: 13.3, ht12: 24.7, ht21: 16.2, ht30: 40.2, ft40: 58.6, ft41: 44.3 },
  { id: "totliv", home: "tot", away: "liv", winner: 847, code: "HDA", fiveZero: 211, fiveOne: 156, oneX: 16.8, twoX: 16.8, tg0: 13, tg6: 23.7, x2: 13.3, ht12: 24.7, ht21: 16.2, ht30: 40.2, ft40: 58.6, ft41: 44.3 },

  // winner: 1226 - Liverpool away vs Man City/Arsenal
  { id: "mncliv", home: "mnc", away: "liv", winner: 1226, code: "DHA", fiveZero: 288, fiveOne: 202, oneX: 14.8, twoX: 14.8, tg0: 13.8, tg6: 20.5, x2: 9.55, ht12: 18.5, ht21: 17, ht30: 50.8, ft40: 79.3, ft41: 57.7 },
  { id: "arsliv", home: "ars", away: "liv", winner: 1226, code: "DHA", fiveZero: 288, fiveOne: 202, oneX: 14.8, twoX: 14.8, tg0: 13.8, tg6: 20.5, x2: 9.55, ht12: 18.5, ht21: 17, ht30: 50.8, ft40: 79.3, ft41: 57.7 },

  // winner: 568 - Liverpool home vs Man City/Arsenal
  { id: "livmnc", home: "liv", away: "mnc", winner: 568, code: "ADH", fiveZero: 157, fiveOne: 126, oneX: 13.8, twoX: 13.8, tg0: 11.1, tg6: 19, x2: 11.9, ht12: 20.5, ht21: 15.2, ht30: 36.2, ft40: 52.4, ft41: 41.1 },
  { id: "livars", home: "liv", away: "ars", winner: 568, code: "ADH", fiveZero: 157, fiveOne: 126, oneX: 13.8, twoX: 13.8, tg0: 11.1, tg6: 19, x2: 11.9, ht12: 20.5, ht21: 15.2, ht30: 36.2, ft40: 52.4, ft41: 41.1 },

  // winner: 560 - Liverpool away vs Nottingham/Brighton
  { id: "notliv", home: "not", away: "liv", winner: 560, code: "HDA", fiveZero: 145, fiveOne: 118, oneX: 16.4, twoX: 16.4, tg0: 14.8, tg6: 21.2, x2: 16, ht12: 25.3, ht21: 14.6, ht30: 32.3, ft40: 44.8, ft41: 36.3 },
  { id: "bhaliv", home: "bha", away: "liv", winner: 560, code: "HDA", fiveZero: 145, fiveOne: 118, oneX: 16.4, twoX: 16.4, tg0: 14.8, tg6: 21.2, x2: 16, ht12: 25.3, ht21: 14.6, ht30: 32.3, ft40: 44.8, ft41: 36.3 },

  // winner: 416 - Liverpool away vs Bournemouth/Fulham/Crystal Palace
  { id: "bouliv", home: "bou", away: "liv", winner: 416, code: "HDA", fiveZero: 109, fiveOne: 93, oneX: 18.4, twoX: 18.4, tg0: 16.7, tg6: 20.1, x2: 19.1, ht12: 27.2, ht21: 13.5, ht30: 26.8, ft40: 36.6, ft41: 30.1 },
  { id: "fulliv", home: "ful", away: "liv", winner: 416, code: "HDA", fiveZero: 109, fiveOne: 93, oneX: 18.4, twoX: 18.4, tg0: 16.7, tg6: 20.1, x2: 19.1, ht12: 27.2, ht21: 13.5, ht30: 26.8, ft40: 36.6, ft41: 30.1 },
  { id: "cryliv", home: "cry", away: "liv", winner: 416, code: "HDA", fiveZero: 109, fiveOne: 93, oneX: 18.4, twoX: 18.4, tg0: 16.7, tg6: 20.1, x2: 19.1, ht12: 27.2, ht21: 13.5, ht30: 26.8, ft40: 36.6, ft41: 30.1 }, 
  // winner: 105 - Liverpool home vs Crystal Palace/Bournemouth/Fulham
  { id: "livcry", home: "liv", away: "cry", winner: 105, fiveZero: 40.4, fiveOne: 45.5, oneX: 20.4, twoX: 20.4, tg0: 14.7, tg6: 15.5, x2: 23, ht12: 33.1, ht21: 12.6, ht30: 14.9, ft40: 18, ft41: 20.6 },
  { id: "livbou", home: "liv", away: "bou", winner: 105, fiveZero: 40.4, fiveOne: 45.5, oneX: 20.4, twoX: 20.4, tg0: 14.7, tg6: 15.5, x2: 23, ht12: 33.1, ht21: 12.6, ht30: 14.9, ft40: 18, ft41: 20.6 },
  { id: "livful", home: "liv", away: "ful", winner: 105, fiveZero: 40.4, fiveOne: 45.5, oneX: 20.4, twoX: 20.4, tg0: 14.7, tg6: 15.5, x2: 23, ht12: 33.1, ht21: 12.6, ht30: 14.9, ft40: 18, ft41: 20.6 },

  // winner: 66.1 - Liverpool home vs West Ham/Brentford/Wolves/Leeds/Everton
  { id: "livwhu", home: "liv", away: "whu", winner: 66.1, fiveZero: 28, fiveOne: 33.9, oneX: 24.9, twoX: 24.9, tg0: 17.7, tg6: 13, x2: 28.8, ht12: 37.3, ht21: 11.6, ht30: 11.3, ft40: 14, ft41: 16.9 },
  { id: "livbre", home: "liv", away: "bre", winner: 66.1, fiveZero: 28, fiveOne: 33.9, oneX: 24.9, twoX: 24.9, tg0: 17.7, tg6: 13, x2: 28.8, ht12: 37.3, ht21: 11.6, ht30: 11.3, ft40: 14, ft41: 16.9 },
  { id: "livwol", home: "liv", away: "wol", winner: 66.1, fiveZero: 28, fiveOne: 33.9, oneX: 24.9, twoX: 24.9, tg0: 17.7, tg6: 13, x2: 28.8, ht12: 37.3, ht21: 11.6, ht30: 11.3, ft40: 14, ft41: 16.9 },
  { id: "livlee", home: "liv", away: "lee", winner: 66.1, fiveZero: 28, fiveOne: 33.9, oneX: 24.9, twoX: 24.9, tg0: 17.7, tg6: 13, x2: 28.8, ht12: 37.3, ht21: 11.6, ht30: 11.3, ft40: 14, ft41: 16.9 },
  { id: "liveve", home: "liv", away: "eve", winner: 66.1, fiveZero: 28, fiveOne: 33.9, oneX: 24.9, twoX: 24.9, tg0: 17.7, tg6: 13, x2: 28.8, ht12: 37.3, ht21: 11.6, ht30: 11.3, ft40: 14, ft41: 16.9 },

  // winner: 46.3 - Liverpool home vs Sunderland/Burnley
  { id: "livsun", home: "liv", away: "sun", winner: 46.3, fiveZero: 20.6, fiveOne: 31.9, oneX: 31.2, twoX: 31.2, tg0: 16.6, tg6: 13.3, x2: 35.6, ht12: 53.4, ht21: 13.1, ht30: 9.63, ft40: 11.1, ft41: 16.8 },
  { id: "livbur", home: "liv", away: "bur", winner: 46.3, fiveZero: 20.6, fiveOne: 31.9, oneX: 31.2, twoX: 31.2, tg0: 16.6, tg6: 13.3, x2: 35.6, ht12: 53.4, ht21: 13.1, ht30: 9.63, ft40: 11.1, ft41: 16.8 },

  // winner: 229 - Liverpool home vs Aston Villa/Tottenham
  { id: "livast", home: "liv", away: "ast", winner: 229, fiveZero: 71.2, fiveOne: 67.3, oneX: 16.6, twoX: 16.6, tg0: 16, tg6: 17.2, x2: 18.2, ht12: 26.3, ht21: 13, ht30: 21.4, ft40: 27.7, ft41: 26.1 },
  { id: "livtot", home: "liv", away: "tot", winner: 229, fiveZero: 71.2, fiveOne: 67.3, oneX: 16.6, twoX: 16.6, tg0: 16, tg6: 17.2, x2: 18.2, ht12: 26.3, ht21: 13, ht30: 21.4, ft40: 27.7, ft41: 26.1 },

  // winner: 144 - Liverpool home vs Brighton/Nottingham
  { id: "livbha", home: "liv", away: "bha", winner: 144, fiveZero: 52, fiveOne: 51.3, oneX: 18.6, twoX: 18.6, tg0: 16, tg6: 15.1, x2: 21.1, ht12: 27.6, ht21: 12, ht30: 17, ft40: 22, ft41: 21.6 },
  { id: "livnot", home: "liv", away: "not", winner: 144, fiveZero: 52, fiveOne: 51.3, oneX: 18.6, twoX: 18.6, tg0: 16, tg6: 15.1, x2: 21.1, ht12: 27.6, ht21: 12, ht30: 17, ft40: 22, ft41: 21.6 },

  // winner: 262 - Liverpool away vs West Ham/Brentford/Wolves/Leeds/Everton
  { id: "whuliv", home: "whu", away: "liv", winner: 262, fiveZero: 78.7, fiveOne: 68.8, oneX: 19.4, twoX: 19.4, tg0: 18, tg6: 17.1, x2: 23.7, ht12: 27.7, ht21: 12, ht30: 21.2, ft40: 28.8, ft41: 24.2 },
  { id: "breliv", home: "bre", away: "liv", winner: 262, fiveZero: 78.7, fiveOne: 68.8, oneX: 19.4, twoX: 19.4, tg0: 18, tg6: 17.1, x2: 23.7, ht12: 27.7, ht21: 12, ht30: 21.2, ft40: 28.8, ft41: 24.2 },
  { id: "wolliv", home: "wol", away: "liv", winner: 262, fiveZero: 78.7, fiveOne: 68.8, oneX: 19.4, twoX: 19.4, tg0: 18, tg6: 17.1, x2: 23.7, ht12: 27.7, ht21: 12, ht30: 21.2, ft40: 28.8, ft41: 24.2 },
  { id: "leeliv", home: "lee", away: "liv", winner: 262, fiveZero: 78.7, fiveOne: 68.8, oneX: 19.4, twoX: 19.4, tg0: 18, tg6: 17.1, x2: 23.7, ht12: 27.7, ht21: 12, ht30: 21.2, ft40: 28.8, ft41: 24.2 },
  { id: "eveliv", home: "eve", away: "liv", winner: 262, fiveZero: 78.7, fiveOne: 68.8, oneX: 19.4, twoX: 19.4, tg0: 18, tg6: 17.1, x2: 23.7, ht12: 27.7, ht21: 12, ht30: 21.2, ft40: 28.8, ft41: 24.2 },

  // winner: 168 - Liverpool away vs Burnley/Sunderland
  { id: "burliv", home: "bur", away: "liv", winner: 168, fiveZero: 54.6, fiveOne: 54.6, oneX: 22.3, twoX: 22.3, tg0: 15.3, tg6: 17.4, x2: 25.5, ht12: 33.8, ht21: 12.7, ht30: 17.7, ft40: 21.8, ft41: 21.8 },
  { id: "sunliv", home: "sun", away: "liv", winner: 168, fiveZero: 54.6, fiveOne: 54.6, oneX: 22.3, twoX: 22.3, tg0: 15.3, tg6: 17.4, x2: 25.5, ht12: 33.8, ht21: 12.7, ht30: 17.7, ft40: 21.8, ft41: 21.8 }
];
