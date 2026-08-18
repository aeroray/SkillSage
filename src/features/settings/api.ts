import { invokeCommand } from "../../lib/tauri";
import type { Settings, SettingsUpdate } from "./types";

export function getSettings() {
  return invokeCommand<Settings>("get_settings");
}

export function setSettings(update: SettingsUpdate) {
  return invokeCommand<Settings>("set_settings", { update });
}
