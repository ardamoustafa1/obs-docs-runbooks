---
title: "obs-onboarding-controller: template render'ı CLI exec ile mi, kütüphane import ile mi çağırır"
status: accepted
date: "2026-09-15"
deciders: "team-observability"
affects_repos:
  - obs-onboarding-controller
  - obs-golden-signal-templates
  - obs-alert-rule-templates
---

# ADR-0004: Template render'ı CLI exec ile mi, kütüphane import ile mi çağırır

## Bağlam (Context)

`obs-onboarding-controller`, `ServiceObservability` CR'lerini gerçek
dashboard'lara ve alert kurallarına dönüştürürken, render mantığını
barındıran iki repo'yu (`obs-golden-signal-templates`, `obs-alert-rule-templates`)
tüketmesi gerekiyordu. Bu iki repo, render kodlarını kasıtlı olarak
`internal/` paket altında tutuyor -- yalnızca kendi CLI'ları (`gen-dashboard`,
`gen-alerts`) olarak tüketilmek üzere tasarlandılar.

## Değerlendirilen Seçenekler

### Seçenek A: `internal/` paketleri import etmeye çalışmak
- Artı: Aynı process içinde çalışır, ek subprocess overhead'i yok.
- Eksi: Go'nun `internal/` görünürlük kuralı, bu paketlerin başka bir
  modülden import edilmesini **derleme zamanında engeller** -- bu seçenek
  teknik olarak mümkün değil, ancak paketleri `internal/` dışına taşımak
  o repoların kendi tasarım kararını (yalnızca CLI olarak tüketilsin)
  bozar.

### Seçenek B: CLI binary'lerini subprocess olarak çalıştırmak (`os/exec`)
- Artı: Modül sınırlarını ihlal etmez; her iki repo da CLI olarak
  tasarlandığı için bu, onların "genel API"sini kullanmak demektir.
  Operatörün container image'ı bu binary'leri multi-stage bir Docker
  build ile kendi içine gömer; gerçek CLI'lar test edilir (mock değil).
- Eksi: Her reconcile'da bir subprocess başlatmanın küçük bir gecikme/
  kaynak maliyeti var; hata mesajları stderr parse etmeyi gerektirir.

## Karar (Decision)

**CLI exec (Seçenek B) seçildi.** Go'nun `internal/` kuralı zaten Seçenek
A'yı imkansız kılıyor, ama bağımsız olarak da CLI exec, o iki repo'nun
kendi belgelediği tüketim şeklidir (CLI, kütüphane değil) -- bu sözleşmeye
saygı göstermek, ileride o repoların iç render mantığını serbestçe
değiştirebilmesini sağlar (CLI arayüzü sabit kaldığı sürece).

## Sonuçlar (Consequences)

- `obs-onboarding-controller`'ın Dockerfile'ı, üç ayrı repo'yu (kendisi +
  iki template reposu) build-time'da yan yana checkout edilmiş olarak
  gerektirir (`docker buildx build --build-context golden=... --build-context alertrules=...`)
  -- bu, CI pipeline'ının (obs-gitops-pipelines) üç repo'yu da checkout
  etmesini gerektiren bir operasyonel bağımlılık ekler.
- envtest tabanlı entegrasyon testleri, gerçek `gen-dashboard`/`gen-alerts`
  binary'lerini kardeş repo kaynağından derleyip çalıştırarak bu exec
  yolunu gerçekten test eder -- mock yoktur.
- Alternatif bir Job-tabanlı invocation (ayrı bir Kubernetes Job pod'unda
  çalıştırma, daha güçlü izolasyon) dokümante edildi ama implemente
  edilmedi; bir takım daha güçlü izolasyon isterse bu yolu seçebilir, ama
  envtest'te doğrulanamaz (gerçek bir kubelet gerektirir).
