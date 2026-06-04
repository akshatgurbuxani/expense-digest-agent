export interface UserPreferences {
  timezone: string;
  digestDay: number;
  digestTime: string;
  deliveryPreference: "email" | "sms";
}

export interface SetupStatus {
  bank: {
    connected: boolean;
    itemCount: number;
  };
  gmail: {
    connected: boolean;
    gmailAddress: string | null;
    needsReauth: boolean;
  };
  complete: boolean;
}

export interface DigestSummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  subject: string;
  totalSpend: string;
  deliveredAt: string | null;
}

export interface ApiClient {
  getSetupStatus(): Promise<SetupStatus>;
  getPreferences(): Promise<UserPreferences>;
  updatePreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences>;
  getDigests(limit?: number): Promise<DigestSummary[]>;
  createPlaidLinkToken(): Promise<{ linkToken: string; expiration: string }>;
  exchangePlaidPublicToken(publicToken: string): Promise<{ itemId: string }>;
  getGmailAuthorizeUrl(returnTo?: string): Promise<{ url: string }>;
}

export function createApiClient(baseUrl: string, token: string): ApiClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    getSetupStatus: () => request<SetupStatus>("/api/setup/status"),
    getPreferences: () => request<UserPreferences>("/api/preferences"),
    updatePreferences: (prefs) =>
      request<UserPreferences>("/api/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      }),
    getDigests: (limit = 10) =>
      request<DigestSummary[]>(`/api/digests?limit=${limit}`),
    createPlaidLinkToken: () =>
      request<{ linkToken: string; expiration: string }>(
        "/api/plaid/link-token",
        { method: "POST", body: "{}" },
      ),
    exchangePlaidPublicToken: (publicToken) =>
      request<{ itemId: string }>("/api/plaid/exchange", {
        method: "POST",
        body: JSON.stringify({ publicToken }),
      }),
    getGmailAuthorizeUrl: (returnTo) => {
      const query = returnTo
        ? `?returnTo=${encodeURIComponent(returnTo)}`
        : "";
      return request<{ url: string }>(`/api/gmail/authorize${query}`);
    },
  };
}
