"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { usePlatformToken } from "@/hooks/use-envelope-api";

/** Logged-in users sign inside the workspace; public /sign is for people who are not on the app. */
export function PreferWorkspaceSigning({ token }: { token: string }) {
  const { getAccessToken, loading } = usePlatformToken();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void getAccessToken()
      .then((access) => {
        if (!cancelled && access) {
          router.replace(`/inbox/sign/${encodeURIComponent(token)}`);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, loading, router, token]);

  return null;
}
