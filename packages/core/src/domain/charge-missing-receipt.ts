import type { Category } from "./category.js";

/** Shopping-like charge with no linked order email. */
export interface ChargeMissingReceiptFact {
  readonly merchantName: string;
  readonly amount: string;
  readonly occurredAt: string;
  readonly category: Category;
  readonly detail: string;
}
