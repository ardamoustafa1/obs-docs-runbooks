---
title: "Grafonnet ile dashboard şablonlama"
status: accepted
date: "2026-09-10"
deciders: "team-observability"
affects_repos:
  - obs-golden-signal-templates
---

# ADR-0001: Grafonnet ile dashboard şablonlama

## Bağlam (Context)

`obs-golden-signal-templates`, her servis tipi (http, grpc, worker, batch,
database) için deterministik, sürüm kontrolüne uygun Grafana dashboard
JSON'u üretmek zorundaydı. Elle yazılan/Grafana UI'dan export edilen
dashboard JSON'ları iki temel soruna sahiptir: (1) tekrar eden panel
tanımları (aynı grid/legend/threshold ayarları her dashboard'da elle
kopyalanır), (2) Grafana'nın kendi şema sürümü değiştiğinde (panel API'si,
datasource referans formatı) her dashboard dosyasının elle güncellenmesi
gerekir.

## Değerlendirilen Seçenekler

### Seçenek A: Ham JSON + text templating (örn. Go `text/template`)
- Artı: Ek bağımlılık yok, herkes JSON okuyabilir.
- Eksi: Templating katmanı, Grafana'nın şema kurallarını (grid pozisyonu
  çakışmaları, zorunlu alanlar) hiçbir şekilde doğrulamaz; hatalar yalnızca
  Grafana'ya import edilince ortaya çıkar. Panel/datasource yeniden
  kullanımı yoktur -- her template kendi kopyasını taşır.

### Seçenek B: Grafonnet (Jsonnet + Grafana'nın resmi builder kütüphanesi)
- Artı: Grafonnet, Grafana OpenAPI şemasından üretilen tip-güvenli
  builder'lar sağlar (`panel.new()`, `dashboard.new()` gibi) -- bir alan
  yanlış tipte kullanılırsa Jsonnet derleme zamanında hata verir, Grafana'ya
  gönderilmeden yakalanır. Jsonnet'in kendi fonksiyon/mixin mekanizması,
  golden-signal grid'ini ve SLO panel setini tek bir ortak dosyada
  (`templates/lib/common.libsonnet`) tanımlayıp beş servis tipi arasında
  paylaşmayı sağlar.
- Eksi: Jsonnet, ekibin çoğunun aşina olmadığı bir dil (fonksiyonel,
  lazy-evaluated) -- öğrenme eğrisi var. Grafonnet'in kendi sürüm
  değişiklikleri (major bump'larda builder API'si değişebilir) takip
  gerektirir.

## Karar (Decision)

**Grafonnet seçildi.** Derleme-zamanı şema doğrulaması ve ortak panel/grid
tanımlarının tek yerde yaşaması, beş servis tipi × iki template sürümü (v1,
v2) matrisinde elle bakımı sürdürülemez kılacak tekrarı ortadan kaldırıyor.

## Sonuçlar (Consequences)

- Repo, Grafonnet kaynağını (`jsonnet_vendor/`) belirli bir commit'e pinler
  ve build sırasında ağ erişimi gerektirmez -- bu da CI'ın deterministik
  kalmasını sağlar ama Grafonnet güncellemelerinin manuel bir "vendor
  refresh" adımı gerektirdiği anlamına gelir.
- Yeni katılan mühendislerin Jsonnet'e aşina olması gerekiyor; bu, repo'nun
  "yeni servis tipi ekleme" rehberinde (bkz. o repo'nun README'si) açıkça
  belgelenmiştir.
- `go-jsonnet` (harici `jsonnet` binary'sine ihtiyaç duymayan Go
  implementasyonu) kullanıldığı için CLI tek bir statik binary olarak
  dağıtılabiliyor -- bu, Go'nun zaten platform genelinde tercih edilen dil
  olmasıyla (bkz. ADR-0004) tutarlı.

## İlgili kararlar

- ADR-0004 (CLI exec vs kütüphane import): bu Grafonnet render mantığı,
  `obs-onboarding-controller` tarafından bir kütüphane olarak değil, CLI
  olarak tüketilir.
