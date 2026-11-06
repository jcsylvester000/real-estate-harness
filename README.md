# Grid Agentic

A web desktop for GRID Property Ventures staff, with the **PH Real Estate Harness** as its AI engine.

It is a clean-room rebuild of the *patterns* behind [Puter](https://github.com/HeyPuter/puter):
a browser desktop, windows, iframe apps and an app SDK. No Puter code is used (Puter is AGPL-3.0).

```text
 app iframe ──grid.js postMessage──▶ desktop (IPC gate) ──fetch──▶ /api/drivers/call (driver gate) ──▶ services ──▶ Postgres
                                       │ asks the user for permissions             │ ai.chat → PH Real Estate Harness
                                       │ (third-party apps)                        │   (Claude / OpenAI-compatible / Gemini) or Query Engine (no AI)
```

## What is inside (v0.3)

| Built-in app | What it does |
|---|---|
| **Deal Desk AI** | Type **/** to pick a feature (search property, buyer matching, calculator, listings, lenders, notes, documents) and answer short follow-ups by clicking; or just ask. It predicts the next step ("Up next" chips, suggested commands, ghost-text completion). Ask about costs, loans, listings, buyer matches and your documents. With an AI key it uses Claude, OpenAI-compatible models (OpenRouter) or Gemini. **Without a key it uses the Query Engine** (below). It shows the calculations used and the cost in pesos, and saves conversations. Upload PDFs, Word files or photos with 📎. |
| **Buyer Matching** | Describe the buyer (kind, place, budget, bedrooms, size, purpose, features) and set how much each criterion matters (must have / important / nice to have / ignore). Every listing gets a **match score from 1 to 10** with a "why this score" breakdown. Save buyers; saved buyers are scored against every listing automatically (two-way). |
| **Calculators** | **Home loan (lenders):** compare Pag-IBIG and 13 banks/in-house financing, or pick one lender. Rates come from a researched, editable table (**Lender rates** tab, with sources and as-of dates). Also taxes and fees, loan payment, commission, Maceda refund and foreign-buyer rules. No AI, no cost. |
| **Property Finder** | Type what the client wants ("2BR condo for rent in BGC under 60k") and get ranked matches from the listings index. **No AI needed.** |
| **Listings** | Browse, add, edit and **import GRID CSV exports**. Each listing is analysed for matching (region, location tier, features, purposes, data completeness). |
| **Files** / **Notes** | Your own files: folders, uploads up to 1 MB, Markdown notes. Deal Desk and Calculators can save answers here. |
| **Settings** | Wallpaper, AI setup, AI usage, team usage, apps (App Center opens from here). |

- **Access (temporary):** a PIN pop-up unlocks the desktop for the shared `grid-team` account (`GRID_ACCESS_PIN`, default 4120). Five wrong PINs from one address lock it for 15 minutes. **Lock** in the taskbar ends the session. The PIN is in this public repository: set your own `GRID_ACCESS_PIN` before going live, and bring back named accounts before real client data goes in.
- **Permissions (the Puter model):** each app declares permissions. Built-in apps get what they declare. A third-party app runs sandboxed (opaque origin, no cookies). The user must allow each permission once.
- **Desktop:** drag icons anywhere. Right-click the desktop to choose **Snap icons to grid** (drops swap places) or **Free icon placement**, or **Tidy up icons**; the layout is saved per user.
- **Look and motion:** spotlight cards, glowing input, shimmer buttons, animated windows and menus (inspired by 21st.dev components); all motion turns off when the system asks for reduced motion.
- **Works without AI:** with no key, the taskbar shows "Query Engine (no AI)" and every app works fully.
- **AI cost control:** the harness caps tool steps and spend per turn. A per-person daily allowance in pesos (`GRID_DAILY_AI_CAP_PHP`) applies on top. Every turn is metered in `usage_events` (Query Engine turns at ₱0).

## Query Engine (Deal Desk without AI)

A rule-based assistant: it classifies the message against a phrase library (English, Filipino, Taglish; TF-IDF plus cue words, typo-tolerant), extracts the values (price, down payment, rate, years, income, age, lender, listing, place), remembers the conversation ("how about 15 years?", "the second one"), runs one GRID tool and writes the reply from templates using only that tool's numbers. It asks for a missing value instead of guessing.

Documents: text is extracted **in the browser** (PDF text layer with pdf.js, Word with mammoth, scans and photos with self-hosted tesseract.js OCR), so the original file never leaves the device. The server stores the text in passages with a full-text index, plus an extractive summary and facts (amounts, dates, areas, title numbers, obligations). See [docs/QUERY_ENGINE.md](docs/QUERY_ENGINE.md) for which tool runs for which question and how to teach it new phrases.

## CQRS (separate reads and writes)

- **Listings:** commands (import, save, delete, buyer profiles) write to the write model and an append-only `events` table in one transaction, then project the read models: `listing_search` (cards, analysis, full-text and trigram indexes), `listing_stats` (facets, market medians) and `match_results` (saved buyer × listing scores). Queries read only the read models, through a versioned in-memory cache.
- **Connections:** commands use `DATABASE_URL` / `LISTINGS_DATABASE_URL`; queries use `DATABASE_READ_URL` / `LISTINGS_DATABASE_READ_URL` when set (Neon read replicas), else the same database. Each driver method is marked `command` or `query`.
- **Rebuild:** `npm run projections:rebuild` rebuilds every read model from the write model.

## The listings database

Listings live in their own Postgres schema, `listings_index`, with separate migrations in `drizzle-listings/`. Set `LISTINGS_DATABASE_URL` to put them in a separate Neon database; otherwise they use the app database.

- **Import:** use the Listings app (Import CSV), or run `npm run listings:import -- "C:\path\export.csv"`. New codes are inserted and existing codes updated; bad rows are skipped and reported.
- **Index:** each row gets a city and province from a Philippine place lookup (BGC → Taguig, QC → Quezon City, Parañaque/Paranaque). Rows get a kind; when the export leaves it blank, it is guessed from the name and flagged. Bedrooms and areas are parsed from names.
- **Postgres indexes:** a weighted full-text index (name > place > kind > notes) for ranked keyword search, a trigram index for close spellings, and btree indexes for filters and facets.
- **Search:** every keyword must match first. If nothing does, any keyword may match. Misspelt places are corrected ("makatti" → Makati). With a bedroom filter, listings that state enough bedrooms come first, followed by listings that don't state bedrooms (labeled).
- **AI tools:**
  - `get_listing_index` returns counts by transaction, kind, province and city, plus a price guide.
  - `search_listings` filters and ranks.
  - `get_listing` returns the details of one listing.
- **Privacy:** uploader names and emails never go to the AI or to third-party apps. Only brokers and admins see contact emails, and only in the built-in apps.

Do not commit real exports: the CSV contains broker emails, and this repository is public. Tests use the synthetic `tests/fixtures/grid-listings-sample.csv`.

## Run it on your computer (Windows)

Requires Node.js 20.12+.

```powershell
npm install
npm run db:migrate      # creates the tables in Neon: app database + listings database (uses .env.local)
npm run listings:import -- "C:\path\to\Generate Report_listings-published.csv"
npm run db:seed         # optional: also loads 8 fictitious demo listings (marked "demo")
npm run dev             # open http://localhost:3000 and enter the PIN
```

`.env.local` holds the secrets and is never committed. See `.env.example` for every setting.
With no AI key, Deal Desk runs the **Query Engine** (see Settings → AI setup).
The small Next.js "N" badge only appears in `npm run dev`; it now sits at the top right of the desktop and is hidden inside app windows. Production has no badge.
`npm run dev` and `npm run build` first copy the OCR and PDF reader files into `public/ocr` and `public/pdfjs` (about 16 MB, not committed).

**AI through OpenRouter** (one key, hundreds of models): set the following in `.env.local`:
- `HARNESS_PROVIDER=openai`
- `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
- `OPENAI_API_KEY=sk-or-...`
- `OPENAI_MODEL=openai/gpt-4o` and `OPENAI_BUDGET_MODEL=openai/gpt-4o-mini`

Any OpenRouter model with tool calling works, for example `anthropic/claude-haiku-5.5`. The cost of each turn is the real charge that OpenRouter reports.

| Command | What it does |
|---|---|
| `npm test` | 100 unit and integration tests (in-memory Postgres; no network) |
| `npm run e2e` | 19 browser tests on a production build (`npm run build` first), including PDF and OCR uploads |
| `npm run projections:rebuild` | Rebuild the listings read models (CQRS) |
| `npm run listings:import -- file.csv` | Import a GRID listings export |
| `npm run lint` / `npm run typecheck` | Code checks |

## Build a third-party app

Any web page can be an app. Load the SDK and call it:

```html
<script src="https://YOUR-GRID-HOST/sdk/grid.js"></script>
<script>
  grid.ready.then(async () => {
    const r = await grid.tools.run("compute_loan_amortization", { propertyPrice: 7600000, downPaymentPercent: 20, annualInterestRatePercent: 7, termYears: 20 });
    grid.ui.notify("Monthly: ₱" + r.monthlyPayment.toLocaleString());
  });
</script>
```

There is a sample in `public/sample-apps/loan-widget/`. To try it, install it in App Center with the URL `/sample-apps/loan-widget/index.html` and the permissions `tools` and `ai`. For apps on another domain, add the origin to `GRID_APP_ORIGINS`.

SDK surface: `grid.ai`, `grid.tools`, `grid.listings`, `grid.fs`, `grid.kv` (private to the app), `grid.auth.whoami` and `grid.ui` (alert, confirm, prompt, notify, pickFile, openFile, setTitle, close). Types are in `lib/sdk/types.ts`.

## Code map

```text
app/(auth)/            PIN unlock and lock (server actions); old login pages redirect to the desktop
app/desktop/           desktop page (server) → components/desktop/ (window manager, IPC gate, dialogs)
app/apps/<id>/         built-in apps (property-finder, listings, deal-desk, …); each runs in an iframe and uses grid.js only
app/api/drivers/call/  the single RPC endpoint (same-origin + session + app id)
app/api/health/        db + provider setup check (yes/no only)
lib/apps/              app catalog and permission model (shared by desktop and server)
lib/server/drivers.ts  driver registry and gate: method → permission → role → schema → service
lib/server/services/   pin, auth, ai (harness + metering + daily cap), engine, documents, lenders, apps, fs, kv, usage, audit
lib/listings/          listings database (CQRS): schema, cqrs (command/query), projector, analyze, match (1–10 scoring),
                       buyers, import, places (gazetteer), kinds, inquiry parser, search
lib/lenders/           lender rates (researched, editable) and the mortgage comparison
lib/engine/            Query Engine: lexicon (phrases + replies), classify, slots, text (summaries, facts), engine
components/apps/doc-extract.ts   in-browser text extraction: pdf.js, mammoth, tesseract.js OCR
lib/server/services/listings.ts   listings drivers + the harness listing tools' backend
lib/harness/           PH Real Estate Harness v0.1.0 (ported) + Demo provider
lib/db/                Drizzle schema and client (Neon; PGlite for tests) · drizzle/ migrations
public/sdk/grid.js     the app SDK
```

## Before production

- Rotate the Neon password and the OpenRouter key that were shared in chat. Set `APP_SECRET`, `APP_ORIGIN` and your own `GRID_ACCESS_PIN` on Netlify.
- Lender rates are a starting point researched on 6 Nov 2026; several are aggregator estimates (marked). Update them in Calculators → Lender rates when banks change rates.
- Netlify functions stop at about 60 s. The harness defaults (6 tool steps, 25 s per model call) keep a turn inside that.
- Import the real listings export. Demo listings have the source `demo`; delete them in Listings, or skip `db:seed`.
- A licensed broker and an accountant should review the calculators and the rulebook (`lib/harness/knowledge/`). Registration and notarial fees are estimates.
- Data Privacy Act (RA 10173): get consent and appoint a DPO. Keep IDs, TINs and bank details out of chats; the harness flags them.
