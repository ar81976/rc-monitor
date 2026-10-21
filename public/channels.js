// TV channels on the TV tab. British channels come first: when the main screen's channel isn't
// streaming, the monitor moves to the next one in this list, and the tiles fill in the same order.
// youtube: the broadcaster's YouTube channel ID. When set, its live stream plays inside the monitor.
//          A channel that isn't streaming at the moment is skipped automatically and tried again
//          every 30 minutes. If a broadcaster changes its YouTube channel, update the ID here.
// When youtube is null, the button opens the channel's own site or app instead.
window.RC_CHANNELS = [
  // British
  { id: "sky",       name: "Sky News",           youtube: "UCoMdktPbSTixAyNGwb-UYkQ", url: "https://news.sky.com/watch-live",                 note: "24-hour UK news." },
  { id: "gbnews",    name: "GB News",            youtube: "UC0vn8ISa4LKMunLbzaXLnOQ", url: "https://www.gbnews.com/watch/live",              note: "UK news and politics." },
  { id: "bbc",       name: "BBC News",           youtube: null, url: "https://www.bbc.co.uk/iplayer/live/bbcnews",       note: "The BBC does not allow its live stream to play inside other sites. Opens BBC iPlayer (TV licence needed)." },
  { id: "lbc",       name: "LBC",                youtube: "UCb1Ti1WKPauPpXkYKVHNpsw", url: "https://www.lbc.co.uk/",                         note: "London news and phone-in, when its studio camera is streaming." },
  // Business and international
  { id: "bloomberg", name: "Bloomberg",          youtube: "UCIALMKvObZNtJ6AmdCLP7Lg", url: "https://www.bloomberg.com/live",                 note: "Markets and business television." },
  { id: "euronews",  name: "Euronews",           youtube: "UCSrZ3UV4jOidv8ppoVuvW9Q", url: "https://www.euronews.com/live",                  note: "European news in English." },
  { id: "aje",       name: "Al Jazeera English", short: "Al Jazeera", youtube: "UCNye-wNBqNL5ZzHSJj3l8Bg", url: "https://www.aljazeera.com/live", note: "International news." },
  { id: "f24",       name: "France 24",          youtube: "UCQfwfsi5VrQ8yKZ-UWmAEFg", url: "https://www.france24.com/en/live",              note: "International news in English." },
  { id: "dw",        name: "DW News",            youtube: "UCknLrEdhRCp1aegoMqRaCZg", url: "https://www.dw.com/en/live-tv/channel-english", note: "German international news in English." },
  { id: "cna",       name: "CNA",                youtube: "UC83jt4dlz1Gjl58fzQrrKZg", url: "https://www.channelnewsasia.com/watch",         note: "Asian and world news in English." },
  { id: "trt",       name: "TRT World",          youtube: "UC7fWeaHhqgM4Ry-RMpM2YYw", url: "https://www.trtworld.com/live",                  note: "International news in English." },
  // Open separately
  { id: "bbcparl",   name: "BBC Parliament",     youtube: null, url: "https://www.bbc.co.uk/iplayer/live/bbcparliament", note: "iPlayer only. Opens BBC iPlayer (TV licence needed)." },
  { id: "parllive",  name: "Parliament Live",    youtube: null, url: "https://parliamentlive.tv/",                       note: "Parliament's own coverage of the Commons, Lords and committees, live when sitting." },
  { id: "cnn",       name: "CNN",                youtube: null, url: "https://edition.cnn.com/",                         note: "No free live stream. Opens CNN's site." },
  { id: "prime",     name: "Prime Video",        youtube: null, url: "https://www.primevideo.com/",                      note: "On the Fire TV, switch with the Home button and come back with Back." },
];
