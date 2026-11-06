# Deal Desk AI: Research and Agent harnesses

Both need an AI key (Deal Desk → AI menu → **＋ Add key…**). Without a key Deal Desk uses the Query Engine, and the two mode buttons under the message box are disabled.

| Mode | What it does | Tools |
|---|---|---|
| **Agent** (default with a key) | Works in Grid's apps for you: finds listings, scores listings for a buyer, compares lenders, reads documents and notes, saves notes and files, saves buyers, makes Property Teaser projects, offers **Open** buttons. | The calculators and listing tools, plus `app_*` tools built from the apps' own driver methods. |
| **Research** | Researches Philippine real estate on the web: properties and developers, the industry, BIR zonal values, taxes and BIR filings, laws. Official sources first; every fact cited as [S1]. | `ph_research_brief`, `list_ph_sources`, `web_search`, `read_source` (web pages and PDFs), `find_zonal_value`, calculators, listings. |

Type `/` → **Research** for guided starts: Zonal value · Taxes and BIR filings for a sale · Market and industry · Developer or project check · Law or rule.

## Research harness (`lib/research/`)

```
question ─▶ ph_research_brief (what to know, what to verify, where) ─▶ web_search (official / industry / news)
        ─▶ read_source (HTML or PDF → relevant passages) ─▶ answer with [S#] ─▶ citation check ─▶ sources panel
```

- **Source ledger** (`ledger.ts`): every brief, search result and page read gets an id (S1, S2…), kept per conversation so follow-ups can cite earlier sources. After each answer the harness checks: cited sources, citations that point nowhere ("unverified" warning), links the AI wrote but never opened (warning), and long answers without any citation (warning).
- **Trust tiers** (`sources.ts`): Official (any `.gov.ph`, BIR, DOF, BLGF, DHSUD, LRA, BSP, PSA, laws and courts), Research (consultancies, tax firms, multilaterals), News, Portal · verify (listing portals, zonal-value copy sites, blogs). Search results are ranked official first.
- **Briefs** (`briefs.ts`): zonal values and RA 12001, taxes on a sale, BIR filings and eCAR (RMC 75-2026), market data, due diligence. Each point has a source and a checked-on date; the prompt tells the AI to verify anything that may have changed.
- **Safe reading** (`fetch.ts`, `page.ts`): http(s) only, public addresses only (checked on every redirect), 8 MB and 10 s limits; HTML is reduced to the article; PDFs are read with pdf.js (first 30 pages); only the passages relevant to the question (about 5,000 characters) go to the AI.
- **Web search** (`search.ts`): `BRAVE_SEARCH_API_KEY` → Brave, `TAVILY_API_KEY` → Tavily, `SEARXNG_URL` → your SearXNG, otherwise DuckDuckGo's HTML results (free, no key, may be rate limited). Settings → AI setup shows which one is in use.
- **Limits**: 8 tool steps, 2,500 output tokens, US$0.75 and 50 s per turn (`RESEARCH_*` settings). When a limit is hit, the AI must answer with what it found (one last call with tools switched off) and says what is unverified.

## Agent harness (`lib/agent/app-tools.ts`)

- Each `app_*` tool is a driver method (`listings.ask`, `match.run`, `lenders.compare`, `docs.search`, `fs.write`, `teaser.save`…). Its JSON schema is generated from the method's zod schema, and every call goes through `callDriver` **as the app the person is using**: the same permission, role and validation checks as the app itself. Property Teaser's chat, for example, gets no buyer or document tools. `ai.*` methods are never reachable from a tool.
- Results are trimmed for the model; uploader names and emails (`listedBy*`) are removed.
- Writes (save note or file, save buyer, make a teaser) only when asked; nothing is deleted. `app_make_teaser` builds a deck or trailer from a listing code and/or free text (spelling corrected) with a template or saved design. `app_open` adds an **Open** button.
- Limits: 8 tool steps and 50 s per turn (`AGENT_*` settings), tool calls of one step run in parallel.

## Tests

`tests/unit/research.test.ts` (reading, PDFs, passages, tiers, DuckDuckGo parsing, ledger, schemas, time budget) and `tests/integration/research.test.ts` (a scripted model drives real research and agent turns through `ai.chat` with the web stubbed).
