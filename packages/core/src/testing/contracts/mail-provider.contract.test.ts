import { describe, it, expect } from "vitest";
import { makeFakeMailProvider } from "../fake-mail.js";
import {
  mailProviderContract,
  mailProviderHistoryExpiredContract,
} from "./mail-provider.contract.js";

mailProviderContract(
  () =>
    makeFakeMailProvider({
      messages: {
        "msg-1": {
          gmailMessageId: "msg-1",
          threadId: "t1",
          receivedAt: new Date("2026-05-20T18:00:00.000Z"),
          fromAddress: "Amazon <order-update@amazon.com>",
          subject: "Shipped",
          snippet: "Your package",
          labelIds: ["INBOX"],
          textPlain: "Order total $45.99",
          textHtml: null,
        },
      },
    }),
  "FakeMail",
  { sampleGmailMessageId: "msg-1" },
);

mailProviderHistoryExpiredContract(
  () => makeFakeMailProvider({ expiredHistoryId: "expired-1" }),
  "expired-1",
);

describe("FakeMail specifics", () => {
  it("pages through scripted history changes", async () => {
    const mail = makeFakeMailProvider({
      changePages: [
        {
          candidateMessageIds: ["a", "b"],
          deletedMessageIds: [],
          nextHistoryId: "101",
        },
        {
          candidateMessageIds: [],
          deletedMessageIds: ["old"],
          nextHistoryId: "102",
        },
      ],
    });

    const first = await mail.listChanges({
      refreshToken: "t",
      startHistoryId: "100",
    });
    expect(first.candidateMessageIds).toEqual(["a", "b"]);

    const second = await mail.listChanges({
      refreshToken: "t",
      startHistoryId: "101",
    });
    expect(second.deletedMessageIds).toEqual(["old"]);
  });
});
