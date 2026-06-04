import { useState } from "react";
import type { UserPreferences } from "../api.js";

export interface PreferencesFormProps {
  readonly initial: UserPreferences;
  readonly onSave: (prefs: Partial<UserPreferences>) => Promise<void>;
}

export function PreferencesForm({ initial, onSave }: PreferencesFormProps) {
  const [digestTime, setDigestTime] = useState(initial.digestTime);
  const [digestDay, setDigestDay] = useState(initial.digestDay);
  const [deliveryPreference, setDeliveryPreference] = useState(
    initial.deliveryPreference,
  );
  const [saved, setSaved] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ digestTime, digestDay, deliveryPreference }).then(() =>
          setSaved(true),
        );
      }}
    >
      <label>
        Digest day
        <select
          value={digestDay}
          onChange={(e) => setDigestDay(Number(e.target.value))}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Digest time
        <input
          type="time"
          value={digestTime}
          onChange={(e) => setDigestTime(e.target.value)}
        />
      </label>
      <label>
        Delivery
        <select
          value={deliveryPreference}
          onChange={(e) =>
            setDeliveryPreference(e.target.value as "email" | "sms")
          }
        >
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
      </label>
      <button type="submit">Save preferences</button>
      {saved ? <p>Saved</p> : null}
    </form>
  );
}
