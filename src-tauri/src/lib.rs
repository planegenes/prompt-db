// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};

/// 获取图片处理缓存目录
fn resized_dir(cache_dir: &Path) -> PathBuf {
    cache_dir.join("resized")
}

/// 计算原图路径的 hash
fn hash_path(source: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    hasher.finish()
}

/// 根据原图路径、目标尺寸和模式计算缓存路径
fn resized_path(cache_dir: &Path, source: &str, size: u32, mode: &str) -> PathBuf {
    let filename = format!("{:x}_{}_{}.jpg", hash_path(source), size, mode);
    resized_dir(cache_dir).join(filename)
}

/// 判断缓存是否仍有效（缓存存在且不比原图旧）
fn cache_is_valid(cache_path: &Path, source_path: &str) -> bool {
    let Ok(cache_meta) = fs::metadata(cache_path) else {
        return false;
    };
    let Ok(source_meta) = fs::metadata(source_path) else {
        return false;
    };

    let cache_modified = cache_meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let source_modified = source_meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);

    cache_modified >= source_modified
}

/// 生成并缓存调整过大小的图片。
///
/// `mode` 对应 CSS `background-size` 语义：
/// - `"cover"`：短边对齐 `size`，图片会填满目标区域，超出部分被裁剪。
/// - `"contain"`：长边对齐 `size`，图片完整显示，可能有留白。
#[tauri::command]
fn get_resized_image(app: AppHandle, path: String, size: u32, mode: String) -> Result<String, String> {
    if mode != "cover" && mode != "contain" {
        return Err(format!("不支持的 resize 模式: {}", mode));
    }

    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let resized_dir_path = resized_dir(&cache_dir);
    fs::create_dir_all(&resized_dir_path).map_err(|e| e.to_string())?;

    let cache_path = resized_path(&cache_dir, &path, size, &mode);

    if cache_is_valid(&cache_path, &path) {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    let img = image::open(&path).map_err(|e| format!("图片打开失败: {}", e))?;
    let (w, h) = (img.width(), img.height());
    let (src_w, src_h) = (w as f32, h as f32);

    // 对应 CSS background-size 的缩放比例
    let scale = if mode == "cover" {
        (size as f32) / (w.min(h) as f32)
    } else {
        (size as f32) / (w.max(h) as f32)
    };

    let new_w = (src_w * scale).round() as u32;
    let new_h = (src_h * scale).round() as u32;

    let scaled = img.resize(new_w.max(1), new_h.max(1), image::imageops::FilterType::Lanczos3);

    scaled
        .save_with_format(&cache_path, image::ImageFormat::Jpeg)
        .map_err(|e| format!("图片保存失败: {}", e))?;

    Ok(cache_path.to_string_lossy().to_string())
}

/// 仅读取图片头信息获取尺寸，避免完整解码
#[tauri::command]
fn get_image_size(path: String) -> Result<(u32, u32), String> {
    use image::ImageReader;

    let reader = ImageReader::open(&path).map_err(|e| format!("文件打开失败: {}", e))?;
    let reader = reader.with_guessed_format().map_err(|e| format!("图片格式检测失败: {}", e))?;
    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| format!("读取图片尺寸失败: {}", e))?;

    Ok((width, height))
}

/// 清理图片缓存目录，保留最近使用的 `max_count` 个文件。
#[tauri::command]
fn clean_image_cache(app: AppHandle, max_count: u32) -> Result<(), String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let resized_dir_path = resized_dir(&cache_dir);

    let mut entries: Vec<(PathBuf, SystemTime)> = match fs::read_dir(&resized_dir_path) {
        Ok(read_dir) => read_dir
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.is_file() {
                    let modified = entry.metadata().ok()?.modified().ok()?;
                    Some((path, modified))
                } else {
                    None
                }
            })
            .collect(),
        Err(_) => return Ok(()),
    };

    if entries.len() <= max_count as usize {
        return Ok(());
    }

    // 按修改时间升序，最旧的排在前面
    entries.sort_by(|a, b| a.1.cmp(&b.1));

    let to_remove = entries.len() - max_count as usize;
    for (path, _) in entries.into_iter().take(to_remove) {
        let _ = fs::remove_file(path);
    }

    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, get_image_size, get_resized_image, clean_image_cache])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
