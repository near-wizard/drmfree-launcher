import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GameList } from "./components/GameList";
import { AddManualGameForm } from "./components/AddManualGameForm";
import { OnboardingLightbox } from "./components/OnboardingLightbox";
import { hasSeenOnboarding, markOnboardingSeen } from "./lib/onboarding";
import { Mascot } from "./components/Mascot";
import { PawIcon } from "./components/PawIcon";
import { StoreView } from "./store/StoreView";
import { WishlistView } from "./wishlist/WishlistView";
import { FreedomDashboard } from "./components/FreedomDashboard";
import { loadLastPlayedMap, recordLaunch } from "./lib/lastPlayed";
import { getCachedMatch } from "./lib/gogMatchCache";
import { checkGogMatch } from "./lib/gogUpgradeCheck";
import {
  addManualGame,
  loadManualGames,
  manualEntryToGame,
  MANUAL_PROVIDER,
  type ManualGameEntry,
} from "./lib/manualGames";
import { buildReportIssueUrl } from "./lib/reportIssue";
import {
  checkForUpdate,
  installUpdate,
  RELEASES_PAGE_URL,
  type UpdateCheckResult,
} from "./lib/checkForUpdate";
import { loadLastTab, saveLastTab, type Tab } from "./lib/lastTab";
import {
  denyConsent,
  getConsentStatus,
  grantConsent,
  initAnalyticsIfConsented,
  track,
  type ConsentStatus,
} from "./lib/analytics";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import type { DrmStatus, Game } from "./types/game";
import type { ProviderInfo } from "./types/provider";
import "./App.css";

type SortBy = "name" | "provider" | "recent";

function App() {
  const [tab, setTabState] = useState<Tab>(() => loadLastTab());
  function setTab(next: Tab) {
    setTabState(next);
    saveLastTab(next);
    track("tab_changed", { tab: next });
  }
  const [games, setGames] = useState<Game[]>([]);
  // "manual" is never returned by the backend's list_providers (it has
  // no GameProvider — see lib/manualGames.ts), so its label is seeded
  // here rather than waiting on that fetch.
  const [providerLabels, setProviderLabels] = useState<Record<string, string>>({
    [MANUAL_PROVIDER]: "Manual",
  });
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [drmFilter, setDrmFilter] = useState<DrmStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [lastPlayed, setLastPlayed] = useState<Record<string, number>>(() => loadLastPlayedMap());
  const [bulkCheckProgress, setBulkCheckProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [cacheVersion, setCacheVersion] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(() => getConsentStatus());
  const [manualGames, setManualGames] = useState<ManualGameEntry[]>(() => loadManualGames());
  const [showAddForm, setShowAddForm] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Detected (games) + manually-added (manualGames) merged into one
  // library — manual entries live in their own localStorage-backed
  // state (lib/manualGames.ts) rather than the backend's game list, so
  // a Rescan can't ever wipe them out. See decision 0019.
  const allGames = useMemo(
    () => [...games, ...manualGames.map(manualEntryToGame)],
    [games, manualGames],
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Game[]>("list_games");
      setGames(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    invoke<ProviderInfo[]>("list_providers").then((providers) => {
      setProviderLabels((prev) => ({
        ...prev,
        ...Object.fromEntries(providers.map((p) => [p.id, p.display_name])),
      }));
    });
    refresh();
    // No auto-updater (that needs a signing-key setup of its own) —
    // just a lightweight "is something newer on Releases" check,
    // once per launch. Silently no-ops if the check fails.
    checkForUpdate().then(setUpdateInfo);
    // No-ops unless a previous session already granted consent — never
    // sends anything on first launch before the banner is answered.
    initAnalyticsIfConsented();
    track("app_opened");
  }, []);

  // Debounced, and only the fact a search happened — never the query
  // text itself (could reveal which specific game someone searched for).
  useEffect(() => {
    if (query.trim() === "") return;
    const handle = setTimeout(() => track("library_searched"), 500);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (updateInfo?.updateAvailable) {
      track("update_banner_shown", { latest_version: updateInfo.latestVersion });
    }
  }, [updateInfo]);

  function onGrantConsent() {
    grantConsent();
    setConsentStatus("granted");
    track("analytics_consent_granted");
  }

  function onDenyConsent() {
    denyConsent();
    setConsentStatus("denied");
  }

  // "/" focuses the search box from anywhere (unless already typing
  // somewhere else); Escape clears and blurs it when it has focus.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (tab !== "library") return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";

      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape" && target === searchInputRef.current) {
        setQuery("");
        searchInputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab]);

  function onRescanClick() {
    track("library_rescanned");
    refresh();
  }

  async function launch(game: Game) {
    // Composite key, not just game.id — ids are only unique within a
    // single provider (a Steam appid and a GOG product id can collide
    // numerically), and GameList/lastPlayed already key this way.
    setLaunchingId(`${game.provider}:${game.id}`);
    setError(null);
    track("game_launched", { provider: game.provider });
    try {
      // Manual entries have no backend GameProvider to route through
      // (they're not detected, just user-declared) — launch directly
      // via the OS's own file-open handling instead of the
      // provider-registry-backed launch_game command.
      if (game.provider === MANUAL_PROVIDER) {
        if (!game.exe_path) throw new Error(`No executable set for ${game.name}`);
        await openPath(game.exe_path);
      } else {
        await invoke("launch_game", { provider: game.provider, id: game.id });
      }
      recordLaunch(game.provider, game.id);
      setLastPlayed(loadLastPlayedMap());
    } catch (e) {
      setError(String(e));
    } finally {
      setLaunchingId(null);
    }
  }

  function onAddManualGame(input: { name: string; exePath: string; installDir: string }) {
    addManualGame({
      name: input.name,
      exePath: input.exePath || null,
      installDir: input.installDir || null,
    });
    setManualGames(loadManualGames());
    setShowAddForm(false);
    track("manual_game_added");
  }

  function onRemoveManualGame() {
    setManualGames(loadManualGames());
  }

  // Still opt-in overall (the user explicitly clicks this), but checks
  // a whole library in one go instead of requiring one click per game —
  // the per-card "Check GOG" button alone doesn't scale past a handful
  // of titles. A small delay between requests avoids hammering GOG's
  // API; already-cached games are skipped so this only ever does new
  // work.
  async function checkLibraryForDrmFree() {
    const toCheck = allGames.filter(
      (g) => g.provider !== "gog" && g.provider !== MANUAL_PROVIDER && !getCachedMatch(g.provider, g.id),
    );
    if (toCheck.length === 0) return;

    track("bulk_gog_check_started", { count: toCheck.length });
    setBulkCheckProgress({ done: 0, total: toCheck.length });
    for (let i = 0; i < toCheck.length; i++) {
      await checkGogMatch(toCheck[i]);
      setBulkCheckProgress({ done: i + 1, total: toCheck.length });
      if (i < toCheck.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    setBulkCheckProgress(null);
    setCacheVersion((v) => v + 1);
  }

  // cacheVersion isn't read inside the memo body — it exists purely to
  // force recomputation after a bulk/individual check writes to
  // localStorage, which useMemo has no other way to observe.
  const drmFreeMatchCount = useMemo(
    () =>
      allGames.filter(
        (g) => g.provider !== "gog" && getCachedMatch(g.provider, g.id)?.status === "found",
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allGames, cacheVersion],
  );

  const availableProviders = useMemo(
    () => Array.from(new Set(allGames.map((g) => g.provider))).sort(),
    [allGames],
  );

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allGames
      .filter((g) => providerFilter === "all" || g.provider === providerFilter)
      .filter((g) => drmFilter === "all" || g.drm.status === drmFilter)
      .filter((g) => q === "" || g.name.toLowerCase().includes(q));

    switch (sortBy) {
      case "provider":
        return filtered.sort(
          (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
        );
      case "recent":
        return filtered.sort((a, b) => {
          const aPlayed = lastPlayed[`${a.provider}:${a.id}`] ?? 0;
          const bPlayed = lastPlayed[`${b.provider}:${b.id}`] ?? 0;
          return bPlayed - aPlayed || a.name.localeCompare(b.name);
        });
      case "name":
      default:
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [allGames, query, providerFilter, drmFilter, sortBy, lastPlayed]);

  // Enter-to-launch from the search box targets the top visible result —
  // there's no per-card keyboard focus model, so this is the "quick
  // launch" shortcut rather than full list navigation.
  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const top = visibleGames[0];
    if (top && launchingId === null) launch(top);
  }

  async function onUpdateNow() {
    setUpdateInstalling(true);
    setUpdateError(false);
    track("update_install_started");
    try {
      await installUpdate();
      // installUpdate() relaunches the app on success — nothing after
      // this point normally runs.
    } catch (e) {
      console.error("update install failed:", e);
      setUpdateInstalling(false);
      setUpdateError(true);
      track("update_install_failed");
    }
  }

  async function reportIssue() {
    track("report_issue_clicked");
    openUrl(await buildReportIssueUrl());
  }

  return (
    <main className="container">
      {consentStatus === "unset" && (
        <div className="consent-banner">
          <span>
            Help improve DRM-Free Launcher with anonymous usage analytics? We'd see which
            features get used (e.g. "Store tab opened"), never your specific games, searches, or
            any personal info. Off by default — change anytime from "Analytics" below.
          </span>
          <div className="consent-banner-actions">
            <button onClick={onGrantConsent}>Allow</button>
            <button className="consent-banner-decline" onClick={onDenyConsent}>
              No thanks
            </button>
          </div>
        </div>
      )}
      {updateInfo?.updateAvailable && !updateDismissed && (
        <div className="update-banner">
          <span>
            {updateError
              ? "Update failed to install. "
              : `Update available: v${updateInfo.latestVersion} (you're on v${updateInfo.currentVersion})`}
            {updateError && (
              <>
                {" "}
                <a href="#" onClick={(e) => { e.preventDefault(); openUrl(RELEASES_PAGE_URL); }}>
                  Grab it from Releases instead
                </a>
                .
              </>
            )}
          </span>
          <div className="update-banner-actions">
            {!updateError && (
              <button onClick={onUpdateNow} disabled={updateInstalling}>
                {updateInstalling && <span className="spinner" aria-hidden="true" />}
                {updateInstalling ? "Installing..." : "Update Now"}
              </button>
            )}
            <button
              className="update-banner-dismiss"
              onClick={() => {
                track("update_banner_dismissed");
                setUpdateDismissed(true);
              }}
              disabled={updateInstalling}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="app-header-title">
          <Mascot />
          <div>
            <h1>{tab === "library" ? "Your Library" : tab === "store" ? "Store" : "Wishlist"}</h1>
            {tab === "library" && allGames.length > 0 && (
              <p className="header-subtitle">
                {allGames.length} game{allGames.length === 1 ? "" : "s"} across{" "}
                {availableProviders.length} source{availableProviders.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
        {tab === "library" && (
          <button onClick={onRescanClick} disabled={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {!loading && <PawIcon />}
            {loading ? "Scanning..." : "Rescan"}
          </button>
        )}
      </header>

      <nav className="tab-bar">
        <div className="tab-bar-tabs">
          <button
            className={`tab-button ${tab === "library" ? "tab-button-active" : ""}`}
            onClick={() => setTab("library")}
          >
            Library
          </button>
          <button
            className={`tab-button ${tab === "store" ? "tab-button-active" : ""}`}
            onClick={() => setTab("store")}
          >
            Store
          </button>
          <button
            className={`tab-button ${tab === "wishlist" ? "tab-button-active" : ""}`}
            onClick={() => setTab("wishlist")}
          >
            Wishlist
          </button>
        </div>
        <div className="tab-bar-links">
          <button
            className="report-issue-button"
            onClick={() => (consentStatus === "granted" ? onDenyConsent() : onGrantConsent())}
            title="Anonymous usage analytics — click to change"
          >
            Analytics: {consentStatus === "granted" ? "On" : "Off"}
          </button>
          <button className="report-issue-button" onClick={reportIssue}>
            Request a change
          </button>
          <button
            className="report-issue-button"
            onClick={() => {
              track("onboarding_reopened");
              setShowOnboarding(true);
            }}
          >
            Tour
          </button>
        </div>
      </nav>

      {showOnboarding && (
        <OnboardingLightbox
          onDone={() => {
            markOnboardingSeen();
            setShowOnboarding(false);
          }}
        />
      )}

      {/* All three tabs stay mounted (hidden via CSS, not unmounted) so
          the Store tab's search/pagination state and the Wishlist
          tab's loaded results survive switching to Library and back. */}
      <div hidden={tab !== "library"}>
        <FreedomDashboard games={allGames} />
        <div className="library-controls">
          <button
            className="upgrade-check-button"
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? "Cancel" : "+ Add a DRM-free game"}
          </button>
        </div>
        {showAddForm && (
          <AddManualGameForm onAdd={onAddManualGame} onCancel={() => setShowAddForm(false)} />
        )}
        {allGames.length > 0 && (
          <div className="library-controls">
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search your library... (/)"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={onSearchKeyDown}
            />
            <select
              className="provider-filter"
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.currentTarget.value);
                track("library_filter_changed", { type: "provider", value: e.currentTarget.value });
              }}
            >
              <option value="all">All sources ({allGames.length})</option>
              {availableProviders.map((p) => (
                <option key={p} value={p}>
                  {(providerLabels[p] ?? p) +
                    ` (${allGames.filter((g) => g.provider === p).length})`}
                </option>
              ))}
            </select>
            <select
              className="provider-filter"
              value={drmFilter}
              onChange={(e) => {
                setDrmFilter(e.currentTarget.value as DrmStatus | "all");
                track("library_filter_changed", { type: "drm_status", value: e.currentTarget.value });
              }}
              aria-label="Filter library by DRM status"
            >
              <option value="all">All DRM statuses ({allGames.length})</option>
              <option value="drm-free">
                DRM-Free ({allGames.filter((g) => g.drm.status === "drm-free").length})
              </option>
              <option value="drm">DRM ({allGames.filter((g) => g.drm.status === "drm").length})</option>
              <option value="unknown">
                DRM Unknown ({allGames.filter((g) => g.drm.status === "unknown").length})
              </option>
            </select>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.currentTarget.value as SortBy);
                track("library_sort_changed", { sort_by: e.currentTarget.value });
              }}
              aria-label="Sort library by"
            >
              <option value="name">Sort: Name</option>
              <option value="recent">Sort: Recently played</option>
              <option value="provider">Sort: Source</option>
            </select>
          </div>
        )}

        {allGames.length > 0 && (
          <div className="upgrade-summary-bar">
            {bulkCheckProgress ? (
              <span className="upgrade-check-status">
                <span className="spinner" aria-hidden="true" />
                Checking GOG for DRM-free versions... ({bulkCheckProgress.done}/
                {bulkCheckProgress.total})
              </span>
            ) : (
              <>
                <button className="upgrade-check-button" onClick={checkLibraryForDrmFree}>
                  Check library for DRM-free versions
                </button>
                {drmFreeMatchCount > 0 && (
                  <span className="upgrade-summary-count">
                    {drmFreeMatchCount} DRM-free upgrade{drmFreeMatchCount === 1 ? "" : "s"} found
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {error && <p className="error-banner">{error}</p>}
        <GameList
          games={visibleGames}
          onLaunch={launch}
          launchingId={launchingId}
          providerLabels={providerLabels}
          hasAnyGames={allGames.length > 0}
          loading={loading}
          cacheVersion={cacheVersion}
          onMatchChecked={() => setCacheVersion((v) => v + 1)}
          onRemoveManual={onRemoveManualGame}
          onBrowseStore={() => {
            track("empty_state_browse_store_clicked");
            setTab("store");
          }}
        />
      </div>
      <div hidden={tab !== "store"}>
        <StoreView />
      </div>
      <div hidden={tab !== "wishlist"}>
        <WishlistView />
      </div>
    </main>
  );
}

export default App;
