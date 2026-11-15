import type { Catalyst } from "./types";

export const CATALYSTS: Catalyst[] = [
  {
    id: "mrna-mrk",
    tickers: ["MRNA", "MRK"],
    status: "confirmed",
    types: ["trial"],
    typeLabel: "Trial / ESMO",
    date: "ESMO 2026 · BLA YE target",
    title: "Intismeran + Keytruda hits Phase 3 RFS in melanoma",
    why: "First commercial-path mRNA oncology story; re-rates both MRNA and MRK on a 50/50 profit share.",
    detail:
      "Phase 3 INTerpath-001 met primary RFS: ~42% reduction in recurrence or death (HR 0.58); 2-year RFS ~82% vs ~70%. Detailed at ESMO 2026 Presidential Symposium. Still investigational — not FDA-approved.",
    speculation:
      "Partners working toward BLA filing by year-end 2026, with possible 2027 launch if approved. Manufacturing turnaround and pricing remain open risks. Treat 2027 approval as contingent.",
  },
  {
    id: "azn-imfinzi",
    tickers: ["AZN"],
    status: "confirmed",
    types: ["fda"],
    typeLabel: "FDA approval",
    date: "13 Nov 2026",
    title: "Imfinzi + Padcev approved in cisplatin-ineligible MIBC",
    why: "Perioperative win keeps pressure on Keytruda regimens in muscle-invasive bladder cancer.",
    detail:
      "FDA approved perioperative Imfinzi + enfortumab vedotin for cisplatin-ineligible MIBC based on VOLGA Phase 3 (~49% EFS risk reduction; ~42% OS risk reduction).",
    speculation:
      "Mega-cap franchise move — options still care, cash-flow narrative shifts share in a multi-billion indication.",
  },
  {
    id: "azn-rytm",
    tickers: ["AZN", "RYTM"],
    status: "rumor",
    types: ["ma"],
    typeLabel: "M&A rumor",
    date: "Early Nov 2026",
    title: "Press: AZN / Alexion eyed ~$10B Rhythm takeout",
    why: "Premium bid rumors re-rate rare-disease assets overnight; bidding-war chatter amplifies the move.",
    detail:
      "WSJ/Reuters reported AZN offered ~$10B / ~$124–134/share (incl. milestones) for Rhythm Pharmaceuticals via Alexion. Neither company has confirmed a deal; Rhythm said it does not comment on rumors.",
    speculation:
      "Treat as rumor until a definitive agreement. Shares spiked on reports — rumors fade if no second bidder.",
  },
  {
    id: "smmt",
    tickers: ["SMMT"],
    status: "confirmed",
    types: ["fda"],
    typeLabel: "PDUFA binary",
    date: "14 Nov 2026 (Fri–Mon window)",
    title: "Ivonescimab PDUFA — EGFR NSCLC post 3rd-gen TKI",
    why: "Classic mid/large biotech binary; OS historically the FDA sticking point — contested approvability story.",
    detail:
      "Confirmed PDUFA goal date 14 Nov 2026 for ivonescimab + chemo in EGFR-mutated nonsquamous NSCLC (HARMONi). Potential first US PD-1/VEGF bispecific. Saturday goal date — FDA often acts Fri before or next business day.",
    speculation:
      "Approve / CRL / delay all live. Competitor noise from PD-1×VEGF class context. Watch for PR anytime around the window.",
  },
  {
    id: "cytk",
    tickers: ["CYTK"],
    status: "confirmed",
    types: ["fda"],
    typeLabel: "sNDA / PDUFA",
    date: "14 Nov 2026 (Fri–Mon window)",
    title: "MYQORZO (aficamten) MAPLE-HCM label expansion",
    why: "Competitive positioning vs BMS Camzyos; launch metrics already in focus.",
    detail:
      "Confirmed PDUFA for MAPLE-HCM label expansion (aficamten monotherapy vs metoprolol) — not the original oHCM approval (already approved Dec 2025). ACACIA-HCM nHCM Phase 3 already positive.",
    speculation:
      "sNDA may move less than a first approval, but a CRL would still hit the HCM narrative.",
  },
  {
    id: "capr",
    tickers: ["CAPR"],
    status: "confirmed",
    types: ["fda", "dilution"],
    typeLabel: "PDUFA · dilution watch",
    date: "22 Nov 2026",
    title: "Deramiocel DMD — extended PDUFA after major amendment",
    why: "High-volatility rare-disease binary; prior delay taught the market amendment risk.",
    detail:
      "Confirmed PDUFA 22 Nov 2026 (extended after major amendment: 2-year HOPE-3 OLE + refined upper-limb indication >9 years). ~$199M cash; company says ≥12 months runway; Form 483 from BIMO inspection responded.",
    speculation:
      "Approval → launch/partnership re-rate; CRL → severe drawdown. Dilution risk rises if approval comes without a partner.",
  },
  {
    id: "bbio",
    tickers: ["BBIO"],
    status: "confirmed",
    types: ["fda", "dilution"],
    typeLabel: "PDUFA · preferred raise",
    date: "27 Nov 2026",
    title: "BBP-418 LGMD2I/R9 Priority Review + ~$934M preferred financing",
    why: "Near-term binary plus commercial Attruby story; preferred raise is confirmed dilution/structure.",
    detail:
      "Confirmed PDUFA 27 Nov 2026 (Priority Review) for BBP-418 in LGMD2I/R9. Q3 showed Attruby growth; ~$934M preferred financing; ~$1.5B cash/securities.",
    speculation:
      "Approval supports multi-product narrative; preferred terms matter for common equity upside.",
  },
  {
    id: "vrtx",
    tickers: ["VRTX"],
    status: "confirmed",
    types: ["fda"],
    typeLabel: "PDUFA / accel. path",
    date: "30 Nov 2026",
    title: "Povetacicept IgAN — first nephrology franchise bid",
    why: "Mega-cap growth narrative beyond CF; existing IgAN competitors and monitoring concerns are the overhang.",
    detail:
      "Confirmed PDUFA 30 Nov 2026 for accelerated approval of povetacicept in IgA nephropathy (RAINIER Week-36 interim: ~50% UPCR reduction vs placebo).",
    speculation:
      "High base-case approval odds in Street models → “sell the news” risk even on approval; CRL would be a larger shock.",
  },
  {
    id: "azn-toz",
    tickers: ["AZN"],
    status: "confirmed",
    types: ["fda"],
    typeLabel: "BLA / priority",
    date: "Q1 2027 decision",
    title: "Tozorakimab COPD — US BLA accepted with priority review",
    why: "Large respiratory franchise add-on story if exacerbation reductions hold through review.",
    detail:
      "US BLA accepted with priority review; FDA decision expected Q1 2027. Phase 3 exacerbation reductions ~29–34% in former smokers across trials.",
    speculation:
      "Month-level, not day-locked — watch for AdCom or labeling surprises into the Q1 window.",
  },
];
