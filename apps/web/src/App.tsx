import { useEffect, useMemo, useState } from "react";
import { createApiClient, type DigestSummary, type SetupStatus, type UserPreferences } from "./api.js";
import { SetupGate } from "./components/SetupGate.js";
import { PreferencesForm } from "./components/PreferencesForm.js";
import { DigestHistoryList } from "./components/DigestHistoryList.js";

const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const authToken = import.meta.env.VITE_AUTH_TOKEN ?? "";

export function App() {
  const api = useMemo(
    () => (authToken ? createApiClient(apiBase, authToken) : null),
    [],
  );
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [digests, setDigests] = useState<DigestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshAccountData = async () => {
    if (!api) return;
    const next = await api.getSetupStatus();
    setSetup(next);
    if (next.complete) {
      setPrefs(await api.getPreferences());
      setDigests(await api.getDigests());
    }
  };

  useEffect(() => {
    if (!api) {
      setError("Set VITE_AUTH_TOKEN to connect to the API.");
      return;
    }
    void (async () => {
      try {
        await refreshAccountData();
      } catch (err) {
        setError(String(err));
      }
    })();
  }, [api]);

  if (error) {
    return <main><p>{error}</p></main>;
  }

  if (!api || !setup) {
    return <main><p>Loading…</p></main>;
  }

  return (
    <main>
      <h1>Expense Digest</h1>
      <SetupGate
        status={setup}
        api={api}
        onSetupChange={() => void refreshAccountData()}
      >
        {prefs ? (
          <>
            <section>
              <h2>Preferences</h2>
              <PreferencesForm
                initial={prefs}
                onSave={async (next) => {
                  const updated = await api.updatePreferences(next);
                  setPrefs(updated);
                }}
              />
            </section>
            <section>
              <h2>Digest history</h2>
              <DigestHistoryList digests={digests} />
            </section>
          </>
        ) : (
          <p>Loading account…</p>
        )}
      </SetupGate>
    </main>
  );
}
