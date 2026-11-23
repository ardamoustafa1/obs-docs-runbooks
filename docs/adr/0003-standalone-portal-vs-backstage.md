---
title: "Developer Portal: standalone mı, Backstage plugin mi"
status: accepted
date: "2026-09-16"
deciders: "team-observability"
affects_repos:
  - obs-developer-portal
---

# ADR-0003: Developer Portal: standalone mı, Backstage plugin mi

## Bağlam (Context)

Platformun "wow factor" yüzeyi olarak tasarlanan Developer Portal, ya
mevcut bir Backstage kurulumuna plugin olarak eklenebilirdi ya da bağımsız
bir uygulama (Next.js frontend + Go/Node backend) olarak kurulabilirdi.

## Değerlendirilen Seçenekler

### Seçenek A: Backstage plugin
- Artı: Software Catalog, auth, plugin ekosistemi (TechDocs, scaffolder)
  hazır gelir; organizasyon zaten Backstage kullanıyorsa tek "pane of
  glass"a eklenir.
- Eksi: Backstage'in kendi backend'i (Node + Postgres) ve plugin API'sinin
  öğrenme eğrisi var; React component'leri Backstage'in Material UI
  tabanlı tema motoruna bağımlı kalır -- istenen özenli "ürün" hissini bu
  var olan görünümden koparmak ekstra iş gerektirir. Ayrıca
  `obs-onboarding-controller/cmd/catalog` zaten bir Service Catalog REST
  API'si sağlıyor -- Backstage'in kendi catalog'unu da kurmak, ikinci bir
  catalog katmanı ve senkronizasyon sorunu demek.

### Seçenek B: Standalone (Next.js + backend API)
- Artı: Tam tasarım kontrolü; mevcut `obs-onboarding-controller` catalog
  API'sini doğrudan tüketir, ikinci bir catalog'a ihtiyaç yok; birkaç
  günde production'a çıkar; kendi release döngüsü.
- Eksi: Auth/RBAC'ı (OIDC entegrasyonu) sıfırdan kurmak gerekir; org
  ileride gerçekten Backstage'e yatırım yaparsa bu iş kısmen tekrarlanabilir.

## Karar (Decision)

**Standalone seçildi.** Organizasyonun hiçbir repo'sunda (bu platformun
diğer parçalarının hiçbirinde) mevcut bir Backstage yatırımına dair iz
yok; sıfırdan Backstage kurup üstüne plugin yazmak, zaten var olan bir
catalog REST API'sinin üzerine gereksiz bir ikinci katman eklemek anlamına
gelirdi.

## Sonuçlar (Consequences)

- Auth/RBAC, OIDC entegrasyonuyla bu repo içinde inşa edildi (bkz.
  `obs-developer-portal`'ın kendi README'si) -- bu, Backstage'in hazır
  auth çözümünün sağladığı kısayolu kaybetmek anlamına geliyor.
- Backend API'nin agregasyon mantığı (catalog + Prometheus/Thanos +
  Alertmanager fan-in), kendi başına bağımsız bir sözleşme (OpenAPI) olarak
  tasarlandı -- bu karar geri alınamaz değil: org ileride bir Backstage
  yatırımı yaparsa, bu API bir Backstage plugin'inin veri kaynağı olarak
  yeniden kullanılabilir, asıl agregasyon/PromQL yatırımı kaybolmaz.

## İlgili kararlar

- ADR-0005 (Polling vs WebSocket): standalone backend'in gerçek zamanlı
  güncelleme stratejisi.
