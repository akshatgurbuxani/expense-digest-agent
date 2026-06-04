import { describe, it, expect } from "vitest";
import { makeMailWatchService } from "./mail-watch-service.js";
import { makeInMemoryRepositories } from "../testing/in-memory-repos.js";
import { makeFakeMailProvider } from "../testing/fake-mail.js";
import { FixedClock } from "../testing/fixed-clock.js";
import { aUser } from "../testing/builders.js";

describe("makeMailWatchService", () => {
  it("renews watch and persists expiration + history checkpoint", async () => {
    const repos = makeInMemoryRepositories();
    const user = aUser();
    repos._seed.user(user);
    const account = await repos.mailAccounts.create(
      { userId: user.id, gmailAddress: "watch@gmail.com" },
      "refresh-token",
    );

    const mail = makeFakeMailProvider();
    const clock = new FixedClock(new Date("2026-05-25T12:00:00.000Z"));
    const svc = makeMailWatchService({
      mail,
      mailAccounts: repos.mailAccounts,
      clock,
      pubsubTopic: "projects/test/topics/gmail-push",
      inboxLabelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    });

    await svc.run({ userId: user.id, mailAccountId: account.id });

    const updated = await repos.mailAccounts.findById(account.id);
    expect(updated?.watchExpiresAt).not.toBeNull();
    expect(updated?.historyId).toBe("1000");
  });

  it("skips non-active accounts", async () => {
    const repos = makeInMemoryRepositories();
    const user = aUser();
    repos._seed.user(user);
    const account = await repos.mailAccounts.create(
      { userId: user.id, gmailAddress: "revoked@gmail.com" },
      "refresh-token",
    );
    await repos.mailAccounts.setStatus(account.id, "revoked");

    const svc = makeMailWatchService({
      mail: makeFakeMailProvider(),
      mailAccounts: repos.mailAccounts,
      clock: new FixedClock(new Date("2026-05-25T12:00:00.000Z")),
      pubsubTopic: "projects/test/topics/gmail-push",
      inboxLabelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    });

    await svc.run({ userId: user.id, mailAccountId: account.id });

    const updated = await repos.mailAccounts.findById(account.id);
    expect(updated?.watchExpiresAt).toBeNull();
  });
});
