/** Extract domain from a RFC5322 From header value. */
export function extractDomainFromAddress(fromAddress: string): string {
  const match = fromAddress.match(/@([\w.-]+)/);
  return match?.[1]?.toLowerCase() ?? "";
}
