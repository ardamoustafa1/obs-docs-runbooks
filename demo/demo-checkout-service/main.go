// Command demo-checkout-service is the fixture the game day checklist
// (../../docs/game-day-checklist.md) uses to prove the platform end to
// end: a fake HTTP service instrumented with obs-instrumentation-sdk's Go
// library, with a debug-only endpoint to dial its error rate up and down
// on demand (so a load test can drive it into a burn-rate alert without a
// redeploy). Never ship the /admin/failure-rate pattern in a real service
// -- see the warning on that handler below.
package main

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/acme/obs-instrumentation-sdk/go/httpmetrics"
	"github.com/acme/obs-instrumentation-sdk/go/metrics"
)

// failureRateBits stores a float64 failure probability (0..1) as raw bits
// so it can be read/written atomically from concurrent requests.
var failureRateBits atomic.Uint64

func failureRate() float64 {
	return math.Float64frombits(failureRateBits.Load())
}

func setFailureRate(rate float64) {
	failureRateBits.Store(math.Float64bits(rate))
}

func main() {
	reg, err := metrics.New(metrics.Config{})
	if err != nil {
		log.Fatal(err)
	}
	mw := httpmetrics.New(reg, httpmetrics.Config{})

	mux := http.NewServeMux()

	// The endpoint the load test (../../loadtest/checkout-loadtest.js)
	// exercises. Latency is randomized a little so the p99 latency panel
	// has something to show; failureRate controls what fraction of
	// requests return 500.
	mux.HandleFunc("POST /checkout", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(time.Duration(20+rand.Intn(60)) * time.Millisecond)
		if rand.Float64() < failureRate() {
			http.Error(w, `{"error":"payment provider timeout"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// WARNING: this endpoint exists only so a game day exercise can
	// inject failures on demand without a redeploy (see
	// docs/game-day-checklist.md step 3). It is unauthenticated and must
	// never exist in a real service or a real environment -- this demo
	// is only ever run in a disposable dev/game-day namespace, never
	// staging or prod.
	mux.HandleFunc("POST /admin/failure-rate", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Rate float64 `json:"rate"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Rate < 0 || body.Rate > 1 {
			http.Error(w, `{"error":"rate must be a JSON body {\"rate\": 0.0-1.0}"}`, http.StatusBadRequest)
			return
		}
		setFailureRate(body.Rate)
		log.Printf("failure rate set to %.2f", body.Rate)
		w.WriteHeader(http.StatusOK)
	})

	mux.Handle("GET /metrics", reg.Handler())

	server := &http.Server{Addr: ":8080", Handler: mw.Handler(mux)}
	log.Println("demo-checkout-service listening on :8080")
	log.Fatal(server.ListenAndServe())
}
