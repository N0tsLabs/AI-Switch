#[cfg(test)]
mod config_tests {
    fn home_dir() -> std::path::PathBuf {
        dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/mock/home"))
    }

    #[test]
    fn test_validate_config_path_allows_claude_dir() {
        let home = home_dir();
        let path = home.join(".claude").join("settings.json");
        assert!(path.starts_with(home.join(".claude")));
    }

    #[test]
    fn test_validate_config_path_allows_opencode_dir() {
        let home = home_dir();
        let path = home.join(".config").join("opencode").join("oh-my-openagent.json");
        assert!(path.starts_with(home.join(".config").join("opencode")));
    }

    #[test]
    fn test_validate_config_path_allows_ai_switch_dir() {
        let home = home_dir();
        let path = home.join(".ai-switch").join("github_token.txt");
        assert!(path.starts_with(home.join(".ai-switch")));
    }

    #[test]
    fn test_validate_config_path_rejects_etc_passwd() {
        let path = if cfg!(windows) {
            "C:\\Windows\\System32\\drivers\\etc\\hosts".to_string()
        } else {
            "/etc/passwd".to_string()
        };
        let home = home_dir();
        assert!(!path.to_lowercase().starts_with(&home.join(".claude").to_string_lossy().to_lowercase()));
        assert!(!path.to_lowercase().starts_with(&home.join(".config").join("opencode").to_string_lossy().to_lowercase()));
        assert!(!path.to_lowercase().starts_with(&home.join(".ai-switch").to_string_lossy().to_lowercase()));
    }
}

#[cfg(test)]
mod version_tests {
    fn is_newer(remote: &str, local: &str) -> bool {
        let parse = |v: &str| {
            v.split('.').map(|p| p.parse::<u64>().unwrap_or(0)).collect::<Vec<_>>()
        };
        let remote_parts = parse(remote);
        let local_parts = parse(local);
        for i in 0..remote_parts.len().max(local_parts.len()) {
            let r = remote_parts.get(i).unwrap_or(&0);
            let l = local_parts.get(i).unwrap_or(&0);
            if r > l { return true; }
            if r < l { return false; }
        }
        false
    }

    #[test]
    fn test_semver_comparison() {
        assert!(is_newer("1.0.0", "0.9.0"));
        assert!(is_newer("0.4.0", "0.3.0"));
        assert!(!is_newer("0.3.0", "0.3.0"));
        assert!(!is_newer("0.2.0", "0.3.0"));
    }

    #[test]
    fn test_different_length_versions() {
        assert!(is_newer("1.0", "0.9.9"));
        assert!(!is_newer("0.9", "0.9.1"));
    }

    #[test]
    fn test_empty_remote() {
        assert!(!is_newer("", "0.3.0"));
    }
}
