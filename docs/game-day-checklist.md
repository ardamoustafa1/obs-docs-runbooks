---
title: "Game Day: uçtan uca platform doğrulama"
last_reviewed: "2026-09-17"
---

# Game Day: uçtan uca platform doğrulama

Bu, tüm platformun (manifest şeması → onboarding controller → dashboard →
alert kuralları → notification router → developer portal → decommission)
tek bir gerçek senaryo üzerinden uçtan uca çalıştığını kanıtlayan bir
checklist'tir. Fixture: [demo/demo-checkout-service](https://github.com/acme/obs-docs-runbooks/tree/main/demo/demo-checkout-service)
(bkz. o dizinin kendi README'si) ve [loadtest/checkout-loadtest.js](https://github.com/acme/obs-docs-runbooks/blob/main/loadtest/checkout-loadtest.js) --
her ikisi de bu belgeyle birlikte, gerçekten derlenip çalıştırılıp
doğrulanmış olarak bu repoda yaşıyor.

**Ortam**: yalnızca `dev` ortamında, izole/tek kullanımlık bir namespace'te
(`demo-gameday`) çalıştırın. Asla staging veya prod'da çalıştırmayın --
`demo-checkout-service`'in `/admin/failure-rate` endpoint'i kasıtlı olarak
kimlik doğrulaması içermez (bkz. o servisin `main.go`'sundaki uyarı).

**Katılımcılar**: bir facilitator (bu checklist'i takip eden), gözlemlenen
sinyalleri doğrulayan 1-2 kişi daha. Tahmini süre: 45-60 dakika.

## Ön hazırlık

- [ ] `demo-gameday` namespace'i ve bir `ObservabilityEnvironment` (`dev`)
      cluster'da mevcut (bkz. `obs-onboarding-controller`'ın "environment
      overlay" tasarımı) -- yoksa platform ekibinden kurulumunu isteyin.
- [ ] `demo-checkout-service` imajı build edildi ve `dev` cluster'ının
      erişebileceği bir registry'ye push edildi:
      ```bash
      docker build -f obs-docs-runbooks/demo/demo-checkout-service/Dockerfile \
        -t registry.acme.internal/demo/demo-checkout-service:gameday .
      docker push registry.acme.internal/demo/demo-checkout-service:gameday
      ```
- [ ] `obsctl`, `kubectl`, `k6` yerel makinenizde kurulu
      (`brew install k6` / `obs-manifest-schema`'yı klonlayıp
      `go run ./cmd/obsctl`).

## 1. Manifest PR'ı açıldığında lint geçiyor mu?

`demo-checkout-service` gerçek bir servis repo'suymuş gibi davranıyoruz:
`observability.yaml` bir PR'da yaşıyor ve `obs-gitops-pipelines`'ın
reusable `obs-manifest-lint.yml@v1` workflow'u (bkz. o repo'nun
`docs/component-ci-usage.md`'si) tarafından kontrol ediliyor. Bunu yerel
olarak `obsctl` ile simüle edin -- CI'ın çalıştırdığı doğrulama birebir
budur:

- [ ] Şema doğrulaması geçiyor:
      ```bash
      cd obs-manifest-schema
      go run ./cmd/obsctl validate --warnings-as-errors \
        ../obs-docs-runbooks/demo/demo-checkout-service/observability.yaml
      ```
      Beklenen çıktı:
      ```
      .../observability.yaml: valid (obs.acme.com/v2)
      ```
- [ ] Kasıtlı bir hata enjekte edip lint'in gerçekten kırıldığını
      doğrulayın (negatif test -- bir linter'ın "her zaman yeşil" olması,
      çalıştığının kanıtı değildir): `spec.slo.availability_target`'ı
      `1.5` yapın, `obsctl validate` çalıştırın, bir jsonschema hatası
      aldığınızı doğrulayın, sonra geri alın.
- [ ] Gerçek bir servis repo'sunda bu PR, `obs-gitops-pipelines/scripts/configure-service-repository.sh`
      ile kurulan branch protection kurallarına tabidir: `observability-manifest / validate-observability-manifest`
      check'i zorunlu, en az bir CODEOWNER onayı, son push'u yapandan
      farklı biri onaylamalı. Bu game day'de gerçek bir repo/PR
      kullanıyorsanız bu kısıtları da gözlemleyin; yalnızca yerel dosya
      üzerinde çalışıyorsanız bu adımı belgeleyin ve atlayın.

## 2. Merge sonrası obs-onboarding-controller pick-up ediyor mu?

- [ ] Namespace ve servis Deployment/Service'ini uygulayın:
      ```bash
      kubectl apply -f obs-docs-runbooks/demo/demo-checkout-service/deployment.yaml
      ```
- [ ] `ServiceObservability` CR'sini uygulayın (bu, merge edilen
      `observability.yaml`'ın Kubernetes-native karşılığıdır --
      `scrapeConfig` gibi K8s-only alanlar eklenmiş hâli, bkz.
      `serviceobservability-cr.yaml`'ın kendi başındaki not):
      ```bash
      kubectl apply -f obs-docs-runbooks/demo/demo-checkout-service/serviceobservability-cr.yaml
      ```
- [ ] Reconcile'ın tamamlandığını doğrulayın (birkaç saniye içinde dört
      condition de `True` olmalı):
      ```bash
      kubectl get serviceobservability demo-checkout-service -n demo-gameday \
        -o jsonpath='{range .status.conditions[*]}{.type}={.status} {end}{"\n"}'
      ```
      Beklenen: `Ready=True DashboardSynced=True AlertsSynced=True ServiceMonitorSynced=True CatalogSynced=True`.
      Bir condition `False` kalırsa, `status.conditions[].message`'a bakın
      (`kubectl describe serviceobservability demo-checkout-service -n demo-gameday`) --
      bkz. `obs-onboarding-controller/README.md`'nin "Hata durumları"
      bölümü.
- [ ] **Grafana**: dashboard gerçekten var mı?
      ```bash
      curl -sf "$GRAFANA_URL/api/dashboards/uid/demo-checkout-service-dev" | jq '.dashboard.title'
      ```
      Latency/Traffic/Errors/Saturation panellerinin göründüğünü Grafana
      UI'dan da gözle doğrulayın.
- [ ] **Prometheus Operator**: `ServiceMonitor` ve `PrometheusRule`
      oluşmuş mu?
      ```bash
      kubectl get servicemonitor demo-checkout-service-monitor -n demo-gameday
      kubectl get prometheusrule demo-checkout-service-slo-alerts -n demo-gameday -o yaml | grep -A2 "alert: \|record: "
      ```
      Dört alert kuralının da (fast-burn, slow-burn, latency SLO ×3,
      saturation ×2) listede olduğunu doğrulayın. **Ayrıca**
      `demo-checkout-service.slo.recording` adlı bir grup altında iki
      `record:` satırı (`obs:slo_error_budget_remaining:percent`,
      `obs:slo_burn_rate:ratio1h`) olduğunu doğrulayın -- Developer
      Portal'ın durum/budget gösterimi (adım 5) tamamen bu iki kayda
      dayanır (bkz. `obs-onboarding-controller/internal/promsync/recordingrules.go`);
      eksikse portal o servis için her zaman "Unknown" durumu gösterir.
- [ ] Prometheus servisi gerçekten scrape ediyor mu?
      ```bash
      curl -s "$PROMETHEUS_URL/api/v1/targets" | jq '.data.activeTargets[] | select(.labels.service=="demo-checkout-service")'
      ```
      `health: "up"` olmalı.
- [ ] **Catalog**: kayıt oluşmuş mu?
      ```bash
      curl -sf "$CATALOG_URL/v1/services/dev/demo-checkout-service" | jq
      ```
      `status: "active"`, `team: "team-demo"` görmelisiniz.

## 3. Sahte trafik: k6 load test

[loadtest/checkout-loadtest.js](https://github.com/acme/obs-docs-runbooks/blob/main/loadtest/checkout-loadtest.js), bu
repoda gerçekten çalıştırılıp doğrulanmıştır (bkz. dosyanın kendi
yorumları). İki senaryo:

- [ ] **Baseline** -- yalnızca sağlıklı trafik, dashboard'ların ve
      metriklerin çalıştığını kanıtlar:
      ```bash
      kubectl port-forward -n demo-gameday svc/demo-checkout-service 8080:8080 &
      k6 run -e BASE_URL=http://localhost:8080 -e SCENARIO=baseline loadtest/checkout-loadtest.js
      ```
      Beklenen: `checkout_client_observed_errors` threshold'u (`rate<0.01`)
      geçer, HTTP durum kodlarının tamamı `200`.
- [ ] Grafana'daki Traffic panelinde saniyede ~5 isteklik bir artış
      görüyor musunuz? (`baseline` senaryosu `rate: 5` istek/saniye
      üretir.)
- [ ] **Incident** -- servisin kendi `/admin/failure-rate` endpoint'ini
      `%50`'ye ayarlar (script'in `setup()` adımı), sonra 8 dakika boyunca
      saniyede 20 istek gönderir:
      ```bash
      k6 run -e BASE_URL=http://localhost:8080 -e SCENARIO=incident loadtest/checkout-loadtest.js
      ```
      **Neden 8 dakika**: `ErrorBudgetBurnFast`'ın kısa penceresi 5
      dakika + `for: 2m` -- 8 dakika, alert'in kesin olarak `firing`
      durumuna geçmesi için yeterli marj bırakır (bkz.
      `runbooks/http/error-budget-burn-fast.md`).
      Script'in `checkout_client_observed_errors` threshold'unun
      (`rate>0.3`) **geçmesi bekleniyor** -- bu bir "test başarısızlığı"
      değil, enjeksiyonun çalıştığının kanıtıdır (script dosyasındaki son
      yorum bunu açıklar).

## 4. Fast-burn alert'i tetiklendi mi ve doğru Slack kanalına düştü mü?

Adım 3'ün "incident" k6 koşusu bitene kadar bekleyin (ya da paralel bir
terminalde aşağıdakileri koşu **sırasında** izleyin -- alert `for: 2m`
sonrasında, koşunun ~7. dakikasında `firing` olur).

- [ ] **Prometheus'ta**: alert `pending` sonra `firing`?
      ```
      http://$PROMETHEUS_URL/alerts
      ```
      `DemoCheckoutServiceErrorBudgetBurnFast` adını arayın (alertname
      konvansiyonu: PascalCase servis adı + `ErrorBudgetBurnFast`, bkz.
      `obs-alert-rule-templates/templates/alert-rules.libsonnet`).
      Ya da PromQL ile doğrudan:
      ```promql
      ALERTS{alertname="DemoCheckoutServiceErrorBudgetBurnFast"}
      ```
- [ ] **Alertmanager'a düştü mü?**
      ```bash
      curl -s "$ALERTMANAGER_URL/api/v2/alerts?active=true" \
        | jq '.[] | select(.labels.alertname=="DemoCheckoutServiceErrorBudgetBurnFast")'
      ```
      `labels.severity` değeri `page` olmalı, `labels.team` değeri
      `team-demo` olmalı.
- [ ] **obs-notification-router'a ulaştı mı?** Router'ın webhook
      endpoint'i Alertmanager tarafından çağrılır (bkz.
      `obs-notification-router/deploy/alertmanager-config.yaml`'daki
      `notification-router-page` receiver -- `severity="page"` eşleşen
      alert'ler `group_wait: 0s` ile **anında** gönderilir). Router'ın
      loglarında bu alert'in işlendiğini doğrulayın:
      ```bash
      kubectl logs -n observability deploy/obs-notification-router --since=10m \
        | grep DemoCheckoutServiceErrorBudgetBurnFast
      ```
- [ ] **Doğru Slack kanalına gitti mi?** `#demo-checkout-alerts`
      kanalını kontrol edin (`observability.yaml`'daki
      `ownership.slackChannel`). Router'ın routing mantığı (bkz.
      `obs-notification-router/docs/routing.md`) catalog'daki `team`
      alanının alert'in `team` label'ıyla eşleştiğini doğrular --
      eşleşmiyorsa alert reddedilip yapılandırılmış log'a düşer, hiçbir
      kanala gitmez. Kanalda mesajı görmüyorsanız önce router loglarında
      bir "rejected" veya "catalog entry missing" satırı arayın.
- [ ] **PagerDuty'ye gitti mi?** `severity: page` olduğu için
      `pagerDutyService: demo-checkout-gameday` servisine de bir
      incident açılmalı (bkz. `routing.md`'nin tablosu: "firing + page"
      -> "Service's Slack channel + PagerDuty service"). Gerçek bir
      PagerDuty entegrasyonu yoksa (yalnızca demo/dev), bu adımı router
      loglarındaki "pagerduty delivery" satırıyla doğrulayın.
- [ ] **Runbook linki çalışıyor mu?** Slack mesajındaki/annotation'daki
      `runbook_url`'ü açın:
      ```
      https://runbooks.acme.com/http/DemoCheckoutServiceErrorBudgetBurnFast
      ```
      `obs-docs-runbooks`'un redirect katmanı (bkz. `redirects/README.md`)
      bunu `/runbooks/http/error-budget-burn-fast/` sayfasına
      yönlendirmeli. Yönlendirme olmuyorsa, `redirects/test-resolve.mjs`'in
      hâlâ geçtiğini doğrulayın ve worker'ın/nginx konfigürasyonunun
      gerçekten deploy edildiğini kontrol edin.
- [ ] **5 dakika içinde ack'lenmezse escalation oluyor mu?** (Opsiyonel,
      zaman alır.) Alert'i bilerek ack'lemeden bırakın, 5 dakika sonra
      `routing.md`'nin escalation state machine'ine göre escalation
      Slack kanalına ve ikincil PagerDuty servisine düştüğünü doğrulayın.

## 5. Developer Portal: kart kırmızıya döndü mü, error budget düştü mü?

Portal'ın servis ID'si `{name}-{environment}` biçimindedir (bkz.
`backend/internal/upstream/client.go`'daki `catalogRecordToService`), yani
bu fixture için `demo-checkout-service-dev`.

Durum (`healthy` / `at-risk` / `critical` / `unknown`, arayüzde "Healthy" /
"At risk" / "Critical" / "Unknown" olarak gösterilir -- bkz.
`frontend/lib/format.ts`'teki `statusLabel`), aktif alert **sayısına değil**,
[adım 2](#2-merge-sonras-obs-onboarding-controller-pick-up-ediyor-mu)'de
doğrulanan `obs:slo_error_budget_remaining:percent` ve
`obs:slo_burn_rate:ratio1h` recording rule'larına bakar (bkz.
`backend/internal/service/aggregator.go`'daki `status()`: `budget <= 0 ||
burn >= 6` → `critical`; `budget < 25 || burn > 1` → `at-risk`). Bu recording
rule'lar `obs-onboarding-controller`'ın `internal/promsync/recordingrules.go`'sunda
üretilir -- adım 2'de `checkout-api.slo.recording` grubunun (bu fixture için
`demo-checkout-service.slo.recording`) `PrometheusRule`'da gerçekten var
olduğunu doğrulamadıysanız, bu adıma geçmeden önce geri dönün.

- [ ] **My Services** (`/`) sayfasını açın, `demo-checkout-service`
      kartını bulun (görünmüyorsa: giriş yapan kullanıcının OIDC
      `groups` claim'i `team-demo`'yu içermiyor olabilir -- Health
      Overview'dan bakın).
- [ ] Kartın durumu **Critical** mi? (1 saatlik burn rate `>= 6` olduğunda
      -- `%50` hata oranıyla 8 dakikalık bir incident bunu kolayca aşar,
      bkz. yukarıdaki not.)
- [ ] **Error budget remaining** yüzdesi düşüyor mu? İncident'ten önceki
      değere göre azaldığını doğrulayın (yeni bir servis için başlangıç
      genelde ~%100'e yakındır; `%50` hata oranıyla birkaç dakikalık bir
      incident, 30 günlük pencerede küçük ama ölçülebilir bir düşüş
      yaratır -- büyük düşüş beklemeyin, bu **30 günlük** bir bütçe).
- [ ] Servis detay sayfasını (`/services/demo-checkout-service-dev`) açın:
      - [ ] Golden Signals panelleri (Grafana embed) veri gösteriyor.
      - [ ] Error budget burn-down grafiğinde incident zaman
            damgasında bir eğim değişikliği var.
      - [ ] Aktif alert listesinde `DemoCheckoutServiceErrorBudgetBurnFast`
            görünüyor.
      - [ ] Runbook linki adım 4'teki ile aynı URL'ye gidiyor.
      - [ ] "Edit dashboard" butonu, `demo-checkout-service`
            repo'sundaki dosyaya bir GitHub `/edit/` linki üretiyor (portal
            kendisi dosyayı değiştirmiyor -- GitOps ilkesi); yalnızca
            `demo-checkout-service`'in sahibi takıma (`team-demo`) ait bir
            kullanıcı için aktif, diğerleri için "Read only" görünür.
- [ ] **Health Overview** (`/health`) sayfasında, `environment=dev`
      filtresiyle `demo-checkout-service`'in satırının da **Critical**
      olduğunu doğrulayın -- bu, My Services'teki kartla aynı
      `Summaries()`/recording-rule veri kaynağını kullandığının kanıtıdır.
- [ ] Adım 3'ün `incident` koşusunun `teardown()` adımı failure rate'i
      `0`'a çektikten sonra, burn rate düşüp durum **Healthy**'e döner mi?
      Bunun için hem alert'in Alertmanager'da `resolved` olmasını (bkz.
      `resolve_timeout: 5m`) hem de 1 saatlik burn rate penceresinin
      incident'in etkisinden çıkmasını (`rate(...[1h])` tanımı gereği, tam
      1 saat) beklemeniz gerekir -- bu adım gerçek zamanlı takip için
      sabır ister, bir game day'in en uzun beklemesidir.

## 6. Decommission: manifest silindiğinde tüm izler temizleniyor mu?

- [ ] CR'yi silin:
      ```bash
      kubectl delete serviceobservability demo-checkout-service -n demo-gameday
      ```
- [ ] Silme işleminin hemen tamamlanmadığını, finalizer'ın cleanup'ı
      bitirene kadar CR'nin `Terminating` durumunda kaldığını gözlemleyin:
      ```bash
      kubectl get serviceobservability demo-checkout-service -n demo-gameday -w
      ```
- [ ] **Grafana**: dashboard gerçekten silindi mi (404 dönüyor mu)?
      ```bash
      curl -s -o /dev/null -w "%{http_code}\n" "$GRAFANA_URL/api/dashboards/uid/demo-checkout-service-dev"
      ```
      Beklenen: `404`.
- [ ] **PrometheusRule**: kaynak gerçekten kaldırıldı mı?
      ```bash
      kubectl get prometheusrule demo-checkout-service-slo-alerts -n demo-gameday
      ```
      Beklenen: `NotFound` hatası.
- [ ] **ServiceMonitor**: aynı şekilde kaldırılmış olmalı:
      ```bash
      kubectl get servicemonitor demo-checkout-service-monitor -n demo-gameday
      ```
- [ ] **Catalog**: kayıt **hard-delete değil, decommissioned** olmalı
      (audit trail için -- bkz. `obs-onboarding-controller/README.md`'nin
      "requirement 2g" notu):
      ```bash
      curl -sf "$CATALOG_URL/v1/services/dev/demo-checkout-service" | jq '.status'
      ```
      Beklenen: `"decommissioned"`, **`404` değil**. Kayıt hâlâ
      `GET /v1/services/dev/demo-checkout-service` ile erişilebilir
      olmalı, yalnızca `status` alanı değişmiş olmalı.
- [ ] Developer Portal'da servis artık **My Services**'te görünmüyor mu
      (catalog decommissioned kayıtları filtreler), ama Health
      Overview'da "geçmiş" bir kayıt olarak (varsa o görünüm) hâlâ
      izlenebiliyor mu?
- [ ] `kubectl delete -f obs-docs-runbooks/demo/demo-checkout-service/deployment.yaml`
      ile Deployment/Service/Namespace'i de temizleyin.

## Sonrası: bulguları kaydedin

- [ ] Bu checklist'in herhangi bir adımı beklenmedik davrandıysa (bir
      condition `False` kaldı, Slack'e gitmedi, catalog hard-delete
      oldu, vb.), bunu ilgili repo'nun issue tracker'ına kaydedin --
      bu checklist bir "her şey çalışıyor" teyidi değil, bir **regresyon
      yakalama** aracıdır; bir sonraki game day'de aynı adımı tekrar
      çalıştırın.
- [ ] Runbook'larda (`runbooks/http/*.md`) eksik/yanlış bir şey fark
      ettiyseniz bir PR açın -- bkz. bu repo'nun kök `README.md`'sindeki
      runbook standardı.
