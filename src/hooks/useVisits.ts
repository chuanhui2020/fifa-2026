"use client";

import { useEffect, useState } from "react";

const VID_KEY = "fifa_vid";

/** 取或生成持久化访客 id(localStorage);用于服务端按人去重。 */
function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

interface VisitsState {
  today: number | null;
  total: number | null;
  loading: boolean;
}

/** 挂载时上报一次访问并取回 { today, total }。失败静默(不展示)。 */
export function useVisits(): VisitsState {
  const [state, setState] = useState<VisitsState>({ today: null, total: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitorId: getVisitorId() }),
        });
        if (!resp.ok) throw new Error(String(resp.status));
        const data = (await resp.json()) as { today?: number; total?: number };
        if (!cancelled) setState({ today: data.today ?? 0, total: data.total ?? 0, loading: false });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
