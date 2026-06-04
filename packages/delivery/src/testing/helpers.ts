export function resendIntegrationEnabled(): boolean {
  return (process.env.RESEND_API_KEY ?? "").length > 0;
}

export function twilioIntegrationEnabled(): boolean {
  return (
    (process.env.TWILIO_ACCOUNT_SID ?? "").length > 0 &&
    (process.env.TWILIO_AUTH_TOKEN ?? "").length > 0 &&
    (process.env.TWILIO_FROM_NUMBER ?? "").length > 0
  );
}

export function resendTestConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY!,
    from: process.env.DIGEST_FROM_EMAIL ?? "onboarding@resend.dev",
  };
}

export function twilioTestConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    fromNumber: process.env.TWILIO_FROM_NUMBER!,
  };
}

/** Verified recipient for live Twilio sends — set in .env for sandbox tests. */
export function twilioTestRecipient(): string | undefined {
  return process.env.TWILIO_TEST_TO;
}
