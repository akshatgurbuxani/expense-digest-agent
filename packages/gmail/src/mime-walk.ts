/** Gmail API message payload shape (partial). */
export interface GmailPayloadPart {
  readonly mimeType?: string;
  readonly body?: { readonly data?: string; readonly size?: number };
  readonly parts?: readonly GmailPayloadPart[];
}

export interface ExtractedMailBody {
  readonly textPlain: string | null;
  readonly textHtml: string | null;
}

/** Walk a Gmail MIME tree and extract text/plain and text/html bodies. */
export function extractBodiesFromPayload(
  payload: GmailPayloadPart | undefined,
): ExtractedMailBody {
  let textPlain: string | null = null;
  let textHtml: string | null = null;

  function walk(part: GmailPayloadPart | undefined): void {
    if (!part) return;
    const mime = part.mimeType ?? "";
    if (mime === "text/plain" && !textPlain && part.body?.data) {
      textPlain = decodeBase64Url(part.body.data);
    }
    if (mime === "text/html" && !textHtml && part.body?.data) {
      textHtml = decodeBase64Url(part.body.data);
    }
    for (const child of part.parts ?? []) {
      walk(child);
    }
  }

  walk(payload);
  return { textPlain, textHtml };
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}
