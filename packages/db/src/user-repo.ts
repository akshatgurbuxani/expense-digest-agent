import { NotFoundError } from "@expense/core";
import type { User, UserId } from "@expense/core";
import type {
  UserPreferences,
  UserRepository,
} from "@expense/core";
import type { PrismaClient } from "@prisma/client";
import { isDueForDigest } from "./digest-schedule.js";
import { isDueForMonthlyReport } from "@expense/core";
import type { ReportScheduleConfig } from "@expense/core";
import { toUser } from "./mappers.js";

export function makeUserRepository(prisma: PrismaClient): UserRepository {
  return {
    async findById(id) {
      const row = await prisma.user.findUnique({ where: { id } });
      return row ? toUser(row) : null;
    },

    async findDueForDigest(at) {
      const rows = await prisma.user.findMany();
      return rows.map(toUser).filter((u: User) => isDueForDigest(u, at));
    },

    async findDueForMonthlyReport(at, schedule: ReportScheduleConfig) {
      const rows = await prisma.user.findMany();
      return rows
        .map(toUser)
        .filter((u: User) => isDueForMonthlyReport(u, at, schedule));
    },

    async updatePreferences(id: UserId, prefs: UserPreferences) {
      const data: {
        timezone?: string;
        digestDay?: number;
        digestTime?: string;
        deliveryPreference?: string;
      } = {};
      if (prefs.timezone !== undefined) data.timezone = prefs.timezone;
      if (prefs.digestDay !== undefined) data.digestDay = prefs.digestDay;
      if (prefs.digestTime !== undefined) data.digestTime = prefs.digestTime;
      if (prefs.deliveryPreference !== undefined) {
        data.deliveryPreference = prefs.deliveryPreference;
      }
      try {
        await prisma.user.update({ where: { id }, data });
      } catch {
        throw new NotFoundError(`user ${id}`);
      }
    },
  };
}
