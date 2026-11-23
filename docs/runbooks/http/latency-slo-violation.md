---
title: "Latency SLO Violation (5m / 1h / 6h)"
service_type: http
alert_types:
  - LatencySLOViolation5m
  - LatencySLOViolation1h
  - LatencySLOViolation6h
severity: warning-to-page
owner_doc: obs-alert-rule-templates
last_reviewed: "2026-09-17"
---

## Alert Açıklaması

Bu alert ailesi, servisin p_N gecikmesinin `latency_target_ms` SLO
hedefini aştığını, üç farklı pencerede (5 dakika, 1 saat, 6 saat) ayrı ayrı
kontrol eder:

```promql
histogram_quantile(
  <percentile/100>,
  sum(rate(<latency_metric>_bucket{service="<svc>",environment="<env>"}[<window>])) by (le)
) > <latency_target_ms/1000>
```

Üç pencerenin **her biri kendi başına ayrı bir alert**'tir ve önem
derecesi pencere büyüdükçe artar:

| Alert | Pencere | `for:` | Severity | Anlamı |
|---|---|---|---|---|
| `LatencySLOViolation5m` | 5m | 5m | `warning` | Kısa süreli sıçrama, muhtemelen geçici |
| `LatencySLOViolation1h` | 1h | 15m | `warning` | Sürdürülebilir bir yavaşlama |
| `LatencySLOViolation6h` | 6h | 30m | `page` | Sistemik regresyon, sayfaya değer |

Bu kademelendirmenin mantığı: kısa pencerede bir p99 sıçraması çoğu zaman
gürültüdür (bkz. `obs-alert-rule-templates/README.md`); aynı ihlal 6 saat
boyunca sürdüyse artık gürültü değildir.

## Olası Nedenler

1. **Downstream bağımlılık yavaşlaması** -- veritabanı sorgu süresi,
   üçüncü parti API yanıt süresi arttı mı? İlgili bağımlılığın kendi
   latency panelini kontrol et.
2. **Kaynak doygunluğu** -- CPU/memory saturation, garbage collection
   duraklamaları (JVM/Node servislerinde özellikle). Saturation panelini
   (bkz. [saturation-high.md](saturation-high.md)) kontrol et; genelde bu
   ikisi birlikte tetiklenir.
3. **Trafik artışı, kapasite artışı olmadan** -- traffic panelindeki RPS
   artışı latency artışıyla zaman olarak örtüşüyor mu?
4. **N+1 sorgu veya yeni bir kod yolu** -- son deploy'lardan biri,
   belirli bir route'a yavaş bir sorgu paterni eklemiş olabilir; route
   bazlı p95 kırılımına bak.
5. **Connection pool tükenmesi** -- istekler, downstream'e bağlantı
   bulmayı beklerken kuyrukta bekliyor olabilir (bu genelde saturation
   metriklerinde de görünür).
6. **Noisy neighbor** -- aynı node/cluster'daki başka bir workload kaynak
   çekişmesi yaratıyor olabilir (Kubernetes `kubectl top pods` ve node
   düzeyinde CPU throttling metriklerine bak).

## İlk Müdahale Adımları

1. **Hangi pencere/severity tetiklendi?** `LatencySLOViolation6h`
   (page) ise aşağıdaki adımları hızlı uygula; `5m`/`1h` (warning) ise
   izlemeye devam edip trend'in kötüleşip kötüleşmediğine bak.
2. **Latency dashboard'ını aç**, p50/p95/p99'u karşılaştır: yalnızca p99
   mu etkilendi (kuyruktaki az sayıda yavaş istek) yoksa p50 de mi
   yükseldi (genel bir yavaşlama)? İkincisi daha ciddi bir sinyal.
3. **Downstream latency'yi kontrol et**: servisin çağırdığı veritabanı/
   API'lerin kendi latency metriklerine bak (varsa aynı Developer
   Portal'daki ilgili servis sayfasından).
4. **Saturation'ı kontrol et**: CPU/memory/queue depth panelleri
   latency artışıyla aynı anda mı yükseliyor?
5. **Son deploy'ları kontrol et**, özellikle veritabanı migration'ları
   veya yeni bir downstream entegrasyonu içeren deploy'lar.
6. Kök neden bulunamıyor ve `page` severity'deyse, ölçeklendirme (yatay
   scale-out) geçici bir mitigasyon olabilir -- kapasiteyle ilgiliyse
   hızlı rahatlama sağlar.

## Escalation Kriteri

- `LatencySLOViolation6h` (page) tetiklendiyse ve 30 dakika içinde
  iyileşme yoksa, servis sahibi takımın on-call'ını escalate et.
- Kök neden ortak bir altyapı bileşeniyse (paylaşımlı veritabanı, service
  mesh), o bileşenin sahibi takımı da dahil et.
- Yalnızca `warning` seviyesindeyse (5m/1h) ve iş saatleri içindeyse,
  sayfaya gerek yok -- takımın normal iş akışında (Slack kanalı) takip
  etmesi yeterli.

## İlgili Dashboard Linki

- Servis detay sayfası: `https://portal.acme.internal/services/<environment>/<service>`
  (latency p50/p95/p99 grafiği).
- Downstream bağımlılık dashboard'ları: ilgili servisin kendi sayfası.

## Post-Incident Aksiyonlar

- `page` seviyesinde bir ihlal sonrası postmortem yaz.
- Latency hedefinin (`latency_target_ms`) gerçekçiliğini gözden geçir --
  eğer bu ay birden fazla kez tetiklendiyse, ya gerçek bir performans
  regresyonu birikiyor ya da hedef gerçekçi değil.
- Kök neden bir downstream bağımlılıksa, o bağımlılığa yönelik bir
  timeout/circuit-breaker politikası eklenip eklenmediğini kontrol et --
  yoksa ekle, böylece bir sonraki yavaşlama tüm servisi değil yalnızca
  ilgili özelliği etkiler.
