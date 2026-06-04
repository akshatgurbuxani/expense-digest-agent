// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectBankButton } from "./ConnectBankButton.js";

describe("ConnectBankButton", () => {
  it("fetches a link token and exchanges the public token", async () => {
    const api = {
      createPlaidLinkToken: vi.fn().mockResolvedValue({
        linkToken: "link-sandbox",
        expiration: new Date().toISOString(),
      }),
      exchangePlaidPublicToken: vi
        .fn()
        .mockResolvedValue({ itemId: "item_123" }),
    };
    const onLinked = vi.fn();
    const usePlaidLink = vi.fn(
      ({ onSuccess }: { onSuccess: (token: string) => void }) => ({
        open: () => {
          void onSuccess("public-sandbox");
        },
        ready: true,
      }),
    );

    render(
      <ConnectBankButton
        api={api}
        onLinked={onLinked}
        usePlaidLink={usePlaidLink}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect bank/i }));

    expect(api.createPlaidLinkToken).toHaveBeenCalled();
    expect(await screen.findByText(/bank connected/i)).toBeInTheDocument();
    expect(onLinked).toHaveBeenCalledWith("item_123");
  });
});
