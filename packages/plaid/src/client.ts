import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import type { PlaidConfig, PlaidEnvironment } from "./config.js";

function basePathFor(env: PlaidEnvironment): string {
  switch (env) {
    case "sandbox":
      return PlaidEnvironments.sandbox ?? "https://sandbox.plaid.com";
    case "development":
      return PlaidEnvironments.development ?? "https://development.plaid.com";
    case "production":
      return PlaidEnvironments.production ?? "https://production.plaid.com";
  }
}

export function makePlaidClient(cfg: PlaidConfig): PlaidApi {
  const configuration = new Configuration({
    basePath: basePathFor(cfg.env),
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": cfg.clientId,
        "PLAID-SECRET": cfg.secret,
      },
    },
  });
  return new PlaidApi(configuration);
}
