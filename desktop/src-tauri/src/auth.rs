use base64::Engine;
use tauri::webview::Cookie;

const BLAZE_AUTH_COOKIE: &str = "blaze-auth-token";

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
