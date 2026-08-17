import { invokeCommand } from "../../lib/tauri";
import type { DetectedTools } from "./types";

export function detectTools() {
  return invokeCommand<DetectedTools>("detect_tools");
}
