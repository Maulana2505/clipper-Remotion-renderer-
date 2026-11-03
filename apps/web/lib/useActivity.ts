"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface ActivityItem {
  id: string;
  kind: string;
  ref_id: string;
  label: string;
  stage: string;
  progress: number;
  status: string;
  href: string | null;
}

interface ActivityResponse {
  busy: boolean;
  items: ActivityItem[];
  updated_at: string;
}

const DEFAULT_INTERVAL = 1500;

export function useActivity(intervalMs: number = DEFAULT_INTERVAL) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);

  const fetchOnce = useCallback(async () => {
    try {
      const data = await api<ActivityResponse>("/api/activity");
      if (!activeRef.current) return;
      setItems(data.items || []);
      setBusy(!!data.busy);
      setError(null);
    } catch (err) {
      if (!activeRef.current) return;
      setError(err instanceof Error ? err.message : "Activity poll failed");
      // keep last items
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;

    const schedule = () => {
      if (!activeRef.current) return;
      timerRef.current = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, intervalMs);
    };

    fetchOnce().then(schedule);

    const onVisibility = () => {
      if (document.hidden) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else {
        fetchOnce();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, fetchOnce]);

  return { items, busy, error, refresh: fetchOnce };
}