---
title: "Developer Portal: gerçek zamanlı güncelleme -- polling mi, WebSocket mi"
status: accepted
date: "2026-09-16"
deciders: "team-observability"
affects_repos:
  - obs-developer-portal
---

# ADR-0005: Gerçek zamanlı güncelleme -- polling mi, WebSocket mi

## Bağlam (Context)

Developer Portal'ın servis detay ve health overview sayfalarının, aktif
alert durumunu ve SLO/error-budget rakamlarını kullanıcı sayfayı yenilemeden
"canlı" göstermesi gerekiyordu.

## Değerlendirilen Seçenekler

### Seçenek A: WebSocket (sunucudan tarayıcıya push)
- Artı: Değişiklik anında yansır, ekstra HTTP isteği yok.
- Eksi: Prometheus ve Alertmanager kendileri pull-tabanlıdır; bu veriyi
  WebSocket üzerinden push etmek, arkada yine polling yapıp sonucu bir
  socket'e yazan bir katman eklemek demektir -- gerçek bir kazanç
  olmadan ekstra karmaşıklık. Kalıcı bağlantı state'i, backend'in yatay
  ölçeklenmesini (birden fazla API pod'u, sticky session ihtiyacı) zorlaştırır.
  Bazı kurumsal ağlar/proxy'ler WebSocket'i engeller veya düzgün
  proxy'lemez.

### Seçenek B: Client-side polling (kısa aralıklarla HTTP GET)
- Artı: HTTP cache'leme, CDN'ler ve kurumsal proxy'lerle sürtüşmesiz;
  backend pod'ları stateless kalır (yatay ölçeklenme bedavaya gelir).
  İstemci kütüphanesinin (SWR) kendi request de-duplication'ı, aynı sayfayı
  açık tutan birden fazla sekmenin gereksiz tekrar istek atmasını zaten
  önler.
- Eksi: Veri, en fazla polling aralığı kadar (alert'ler için ~20s, SLO
  rakamları için ~60s) gecikmeli görünür.

## Karar (Decision)

**Polling seçildi.** Alert durumunun birkaç saniye - birkaç on saniye
gecikmeli görünmesi bir dashboard için kabul edilebilir (bu zaten
Prometheus'un kendi `scrape_interval`'i kadar bir gecikmeyi doğal olarak
taşır) -- WebSocket'in getirdiği operasyonel karmaşıklığı bu kazanç haklı
çıkarmıyor.

## Sonuçlar (Consequences)

- Backend API pod'ları tamamen stateless kalır, herhangi bir sayıda
  replica'ya sorunsuz ölçeklenir.
- Backend'de kısa TTL'li cache (60s catalog, 30s metrik) polling'in
  upstream'e (Prometheus/Alertmanager) getirdiği yükü sınırlıyor -- bu
  cache olmasaydı polling seçimi upstream'i gereksiz yere yorabilirdi;
  yani polling kararı, cache katmanının varlığına bağımlıdır.
- İleride gerçekten sub-saniye gecikme gereken bir kullanım ortaya
  çıkarsa (bugün öngörülmüyor), bu karar gözden geçirilebilir --
  değişmez bir taahhüt değildir.
