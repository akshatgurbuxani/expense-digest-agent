import { useCallback, useState } from "react";
import type { ApiClient } from "../api.js";

export interface ConnectBankButtonProps {
  readonly api: Pick<ApiClient, "createPlaidLinkToken" | "exchangePlaidPublicToken">;
  readonly onLinked?: (itemId: string) => void;
  readonly usePlaidLink?: (opts: {
    token: string | null;
    onSuccess: (publicToken: string) => void;
  }) => { open: () => void; ready: boolean };
}

export function ConnectBankButton({
  api,
  onLinked,
  usePlaidLink,
}: ConnectBankButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setStatus("Linking account…");
      const result = await api.exchangePlaidPublicToken(publicToken);
      setStatus("Bank connected");
      onLinked?.(result.itemId);
    },
    [api, onLinked],
  );

  const plaid = usePlaidLink?.({ token: linkToken, onSuccess }) ?? {
    open: () => {},
    ready: false,
  };

  const handleClick = async () => {
    setStatus("Preparing Plaid Link…");
    const { linkToken: token } = await api.createPlaidLinkToken();
    setLinkToken(token);
    if (usePlaidLink) {
      // token state update triggers ready on next render — tests inject mock
      setTimeout(() => plaid.open(), 0);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => void handleClick()}>
        Connect bank account
      </button>
      {status ? <p aria-live="polite">{status}</p> : null}
    </div>
  );
}
