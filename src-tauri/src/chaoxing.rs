use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, REFERER, USER_AGENT};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const CHROME_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Debug, Error)]
pub enum ChaoxingError {
    #[error("网络请求失败: {0}")]
    Http(#[from] reqwest::Error),
    #[error("登录会话已失效，请重新扫码登录学习通")]
    SessionExpired,
    #[error("课程链接格式无法识别，请确认包含 courseId 与 clazzid")]
    InvalidCourseUrl,
    #[error("页面解析失败: {0}")]
    ParseError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseSummary {
    pub course_id: String,
    pub clazz_id: String,
    pub cpi: String,
    pub name: String,
    pub instructor: String,
    pub course_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseAssetItem {
    pub id: String,
    pub chapter_id: String,
    pub title: String,
    /// "slide" | "pdf" | "docx" | "pptx"
    pub asset_type: String,
    pub object_id: String,
    pub download_url: String,
    pub slide_image_urls: Vec<String>,
    pub estimated_size_mb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedChapter {
    pub id: String,
    pub index: String,
    pub title: String,
    pub assets: Vec<CourseAssetItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedCourseDetail {
    pub name: String,
    pub instructor: String,
    pub chapters: Vec<ParsedChapter>,
}

/// 构造带学习通登录态 Cookie 的共享 HTTP 客户端（纯 RustLS，零 OpenSSL 依赖）
pub fn build_client(cookie_header: &str) -> Result<reqwest::Client, ChaoxingError> {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(CHROME_UA));
    headers.insert(
        REFERER,
        HeaderValue::from_static("https://mooc2-ans.chaoxing.com/"),
    );
    if !cookie_header.trim().is_empty() {
        let cookie_val = HeaderValue::from_str(cookie_header.trim())
            .map_err(|_| ChaoxingError::SessionExpired)?;
        headers.insert(COOKIE, cookie_val);
    }

    Ok(reqwest::Client::builder()
        .default_headers(headers)
        .timeout(std::time::Duration::from_secs(30))
        .build()?)
}

/// 拉取当前账号已选课程列表（免去手动逐个复制课程链接）
pub async fn fetch_enrolled_courses(cookie: &str) -> Result<Vec<CourseSummary>, ChaoxingError> {
    let client = build_client(cookie)?;
    let resp = client
        .post("https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata")
        .form(&[
            ("courseType", "1"),
            ("courseFolderId", "0"),
            ("query", ""),
            ("superstarClass", ""),
        ])
        .send()
        .await?;

    let final_url = resp.url().as_str().to_string();
    if final_url.contains("passport2.chaoxing.com/login") {
        return Err(ChaoxingError::SessionExpired);
    }

    let html = resp.text().await?;
    println!("[parse] list html len={} firstLayer={}", html.len(), html.matches("firstLayer").count());
    let document = Html::parse_document(&html);
    let item_sel = Selector::parse("div.course").unwrap();
    let name_sel = Selector::parse("span.course-name").unwrap();
    let link_sel = Selector::parse("a.color1").unwrap();
    let teacher_sel = Selector::parse("p.color3").unwrap();

    let mut courses = Vec::new();
    for item in document.select(&item_sel) {
        let href = item
            .select(&link_sel)
            .next()
            .and_then(|el| el.value().attr("href"))
            .unwrap_or("")
            .to_string();

        let course_id = query_param(&href, "courseid");
        let clazz_id = query_param(&href, "clazzid");
        let cpi = query_param(&href, "cpi");
        if course_id.is_empty() || clazz_id.is_empty() {
            continue;
        }

        let name = item
            .select(&name_sel)
            .next()
            .and_then(|el| el.value().attr("title"))
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| format!("课程 {}", course_id));

        let instructor = item
            .select(&teacher_sel)
            .next()
            .and_then(|el| el.value().attr("title"))
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "授课教师".to_string());

        let course_url = if href.is_empty() {
            format!(
                "https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid={}&clazzid={}&cpi={}&ismooc2=1&v=2",
                course_id, clazz_id, cpi
            )
        } else {
            href
        };

        courses.push(CourseSummary {
            course_id,
            clazz_id,
            cpi,
            name,
            instructor,
            course_url,
        });
    }

    Ok(courses)
}

/// 从 URL 查询串里取参数（已处理 HTML 实体）
fn query_param(url: &str, key: &str) -> String {
    let pattern = format!(r"(?i)[?&]{}=([^&#]+)", regex::escape(key));
    Regex::new(&pattern)
        .ok()
        .and_then(|re| re.captures(url))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_default()
}

/// 从学习通课程链接中提取 courseId / clazzid / cpi
pub fn extract_course_params(url: &str) -> Result<(String, String, String), ChaoxingError> {
    let re_course = Regex::new(r"(?i)courseId=(\d+)").unwrap();
    let re_clazz = Regex::new(r"(?i)clazzid=(\d+)").unwrap();
    let re_cpi = Regex::new(r"(?i)cpi=(\d+)").unwrap();

    let course_id = re_course
        .captures(url)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or(ChaoxingError::InvalidCourseUrl)?;
    let clazz_id = re_clazz
        .captures(url)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or(ChaoxingError::InvalidCourseUrl)?;
    let cpi = re_cpi
        .captures(url)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();

    Ok((course_id, clazz_id, cpi))
}

/// 解析指定课程的章节目录与课件附件（文档 / 图文幻灯片 objectid）
pub async fn parse_course_chapters(
    cookie: &str,
    course_url: &str,
) -> Result<ParsedCourseDetail, ChaoxingError> {
    let (course_id, clazz_id, cpi) = extract_course_params(course_url)?;
    println!(
        "[parse] course={} clazz={} cpi={} url={}",
        course_id, clazz_id, cpi, course_url
    );
    let client = build_client(cookie)?;

    let list_url = format!(
        "https://mooc1.chaoxing.com/mycourse/studentstudycourselist?courseId={}&chapterId=&clazzid={}&cpi={}&mooc2=1&isMicroCourse=false",
        course_id, clazz_id, cpi
    );
    let resp = client.get(&list_url).send().await?;
    if resp.url().as_str().contains("passport2.chaoxing.com/login") {
        return Err(ChaoxingError::SessionExpired);
    }
    let html = resp.text().await?;

    // 第一阶段：同步解析目录（scraper 的 Html 不是 Send，必须在此阶段内用完）
    let (course_name, units) = {
        let document = Html::parse_document(&html);
        let node_sel = Selector::parse("div.posCatalog_select").unwrap();
        let title_sel = Selector::parse("span.posCatalog_title, span.posCatalog_name").unwrap();

        let mut units: Vec<(String, String, Vec<(String, String)>)> = Vec::new();
        for node in document.select(&node_sel) {
            let class = node.value().attr("class").unwrap_or("");
            let title = node
                .select(&title_sel)
                .next()
                .and_then(|el| el.value().attr("title"))
                .unwrap_or("")
                .trim()
                .to_string();
            let raw_id = node.value().attr("id").unwrap_or("").to_string();

            if class.contains("firstLayer") {
                units.push((raw_id, title, Vec::new()));
            } else {
                let knowledge_id = raw_id.trim_start_matches("cur").to_string();
                if knowledge_id.is_empty() {
                    continue;
                }
                if let Some(last) = units.last_mut() {
                    last.2.push((knowledge_id, title));
                }
            }
        }

        let name = format!("学习通课程_{}", course_id);
        (name, units)
    };

    // 第二阶段：逐章拉取卡片内容（可安全跨 await）
    let mut chapters: Vec<ParsedChapter> = Vec::new();
    let mut seq = 0usize;

    for (_l1_id, _l1_title, items) in units.into_iter() {
        for (knowledge_id, item_title) in items.into_iter() {
            let card_url = format!(
                "https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid={}&courseid={}&knowledgeid={}&num=0&ut=s&cpi={}&mooc2=1&isMicroCourse=false&editorPreview=0",
                clazz_id, course_id, knowledge_id, cpi
            );

            let mut assets: Vec<CourseAssetItem> = Vec::new();
            if let Ok(card_resp) = client.get(&card_url).send().await {
                if let Ok(card_html) = card_resp.text().await {
                    seq += 1;
                    let ch_id = format!("ch-{}", seq);
                    assets = extract_card_attachments(&card_html, &ch_id, &item_title);
                }
            }

            if !assets.is_empty() {
                chapters.push(ParsedChapter {
                    id: format!("ch-{}", seq),
                    index: format!("第 {} 章", seq),
                    title: if item_title.is_empty() {
                        format!("章节 {}", seq)
                    } else {
                        item_title
                    },
                    assets,
                });
            }
        }
    }

    println!("[parse] chapters parsed = {}", chapters.len());
    Ok(ParsedCourseDetail {
        name: course_name,
        instructor: "已同步授课教师".to_string(),
        chapters,
    })
}

/// 从学习通 knowledge/cards 页面内联 mArg JSON 提取文档 objectid 与类型
fn extract_card_attachments(
    card_html: &str,
    chapter_id: &str,
    fallback_title: &str,
) -> Vec<CourseAssetItem> {
    let mut results: Vec<CourseAssetItem> = Vec::new();

    // 页面里先有 `mArg = "";`，真正的对象在后面的 `mArg = {...}`，取最后一个
    let starter = Regex::new(r"mArg\s*=\s*\{").unwrap();
    let Some(hit) = starter.find_iter(card_html).last() else {
        return results;
    };
    let brace = hit.end() - 1;

    let bytes = card_html.as_bytes();
    let mut depth = 0i32;
    let mut in_str = false;
    let mut esc = false;
    let mut end = None;
    for i in brace..bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            if esc {
                esc = false;
            } else if c == '\\' {
                esc = true;
            } else if c == '"' {
                in_str = false;
            }
            continue;
        }
        match c {
            '"' => in_str = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i + 1);
                    break;
                }
            }
            _ => {}
        }
    }
    let Some(end) = end else {
        return results;
    };

    let Ok(val) = serde_json::from_str::<serde_json::Value>(&card_html[brace..end]) else {
        return results;
    };
    let Some(atts) = val.get("attachments").and_then(|v| v.as_array()) else {
        return results;
    };

    let mut slide_urls: Vec<String> = Vec::new();
    let mut slide_bytes: f64 = 0.0;
    let mut docs: Vec<(String, String, String)> = Vec::new();

    for att in atts {
        let Some(prop) = att.get("property") else { continue };
        let module = prop.get("module").and_then(|v| v.as_str()).unwrap_or("");
        let oid = prop.get("objectid").and_then(|v| v.as_str()).unwrap_or("");
        let name = prop.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let size: f64 = prop
            .get("size")
            .and_then(|v| v.as_str())
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(0.0);

        if oid.is_empty() {
            continue;
        }

        if module == "insertimage" || module == "insertimgs" {
            slide_urls.push(format!("https://p.cldisk.com/star4/{}/origin.jpg", oid));
            slide_bytes += size;
        } else if module.starts_with("insert") {
            let lower = name.to_lowercase();
            let ty = if lower.ends_with(".pdf") {
                "pdf"
            } else if lower.ends_with(".doc") || lower.ends_with(".docx") {
                "docx"
            } else if lower.ends_with(".ppt") || lower.ends_with(".pptx") {
                "pptx"
            } else {
                "pdf"
            };
            docs.push((name.to_string(), oid.to_string(), ty.to_string()));
        }
    }

    if !slide_urls.is_empty() {
        let title = if fallback_title.trim().is_empty() {
            "章节图文内容".to_string()
        } else {
            fallback_title.trim().to_string()
        };
        results.push(CourseAssetItem {
            id: format!("{}-slide", chapter_id),
            chapter_id: chapter_id.to_string(),
            title: format!("{}（图文幻灯片）", title),
            asset_type: "slide".to_string(),
            object_id: String::new(),
            download_url: String::new(),
            slide_image_urls: slide_urls,
            estimated_size_mb: (slide_bytes / 1024.0 / 1024.0 * 10.0).round() / 10.0,
        });
    }

    for (idx, (name, oid, ty)) in docs.into_iter().enumerate() {
        results.push(CourseAssetItem {
            id: format!("{}-doc{}", chapter_id, idx + 1),
            chapter_id: chapter_id.to_string(),
            title: name,
            asset_type: ty,
            object_id: oid.clone(),
            download_url: format!("https://mooc1.chaoxing.com/ananas/download/{}", oid),
            slide_image_urls: Vec::new(),
            estimated_size_mb: 3.0,
        });
    }

    results
}

/// 通过学习通 ananas/status/{objectid} 获取真实下载直链或图文幻灯片分页图片 URL
pub async fn resolve_asset_media(
    client: &reqwest::Client,
    object_id: &str,
) -> Result<(Option<String>, Vec<String>), ChaoxingError> {
    let status_url = format!(
        "https://mooc1.chaoxing.com/ananas/status/{}?flag=normal",
        object_id
    );
    let json: serde_json::Value = client.get(&status_url).send().await?.json().await?;

    let direct_download = json
        .get("download")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut slide_urls = Vec::new();
    if let (Some(thumb), Some(pagenum)) = (
        json.get("thumb").and_then(|v| v.as_str()),
        json.get("pagenum").and_then(|v| v.as_u64()),
    ) {
        let base = thumb.trim_end_matches('/');
        for p in 1..=pagenum {
            slide_urls.push(format!("{}/{}.png", base, p));
        }
    }

    Ok((direct_download, slide_urls))
}

#[cfg(test)]
mod live_probe {
    use super::*;

    /// 真实联网验证：CX_COOKIE=<浏览器 Cookie 字符串>
    #[tokio::test]
    async fn probe_enrolled_courses() {
        let cookie = match std::env::var("CX_COOKIE") {
            Ok(c) if !c.trim().is_empty() => c,
            _ => {
                println!("skip: 未设置 CX_COOKIE");
                return;
            }
        };

        let list = fetch_enrolled_courses(&cookie).await.expect("抓取书架失败");
        println!("== 已选课程 {} 门 ==", list.len());
        for c in &list {
            println!("  {} | courseId={} clazzid={} cpi={}", c.name, c.course_id, c.clazz_id, c.cpi);
        }
        assert!(!list.is_empty(), "课程列表为空");

        let first = list
            .iter()
            .find(|c| c.course_id == "265959771")
            .unwrap_or(&list[0]);
        println!("\n== 解析课程目录：{} ==", first.name);
        match parse_course_chapters(&cookie, &first.course_url).await {
            Ok(detail) => {
                println!("  课程：{}  章节数：{}", detail.name, detail.chapters.len());
                let mut total = 0;
                for ch in detail.chapters.iter().take(6) {
                    println!("   {} {} -> {} 个资源", ch.index, ch.title, ch.assets.len());
                    for a in ch.assets.iter().take(3) {
                        println!("        [{}] {}  pages={} size={}MB", a.asset_type, a.title, a.slide_image_urls.len(), a.estimated_size_mb);
                    }
                    total += ch.assets.len();
                }
                println!("  合计资源：{}", total);
            }
            Err(e) => println!("  解析失败：{:?}", e),
        }
    }
}
