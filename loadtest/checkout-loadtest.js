// k6 load test driving demo-checkout-service through the two scenarios
// docs/game-day-checklist.md needs: sustained "normal" traffic, and a
// controlled error-rate spike hard enough to trip the fast-burn
// ErrorBudgetBurnFast alert (14.4x burn rate -- see
// obs-alert-rule-templates/README.md).
//
// Usage:
//
//   # 1. baseline: healthy traffic only, proves dashboards/metrics work
//   k6 run -e BASE_URL=http://localhost:8080 -e SCENARIO=baseline checkout-loadtest.js
//
//   # 2. incident: sets the service's failure rate high, then hammers it
//   k6 run -e BASE_URL=http://localhost:8080 -e SCENARIO=incident checkout-loadtest.js
//
// SCENARIO=incident is what docs/game-day-checklist.md's step 3 runs.
// It does NOT rely on k6 injecting failures itself -- it calls
// demo-checkout-service's own POST /admin/failure-rate first (see that
// service's README for why: making the *server* fail is more realistic
// than making the *client* pretend some requests didn't happen) and then
// just generates volume.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const SCENARIO = __ENV.SCENARIO || "baseline";

// Fast-burn needs BOTH the 1h and 5m windows to exceed
// 14.4 * (1 - availability_target). demo-checkout-service's manifest
// (../demo/demo-checkout-service/observability.yaml) sets
// availability_target=0.999, so the threshold is 14.4 * 0.001 = 0.0144
// (1.44%). INCIDENT_FAILURE_RATE is set far above that so the alert
// fires quickly and unambiguously rather than hovering near the edge.
const INCIDENT_FAILURE_RATE = 0.5;

const errorRate = new Rate("checkout_client_observed_errors");

export const options =
  SCENARIO === "incident"
    ? {
        scenarios: {
          incident_traffic: {
            executor: "constant-arrival-rate",
            rate: 20,
            timeUnit: "1s",
            duration: "8m", // comfortably past the 5m short window + 2m `for:` in ErrorBudgetBurnFast
            preAllocatedVUs: 20,
            maxVUs: 50,
          },
        },
        thresholds: {
          // This is an *expected* failure threshold, not a test-passing
          // one -- see the note at the bottom of this file.
          checkout_client_observed_errors: ["rate>0.3"],
        },
      }
    : {
        scenarios: {
          baseline_traffic: {
            executor: "constant-arrival-rate",
            rate: 5,
            timeUnit: "1s",
            duration: "2m",
            preAllocatedVUs: 5,
            maxVUs: 10,
          },
        },
        thresholds: {
          checkout_client_observed_errors: ["rate<0.01"],
        },
      };

export function setup() {
  if (SCENARIO === "incident") {
    const res = http.post(`${BASE_URL}/admin/failure-rate`, JSON.stringify({ rate: INCIDENT_FAILURE_RATE }), {
      headers: { "Content-Type": "application/json" },
    });
    check(res, { "failure-rate injection accepted": (r) => r.status === 200 });
    console.log(`[setup] demo-checkout-service failure rate set to ${INCIDENT_FAILURE_RATE}`);
  }
}

export default function () {
  const res = http.post(`${BASE_URL}/checkout`, null);
  const ok = check(res, { "status is 200 or 500 (never a network error)": (r) => r.status === 200 || r.status === 500 });
  errorRate.add(res.status === 500);
  if (!ok) {
    console.error(`unexpected response: ${res.status} ${res.body}`);
  }
  sleep(0.1);
}

export function teardown() {
  if (SCENARIO === "incident") {
    // Stop injecting failures once the load test itself ends -- the
    // *alert* should still be firing (it has its own `for:` duration and
    // Alertmanager `resolve_timeout`), this only stops making things worse.
    // See docs/game-day-checklist.md step 3's cleanup note.
    http.post(`${BASE_URL}/admin/failure-rate`, JSON.stringify({ rate: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
    console.log("[teardown] demo-checkout-service failure rate reset to 0");
  }
}

// Note on thresholds: SCENARIO=incident's threshold
// (checkout_client_observed_errors rate>0.3) is deliberately a *sanity
// check that the injection worked*, not a pass/fail gate on the
// service's health -- a "failed" k6 run in this scenario is expected and
// fine to ignore; what matters is whatever docs/game-day-checklist.md's
// manual verification steps find in Alertmanager/Slack/the portal.
