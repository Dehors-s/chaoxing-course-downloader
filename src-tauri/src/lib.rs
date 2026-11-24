mod chaoxing;
mod qrlogin;
mod downloader;
mod synth_pdf;
mod synth_pptx;

use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use url::Url;

use crate::chaoxing::{CourseSummary, ParsedCourseDetail};
use crate::downloader::{run_batch_pipeline, BatchTaskRequest, DownloadEvent};

/// 内存会话态（绝不把学习通 Cookie 写入明文日志）
struct AppSessionState {
    cookie: Mutex<String>,
}

/// 打开真实的学习通登录窗口（WebView2），登录成功后自动读取 Cookie 并关闭
#[tauri::command]
async fn open_chaoxing_login(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("chaoxing-login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let login_url = Url::parse(
        "https://passport2.chaoxing.com/login?fid=254243&refer=http%3A%2F%2Fi.mooc.chaoxing.com",
    )
    .map_err(|e| e.to_string())?;

    WebviewWindowBuilder::new(&app, "chaoxing-login", WebviewUrl::External(login_url))
        .title("学习通登录")
        .inner_size(540.0, 720.0)
        .center()
        .build()
        .map_err(|e| format!("无法打开登录窗口: {}", e))?;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // 最多等 6 分钟，每 1.5 秒查一次 Cookie
        for _ in 0..240 {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

            let Some(win) = handle.get_webview_window("chaoxing-login") else {
                return;
            };

            for probe in [
                "https://mooc1.chaoxing.com",
                "https://mooc2-ans.chaoxing.com",
                "https://i.mooc.chaoxing.com",
            ] {
                let Ok(target) = Url::parse(probe) else { continue };
                let Ok(cookies) = win.cookies_for_url(target) else {
                    continue;
                };
                let header = cookies
                    .iter()
                    .map(|c| format!("{}={}", c.name(), c.value()))
                    .collect::<Vec<_>>()
                    .join("; ");

                if header.contains("UID=") || header.contains("vc3=") {
                    if let Some(state) = handle.try_state::<AppSessionState>() {
                        *state.cookie.lock().unwrap() = header.clone();
                    }
                    println!("[login] captured {} bytes of cookie", header.len());
                    let _ = handle.emit("chaoxing-login-success", true);
                    let _ = win.close();
                    return;
                }
            }
        }
    });

    Ok(())
}

/// 允许高阶用户手动更新 Cookie（兜底入口）
#[tauri::command]
fn set_manual_cookie(cookie: String, state: State<'_, AppSessionState>) -> Result<(), String> {
    *state.cookie.lock().unwrap() = cookie;
    Ok(())
}

/// 获取已选课程书架
#[tauri::command]
async fn get_enrolled_courses(
    state: State<'_, AppSessionState>,
) -> Result<Vec<CourseSummary>, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    if cookie.trim().is_empty() {
        return Err("请先扫码登录学习通".into());
    }
    chaoxing::fetch_enrolled_courses(&cookie)
        .await
        .map_err(|e| e.to_string())
}

/// 解析单门课程章节与课件附件
#[tauri::command]
async fn parse_course_chapters(
    course_url: String,
    state: State<'_, AppSessionState>,
) -> Result<ParsedCourseDetail, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    chaoxing::parse_course_chapters(&cookie, &course_url)
        .await
        .map_err(|e| e.to_string())
}

/// 启动并发下载与纯 Rust 免 Office 本地合成流水线
#[tauri::command]
async fn start_batch_download(
    mut request: BatchTaskRequest,
    state: State<'_, AppSessionState>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    if request.cookie.trim().is_empty() {
        request.cookie = state.cookie.lock().unwrap().clone();
    }
    run_batch_pipeline(request, on_event).await
}


/// 取单页幻灯片原图，返回 data URL 供前端缩略图/放大预览
#[tauri::command]
async fn fetch_slide_thumb(
    url: String,
    state: State<'_, AppSessionState>,
) -> Result<String, String> {
    let cookie = state.cookie.lock().unwrap().clone();
    let client = chaoxing::build_client(&cookie).map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() < 100 {
        return Err("图片为空".into());
    }
    let mime = if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else {
        "image/jpeg"
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(qrlogin::QrState::new())
        .manage(AppSessionState {
            cookie: Mutex::new(String::new()),
        })
        .setup(|app| {
            // 为 Windows 11 主窗口开启原生 Mica 玻璃材质（Win10 自动降级 Acrylic）
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                if window_vibrancy::apply_mica(&window, None).is_err() {
                    let _ = window_vibrancy::apply_acrylic(&window, Some((243, 245, 248, 210)));
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_chaoxing_login,
            fetch_slide_thumb,
            qrlogin::start_qr_login,
            qrlogin::poll_qr_login,
            set_manual_cookie,
            get_enrolled_courses,
            parse_course_chapters,
            start_batch_download
        ])
        .run(tauri::generate_context!())
        .expect("启动学习通课程文件下载器失败");
}
