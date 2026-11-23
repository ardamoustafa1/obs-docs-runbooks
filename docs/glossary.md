# SLI / SLO / SLA sözlüğü

Bu sayfa, organizasyon genelinde bu terimlerin **tek, tutarlı** tanımını
verir. Bir dashboard'da, bir alert annotation'ında veya bir toplantıda bu
kelimelerden biri geçtiğinde, herkesin aynı şeyi kastettiğinden emin olmak
içindir. Aşağıdaki tanımlar, `obs-alert-rule-templates` ve
`obs-manifest-schema`'daki gerçek implementasyonla birebir tutarlıdır.

## SLI (Service Level Indicator)

Bir servisin davranışının **ölçülen, sayısal** bir göstergesi. "İyi" ya da
"kötü" bir yargı içermez, yalnızca bir ölçümdür. Bu platformda dört SLI
kategorisi (Golden Signals) standarttır:

| Golden Signal | Örnek SLI | Bu platformdaki metrik |
|---|---|---|
| **Traffic** (trafik) | saniyedeki istek sayısı | `http_server_requests_total` |
| **Errors** (hata) | başarısız isteklerin oranı | `http_server_request_errors_total` / `http_server_requests_total` |
| **Latency** (gecikme) | isteklerin p99 süresi | `http_server_request_duration_seconds` |
| **Saturation** (doygunluk) | CPU/memory/kuyruk kullanım oranı | `http_server_active_requests`, `worker_queue_depth`, vb. |

## SLO (Service Level Objective)

Bir SLI için belirlenen **hedef eşik** -- "bu SLI şu değerin üzerinde/
altında kalmalı" şeklinde bir taahhüt. Bu platformda SLO iki parçadan
oluşur (`obs-manifest-schema`'daki `spec.slo` alanına birebir karşılık
gelir):

- **Availability target**: belirli bir pencerede (bu platformda 30 gün)
  başarılı olması beklenen istek yüzdesi. Örnek: `0.999` (%99.9, "üç
  dokuz").
- **Latency target**: belirli bir percentile'da (`latency_percentile`)
  aşılmaması gereken süre (`latency_target_ms`).

SLO, bir **iç** hedeftir -- takımın kendi güvenilirlik/hız dengesini nasıl
kurduğuna dair bir karardır, dışarıya karşı bir sözleşme değildir (bu SLA'dır).

## SLA (Service Level Agreement)

SLO'nun **dışarıya karşı, genellikle sözleşmesel sonuçları olan** hâli --
örn. "SLA'yı ihlal edersek müşteriye kredi iade ederiz". Bu platform SLA'yı
doğrudan modellemez/uygulamaz; SLA'lar genellikle SLO'dan **daha gevşek**
belirlenir (SLO ihlali, SLA ihlalinden önce bir erken uyarı olsun diye).
Bir SLA varsa, onu karşılayan SLO'nun `availability_target`'ının SLA'dan
daha sıkı olduğundan emin olun -- aksi halde SLO'nuz sizi SLA ihlalinden
önce uyarmaz.

## Error budget

`1 - availability_target` -- SLO penceresi (30 gün) boyunca "harcamaya
izin verilen" başarısızlık payı. Örnek: `availability_target = 0.999` ise
error budget `%0.1`'dir. Error budget, "her zaman %100 mükemmel olmak
zorunda değilsin, ama bu kadarını harcayabilirsin" diyen bir bütçedir --
takımların risk almasına (yeni feature deploy etmek, deneysel bir
optimizasyon denemek gibi) izin veren yapılandırılmış bir mekanizmadır.

**Error budget remaining (%)**, herhangi bir anda "bu ay ne kadar bütçe
kaldı" sorusuna cevap verir:

```promql
clamp_min(
  clamp_max(
    100 * (1 - (<gözlenen_30_günlük_hata_oranı> / <error_budget>)),
    100
  ),
  0
)
```

Bkz. `obs-alert-rule-templates/README.md`'nin tam türetimi.

## Burn rate

Gözlenen hata oranının, error budget'e göre **kaç kat hızda** tüketildiği:

```
burn_rate = gözlenen_hata_oranı(pencere) / error_budget
```

`burn_rate = 1`, bütçenin tam SLO penceresinin (30 gün) sonunda
sıfırlanacak hızda tüketildiği anlamına gelir. `burn_rate = 14.4`, bütçenin
`30 gün / 14.4 ≈ 50 saat`de tükeneceği anlamına gelir (bkz.
[error-budget-burn-fast.md](runbooks/http/error-budget-burn-fast.md)).

## Multi-window, multi-burn-rate alerting

Tek bir eşik ("hata oranı %1'i geçti") yerine, **hem uzun hem kısa** bir
pencerede aynı anda burn rate eşiğinin aşılmasını arayan alerting yöntemi
(Google SRE Workbook'tan). Amaç iki özelliği aynı anda sağlamak:

1. **Gürültü azaltma**: kısa pencerede tek bir sıçrama, uzun pencere
   tarafından filtrelenir, sayfaya düşmez.
2. **Hem hızlı hem yavaş sızıntıyı yakalama**: kısa, şiddetli bir kesinti
   kısa pencereyi hızla tetikler; uzun, düşük şiddetli bir sızıntı uzun
   pencereyi tetikler.

Bu platform bunu iki katmanla uygular: fast-burn (1h/5m, 14.4x) ve
slow-burn (6h/30m, 6x) -- bkz. [error-budget-burn-fast.md](runbooks/http/error-budget-burn-fast.md)
ve [error-budget-burn-slow.md](runbooks/http/error-budget-burn-slow.md).

## Exemplar

Bir histogram gözleminin (örn. tek bir HTTP isteğinin gecikme süresi),
o isteği üreten **dağıtık izleme (tracing) span'ine** giden bir işaretçi
(`trace_id`). "Bu p99 gecikmesine sebep olan spesifik istek hangisiydi,
trace'ine bakayım" sorusuna cevap verir. Bkz.
`obs-instrumentation-sdk/CONTRACT.md`'nin "Exemplar sözleşmesi".

## Golden Signals

Google SRE kitabının tanımladığı dört temel gözlemlenebilirlik sinyali:
**Latency, Traffic, Errors, Saturation**. Bu platformdaki her araç
(`obs-manifest-schema`'nın şeması, `obs-instrumentation-sdk`'nın metrik
sözleşmesi, `obs-golden-signal-templates`'in dashboard'ları,
`obs-alert-rule-templates`'in alert kuralları) bu dört sinyal etrafında
organize edilmiştir.
