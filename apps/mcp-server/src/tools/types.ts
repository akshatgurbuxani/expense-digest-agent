import type { Clock, Repositories } from "@expense/core";
import type { UserId } from "@expense/core";

export interface McpToolDeps {
  readonly userId: UserId;
  readonly repos: Pick<
    Repositories,
    "users" | "transactions" | "digests" | "anomalies"
  >;
  readonly clock: Clock;
}
