---
title: "Error Budget Burn: Slow (6h/30m, 6x)"
service_type: http
alert_types:
  - ErrorBudgetBurnSlow
severity: page
owner_doc: obs-alert-rule-templates
last_reviewed: "2026-09-17"
---

## Alert Açıklaması

Bu alert, fast-burn kadar ani olmayan ama yine de 30 günlük error
budget'i **~5 gün içinde tüketecek** hızda, düşük şiddetli ama sürekli bir
hata sızıntısını yakalar. Hem 6 saatlik hem 30 dakikalık pencerede eşzamanlı
gözlenen hata oranı `6 × (1 - availability_target)` eşiğini aşıyor:

```promql
(
  sum(rate(<error_metric>{service="<svc>",environment="<env>"}[6h]))
  /
  clamp_min(sum(rate(<traffic_metric>{service="<svc>",environment="<env>"}[6h])), 1e-9)
) > 0.006   # örnek: availability_target=0.999 için
and
(
  sum(rate(<error_metric>{service="<svc>",environment="<env>"}[30m]))
  /
  clamp_min(sum(rate(<traffic_metric>{service="<svc>",environment="<env>"}[30m])), 1e-9)
) > 0.006
```

`for: 15m` sonrasında tetiklenir. **Önemli**: bu alert fast-burn ile
**birlikte de** tetiklenebilir (ağır bir kesinti sırasında her iki eşik de
aşılır, bkz. obs-alert-rule-templates'in `fast-burn.test.yaml` senaryosu)
-- ikisi birden geliyorsa fast-burn'ün runbook'unu önce uygula. Bu runbook,
**yalnızca slow-burn tetiklenmişse** (fast-burn tetiklenmemişse) geçerli
senaryo içindir: düşük şiddetli, sessiz bir sızıntı.

## Olası Nedenler

Fast-burn'den farklı olarak burada aranan şey "ne değişti" değil, "hangi
düşük hacimli ama sürekli hata kaynağı fark edilmeden devam ediyor":

1. **Belirli bir endpoint/route'a özgü, düşük hacimli bir hata** -- tüm
   trafiğin küçük bir yüzdesini etkileyen ama sürekli olan bir bug
   (örn. belirli bir input formatını yanlış handle eden bir endpoint).
   Route bazlı hata dağılımına bak:
   `sum by (route) (rate(http_server_request_errors_total{service="<svc>"}[1h]))`.
2. **Yavaş sızan bir kaynak tükenmesi** -- connection leak, memory leak,
   önbellek şişmesi; saat başına giderek artan bir hata oranı örüntüsü
   arıyorsun, ani bir sıçrama değil.
3. **Aralıklı bir downstream sorunu** -- flaky bir bağımlılık, zaman zaman
   timeout veren bir üçüncü parti servis.
4. **Belirli bir müşteri/tenant segmentine özgü sorun** -- eğer tenant
   bazlı bir label varsa (varsa), o kırılımda bak.
5. **Yanlış kalibre edilmiş bir retry/timeout ayarı** -- agresif retry
   politikası, gerçek bir hatayı maskeler ama arka planda budget'i
   tüketmeye devam eder.

## İlk Müdahale Adımları

1. **Fast-burn ile birlikte mi geldi?** Developer Portal'daki aktif alert
   listesine bak. Eğer `ErrorBudgetBurnFast` da aktifse, o runbook'a geç.
2. **Route/endpoint kırılımını incele**: hangi route, toplam hatanın en
   büyük payını oluşturuyor? Bu genelde tek bir kod yolunda izole
   edilebilir bir soruna işaret eder.
3. **Zaman serisini incele** (30 günlük değil, son 6 saatlik): hata oranı
   düz mü, yoksa kademeli mi artıyor? Kademeli artış bir kaynak
   sızıntısına işaret eder -- bu durumda pod'ların restart zamanlarını
   (`kube_pod_start_time`) hata oranıyla karşılaştır; restart sonrası
   hata oranı sıfırlanıyorsa bu bir kaynak sızıntısı kanıtıdır.
4. **Son 6 saatteki deploy'ları kontrol et** -- fast-burn kadar acil bir
   korelasyon olmasa da, düşük hacimli bir regresyon da bir deploy'la
   gelmiş olabilir.
5. Kök neden hemen bulunamıyorsa, bu bir sayfaya-değer olay olsa da acil
   bir "kanamayı durdur" aksiyonu (rollback, feature flag) fast-burn
   kadar zaman-kritik değildir -- **doğru** kök nedeni bulmaya öncelik
   ver.

## Escalation Kriteri

- İlk müdahale adımları **1 saat içinde** kök nedeni belirlemiyorsa,
  servis sahibi takımın tech lead'ini bilgilendir (page değil, async
  bilgilendirme yeterli).
- Sorun birden fazla günü kapsayan tekrarlayan bir örüntüyse (bu ayki
  ikinci veya üçüncü slow-burn tetiklenmesi), bunu takımın sprint
  planlamasına bir "reliability debt" item'ı olarak taşı.

## İlgili Dashboard Linki

- Servis detay sayfası: `https://portal.acme.internal/services/<environment>/<service>`.
- Route/endpoint kırılımı paneli: aynı dashboard'ın "HTTP route
  breakdown" bölümü (bkz. obs-golden-signal-templates'in http-service
  şablonundaki route RPS/p95/top-10-error-endpoint panelleri).

## Post-Incident Aksiyonlar

- Kök neden bir kod hatasıysa, düzeltme PR'ına bu alert'in linkini ekle
  (izlenebilirlik için).
- Sorun bir kaynak sızıntısıysa, kısa vadeli bir mitigasyon olarak
  periyodik restart (örn. bir `PodDisruptionBudget` ile kontrollü rolling
  restart) düşünülebilir, ama bu kalıcı çözüm değildir -- takip item'ı aç.
- Aynı slow-burn alert'i ayda birden fazla kez tetikleniyorsa, ilgili
  route'a özel bir ek alert kuralı (`obs-alert-rule-templates`'in
  `extraRules` mekanizması) eklemeyi değerlendir.
