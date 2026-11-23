# obs-docs-runbooks

Platformun canlı dokümantasyonu: her alert için zorunlu runbook standardı,
mimari kararların (ADR) kaydı, yeni bir takımın onboarding rehberi, ve
organizasyon genelinde SLI/SLO/SLA terimlerinin tek sözlüğü.

## Hızlı linkler

- Bir alert aldınız ve runbook'unu arıyorsunuz: **Runbooks** menüsüne
  bakın, veya doğrudan alert'in kendi `runbook_url` annotation'ındaki
  linke tıklayın.
- Yeni bir servisi platforma bağlıyorsunuz: [Onboarding Rehberi](onboarding/onboarding-guide.md).
- "SLO ile SLA arasındaki fark ne" gibi bir soru: [Sözlük](glossary.md).
- Bir mimari kararın neden öyle alındığını merak ediyorsunuz: **Architecture
  Decision Records** menüsü.
- Kendi runbook'unuzu/ADR'nizi yazacaksınız: **Şablonlar** menüsü.

## Bu repo neyi kapsamaz

- Servis-özel runbook'lar: bu repo yalnızca **alert tipi başına** genel
  runbook'lar tutar (bkz. aşağıdaki "Runbook URL konvansiyonu"), servisinize
  özel ek bilgi (örn. "bizim veritabanımızın failover prosedürü") kendi
  servis repo'nuzun kendi dokümantasyonunda yaşamalı.
- Platform altyapısının kendi operasyonel runbook'ları (örn. Thanos
  Compactor bakımı) -- bunlar platform/SRE takımının kendi reposunda
  yaşar.

## Runbook URL konvansiyonu

`obs-alert-rule-templates`'in ürettiği her alert kuralı, şu formatta bir
`runbook_url` annotation'ı taşır:

```
https://runbooks.acme.com/{serviceType}/{alertname}
```

Örnek: `https://runbooks.acme.com/http/CheckoutApiErrorBudgetBurnFast`.

`{alertname}`, servis adını (PascalCase, örn. `CheckoutApi`) ve sabit bir
suffix'i (`ErrorBudgetBurnFast`) birleştirir -- yani her servis için
teknik olarak farklı bir URL üretilir. Ama bu repo, her servis için ayrı
bir runbook yazmak yerine, **alert tipi başına** (suffix'e göre) tek bir
genel runbook tutar (bkz. `runbooks/http/error-budget-burn-fast.md`),
çünkü müdahale adımları servisten servise değişmez -- yalnızca hangi
servisin etkilendiği değişir (ki bu bilgi zaten alert'in kendi
`service`/`environment` label'larında vardır).

Bu ikisini birleştirmek için, statik siteyi yayınlayan altyapının önünde
ince bir **redirect katmanı** çalışır:
`{ServiceName}{Suffix}` deseni tanınır, `{Suffix}` bilinen alert
tiplerinden biriyse (`ErrorBudgetBurnFast`, `ErrorBudgetBurnSlow`,
`LatencySLOViolation{Window}`, `SaturationHigh{Metric}`), istek o tipin
genel runbook sayfasına 301 ile yönlendirilir. Detay ve iki alternatif
implementasyon (Cloudflare Worker / nginx) için bkz.
[redirects/README.md](https://github.com/acme/obs-docs-runbooks/blob/main/redirects/README.md)
(statik site build'ine dahil edilmez, yalnızca kaynak repo'da yaşar).
