---
title: "Error Budget Burn: Fast (1h/5m, 14.4x)"
service_type: http
alert_types:
  - ErrorBudgetBurnFast
severity: page
owner_doc: obs-alert-rule-templates
last_reviewed: "2026-09-17"
---

## Alert Açıklaması

Bu alert, servisin 30 günlük error budget'ini **~2 gün içinde tüketecek**
hızda hata ürettiğini gösterir (bkz.
[obs-alert-rule-templates/README.md](https://github.com/acme/obs-alert-rule-templates#error-budget-ve-burn-rate-matematiği)).
Hem 1 saatlik hem 5 dakikalık pencerede eşzamanlı olarak gözlenen hata
oranı, `14.4 × (1 - availability_target)` eşiğini aşıyor:

```promql
(
  sum(rate(<error_metric>{service="<svc>",environment="<env>"}[1h]))
  /
  clamp_min(sum(rate(<traffic_metric>{service="<svc>",environment="<env>"}[1h])), 1e-9)
) > 0.0144   # örnek: availability_target=0.999 için
and
(
  sum(rate(<error_metric>{service="<svc>",environment="<env>"}[5m]))
  /
  clamp_min(sum(rate(<traffic_metric>{service="<svc>",environment="<env>"}[5m])), 1e-9)
) > 0.0144
```

`for: 2m` sonrasında tetiklenir. İki pencerenin de aynı anda eşiği aşması
gerektiği için bu alert **gerçek, sürdürülebilir bir kesinti** sinyalidir
-- tek dakikalık bir gürültü bu alarmı tetiklemez (bkz. glossary.md'deki
"multi-window multi-burn-rate" tanımı).

## Olası Nedenler

En sık görülenden en nadire:

1. **Kötü bir deploy** -- son 1 saat içinde bir deploy oldu mu? Servisin
   deploy geçmişini (developer portal'daki "son deploy" alanı veya
   CI/CD sisteminin kendi deploy log'u) kontrol et. En yaygın neden budur.
2. **Downstream bağımlılık kesintisi** -- servisin çağırdığı bir veritabanı,
   üçüncü parti API veya başka bir internal servis mi çöktü? İlgili
   servisin kendi dashboard'unu ve alert durumunu kontrol et.
3. **Trafik anomalisi** -- ani bir trafik artışı (kampanya, bot saldırısı,
   retry storm) kapasiteyi aştı mı? Aynı dashboard'daki traffic panelini
   kontrol et.
4. **Altyapı sorunu** -- node/pod eviction, network partition, DNS
   sorunu. Kubernetes event log'larını kontrol et (`kubectl get events
   -n <namespace> --sort-by=.lastTimestamp`).
5. **Alt kaynak tükenmesi** -- connection pool, file descriptor, memory
   limiti. Saturation panelini kontrol et (bkz.
   [saturation-high.md](saturation-high.md) -- bu alert genelde bir
   saturation alert'iyle birlikte gelir).

## İlk Müdahale Adımları

1. **Dashboard'ı aç**: alert'in `runbook_url` annotation'ındaki servis
   adına göre Developer Portal'daki servis detay sayfasını aç
   (`https://portal.acme.internal/services/<environment>/<service>`).
   Error rate ve traffic panellerine bak -- hata oranı gerçekten yüksek
   mi, yoksa trafik mi düşmüş (payda küçüldüğü için oran yapay şekilde
   yükselmiş olabilir)?
2. **Son deploy'u kontrol et**: hata oranının başladığı zaman damgası,
   bir deploy zaman damgasıyla örtüşüyor mu? Örtüşüyorsa **önce rollback
   yap**, kök nedeni sonra araştır -- budget hızla tükeniyorken kök neden
   analizi lüksü yoktur.
3. **Downstream'i kontrol et**: servisin bağımlı olduğu diğer servislerin
   kendi alert durumlarına bak (Developer Portal Health Overview
   sayfasında aynı takımın/aynı ortamın diğer servisleri).
4. **Hata loglarını incele**: en sık görülen hata mesajı/status code
   nedir? (`sum by (code) (rate(http_server_requests_total{service="<svc>"}[5m]))`)
   5xx mi, timeout mu, bağlantı reddi mi?
5. Kök neden bulunamıyorsa ve budget tükenmeye devam ediyorsa, **trafiği
   azalt** (circuit breaker, rate limit, feature flag ile riskli bir
   path'i kapat) -- tam bir çözüm değil ama kanamayı durdurur.

## Escalation Kriteri

- İlk müdahale adımları **15 dakika içinde** hata oranını düşürmüyorsa,
  servisin sahibi takımın on-call'ına (PagerDuty) ek olarak, downstream
  bağımlılık şüphesi varsa o servisin takımına da haber ver.
- Kök neden bir platform bileşeniyse (Kubernetes, ingress, DNS, service
  mesh), platform/SRE takımını escalate et.
- 30 dakika içinde budget %0'a yaklaşıyorsa (Developer Portal'daki error
  budget burn-down grafiğinde eğimi kontrol et), Incident Commander
  sürecini başlat.

## İlgili Dashboard Linki

- Servis detay sayfası: `https://portal.acme.internal/services/<environment>/<service>`
  (Golden Signals + burn-down grafiği + aktif alert listesi).
- Ham Grafana dashboard: `https://grafana.acme.internal/d/<service>-<environment>`.
- Log sorgusu (varsa merkezi log sistemi): `service:<service> environment:<environment> level:error`.

## Post-Incident Aksiyonlar

- Olay 30 dakikadan uzun sürdüyse veya kullanıcı etkisi olduysa,
  postmortem şablonunu doldur (bkz. `onboarding/onboarding-guide.md`'deki
  "game day" bölümünün postmortem şablonuna linki).
- Error budget bu ay içinde birden fazla kez fast-burn'e girdiyse,
  `availability_target`'ın gerçekçi olup olmadığını takımla gözden geçir
  -- sürekli tetiklenen bir alert, ya gerçek bir güvenilirlik sorununa ya
  da yanlış kalibre edilmiş bir SLO'ya işaret eder.
- Kök neden bir deploy'sa, bu deploy'un neden CI/CD kalite kapılarından
  (test, canary) geçtiğini gözden geçir.
- Budget tamamen tükendiyse (%0), takımın "feature freeze" politikasını
  (varsa) devreye sok -- yeni feature'lar yerine güvenilirlik işine
  öncelik verilmeli.
