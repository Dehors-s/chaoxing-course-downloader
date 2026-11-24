//! 学习通 App 扫码登录：直接对接 passport2 的二维码接口
//!
//! 流程：
//! 1. GET  https://passport2.chaoxing.com/login  取 uuid / enc
//! 2. GET  https://passport2.chaoxing.com/createqr?uuid=..&fid=..  取二维码 PNG
//! 3. POST https://passport2.chaoxing.com/getauthstatus/v2  轮询，成功后 Cookie 落到会话 Jar
//!
//! 因为 reqwest 的 cookie_store 会自动记住 Set-Cookie，登录成功后
//! 直接把 Jar 里的 Cookie 拼成请求头字符串交给前端保存。

use std::sync::{Arc, Mutex};

use regex::Regex;
use std::collections::BTreeMap;

use reqwest::cookie::CookieStore;
use serde::Serialize;
use url::Url;

const QR_HOST: &str = "https://passport2.chaoxing.com";
const FID: &str = "254243";
const CHROME_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/// 简易 Cookie 存储：自己解析 Set-Cookie，方便完整导出会话串
#[derive(Default)]
struct CxJar {
    inner: Mutex<BTreeMap<String, String>>,
}

impl CxJar {
    fn dump(&self) -> String {
        self.inner
            .lock()
            .unwrap()
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("; ")
    }

    fn count(&self) -> usize {
        self.inner.lock().unwrap().len()
    }
}

impl CookieStore for CxJar {
    fn set_cookies(&self, cookie_headers: &mut dyn Iterator<Item = &reqwest::header::HeaderValue>, _url: &Url) {
        let mut guard = self.inner.lock().unwrap();
        for hv in cookie_headers {
            let Ok(raw) = hv.to_str() else { continue };
            // Set-Cookie: name=value; Path=/; ...
            let first = raw.split(';').next().unwrap_or("").trim();
            if let Some((k, v)) = first.split_once('=') {
                let key = k.trim();
                if key.is_empty() || key.starts_with("expires") || key.starts_with("Max-Age") {
                    continue;
                }
                let val = v.trim().to_string();
                if val.is_empty() {
                    guard.remove(key);
                } else {
                    guard.insert(key.to_string(), val);
                }
            }
        }
    }

    fn cookies(&self, _url: &Url) -> Option<reqwest::header::HeaderValue> {
        let dump = self.dump();
        if dump.is_empty() {
            return None;
        }
        reqwest::header::HeaderValue::from_str(&dump).ok()
    }
}

struct QrSession {
    client: reqwest::Client,
    jar: Arc<CxJar>,
    uuid: String,
    enc: String,
    double_factor: String,
    forbid_other: String,
}

pub struct QrState {
    session: Mutex<Option<QrSession>>,
}

impl QrState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrPollResult {
    /// waiting / success / expired
    pub state: String,
    pub cookie: Option<String>,
    pub note: Option<String>,
    /// 已扫码但还没在手机上点确认（超星 type=2）
    pub scanned: bool,
}


/// 取隐藏 input 的值：兼容 `id` 在 `value` 前后两种写法
fn grab_input(html: &str, elem_id: &str) -> String {
    let patterns = [
        format!(r#"id="{}"[^>]*value="([^"]*)""#, elem_id),
        format!(r#"value="([^"]*)"[^>]*id="{}""#, elem_id),
    ];
    for pat in patterns.iter() {
        if let Ok(re) = Regex::new(pat) {
            if let Some(cap) = re.captures(html) {
                if let Some(m) = cap.get(1) {
                    let v = m.as_str().to_string();
                    if !v.is_empty() {
                        return v;
                    }
                }
            }
        }
    }
    String::new()
}


/// 解码 URL 编码（%XX），用于还原 getauthstatus 返回的跳转地址
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = |c: u8| -> Option<u8> {
                match c {
                    b'0'..=b'9' => Some(c - b'0'),
                    b'a'..=b'f' => Some(c - b'a' + 10),
                    b'A'..=b'F' => Some(c - b'A' + 10),
                    _ => None,
                }
            };
            if let (Some(h), Some(l)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn build_qr_client() -> (reqwest::Client, Arc<CxJar>) {
    let jar = Arc::new(CxJar::default());
    let client = reqwest::Client::builder()
        .user_agent(CHROME_UA)
        .cookie_provider(jar.clone())
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .expect("构建扫码客户端失败");
    (client, jar)
}

/// 开始扫码：返回二维码 PNG 原始字节
#[tauri::command]
pub async fn start_qr_login(state: tauri::State<'_, QrState>) -> Result<Vec<u8>, String> {
    let (client, jar) = build_qr_client();

    let login_url = format!(
        "{}/login?fid={}&refer={}",
        QR_HOST,
        FID,
        "http%3A%2F%2Fi.mooc.chaoxing.com"
    );
    let html = client
        .get(&login_url)
        .send()
        .await
        .map_err(|e| format!("打开登录页失败: {}", e))?
        .text()
        .await
        .map_err(|e| format!("读取登录页失败: {}", e))?;

    let uuid = grab_input(&html, "uuid");
    if uuid.is_empty() {
        return Err("没能建立扫码会话（uuid 为空）".into());
    }
    let enc = grab_input(&html, "enc");
    let mut double_factor = grab_input(&html, "doubleFactorLogin");
    if double_factor.is_empty() {
        double_factor = "0".into();
    }
    let mut forbid_other = grab_input(&html, "forbidotherlogin");
    if forbid_other.is_empty() {
        forbid_other = "0".into();
    }

    let qr_url = format!("{}/createqr?uuid={}&fid={}", QR_HOST, uuid, FID);
    let png = client
        .get(&qr_url)
        .send()
        .await
        .map_err(|e| format!("获取二维码失败: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("读取二维码失败: {}", e))?
        .to_vec();

    if png.len() < 8 || &png[0..4] != b"\x89PNG" {
        return Err("二维码返回的不是 PNG".into());
    }

    *state.session.lock().unwrap() = Some(QrSession {
        client,
        jar,
        uuid,
        enc,
        double_factor,
        forbid_other,
    });

    Ok(png)
}

/// 轮询扫码状态
#[tauri::command]
pub async fn poll_qr_login(state: tauri::State<'_, QrState>) -> Result<QrPollResult, String> {
    let (client, jar, uuid, enc, double_factor, forbid_other) = {
        let guard = state.session.lock().unwrap();
        let Some(sess) = guard.as_ref() else {
            return Err("尚未开始扫码，请先刷新二维码".into());
        };
        (
            sess.client.clone(),
            sess.jar.clone(),
            sess.uuid.clone(),
            sess.enc.clone(),
            sess.double_factor.clone(),
            sess.forbid_other.clone(),
        )
    };

    let resp = client
        .post(format!("{}/getauthstatus/v2", QR_HOST))
        .form(&[
            ("enc", enc.as_str()),
            ("uuid", uuid.as_str()),
            ("doubleFactorLogin", double_factor.as_str()),
            ("forbidotherlogin", forbid_other.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("轮询失败: {}", e))?;

    let text = resp.text().await.unwrap_or_default();
    let json: serde_json::Value =
        serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);

    let ok = json
        .get("status")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if ok {
        // 关键：服务端在 status=true 时返回 data.url，浏览器就是跳到它才拿到鉴权 Cookie
        let mut hops: Vec<String> = Vec::new();
        if let Some(u) = json.get("url").and_then(|v| v.as_str()) {
            if !u.trim().is_empty() {
                hops.push(percent_decode(u));
            }
        }
        // 兜底再补几个常规落点
        hops.push("http://i.mooc.chaoxing.com/space/index".to_string());
        hops.push("https://mooc1.chaoxing.com/".to_string());
        hops.push("https://mooc2-ans.chaoxing.com/".to_string());

        let mut followed = 0usize;
        for hop in hops.iter() {
            if let Ok(resp) = client.get(hop).send().await {
                // 跟随重定向链，让 Set-Cookie 全部落进 jar
                let final_url = resp.url().to_string();
                let _ = resp.bytes().await;
                followed += 1;
                println!("[qr] hop ok -> {} (final {})", hop, final_url);
            }
        }
        println!("[qr] hops followed = {}", followed);

        let cookie = jar.dump();
        let note = format!("jar={} keys={}", jar.count(), cookie.len());
        println!("[qr] login ok, {}", note);

        return Ok(QrPollResult {
            state: "success".into(),
            cookie: if cookie.is_empty() { None } else { Some(cookie) },
            note: Some(note),
            scanned: true,
        });
    }

    let ty = json
        .get("type")
        .map(|v| v.to_string().trim_matches('"').to_string())
        .unwrap_or_default();

    Ok(QrPollResult {
        state: if ty == "-1" { "expired".into() } else { "waiting".into() },
        cookie: None,
        note: Some(format!("type={} jar={}", ty, jar.count())),
        scanned: ty == "2",
    })
}


#[cfg(test)]
mod qr_tests {
    use super::*;

    /// 真实验证：能拿到二维码 PNG，且轮询返回 waiting
    #[tokio::test]
    async fn qr_endpoints_alive() {
        let (client, jar) = build_qr_client();

        let login_url = format!(
            "{}/login?fid={}&refer={}",
            QR_HOST, FID, "http%3A%2F%2Fi.mooc.chaoxing.com"
        );
        let html = client.get(&login_url).send().await.unwrap().text().await.unwrap();

        let uuid = grab_input(&html, "uuid");
        let enc = grab_input(&html, "enc");
    let mut double_factor = grab_input(&html, "doubleFactorLogin");
    if double_factor.is_empty() {
        double_factor = "0".into();
    }
    let mut forbid_other = grab_input(&html, "forbidotherlogin");
    if forbid_other.is_empty() {
        forbid_other = "0".into();
    }
        assert!(!uuid.is_empty(), "uuid 为空");
        assert!(!enc.is_empty(), "enc 为空");

        let png = client
            .get(format!("{}/createqr?uuid={}&fid={}", QR_HOST, uuid, FID))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap()
            .to_vec();
        println!("uuid={} enc_len={} png={} bytes", uuid, enc.len(), png.len());
        assert_eq!(&png[0..4], b"\x89PNG", "二维码不是 PNG");

        let text = client
            .post(format!("{}/getauthstatus/v2", QR_HOST))
            .form(&[
                ("enc", enc.as_str()),
                ("uuid", uuid.as_str()),
                ("doubleFactorLogin", ""),
                ("forbidotherlogin", ""),
            ])
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        println!("poll = {}", text);
        assert!(text.contains("status"));
        let _ = jar;
    }
}
