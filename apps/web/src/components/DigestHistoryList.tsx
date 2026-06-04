import type { DigestSummary } from "../api.js";

export interface DigestHistoryListProps {
  readonly digests: DigestSummary[];
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function weekRange(weekStart: string, weekEnd: string, deliveredAt: string | null): string {
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const range = `${start.toLocaleDateString("en-US", fmt)} – ${end.toLocaleDateString("en-US", fmt)}`;
  return deliveredAt ? `${range} ✓` : `${range} (pending)`;
}

export function DigestHistoryList({ digests }: DigestHistoryListProps) {
  if (digests.length === 0) {
    return <p>No digests yet.</p>;
  }

  const byMonth = new Map<string, DigestSummary[]>();
  for (const d of digests) {
    const m = monthLabel(d.weekStart);
    const list = byMonth.get(m) ?? [];
    list.push(d);
    byMonth.set(m, list);
  }

  return (
    <div>
      {[...byMonth.entries()].map(([month, items]) => (
        <section key={month}>
          <h3>{month}</h3>
          <ul>
            {items.map((d) => (
              <li key={d.id}>
                <strong>{d.subject}</strong> — {d.totalSpend}
                {" "}
                <small>{weekRange(d.weekStart, d.weekEnd, d.deliveredAt)}</small>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
