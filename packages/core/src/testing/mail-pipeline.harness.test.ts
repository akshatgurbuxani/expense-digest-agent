import { describe, it, expect } from "vitest";
import { makeFakeMailProvider } from "./fake-mail.js";
import { makeMailPipelineHarness } from "./mail-pipeline.harness.js";

describe("makeMailPipelineHarness", () => {
  it("runSync with no mailbox changes completes without enqueuing parse jobs", async () => {
    const harness = makeMailPipelineHarness({
      mail: makeFakeMailProvider({ gmailAddress: "shopper@gmail.com" }),
    });
    const { userId, mailAccountId } = await harness.setupUser();

    await harness.runSync({ userId, mailAccountId });

    expect(harness.queue.jobs.some((j) => j.name === "receipt.parse")).toBe(
      false,
    );
    expect(harness.queue.jobs.some((j) => j.name === "mail.fullSync")).toBe(
      false,
    );
  });
});
