import type { MonthlyReportFacts } from "./monthly-report-facts.js";
import type { ReportId, UserId } from "../ids.js";

export interface MonthlyReport {
  readonly id: ReportId;
  readonly userId: UserId;
  readonly yearMonth: string;
  readonly monthStart: Date;
  readonly monthEnd: Date;
  readonly facts: MonthlyReportFacts;
  readonly subject: string;
  readonly content: string;
  readonly deliveredAt: Date | null;
}
