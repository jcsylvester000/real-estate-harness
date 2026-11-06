# Grid Agentic

A web desktop for GRID Property Ventures staff, with the **PH Real Estate Harness** as its AI engine.

It is a clean-room rebuild of the *patterns* behind [Puter](https://github.com/HeyPuter/puter):
a browser desktop, windows, iframe apps and an app SDK. No Puter code is used (Puter is AGPL-3.0).

```text
 app iframe ──grid.js postMessage──▶ desktop (IPC gate) ──fetch──▶ /api/drivers/call (driver gate) ──▶ services ──▶ Postgres
                                       │ asks the user for permissions             │ ai.chat → PH Real Estate Harness
                                       │ (third-party apps)                        │   (Claude / OpenAI-compatible / Gemini / Demo)
```

## What is inside (v0.1)

| Built-in app | What it does |
|---|---|
| **Deal Desk AI** | Chat with the harness: costs, loans, Maceda, foreign buyers and listings. Shows the calculations used and the cost in pesos. Conversations are saved. |
| **Calculators** | The harness calculators with no AI and no cost. The forms are generated from the tool schemas. |
| **Property Finder** | Type what the client wants ("2BR condo for rent in BGC under 60k") and get ranked matches from the listings index, with filters, a shortlist and links to the calculators. **No AI needed.** |
| **Listings** | Manage the listings database: browse with filters and pages, add or edit, and **import GRID CSV exports**. The AI may recommend only these listings. |
| **Files** / **Notes** | Your own files: folders, uploads up to 1 MB, Markdown notes. Deal Desk and Calculators can save answers here. |
| **App Center** | Built-in and installed apps, your permission grants, and the developer SDK. Admins can install third-party apps. |
| **Settings** | Account, wallpaper, AI usage. Admins also get Users and Team AI usage. |

- **Accounts:** staff only, with no public sign-up. The first run opens `/setup` to create the admin. Roles are admin, broker and salesperson. Passwords use Argon2id with a 15-character minimum. Accounts lock for 15 minutes after 5 failed sign-ins.
- **Permissions (the Puter model):** each app declares permissions. Built-in apps get what they declare. A third-party app runs sandboxed (opaque origin, no cookies). The user must allow each permission once, and can take it back in App Center.
- **Works without AI:** with no key, the taskbar shows "Smart search mode". Deal Desk still answers calculator and listing questions using a rule-based inquiry parser, and every other app works fully.
- **AI cost control:** the harness caps tool steps and spend per turn. A per-person daily allowance in pesos (`GRID_DAILY_AI_CAP_PHP`) applies on top. Every turn is metered in `usage_events`.

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
npm run dev             # open http://localhost:3000 → /setup the first time
```

`.env.local` holds the secrets and is never committed. See `.env.example` for every setting.
With no AI key, everything runs in **smart search mode** (see Settings → AI setup).

**AI through OpenRouter** (one key, hundreds of models): set the following in `.env.local`:
- `HARNESS_PROVIDER=openai`
- `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
- `OPENAI_API_KEY=sk-or-...`
- `OPENAI_MODEL=openai/gpt-4o` and `OPENAI_BUDGET_MODEL=openai/gpt-4o-mini`

Any OpenRouter model with tool calling works, for example `anthropic/claude-haiku-5.5`. The cost of each turn is the real charge that OpenRouter reports.

| Command | What it does |
|---|---|
| `npm test` | 48 unit and integration tests (in-memory Postgres; no network) |
| `npm run e2e` | 12 browser tests on a production build (`npm run build` first) |
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
app/(auth)/            login, first-run setup, change password (server actions)
app/desktop/           desktop page (server) → components/desktop/ (window manager, IPC gate, dialogs)
app/apps/<id>/         built-in apps (property-finder, listings, deal-desk, …); each runs in an iframe and uses grid.js only
app/api/drivers/call/  the single RPC endpoint (same-origin + session + app id)
app/api/health/        db + provider setup check (yes/no only)
lib/apps/              app catalog and permission model (shared by desktop and server)
lib/server/drivers.ts  driver registry and gate: method → permission → role → schema → service
lib/server/services/   auth, ai (harness + metering + daily cap), apps, fs, kv, usage, audit
lib/listings/          the listings database: schema, db, import, places (gazetteer), kinds, inquiry parser, search
lib/server/services/listings.ts   listings drivers + the harness listing tools' backend
lib/harness/           PH Real Estate Harness v0.1.0 (ported) + Demo provider
lib/db/                Drizzle schema and client (Neon; PGlite for tests) · drizzle/ migrations
public/sdk/grid.js     the app SDK
```

## Before production

- Rotate the Neon password that was shared in chat. Set `APP_SECRET` and `APP_ORIGIN` on Netlify.
- Netlify functions stop at about 60 s. The harness defaults (6 tool steps, 25 s per model call) keep a turn inside that.
- Import the real listings export. Demo listings have the source `demo`; delete them in Listings, or skip `db:seed`.
- A licensed broker and an accountant should review the calculators and the rulebook (`lib/harness/knowledge/`). Registration and notarial fees are estimates.
- Data Privacy Act (RA 10173): get consent and appoint a DPO. Keep IDs, TINs and bank details out of chats; the harness flags them.
