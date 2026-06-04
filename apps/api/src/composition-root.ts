import { makeLogger, makeSystemClock } from "@expense/config";
import {
  resolveBank,
  resolveConfig,
  resolveMail,
  resolveProducer,
  resolveRepos,
  type ApiContainer,
  type ApiWiringOptions,
} from "@expense/wiring";

export type { ApiContainer as Container, ApiWiringOptions as ContainerOptions };

/** Composition root for the API process — repos, bank, and job producer only. */
export function buildApiContainer(opts: ApiWiringOptions = {}): ApiContainer {
  const { env, app } = resolveConfig(opts);
  const log = makeLogger({ level: env.LOG_LEVEL });
  const clock = opts.clock ?? makeSystemClock();
  const { repos, prisma } = resolveRepos(env, opts);
  const bank = resolveBank(env, opts);
  const mail = resolveMail(env, opts);
  const { producer, closeProducer } = resolveProducer(env, log, app, opts);

  return {
    env,
    app,
    log,
    clock,
    repos,
    prisma,
    bank,
    mail,
    producer,
    closeProducer,
  };
}
