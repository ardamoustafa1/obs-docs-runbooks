/**
 * Cloudflare Worker sitting in front of the GitHub Pages-hosted MkDocs
 * site (runbooks.acme.com). GitHub Pages only serves static files, so the
 * `{ServiceName}{AlertType}` -> generic-alert-type-page redirect this
 * repo's URL convention requires (see ../index.md "Runbook URL
 * konvansiyonu") has to live here, one layer in front of it.
 *
 * Deploy: `wrangler deploy` with a route matching runbooks.acme.com/*.
 * This file has no build step and no dependencies -- copy/paste-deployable.
 */

// Ordered longest-suffix-first so a more specific pattern (e.g. a fixed
// string) is tried before a broader regex that could also match it.
const SUFFIX_RULES = [
  { match: (alertname) => alertname.endsWith("ErrorBudgetBurnFast"), slug: "error-budget-burn-fast" },
  { match: (alertname) => alertname.endsWith("ErrorBudgetBurnSlow"), slug: "error-budget-burn-slow" },
  { match: (alertname) => /LatencySLOViolation(5m|1h|6h)$/.test(alertname), slug: "latency-slo-violation" },
  { match: (alertname) => /SaturationHigh[A-Za-z0-9]+$/.test(alertname), slug: "saturation-high" },
];

/**
 * Resolves an incoming `/{serviceType}/{alertname}` path to the canonical
 * `/runbooks/{serviceType}/{slug}/` page, or null if no known alert-type
 * suffix matches (falls through to MkDocs' own 404 page).
 */
export function resolveCanonicalPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [serviceType, alertname] = parts;

  for (const rule of SUFFIX_RULES) {
    if (rule.match(alertname)) {
      return `/runbooks/${serviceType}/${rule.slug}/`;
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Already a canonical MkDocs path (or the homepage, search index,
    // static assets, ...) -- pass through to GitHub Pages untouched.
    if (url.pathname.startsWith("/runbooks/") || url.pathname === "/" || url.pathname.includes(".")) {
      return fetch(request);
    }

    const canonical = resolveCanonicalPath(url.pathname);
    if (canonical) {
      const target = new URL(canonical, url.origin);
      return Response.redirect(target.toString(), 301);
    }

    // No known alert-type suffix matched: let the origin's own 404 page
    // handle it rather than guessing.
    return fetch(request);
  },
};
