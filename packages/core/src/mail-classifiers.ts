import { normalizeMerchant } from "./merchant.js";
import type { ReceiptKind } from "./domain/receipt-kind.js";

export interface MailClassificationInput {
  readonly fromAddress: string;
  readonly fromDomain: string;
  readonly subject: string;
  readonly snippet: string | null;
}

export type MailClassificationResult =
  | { readonly outcome: "ignore"; readonly reason: string }
  | { readonly outcome: "classify"; readonly kind: ReceiptKind };

export interface MailClassifier {
  readonly name: string;
  classify(input: MailClassificationInput): MailClassificationResult | null;
}

export interface MailClassifierConfig {
  readonly blockBankCardAlerts: boolean;
}

const BANK_ALERT_FROM = [
  "alerts@chase.com",
  "notification.americanexpress.com",
  "email.americanexpress.com",
  "alert@bankofamerica.com",
  "notifications@capitalone.com",
  "service@citi.com",
];

const BANK_ALERT_SUBJECT = [
  /transaction (alert|notification)/i,
  /purchase (alert|notification)/i,
  /card (ending|activity)/i,
  /was (charged|used)/i,
  /payment (received|posted)/i,
];

const MARKETING_SUBJECT = [
  /\d+%\s+off/i,
  /unsubscribe/i,
  /limited time/i,
  /don't miss/i,
  /sale ends/i,
  /exclusive offer/i,
];

const MARKETING_FROM = [/newsletter@/i, /marketing@/i, /promo@/i, /no-reply@email\./i];

interface DomainRule {
  readonly domains: readonly string[];
  readonly kind: ReceiptKind;
  readonly subject?: RegExp;
}

const DOMAIN_RULES: readonly DomainRule[] = [
  {
    domains: ["amazon.com", "amazon.co.uk"],
    kind: "order_confirmation",
    subject: /(order|shipment|delivered)/i,
  },
  {
    domains: ["doordash.com", "ubereats.com", "grubhub.com"],
    kind: "food_delivery",
  },
  { domains: ["uber.com"], kind: "rideshare", subject: /(trip|ride)/i },
  { domains: ["lyft.com"], kind: "rideshare" },
  {
    domains: ["netflix.com", "spotify.com", "apple.com"],
    kind: "subscription_renewal",
    subject: /(renew|subscription|receipt)/i,
  },
  {
    domains: ["delta.com", "united.com", "airbnb.com", "booking.com"],
    kind: "travel_booking",
  },
  {
    domains: ["ticketmaster.com", "eventbrite.com"],
    kind: "event_ticket",
  },
  {
    domains: ["paypal.com", "venmo.com", "cash.app"],
    kind: "marketplace_payment",
  },
  {
    domains: ["fedex.com", "ups.com", "usps.com"],
    kind: "shipping_update",
  },
];

export function makeBlocklistBankAlertClassifier(
  config: MailClassifierConfig,
): MailClassifier {
  return {
    name: "blocklist-bank-alert",
    classify(input) {
      if (!config.blockBankCardAlerts) return null;
      const from = input.fromAddress.toLowerCase();
      const domain = input.fromDomain.toLowerCase();
      if (
        BANK_ALERT_FROM.some(
          (p) => from.includes(p) || domain.includes(p.split("@").pop() ?? p),
        )
      ) {
        return {
          outcome: "ignore",
          reason: "bank_card_alert_from",
        };
      }
      const haystack = `${input.subject} ${input.snippet ?? ""}`;
      if (BANK_ALERT_SUBJECT.some((re) => re.test(haystack))) {
        return {
          outcome: "classify",
          kind: "bank_card_alert",
        };
      }
      return null;
    },
  };
}

export function makeBlocklistMarketingClassifier(): MailClassifier {
  return {
    name: "blocklist-marketing",
    classify(input) {
      const from = input.fromAddress.toLowerCase();
      if (MARKETING_FROM.some((re) => re.test(from))) {
        return { outcome: "ignore", reason: "marketing_sender" };
      }
      const haystack = `${input.subject} ${input.snippet ?? ""}`;
      if (MARKETING_SUBJECT.some((re) => re.test(haystack))) {
        return { outcome: "classify", kind: "marketing" };
      }
      return null;
    },
  };
}

export function makeDomainRulesClassifier(): MailClassifier {
  return {
    name: "domain-rules",
    classify(input) {
      const domain = input.fromDomain.toLowerCase();
      for (const rule of DOMAIN_RULES) {
        if (!rule.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
          continue;
        }
        if (rule.subject && !rule.subject.test(input.subject)) {
          continue;
        }
        return { outcome: "classify", kind: rule.kind };
      }
      return null;
    },
  };
}

export function makeMailClassifiers(
  config: MailClassifierConfig,
): readonly MailClassifier[] {
  return [
    makeBlocklistBankAlertClassifier(config),
    makeBlocklistMarketingClassifier(),
    makeDomainRulesClassifier(),
  ];
}

/** Run classifiers in order; first decisive result wins. Default kind is unknown. */
export function classifyMail(
  input: MailClassificationInput,
  classifiers: readonly MailClassifier[],
): MailClassificationResult {
  for (const classifier of classifiers) {
    const result = classifier.classify(input);
    if (result !== null) return result;
  }
  return { outcome: "classify", kind: "unknown" };
}

/** Extract domain from a From address like "Name <orders@amazon.com>". */
export function parseFromDomain(fromAddress: string): string {
  const match = fromAddress.match(/@([\w.-]+)/);
  return match?.[1]?.toLowerCase() ?? "";
}

/** Normalize classification input from raw mail metadata fields. */
export function toClassificationInput(fields: {
  fromAddress: string;
  subject: string;
  snippet: string | null;
}): MailClassificationInput {
  const fromDomain = parseFromDomain(fields.fromAddress);
  return {
    fromAddress: fields.fromAddress,
    fromDomain,
    subject: fields.subject,
    snippet: fields.snippet,
  };
}

/** Quick merchant hint from classified mail — used before full parse. */
export function merchantHintFromMail(input: MailClassificationInput): string {
  const domain = input.fromDomain.replace(/^mail\./, "");
  const base = domain.split(".")[0] ?? domain;
  return normalizeMerchant(base);
}
