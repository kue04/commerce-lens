import { useEffect, useState } from "react";
import type { AnalysisApi, DatasetProfile } from "./types";

export function useDatasetProfile(api: AnalysisApi, version: string | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    version?: string; data: DatasetProfile | null; error: string | null; loading: boolean;
  }>({ data: null, error: null, loading: false });
  useEffect(() => {
    if (!version) return;
    const controller = new AbortController();
    let active = true;
    setState({ version, data: null, error: null, loading: true });
    void api.profile(version, controller.signal).then(
      (data) => { if (active) setState({ version, data, error: null, loading: false }); },
      (error: Error) => { if (active) setState({ version, data: null, error: error.message, loading: false }); },
    );
    return () => { active = false; controller.abort(); };
  }, [api, version, attempt]);
  const current = Boolean(version && state.version === version);
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: Boolean(version && (!current || state.loading)),
    retry: () => setAttempt((value) => value + 1),
  };
}
