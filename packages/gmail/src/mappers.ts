import type { RawMailMetadata } from "@expense/core";

interface GmailHeader {
  readonly name?: string;
  readonly value?: string;
}

interface GmailMessageResource {
  readonly id?: string;
  readonly threadId?: string;
  readonly internalDate?: string;
  readonly snippet?: string;
  readonly labelIds?: readonly string[];
  readonly payload?: {
    readonly headers?: readonly GmailHeader[];
  };
}

export function mapGmailMetadata(message: GmailMessageResource): RawMailMetadata {
  const headers = message.payload?.headers ?? [];
  const fromAddress = headerValue(headers, "From") ?? "";
  return {
    gmailMessageId: message.id ?? "",
    threadId: message.threadId ?? "",
    receivedAt: new Date(Number(message.internalDate ?? "0")),
    fromAddress,
    subject: headerValue(headers, "Subject") ?? "",
    snippet: message.snippet ?? null,
    labelIds: message.labelIds ?? [],
  };
}

function headerValue(
  headers: readonly GmailHeader[],
  name: string,
): string | undefined {
  const found = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value;
}
