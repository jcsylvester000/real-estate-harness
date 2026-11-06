// Document checklists per transaction type and party, used by `get_document_checklist`.
// Lists follow standard Philippine practice; lenders and developers may ask for more.

export type TransactionType = "resale_titled" | "pre_selling" | "lease" | "bank_loan" | "pagibig_loan";
export type Party = "buyer" | "seller";

export interface ChecklistItem {
  document: string;
  office: string;
}

export const DOCUMENT_CHECKLISTS: Record<TransactionType, Partial<Record<Party, ChecklistItem[]>>> = {
  resale_titled: {
    seller: [
      { document: "Owner's duplicate copy of the TCT/CCT", office: "Seller (original)" },
      { document: "Certified true copy of the title", office: "Registry of Deeds" },
      { document: "Latest Tax Declaration (land and improvements)", office: "City/Municipal Assessor" },
      { document: "Real Property Tax clearance / official receipts", office: "City/Municipal Treasurer" },
      { document: "Two valid government IDs with TIN; marriage certificate or spousal consent if married", office: "Seller" },
      { document: "Special Power of Attorney, if represented", office: "Notary / Consulate (if abroad)" },
      { document: "HOA or condominium dues clearance; Certificate Authorizing Sale (condo)", office: "HOA / Condo corporation" },
    ],
    buyer: [
      { document: "Two valid government IDs with TIN", office: "Buyer" },
      { document: "Signed and notarized Deed of Absolute Sale (or Contract to Sell)", office: "Notary public" },
      { document: "BIR returns: CGT (Form 1706) and DST (Form 2000-OT) with payment proof", office: "BIR RDO where the property is located" },
      { document: "eCAR (Certificate Authorizing Registration)", office: "BIR RDO" },
      { document: "Transfer tax receipt and tax clearance", office: "City/Provincial Treasurer" },
      { document: "Registration fee receipt and new title", office: "Registry of Deeds" },
      { document: "New Tax Declaration in buyer's name", office: "City/Municipal Assessor" },
    ],
  },
  pre_selling: {
    buyer: [
      { document: "Copy of DHSUD License to Sell and Certificate of Registration (verify)", office: "Developer / DHSUD" },
      { document: "Reservation Agreement and reservation fee receipt", office: "Developer" },
      { document: "Buyer Information Sheet, two valid IDs, TIN", office: "Buyer" },
      { document: "Proof of income (COE, payslips, ITR or audited FS for business owners)", office: "Buyer" },
      { document: "Signed Contract to Sell and payment schedule", office: "Developer" },
      { document: "Post-dated checks or auto-debit arrangement", office: "Buyer's bank" },
    ],
  },
  lease: {
    seller: [
      { document: "Proof of ownership (title or Tax Declaration) or authority to lease", office: "Lessor" },
      { document: "Valid ID; BIR registration if lessor is VAT/percentage-tax registered", office: "Lessor" },
    ],
    buyer: [
      { document: "Valid IDs; company documents if corporate lessee", office: "Lessee" },
      { document: "Signed Lease Contract; advance and deposit receipts", office: "Both parties" },
      { document: "Move-in inspection checklist and inventory", office: "Both parties" },
    ],
  },
  bank_loan: {
    buyer: [
      { document: "Loan application form, two valid IDs, TIN", office: "Bank" },
      { document: "Proof of income: COE with compensation, 3 months payslips, latest ITR (Form 2316)", office: "Employer / BIR" },
      { document: "Self-employed: DTI/SEC registration, 2 years audited FS and ITR, bank statements", office: "Buyer" },
      { document: "Property documents: title copy, Tax Declaration, vicinity map, Contract to Sell", office: "Seller / Developer" },
    ],
  },
  pagibig_loan: {
    buyer: [
      { document: "Housing Loan Application form and Pag-IBIG MID number (at least 24 monthly contributions)", office: "Pag-IBIG Fund" },
      { document: "Proof of income and two valid IDs", office: "Buyer / Employer" },
      { document: "Property documents: certified title copy, Tax Declaration, Contract to Sell or DOAS", office: "Seller / Developer" },
      { document: "Developer's accreditation with Pag-IBIG (for developer projects)", office: "Developer" },
    ],
  },
};
