import { useCallback, useRef, useState } from "react";

import { adoptSkills, scanAdoptCandidates } from "./api";
import type { AdoptResult, AdoptScanResult, AdoptSelection } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

let cachedScan: AdoptScanResult | undefined;
let scanPromise: Promise<AdoptScanResult> | undefined;
/** Bumped for every forced rescan, so a response from an older scan can be
 * recognized as superseded and kept out of the cache. */
let scanGeneration = 0;

function loadScan(force = false) {
  if (!force) {
    if (cachedScan) return Promise.resolve(cachedScan);
    // Coalesce concurrent non-forced callers onto the request already running.
    if (scanPromise) return scanPromise;
  }
  const generation = ++scanGeneration;
  const request = scanAdoptCandidates()
    .then((result) => {
      // A newer scan may have started while this one was in flight; caching
      // then would overwrite fresher data with stale data.
      if (generation === scanGeneration) cachedScan = result;
      return result;
    })
    .finally(() => {
      if (scanPromise === request) scanPromise = undefined;
    });
  scanPromise = request;
  return request;
}

export function useAdoptScan() {
  const [scan, setScan] = useState<AdoptScanResult | undefined>(() => cachedScan);
  const [error, setError] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const requestId = useRef(0);

  const runScan = useCallback(async (force = true) => {
    const currentRequest = ++requestId.current;
    setScanning(true);
    setError(undefined);
    try {
      const result = await loadScan(force);
      // Ignore an out-of-order response from an earlier scan.
      if (currentRequest === requestId.current) setScan(result);
      return result;
    } catch (reason) {
      if (currentRequest === requestId.current)
        setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      if (currentRequest === requestId.current) setScanning(false);
    }
  }, []);

  return { error, runScan, scan, scanning };
}

export function useAdoptExecute(onCompleted: () => void) {
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string>();

  const execute = useCallback(
    async (items: AdoptSelection[]): Promise<AdoptResult | undefined> => {
      setExecuting(true);
      setError(undefined);
      try {
        const result = await adoptSkills(items);
        onCompleted();
        return result;
      } catch (reason) {
        setError(normalizeTauriError(reason));
        return undefined;
      } finally {
        setExecuting(false);
      }
    },
    [onCompleted],
  );

  return { error, execute, executing };
}
