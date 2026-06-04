import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type Anthropic from "@anthropic-ai/sdk";
import { ValidationError } from "@expense/core";
import type { z } from "zod";
import { validationErrorFromZod } from "./errors.js";

export function extractText(content: Message["content"]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const raw = fenced ? fenced[1]!.trim() : trimmed;
  return JSON.parse(raw);
}

export function parseModelJson<T>(
  message: Message,
  schema: z.ZodType<T>,
  label: string,
): T {
  const text = extractText(message.content);
  if (!text) {
    throw new ValidationError(`claude returned empty ${label} response`);
  }

  let raw: unknown;
  try {
    raw = parseJsonText(text);
  } catch (err) {
    throw new ValidationError(`claude ${label} response is not valid JSON`, err);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw validationErrorFromZod(`invalid claude ${label} response`, parsed.error);
  }
  return parsed.data;
}
