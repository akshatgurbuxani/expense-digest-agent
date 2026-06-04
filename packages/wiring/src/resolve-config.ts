import {
  makeTestAppConfig,
  makeTestEnv,
} from "@expense/config/testing";
import {
  type AppConfig,
  type Config,
  type Env,
} from "@expense/config";
import type { WiringOptions } from "./types.js";

export function resolveConfig(opts: WiringOptions): { env: Env; app: AppConfig } {
  const env = opts.config?.env ?? opts.env ?? makeTestEnv();
  const app = opts.config?.app ?? opts.app ?? makeTestAppConfig();
  return { env, app };
}
