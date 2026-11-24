use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::fs;
use tokio::sync::Semaphore;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use crate::chaoxing::{build_client, resolve_asset_media, CourseAssetItem};
use crate::synth_pdf::{synthesize_chapter_pdf, ImageQuality};
use crate::synth_pptx::synthesize_chapter_pptx;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTaskRequest {
    pub cookie: String,
    pub output_dir: String,
    /// "pdf" | "pptx" | "raw"
    pub export_format: String,
    /// "high" | "balanced" | "lite"
    pub quality: String,
    pub chapters: Vec<ChapterDownloadJob>,
    /// 按 assetId 记录用户合成前手动剔除的页码（1-indexed）
    pub excluded_pages: HashMap<String, Vec<usize>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterDownloadJob {
    pub id: String,
    pub index: String,
    pub title: String,
    pub assets: Vec<CourseAssetItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    AssetProgress {
        asset_id: String,
        progress: u8,
        status: String,
    },
    #[serde(rename_all = "camelCase")]
    ChapterSynthesizing {
        chapter_id: String,
        progress: u8,
    },
    #[serde(rename_all = "camelCase")]
    ChapterDone {
        chapter_id: String,
        output_file: String,
    },
    #[serde(rename_all = "camelCase")]
    AllDone {
        total_files: usize,
        output_dir: String,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        asset_id: Option<String>,
        message: String,
    },
}

/// 清理 Windows 非法文件名字符
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Tokio 4 路并发下载 + 本地无 Office 按章合成 PDF / PPTX
pub async fn run_batch_pipeline(
    req: BatchTaskRequest,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let client = Arc::new(build_client(&req.cookie).map_err(|e| e.to_string())?);
    let root_dir = PathBuf::from(&req.output_dir);
    fs::create_dir_all(&root_dir)
        .await
        .map_err(|e| format!("无法创建输出目录: {}", e))?;

    let quality = match req.quality.as_str() {
        "high" => ImageQuality::High,
        "lite" => ImageQuality::Lite,
        _ => ImageQuality::Balanced,
    };

    let semaphore = Arc::new(Semaphore::new(4));
    let mut completed_count = 0usize;

    for chapter in &req.chapters {
        let ch_folder_name = sanitize_filename(&format!("{}_{}", chapter.index, chapter.title));
        let ch_dir = root_dir.join(&ch_folder_name);
        let slides_tmp_dir = ch_dir.join("_slides_cache");
        fs::create_dir_all(&ch_dir)
            .await
            .map_err(|e| e.to_string())?;

        let mut chapter_slide_images: Vec<PathBuf> = Vec::new();
        let mut chapter_existing_pdfs: Vec<PathBuf> = Vec::new();

        // 1. 并发下载当前章节内的全部勾选资源
        let mut handles = Vec::new();
        for asset in &chapter.assets {
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let client = client.clone();
            let asset = asset.clone();
            let ch_dir = ch_dir.clone();
            let slides_tmp_dir = slides_tmp_dir.clone();
            let excluded = req
                .excluded_pages
                .get(&asset.id)
                .cloned()
                .unwrap_or_default();
            let channel = on_event.clone();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                let _ = channel.send(DownloadEvent::AssetProgress {
                    asset_id: asset.id.clone(),
                    progress: 12,
                    status: "downloading".into(),
                });

                let (direct_url, slide_urls) = if asset.object_id.trim().is_empty() {
                    (None, asset.slide_image_urls.clone())
                } else {
                    resolve_asset_media(&client, &asset.object_id)
                        .await
                        .unwrap_or((
                            Some(asset.download_url.clone()),
                            asset.slide_image_urls.clone(),
                        ))
                };

                let mut local_slides = Vec::new();
                let mut local_pdf: Option<PathBuf> = None;

                if !slide_urls.is_empty() && asset.asset_type == "slide" {
                    let _ = fs::create_dir_all(&slides_tmp_dir).await;
                    let total = slide_urls.len().max(1);
                    for (idx, img_url) in slide_urls.iter().enumerate() {
                        let page_num = idx + 1;
                        // 自动跳过学生在预览抽屉中剔除的冗余页
                        if excluded.contains(&page_num) {
                            continue;
                        }
                        if let Ok(bytes) = download_with_retry(&client, img_url, 3).await {
                            // 超星返回的是 JPEG，按后缀存成 .png 会让解码器炸掉
                            let ext = if bytes.starts_with(&[0xFF, 0xD8]) {
                                "jpg"
                            } else if bytes.starts_with(b"\x89PNG") {
                                "png"
                            } else {
                                "jpg"
                            };
                            let img_path = slides_tmp_dir.join(format!(
                                "{}_p{:03}.{}",
                                sanitize_filename(&asset.id),
                                page_num,
                                ext
                            ));
                            if fs::write(&img_path, &bytes).await.is_ok() {
                                local_slides.push(img_path);
                            }
                        }
                        let pct = (15 + ((idx + 1) * 80 / total)).min(95) as u8;
                        let _ = channel.send(DownloadEvent::AssetProgress {
                            asset_id: asset.id.clone(),
                            progress: pct,
                            status: "downloading".into(),
                        });
                    }
                } else if let Some(url) = direct_url {
                    if let Ok(bytes) = download_with_retry(&client, &url, 3).await {
                        let file_path = ch_dir.join(sanitize_filename(&asset.title));
                        if fs::write(&file_path, &bytes).await.is_ok() {
                            if asset.asset_type == "pdf" {
                                local_pdf = Some(file_path);
                            }
                        }
                    }
                }

                let _ = channel.send(DownloadEvent::AssetProgress {
                    asset_id: asset.id.clone(),
                    progress: 100,
                    status: "done".into(),
                });

                (local_slides, local_pdf)
            }));
        }

        for h in handles {
            if let Ok((slides, maybe_pdf)) = h.await {
                chapter_slide_images.extend(slides);
                if let Some(pdf_path) = maybe_pdf {
                    chapter_existing_pdfs.push(pdf_path);
                }
                completed_count += 1;
            }
        }

        // 2. 纯 Rust 无 Office 本地按章合成 PDF 或 PPTX
        if req.export_format == "pdf" && (!chapter_slide_images.is_empty() || !chapter_existing_pdfs.is_empty()) {
            let _ = on_event.send(DownloadEvent::ChapterSynthesizing {
                chapter_id: chapter.id.clone(),
                progress: 45,
            });
            let out_pdf = ch_dir.join(format!("{}.pdf", ch_folder_name));
            synthesize_chapter_pdf(
                &chapter_slide_images,
                &chapter_existing_pdfs,
                &out_pdf,
                quality,
            )
            .map_err(|e| format!("合成 PDF 失败: {}", e))?;

            let _ = on_event.send(DownloadEvent::ChapterDone {
                chapter_id: chapter.id.clone(),
                output_file: out_pdf
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("chapter.pdf")
                    .to_string(),
            });
        } else if req.export_format == "pptx" && !chapter_slide_images.is_empty() {
            let _ = on_event.send(DownloadEvent::ChapterSynthesizing {
                chapter_id: chapter.id.clone(),
                progress: 50,
            });
            let out_pptx = ch_dir.join(format!("{}.pptx", ch_folder_name));
            synthesize_chapter_pptx(&chapter_slide_images, &out_pptx, quality)
                .map_err(|e| format!("合成 PPTX 失败: {}", e))?;

            let _ = on_event.send(DownloadEvent::ChapterDone {
                chapter_id: chapter.id.clone(),
                output_file: out_pptx
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("chapter.pptx")
                    .to_string(),
            });
        }

        // 清理临时幻灯片图片缓存
        if Path::new(&slides_tmp_dir).exists() && req.export_format != "raw" {
            let _ = fs::remove_dir_all(&slides_tmp_dir).await;
        }

        // 章节目录里现在是成品，保留；只清理空的（例如该章无任何内容）
    }

    // 收尾：清掉本次运行遗留的空章节目录，保证输出目录只有成品
    if req.export_format != "raw" {
        if let Ok(mut rd) = fs::read_dir(&root_dir).await {
            while let Ok(Some(entry)) = rd.next_entry().await {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let mut inner = match fs::read_dir(&path).await {
                    Ok(d) => d,
                    Err(_) => continue,
                };
                let empty = inner.next_entry().await.ok().flatten().is_none();
                if empty {
                    // 只删空目录（例如该章既无课件也无附件）
                    let _ = fs::remove_dir(&path).await;
                }
            }
        }
    }

    let _ = on_event.send(DownloadEvent::AllDone {
        total_files: completed_count,
        output_dir: req.output_dir,
    });

    Ok(())
}

/// 带指数退避重试的二进制拉取
async fn download_with_retry(
    client: &reqwest::Client,
    url: &str,
    max_retries: usize,
) -> Result<Vec<u8>, String> {
    let mut last_err = String::new();
    for attempt in 0..max_retries {
        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(bytes) = resp.bytes().await {
                    return Ok(bytes.to_vec());
                }
            }
            Ok(resp) => {
                last_err = format!("HTTP {}", resp.status());
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(350 * (attempt as u64 + 1))).await;
    }
    Err(last_err)
}

#[cfg(test)]
mod e2e_full_pipeline {
    use super::*;
    use crate::chaoxing::{fetch_enrolled_courses, parse_course_chapters};
    use std::sync::{Arc, Mutex};
    use tauri::ipc::Channel;

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn cookie_to_pdf_end_to_end() {
        let cookie = match std::env::var("CX_COOKIE") {
            Ok(c) if !c.trim().is_empty() => c,
            _ => { println!("skip"); return; }
        };

        // 1) 课程
        let list = fetch_enrolled_courses(&cookie).await.expect("课程列表失败");
        println!("课程 {} 门", list.len());
        let want = std::env::var("CX_COURSE").unwrap_or_else(|_| "265959771".into());
        let target = list.iter().find(|c| c.course_id == want)
            .or_else(|| list.first()).expect("无课程");
        println!("选中: {} -> {}", target.name, target.course_url);

        // 2) 章节
        let detail = parse_course_chapters(&cookie, &target.course_url).await.expect("章节解析失败");
        println!("章节 {} 个", detail.chapters.len());
        assert!(!detail.chapters.is_empty());

        // 3) 取前 2 章下载
        let jobs: Vec<ChapterDownloadJob> = detail.chapters.iter().take(2).map(|ch| {
            ChapterDownloadJob {
                id: ch.id.clone(),
                index: ch.index.clone(),
                title: ch.title.clone(),
                assets: ch.assets.clone(),
            }
        }).collect();

        let out_dir = std::env::temp_dir().join("cx_e2e_out");
        let _ = std::fs::remove_dir_all(&out_dir);
        std::fs::create_dir_all(&out_dir).unwrap();

        let events: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let ev = events.clone();
        let channel = Channel::new(move |body| {
            let s = format!("{:?}", body);
            if let Ok(mut g) = ev.lock() {
                g.push(s);
            }
            Ok(())
        });

        let req = BatchTaskRequest {
            cookie: cookie.clone(),
            output_dir: out_dir.to_string_lossy().to_string(),
            export_format: "pdf".into(),
            quality: "high".into(),
            chapters: jobs,
            excluded_pages: Default::default(),
        };

        match crate::downloader::run_batch_pipeline(req, channel).await {
            Ok(()) => println!("流水线完成"),
            Err(e) => println!("流水线错误: {}", e),
        }

        let files: Vec<String> = std::fs::read_dir(&out_dir).unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        println!("输出文件: {:?}", files);

        for f in &files {
            if f.to_lowercase().ends_with(".pdf") {
                let p = out_dir.join(f);
                let bytes = std::fs::read(&p).unwrap();
                println!("  {} -> {} bytes, header={:?}", f, bytes.len(),
                         String::from_utf8_lossy(&bytes[..5]));
                assert!(bytes.starts_with(b"%PDF"), "PDF 头不对");
                assert!(bytes.len() > 5000, "PDF 过小");
            }
        }
        let evs = events.lock().unwrap();
        println!("事件数: {}", evs.len());
        assert!(evs.len() > 0, "没有任何进度事件");
    }
}
