import { loadConfig } from "@expense/config";
import { buildSchedulerContainer } from "./composition-root.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const container = buildSchedulerContainer({ config });

  const tickMs = container.app.scheduler.tickIntervalMs;

  const runTick = async (): Promise<void> => {
    try {
      const { due, mailWatch } = await container.scheduler.tick();
      container.log.info("scheduler tick", { due, mailWatch, tickMs });
    } catch (err) {
      container.log.error("scheduler tick failed", { err: String(err) });
    }
  };

  container.log.info("scheduler started", { tickMs });
  await runTick();
  setInterval(() => {
    void runTick();
  }, tickMs);

  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      void (async () => {
        container.log.info("shutting down", { sig });
        await container.close().catch((e) =>
          container.log.error("shutdown error", { err: String(e) }),
        );
        process.exit(0);
      })();
    });
  }

  await new Promise<void>(() => {
    /* keep process alive until signal */
  });
}

void main();
