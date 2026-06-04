// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SetupGate } from "./SetupGate.js";

describe("SetupGate", () => {
  const api = {
    createPlaidLinkToken: vi.fn(),
    exchangePlaidPublicToken: vi.fn(),
    getGmailAuthorizeUrl: vi.fn(),
  };

  it("shows onboarding steps until setup is complete", () => {
    render(
      <SetupGate
        status={{
          bank: { connected: false, itemCount: 0 },
          gmail: { connected: false, gmailAddress: null, needsReauth: false },
          complete: false,
        }}
        api={api}
        onSetupChange={vi.fn()}
      >
        <p>Dashboard</p>
      </SetupGate>,
    );

    expect(screen.getByRole("heading", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect bank/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect gmail/i })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("renders children when bank and Gmail are connected", () => {
    render(
      <SetupGate
        status={{
          bank: { connected: true, itemCount: 1 },
          gmail: {
            connected: true,
            gmailAddress: "user@gmail.com",
            needsReauth: false,
          },
          complete: true,
        }}
        api={api}
        onSetupChange={vi.fn()}
      >
        <p>Dashboard</p>
      </SetupGate>,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /get started/i })).not.toBeInTheDocument();
  });
});
