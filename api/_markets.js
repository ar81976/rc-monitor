// Ticker contents. Codes are in EODHD's format (https://eodhd.com):
//   .INDX = index, .LSE = London Stock Exchange (prices in pence), .US = US stock, .XETRA = Frankfurt, .PA = Paris, .MI = Milan (euros), .SW = Zurich (Swiss francs), .FOREX = currency pair.
// "idx: true" items (indices, currencies, gold, Brent and gilt yields) appear on every loop of the ticker, in light bronze.
// alt: other codes to try if EODHD has no live price under the first. eod: use the latest daily
// close instead of a live price (gilt yields are published daily). proxy: a tracker fund whose
// move for the day stands in when no live level is available; only the % move is shown.
// Shares belong to a "group"; the ticker shows one group per loop, taking turns
// (UK Shares, then US Tech & AI, then Luxury, and round again). Change the list freely.

export const MARKETS = [
  { code: "FTSE.INDX",   name: "FTSE 100", idx: true, alt: ["UKX.INDX", "FTSE100.INDX"], proxy: "ISF.LSE" },  // proxy: iShares FTSE 100 tracker, day's move only
  { code: "FTMC.INDX",   name: "FTSE 250", idx: true, alt: ["MCX.INDX", "FTSE250.INDX"], proxy: "MIDD.LSE" },  // iShares FTSE 250 tracker
  { code: "DJI.INDX",    name: "DOW",      idx: true },
  { code: "GSPC.INDX",   name: "S&P 500",  idx: true },
  { code: "GBPUSD.FOREX", name: "GBP/USD", idx: true, dp: 4 },
  { code: "GBPEUR.FOREX", name: "GBP/EUR", idx: true, dp: 4 },
  { code: "EURUSD.FOREX", name: "EUR/USD", idx: true, dp: 4 },
  { code: "XAUUSD.FOREX", name: "GOLD",    idx: true, unit: "$", dp: 0, eod: true, proxy: "GLD.US" },  // dollars per troy ounce; latest daily close (no live tick on this plan)
  { code: "XBRUSD.FOREX", name: "BRENT",   idx: true, unit: "$", eod: true, proxy: "BNO.US" },  // dollars per barrel; latest daily close
  // Gilt yields themselves need EODHD's All-in-One plan; the UK gilts tracker fund stands in (day's move, %).
  { code: "IGLT.LSE",     name: "UK GILTS", idx: true, kind: "pct" },
  { code: "BARC.LSE",    name: "BARC", group: "UK Shares" },
  { code: "LLOY.LSE",    name: "LLOY", group: "UK Shares" },
  { code: "HSBA.LSE",    name: "HSBA", group: "UK Shares" },
  { code: "NWG.LSE",     name: "NWG", group: "UK Shares" },
  { code: "BP.LSE",      name: "BP.", group: "UK Shares" },
  { code: "SHEL.LSE",    name: "SHEL", group: "UK Shares" },
  { code: "AZN.LSE",     name: "AZN", group: "UK Shares" },
  { code: "RR.LSE",      name: "RR.", group: "UK Shares" },
  { code: "VOD.LSE",     name: "VOD", group: "UK Shares" },
  { code: "TSCO.LSE",    name: "TSCO", group: "UK Shares" },
  { code: "AAPL.US",     name: "AAPL", group: "US Tech & AI" },
  { code: "MSFT.US",     name: "MSFT", group: "US Tech & AI" },
  { code: "NVDA.US",     name: "NVDA", group: "US Tech & AI" },
  // Luxury cars
  { code: "AML.LSE",     name: "ASTON MARTIN", group: "Luxury" },  // pence, London
  { code: "P911.XETRA",  name: "PORSCHE", group: "Luxury" },       // euros, Frankfurt
  { code: "RACE.US",     name: "FERRARI", group: "Luxury" },       // dollars, New York
  // Luxury goods
  { code: "MC.PA",       name: "LVMH", group: "Luxury" },          // euros, Paris
  { code: "RMS.PA",      name: "HERMÈS", group: "Luxury" },        // euros, Paris
  { code: "KER.PA",      name: "KERING", group: "Luxury" },        // euros, Paris (Gucci)
  { code: "CFR.SW",      name: "RICHEMONT", group: "Luxury" },     // Swiss francs, Zurich (Cartier)
  { code: "BRBY.LSE",    name: "BURBERRY", group: "Luxury" },      // pence, London
  // AI companies
  { code: "PLTR.US",     name: "PLTR", group: "US Tech & AI" },   // Palantir
  { code: "GOOGL.US",    name: "GOOGL", group: "US Tech & AI" },  // Alphabet (Google)
  { code: "AMZN.US",     name: "AMZN", group: "US Tech & AI" },   // Amazon
  { code: "META.US",     name: "META", group: "US Tech & AI" },   // Meta
  { code: "AMD.US",      name: "AMD", group: "US Tech & AI" },    // AMD
  { code: "AVGO.US",     name: "AVGO", group: "US Tech & AI" },   // Broadcom
  { code: "TSM.US",      name: "TSM", group: "US Tech & AI" },    // TSMC
  { code: "ARM.US",      name: "ARM", group: "US Tech & AI" },    // Arm Holdings
  { code: "ASML.US",     name: "ASML", group: "US Tech & AI" },   // ASML
];
