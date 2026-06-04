import { NotFoundError } from "@expense/core";
import type { AnomalyId } from "@expense/core";
import type { AnomalyRepository } from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { anomalyCreateData, toAnomaly } from "./mappers.js";

export function makeAnomalyRepository(prisma: PrismaClient): AnomalyRepository {
  return {
    async create(anomaly) {
      await prisma.anomaly.create({ data: anomalyCreateData(anomaly) });
    },

    async markDelivered(id: AnomalyId, at) {
      try {
        await prisma.anomaly.update({
          where: { id },
          data: { deliveredAt: at },
        });
      } catch {
        throw new NotFoundError(`anomaly ${id}`);
      }
    },

    async listUndeliveredInWindow(userId, start, end) {
      const rows = await prisma.anomaly.findMany({
        where: {
          userId,
          deliveredAt: null,
          detectedAt: { gte: start, lt: end },
        },
      });
      return rows.map(toAnomaly);
    },

    async listRecent(userId, limit) {
      const rows = await prisma.anomaly.findMany({
        where: { userId },
        orderBy: { detectedAt: "asc" },
        take: limit,
      });
      return rows.map(toAnomaly);
    },
  };
}
