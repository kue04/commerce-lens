import { useEffect, useState } from "react";
import type { AnalysisApi, Overview, QuerySpec } from "./types";

export function useOverview(api: AnalysisApi, version: string | undefined, query: QuerySpec | null) {
  const [attempt, setAttempt] = useState(0);
  const key = version && query ? JSON.stringify([version, query, attempt]) : null;
  const [state, setState] = useState<{ key: string | null; data: Overview | null; error: string | null; loading: boolean }>({ key: null, data: null, error: null, loading: false });
  useEffect(() => {
    if (!key || !version || !query) return;
    const controller = new AbortController();
    let active = true;
    setState({ key, data: null, error: null, loading: true });
    void api.overview(version, query, controller.signal).then(
      (data) => { if (active) setState({ key, data, error: null, loading: false }); },
      (error: Error) => { if (active) setState({ key, data: null, error: error.message, loading: false }); },
    );
    return () => { active = false; controller.abort(); };
    // The serialized key includes the complete query and retry generation.
  }, [api, key]);
  const current = Boolean(key && state.key === key);
  return { data: current ? state.data : null, error: current ? state.error : null,
    loading: Boolean(key && (!current || state.loading)), retry: () => setAttempt((value) => value + 1) };
}
