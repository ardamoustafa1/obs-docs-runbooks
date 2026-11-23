---
title: "obs-docs-runbooks statik site üretici seçimi: MkDocs mi, Docusaurus mu"
status: accepted
date: "2026-09-17"
deciders: "team-observability"
affects_repos:
  - obs-docs-runbooks
---

# ADR-0006: Statik site üretici seçimi: MkDocs mi, Docusaurus mu

## Bağlam (Context)

Bu repo'nun içeriği (runbook'lar, ADR'ler, onboarding rehberi, sözlük)
neredeyse tamamen düz Markdown; interaktif React component'lerine veya
MDX'e ihtiyaç yok. Yine de aranabilir, iyi gezinen, sürümlenebilir bir
statik site olarak yayınlanması gerekiyor.

## Değerlendirilen Seçenekler

### Seçenek A: Docusaurus
- Artı: React/MDX tabanlı, versiyonlu dokümantasyon (`docs` + `versioned_docs`)
  için güçlü yerleşik destek, geniş plugin ekosistemi.
- Eksi: Node.js tabanlı build zinciri, bu repo'nun içeriği için gereğinden
  karmaşık (React component yazma ihtiyacı yok); build süresi ve
  bağımlılık yüzeyi MkDocs'a göre daha büyük.

### Seçenek B: MkDocs + Material tema
- Artı: Python tabanlı, tek bir `mkdocs.yml` ile yapılandırılır; Material
  teması aranabilirlik (yerleşik arama, `lunr`/`mkdocs-material` search
  index'i), kod bloğu vurgulama, admonition (`!!! warning` gibi) ve
  mermaid diyagram render'ını (bu repo'nun ADR'lerindeki mimari
  diyagramlar için tam olarak ihtiyaç duyulan şey) kutudan çıkar çıkmaz
  destekler. `mike` plugin'i ile versiyonlama mümkün (ihtiyaç olursa).
  CI'da tek bir `pip install` + `mkdocs build` adımı yeterli.
- Eksi: React/MDX gerektiren gelecekteki bir interaktif özellik
  (örneğin canlı bir PromQL test editörü) Docusaurus'a göre daha zor
  eklenir.

## Karar (Decision)

**MkDocs + Material seçildi.** İçerik saf Markdown olduğu ve bu repo'nun
birincil değeri "hızlı bulunabilir, iyi organize edilmiş metin" olduğu
için, Docusaurus'un React/MDX gücü kullanılmayacak bir karmaşıklık
maliyeti olurdu. MkDocs Material'ın yerleşik mermaid desteği, ADR'lerdeki
mimari diyagramların ekstra bir plugin/konfigürasyon olmadan render
edilmesini sağlıyor.

## Sonuçlar (Consequences)

- Yayınlama pipeline'ı Python tabanlıdır (`pip install mkdocs
  mkdocs-material`) -- bu, platformun geri kalanının Go/Node/Java
  odaklı olmasından farklı bir araç zincirini bu tek repo'ya getiriyor,
  ama bu repo'nun CI'ı yalnızca bu repo içinde çalıştığı için izole bir
  maliyet.
- Runbook URL konvansiyonu (`https://runbooks.acme.com/{serviceType}/{alertname}`),
  MkDocs'un statik dosya yapısıyla birebir örtüşmüyor çünkü `{alertname}`
  servis adını içeriyor ama bu repo runbook'ları alert **tipi** başına
  yazıyor (bkz. README.md "Runbook URL konvansiyonu") -- bu uyumsuzluk,
  GitHub Pages'in üstünde ince bir redirect katmanı (bkz.
  `redirects/`) gerektiriyor; MkDocs'un kendisi bu redirect mantığını
  çalıştırmaz, yalnızca statik dosyaları üretir.
- Versiyonlama (`mike` plugin'i) bugün kurulmadı -- bu repo'nun içeriği
  "her zaman güncel" (living document) olarak tasarlandığı için geçmiş
  sürümleri ayrı ayrı yayınlamaya henüz ihtiyaç yok; ileride bir runbook'un
  belirli bir alert kuralı sürümüne kilitlenmesi gerekirse bu eklenebilir.
