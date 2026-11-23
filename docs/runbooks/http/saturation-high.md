---
title: "Saturation High (CPU / Memory / Queue)"
service_type: http
alert_types:
  - SaturationHighCpuUtilizationRatio
  - SaturationHighMemoryUtilizationRatio
severity: warning
owner_doc: obs-alert-rule-templates
last_reviewed: "2026-09-17"
---

## Alert Açıklaması

Bu alert, `goldenSignals.saturationMetrics` altında tanımlı bir doygunluk
metriğinin (CPU, memory veya benzeri bir 0-1 utilization oranı) son 10
dakika boyunca ortalama %80'in üzerinde kaldığını gösterir:

```promql
avg_over_time(<saturation_metric>{service="<svc>",environment="<env>"}[10m]) > 0.8
```

`for: 10m` sonrasında tetiklenir, severity her zaman `warning`'dir (bkz.
obs-alert-rule-templates/README.md) çünkü bu **henüz bir SLO ihlali değil,
öncü bir göstergedir** -- kaynak tükenmesi henüz kullanıcıyı etkilemiş
olmayabilir, ama etkilemek üzeredir.

## Olası Nedenler

1. **Organik trafik büyümesi, kapasite artışı olmadan** -- servis
   sürekli büyüyen bir trafiğe sahipse ve replica/kaynak limiti aynı
   kaldıysa, bu beklenen bir sonuçtur. Traffic panelindeki uzun vadeli
   trendine bak.
2. **Kaynak sızıntısı** -- memory saturation'ı zamanla kademeli artıyor
   ve yalnızca pod restart'ında sıfırlanıyorsa, bu bir memory leak'tir.
3. **Yetersiz kaynak limiti/isteği** -- Kubernetes `resources.requests`/
   `limits` ayarları, servisin gerçek ihtiyacının altında kalmış olabilir
   (özellikle bir dile/runtime'a özgü GC davranışı değiştiğinde).
4. **Ani, kısa süreli bir yük artışı** (batch job, cron, cache
   invalidation fırtınası) -- 10 dakikalık ortalama pencere kısa
   sıçramaları biraz yumuşatır ama yine de tetikleyebilir.
5. **Noisy neighbor / node düzeyinde kaynak çekişmesi** -- CPU
   saturation'ı yalnızca belirli node'larda mı görünüyor?

## İlk Müdahale Adımları

1. **Hangi metrik tetiklendi?** (`saturation_metric` label'ına bak --
   CPU mu, memory mi?) İkisi farklı aksiyon gerektirir.
2. **Trend'e bak**: kademeli mi artıyor (sızıntı/organik büyüme) yoksa
   ani bir sıçrama mı (kısa süreli yük)? Kademeli artışta pod yaşı ile
   korelasyona bak.
3. **Aynı anda başka bir alert var mı?** (Latency SLO ihlali veya error
   budget burn ile birlikte geliyorsa, kök neden muhtemelen kapasite
   yetersizliğidir -- önce o alert'in runbook'una da bak.)
4. **Kısa vadeli mitigasyon**: eğer trafik/yük organik olarak artmışsa ve
   otomatik ölçeklendirme (HPA) yoksa veya yetersizse, replica sayısını
   manuel artır.
5. **Memory saturation'da**: pod'un `kubectl top pod` çıktısındaki
   trendine ve varsa uygulama düzeyinde heap/GC metriklerine bak; bir
   sızıntı şüphesi varsa, kontrollü bir rolling restart kısa vadeli
   rahatlama sağlar (kalıcı çözüm değildir).
6. **CPU saturation'da**: hangi kod yolunun CPU-yoğun olduğunu belirlemek
   için (varsa) profiling/flame graph aracına bak; yoksa, en azından hangi
   route'ların RPS'inin arttığına bak.

## Escalation Kriteri

- Bu tek başına bir `warning` alert'i olduğu için genelde sayfaya değer
  bir escalation gerektirmez -- ama eğer **aynı anda** bir `page`
  seviyeli latency veya error-budget alert'i de tetikleniyorsa, kapasite
  yetersizliği kök neden şüphesiyle o alert'in escalation kriterini
  uygula.
- Saturation, otomatik ölçeklendirmenin üst sınırına (`maxReplicas`)
  ulaşılmış olmasından kaynaklanıyorsa ve trafik artışı devam ediyorsa,
  kapasite planlaması için platform/SRE takımını haberdar et.

## İlgili Dashboard Linki

- Servis detay sayfası: `https://portal.acme.internal/services/<environment>/<service>`
  (saturation paneli, CPU/memory zaman serisi).
- Kubernetes düzeyinde: `kubectl top pods -n <namespace> -l app=<service>`.

## Post-Incident Aksiyonlar

- Kök neden organik büyümeyse, `resources.requests`/`limits`'i ve
  `HorizontalPodAutoscaler` eşiklerini gözden geçir; kapasite planlamasını
  güncelle.
- Kök neden bir kaynak sızıntısıysa, düzeltme PR'ı takip item'ı olarak
  aç ve bu runbook'a link ver.
- Bu alert son 30 günde birden fazla kez tetiklendiyse, `saturationMetrics`
  eşiğinin (`%80`) bu servis için doğru kalibre edilip edilmediğini
  (örn. bazı servisler için `%70` daha erken, daha faydalı bir uyarı
  olabilir) takımla gözden geçir.
