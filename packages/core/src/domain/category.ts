export const CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "subscriptions",
  "shopping",
  "utilities",
  "housing",
  "health",
  "entertainment",
  "travel",
  "income",
  "transfer",
  "fees",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
