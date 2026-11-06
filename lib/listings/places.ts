/**
 * Philippine place gazetteer for the listings index. Turns free-text locations ("Pacific Plaza Fort Bonifacio
 * Global City", "SAN FERNANDO CITY, LA UNION", "Zinnia Towers ... QC") into a canonical city and province,
 * so the index can be filtered and faceted by place. Districts and landmarks map to their city (BGC → Taguig).
 * Coverage: all Metro Manila LGUs plus the cities and provinces seen in GRID listings; extend as needed.
 */
import { KINDS } from "./kinds";
import { normalizeText } from "./normalize";

export interface Place {
  city: string | null;
  province: string | null;
  /** The normalized phrases that were recognised as places. */
  matched?: string[];
}

/** Provinces (and Metro Manila) with their aliases. */
const PROVINCES: Record<string, string[]> = {
  "Metro Manila": ["metro manila", "ncr", "national capital region"],
  "La Union": ["la union"],
  "Ilocos Sur": ["ilocos sur"],
  "Ilocos Norte": ["ilocos norte"],
  Pangasinan: ["pangasinan"],
  Benguet: ["benguet"],
  Kalinga: ["kalinga"],
  "Nueva Vizcaya": ["nueva vizcaya"],
  Isabela: ["isabela"],
  Cagayan: ["cagayan valley", "cagayan province"],
  Aurora: ["aurora province"],
  Bulacan: ["bulacan"],
  Pampanga: ["pampanga"],
  Tarlac: ["tarlac"],
  "Nueva Ecija": ["nueva ecija"],
  Zambales: ["zambales"],
  Bataan: ["bataan"],
  Cavite: ["cavite"],
  Laguna: ["laguna"],
  Batangas: ["batangas"],
  Rizal: ["rizal"],
  Quezon: ["quezon province"],
  "Oriental Mindoro": ["oriental mindoro"],
  "Occidental Mindoro": ["occidental mindoro"],
  Palawan: ["palawan"],
  Albay: ["albay"],
  "Camarines Sur": ["camarines sur"],
  "Camarines Norte": ["camarines norte"],
  Cebu: ["cebu"],
  Bohol: ["bohol"],
  Aklan: ["aklan"],
  Iloilo: ["iloilo"],
  "Negros Occidental": ["negros occidental"],
  "Negros Oriental": ["negros oriental"],
  Leyte: ["leyte"],
  "Misamis Oriental": ["misamis oriental"],
  "Davao del Sur": ["davao del sur"],
  "Zamboanga del Sur": ["zamboanga del sur"],
  "South Cotabato": ["south cotabato"],
  "Surigao del Norte": ["surigao del norte"],
};

/** [canonical city, province, aliases]. Earlier entries win ties; longer aliases always win over shorter. */
const CITIES: [string, string, string[]][] = [
  // Metro Manila LGUs and their districts/landmarks
  ["Quezon City", "Metro Manila", ["quezon city", "qc", "cubao", "diliman", "katipunan", "eastwood", "novaliches", "fairview", "commonwealth", "timog", "tomas morato", "new manila", "araneta city", "project 4", "white plains", "loyola heights", "teachers village", "sauyo"]],
  ["Makati", "Metro Manila", ["makati", "salcedo village", "legaspi village", "rockwell", "poblacion makati", "circuit makati", "dasmarinas village", "forbes park", "urdaneta village", "bel air", "san lorenzo village", "magallanes village", "guadalupe", "two central", "gentry manor", "one central", "greenbelt"]],
  ["Taguig", "Metro Manila", ["taguig", "bgc", "bonifacio global city", "fort bonifacio", "the fort", "mckinley hill", "mckinley west", "arca south", "uptown bonifacio", "uptown arts", "uptown parksuites", "serendra", "grand hyatt residences", "aurelia residences", "sapphire residences", "forbes town", "high street", "lower bicutan", "upper bicutan"]],
  ["Pasig", "Metro Manila", ["pasig", "ortigas", "ortigas center", "kapitolyo", "capitol commons", "valle verde", "greenmeadows", "green meadows", "ugong", "bagong ilog", "rosario pasig"]],
  ["Mandaluyong", "Metro Manila", ["mandaluyong", "shaw boulevard", "shaw blvd", "wack wack", "highway hills", "greenfield district", "gateway regency"]],
  ["San Juan", "Metro Manila", ["san juan city", "greenhills", "little baguio"]],
  ["Manila", "Metro Manila", ["manila", "city of manila", "malate", "ermita", "binondo", "tondo", "sampaloc", "santa cruz manila", "intramuros", "paco", "pandacan", "santa ana manila", "san miguel manila", "quiapo", "san andres", "sta mesa", "santa mesa"]],
  ["Pasay", "Metro Manila", ["pasay", "moa", "mall of asia", "macapagal", "newport city", "shore residences", "villamor"]],
  ["Paranaque", "Metro Manila", ["paranaque", "bf homes", "sucat", "aseana", "entertainment city", "betterliving", "better living", "multinational village", "concorde village", "don bosco", "asiaworld"]],
  ["Las Pinas", "Metro Manila", ["las pinas", "pilar village", "bf resort", "bf international"]],
  ["Muntinlupa", "Metro Manila", ["muntinlupa", "alabang", "ayala alabang", "filinvest city", "pacific village", "tunasan", "putatan"]],
  ["Marikina", "Metro Manila", ["marikina", "concepcion marikina", "provident village"]],
  ["Caloocan", "Metro Manila", ["caloocan", "bagong silang", "maypajo"]],
  ["Malabon", "Metro Manila", ["malabon"]],
  ["Navotas", "Metro Manila", ["navotas"]],
  ["Valenzuela", "Metro Manila", ["valenzuela"]],
  ["Pateros", "Metro Manila", ["pateros"]],
  // Luzon
  ["San Fernando (La Union)", "La Union", ["san fernando city la union", "san fernando la union"]],
  ["Bauang", "La Union", ["bauang"]],
  ["Vigan", "Ilocos Sur", ["vigan"]],
  ["Narvacan", "Ilocos Sur", ["narvacan"]],
  ["Laoag", "Ilocos Norte", ["laoag"]],
  ["Dagupan", "Pangasinan", ["dagupan"]],
  ["Urdaneta", "Pangasinan", ["urdaneta city"]],
  ["Baguio", "Benguet", ["baguio", "baguio city"]],
  ["La Trinidad", "Benguet", ["la trinidad"]],
  ["Tabuk", "Kalinga", ["tabuk"]],
  ["Tuguegarao", "Cagayan", ["tuguegarao"]],
  ["Santiago", "Isabela", ["santiago city"]],
  ["Baler", "Aurora", ["baler"]],
  ["Malolos", "Bulacan", ["malolos"]],
  ["Meycauayan", "Bulacan", ["meycauayan"]],
  ["San Jose del Monte", "Bulacan", ["san jose del monte", "sjdm"]],
  ["Calumpit", "Bulacan", ["calumpit"]],
  ["Marilao", "Bulacan", ["marilao"]],
  ["Bocaue", "Bulacan", ["bocaue"]],
  ["Plaridel", "Bulacan", ["plaridel"]],
  ["Baliuag", "Bulacan", ["baliuag", "baliwag"]],
  ["Santa Maria", "Bulacan", ["santa maria bulacan", "sta maria bulacan"]],
  ["San Fernando (Pampanga)", "Pampanga", ["san fernando pampanga", "city of san fernando"]],
  ["Angeles", "Pampanga", ["angeles city", "angeles pampanga"]],
  ["Clark", "Pampanga", ["clark", "clark freeport"]],
  ["Mabalacat", "Pampanga", ["mabalacat"]],
  ["Tarlac City", "Tarlac", ["tarlac city"]],
  ["La Paz", "Tarlac", ["la paz tarlac"]],
  ["Capas", "Tarlac", ["capas"]],
  ["Cabanatuan", "Nueva Ecija", ["cabanatuan"]],
  ["Guimba", "Nueva Ecija", ["guimba"]],
  ["Gapan", "Nueva Ecija", ["gapan"]],
  ["Subic", "Zambales", ["subic"]],
  ["Olongapo", "Zambales", ["olongapo"]],
  ["Balanga", "Bataan", ["balanga"]],
  ["Bacoor", "Cavite", ["bacoor"]],
  ["Imus", "Cavite", ["imus"]],
  ["Dasmarinas", "Cavite", ["dasmarinas"]],
  ["Tagaytay", "Cavite", ["tagaytay"]],
  ["General Trias", "Cavite", ["general trias", "gen trias", "antel grand village"]],
  ["Silang", "Cavite", ["silang"]],
  ["Kawit", "Cavite", ["kawit"]],
  ["Carmona", "Cavite", ["carmona"]],
  ["Santa Rosa", "Laguna", ["santa rosa laguna", "sta rosa laguna", "santa rosa city", "nuvali"]],
  ["Calamba", "Laguna", ["calamba"]],
  ["Binan", "Laguna", ["binan"]],
  ["San Pedro", "Laguna", ["san pedro laguna"]],
  ["Cabuyao", "Laguna", ["cabuyao"]],
  ["Los Banos", "Laguna", ["los banos"]],
  ["Batangas City", "Batangas", ["batangas city"]],
  ["Lipa", "Batangas", ["lipa", "lipa city"]],
  ["Tanauan", "Batangas", ["tanauan"]],
  ["Santo Tomas", "Batangas", ["santo tomas batangas", "sto tomas batangas"]],
  ["Nasugbu", "Batangas", ["nasugbu"]],
  ["Antipolo", "Rizal", ["antipolo", "eastland heights"]],
  ["Cainta", "Rizal", ["cainta"]],
  ["Taytay", "Rizal", ["taytay"]],
  ["San Mateo", "Rizal", ["san mateo"]],
  ["Rodriguez", "Rizal", ["rodriguez rizal", "montalban"]],
  ["Binangonan", "Rizal", ["binangonan"]],
  ["Angono", "Rizal", ["angono"]],
  ["Lucena", "Quezon", ["lucena"]],
  ["Tayabas", "Quezon", ["tayabas"]],
  ["Puerto Galera", "Oriental Mindoro", ["puerto galera"]],
  ["Puerto Princesa", "Palawan", ["puerto princesa"]],
  ["El Nido", "Palawan", ["el nido"]],
  ["Coron", "Palawan", ["coron"]],
  ["Legazpi", "Albay", ["legazpi"]],
  ["Naga", "Camarines Sur", ["naga city"]],
  ["Labo", "Camarines Norte", ["labo"]],
  ["Dona Remedios Trinidad", "Bulacan", ["dona remedios trinidad", "drt highway"]],
  // Visayas and Mindanao
  ["Cebu City", "Cebu", ["cebu city", "cebu business park", "cebu it park"]],
  ["Mandaue", "Cebu", ["mandaue"]],
  ["Lapu-Lapu", "Cebu", ["lapu lapu city", "mactan"]],
  ["Tagbilaran", "Bohol", ["tagbilaran"]],
  ["Panglao", "Bohol", ["panglao"]],
  ["Boracay", "Aklan", ["boracay"]],
  ["Iloilo City", "Iloilo", ["iloilo city"]],
  ["Bacolod", "Negros Occidental", ["bacolod"]],
  ["Dumaguete", "Negros Oriental", ["dumaguete"]],
  ["Tacloban", "Leyte", ["tacloban"]],
  ["Cagayan de Oro", "Misamis Oriental", ["cagayan de oro", "cdo"]],
  ["Davao City", "Davao del Sur", ["davao city", "davao"]],
  ["Zamboanga City", "Zamboanga del Sur", ["zamboanga city", "zamboanga"]],
  ["General Santos", "South Cotabato", ["general santos", "gensan"]],
  ["Siargao", "Surigao del Norte", ["siargao", "general luna"]],
];

/** Display names with Philippine spelling (normalized forms drop ñ). */
const DISPLAY: Record<string, string> = { Paranaque: "Parañaque", "Las Pinas": "Las Piñas", Dasmarinas: "Dasmariñas", Binan: "Biñan", "Los Banos": "Los Baños" };
export const displayPlace = (s: string) => DISPLAY[s] ?? s;

/** Phrases that mention Manila but are not the City of Manila. */
const NOT_MANILA = ["metro manila", "southern manila district", "northern manila district", "manila bay", "manila east road"];

type Alias = { alias: string; kind: "city" | "province"; name: string; province: string };
const ALIASES: Alias[] = [
  ...CITIES.flatMap(([name, province, aliases]) => aliases.map((alias) => ({ alias, kind: "city" as const, name, province }))),
  ...Object.entries(PROVINCES).flatMap(([name, aliases]) => aliases.map((alias) => ({ alias, kind: "province" as const, name, province: name }))),
].sort((a, b) => b.alias.length - a.alias.length);

export const KNOWN_CITIES = CITIES.map(([c, p]) => ({ city: c, province: p }));
export const KNOWN_PROVINCES = Object.keys(PROVINCES);

/**
 * Finds the most specific place in free text. Longest aliases match first and consume their words,
 * so "quezon city" never also matches a shorter alias and "metro manila" never reads as the City of Manila.
 */
export function resolvePlace(text: string): Place {
  let t = ` ${normalizeText(text)} `;
  let province: string | null = null;
  let city: string | null = null;
  const cityHits: Alias[] = [];
  const matched: string[] = [];
  for (const phrase of NOT_MANILA) {
    if (t.includes(` ${phrase} `)) {
      if (phrase === "metro manila") province = "Metro Manila";
      matched.push(phrase);
      t = t.replaceAll(` ${phrase} `, " | ");
    }
  }
  for (const a of ALIASES) {
    const needle = ` ${a.alias} `;
    if (!t.includes(needle)) continue;
    if (a.kind === "city") cityHits.push(a);
    else province ??= a.name;
    matched.push(a.alias);
    t = t.replaceAll(needle, " | ");
  }
  if (cityHits.length) {
    // Prefer a city in the province the text names ("San Fernando ... La Union").
    const pick = cityHits.find((c) => c.province === province) ?? cityHits[0]!;
    city = pick.name;
    province = pick.province;
  }
  return { city: city && displayPlace(city), province, matched };
}

/** One-word place aliases, for spelling correction ("makatti" → "makati", "paranake" → "paranaque"). */
const PLACE_WORDS = [...new Set(ALIASES.map((a) => a.alias).filter((a) => !a.includes(" ") && a.length >= 4))];

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Ordinary listing words that look like place names ("condo" vs Tondo): never "corrected". */
const VOCABULARY = new Set([
  ...Object.values(KINDS).flatMap((k) => [...k.words, ...(k.cues ?? [])].flatMap((w) => normalizeText(w).split(" "))),
  ..."condos houses lots office offices tower towers residence residences village villas street avenue road highway unit units furnished semi corner garden parking building buildings rental rentals beach resort farm modern prime vacant inner along near view facing tenant tenanted commercial residential industrial agricultural investment preselling selling".split(" "),
]);

/** Replaces misspelt place words with the nearest known place (1 edit for 6-7 letters, 2 for 8+). */
export function correctPlaceWords(words: string[]): string[] {
  return words.map((w) => {
    if (w.length < 6 || PLACE_WORDS.includes(w) || VOCABULARY.has(w) || /\d/.test(w)) return w;
    const max = w.length >= 8 ? 2 : 1;
    let best: string | null = null;
    let bestD = max + 1;
    for (const p of PLACE_WORDS) {
      const d = editDistance(w, p, max);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best ?? w;
  });
}

/** resolvePlace with spelling correction as a second try. */
export function resolvePlaceFuzzy(text: string): Place {
  const p = resolvePlace(text);
  if (p.city || p.province) return p;
  const original = normalizeText(text).split(" ");
  const corrected = correctPlaceWords(original);
  const q = resolvePlace(corrected.join(" "));
  // Report the words as typed, so callers can remove them from the keyword text.
  return { ...q, matched: [...(q.matched ?? []), ...original.filter((w, i) => corrected[i] !== w)] };
}
