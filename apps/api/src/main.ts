import { makeSystemClock, loadConfig } from "@expense/config";
import { buildApiContainer } from "./composition-root.js";
import { createApp } from "./create-app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const container = buildApiContainer({
    config,
    clock: makeSystemClock(),
    useDatabase: true,
    useBullMQ: true,
  });

  const app = createApp(container);
  app.listen(config.env.API_PORT, () => {
    container.log.info("api listening", { port: config.env.API_PORT });
  });
}

void main();
