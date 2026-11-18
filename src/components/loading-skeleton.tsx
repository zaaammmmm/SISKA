export function RouteSkeleton({ role = "public" }: { role?: "public" | "user" | "admin" }) {
  const isAppShell = role === "user" || role === "admin";

  return (
    <div className="page-loading-shell" aria-live="polite" aria-busy="true" role="status">
      {isAppShell ? (
        <div className="app-loading-shell">
          <aside className="app-loading-sidebar" aria-hidden="true">
            <div className="skeleton skeleton-logo" />
            <div className="skeleton skeleton-nav" />
            <div className="skeleton skeleton-nav" />
            <div className="skeleton skeleton-nav active" />
            <div className="skeleton skeleton-nav" />
            <div className="skeleton skeleton-nav" />
            <div className="skeleton skeleton-nav" />
            <div className="skeleton skeleton-footer" />
          </aside>

          <div className="app-loading-main">
            <header className="app-loading-topbar" aria-hidden="true">
              <div className="skeleton skeleton-chip" />
              <div className="app-loading-topbar-right">
                <div className="skeleton skeleton-pill" />
                <div className="skeleton skeleton-avatar" />
              </div>
            </header>

            <main className="app-loading-content">
              <div className="loading-page-head">
                <div>
                  <div className="skeleton skeleton-title large" />
                  <div className="skeleton skeleton-line short" />
                </div>
                <div className="skeleton skeleton-button action" />
              </div>

              <div className="loading-stats-grid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className={`skeleton loading-stat ${index === 0 ? "featured" : ""}`} />
                ))}
              </div>

              <div className="loading-section-head">
                <div className="skeleton skeleton-title small" />
                <div className="loading-section-actions">
                  <div className="skeleton skeleton-line xshort" />
                  <div className="skeleton skeleton-line xshort" />
                </div>
              </div>

              <div className="card skeleton-card-table">
                <div className="skeleton skeleton-table-head" />
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="skeleton skeleton-table-row" />
                ))}
              </div>

              <div className="loading-help-grid">
                <div className="skeleton loading-help-card" />
                <div className="skeleton loading-help-card" />
              </div>
            </main>
          </div>
        </div>
      ) : (
        <div className="public-loading-wrap">
          <div className="public-loading-card" aria-hidden="true">
            <header className="loading-public-header">
              <div className="skeleton skeleton-logo small" />
              <div className="loading-public-nav">
                <div className="skeleton skeleton-line xshort" />
                <div className="skeleton skeleton-line xshort" />
                <div className="skeleton skeleton-line xshort active" />
                <div className="skeleton skeleton-line xshort" />
              </div>
              <div className="loading-public-actions">
                <div className="skeleton skeleton-button small" />
                <div className="skeleton skeleton-button small accent" />
              </div>
            </header>

            <section className="loading-hero">
              <div className="loading-hero-copy">
                <div className="skeleton skeleton-title hero" />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line short" />
                <div className="loading-cta-row">
                  <div className="skeleton skeleton-button large" />
                  <div className="skeleton skeleton-button large ghost" />
                </div>
                <div className="loading-facts-row">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="skeleton skeleton-line fact" />
                  ))}
                </div>
              </div>

              <div className="skeleton loading-preview" />
            </section>

            <div className="skeleton loading-note" />

            <section className="loading-bento-grid">
              <div className="skeleton loading-bento-card tall" />
              <div className="skeleton loading-bento-card" />
              <div className="skeleton loading-bento-card" />
              <div className="skeleton loading-bento-card tall" />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
