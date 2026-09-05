import { useCallback, useEffect, useState } from "react";

export interface AccountProfile {
  id: string;
  name: string;
  avatar: string | null;
  accentColor: number | null;
  chips: number;
  stats: {
    games: number;
    wins: number;
    chipsWon: number;
    bestTurn: number;
    farkles: number;
    hotDice: number;
  };
}

export interface Account {
  profile: AccountProfile | null;
  /** False when the server has no Discord credentials configured. */
  available: boolean;
  loading: boolean;
  refresh: () => void;
  signOut: () => void;
  claimDaily: () => void;
  dailyMessage: string | null;
}

interface MeResponse {
  signedIn: boolean;
  signinAvailable: boolean;
  profile?: AccountProfile;
}

/** The signed-in profile, or nothing at all — guests play without one. */
export function useAccount(): Account {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dailyMessage, setDailyMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const response = await fetch("/api/me", { credentials: "include" });
        if (!response.ok) {
          setProfile(null);
          return;
        }
        const body = (await response.json()) as MeResponse;
        setAvailable(body.signinAvailable);
        setProfile(body.signedIn ? (body.profile ?? null) : null);
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(refresh, [refresh]);

  const signOut = useCallback(() => {
    void (async () => {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
      setProfile(null);
    })();
  }, []);

  const claimDaily = useCallback(() => {
    void (async () => {
      const response = await fetch("/api/daily", { method: "POST", credentials: "include" });
      const body = (await response.json()) as {
        ok: boolean;
        reason?: string;
        granted: number;
        chips: number;
      };
      if (body.ok) {
        setDailyMessage(`Topped up by ${body.granted.toLocaleString("en-US")}.`);
        setProfile((current) => (current === null ? current : { ...current, chips: body.chips }));
      } else if (body.reason === "not-needed") {
        setDailyMessage("You have plenty already.");
      } else {
        setDailyMessage("Already claimed today.");
      }
      setTimeout(() => setDailyMessage(null), 4000);
    })();
  }, []);

  return { profile, available, loading, refresh, signOut, claimDaily, dailyMessage };
}
