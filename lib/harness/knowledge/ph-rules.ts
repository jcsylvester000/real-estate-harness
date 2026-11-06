// Philippine real estate rulebook, split into topics the model fetches on demand via the
// `get_rule_topic` tool. Keeping detail out of the system prompt keeps every request small;
// only the topic actually needed is paid for. Reviewed 2026-11-04 — legal points are a
// reference for licensed brokers and lawyers, not legal advice.

export interface RuleTopic {
  title: string;
  summary: string;
  points: string[];
  laws: string[];
}

export const RULE_TOPICS: Record<string, RuleTopic> = {
  licensing: {
    title: "Who may sell or negotiate (RESA)",
    summary: "Only PRC-licensed real estate brokers may negotiate property deals for a fee; salespersons work under an accredited broker.",
    points: [
      "Real Estate Service Act (RA 9646): brokers, appraisers and consultants must hold a PRC license.",
      "Salespersons must be accredited and supervised by a licensed broker; they may not sign as broker.",
      "Brokers must complete continuing professional development (CPD) to renew licenses.",
      "Collecting commission without a license is a violation; refer final negotiation to the broker.",
    ],
    laws: ["RA 9646 (Real Estate Service Act)"],
  },
  resale_process: {
    title: "Resale of titled property: steps and offices",
    summary: "Due diligence → reservation → contract → taxes at BIR → transfer tax at the Treasurer → new title at the Registry of Deeds → new Tax Declaration at the Assessor.",
    points: [
      "Due diligence: certified true copy of TCT/CCT from the Registry of Deeds; check annotations (mortgage, lis pendens, adverse claim).",
      "Get the latest Tax Declaration and Real Property Tax clearance; confirm seller identity and marital status (spousal consent).",
      "Reservation/earnest money: state in writing whether it forms part of the price.",
      "Contract to Sell for installments (title stays with seller until full payment); Deed of Absolute Sale on full payment, notarized.",
      "BIR: file and pay CGT (within 30 days of notarization) and DST (by the 5th day of the following month); obtain the eCAR.",
      "Treasurer: pay transfer tax and get a tax clearance; Registry of Deeds: new title; Assessor: new Tax Declaration.",
      "Office order: BIR → Treasurer → Registry of Deeds → Assessor.",
    ],
    laws: ["NIRC Secs. 24(D), 196", "Local Government Code Sec. 135", "PD 1529 (Property Registration Decree)"],
  },
  pre_selling: {
    title: "Pre-selling (developer projects)",
    summary: "Confirm the developer's DHSUD License to Sell and Certificate of Registration before taking any reservation.",
    points: [
      "PD 957 requires a DHSUD Certificate of Registration and License to Sell for subdivision and condominium projects.",
      "Typical documents: Reservation Agreement, Buyer Information Sheet, Contract to Sell, payment schedule, PDCs or auto-debit, loan documents.",
      "Installment buyers of residential units are protected by the Maceda Law (RA 6552).",
      "Developer sales are taxed as ordinary assets (income tax, creditable withholding tax, VAT where applicable), not CGT.",
    ],
    laws: ["PD 957", "RA 6552 (Maceda Law)", "RA 4726 (Condominium Act)"],
  },
  maceda_law: {
    title: "Maceda Law: installment buyer protection",
    summary: "Residential installment buyers get grace periods and, after 2 years of payments, a cash refund on cancellation.",
    points: [
      "Applies to residential real estate sold on installment, including condominiums; excludes industrial lots, commercial buildings and agrarian sales to tenants.",
      "Paid at least 2 years: 1 month grace per year of installments paid (once every 5 years); on cancellation a refund of 50% of total payments, plus 5% per year after year 5, up to 90%.",
      "Paid less than 2 years: at least 60 days grace; the seller may cancel 30 days after notice by notarial act if still unpaid.",
      "Cancellation requires a notarial notice and, for 2+ year buyers, full payment of the cash surrender value first.",
    ],
    laws: ["RA 6552 (Realty Installment Buyer Protection Act)"],
  },
  foreign_buyers: {
    title: "Foreign buyers and ownership limits",
    summary: "Foreigners cannot own land, but may own condominium units up to 40% of a project and lease land long-term.",
    points: [
      "Land ownership is reserved to Filipino citizens and corporations at least 60% Filipino-owned (1987 Constitution, Art. XII Sec. 7).",
      "Foreigners may own condominium units as long as foreign ownership in the project stays at or below 40% (RA 4726).",
      "Former natural-born Filipinos may acquire limited land: residential up to 1,000 sqm urban or 1 hectare rural (BP 185); for business up to 5,000 sqm urban or 3 hectares rural (RA 8179).",
      "Dual citizens under RA 9225 are Filipino citizens and may own land.",
      "Registered foreign investors may lease private land for up to 99 years in aggregate (RA 12252, 2025, amending RA 7652); the lease must be registered and annotated on the title.",
      "Foreigners may own the house (building) but not the lot it stands on; inheritance by legal succession is an exception.",
    ],
    laws: ["1987 Constitution Art. XII Sec. 7", "RA 4726", "BP 185", "RA 8179", "RA 9225", "RA 12252"],
  },
  leasing: {
    title: "Residential and commercial leases",
    summary: "Put term, rent, deposit and advance, escalation, repairs and pre-termination in writing.",
    points: [
      "Common practice: 1–2 months advance and 2 months deposit (negotiable; check Rent Control coverage).",
      "Rent Control Act (RA 9653) and its extensions cap yearly increases for covered low-rent residential units; verify current coverage and cap.",
      "Corporate lessees withhold 5% expanded withholding tax on rent.",
      "Lessors with gross sales above the VAT threshold charge 12% VAT on rent.",
    ],
    laws: ["Civil Code Arts. 1642–1688", "RA 9653 (Rent Control Act)"],
  },
  data_privacy: {
    title: "Handling client personal data",
    summary: "Client IDs, incomes and contact details are personal data under the Data Privacy Act; collect only what the deal needs.",
    points: [
      "Get client consent before storing or sharing personal data; state the purpose.",
      "Do not paste government ID numbers, TINs or bank details into AI chats; keep them in the brokerage's secured records.",
      "Appoint a Data Protection Officer and register with the NPC where required.",
      "Report personal data breaches to the NPC within 72 hours of discovery.",
    ],
    laws: ["RA 10173 (Data Privacy Act of 2012)", "NPC Circular 16-03"],
  },
  financing: {
    title: "Home financing options",
    summary: "Pag-IBIG (up to ₱10M), bank loans and developer in-house financing; each has different rates and terms.",
    points: [
      "Pag-IBIG Fund housing loan ceiling raised to ₱10M (May 2026); terms up to 30 years; rates depend on the repricing period and program (verify current rates).",
      "Banks usually finance up to 80% of appraised value with terms up to 20–25 years; rates are fixed for 1–10 years, then repriced.",
      "In-house financing has easier approval but higher rates and shorter terms.",
      "Lenders commonly cap the monthly payment at about 35% of gross monthly income.",
    ],
    laws: ["RA 9679 (HDMF Law)"],
  },
};

export const RULE_TOPIC_IDS = Object.keys(RULE_TOPICS);
