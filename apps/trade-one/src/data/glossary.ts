import type { GlossaryTerm } from "./types";

export const GLOSSARY: GlossaryTerm[] = [
  {
    term: "Catalyst",
    short: "Any event that can move the stock — FDA decision, trial, M&A, dilution.",
    more: "Day traders often trade around catalysts, not “forever” ownership.",
  },
  {
    term: "PDUFA",
    short: "FDA’s target deadline to finish reviewing a drug application.",
    more: "A goal, not a promise — approve early, delay, or miss the day.",
  },
  {
    term: "Binary",
    short: "Basically yes/no outcome (approve vs reject) with big up or down risk.",
    more: "PDUFA days are classic binaries for biotech names.",
  },
  {
    term: "CRL",
    short: "Complete Response Letter — FDA says not approved yet; fix and resubmit.",
    more: "Often treated as a bad binary for the stock.",
  },
  {
    term: "Confirmed vs rumor",
    short: "Confirmed = company/FDA/filing. Rumor = press citing unnamed sources.",
    more: "Treat takeout chatter as speculation until a definitive agreement.",
  },
  {
    term: "Dilution",
    short: "New shares → each existing share owns a smaller slice.",
    more: "ATM, follow-ons, convertibles, preferred raises often follow good news.",
  },
  {
    term: "OS / PFS / RFS",
    short: "Survival alphabet: overall, progression-free, recurrence-free.",
    more: "OS is the gold standard; PFS-only wins can get sold if OS is weak.",
  },
  {
    term: "IV crush",
    short: "After the event, option prices often collapse as uncertainty drops.",
    more: "The “tax” even if you picked the direction right.",
  },
];
