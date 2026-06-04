// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DigestHistoryList } from "./DigestHistoryList.js";

describe("DigestHistoryList", () => {
  it("renders an empty state", () => {
    render(<DigestHistoryList digests={[]} />);
    expect(screen.getByText(/no digests yet/i)).toBeInTheDocument();
  });

  it("renders digests grouped by month", () => {
    render(
      <DigestHistoryList
        digests={[
          {
            id: "d1",
            weekStart: "2026-05-18T00:00:00.000Z",
            weekEnd: "2026-05-25T00:00:00.000Z",
            subject: "Your week in spending",
            totalSpend: "$45.00",
            deliveredAt: "2026-05-25T08:00:00.000Z",
          },
          {
            id: "d2",
            weekStart: "2026-05-11T00:00:00.000Z",
            weekEnd: "2026-05-18T00:00:00.000Z",
            subject: "Your week in spending",
            totalSpend: "$32.50",
            deliveredAt: "2026-05-18T08:00:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.getByText(/45\.00/)).toBeInTheDocument();
    expect(screen.getByText(/32\.50/)).toBeInTheDocument();
  });

  it("renders multiple month groups", () => {
    render(
      <DigestHistoryList
        digests={[
          {
            id: "d1",
            weekStart: "2026-05-18T00:00:00.000Z",
            weekEnd: "2026-05-25T00:00:00.000Z",
            subject: "Late May",
            totalSpend: "$45.00",
            deliveredAt: "2026-05-25T08:00:00.000Z",
          },
          {
            id: "d2",
            weekStart: "2026-04-06T00:00:00.000Z",
            weekEnd: "2026-04-13T00:00:00.000Z",
            subject: "Early April",
            totalSpend: "$20.00",
            deliveredAt: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.getByText("April 2026")).toBeInTheDocument();
    expect(screen.getByText(/pending/)).toBeInTheDocument();
  });
});
