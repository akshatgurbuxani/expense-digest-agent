import type { Category } from "../domain/category.js";
import type { Money } from "../money.js";
import type { MerchantEnrichment } from "../ports/llm-provider.js";
import type { LlmProvider } from "../ports/llm-provider.js";
import type { MerchantCategoryRepository } from "../ports/repositories.js";
import { normalizeMerchant } from "../merchant.js";

export interface CategoryResolver {
  readonly name: string;
  resolve(ctx: ResolveContext): Promise<MerchantEnrichment | null>;
}

export interface ResolveContext {
  readonly rawName: string;
  readonly plaidPfc: string | null;
  readonly amount: Money;
  readonly merchants: MerchantCategoryRepository;
  readonly llm: LlmProvider;
}

const FALLBACK: MerchantEnrichment = {
  merchantName: "Unknown Merchant",
  category: "other",
  signals: { isSubscription: false, isRecurring: false, confidence: 0.5 },
};

/** Maps Plaid PFC primary strings to our closed category enum. */
export function mapPfcToCategory(pfc: string): Category | null {
  const u = pfc.toUpperCase();
  if (u.includes("GROCER")) return "groceries";
  if (u.includes("RESTAUR") || u.includes("FOOD_AND_DRINK")) return "dining";
  if (u.includes("TRANSPORT") || u.includes("TAXI") || u.includes("GAS"))
    return "transport";
  if (u.includes("SUBSCRIPTION") || u.includes("STREAMING")) return "subscriptions";
  if (u.includes("SHOP") || u.includes("MERCHANDISE")) return "shopping";
  if (u.includes("UTILIT") || u.includes("PHONE")) return "utilities";
  if (u.includes("RENT") || u.includes("MORTGAGE")) return "housing";
  if (u.includes("MEDICAL") || u.includes("HEALTH")) return "health";
  if (u.includes("ENTERTAIN")) return "entertainment";
  if (u.includes("TRAVEL") || u.includes("AIRLINE")) return "travel";
  if (u.includes("INCOME") || u.includes("PAYROLL")) return "income";
  if (u.includes("TRANSFER")) return "transfer";
  if (u.includes("FEE") || u.includes("INTEREST")) return "fees";
  return null;
}

export const plaidPfcResolver: CategoryResolver = {
  name: "plaid-pfc",
  async resolve(ctx) {
    if (!ctx.plaidPfc) return null;
    const category = mapPfcToCategory(ctx.plaidPfc);
    if (!category) return null;
    return {
      merchantName: ctx.rawName,
      category,
      signals: { isSubscription: false, isRecurring: false, confidence: 0.85 },
    };
  },
};

export function makeMerchantCacheResolver(): CategoryResolver {
  return {
    name: "merchant-cache",
    async resolve(ctx) {
      const key = normalizeMerchant(ctx.rawName);
      const hit = await ctx.merchants.lookup(key);
      if (!hit) return null;
      return {
        merchantName: hit.merchantName,
        category: hit.category,
        signals: hit.signals,
      };
    },
  };
}

export function makeLlmResolver(): CategoryResolver {
  return {
    name: "llm",
    async resolve(ctx) {
      const result = await ctx.llm.categorizeMerchant({
        rawName: ctx.rawName,
        plaidPfc: ctx.plaidPfc,
        amountHint: ctx.amount.toDisplayString(),
      });
      const key = normalizeMerchant(ctx.rawName);
      await ctx.merchants.upsert({
        normalizedMerchant: key,
        merchantName: result.merchantName,
        category: result.category,
        signals: result.signals,
        source: "llm",
      });
      return result;
    },
  };
}

export function makeResolverChain(): CategoryResolver[] {
  return [plaidPfcResolver, makeMerchantCacheResolver(), makeLlmResolver()];
}

export async function resolveCategory(
  chain: CategoryResolver[],
  ctx: ResolveContext,
): Promise<MerchantEnrichment> {
  for (const resolver of chain) {
    const hit = await resolver.resolve(ctx);
    if (hit) return hit;
  }
  return { ...FALLBACK, merchantName: ctx.rawName || FALLBACK.merchantName };
}
