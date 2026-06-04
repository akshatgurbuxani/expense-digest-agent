import { makeLogger, makeSystemClock } from "@expense/config";
import type { Repositories } from "@expense/core";
import {
  buildServices,
  resolveBank,
  resolveConfig,
  resolveMail,
  resolveDelivery,
  resolveLlm,
  resolveReceiptExtractor,
  resolveRepos,
  resolveWorkerQueue,
  type Services,
  type WorkerContainer,
  type WorkerWiringOptions,
} from "@expense/wiring";

export type { Services, WorkerContainer, WorkerWiringOptions as ContainerOptions };

/** Composition root for the worker process — full domain services + job consumer. */
export function buildWorkerContainer(opts: WorkerWiringOptions = {}): WorkerContainer {
  const { env, app } = resolveConfig(opts);
  const log = makeLogger({ level: env.LOG_LEVEL });
  const clock = opts.clock ?? makeSystemClock();
  const { repos, prisma } = resolveRepos(env, opts);
  const bank = resolveBank(env, opts);
  const mail = resolveMail(env, opts);
  const { producer, consumer, drain, closeQueue } = resolveWorkerQueue(
    env,
    log,
    app,
    opts,
  );
  const llm = resolveLlm(env, app, opts);
  const receiptExtractor = resolveReceiptExtractor(env, app, opts);
  const { router, emailChannel } = resolveDelivery(env, log, opts);

  const services = buildServices({
    repos: repos as Repositories,
    bank,
    mail,
    receiptExtractor,
    producer,
    clock,
    llm,
    router,
    app,
    env,
    log,
  });

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
    consumer,
    drain,
    closeQueue,
    services,
    emailChannel,
  };
}
