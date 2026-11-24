//! 一括画像ダウンロードの保存先とファイル名を扱う。
//!
//! 保存先は Logs / Languages と同じ Documents を基準にする。
//! モバイルは `Documents/Downloads`、デスクトップは `Documents/Pawchive/Downloads`。
//! Documents が取得できない場合はアプリデータ領域の `Downloads` にフォールバックする。

use std::path::{Path, PathBuf};
use tauri::Manager;

/// クリエイター名・ファイル名の最大文字数
const MAX_SEGMENT_CHARS: usize = 80;

/// ファイル名として使えない文字を置換し、前後の空白とドットを除去する。
pub(crate) fn sanitize_segment(value: &str, fallback: &str) -> String {
    let mut replaced = String::with_capacity(value.len());
    for ch in value.trim().chars() {
        let safe = !ch.is_control()
            && !matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|');
        replaced.push(if safe { ch } else { '_' });
    }
    let cleaned = replaced.trim().trim_matches('.').trim();
    let limited: String = cleaned.chars().take(MAX_SEGMENT_CHARS).collect();
    let result = limited.trim().trim_matches('.').trim();
    if result.is_empty() {
        fallback.to_string()
    } else {
        result.to_string()
    }
}

/// 保存の基準ディレクトリ (`.../Downloads`)。存在しなければ作成する。
pub(crate) fn download_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = match app.path().document_dir() {
        Ok(documents) => {
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                documents.join("Downloads")
            }
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                documents.join("Pawchive").join("Downloads")
            }
        }
        Err(_) => app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("Downloads"),
    };
    std::fs::create_dir_all(&base).map_err(|error| error.to_string())?;
    Ok(base)
}

/// クリエイター名のディレクトリ。名前が空になる場合は `service_creatorId` を使う。
pub(crate) fn creator_directory(
    app: &tauri::AppHandle,
    creator_name: &str,
    service: &str,
    creator_id: &str,
) -> Result<PathBuf, String> {
    let fallback = format!("{}_{}", service, creator_id);
    let name = sanitize_segment(creator_name, &fallback);
    let directory = download_root(app)?.join(name);
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

/// 衝突しないファイル名を組み立てる。`stem` と `extension` はサニタイズ済みの想定。
pub(crate) fn collision_name(stem: &str, extension: Option<&str>, index: u32) -> String {
    let base = if index <= 1 {
        stem.to_string()
    } else {
        format!("{stem}-{index}")
    };
    match extension {
        Some(ext) if !ext.is_empty() => format!("{base}.{ext}"),
        _ => base,
    }
}

/// ディレクトリ内で衝突しない保存先を返す。
pub(crate) fn unique_file_path(directory: &Path, filename: &str) -> PathBuf {
    let sanitized = sanitize_segment(filename, "image");
    let parsed = Path::new(&sanitized);
    let stem = parsed
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = parsed.extension().and_then(|value| value.to_str());

    for index in 1..=9999 {
        let candidate = directory.join(collision_name(stem, extension, index));
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(collision_name(stem, extension, 9999))
}

/// 一時ファイルへ書いてから置き換える。
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let temporary = path.with_file_name(format!(".{file_name}.part"));
    std::fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    match std::fs::rename(&temporary, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = std::fs::remove_file(&temporary);
            Err(error.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_replaces_forbidden_characters_and_trims() {
        assert_eq!(sanitize_segment("  my:creator/name?  ", "fallback"), "my_creator_name_");
        assert_eq!(sanitize_segment("...creator...", "fallback"), "creator");
        assert_eq!(sanitize_segment("a\\b*c|d", "fallback"), "a_b_c_d");
        assert_eq!(sanitize_segment("   ", "fallback"), "fallback");
        assert_eq!(sanitize_segment("...", "fallback"), "fallback");
    }

    #[test]
    fn sanitize_limits_length_and_keeps_fallback() {
        let long = "a".repeat(200);
        assert_eq!(sanitize_segment(&long, "fallback").chars().count(), MAX_SEGMENT_CHARS);
        assert_eq!(sanitize_segment("", "fanbox_123"), "fanbox_123");
    }

    #[test]
    fn collision_names_add_a_suffix() {
        assert_eq!(collision_name("image", Some("png"), 1), "image.png");
        assert_eq!(collision_name("image", Some("png"), 2), "image-2.png");
        assert_eq!(collision_name("image", None, 3), "image-3");
        assert_eq!(collision_name("image", Some(""), 2), "image-2");
    }
}
