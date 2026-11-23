# Yeni bir takımın platforma onboard olma rehberi

Bu rehber, bir takımın servisini bu platforma (dashboard + alert + katalog
kaydı + portal görünürlüğü) tam olarak bağlamak için izlediği adımları
sırayla anlatır. Tahmini süre: ilk kez yapan bir takım için yarım gün,
tecrübeli bir takım için 1-2 saat.

## Ön koşullar

- Servisiniz `obs-instrumentation-sdk`'nın üç kütüphanesinden birini
  (Go/Node/Java) entegre etmiş olmalı -- golden-signal metrikleri
  standart isimlerle export etmiyorsa hiçbir dashboard/alert doğru
  çalışmaz. Bkz. `obs-instrumentation-sdk`'nın kendi quickstart'ları.
- Servisinizin `/metrics` endpoint'i, cluster'ınızdaki Prometheus/Prometheus
  Operator tarafından zaten scrape ediliyor olmalı (ya elle bir
  `ServiceMonitor` ile, ya da aşağıdaki adım 1'de `scrapeConfig` alanını
  doldurarak `obs-onboarding-controller`'ın sizin için oluşturmasıyla).

## Adım 1: `observability.yaml`'ı yazın

Servis repo'nuzun köküne `observability.yaml` ekleyin. Şema referansı:
`obs-manifest-schema/schemas/v2/service-observability.schema.json`.
Minimal bir http servisi için:

```yaml
apiVersion: obs.acme.com/v2
kind: ServiceObservability
metadata:
  name: checkout-api
spec:
  serviceType: http          # http | grpc | worker | batch | database
  environment: prod          # dev | staging | prod
  slo:
    availability_target: 0.999   # bkz. glossary.md "SLO"
    latency_target_ms: 300
    latency_percentile: 99
  goldenSignals:
    trafficMetric: http_server_requests_total
    errorMetric: http_server_request_errors_total
    latencyMetric: http_server_request_duration_seconds
    saturationMetrics:
      - cpu_utilization_ratio
      - memory_utilization_ratio
  dashboards:
    template: http-service-v2
  alerting:
    burnRateAlerts: true
  ownership:
    team: team-checkout
    slackChannel: "#checkout-alerts"
    pagerDutyService: checkout-production
  scrapeConfig:
    selector:
      matchLabels:
        app: checkout-api
    port: http-metrics
```

**Metrik isimleri elle yazmayın** -- `obs-instrumentation-sdk` kullanıyorsanız
bu isimler zaten sabit (bkz. o repo'nun `CONTRACT.md`'si); yukarıdaki
`goldenSignals` alanına olduğu gibi kopyalayın.

`worker`/`batch` servis tipleri için `latencyMetric` yerine
`processingDurationMetric` kullanılır -- şema bunu zorunlu kılar, yanlış
alanı doldurursanız bir sonraki adımdaki CI kontrolü hata verir.

## Adım 2: PR'ı açın

```bash
git checkout -b add-observability-yaml
git add observability.yaml
git commit -m "obs: add observability.yaml for checkout-api"
git push origin add-observability-yaml
gh pr create --title "Add observability.yaml for checkout-api" --body "Onboarding to the platform, see obs-docs-runbooks/onboarding/onboarding-guide.md"
```

PR açıldığında `obs-manifest-schema`'nın GitHub Action'ı (bkz. o repo'nun
`action.yml`'i) otomatik çalışır ve:

- Şema ihlallerini (yanlış tip, eksik zorunlu alan, karakter seti ihlali)
  **hata** olarak PR'a yazar.
- Naming convention ihlallerini (bkz. `naming-convention.md`) **warning**
  olarak yazar; `warnings-as-errors: true` politikası açık repolarda bunlar
  da PR'ı bloklar.

CI yeşil olmadan merge etmeyin -- şema hatası olan bir manifest,
`obs-onboarding-controller`'ın reconcile döngüsünde sessizce başarısız
olur, PR aşamasında yakalamak çok daha ucuzdur.

## Adım 3: `ServiceObservability` CR'sini uygulayın

`observability.yaml` merge olduktan sonra, bu dosyanın Kubernetes-native
karşılığı olan `ServiceObservability` CR'sini cluster'a uygulayın (CI/CD
pipeline'ınız bunu otomatik yapıyor olabilir; yapmıyorsa elle):

```bash
kubectl apply -n checkout -f - <<'EOF'
apiVersion: obs.acme.com/v1
kind: ServiceObservability
metadata:
  name: checkout-api
  namespace: checkout
spec:
  # observability.yaml ile birebir aynı alanlar, kubebuilder marker'larıyla
  # doğrulanır -- bkz. obs-onboarding-controller/api/v1
  ...
EOF
```

`spec.environment`'ın (`prod`), cluster'ınızda zaten var olan bir
`ObservabilityEnvironment` objesine karşılık geldiğinden emin olun
(platform ekibi bunu genelde cluster başına önceden kurar):

```bash
kubectl get observabilityenvironment prod
```

Yoksa platform/SRE takımınızdan `ObservabilityEnvironment` kurulumunu
isteyin -- bu, Grafana/Prometheus/catalog endpoint'lerini taşıyan
cluster-scoped bir kaynaktır (bkz. `obs-onboarding-controller`'ın
"environment overlay" tasarımı).

## Adım 4: İlk dashboard'ı doğrulayın

```bash
kubectl get serviceobservability checkout-api -n checkout -o jsonpath='{.status.conditions}'
```

`DashboardSynced` condition'ının `status: "True"` olduğunu doğrulayın.
Sonra:

1. Developer Portal'ı açın: `https://portal.acme.internal/services/prod/checkout-api`.
2. Latency/Traffic/Errors/Saturation panellerinin **veri gösterdiğini**
   doğrulayın -- boş bir panel genelde ya metrik isimlerinin
   `observability.yaml`'daki `goldenSignals` alanıyla eşleşmediği ya da
   `/metrics` endpoint'inin henüz scrape edilmediği anlamına gelir.
3. Error budget'ın `%100`'e yakın gösterdiğini doğrulayın (yeni bir servis
   için beklenen budget durumu budur; `%0` görüyorsanız muhtemelen
   `errorMetric`/`trafficMetric` ters etiketlenmiş ya da servis gerçekten
   hata üretiyor).

## Adım 5: İlk alert testini yapın (game day / chaos testi)

Bir alertin **hiç tetiklenmemiş olması**, doğru yapılandırıldığının kanıtı
değildir -- yanlış yapılandırılmış bir alert de sessiz kalır. Onboarding'in
son adımı, kontrollü bir şekilde bir alert'i **kasıtlı olarak tetiklemek**
ve tüm zincirin (Prometheus → Alertmanager → PagerDuty/Slack → runbook
linki) uçtan uca çalıştığını kanıtlamaktır.

### Önerilen game day senaryosu: kontrollü hata enjeksiyonu

1. **Staging'de** (asla doğrudan prod'da başlamayın), servise kısa süreli
   bir hata enjekte edin. Seçenekler:
   - Servisin bir feature flag'i varsa, belirli bir yüzde istekte
     kasıtlı `500` döndüren bir test flag'i açın.
   - Bir chaos engineering aracı kullanıyorsanız (örn. Chaos Mesh, Litmus),
     servise kısa süreli bir "HTTP fault injection" (belirli bir yüzde
     istekte 500 dönme) deneyi tanımlayın.
   - Basit bir alternatif: servisin bir test endpoint'i varsa
     (`/debug/fail?rate=0.5` gibi, yalnızca staging'de aktif), doğrudan
     `curl` ile tetikleyin.
2. Hata oranını, `ErrorBudgetBurnFast`'ın eşiğini (staging'deki
   `availability_target`'a göre `14.4 × (1 - target)`) aşacak şekilde
   en az **7-8 dakika** sürdürün (5m kısa pencerenin dolması + `for: 2m`).
3. **Doğrulayın**:
   - [ ] Prometheus'ta alert `pending` sonra `firing` durumuna geçti mi?
     (`http://prometheus.staging.acme.internal/alerts`)
   - [ ] Alertmanager'a düştü mü? (`http://alertmanager.staging.acme.internal`)
   - [ ] PagerDuty/Slack'e doğru kanala gitti mi? (`ownership.slackChannel`/
     `pagerDutyService` doğru mu?)
   - [ ] Bildirim içindeki `runbook_url` linki gerçekten açılıyor mu ve
     doğru runbook'a mı gidiyor mu (`https://runbooks.acme.com/http/<AlertName>`)?
   - [ ] Developer Portal'daki servis sayfası aktif alert'i gösteriyor mu?
4. Hata enjeksiyonunu durdurun, alert'in `resolved` durumuna geçtiğini
   doğrulayın.
5. Bulgularınızı kısa bir "game day report" olarak takımın kendi
   dokümantasyonuna (bu repo'ya değil -- bu repo yalnızca genel runbook'ları
   tutar) ekleyin: hangi adımda sürpriz oldu, runbook'ta eksik/yanlış bir
   şey var mıydı.

### Neden bu adım zorunlu olmalı

Bir alert kuralının PromQL'i doğru yazılmış olsa bile, etiketleme
(`service`/`environment` label'ları), routing (Alertmanager'ın
`ownership`'e göre doğru kanala yönlendirmesi) veya runbook URL'sinin
gerçekten var olması gibi zincirin başka herhangi bir halkası bozuk
olabilir. Bu adımı atlayan bir takım, ilk gerçek olayda "alert hiç
gelmedi" veya "runbook linki 404 verdi" sürprizini üretim ortamında
yaşar.

## Sık karşılaşılan sorunlar

| Belirti | Muhtemel neden |
|---|---|
| Dashboard boş, hiç veri yok | `goldenSignals` alanındaki metrik isimleri servisin gerçekte export ettiğiyle eşleşmiyor; `/metrics` henüz scrape edilmiyor |
| `DashboardSynced: False` | Grafana API'sine erişim/token sorunu; `kubectl describe serviceobservability` ile `status.conditions[].message`'a bakın |
| Alert hiç tetiklenmiyor (beklenmedik şekilde) | `availability_target` çok gevşek ayarlanmış olabilir; ya da metrik gerçekten hatasız |
| Runbook linki 404 | Bu repo'da o alert tipi için henüz bir runbook yazılmamış -- bkz. `authoring-templates/runbook-template.md`, bir PR açın |
