import type { Money } from "../money.js";
import type { UserId } from "../ids.js";
import type { Category } from "./category.js";

export interface SpendBaseline {
  readonly userId: UserId;
  readonly category: Category;
  readonly period: "weekly" | "monthly";
  readonly mean: Money;
  readonly median: Money;
  readonly stddevMinorUnits: number;
  readonly sampleCount: number;
  readonly computedAt: Date;
}
