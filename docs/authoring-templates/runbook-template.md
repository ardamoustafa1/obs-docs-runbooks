<!--
RUNBOOK TEMPLATE — obs-docs-runbooks

Copy this file to runbooks/<serviceType>/<alert-type-slug>.md and fill in
every section. All seven sections below are MANDATORY — a runbook missing
one is not considered complete and should not be merged (see
onboarding/onboarding-guide.md's PR checklist, and
.github/workflows/lint-runbooks.yml, which fails a PR if any of these
headings is missing).

Naming: the alert-type slug is the alert's suffix with the service name
stripped and kebab-cased, e.g. alert "CheckoutApiErrorBudgetBurnFast" ->
slug "error-budget-burn-fast". See README.md "Runbook URL konvansiyonu"
for why runbooks are written per alert TYPE, not per service instance.

Front matter `alert_types` lists every exact alertname suffix this
runbook covers (there can be more than one, e.g. a single saturation
runbook covering CPU/memory/queue-depth variants) — the redirect layer in
redirects/ uses this to route a specific alertname to this page.
-->

---
title: <Kısa, aranabilir başlık — örn. "Error Budget Burn: Fast (1h/5m)">
service_type: <http|grpc|worker|batch|database>
alert_types:
  - <ErrorBudgetBurnFast gibi, servis adı olmadan, alert'in sabit suffix'i>
severity: <page|warning>
owner_doc: obs-alert-rule-templates
last_reviewed: <YYYY-MM-DD>
---

## Alert Açıklaması

<!--
Bu alert PromQL olarak ne ölçüyor, hangi golden signal'e karşılık geliyor,
hangi eşik/pencerede tetikleniyor? Bir mühendisin PromQL'i tekrar okumadan
"bu alert ne anlama geliyor" sorusuna cevap bulabileceği 2-4 cümle.
-->

## Olası Nedenler

<!--
En sık görülenden en nadir görülene doğru sıralı, madde madde liste.
Her madde "bunu nasıl doğrularım" ipucu içermeli (hangi dashboard paneli,
hangi log sorgusu, hangi deploy geçmişi).
-->

## İlk Müdahale Adımları

<!--
Numaralı, sırayla uygulanacak adımlar. Her adımın somut bir komut, sorgu
veya link içermesi tercih edilir — "kontrol et" gibi belirsiz talimatlar
yerine "şu PromQL'i şu dashboard'da çalıştır" gibi.
-->

1. ...
2. ...
3. ...

## Escalation Kriteri

<!--
Ne zaman, kime, nasıl escalate edilir? Somut bir zaman eşiği ver (örn.
"İlk müdahale adımları 15 dakika içinde budget'ı stabilize etmezse").
-->

## İlgili Dashboard Linki

<!--
Grafana dashboard linki (genel şablon; spesifik servis linki alert'in
kendi `summary`/`labels`'ından türetilir) ve varsa ilgili log/trace
sorgusu linki.
-->

## Post-Incident Aksiyonlar

<!--
Olay kapandıktan sonra yapılması gerekenler: postmortem şablonu, alert
eşiğinin gözden geçirilmesi gerekip gerekmediği, error budget policy'nin
tetiklenip tetiklenmediği (örn. "budget %0 altına düşerse feature
freeze").
-->
