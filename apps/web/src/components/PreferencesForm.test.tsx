// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreferencesForm } from "./PreferencesForm.js";

describe("PreferencesForm", () => {
  it("calls onSave with edited values", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PreferencesForm
        initial={{
          timezone: "UTC",
          digestDay: 0,
          digestTime: "08:00",
          deliveryPreference: "email",
        }}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText(/delivery/i), {
      target: { value: "sms" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryPreference: "sms" }),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});
