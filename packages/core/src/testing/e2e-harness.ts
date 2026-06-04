import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  E2EScenarioSchema,
  type E2EScenario,
  type TransactionFixture,
  type SpendingPattern,
} from "./e2e-scenario-schema.js";
import { Money, newId, weekWindowFor, isoWeekLabel, type UserId, type ItemId, type AccountId, type MailAccountId } from "../index.js";
import type { User, Item, Transaction } from "../domain/index.js";
import type { BankProvider } from "../ports/bank-provider.js";
import type { MailProvider } from "../ports/mail-provider.js";
import { makeFakeMailProvider, type FakeMailMessage } from "./fake-mail.js";
import { type TestRepositories } from "./index.js";
import type { Weekday } from "../domain/user.js";
import type { GmailMessageFixture } from "./e2e-scenario-schema.js";

export interface MerchantTemplate {
  readonly merchant: string;
  readonly category: string;
  readonly baseAmount: number;
  readonly recurring?: boolean;
}

const PATTERN_TEMPLATES: Record<SpendingPattern, MerchantTemplate[]> = {
  frugal: [
    { merchant: "Trader Joe's", category: "groceries", baseAmount: 45 },
    { merchant: "Target", category: "shopping", baseAmount: 30 },
    { merchant: "Shell Gas", category: "transport", baseAmount: 40 },
    { merchant: "Netflix", category: "subscriptions", baseAmount: 15.99, recurring: true },
    { merchant: "Spotify", category: "subscriptions", baseAmount: 10.99, recurring: true },
  ],
  moderate: [
    { merchant: "Whole Foods Market", category: "groceries", baseAmount: 85 },
    { merchant: "Starbucks", category: "dining", baseAmount: 12 },
    { merchant: "Amazon", category: "shopping", baseAmount: 67 },
    { merchant: "Uber", category: "transport", baseAmount: 28 },
    { merchant: "Netflix", category: "subscriptions", baseAmount: 15.99, recurring: true },
    { merchant: "Apple iCloud", category: "subscriptions", baseAmount: 2.99, recurring: true },
    { merchant: "Gym Membership", category: "health", baseAmount: 49.99, recurring: true },
  ],
  high: [
    { merchant: "Whole Foods Market", category: "groceries", baseAmount: 150 },
    { merchant: "High-End Restaurant", category: "dining", baseAmount: 180 },
    { merchant: "Nordstrom", category: "shopping", baseAmount: 340 },
    { merchant: "Uber", category: "transport", baseAmount: 55 },
    { merchant: "Amazon", category: "shopping", baseAmount: 250 },
    { merchant: "Apple Music", category: "subscriptions", baseAmount: 10.99, recurring: true },
    { merchant: "HBO Max", category: "subscriptions", baseAmount: 15.99, recurring: true },
    { merchant: "Peloton", category: "health", baseAmount: 44, recurring: true },
  ],
  "subscription-heavy": [
    { merchant: "Safeway", category: "groceries", baseAmount: 60 },
    { merchant: "Netflix", category: "subscriptions", baseAmount: 15.99, recurring: true },
    { merchant: "Spotify", category: "subscriptions", baseAmount: 10.99, recurring: true },
    { merchant: "Amazon Prime", category: "subscriptions", baseAmount: 14.99, recurring: true },
    { merchant: "Apple iCloud", category: "subscriptions", baseAmount: 9.99, recurring: true },
    { merchant: "Disney+", category: "subscriptions", baseAmount: 7.99, recurring: true },
    { merchant: "YouTube Premium", category: "subscriptions", baseAmount: 11.99, recurring: true },
    { merchant: "LinkedIn Premium", category: "subscriptions", baseAmount: 29.99, recurring: true },
    { merchant: "Adobe Creative Cloud", category: "subscriptions", baseAmount: 54.99, recurring: true },
  ],
};

export function getMerchantTemplates(pattern: SpendingPattern): MerchantTemplate[] {
  return PATTERN_TEMPLATES[pattern]!;
}

const ALL_PATTERNS: SpendingPattern[] = ["frugal", "moderate", "high", "subscription-heavy"];

/** Re-declared here to avoid type-brand conflicts between zod-inferred and manually-declared. */
export interface SyncPageDef {
  added: any[];
  modified?: any[];
  removed?: string[];
}

export interface ResolvedUser {
  email: string;
  timezone: string;
  digestDay: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  deliveryPreference: "email" | "sms";
  plaidItemId: string;
  plaidAccountId: string;
  gmailAddress?: string;
  pattern: SpendingPattern;
  /** For explicit users, optional explicit sync pages instead of pattern-generated ones. */
  syncPages?: SyncPageDef[];
  /** Historical transactions to seed directly (not through sync). */
  existingTransactions?: TransactionFixture[];
  /** Gmail messages to seed for mail pipeline. */
  mailMessages?: GmailMessageFixture[];
}

export function expandScenario(scenario: E2EScenario): ResolvedUser[] {
  if (Array.isArray(scenario.users)) {
    return scenario.users.map((u, i) => ({
      email: u.email ?? `user-${i}@example.com`,
      timezone: u.timezone ?? "UTC",
      digestDay: u.digestDay ?? "sunday",
      deliveryPreference: u.deliveryPreference ?? "email",
      plaidItemId: u.plaidItemId,
      plaidAccountId: u.plaidAccountId,
      gmailAddress: u.gmailAddress,
      pattern: "moderate" as SpendingPattern,
      syncPages: u.syncPages as SyncPageDef[] | undefined,
      existingTransactions: u.existingTransactions,
      mailMessages: u.mailMessages,
    }));
  }

  const gen = scenario.users;
  const patternList: SpendingPattern[] = gen.patterns ? [] : ["moderate"];
  for (const entry of gen.patterns ?? []) {
    if (typeof entry === "string") {
      if (ALL_PATTERNS.includes(entry as SpendingPattern)) {
        patternList.push(entry as SpendingPattern);
      }
    } else {
      for (const [key, count] of Object.entries(entry)) {
        const sp = key as SpendingPattern;
        if (!ALL_PATTERNS.includes(sp)) continue;
        for (let i = 0; i < count; i++) patternList.push(sp);
      }
    }
  }

  return Array.from({ length: gen.count }, (_, i) => {
    const p = patternList[i % patternList.length] ?? "moderate";
    return {
      email: `load-user-${i + 1}@example.com`,
      timezone: "America/Los_Angeles",
      digestDay: "sunday" as const,
      deliveryPreference: "email" as const,
      plaidItemId: `plaid-item-${i + 1}`,
      plaidAccountId: `plaid-acct-${i + 1}`,
      pattern: p,
    };
  });
}

export interface UserContext {
  userId: UserId;
  itemId: ItemId;
  accountId: AccountId;
  mailAccountId?: MailAccountId;
  user: User;
  item: Item;
  accessToken: string;
}

function digestDayToWeekday(d: string): Weekday {
  const map: Record<string, Weekday> = {
    monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
    friday: 4, saturday: 5, sunday: 6,
  };
  return map[d] ?? 6;
}

export function seedScenarioUsers(
  users: ResolvedUser[],
  repos: TestRepositories,
): UserContext[] {
  const contexts: UserContext[] = [];

  for (let i = 0; i < users.length; i++) {
    const u = users[i]!;
    const userId = newId<"UserId">();
    const itemId = newId<"ItemId">();
    const accountId = newId<"AccountId">();
    const accessToken = `access-token-${i}`;

    repos._seed.user({
      id: userId,
      email: u.email,
      timezone: u.timezone,
      digestDay: digestDayToWeekday(u.digestDay),
      digestTime: "08:00",
      deliveryPreference: u.deliveryPreference,
      createdAt: new Date(),
    });

    repos._seed.item(
      { id: itemId, userId, plaidItemId: u.plaidItemId, status: "good", syncCursor: null, lastSyncedAt: null },
      accessToken,
    );

    repos._seed.account({
      id: accountId,
      itemId,
      userId,
      plaidAccountId: u.plaidAccountId,
      name: "Checking",
      type: "depository",
      lastSyncedAt: null,
    });

    const existingTxns = u.existingTransactions ?? [];
    for (const txnFix of existingTxns) {
      repos._seed.transaction(transactionFromFixture(txnFix, accountId, userId));
    }

    const templates = PATTERN_TEMPLATES[u.pattern];
    if (templates) {
      for (const t of templates) {
        repos.merchants.upsert({
          normalizedMerchant: t.merchant.toLowerCase().replace(/\s/g, ""),
          merchantName: t.merchant,
          category: t.category as any,
          signals: { isSubscription: t.recurring ?? false, isRecurring: t.recurring ?? false, confidence: 0.95 },
          source: "llm",
        });
      }
    }

    let mailAccountId: MailAccountId | undefined;
    if (u.mailMessages && u.mailMessages.length > 0) {
      mailAccountId = newId<"MailAccountId">();
      repos._seed.mailAccount(
        {
          id: mailAccountId,
          userId,
          gmailAddress: u.gmailAddress ?? `${u.email}`,
          status: "active",
          historyId: null,
          watchExpiresAt: null,
          lastSyncedAt: null,
          connectedAt: new Date(),
        },
        `gmail-refresh-token-${i}`,
      );
    }

    contexts.push({ userId, itemId, accountId, mailAccountId, accessToken, user: { id: userId, email: u.email, timezone: u.timezone, digestDay: digestDayToWeekday(u.digestDay), digestTime: "08:00", deliveryPreference: u.deliveryPreference, createdAt: new Date() } as User, item: { id: itemId, userId, plaidItemId: u.plaidItemId, status: "good", syncCursor: null, lastSyncedAt: null } as Item });
  }

  return contexts;
}

export function makeMultiUserBank(
  users: ResolvedUser[],
  contexts: UserContext[],
  clock: Date,
): BankProvider {
  const pagesByToken = new Map<string, Array<{ added: any[]; modified: any[]; removed: string[]; nextCursor: string; hasMore: boolean }>>();

  for (let i = 0; i < users.length; i++) {
    const u = users[i]!;
    const ctx = contexts[i]!;
    const syncedTxnPages = u.syncPages && u.syncPages.length > 0
      ? u.syncPages.map((p) => ({
          added: (p.added ?? []).map((t: any) => txnFixtureToSyncTxn(t, u.plaidAccountId)),
          modified: (p.modified ?? []).map((t: any) => txnFixtureToSyncTxn(t, u.plaidAccountId)),
          removed: (p.removed ?? []) as string[],
          nextCursor: "cursor-done",
          hasMore: false,
        }))
      : [{ added: generateSyncTransactions(u, clock), modified: [], removed: [], nextCursor: "cursor-done", hasMore: false }];
    pagesByToken.set(ctx.accessToken, syncedTxnPages);
  }

  const cursors = new Map<string, number>();

  return {
    async createLinkToken() {
      return { linkToken: "link-test-token", expiration: new Date(Date.now() + 3600_000) };
    },
    async exchangePublicToken() {
      return { plaidItemId: "item_test", accessToken: "access-test-token" };
    },
    async syncTransactions(input) {
      const token = input.accessToken;
      const pages = pagesByToken.get(token);
      if (!pages) return { added: [], modified: [], removed: [], nextCursor: "cursor-end", hasMore: false };
      const idx = cursors.get(token) ?? 0;
      if (idx >= pages.length) return { added: [], modified: [], removed: [], nextCursor: "cursor-end", hasMore: false };
      cursors.set(token, idx + 1);
      return pages[idx]!;
    },
    async verifyWebhook() {
      return { itemId: "item_test", type: "TRANSACTIONS" as const, code: "SYNC_UPDATES_AVAILABLE" };
    },
  };
}

export function makeMailProvider(
  users: ResolvedUser[],
): MailProvider {
  const messages: Record<string, FakeMailMessage> = {};
  const accountChangePages: Record<string, any[]> = {};

  for (let i = 0; i < users.length; i++) {
    const u = users[i]!;
    const userMailMessages = u.mailMessages ?? [];
    if (userMailMessages.length === 0) continue;

    const refreshToken = `gmail-refresh-token-${i}`;
    const candidateIds: string[] = [];

    for (const msg of userMailMessages) {
      candidateIds.push(msg.gmailMessageId);
      messages[msg.gmailMessageId] = {
        gmailMessageId: msg.gmailMessageId,
        threadId: msg.threadId,
        receivedAt: new Date(msg.receivedAt),
        fromAddress: msg.fromAddress,
        subject: msg.subject,
        snippet: msg.snippet ?? null,
        labelIds: ["INBOX"],
        textPlain: msg.textPlain ?? null,
        textHtml: msg.textHtml ?? null,
      };
    }

    accountChangePages[refreshToken] = [
      {
        candidateMessageIds: candidateIds,
        deletedMessageIds: [],
        nextHistoryId: `history-${i}-next`,
      },
    ];
  }

  return makeFakeMailProvider({ messages, accountChangePages });
}

function txnFixtureToSyncTxn(
  fixture: TransactionFixture,
  plaidAccountId: string,
): any {
  return {
    plaidTransactionId: (fixture as any).plaidTransactionId ?? `plaid_${newId()}`,
    plaidAccountId: (fixture as any).plaidAccountId ?? plaidAccountId,
    amount: typeof fixture.amount === "number" ? Money.of(fixture.amount, "USD") : fixture.amount,
    merchantNameRaw: fixture.merchantNameRaw ?? (fixture.merchantName ? fixture.merchantName.toUpperCase().replace(/\s/g, "") : undefined),
    plaidPfc: fixture.plaidPfc ?? null,
    occurredAt: new Date(fixture.occurredAt),
  };
}

function generateSyncTransactions(user: ResolvedUser, clock: Date): any[] {
  const window = weekWindowFor(user.timezone, clock);
  const templates = PATTERN_TEMPLATES[user.pattern];
  if (!templates) return [];

  const msPerDay = 86400000;
  const result: any[] = [];

  for (const t of templates) {
    for (let w = 1; w <= 4; w++) {
      const count = t.recurring ? 1 : (Math.floor(Math.random() * 3) + 1);
      for (let i = 0; i < count; i++) {
        const variance = t.recurring ? 0 : (Math.random() - 0.5) * 0.3;
        const amount = Math.round(t.baseAmount * (1 + variance) * 100);
        const weekStart = new Date(window.start.getTime() - w * 7 * msPerDay);
        result.push({
          plaidTransactionId: `plaid_${newId()}`,
          plaidAccountId: user.plaidAccountId,
          amount: Money.of(amount, "USD"),
          merchantNameRaw: t.merchant.toUpperCase().replace(/\s/g, ""),
          plaidPfc: null,
          occurredAt: new Date(weekStart.getTime() + Math.floor(Math.random() * 7) * msPerDay),
        });
      }
    }
  }

  for (const t of templates) {
    const count = t.recurring ? 1 : (Math.floor(Math.random() * 2) + 1);
    for (let i = 0; i < count; i++) {
      const variance = t.recurring ? 0 : (Math.random() - 0.5) * 0.3;
      const amount = Math.round(t.baseAmount * (1 + variance) * 100);
      result.push({
        plaidTransactionId: `plaid_${newId()}`,
        plaidAccountId: user.plaidAccountId,
        amount: Money.of(amount, "USD"),
        merchantNameRaw: t.merchant.toUpperCase().replace(/\s/g, ""),
        plaidPfc: null,
        occurredAt: new Date(window.start.getTime() + Math.floor(Math.random() * 7) * msPerDay),
      });
    }
  }

  return result;
}

function transactionFromFixture(
  fixture: TransactionFixture,
  accountId: AccountId,
  userId: UserId,
): Transaction {
  return {
    id: newId<"TransactionId">(),
    accountId,
    userId,
    plaidTransactionId: (fixture as any).plaidTransactionId ?? `txn-fixture-${newId()}`,
    amount: Money.of(fixture.amount, "USD"),
    merchantName: fixture.merchantName,
    merchantNameRaw: fixture.merchantNameRaw ?? fixture.merchantName?.toUpperCase() ?? "UNKNOWN",
    category: fixture.category as any,
    plaidPfc: fixture.plaidPfc ?? null,
    isSubscription: fixture.isSubscription ?? false,
    isRecurring: fixture.isRecurring ?? false,
    occurredAt: new Date(fixture.occurredAt),
    enrichedAt: new Date(),
    removedAt: null,
  };
}

export function assertExpectations(
  scenario: E2EScenario,
  actual: {
    digests: any[];
    anomalies: any[];
    deliveries: any[];
    jobsEnqueued: string[];
  },
): void {
  const { expected } = scenario;
  if (!expected) return;

  if (expected.digestGenerated !== undefined) {
    if (expected.digestGenerated && actual.digests.length === 0) {
      throw new Error(`Expected digest to be generated, but got ${actual.digests.length}`);
    }
    if (!expected.digestGenerated && actual.digests.length > 0) {
      throw new Error(`Expected no digest, but got ${actual.digests.length}`);
    }
  }

  if (expected.digestContains) {
    const content = actual.digests[0]?.content ?? "";
    for (const phrase of expected.digestContains) {
      if (!content.includes(phrase)) {
        throw new Error(`Expected digest to contain "${phrase}". Content: ${content}`);
      }
    }
  }

  if (expected.anomaliesDetected !== undefined) {
    if (actual.anomalies.length !== expected.anomaliesDetected) {
      throw new Error(`Expected ${expected.anomaliesDetected} anomalies, got ${actual.anomalies.length}`);
    }
  }

  if (expected.anomalyReasons) {
    const reasons = actual.anomalies.map((a: any) => a.reason);
    for (const r of expected.anomalyReasons) {
      if (!reasons.includes(r)) {
        throw new Error(`Expected anomaly reason "${r}", got: ${reasons.join(", ")}`);
      }
    }
  }

  if (expected.deliverySent !== undefined) {
    if (expected.deliverySent && actual.deliveries.length === 0) {
      throw new Error("Expected delivery, got none");
    }
    if (!expected.deliverySent && actual.deliveries.length > 0) {
      throw new Error(`Expected no delivery, got ${actual.deliveries.length}`);
    }
  }

  if (expected.deliveryContains) {
    for (const phrase of expected.deliveryContains) {
      const found = actual.deliveries.some((d: any) =>
        (d.body ?? "").includes(phrase) || (d.subject ?? "").includes(phrase),
      );
      if (!found) {
        throw new Error(`Expected delivery to contain "${phrase}"`);
      }
    }
  }

  if (expected.jobsEnqueued) {
    for (const job of expected.jobsEnqueued) {
      if (!actual.jobsEnqueued.includes(job)) {
        throw new Error(`Expected job "${job}" enqueued, got: ${actual.jobsEnqueued.join(", ")}`);
      }
    }
  }

  if (expected.finalDigestCount !== undefined) {
    if (actual.digests.length !== expected.finalDigestCount) {
      throw new Error(`Expected ${expected.finalDigestCount} digests, got ${actual.digests.length}`);
    }
  }
}

/**
 * Resolve a scenario path: if it's an absolute path or relative to CWD, use as-is.
 * Otherwise search `test-scenarios/` at the project root.
 */
function resolveScenarioPath(pathOrName: string): string[] {
  if (pathOrName.endsWith(".yaml")) {
    return [pathOrName];
  }
  const cwd = process.cwd();
  const candidates = [
    `${cwd}/test-scenarios/${pathOrName}.yaml`,
    `${cwd}/../../test-scenarios/${pathOrName}.yaml`,
    `${cwd}/../../../test-scenarios/${pathOrName}.yaml`,
    `${cwd}/../${pathOrName}.yaml`,
    `test-scenarios/${pathOrName}.yaml`,
    `test-scenarios/e2e/${pathOrName}.yaml`,
  ];
  return candidates;
}

export async function loadScenario(pathOrName: string): Promise<E2EScenario> {
  const paths = resolveScenarioPath(pathOrName);

  for (const path of paths) {
    try {
      const content = await readFile(path, "utf-8");
      const raw = parseYaml(content);
      const parsed = E2EScenarioSchema.safeParse(raw);
      if (!parsed.success) continue;
      return parsed.data;
    } catch {
      continue;
    }
  }

  throw new Error(`Scenario not found: ${pathOrName}`);
}

// ---------------------------------------------------------------------------
// Backward-compatible aliases so existing e2e tests keep working
// ---------------------------------------------------------------------------

export function loadE2EScenario(name: string): Promise<E2EScenario> {
  return loadScenario(name);
}

export function seedFromScenario(
  scenario: E2EScenario,
  repos: TestRepositories,
): UserContext {
  const users = expandScenario(scenario);
  const contexts = seedScenarioUsers(users, repos);
  return contexts[0]!;
}

export function bankFromScenario(scenario: E2EScenario, clock?: Date): BankProvider {
  const users = expandScenario(scenario);
  const plaidItemId = users[0]?.plaidItemId ?? "item_test";
  const fakeContexts = users.map((_, i) => ({
    userId: "" as UserId,
    itemId: "" as ItemId,
    accountId: "" as AccountId,
    accessToken: `access-token-${i}`,
    user: null as unknown as User,
    item: null as unknown as Item,
  }));
  const inner = makeMultiUserBank(users, fakeContexts, clock ?? new Date());
  return Object.assign(inner, {
    async verifyWebhook() {
      return { itemId: plaidItemId, type: "TRANSACTIONS" as const, code: "SYNC_UPDATES_AVAILABLE" };
    },
  });
}

export { isoWeekLabel, weekWindowFor };
