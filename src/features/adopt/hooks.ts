import { useCallback, useState } from "react";

import { adoptSkills, scanAdoptCandidates } from "./api";
import type { AdoptResult, AdoptScanResult, AdoptSelection } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

let cachedScan: AdoptScanResult | undefined;
let scanPromise: Promise<AdoptScanResult> | undefined;

function loadScan(force = false) {
  if (!force && cachedScan) return Promise.resolve(cachedScan);
  if (scanPromise) return scanPromise;
  scanPromise = scanAdoptCandidates()
    .then((result) => {
      cachedScan = result;
      return result;
    })
    .finally(() => {
      scanPromise = undefined;
    });
  return scanPromise;
}

export function useAdoptScan() {
  const [scan, setScan] = useState<AdoptScanResult | undefined>(() => cachedScan);
  const [error, setError] = useState<string>();
  const [scanning, setScanning] = useState(false);

  const runScan = useCallback(async (force = true) => {
    setScanning(true);
    setError(undefined);
    try {
      const result = await loadScan(force);
      setScan(result);
      return result;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setScanning(false);
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
