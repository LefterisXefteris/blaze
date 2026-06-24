use base64::Engine;
use cookie::SameSite;
use tauri::webview::Cookie;

const BLAZE_AUTH_COOKIE: &str = "blaze-auth-token";
const AUTH_COOKIE_MAX_AGE_DAYS: i64 = 7;

pub fn parse_auth_cookie_value(raw: &str) -> Option<String> {
    let json = if let Some(encoded) = raw.strip_prefix("base64-") {
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(encoded)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())?
    } else {
        raw.to_string()
    };

    let parsed: serde_json::Value = serde_json::from_str(&json).ok()?;

    if let Some(items) = parsed.as_array() {
        return items
            .first()
            .and_then(|value| value.as_str())
            .map(str::to_string);
    }

    parsed
        .get("access_token")
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

fn chunked_auth_cookie_value(cookies: &[Cookie]) -> Option<String> {
    let mut chunks: Vec<(usize, String)> = Vec::new();

    for cookie in cookies {
        let name = cookie.name();
        if name == BLAZE_AUTH_COOKIE || !name.contains("-auth-token") {
            continue;
        }

        let idx = name
            .rsplit('.')
            .next()
            .and_then(|part| part.parse::<usize>().ok())
            .filter(|_| name.contains('.'))
            .unwrap_or(0);

        chunks.push((idx, cookie.value().to_string()));
    }

    if chunks.is_empty() {
        return None;
    }

    chunks.sort_by_key(|(idx, _)| *idx);
    let combined = chunks.into_iter().map(|(_, value)| value).collect::<String>();
    parse_auth_cookie_value(&combined)
}

pub fn extract_token_from_cookies(cookies: &[Cookie]) -> Option<String> {
    for cookie in cookies {
        if cookie.name() == BLAZE_AUTH_COOKIE {
            if let Some(token) = parse_auth_cookie_value(cookie.value()) {
                return Some(token);
            }
        }
    }

    chunked_auth_cookie_value(cookies)
}

/// Build the blaze-auth-token cookie in the same shape Next.js `setSessionCookie` uses.
pub fn build_auth_cookie(access_token: &str) -> Cookie<'static> {
    let payload = serde_json::json!({ "access_token": access_token }).to_string();
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.as_bytes());
    let value = format!("base64-{encoded}");

    Cookie::build((BLAZE_AUTH_COOKIE, value))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::days(AUTH_COOKIE_MAX_AGE_DAYS))
        .build()
}

fn cookie_domain_from_app_url(app_url: &str) -> Option<String> {
    let without_scheme = app_url
        .trim()
        .strip_prefix("http://")
        .or_else(|| app_url.trim().strip_prefix("https://"))?;
    let host = without_scheme.split('/').next()?.split(':').next()?.trim();
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

/// If desktop has a saved session but the notepad webview lost its cookie, restore it.
pub fn ensure_blaze_webview_auth(
    app_url: &str,
    access_token: &str,
    blaze: &tauri::WebviewWindow,
) -> Result<bool, String> {
    let cookies = blaze.cookies().map_err(|e| e.to_string())?;
    if extract_token_from_cookies(&cookies).as_deref() == Some(access_token) {
        return Ok(false);
    }

    let mut cookie = build_auth_cookie(access_token);
    if let Some(domain) = cookie_domain_from_app_url(app_url) {
        cookie.set_domain(domain);
    }

    blaze.set_cookie(cookie).map_err(|e| e.to_string())?;
    Ok(true)
}
