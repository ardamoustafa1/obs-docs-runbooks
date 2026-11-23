---
title: "Error Budget Burn: Fast (Worker jobs, 1h/5m, 14.4x)"
service_type: worker
alert_types:
  - ErrorBudgetBurnFast
severity: page
owner_doc: obs-alert-rule-templates
last_reviewed: "2026-09-17"
---

## Alert Açıklaması

HTTP servislerindeki karşılığıyla aynı burn-rate matematiği, worker/queue
servislerinde `worker_jobs_processed_total{status="failure"}` sayacı
üzerinden çalışır:

```promql
(
  sum(rate(worker_jobs_processed_total{service="<svc>",environment="<env>",status="failure"}[1h]))
  /
  clamp_min(sum(rate(worker_jobs_processed_total{service="<svc>",environment="<env>"}[1h])), 1e-9)
) > 0.0144
and
(
  sum(rate(worker_jobs_processed_total{service="<svc>",environment="<env>",status="failure"}[5m]))
  /
  clamp_min(sum(rate(worker_jobs_processed_total{service="<svc>",environment="<env>"}[5m])), 1e-9)
) > 0.0144
```

Job'ların %14.4x oranında (30 günlük budget'i ~2 günde tüketecek hızda)
başarısız olduğunu gösterir.

## Olası Nedenler

1. **Downstream bağımlılık kesintisi** -- worker'ın işlediği job'lar
   genelde bir veritabanına, harici API'ye veya başka bir servise yazıyor/
   okuyor; o bağımlılık çökmüş olabilir.
2. **Zehirli mesaj (poison message)** -- kuyruktaki belirli bir mesaj
   formatı worker'ı sürekli crash ettiriyor veya exception fırlatıyor
   olabilir; aynı mesaj retry mekanizmasıyla tekrar tekrar başarısız
   oluyor olabilir.
3. **Son deploy** -- worker kodunda bir regresyon.
4. **Kaynak tükenmesi** -- worker pod'unun memory/CPU limiti, artan job
   boyutu/hacmiyle yetersiz kalmış olabilir (bkz. saturation-high.md).
5. **Kuyruk altyapısı sorunu** -- mesaj kuyruğunun kendisinde (SQS,
   RabbitMQ, Kafka) bir sorun.

## İlk Müdahale Adımları

1. Worker loglarında en sık görülen hata/exception'ı belirle.
2. Son deploy zamanını hata oranının başladığı zamanla karşılaştır;
   örtüşüyorsa rollback yap.
3. Downstream bağımlılıkların kendi sağlık durumunu kontrol et.
4. Zehirli mesaj şüphesi varsa, dead-letter queue'ya (varsa) düşen
   mesajları incele -- aynı payload tekrar mı ediyor?
5. Kanamayı durdurmak için worker'ı geçici olarak durdurmak (job'ları
   kuyrukta biriktirmek) bazen retry storm'unu durdurmak için gereklidir
   -- ama bu, `worker_queue_depth`'in yükselmesine neden olur, bilinçli
   bir trade-off olarak uygula.

## Escalation Kriteri

- 15 dakika içinde iyileşme yoksa servis sahibi takımın on-call'ını
  escalate et.
- Kuyruk derinliği de hızla artıyorsa (aynı anda bir saturation alert'i
  tetikleniyorsa), downstream'in tamamen durmuş olma ihtimaline karşı
  daha erken escalate et -- job birikimi, kuyruk retention süresini
  aşarsa veri kaybına yol açabilir.

## İlgili Dashboard Linki

- Servis detay sayfası: `https://portal.acme.internal/services/<environment>/<service>`.
- Worker-özel panel: job success/failure oranı, `worker_queue_depth`
  zaman serisi.

## Post-Incident Aksiyonlar

- Zehirli mesaj kök nedense, dead-letter queue işleme/alerting
  mekanizmasının olup olmadığını gözden geçir; yoksa ekle.
- Kaybolan veya gecikmiş job'lar için kullanıcı/downstream etkisini
  değerlendir ve gerekiyorsa manuel bir replay/backfill planla.
