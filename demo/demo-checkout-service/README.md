# demo-checkout-service

A disposable, fake HTTP service instrumented with
[obs-instrumentation-sdk](../../../obs-instrumentation-sdk)'s Go library.
It exists for exactly one purpose: being the fixture
[../../docs/game-day-checklist.md](../../docs/game-day-checklist.md)
drives end to end through the whole platform (manifest lint → dashboard →
alert → Slack → portal → decommission). Do not run this in a real/shared
environment -- it ships a debug endpoint that intentionally has no
authentication (see the warning in `main.go`).

## What it does

- `POST /checkout` -- the "business" endpoint. Randomized 20-80ms latency;
  fails with an HTTP 500 at whatever rate `/admin/failure-rate` last set
  (0% by default).
- `POST /admin/failure-rate` -- body `{"rate": 0.0-1.0}`. Lets the game day
  script or a human dial the error rate up and down on demand, so a load
  test can drive the service into a burn-rate alert without a redeploy.
- `GET /metrics` -- Prometheus exposition, via
  `obs-instrumentation-sdk/go`'s `httpmetrics` middleware: exactly
  `http_server_requests_total`, `http_server_request_errors_total`,
  `http_server_request_duration_seconds`, `http_server_active_requests`
  (see that repo's `CONTRACT.md`).
- `GET /healthz` -- liveness/readiness probe target.

## Run locally

```bash
go run .
curl -X POST localhost:8080/checkout
curl -X POST localhost:8080/admin/failure-rate -d '{"rate":0.3}'
curl localhost:8080/metrics
```

## Build the container image

Build context is the workspace root holding both
`obs-instrumentation-sdk/` and `obs-docs-runbooks/` as siblings (see
[Dockerfile](Dockerfile)'s own header comment for why):

```bash
docker build -f obs-docs-runbooks/demo/demo-checkout-service/Dockerfile \
  -t demo-checkout-service:gameday .
docker run -p 8080:8080 demo-checkout-service:gameday
```

## Files in this directory

| File | Role |
|---|---|
| `main.go`, `go.mod` | the service itself |
| `observability.yaml` | the obs-manifest-schema v2 manifest a real service repo would commit -- validated with `obsctl validate` in the game day checklist's step 1 |
| `serviceobservability-cr.yaml` | the Kubernetes `ServiceObservability` CR obs-onboarding-controller actually reconciles (adds `scrapeConfig`, a K8s-only extension `observability.yaml` doesn't model) |
| `deployment.yaml` | Namespace + Deployment + Service for the `demo-gameday` namespace |
