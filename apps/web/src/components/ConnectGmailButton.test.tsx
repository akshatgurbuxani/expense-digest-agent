// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectGmailButton } from "./ConnectGmailButton.js";

describe("ConnectGmailButton", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { assign: vi.fn(), origin: "http://localhost:5173" });
  });

  it("requests an authorize URL and redirects the browser", async () => {
    const api = {
      getGmailAuthorizeUrl: vi.fn().mockResolvedValue({
        url: "https://accounts.google.test/oauth",
      }),
    };

    render(<ConnectGmailButton api={api} />);
    fireEvent.click(screen.getByRole("button", { name: /connect gmail/i }));

    expect(api.getGmailAuthorizeUrl).toHaveBeenCalledWith(
      "http://localhost:5173",
    );
    expect(await screen.findByText(/redirecting to google/i)).toBeInTheDocument();
    expect(window.location.assign).toHaveBeenCalledWith(
      "https://accounts.google.test/oauth",
    );
  });

  it("shows the connected address when Gmail is already linked", () => {
    render(
      <ConnectGmailButton
        api={{ getGmailAuthorizeUrl: vi.fn() }}
        connected
        gmailAddress="user@gmail.com"
      />,
    );

    expect(screen.getByText(/gmail connected \(user@gmail.com\)/i)).toBeInTheDocument();
  });
});
