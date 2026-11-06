/**
 * Research briefs: what a broker should know per topic, each point with its source and the date it was
 * last checked. They are starting points that tell the research harness what to verify and where; the
 * harness still checks the live source for anything that may have changed since `asOf`.
 */

export interface BriefSource {
  title: string;
  url: string;
  asOf: string;
}
export interface Brief {
  id: string;
  title: string;
  points: { text: string; src: number[] }[];
  /** What to check live before answering. */
  verify: string[];
  /** Search queries that usually find the live source. */
  queries: string[];
  sources: BriefSource[];
}

export const BRIEFS: Brief[] = [
  {
    id: "zonal_values",
    title: "BIR zonal values and the move to market values (RA 12001)",
    points: [
      { text: "Zonal values are set by the BIR per Revenue District Office (RDO) through Department Orders; the value depends on the street or barangay and the classification (e.g. RR residential, CR commercial, A agricultural, condominium per building).", src: [0] },
      { text: "The tax base for capital gains tax and documentary stamp tax is the highest of the selling price, the BIR zonal value and the assessor's fair market value.", src: [1] },
      { text: "RA 12001 (Real Property Valuation and Assessment Reform Act, signed June 2024) makes LGU Schedules of Market Values, under BLGF standards, the single valuation base, eventually replacing zonal values.", src: [2, 3] },
      { text: "During the transition the existing zonal values stay in force and the BIR has suspended zonal value revisions; full rollout of the new market values is targeted for 2028 (possibly 2029).", src: [4] },
      { text: "In August 2026 the President asked Congress to temporarily suspend RA 12001 to avoid added property costs; check whether Congress has acted before relying on the timeline.", src: [5] },
      { text: "Third-party zonal value sites (Housal, REN.PH) copy BIR schedules; quote the Department Order number and effectivity date from the BIR schedule itself.", src: [0] },
    ],
    verify: ["the RDO that covers the property", "the latest Department Order and its effectivity date for that RDO", "the classification (RR, CR, CC, A…) and the exact street, vicinity or building", "whether the city's new SMV under RA 12001 has taken effect"],
    queries: ["BIR zonal value {place} RDO department order", "{place} schedule of market values RA 12001 BLGF", "zonal value {street} {place}"],
    sources: [
      { title: "BIR website: Zonal Values", url: "https://www.bir.gov.ph", asOf: "2026-11-06" },
      { title: "NIRC Sec. 24(D) and 196 (tax base)", url: "https://lawphil.net/statutes/repacts/ra1997/ra_8424_1997.html", asOf: "2026-11-06" },
      { title: "RA 12001 full text (LawPhil)", url: "https://lawphil.net/statutes/repacts/ra2024/ra_12001_2024.html", asOf: "2026-11-06" },
      { title: "DOF: Recto welcomes new real property valuation law", url: "https://www.dof.gov.ph/recto-welcomes-new-law-bringing-a-just-equitable-and-efficient-real-property-valuation-system-in-ph-empowering-lgus-to-be-financially-self-sufficient/", asOf: "2026-11-06" },
      { title: "Manila Bulletin: Gov't overhauls how land, houses are taxed by LGUs (5 May 2026)", url: "https://mb.com.ph/2026/05/05/govt-overhauls-how-land-houses-are-taxed-by-lgus", asOf: "2026-11-06" },
      { title: "GMA News: Marcos asks Congress to suspend property valuation reform law (6 Aug 2026)", url: "https://www.gmanetwork.com/news/topstories/nation/997644/marcos-asks-congress-to-suspend-property-valuation-reform-law/story/", asOf: "2026-11-06" },
    ],
  },
  {
    id: "sale_taxes",
    title: "Taxes on a sale of real property",
    points: [
      { text: "Capital asset sold by an individual or non-dealer: 6% capital gains tax on the highest of selling price, zonal value or assessor's FMV (NIRC Sec. 24(D)); usually paid by the seller.", src: [0] },
      { text: "Documentary stamp tax: 1.5% (₱15 per ₱1,000) of the same highest value (NIRC Sec. 196); customarily the buyer's.", src: [0] },
      { text: "Ordinary asset (sold by a dealer, developer or a business using it): regular income tax, creditable withholding tax withheld by the buyer, and VAT when the seller is VAT-registered and the sale is not exempt.", src: [1, 2] },
      { text: "Creditable withholding tax rates on ordinary-asset sales come from RR 2-98 as amended (e.g. RR 11-2018): graduated 1.5% / 3% / 5% for sellers habitually engaged in real estate, 6% otherwise. Confirm the current regulation.", src: [1] },
      { text: "Local transfer tax: up to 0.75% in cities and Metro Manila municipalities, up to 0.5% in provinces (Local Government Code Sec. 135 and 151); the actual rate is in the local ordinance.", src: [3] },
      { text: "Estate tax and donor's tax are 6% (TRAIN law, RA 10963).", src: [4] },
    ],
    verify: ["capital vs ordinary asset classification", "whether the seller is VAT-registered and any VAT exemption that applies", "the city or province transfer tax rate", "installment sale rules if paid over time"],
    queries: ["capital gains tax sale of real property Philippines BIR", "creditable withholding tax ordinary asset real property revenue regulations current rates", "{place} transfer tax rate ordinance"],
    sources: [
      { title: "NIRC as amended (LawPhil, RA 8424)", url: "https://lawphil.net/statutes/repacts/ra1997/ra_8424_1997.html", asOf: "2026-11-06" },
      { title: "Grant Thornton: Withholding taxes on installment sales of real property", url: "https://www.grantthornton.com.ph/insights/articles-and-updates1/tax-notes/reiteration-of-withholding-taxes-on-installment-sales-of-real-property/", asOf: "2026-11-06" },
      { title: "Forvis Mazars: BIR RMC 99-2023 on taxes due on sale of real property", url: "https://www.forvismazars.com/ph/en/insights/tax-alerts/bir-rmc-99-2023", asOf: "2026-11-06" },
      { title: "Local Government Code (RA 7160)", url: "https://lawphil.net/statutes/repacts/ra1991/ra_7160_1991.html", asOf: "2026-11-06" },
      { title: "TRAIN law (RA 10963)", url: "https://lawphil.net/statutes/repacts/ra2017/ra_10963_2017.html", asOf: "2026-11-06" },
    ],
  },
  {
    id: "bir_filing",
    title: "BIR filings and the eCAR for a property transfer",
    points: [
      { text: "Capital gains tax: BIR Form 1706, generally within 30 days after the sale (notarization of the deed).", src: [0] },
      { text: "Documentary stamp tax: BIR Form 2000-OT, generally by the 5th day of the month after the deed was notarized.", src: [0] },
      { text: "Creditable withholding on ordinary-asset sales: BIR Form 1606, filed by the buyer (withholding agent), generally by the 10th day of the following month.", src: [0] },
      { text: "RMC 75-2026 (BIR, issued July 2026) consolidates FAQs on the ONETT Computation Sheet and eCAR: returns are generally filed electronically under the Ease of Paying Taxes Act; manual filing only when e-filing is unavailable; processing targets of 3 / 7 / 20 working days for the computation sheet (simple / complex / highly technical estate cases) and about 7 working days for the eCAR.", src: [1] },
      { text: "Manually issued CARs not yet presented to the Registry of Deeds must be replaced with an eCAR; existing eCARs remain valid.", src: [1] },
      { text: "After the eCAR: pay the local transfer tax, then register the deed with the Registry of Deeds (new title), then update the tax declaration with the assessor.", src: [2] },
    ],
    verify: ["the deadline rule in the latest BIR issuance (and any holiday or extension)", "the RDO with jurisdiction over the property", "the documentary checklist for that RDO or the eONETT system"],
    queries: ["RMC 75-2026 ONETT eCAR", "BIR Form 1706 deadline", "BIR Form 2000-OT deadline real property", "BIR eONETT online filing property transfer"],
    sources: [
      { title: "Respicio & Co.: Tax payment deadlines after a property sale (secondary)", url: "https://www.respicio.ph/commentaries/tax-payment-deadlines-after-property-sale-philippines", asOf: "2026-11-06" },
      { title: "BIR RMC 75-2026 (digest, DivinaLaw, Aug 2026)", url: "https://www.divinalaw.com/wp-content/uploads/2026/09/BIR-04-Revenue-Memorandum-Circular-No.-75-2026.pdf", asOf: "2026-11-06" },
      { title: "Land Registration Authority", url: "https://lra.gov.ph", asOf: "2026-11-06" },
    ],
  },
  {
    id: "market_data",
    title: "Market and industry data",
    points: [
      { text: "Official house price index: BSP Residential Real Estate Price Index, quarterly (PDF reports under Media and Research → RPPI).", src: [0] },
      { text: "Supply, take-up, vacancy and rents by segment come from consultancies (Colliers, Leechiu, Santos Knight Frank, JLL, KMC Savills); quote the quarter and the area they cover.", src: [1] },
      { text: "Listed developers' sales, launches and landbank are in their PSE EDGE disclosures and annual reports.", src: [2] },
      { text: "Asking prices on portals (Lamudi, Dot Property) are not transaction prices; label them as asking prices.", src: [3] },
    ],
    verify: ["the latest quarter published", "the area and segment the figure covers", "whether a figure is transaction, appraised or asking price"],
    queries: ["BSP residential real estate price index latest quarter", "Colliers Philippines residential {place} {year}", "Leechiu {segment} market {year}"],
    sources: [
      { title: "BSP RPPI report 2026 Q1", url: "https://www.bsp.gov.ph/Media_And_Research/RPPI/RPPI-Report-2026-Q1.pdf", asOf: "2026-11-06" },
      { title: "Colliers Philippines research", url: "https://www.colliers.com/en-ph/research", asOf: "2026-11-06" },
      { title: "PSE EDGE", url: "https://edge.pse.com.ph", asOf: "2026-11-06" },
      { title: "Lamudi Philippines", url: "https://www.lamudi.com.ph", asOf: "2026-11-06" },
    ],
  },
  {
    id: "due_diligence",
    title: "Property and developer due diligence",
    points: [
      { text: "Title: get a certified true copy from the Registry of Deeds (LRA eSerbisyo) and check owner, area, technical description, liens and annotations.", src: [0] },
      { text: "Taxes: tax declaration and real property tax clearance from the city or municipal assessor and treasurer.", src: [1] },
      { text: "Pre-selling: the project needs a DHSUD Certificate of Registration and License to Sell (PD 957); check the developer's standing with DHSUD.", src: [2] },
      { text: "Agricultural land may need DAR conversion or clearance; check zoning with the city planning office.", src: [3] },
      { text: "Only PRC-licensed real estate brokers may negotiate for a fee (RA 9646).", src: [4] },
    ],
    verify: ["the DHSUD license to sell for the exact project and phase", "liens and annotations on the latest title copy", "zoning and road widening plans with the city"],
    queries: ["DHSUD license to sell {project}", "{developer} PSE disclosure {project}", "{place} zoning ordinance"],
    sources: [
      { title: "Land Registration Authority", url: "https://lra.gov.ph", asOf: "2026-11-06" },
      { title: "Local Government Code (RA 7160)", url: "https://lawphil.net/statutes/repacts/ra1991/ra_7160_1991.html", asOf: "2026-11-06" },
      { title: "DHSUD", url: "https://dhsud.gov.ph", asOf: "2026-11-06" },
      { title: "Department of Agrarian Reform", url: "https://www.dar.gov.ph", asOf: "2026-11-06" },
      { title: "RA 9646 (RESA) full text", url: "https://lawphil.net/statutes/repacts/ra2009/ra_9646_2009.html", asOf: "2026-11-06" },
    ],
  },
];

export const BRIEF_IDS = BRIEFS.map((b) => b.id) as [string, ...string[]];
export const briefById = (id: string) => BRIEFS.find((b) => b.id === id);
