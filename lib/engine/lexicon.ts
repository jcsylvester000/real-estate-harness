/**
 * The Query Engine's phrase library: what people say for each intent (English, Filipino and Taglish) and
 * how the engine answers. The classifier learns from `examples`; `cues` are strong signals that add a boost.
 *
 * To teach the engine a new way of asking, add a line to `examples` for the intent. To change how it answers,
 * edit RESPONSES. No code changes needed for either.
 */

export type IntentId =
  | "greet"
  | "thanks"
  | "bye"
  | "help"
  | "identity"
  | "find_listings"
  | "listing_details"
  | "more_results"
  | "inventory"
  | "match_buyer"
  | "buyers_for_listing"
  | "mortgage_compare"
  | "loan_payment"
  | "affordability"
  | "costs"
  | "commission"
  | "maceda"
  | "foreign"
  | "checklist"
  | "rule"
  | "doc_list"
  | "doc_summary"
  | "doc_ask"
  | "doc_facts"
  | "notes_summary";

export interface IntentSpec {
  /** What the engine does, shown in the "how I work" help. */
  does: string;
  /** Which app tool runs (see docs/QUERY_ENGINE.md). */
  tool: string;
  examples: string[];
  /** Regexes that strongly signal this intent (each hit adds a boost). */
  cues: RegExp[];
  /** Intent needs these slots; the engine asks for them if missing. */
  needs?: ("price" | "income" | "listing" | "document")[];
}

export const INTENTS: Record<IntentId, IntentSpec> = {
  greet: {
    does: "Says hello and offers help.",
    tool: "none",
    examples: ["hi", "hello", "hey there", "good morning", "good afternoon", "kumusta", "musta", "magandang umaga", "magandang hapon", "hello po", "yo"],
    cues: [/^(hi|hello|hey|yo|kumusta|musta|good (morning|afternoon|evening)|magandang (umaga|hapon|gabi))\b/i],
  },
  thanks: {
    does: "Acknowledges thanks.",
    tool: "none",
    examples: ["thanks", "thank you", "salamat", "salamat po", "maraming salamat", "ty", "great thanks", "nice one", "perfect thank you", "ayos salamat"],
    cues: [/\b(thanks|thank you|salamat|ty|tnx)\b/i],
  },
  bye: {
    does: "Signs off.",
    tool: "none",
    examples: ["bye", "goodbye", "see you", "that's all", "ok bye", "paalam", "sige na", "ingat"],
    cues: [/^(bye|goodbye|see you|paalam|that'?s all)\b/i],
  },
  help: {
    does: "Explains what the engine can do.",
    tool: "none",
    examples: ["help", "what can you do", "how does this work", "ano kaya mong gawin", "paano ito gamitin", "what are your features", "show me examples", "anong pwede kong itanong", "guide me", "how do i use deal desk"],
    cues: [/\b(help|what can you do|how does this work|paano (ito|gamitin)|ano(ng)? (kaya|pwede))\b/i],
  },
  identity: {
    does: "Explains that it is a rule-based engine, not an AI.",
    tool: "none",
    examples: ["who are you", "are you an ai", "are you human", "sino ka", "ano ka", "are you chatgpt", "is this a bot", "are you real"],
    cues: [/\b(who are you|are you (an? )?(ai|bot|human|real|chatgpt)|sino ka|ano ka)\b/i],
  },
  find_listings: {
    does: "Searches the listings index with filters read from your words.",
    tool: "listings.search",
    examples: [
      "find a 2br condo for rent in bgc under 60k",
      "show me house and lot in cavite",
      "looking for a commercial lot near c5",
      "any warehouse for lease in laguna",
      "condo for sale in makati below 10m",
      "may available ba na condo sa ortigas",
      "hanap ako ng bahay sa quezon city",
      "naghahanap ako ng lote sa batangas",
      "meron ba kayong office space sa pasig",
      "listings in alabang",
      "properties near ateneo",
      "townhouse in paranaque under 8 million",
      "farm lot in tarlac",
      "pa search naman ng studio sa mandaluyong",
      "do we have any beachfront property",
      "rent a unit in cebu",
    ],
    cues: [/\b(find|search|show|looking for|hanap|naghahanap|meron ba|may available|listings?|for (sale|rent|lease))\b/i, /\b\d\s*-?\s*br\b|\bbedroom/i],
  },
  listing_details: {
    does: "Shows one listing's details and what matching sees in it.",
    tool: "listings.get",
    examples: ["details of GRID-123", "tell me more about the first one", "open number 2", "yung pangalawa", "more info on the third", "what about #1", "show listing DEMO-001", "describe the top result", "ano details ng una"],
    cues: [/\b(?=[A-Z0-9_-]*\d)([A-Z]{2,10}[_-][A-Z0-9_-]{3,})\b/, /\b(first|second|third|fourth|fifth|una|pangalawa|ikalawa|pangatlo|ikatlo|#\s?\d)\b/i],
    needs: ["listing"],
  },
  more_results: {
    does: "Shows the next page of the last search or match.",
    tool: "listings.search",
    examples: ["show more", "more", "next", "next page", "iba pa", "meron pa", "more results", "anything else", "load more", "dagdag pa"],
    cues: [/^(more|next|show more|iba pa|meron pa|dagdag pa|load more)\b/i],
  },
  inventory: {
    does: "Gives an overview of the inventory: counts by kind, city and transaction.",
    tool: "listings.index",
    examples: ["how many listings do we have", "inventory overview", "what do we have", "ilan ang listings natin", "summary of the inventory", "listings breakdown", "how many condos are for sale", "top cities in our listings"],
    cues: [/\b(how many|ilan|inventory|overview|breakdown)\b/i],
  },
  match_buyer: {
    does: "Scores listings 1–10 for a buyer's needs (Buyer Matching).",
    tool: "match.run",
    examples: [
      "match a buyer looking for a condo in taguig under 40k rent",
      "best match for a family needing 3 bedrooms in cavite budget 6m",
      "score listings for my client who wants a warehouse in laguna",
      "who fits a buyer with 8m budget in pasig",
      "i-match mo yung client ko na gusto ng bahay sa qc",
      "find the best matching properties for an investor wanting rental income in makati",
      "rank listings for a buyer",
      "buyer matching for 2br condo in ortigas",
      "matches for saved buyer",
      "show matches for my saved buyer",
    ],
    cues: [/\b(match|matching|best fit|score|rank|i-?match|tugma)\b/i, /\b(match|i-?match|score|rank)\b.{0,40}\b(buyers?|clients?|family|investor|tenant)\b/i],
  },
  buyers_for_listing: {
    does: "Lists saved buyers that match a listing (two-way matching).",
    tool: "match.forListing",
    examples: ["which buyers match GRID-123", "who would buy this listing", "sinong buyer ang bagay dito", "buyers interested in the first one", "find buyers for DEMO-002", "saved buyers for this property"],
    cues: [/\b(which|who|sino(ng)?) (buyers?|clients?)\b/i, /\bbuyers? for\b/i],
    needs: ["listing"],
  },
  mortgage_compare: {
    does: "Compares home-loan payments across Philippine lenders (Pag-IBIG, banks).",
    tool: "lenders.compare",
    examples: [
      "compare lenders for a 7.6m condo",
      "best bank for a home loan of 5 million",
      "pag-ibig vs bdo for 4m house",
      "which bank has the lowest rate",
      "housing loan options for 6m with 20% down",
      "magkano monthly sa pag-ibig para sa 3m na bahay",
      "mortgage rates of banks",
      "bpi home loan monthly for 8m",
      "home loan comparison 10m 15 years",
      "saan mas mura mag loan",
    ],
    cues: [/\b(pag-?ibig|bdo|bpi|metrobank|security bank|eastwest|psbank|unionbank|china ?bank|rcbc|pnb|landbank|maybank|in-?house)\b/i, /\b(compare|lenders?|banks?|housing loan|home loan|mortgage)\b/i],
    needs: ["price"],
  },
  loan_payment: {
    does: "Computes a monthly payment at a rate you give.",
    tool: "compute_loan_amortization",
    examples: ["monthly payment on 7.6m 20% down 7% 20 years", "amortization of 5m at 6.5% for 15 years", "magkano monthly kung 4m loan 8% 10 years", "loan payment calculator 3m 7% 20 yrs"],
    cues: [/\b(amorti[sz]ation|monthly payment|monthly amort|hulog|buwanang bayad)\b/i, /\d+(\.\d+)?\s*%.*\d+\s*(years?|yrs?|taon)/i],
    needs: ["price"],
  },
  affordability: {
    does: "Estimates the price a buyer can afford from income.",
    tool: "lenders.compare",
    examples: ["how much can i borrow with 80k income", "what can a buyer earning 120k afford", "kaya ba ng 60k sahod ang 5m na condo", "max loan for 100k monthly income", "affordability for 150k salary", "magkano kaya kong i-loan kung 70k sweldo ko"],
    cues: [/\b(afford|kaya (ba|ko)|borrow|max(imum)? loan|sahod|sweldo|salary|income|kita)\b/i],
    needs: ["income"],
  },
  costs: {
    does: "Computes taxes and fees to buy or sell (CGT, DST, transfer tax, registration).",
    tool: "compute_acquisition_costs",
    examples: ["cost to buy a 7.6m condo in pasig", "taxes for selling a 5m house", "closing costs for 12m lot in cavite", "magkano ang tax sa 3m na bahay", "transfer tax and dst for 8m", "capital gains tax on 10m", "fees to transfer title"],
    cues: [/\b(tax(es)?|cgt|dst|closing costs?|transfer (tax|fee)|fees|gastos|buwis)\b/i],
    needs: ["price"],
  },
  commission: {
    does: "Computes broker commission, VAT and withholding.",
    tool: "compute_commission",
    examples: ["commission on 9.8m at 5%", "how much is my commission for 12m sale", "komisyon sa 6m na benta", "net commission after tax 8m 3%"],
    cues: [/\b(commission|komisyon|komisyon)\b/i],
    needs: ["price"],
  },
  maceda: {
    does: "Computes a Maceda Law refund for installment buyers.",
    tool: "compute_maceda_refund",
    examples: ["maceda refund for 900k paid over 6 years", "buyer wants out after paying 3 years", "cancel contract refund", "magkano ang refund sa maceda law", "buyer backed out after 2 years of payments"],
    cues: [/\b(maceda|refund|wants out|back(ed)? out|cancel(lation)?|umatras)\b/i],
  },
  foreign: {
    does: "Checks what a foreign buyer can own.",
    tool: "check_foreign_ownership",
    examples: ["can a foreigner buy a condo", "can a japanese client buy land", "foreign ownership rules", "pwede ba bumili ng lupa ang foreigner", "american buyer house and lot", "expat buying property"],
    cues: [/\b(foreign(er)?|japanese|american|korean|chinese|expat|non-filipino|dayuhan|australian|british|indian)\b/i],
  },
  checklist: {
    does: "Lists the documents needed for a transaction.",
    tool: "get_document_checklist",
    examples: ["documents needed for a resale", "requirements for pag-ibig loan", "anong documents kailangan sa bank loan", "checklist for lease", "what papers does the seller need", "requirements for pre-selling purchase"],
    cues: [/\b(requirements?|documents? (needed|required)|checklist|papers?|anong (documents|kailangan))\b/i],
  },
  rule: {
    does: "Reads the rulebook on licensing, resale, pre-selling, Maceda, foreign buyers, leasing, privacy or financing.",
    tool: "get_rule_topic",
    examples: ["what is the process for a resale", "rules on pre-selling", "leasing rules in the philippines", "data privacy for brokers", "do i need a license to sell property", "how does financing work", "explain the resale process"],
    cues: [/\b(rules?|process|law|license|licensing|regulation|privacy|batas|proseso)\b/i],
  },
  doc_list: {
    does: "Lists your uploaded documents.",
    tool: "docs.list",
    examples: ["what documents did i upload", "list my files", "show my documents", "anong files ko", "my uploads", "which documents do you have"],
    cues: [/\b(my (documents|files|uploads)|list (my )?(documents|files)|uploaded)\b/i],
  },
  doc_summary: {
    does: "Summarizes an uploaded document (key sentences, figures, dates).",
    tool: "docs.summarize",
    examples: ["summarize the document", "summarize the contract", "give me a summary of the deed", "i-summarize mo yung file", "buod ng dokumento", "what is this document about", "tldr of the upload", "key points of the agreement"],
    cues: [/\b(summari[sz]e|summary|buod|tl;?dr|key points|gist|about)\b/i],
    needs: ["document"],
  },
  doc_ask: {
    does: "Answers a question from your uploaded documents, quoting the passage.",
    tool: "docs.search",
    examples: [
      "what does the contract say about the down payment",
      "in the document what is the price",
      "according to the deed who is the seller",
      "ano sabi ng contract tungkol sa penalty",
      "find in my files the turnover date",
      "search the documents for parking",
      "is there a clause about cancellation",
      "when is the deadline in the agreement",
    ],
    cues: [/\b(document|contract|deed|agreement|file|clause|upload|kontrata|dokumento|according to)\b/i],
    needs: ["document"],
  },
  doc_facts: {
    does: "Pulls amounts, dates, areas, title numbers and action items from a document.",
    tool: "docs.facts",
    examples: ["what are the deadlines in the document", "list the amounts in the contract", "action items from the file", "key dates in the agreement", "anong mga petsa sa kontrata", "what do we need to do according to the document", "extract figures from the upload"],
    cues: [/\b(deadlines?|dates?|amounts?|figures?|action items?|to-?dos?|petsa|extract)\b/i],
    needs: ["document"],
  },
  notes_summary: {
    does: "Summarizes your notes in the Notes app.",
    tool: "fs.read",
    examples: ["summarize my notes", "what did i write in my notes", "buod ng notes ko", "recap my notes", "action items from my notes", "summarize the meeting notes", "summarize note", "action items in note", "to-dos from my notes"],
    cues: [/\bnotes?\b/i],
  },
};

export const INTENT_IDS = Object.keys(INTENTS) as IntentId[];

/** Ways of saying "the same, but…" that mark a follow-up turn. */
export const FOLLOW_UP = /^(how about|what about|paano kung|eh kung|kung|and|at|tapos|also|then|with|sa|in|make it|change to|instead|try|cheaper|mas mura|bigger|mas malaki|ibang|iba)\b|^\s*(\d+\s*(years?|yrs?|taon)|\d+(\.\d+)?\s*%)/i;

/** Answers. Each entry is a list; the engine picks one so it does not repeat itself word for word. */
export const RESPONSES = {
  greet: ["Hi! What are we working on: a listing search, a buyer match, a loan comparison or a document?", "Hello! Tell me what the client needs and I'll pull it from the listings, lenders or your documents.", "Kumusta! Ano ang kailangan natin ngayon? Listings, matching, loan, or a document summary."],
  thanks: ["You're welcome. Anything else on this deal?", "Walang anuman! Need anything else?", "Glad that helped. I'm here if you need the next step."],
  bye: ["Take care. Your conversation is saved in History.", "Sige, ingat! Everything we did is saved in History."],
  identity: [
    "I'm GRID's Query Engine: a rule-based assistant, not an AI. I read your message against a phrase library, pick the right GRID tool (listings, matching, lenders, calculators, your documents) and report only what those tools return.",
  ],
  searching: ["Here's what I found.", "Okay, here are the matches from the index.", "Got it. This is what we have.", "Heto ang nakita ko."],
  noResults: ["Nothing in the index matches that yet.", "Wala akong nakitang tugma.", "No listing fits all of that."],
  matchIntro: ["Scored against the buyer's needs (1 lowest, 10 highest):", "Here are the best fits for that buyer, scored 1–10:", "Ranked by match score:"],
  mortgageIntro: ["Here's how the lenders compare:", "Lender comparison, lowest monthly first:", "Heto ang comparison ng mga lender:"],
  docIntro: ["From your document", "Here's what your document says", "Ayon sa dokumento"],
  clarify: ["I want to get this right.", "Quick check before I run it.", "Para sigurado ako:"],
  fallback: [
    "I'm not sure what you need there. I work best with things like: “2BR condo for rent in BGC under 60k”, “match a buyer for a house in Cavite, 6M budget”, “compare lenders for ₱7.6M”, “summarize the contract”.",
    "I didn't catch that one. Try asking for listings, a buyer match, a loan comparison, taxes and fees, or a summary of a document you uploaded.",
  ],
  disclaimer: "_Query Engine (no AI): assembled from GRID's tools and your documents. A licensed broker should review before sending to a client._",
} as const;

/** Picks a variant deterministically from a seed (so tests are stable, and replies vary across turns). */
export function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(seed) % list.length]!;
}

/** Writes in the user's register: Filipino or Taglish questions get a Filipino opener. */
export const isFilipino = (s: string) => (s.match(/\b(ang|ng|sa|mga|po|ba|naman|ko|mo|kung|yung|ano|magkano|saan|kailan|paano|meron|wala|gusto|kailangan|hanap|bahay|lupa|lote)\b/gi) ?? []).length >= 2;
