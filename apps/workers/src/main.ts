import { loadConfig } from "@expense/config";
import { buildWorkerContainer } from "./composition-root.js";
import { registerJobHandlers } from "./job-handlers.js";

export function installGracefulShutdown(
  log: { info: (msg: string, fields?: Record<string, unknown>) => void },
  close: () => Promise<void>,
): void {
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      void (async () => {
        log.info("shutting down", { sig });
        await close().catch((e) =>
          log.info("shutdown error", { err: String(e) }),
        );
        process.exit(0);
      })();
    });
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const container = buildWorkerContainer({
    config,
    useDatabase: true,
    useBullMQ: true,
  });
  registerJobHandlers(container.consumer, container.services);
  await container.consumer.start();

  container.log.info("workers started (BullMQ over Redis)", {
    concurrency: container.app.workers.concurrency,
  });

  installGracefulShutdown(container.log, async () => {
    await container.consumer.stop();
    await container.closeQueue?.();
  });

  await new Promise<void>(() => {
    /* keep process alive until signal */
  });
}

void main();
