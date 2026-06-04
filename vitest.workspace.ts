import { defineWorkspace } from "vitest/config";

// Two projects:
//   unit        — L1/L2, no infra, runs on every save (`npm test`)
//   integration — L3/L4, needs docker/sandboxes (`npm run test:integration`)
export default defineWorkspace([
  {
    test: {
      name: "unit",
      environment: "node",
      include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "apps/web/**"],
    },
  },
  {
    test: {
      name: "component",
      environment: "jsdom",
      include: ["apps/web/**/*.test.tsx"],
      setupFiles: ["apps/web/src/test-setup.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
  },
  {
    test: {
      name: "integration",
      environment: "node",
      include: ["packages/**/*.itest.ts", "apps/**/*.itest.ts", "apps/**/e2e/**/*.e2e.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/helpers/**"],
      fileParallelism: false,
      maxWorkers: 1,
      sequence: { concurrent: false },
      poolOptions: {
        forks: { singleFork: true },
      },
    },
  },
]);
