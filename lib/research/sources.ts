/**
 * Philippine real estate research sources: who publishes what, and how much to trust it.
 *  official  – government agencies, laws, courts, regulators (cite first)
 *  research  – established property consultancies, banks, multilaterals
 *  news      – national news and business press
 *  portal    – listing portals and private data sites (useful leads; verify against an official source)
 * Each research answer names its sources with these tiers, so a broker sees at a glance what is official.
 */

export type Tier = "official" | "research" | "news" | "portal" | "other";
export type Topic = "zonal" | "tax" | "filing" | "law" | "market" | "property" | "developer" | "financing" | "land" | "local";

export interface Publisher {
  domain: string;
  name: string;
  tier: Tier;
  topics: Topic[];
  /** What to look for there. */
  covers: string;
  /** A good starting page. */
  start?: string;
}

export const PUBLISHERS: Publisher[] = [
  // ---- official
  { domain: "bir.gov.ph", name: "Bureau of Internal Revenue (BIR)", tier: "official", topics: ["zonal", "tax", "filing"], covers: "Zonal values per Revenue District Office, ONETT/eCAR, BIR forms 1706, 2000-OT, 1606, 1707, revenue regulations (RR), memorandum circulars (RMC) and orders (RMO)", start: "https://www.bir.gov.ph/zonal-values" },
  { domain: "efps.bir.gov.ph", name: "BIR eFPS", tier: "official", topics: ["filing"], covers: "Electronic filing and payment" },
  { domain: "orus.bir.gov.ph", name: "BIR ORUS", tier: "official", topics: ["filing"], covers: "Online registration and TIN" },
  { domain: "dof.gov.ph", name: "Department of Finance (DOF)", tier: "official", topics: ["tax", "zonal", "law"], covers: "Tax policy, department orders on zonal values, RPVARA implementation" },
  { domain: "blgf.gov.ph", name: "Bureau of Local Government Finance (BLGF)", tier: "official", topics: ["zonal", "tax", "local"], covers: "Real property valuation standards, schedules of market values (SMV) under RA 12001, real property tax" },
  { domain: "dhsud.gov.ph", name: "Department of Human Settlements and Urban Development (DHSUD)", tier: "official", topics: ["law", "developer", "property"], covers: "License to sell, developer registration, subdivision and condominium rules, socialized housing, Pambansang Pabahay" },
  { domain: "hsac.gov.ph", name: "Human Settlements Adjudication Commission", tier: "official", topics: ["law", "developer"], covers: "Buyer–developer disputes" },
  { domain: "lra.gov.ph", name: "Land Registration Authority (LRA)", tier: "official", topics: ["land", "filing"], covers: "Titles, registration fees, eSerbisyo certified true copies" },
  { domain: "denr.gov.ph", name: "DENR", tier: "official", topics: ["land"], covers: "Public land, land classification, patents" },
  { domain: "lmb.gov.ph", name: "Land Management Bureau", tier: "official", topics: ["land"], covers: "Surveys, cadastral maps, free patents" },
  { domain: "dar.gov.ph", name: "Department of Agrarian Reform", tier: "official", topics: ["land", "law"], covers: "Agricultural land conversion, CARP coverage, retention" },
  { domain: "pagibigfund.gov.ph", name: "Pag-IBIG Fund", tier: "official", topics: ["financing"], covers: "Housing loan rates, limits, acquired assets" },
  { domain: "bsp.gov.ph", name: "Bangko Sentral ng Pilipinas (BSP)", tier: "official", topics: ["market", "financing"], covers: "Residential Real Estate Price Index (RPPI), real estate loan exposure, policy rates" },
  { domain: "psa.gov.ph", name: "Philippine Statistics Authority (PSA)", tier: "official", topics: ["market"], covers: "Construction statistics, building permits, prices, population" },
  { domain: "depdev.gov.ph", name: "Department of Economy, Planning, and Development", tier: "official", topics: ["market", "local"], covers: "Infrastructure flagship projects, regional plans" },
  { domain: "dpwh.gov.ph", name: "DPWH", tier: "official", topics: ["local"], covers: "Road and infrastructure projects" },
  { domain: "dotr.gov.ph", name: "Department of Transportation", tier: "official", topics: ["local"], covers: "Rail and airport projects (Metro Manila Subway, NSCR, MRT/LRT)" },
  { domain: "sec.gov.ph", name: "Securities and Exchange Commission", tier: "official", topics: ["developer"], covers: "Company registration, REITs" },
  { domain: "edge.pse.com.ph", name: "PSE EDGE", tier: "official", topics: ["developer", "market"], covers: "Listed developers' and REITs' disclosures and annual reports" },
  { domain: "prc.gov.ph", name: "Professional Regulation Commission", tier: "official", topics: ["law"], covers: "Real estate service licenses (RA 9646)" },
  { domain: "officialgazette.gov.ph", name: "Official Gazette", tier: "official", topics: ["law", "tax"], covers: "Republic Acts, executive orders" },
  { domain: "lawphil.net", name: "LawPhil (Arellano Law Foundation)", tier: "official", topics: ["law", "tax"], covers: "Full text of laws and Supreme Court decisions" },
  { domain: "elibrary.judiciary.gov.ph", name: "Supreme Court E-Library", tier: "official", topics: ["law"], covers: "Supreme Court decisions" },
  { domain: "sc.judiciary.gov.ph", name: "Supreme Court of the Philippines", tier: "official", topics: ["law"], covers: "Decisions, notarial rules" },
  { domain: "senate.gov.ph", name: "Senate of the Philippines", tier: "official", topics: ["law"], covers: "Bills and laws" },
  { domain: "congress.gov.ph", name: "House of Representatives", tier: "official", topics: ["law"], covers: "Bills and laws" },
  { domain: "ntrc.gov.ph", name: "National Tax Research Center", tier: "official", topics: ["tax"], covers: "Tax research" },
  { domain: "nha.gov.ph", name: "National Housing Authority", tier: "official", topics: ["property"], covers: "Socialized and public housing" },
  { domain: "shfc.dhsud.gov.ph", name: "Social Housing Finance Corporation", tier: "official", topics: ["financing"], covers: "Community mortgage program" },
  { domain: "bcda.gov.ph", name: "BCDA", tier: "official", topics: ["local", "market"], covers: "New Clark City, BGC and former base lands" },
  { domain: "peza.gov.ph", name: "PEZA", tier: "official", topics: ["market", "local"], covers: "Economic zones, IT parks" },
  { domain: "gov.ph", name: "Philippine government site", tier: "official", topics: ["local"], covers: "City and provincial assessors, ordinances (transfer tax rates), local SMVs" },
  // ---- research
  { domain: "colliers.com", name: "Colliers Philippines", tier: "research", topics: ["market"], covers: "Quarterly office, residential, retail, hotel, industrial reports" },
  { domain: "leechiu.com", name: "Leechiu Property Consultants", tier: "research", topics: ["market"], covers: "Market briefings: residential take-up, office demand" },
  { domain: "santos.knightfrank.com", name: "Santos Knight Frank", tier: "research", topics: ["market"], covers: "Market reports" },
  { domain: "knightfrank.com", name: "Knight Frank", tier: "research", topics: ["market"], covers: "Global and Asia-Pacific reports" },
  { domain: "jll.com", name: "JLL", tier: "research", topics: ["market"], covers: "Market reports" },
  { domain: "cushmanwakefield.com", name: "Cushman & Wakefield", tier: "research", topics: ["market"], covers: "Market reports" },
  { domain: "kmc.com.ph", name: "KMC Savills", tier: "research", topics: ["market"], covers: "Market reports" },
  { domain: "savills.com", name: "Savills", tier: "research", topics: ["market"], covers: "Market reports" },
  { domain: "pwc.com", name: "PwC Philippines", tier: "research", topics: ["tax"], covers: "Tax alerts on new BIR issuances" },
  { domain: "grantthornton.com.ph", name: "Grant Thornton Philippines", tier: "research", topics: ["tax"], covers: "Tax notes and alerts" },
  { domain: "deloitte.com", name: "Deloitte", tier: "research", topics: ["tax"], covers: "Tax alerts" },
  { domain: "kpmg.com", name: "KPMG (R.G. Manabat)", tier: "research", topics: ["tax"], covers: "Tax alerts" },
  { domain: "forvismazars.com", name: "Forvis Mazars Philippines", tier: "research", topics: ["tax", "filing"], covers: "Tax alerts and calendars" },
  { domain: "worldbank.org", name: "World Bank", tier: "research", topics: ["market"], covers: "Philippines economic updates" },
  { domain: "adb.org", name: "Asian Development Bank", tier: "research", topics: ["market"], covers: "Outlook, infrastructure" },
  // ---- news
  { domain: "bworldonline.com", name: "BusinessWorld", tier: "news", topics: ["market", "tax", "developer"], covers: "Business news, property, tax columns" },
  { domain: "inquirer.net", name: "Philippine Daily Inquirer", tier: "news", topics: ["market", "developer", "local"], covers: "News" },
  { domain: "philstar.com", name: "The Philippine Star", tier: "news", topics: ["market", "developer"], covers: "News" },
  { domain: "mb.com.ph", name: "Manila Bulletin", tier: "news", topics: ["market", "tax", "developer"], covers: "News" },
  { domain: "gmanetwork.com", name: "GMA News", tier: "news", topics: ["market", "local"], covers: "News" },
  { domain: "abs-cbn.com", name: "ABS-CBN News", tier: "news", topics: ["market", "local"], covers: "News" },
  { domain: "rappler.com", name: "Rappler", tier: "news", topics: ["market", "local"], covers: "News" },
  { domain: "pna.gov.ph", name: "Philippine News Agency", tier: "news", topics: ["market", "local"], covers: "Government news agency" },
  { domain: "manilatimes.net", name: "The Manila Times", tier: "news", topics: ["market"], covers: "News" },
  { domain: "tribune.net.ph", name: "Daily Tribune", tier: "news", topics: ["market"], covers: "News" },
  { domain: "bilyonaryo.com", name: "Bilyonaryo", tier: "news", topics: ["developer", "market"], covers: "Business news" },
  { domain: "reuters.com", name: "Reuters", tier: "news", topics: ["market"], covers: "News" },
  { domain: "bloomberg.com", name: "Bloomberg", tier: "news", topics: ["market"], covers: "News" },
  // ---- portals and private data (leads; verify)
  { domain: "lamudi.com.ph", name: "Lamudi", tier: "portal", topics: ["property", "market"], covers: "Listings and asking-price trends" },
  { domain: "dotproperty.com.ph", name: "Dot Property", tier: "portal", topics: ["property", "market"], covers: "Listings, developer pages" },
  { domain: "property24.com.ph", name: "Property24", tier: "portal", topics: ["property"], covers: "Listings" },
  { domain: "zipmatch.com", name: "ZipMatch", tier: "portal", topics: ["property"], covers: "Listings" },
  { domain: "housal.com", name: "Housal", tier: "portal", topics: ["zonal", "property"], covers: "Searchable copies of BIR zonal value schedules; verify the Department Order on bir.gov.ph" },
  { domain: "ren.ph", name: "REN.PH", tier: "portal", topics: ["zonal"], covers: "Zonal value lookups copied from BIR schedules; verify on bir.gov.ph" },
  { domain: "respicio.ph", name: "Respicio & Co. commentaries", tier: "portal", topics: ["law", "tax"], covers: "Legal explainers (secondary; check the law cited)" },
  { domain: "batasnatin.com", name: "Batas Natin", tier: "portal", topics: ["law", "tax"], covers: "Summaries of laws and BIR circulars (secondary)" },
  { domain: "juan.tax", name: "JuanTax", tier: "portal", topics: ["filing"], covers: "BIR form guides (secondary)" },
];

const byDomain = new Map(PUBLISHERS.map((p) => [p.domain, p]));

/** The publisher for a link: exact domain, then parent domains; any *.gov.ph is official. */
export function publisherOf(url: string): { name: string; tier: Tier; domain: string } {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { name: url, tier: "other", domain: "" };
  }
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join(".");
    const p = byDomain.get(d);
    if (p && (d !== "gov.ph" || i === parts.length - 2)) return { name: p.name, tier: p.tier, domain: host };
  }
  if (host.endsWith(".gov.ph") || host.endsWith(".gov")) return { name: host, tier: "official", domain: host };
  if (host.endsWith(".edu.ph")) return { name: host, tier: "research", domain: host };
  return { name: host, tier: "other", domain: host };
}

export const TIER_LABEL: Record<Tier, string> = { official: "Official", research: "Research", news: "News", portal: "Portal (verify)", other: "Other" };
export const TIER_RANK: Record<Tier, number> = { official: 0, research: 1, news: 2, portal: 3, other: 4 };

/** Sites to search first for a topic (official first). */
export function sitesFor(topic: Topic, tiers: Tier[] = ["official", "research", "news"]): string[] {
  return PUBLISHERS.filter((p) => p.topics.includes(topic) && tiers.includes(p.tier) && p.domain !== "gov.ph")
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])
    .map((p) => p.domain);
}
