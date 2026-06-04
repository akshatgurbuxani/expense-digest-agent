import type { Clock } from "../ports/clock.js";
import type { JobProducer } from "../ports/jobs.js";
import type {
  MailAccountRepository,
  UserRepository,
} from "../ports/repositories.js";
import {
  digestJobId,
  isoWeekLabel,
  mailWatchJobId,
  reportJobId,
} from "../iso-week.js";
import {
  previousYearMonth,
  type ReportScheduleConfig,
} from "../report-schedule.js";

export interface SchedulerDeps {
  users: UserRepository;
  mailAccounts?: MailAccountRepository;
  queue: JobProducer;
  clock: Clock;
  reportSchedule?: ReportScheduleConfig;
}

export function makeSchedulerService(deps: SchedulerDeps) {
  return {
    /** Scan for due digests, monthly reports, and daily mail.watch renewals. */
    async tick(): Promise<{
      due: number;
      monthlyReports: number;
      mailWatch: number;
    }> {
      const at = deps.clock.now();
      const due = await deps.users.findDueForDigest(at);

      for (const user of due) {
        const isoWeek = isoWeekLabel(user.timezone, at);
        await deps.queue.enqueue(
          "digest.generate",
          { userId: user.id, isoWeek },
          { jobId: digestJobId(user.id, isoWeek) },
        );
      }

      let monthlyReports = 0;
      if (deps.reportSchedule) {
        const reportDue = await deps.users.findDueForMonthlyReport(
          at,
          deps.reportSchedule,
        );
        for (const user of reportDue) {
          const yearMonth = previousYearMonth(user.timezone, at);
          await deps.queue.enqueue(
            "report.generate",
            { userId: user.id, yearMonth },
            { jobId: reportJobId(user.id, yearMonth) },
          );
          monthlyReports += 1;
        }
      }

      let mailWatch = 0;
      if (deps.mailAccounts) {
        const accounts = await deps.mailAccounts.listActive();
        for (const account of accounts) {
          await deps.queue.enqueue(
            "mail.watch",
            { userId: account.userId, mailAccountId: account.id },
            { jobId: mailWatchJobId(account.id, at) },
          );
          mailWatch += 1;
        }
      }

      return { due: due.length, monthlyReports, mailWatch };
    },
  };
}
