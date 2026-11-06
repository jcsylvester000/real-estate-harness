/**
 * Spelling correction for property write-ups (no AI). Fixes a word only when it is not a known word and
 * exactly one known word is within 1 edit (5–7 letters) or 2 edits (8+ letters). Known words: common English,
 * real-estate and Filipino/Taglish vocabulary, amenities, property kinds and Philippine place names.
 * Every change is reported so the person can undo it.
 */
import { AMENITIES } from "./amenities";
import { KINDS } from "@/lib/listings/kinds";
import { FEATURES } from "@/lib/listings/analyze";
import { PLACE_WORDS, displayPlace, editDistance } from "@/lib/listings/places";

const COMMON = `a about above across after again against all almost alone along already also although always am among an and another any anyone anything are area areas around as ask at available away back be beautiful because become been before behind being below best better between big both bright brand breathtaking bring brings build built but buy buyer buyers by call can center centre central choice city clean close closer come comes comfort comfortable comfortably community complete completely convenient corner could cozy daily day days deal design designed designer development direct directly do does done door down each easy easily elegant end enjoy enough entire entrance especially even ever every everything exclusive excellent experience extra family families far feel few find fine first floor floors for found free fresh from front full fully future garden gated generous get give go good great green ground guest guests had half hall has have having he heart her here high highly his home homes hour hours house houses how ideal if in include included includes including inside into investment investors is it its just keep kids kitchen land large last layout lead leisure less level life lifestyle light like line little live lively living located location long look lovely low luxury main make many market master may meet minutes modern more morning most move much must natural nature near nearby need neighborhood neighbourhood new next nice night no not now of off offer offers office on once one only open or order other our out outdoor over own owner owners pantry park peaceful people perfect perfectly place plan plenty plus premium price prime private property properties provide provides quality quiet ready real really relax renovated rent rental residential rest right road room rooms rooftop safe same school schools secure security see seller serene set shared she short should shower side simple since single size sizes so some space spaces spacious special start stay still store street strategic strategically stunning style suite suites sun sunset surrounded take than that the their them then there these they this those through time to today together top total town tranquil tropical turnover two under unit units unique until up upon upgraded use very view views villa village walk walking want was water way we well were what when where which while who whole wide will window windows with within without wood work world would year years yet you young your
accessible accessibility affordable aircon amenities amenity apartment appliances approximately attic balcony bathroom bathrooms bedroom bedrooms bungalow cabinets carport ceiling ceilings clubhouse commercial condominium condo condos contractor countertops courtyard deck developer dining downpayment duplex electrical equity estate fence fenced financing fireplace fixtures flooring foyer frontage furnished furniture garage generator gym hectare hectares hospital industrial installment interior landscaped laundry lawn lease leasehold lobby loft lot lots maids marble mezzanine mortgage negotiable occupancy panoramic parking patio penthouse playground plumbing pool porch powder preselling quartz reservation residences residence resort retail sauna semi skyline skylight storage studio subdivision sqm swimming tenant tenants terrace tiles title titled townhouse transfer utility vacant verandah walkin warehouse wardrobe workshop zoning zoned
ako ang at ba bago bahay banyo bayad bilihan dito ganda gusto hindi ito kami kayo kusina kwarto lang lote lupa maganda malaki malapit malinis mga murang na naman ng pa pamilya para po presyo sa sala samahan tayo tirahan unit yung`;

const DICT = new Set<string>([
  ...COMMON.split(/\s+/),
  ...AMENITIES.flatMap((a) => [...a.phrases, a.label].flatMap((x) => x.toLowerCase().split(/[^a-z']+/))),
  ...Object.values(KINDS).flatMap((k) => [...k.words, k.label].flatMap((x) => x.toLowerCase().split(/[^a-z]+/))),
  ...Object.values(FEATURES).flatMap((f) => [...f.phrases, f.label].flatMap((x) => x.toLowerCase().split(/[^a-z]+/))),
  ...PLACE_WORDS,
]);
DICT.delete("");
const CANDIDATES = [...DICT].filter((w) => w.length >= 4);
const PLACES = new Set(PLACE_WORDS);

export interface Correction {
  from: string;
  to: string;
  place: boolean;
}

function matchCase(orig: string, fixed: string, place: boolean) {
  if (place) return displayPlace(fixed).replace(/\b\w/g, (c) => c.toUpperCase());
  if (orig === orig.toUpperCase() && orig.length > 1) return fixed.toUpperCase();
  if (orig[0] === orig[0]!.toUpperCase()) return fixed[0]!.toUpperCase() + fixed.slice(1);
  return fixed;
}

export function correctWord(word: string): string | null {
  const w = word.toLowerCase();
  if (w.length < 5 || DICT.has(w) || /\d/.test(w)) return null;
  // Plurals and -ed/-ing of known words are fine.
  if (DICT.has(w.replace(/(es|s|ed|ing)$/, "")) || DICT.has(w.replace(/ies$/, "y"))) return null;
  const max = w.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestD = max + 1;
  let tie = false;
  for (const c of CANDIDATES) {
    if (Math.abs(c.length - w.length) > max) continue;
    const d = editDistance(w, c, max);
    if (d < bestD) {
      best = c;
      bestD = d;
      tie = false;
    } else if (d === bestD && c !== best) tie = true;
  }
  return best && !tie ? best : null;
}

/** Corrects a text; returns the new text and each change. */
export function spellCorrect(text: string): { text: string; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const out = text.replace(/[A-Za-zÀ-ÿñÑ][A-Za-zÀ-ÿñÑ'-]*/g, (word, at: number) => {
    if (word.includes("-") || word.includes("'")) return word;
    const fixed = correctWord(word);
    if (!fixed) return word;
    const place = PLACES.has(fixed);
    // A capitalised word mid-sentence is likely a name (a building, a developer, a person): only places are fixed.
    const startOfSentence = /(^|[.!?:\n]\s*|^\s*[-*•]\s*)$/.test(text.slice(Math.max(0, at - 4), at)) || at === 0;
    if (!place && /^[A-Z][a-z]/.test(word) && !startOfSentence) return word;
    const to = matchCase(word, fixed, place);
    if (!corrections.some((c) => c.from === word)) corrections.push({ from: word, to, place });
    return to;
  });
  return { text: out, corrections };
}
