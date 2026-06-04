import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpContainer } from "./composition-root.js";

async function main(): Promise<void> {
  const container = await buildMcpContainer();
  const transport = new StdioServerTransport();
  await container.server.connect(transport);
  container.log.info("mcp server connected", { userId: container.userId });
}

void main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
