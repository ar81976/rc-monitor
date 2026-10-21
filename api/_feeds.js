// News feeds shown in Redfern Cavendish Monitor.
// Each entry: id, source (shown on screen), desk (biz | pol | brk | ins), url.
// Add, remove or reorder freely; a feed that fails is skipped and the rest still show.
// Sport is always left out (by the feed's own section labels); "skip" leaves out other sections too.
// The Telegraph publishes free feeds; The Times does not (it withdrew its RSS feeds), so it cannot be added.

export const FEEDS = [
  // UK business
  { id: "bbc-business",   source: "BBC Business",      desk: "biz", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { id: "sky-business",   source: "Sky News",          desk: "biz", url: "https://feeds.skynews.com/feeds/rss/business.xml" },
  { id: "telegraph-biz",  source: "Telegraph Business", desk: "biz", url: "https://www.telegraph.co.uk/business/rss.xml" },
  { id: "telegraph-money", source: "Telegraph Money",  desk: "biz", url: "https://www.telegraph.co.uk/money/rss.xml" },
  { id: "cityam",         source: "City AM",           desk: "biz", url: "https://www.cityam.com/category/business/feed/", skip: /^opinion$/i },
  { id: "boe",            source: "Bank of England",   desk: "biz", url: "https://www.bankofengland.co.uk/rss/news" },

  // Westminster
  { id: "bbc-politics",   source: "BBC Politics",      desk: "pol", url: "https://feeds.bbci.co.uk/news/politics/rss.xml" },
  { id: "sky-politics",   source: "Sky News",          desk: "pol", url: "https://feeds.skynews.com/feeds/rss/politics.xml" },
  { id: "telegraph-pol",  source: "Telegraph Politics", desk: "pol", url: "https://www.telegraph.co.uk/politics/rss.xml" },
  { id: "parl-bills",     source: "UK Parliament",     desk: "pol", url: "https://bills.parliament.uk/rss/allbills.rss" },

  // UK headlines
  { id: "bbc-uk",         source: "BBC News",          desk: "brk", url: "https://feeds.bbci.co.uk/news/uk/rss.xml" },
  { id: "sky-uk",         source: "Sky News",          desk: "brk", url: "https://feeds.skynews.com/feeds/rss/uk.xml" },
  { id: "telegraph-uk",   source: "Telegraph",         desk: "brk", url: "https://www.telegraph.co.uk/news/rss.xml" },

  // Insolvency and courts
  { id: "insolvency-svc", source: "Insolvency Service", desk: "ins", url: "https://www.gov.uk/government/organisations/insolvency-service.atom" },
  { id: "hmcts",          source: "HM Courts & Tribunals", desk: "ins", url: "https://www.gov.uk/government/organisations/hm-courts-and-tribunals-service.atom" },
];

export const ITEMS_PER_FEED = 6;
