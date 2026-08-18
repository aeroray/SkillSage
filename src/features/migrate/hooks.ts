import { useCallback, useState } from "react";

import { executeMigrate, removeMigrateLink, scanMigrate } from "./api";
import type {
  MigrateResult,
  MigrateScanResult,
  MigrateSelection,
} from "./types";
import { normalizeTauriError } from "../../lib/tauri";

let cachedMigrationScan: MigrateScanResult | undefined;
let migrationScanPromise: Promise<MigrateScanResult> | undefined;

function loadMigrationScan(force = false) {
  if (!force && cachedMigrationScan) {
    return Promise.resolve(cachedMigrationScan);
  }
  if (migrationScanPromise) return migrationScanPromise;
  migrationScanPromise = scanMigrate()
    .then((result) => {
      cachedMigrationScan = result;
      return result;
    })
    .finally(() => {
      migrationScanPromise = undefined;
    });
  return migrationScanPromise;
}

export function useMigration() {
  const [scan, setScan] = useState<MigrateScanResult | undefined>(
    () => cachedMigrationScan,
  );
  const [error, setError] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const runScan = useCallback(async (force = true) => {
    if (!force && cachedMigrationScan) {
      setError(undefined);
      setScan(cachedMigrationScan);
      return cachedMigrationScan;
    }
    setScanning(true);
    setError(undefined);
    try {
      const result = await loadMigrationScan(force);
      setScan(result);
      return result;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setScanning(false);
    }
  }, []);

  const execute = useCallback(
    async (items: MigrateSelection[]): Promise<MigrateResult | undefined> => {
      setExecuting(true);
      setError(undefined);
      try {
        return await executeMigrate(items);
      } catch (reason) {
        setError(normalizeTauriError(reason));
        return undefined;
      } finally {
        setExecuting(false);
      }
    },
    [],
  );

  const removeLink = useCallback(
    async (sourcePath: string): Promise<true | string> => {
      setRemoving(true);
      setError(undefined);
      try {
        await removeMigrateLink(sourcePath);
        await runScan();
        return true;
      } catch (reason) {
        return normalizeTauriError(reason);
      } finally {
        setRemoving(false);
      }
    },
    [runScan],
  );

  return {
    error,
    execute,
    executing,
    removeLink,
    removing,
    runScan,
    scan,
    scanning,
    setScan,
  };
}
