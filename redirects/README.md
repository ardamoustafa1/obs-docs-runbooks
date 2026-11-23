# Runbook URL redirect layer

Solves the mismatch documented in [../index.md](../index.md#runbook-url-konvansiyonu):
`obs-alert-rule-templates` generates `runbook_url` annotations of the form
`https://runbooks.acme.com/{serviceType}/{ServiceName}{AlertType}`
(service-specific), but this repo writes one runbook per **alert type**
(generic, e.g. `runbooks/http/error-budget-burn-fast.md`). Something has
to strip the service-name prefix and redirect to the canonical page.
MkDocs/GitHub Pages only serve static files -- they cannot do this
matching themselves.

Two equivalent implementations, pick based on where the site is hosted:

| | [cloudflare-worker.js](cloudflare-worker.js) | [nginx-alternative.conf](nginx-alternative.conf) |
|---|---|---|
| Use when | Site published to GitHub Pages, Cloudflare in front of it | Site self-hosted behind an internal nginx ingress |
| Deploy | `wrangler deploy` | `include` inside the `server {}` block |
| Tested | `node test-resolve.mjs` (pure-function unit test, no Cloudflare runtime needed) | manually against the four example paths below |

Both implement the same four rules, matched against the alert's suffix
(never the service name, which is unknown/arbitrary length):

| Alert suffix | Canonical page |
|---|---|
| `...ErrorBudgetBurnFast` | `/runbooks/{serviceType}/error-budget-burn-fast/` |
| `...ErrorBudgetBurnSlow` | `/runbooks/{serviceType}/error-budget-burn-slow/` |
| `...LatencySLOViolation{5m\|1h\|6h}` | `/runbooks/{serviceType}/latency-slo-violation/` |
| `...SaturationHigh<Metric>` | `/runbooks/{serviceType}/saturation-high/` |

Adding a new alert type (e.g. a new saturation metric or a new
`obs-alert-rule-templates` rule) means adding one rule here **and** one
runbook page under `runbooks/<serviceType>/` -- the
`.github/workflows/lint-runbooks.yml` CI check does not enforce this pairing
automatically today; review it by hand when reviewing changes to
`obs-alert-rule-templates`.
