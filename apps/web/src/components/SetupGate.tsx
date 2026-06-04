import type { ComponentProps, ReactNode } from "react";
import type { ApiClient, SetupStatus } from "../api.js";
import { ConnectBankButton } from "./ConnectBankButton.js";
import { ConnectGmailButton } from "./ConnectGmailButton.js";

export interface SetupGateProps {
  readonly status: SetupStatus;
  readonly api: Pick<
    ApiClient,
    "createPlaidLinkToken" | "exchangePlaidPublicToken" | "getGmailAuthorizeUrl"
  >;
  readonly onSetupChange: () => void | Promise<void>;
  readonly children: ReactNode;
  readonly usePlaidLink?: ComponentProps<typeof ConnectBankButton>["usePlaidLink"];
}

export function SetupGate({
  status,
  api,
  onSetupChange,
  children,
  usePlaidLink,
}: SetupGateProps) {
  if (status.complete) {
    return <>{children}</>;
  }

  return (
    <section aria-label="Setup">
      <h2>Get started</h2>
      <p>
        Connect your bank and Gmail to receive spending digests with order
        context from receipt emails.
      </p>
      <ol>
        <li>
          {status.bank.connected ? (
            <p>Bank connected</p>
          ) : (
            <ConnectBankButton
              api={api}
              usePlaidLink={usePlaidLink}
              onLinked={() => void onSetupChange()}
            />
          )}
        </li>
        <li>
          <ConnectGmailButton
            api={api}
            connected={status.gmail.connected}
            gmailAddress={status.gmail.gmailAddress}
            needsReauth={status.gmail.needsReauth}
          />
        </li>
      </ol>
    </section>
  );
}
