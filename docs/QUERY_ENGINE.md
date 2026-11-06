# Query Engine (Deal Desk without AI)

Deal Desk's no-AI mode. It never writes free text of its own: each reply is a template filled with what one GRID tool returned.

## How a message is handled

1. **Classify** (`lib/engine/classify.ts`): TF-IDF cosine between the message and every example phrase in `lib/engine/lexicon.ts`, plus a boost for strong cue words. Character trigrams catch typos ("sumarize", "mortage"). Below a 0.2 score it says it did not understand and shows examples.
2. **Extract slots** (`lib/engine/slots.ts`): price, income, down payment %, rate %, term, fixing period, age, lenders, listing code, "the second one", place, kind, bedrooms, budget (via the listings inquiry parser), checklist type, rulebook topic.
3. **Resolve with memory** (`lib/engine/engine.ts`, state saved per conversation):
   - A message that only gives new values ("how about 15 years", "in Makati", "cheaper") repeats the last request with those values.
   - If a value was missing, the engine asked for it; the next message that supplies it completes the request.
   - "The first one", "#2", "yung pangalawa" refer to the last list shown.
   - A question that names an uploaded document ("what does the lease say about pets?") goes to that document.
4. **Run one tool**, then **reply** from templates in `RESPONSES` (variants rotate so it does not repeat itself; Filipino or Taglish questions get a Filipino opener). Every reply lists the tool used and ends with a review note.

## Which tool answers what

| Ask | Intent | Tool (in-app) | Needs |
|---|---|---|---|
| "2BR condo for rent in BGC under 60k", "hanap ng bahay sa QC" | find_listings | `listings.search` (widens one filter at a time if nothing matches, and says which) | — |
| "details on #1", "GRID-123" | listing_details | `listings.get` (no uploader contacts) | listing |
| "show more" | more_results | last search or match, next page | — |
| "how many listings do we have" | inventory | `listings.index` (facets read model) | — |
| "match a buyer for a house in Cavite, 6M, near schools" | match_buyer | `match.run` (1–10 scores) | — |
| "which buyers match GRID-123" | buyers_for_listing | `match.forListing` (saved buyers) | listing |
| "compare lenders for 7.6M", "pag-ibig vs bdo" | mortgage_compare | `lenders.compare` (editable rate table) | price |
| "monthly on 5M at 6.5% for 15 years" | loan_payment | `compute_loan_amortization` | price + rate |
| "how much can a buyer earning 80k afford" | affordability | `lenders.compare` rates → loan the payment allows (35% of income) | income |
| "cost to buy a 7.6M condo in Pasig" | costs | `compute_acquisition_costs` | price |
| "commission on 9.8M at 5%" | commission | `compute_commission` | price |
| "paid 900k over 6 years, wants out" | maceda | `compute_maceda_refund` | amount paid |
| "can a Japanese client buy land" | foreign | `check_foreign_ownership` | — |
| "requirements for a Pag-IBIG loan" | checklist | `get_document_checklist` | — |
| "rules on pre-selling" | rule | `get_rule_topic` | — |
| "list my documents" | doc_list | `docs.list` | — |
| "summarize the contract" | doc_summary | extractive summary (`lib/engine/text.ts`) + facts | a document |
| "what are the deadlines in the document" | doc_facts | facts saved at upload: dates, amounts, areas, title numbers, obligations | a document |
| "what does the contract say about penalties" | doc_ask | `docs.search` (Postgres full text) → best sentences, quoted with file and page | a document |
| "summarize my notes" | notes_summary | Notes/Files text files → per-note summary + action items | notes |

## "/" commands (pick instead of type)

Type `/` in Deal Desk (or press the / button, or a start card) and pick a feature. Deal Desk then asks only what it needs, one step at a time, with the likely answers listed: listings and prices from the conversation come first ("From chat"), then presets; typing filters the list, and a typed amount or place can be used as is. The finished flow becomes an ordinary sentence, so it works the same with the Query Engine or a real AI.

| Command | Steps | Sentence sent |
|---|---|---|
| Search property | Buy or rent → kind (from the index) → place (top cities, or type one) → budget | "Find condo for rent in Taguig under ₱60k" |
| Buyer matching | Saved buyer, or New buyer → buy/rent → kind → place → budget → purpose | "Matches for saved buyer …" / "Match a buyer looking for …" |
| Calculator | Compare all lenders · One lender · Affordability · Taxes and fees · Commission · Maceda · Foreign buyer, then price, down payment, term… | e.g. "Pag-IBIG Fund home loan for ₱3M, 10% down, 30 years" |
| Listings | Search by name, building, place or code → Details · Matching buyers · Compare lenders · Taxes and fees | "Details on GRID_…", "Compare lenders for GRID_…, 20% down, 20 years" |
| Lenders | Lender (with lowest published rate) → price → down payment → term | "BDO home loan for ₱5M, 20% down, 20 years" |
| Notes | A note, or all notes → Summarize · Action items | "Summarize note …", "Action items in note …" |
| Property Teaser | Presentation or trailer → a listing (or from scratch) | Opens Property Teaser with the listing's details filled in |
| Documents | An upload → Summarize · Key dates and amounts · Ask a question (fills the box) | "Summarize …", "In …, what does it say about " |

Keys: ↑ ↓ move, Enter or Tab pick, Backspace on an empty box goes back a step, Esc closes. Code: `components/apps/command-menu.tsx`.

**Predicting the next move**
- Commands are ordered by what usually follows the last answer (after a search: Listings, Buyer matching, Calculator; after a loan comparison: Lenders) and marked "Suggested".
- "Up next" chips above the box: the last answer's follow-ups plus the command that fits what is on screen.
- Ghost text completes the sentence as you type (your own past questions first, then common phrasings, then places, kinds, lenders and document names); Tab or → accepts. Code: `components/apps/predict.ts`.

## Documents and OCR

- Extraction runs in the browser (`components/apps/doc-extract.ts`), so the file stays on the device; only text is sent.
  - PDF: pdf.js text layer. Pages with almost no text are treated as scans: rendered and read with OCR (first 15 pages).
  - Word (.docx): mammoth. Old .doc: save as .docx or PDF first.
  - Photos and screenshots: tesseract.js, English model, served from `/ocr` (no CDN). The reply shows the OCR confidence; below 70% it warns to check figures.
- On the server (`lib/server/services/documents.ts`): text is split into ~900-character passages with a full-text index (`simple` dictionary, so Filipino words match), and an extractive summary and facts are saved once. Limits: 400,000 characters per document, 200 documents per user.

## Teaching it

- **New way of asking:** add a line to `examples` of the intent in `lexicon.ts`. Add a `cues` regex only for words that almost always mean that intent.
- **New reply wording:** edit `RESPONSES` in `lexicon.ts`.
- **New tool:** add the intent to `INTENTS`, a `case` in `runEngine`, and a row to the table above. Add a test in `tests/unit/engine.test.ts`.
