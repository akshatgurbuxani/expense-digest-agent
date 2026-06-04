/** Format anomaly detail for SMS — passthrough only, no computed amounts. */
export function renderAnomalySms(detail: string): string {
  return `Expense Digest Alert\n\n${detail}`;
}
