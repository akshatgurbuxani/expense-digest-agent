import type { MailProvider } from "@expense/core";
import { makeFakeMailProvider } from "@expense/core/testing";
import type { Env } from "@expense/config";
import {
  gmailConfigFromEnv,
  hasGmailCredentials,
  makeGmailMailProvider,
} from "@expense/gmail";
import type { ApiWiringOptions } from "./types.js";

export function resolveMail(env: Env, opts: ApiWiringOptions): MailProvider {
  if (opts.mail) return opts.mail;
  if (hasGmailCredentials(env)) {
    return makeGmailMailProvider(gmailConfigFromEnv(env));
  }
  return makeFakeMailProvider();
}
