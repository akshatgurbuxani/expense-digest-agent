import { describe, it, expect } from "vitest";
import { extractBodiesFromPayload } from "./mime-walk.js";

describe("extractBodiesFromPayload", () => {
  it("walks multipart/alternative and extracts plain + html", () => {
    const plain = Buffer.from("Hello plain", "utf8").toString("base64");
    const html = Buffer.from("<p>Hello html</p>", "utf8").toString("base64");

    const result = extractBodiesFromPayload({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: plain } },
        { mimeType: "text/html", body: { data: html } },
      ],
    });

    expect(result.textPlain).toBe("Hello plain");
    expect(result.textHtml).toBe("<p>Hello html</p>");
  });

  it("prefers first text/plain and text/html found in nested parts", () => {
    const plain = Buffer.from("Nested", "utf8").toString("base64");

    const result = extractBodiesFromPayload({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [{ mimeType: "text/plain", body: { data: plain } }],
        },
      ],
    });

    expect(result.textPlain).toBe("Nested");
    expect(result.textHtml).toBeNull();
  });
});
