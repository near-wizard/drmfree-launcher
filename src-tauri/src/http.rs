//! Shared HTTP client for every outbound request this app makes (Steam/GOG
//! cover art lookups, the GOG catalog, the community backend). A single
//! `reqwest::Client` reused across calls (not `Client::new()` per request)
//! so connection pooling actually works, built once with an explicit
//! timeout.
//!
//! The timeout matters more than it might look: without one, `reqwest`
//! waits indefinitely on a hung connection (a flaky network, a captive
//! portal, a firewall that drops packets instead of rejecting them). Every
//! caller here is awaited directly from a Tauri command with no cancel
//! path of its own, so a hang doesn't fail fast — it leaves whatever
//! "Loading..."/"Checking..." spinner triggered it stuck forever with no
//! way for the user to tell a slow request from a frozen app.

use std::sync::OnceLock;
use std::time::Duration;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// The shared client. Falls back to `reqwest::Client::new()` (no explicit
/// timeout) only if building the configured client somehow fails — that's
/// never expected in practice (the only failure modes are TLS backend
/// init issues, which would already be fatal elsewhere), but a command
/// silently getting an untimed-out client beats a `.expect()` panic
/// crashing the whole app over an HTTP client builder.
pub fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

#[cfg(test)]
mod tests {
    use super::client;

    // Not a behavioral assertion about timing (that'd mean a real slow
    // network call, not worth the flakiness in a unit test) — just a
    // guard that the shared client keeps building successfully and that
    // repeated calls actually reuse the same instance rather than
    // constructing a new client (and thus a new connection pool) every
    // time, which was the whole point of centralizing this.
    #[test]
    fn client_is_reused_across_calls() {
        let a = client() as *const reqwest::Client;
        let b = client() as *const reqwest::Client;
        assert_eq!(a, b);
    }
}
