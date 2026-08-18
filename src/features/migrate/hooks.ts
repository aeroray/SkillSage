import { useCallback, useState } from "react";

import { executeMigrate, removeMigrateLink, scanMigrate } from "./api";
import type { MigrateResult, MigrateScanResult, MigrateSelection } from "./types";
import { normalizeTauriError } from "../../lib/tauri";

export function useMigration() {
  const [scan, setScan] = useState<MigrateScanResult>();
  const [error, setError] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(undefined);
    try {
      const result = await scanMigrate();
      setScan(result);
      return result;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return undefined;
    } finally {
      setScanning(false);
    }
  }, []);

  const execute = useCallback(async (items: MigrateSelection[]): Promise<MigrateResult | undefined> => {
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
  }, []);

  const removeLink = useCallback(async (sourcePath: string) => {
    setRemoving(true);
    setError(undefined);
    try {
      await removeMigrateLink(sourcePath);
      await runScan();
      return true;
    } catch (reason) {
      setError(normalizeTauriError(reason));
      return false;
    } finally {
      setRemoving(false);
    }
  }, [runScan]);

  return { error, execute, executing, removeLink, removing, runScan, scan, scanning, setScan };
}
