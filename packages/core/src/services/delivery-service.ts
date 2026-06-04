import { NotFoundError, InvariantError } from "../errors.js";
import type { AnomalyId, DigestId, ReportId, UserId } from "../ids.js";
import type { MonthlyReportFacts } from "../domain/monthly-report-facts.js";
import type { Clock } from "../ports/clock.js";
import type { Logger } from "../ports/logger.js";
import type { DeliveryRouter } from "../ports/delivery.js";
import type {
  AnomalyRepository,
  DigestRepository,
  ReportRepository,
  UserRepository,
} from "../ports/repositories.js";

export interface DeliveryDeps {
  users: UserRepository;
  digests: DigestRepository;
  reports: ReportRepository;
  anomalies: AnomalyRepository;
  router: DeliveryRouter;
  clock: Clock;
  log?: Logger;
  renderMonthlyReportHtml?: (
    prose: string,
    facts: MonthlyReportFacts,
  ) => string;
}

export function makeDeliveryService(deps: DeliveryDeps) {
  return {
    async run(payload: {
      userId: UserId;
      kind: "digest" | "anomaly" | "monthly_report";
      refId: DigestId | AnomalyId | ReportId;
    }): Promise<void> {
      const log = deps.log?.child({ userId: payload.userId, kind: payload.kind, refId: payload.refId });
      
      const user = await deps.users.findById(payload.userId);
      if (!user) {
        log?.error("user not found");
        throw new NotFoundError(`user ${payload.userId}`);
      }

      log?.info("delivering content", { deliveryPreference: user.deliveryPreference });

      if (payload.kind === "digest") {
        const digests = await deps.digests.history(payload.userId, 100);
        const digest = digests.find((d) => d.id === payload.refId);
        if (!digest) {
          log?.error("digest not found");
          throw new NotFoundError(`digest ${payload.refId}`);
        }

        const channel = deps.router.routeFor("email");
        log?.info("sending digest email", { to: user.email, subject: digest.subject });
        await channel.send({
          to: user.email,
          subject: digest.subject,
          body: digest.content,
        });
        await deps.digests.markDelivered(digest.id, deps.clock.now());
        log?.info("digest delivered successfully");
        return;
      }

      if (payload.kind === "monthly_report") {
        const report = await deps.reports.findById(
          payload.userId,
          payload.refId as ReportId,
        );
        if (!report) throw new NotFoundError(`report ${payload.refId}`);

        const body = deps.renderMonthlyReportHtml
          ? deps.renderMonthlyReportHtml(report.content, report.facts)
          : report.content;

        const channel = deps.router.routeFor("email");
        await channel.send({
          to: user.email,
          subject: report.subject,
          body,
        });
        await deps.reports.markDelivered(report.id, deps.clock.now());
        return;
      }

      const recent = await deps.anomalies.listRecent(payload.userId, 100);
      const anomaly = recent.find((a) => a.id === payload.refId);
      if (!anomaly) throw new NotFoundError(`anomaly ${payload.refId}`);

      let channel;
      try {
        channel = deps.router.routeFor(user.deliveryPreference);
      } catch {
        throw new InvariantError(
          `no delivery channel for preference ${user.deliveryPreference}`,
        );
      }

      await channel.send({
        to: user.email,
        subject: "Unusual activity on your account",
        body: anomaly.detail,
      });
      await deps.anomalies.markDelivered(anomaly.id, deps.clock.now());
    },
  };
}
