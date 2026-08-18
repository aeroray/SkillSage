const windowsExtendedPrefix = "\\\\?\\";
const windowsExtendedUncPrefix = "\\\\?\\UNC\\";

/**
 * Windows may return extended-length paths from canonicalize(). They are
 * useful for filesystem operations but should not leak into the desktop UI.
 */
export function displayPath(value: string) {
  if (value.startsWith(windowsExtendedUncPrefix)) {
    return `\\\\${value.slice(windowsExtendedUncPrefix.length)}`;
  }
  if (value.startsWith(windowsExtendedPrefix)) {
    return value.slice(windowsExtendedPrefix.length);
  }
  return value;
}
