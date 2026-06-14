import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncStore } from "@/lib/sync";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Run an async loader on mount and whenever a dependency changes. Exposes
 * `reload()` to re-run on demand (e.g. after a create/update/delete).
 *
 * Also re-runs whenever the global sync revision bumps (another PC made a change
 * or a client reconnected to the host). Those background refreshes keep the
 * previous data on screen instead of flashing a loading state, so live updates
 * are seamless; only the first load and explicit reloads show `loading`.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: ReadonlyArray<unknown> = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const rev = useSyncStore((s) => s.rev);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  // Track what triggered each run so a background (rev-only) refresh does not
  // flip `loading` and flash a skeleton over already-rendered data.
  const lastTrigger = useRef({ run, tick, rev });

  useEffect(() => {
    let active = true;
    const prev = lastTrigger.current;
    const backgroundRefresh = prev.run === run && prev.tick === tick && prev.rev !== rev;
    lastTrigger.current = { run, tick, rev };

    if (!backgroundRefresh) setLoading(true);
    setError(null);
    run()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [run, tick, rev]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, reload };
}
