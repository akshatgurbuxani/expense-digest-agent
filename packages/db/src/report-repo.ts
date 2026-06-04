import { NotFoundError } from "@expense/core";
import type { ReportId } from "@expense/core";
import type { ReportRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { monthlyReportCreateData, toMonthlyReport } from "./mappers.js";

export function makeReportRepository(prisma: PrismaClient): ReportRepository {
  return {
    async create(report) {
      await prisma.monthlyReport.create({ data: monthlyReportCreateData(report) });
    },

    async markDelivered(id: ReportId, at) {
      try {
        await prisma.monthlyReport.update({
          where: { id },
          data: { deliveredAt: at },
        });
      } catch {
        throw new NotFoundError(`report ${id}`);
      }
    },

    async findById(userId, id) {
      const row = await prisma.monthlyReport.findFirst({
        where: { id, userId },
      });
      return row ? toMonthlyReport(row) : null;
    },

    async findByYearMonth(userId, yearMonth) {
      const row = await prisma.monthlyReport.findFirst({
        where: { userId, yearMonth },
      });
      return row ? toMonthlyReport(row) : null;
    },
  };
}
