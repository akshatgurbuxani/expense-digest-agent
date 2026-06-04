import { useCallback, useState } from "react";
import type { ApiClient } from "../api.js";

export interface ConnectGmailButtonProps {
  readonly api: Pick<ApiClient, "getGmailAuthorizeUrl">;
  readonly connected?: boolean;
  readonly gmailAddress?: string | null;
  readonly needsReauth?: boolean;
  readonly onConnecting?: () => void;
}

export function ConnectGmailButton({
  api,
  connected = false,
  gmailAddress = null,
  needsReauth = false,
  onConnecting,
}: ConnectGmailButtonProps) {
  const [status, setStatus] = useState("");

  const handleClick = useCallback(async () => {
    setStatus("Redirecting to Google…");
    onConnecting?.();
    const { url } = await api.getGmailAuthorizeUrl(window.location.origin);
    window.location.assign(url);
  }, [api, onConnecting]);

  if (connected && gmailAddress && !needsReauth) {
    return <p>Gmail connected ({gmailAddress})</p>;
  }

  return (
    <div>
      <button type="button" onClick={() => void handleClick()}>
        {needsReauth ? "Reconnect Gmail" : "Connect Gmail"}
      </button>
      {status ? <p aria-live="polite">{status}</p> : null}
    </div>
  );
}
