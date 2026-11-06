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
| **Listings** | The GRID inventory. The AI may recommend only these listings. Brokers and admins can edit it. |
| **Files** / **Notes** | Your own files: folders, uploads up to 1 MB, Markdown notes. Deal Desk and Calculators can save answers here. |
| **App Center** | Built-in and installed apps, your permission grants, and the developer SDK. Admins can install third-party apps. |
| **Settings** | Account, wallpaper, AI usage. Admins also get Users and Team AI usage. |

- **Accounts:** staff only, with no public sign-up. The first run opens `/setup` to create the admin. Roles are admin, broker and salesperson. Passwords use Argon2id with a 15-character minimum. Accounts lock for 15 minutes after 5 failed sign-ins.
- **Permissions (the Puter model):** each app declares permissions. Built-in apps get what they declare. A third-party app runs sandboxed (opaque origin, no cookies). The user must allow each permission once, and can take it back in App Center.
- **AI cost control:** the harness caps tool steps and spend per turn. A per-person daily allowance in pesos (`GRID_DAILY_AI_CAP_PHP`) applies on top. Every turn is metered in `usage_events`.

## Run it on your computer (Windows)

Requires Node.js 20.12+.

```powershell
npm install
npm run db:migrate      # creates the tables in Neon (uses .env.local)
npm run db:seed         # optional: loads 8 demo listings (marked "demo")
npm run dev             # open http://localhost:3000 → /setup the first time
```

`.env.local` holds the secrets and is never committed. See `.env.example` for every setting.
With no AI key, choose **Demo (no AI key)** in Deal Desk. It answers straight from the calculators.

| Command | What it does |
|---|---|
| `npm test` | 34 unit and integration tests (in-memory Postgres; no network) |
| `npm run e2e` | 8 browser tests on a production build (`npm run build` first) |
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
app/apps/<id>/         built-in apps; each runs in an iframe and uses grid.js only
app/api/drivers/call/  the single RPC endpoint (same-origin + session + app id)
app/api/health/        db + provider setup check (yes/no only)
lib/apps/              app catalog and permission model (shared by desktop and server)
lib/server/drivers.ts  driver registry and gate: method → permission → role → schema → service
lib/server/services/   auth, ai (harness + metering + daily cap), apps, fs, kv, usage, audit
lib/server/stores/     listings (the harness inventory source)
lib/harness/           PH Real Estate Harness v0.1.0 (ported) + Demo provider
lib/db/                Drizzle schema and client (Neon; PGlite for tests) · drizzle/ migrations
public/sdk/grid.js     the app SDK
```

## Before production

- Rotate the Neon password that was shared in chat. Set `APP_SECRET` and `APP_ORIGIN` on Netlify.
- Netlify functions stop at about 60 s. The harness defaults (6 tool steps, 25 s per model call) keep a turn inside that.
- Replace the demo listings with real inventory (`is_demo` marks the samples).
- A licensed broker and an accountant should review the calculators and the rulebook (`lib/harness/knowledge/`). Registration and notarial fees are estimates.
- Data Privacy Act (RA 10173): get consent and appoint a DPO. Keep IDs, TINs and bank details out of chats; the harness flags them.
