import assert from "node:assert/strict";
import { resolveCanonicalPath } from "./cloudflare-worker.js";

assert.equal(resolveCanonicalPath("/http/CheckoutApiErrorBudgetBurnFast"), "/runbooks/http/error-budget-burn-fast/");
assert.equal(resolveCanonicalPath("/http/CheckoutApiErrorBudgetBurnSlow"), "/runbooks/http/error-budget-burn-slow/");
assert.equal(resolveCanonicalPath("/http/CheckoutApiLatencySLOViolation5m"), "/runbooks/http/latency-slo-violation/");
assert.equal(resolveCanonicalPath("/http/CheckoutApiLatencySLOViolation1h"), "/runbooks/http/latency-slo-violation/");
assert.equal(resolveCanonicalPath("/http/CheckoutApiLatencySLOViolation6h"), "/runbooks/http/latency-slo-violation/");
assert.equal(resolveCanonicalPath("/http/CheckoutApiSaturationHighCpuUtilizationRatio"), "/runbooks/http/saturation-high/");
assert.equal(resolveCanonicalPath("/worker/PayoutWorkerErrorBudgetBurnFast"), "/runbooks/worker/error-budget-burn-fast/");
assert.equal(resolveCanonicalPath("/http/UnknownCustomAlert"), null);
assert.equal(resolveCanonicalPath("/"), null);
assert.equal(resolveCanonicalPath("/http"), null);

console.log("all redirect resolution tests passed");
