/**
 * Predictive typing for Deal Desk: suggests the rest of the sentence (ghost text, Tab to accept).
 * 1. Whole-sentence completion from the user's own past questions, then common Deal Desk phrasings.
 * 2. Otherwise, completes the word being typed from GRID vocabulary (places in the index, kinds, lenders,
 *    document names). Runs in the browser, no AI.
 */

const PHRASES = [
  "2BR condo for rent in BGC under 60k",
  "Find condos for sale in Makati under 10M",
  "Find house and lot for sale in Cavite under 8M",
  "Find warehouses for lease in Laguna",
  "Find commercial lots for sale near C5",
  "Match a buyer looking for a condo for rent in Taguig under 40k",
  "Match a buyer looking for a house and lot in Cavite, budget 6M, near schools",
  "Matches for saved buyer ",
  "Compare lenders for a ₱7.6M condo, 20% down, 20 years",
  "Compare lenders for ",
  "Pag-IBIG home loan for ₱3M, 10% down, 30 years",
  "BDO home loan for ",
  "BPI home loan for ",
  "How much can a buyer earning ₱80k a month afford?",
  "How many listings do we have?",
  "Cost to buy a ₱7.6M condo in Pasig?",
  "Commission on ₱9.8M at 5%",
  "Monthly payment on ₱7.6M, 20% down, 7%, 20 years",
  "Buyer paid ₱900K over 6 years and wants out. Maceda refund?",
  "Can a Japanese client buy a condo?",
  "Can a foreigner buy land?",
  "Requirements for a Pag-IBIG loan",
  "Documents needed for a resale",
  "Summarize my notes",
  "Action items from my notes",
  "Summarize the contract",
  "What are the deadlines in the document?",
  "What does the contract say about ",
  "Which buyers match ",
  "Details on #1",
  "How about 15 years?",
  "Show more",
  "Hanap ng condo for rent sa BGC",
  "Magkano monthly sa Pag-IBIG para sa 3M na bahay?",
];

const WORDS = [
  "condo",
  "condominium",
  "house and lot",
  "townhouse",
  "warehouse",
  "office space",
  "commercial lot",
  "residential lot",
  "farm lot",
  "for rent",
  "for sale",
  "bedrooms",
  "furnished",
  "parking",
  "Pag-IBIG",
  "BDO",
  "BPI",
  "Security Bank",
  "EastWest",
  "PSBank",
  "UnionBank",
  "Metrobank",
  "Landbank",
  "China Bank",
  "summarize",
  "compare",
  "lenders",
  "affordability",
  "commission",
  "Maceda",
  "foreigner",
  "requirements",
  "deadlines",
  "BGC",
  "Ortigas",
  "Alabang",
  "Nuvali",
];

export function predict(input: string, ctx: { asks: string[]; places: string[]; docs: string[] }): string {
  if (input.length < 2 || input.startsWith("/") || input.endsWith("\n") || input.length > 300) return "";
  const lower = input.toLowerCase();
  // Whole sentence: the user's own questions first (they repeat themselves), then common phrasings.
  for (const s of [...ctx.asks, ...PHRASES]) {
    if (s.length > input.length && s.toLowerCase().startsWith(lower)) return s.slice(input.length);
  }
  // Current word.
  const m = input.match(/(?:^|\s)([^\s]{2,})$/);
  if (!m) return "";
  const part = m[1]!.toLowerCase();
  if (/^\d|₱/.test(part)) return "";
  const vocab = [...ctx.docs, ...ctx.places, ...WORDS];
  const hit = vocab.find((w) => w.length > part.length && w.toLowerCase().startsWith(part));
  return hit ? hit.slice(part.length) : "";
}
