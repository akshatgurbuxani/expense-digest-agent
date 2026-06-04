import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { InvariantError } from "@expense/core";
import { type Env, loadEnv, makeEnv } from "./env.js";
import { type AppConfig, parseAppConfig } from "./app-config.js";
import { deepMerge } from "./merge.js";

export interface Config {
  readonly env: Env;
  readonly app: AppConfig;
}

export interface LoadConfigOptions {
  /** Override process.env for tests. */
  env?: Record<string, string | undefined>;
  /** Deep-merge on top of loaded YAML (tests only — must remain valid). */
  appOverrides?: Record<string, unknown>;
  /** Explicit config directory (else APP_CONFIG_DIR or repo discovery). */
  configDir?: string;
}

const ENV_FILE_MAP: Record<string, string> = {
  development: "development.yaml",
  production: "production.yaml",
  test: "test.yaml",
};

/** Resolve config/ directory: APP_CONFIG_DIR → walk up from cwd for config/default.yaml. */
export function resolveConfigDir(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  if (process.env.APP_CONFIG_DIR) {
    return path.resolve(process.env.APP_CONFIG_DIR);
  }

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, "config", "default.yaml");
    if (fs.existsSync(candidate)) return path.join(dir, "config");
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return path.join(process.cwd(), "config");
}

function readYamlFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    throw new InvariantError(`config file not found: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = parseYaml(text);
  if (parsed === null || parsed === undefined) {
    throw new InvariantError(`config file is empty: ${filePath}`);
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvariantError(`config file must be a YAML mapping: ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Load layered YAML: default.yaml (required) → optional {NODE_ENV}.yaml overlay.
 * Fails if default.yaml is missing or the merged result does not satisfy the schema.
 */
export function loadAppConfigFromFiles(opts: {
  configDir?: string;
  nodeEnv: string;
}): AppConfig {
  const dir = resolveConfigDir(opts.configDir);
  const defaultPath = path.join(dir, "default.yaml");
  let merged = readYamlFile(defaultPath);

  const envFile = ENV_FILE_MAP[opts.nodeEnv];
  if (envFile) {
    const envPath = path.join(dir, envFile);
    if (fs.existsSync(envPath)) {
      merged = deepMerge(merged, readYamlFile(envPath));
    }
  }

  return parseAppConfig(merged);
}

/**
 * Load full runtime configuration: secrets from env, tunables from layered YAML.
 * Secrets stay in environment variables only (12-factor).
 */
export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const env = opts.env ? makeEnv({ ...process.env, ...opts.env }) : loadEnv();

  let app = loadAppConfigFromFiles({
    configDir: opts.configDir,
    nodeEnv: env.NODE_ENV,
  });

  if (opts.appOverrides && Object.keys(opts.appOverrides).length > 0) {
    app = parseAppConfig(
      deepMerge(app as unknown as Record<string, unknown>, opts.appOverrides),
    );
  }

  return { env, app };
}
