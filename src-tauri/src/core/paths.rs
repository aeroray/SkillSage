use std::path::Path;

const WINDOWS_EXTENDED_PREFIX: &str = "\\\\?\\";
const WINDOWS_EXTENDED_UNC_PREFIX: &str = "\\\\?\\UNC\\";

/// Converts Windows extended-length paths to a readable form for UI and logs.
/// Filesystem operations should continue using the original Path value.
pub fn display(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(WINDOWS_EXTENDED_UNC_PREFIX) {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = value.strip_prefix(WINDOWS_EXTENDED_PREFIX) {
        return rest.to_string();
    }
    value.into_owned()
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::display;

    #[test]
    fn removes_windows_extended_prefix_for_drive_paths() {
        assert_eq!(
            display(Path::new(r"\\?\C:\Users\PC\.agents\skills")),
            r"C:\Users\PC\.agents\skills"
        );
    }

    #[test]
    fn converts_windows_extended_unc_paths() {
        assert_eq!(
            display(Path::new(r"\\?\UNC\server\share\skills")),
            r"\\server\share\skills"
        );
    }
}
