# SPHERE Observability

SPHERE exposes Prometheus metrics from:

```text
https://sphere.astraotoparts.co.id/dev/api/metrics
```

The repository contains:

- `prometheus-sphere-dev.yml` — DEV scrape profile.
- `sphere-prometheus-rules.yml` — collector reliability alert rules.
- `alertmanager-sphere.example.yml` — receiver template. Replace the placeholder only with an approved internal receiver.

Recommended validation:

```bash
promtool check config ops/observability/prometheus-sphere-dev.yml
promtool check rules ops/observability/sphere-prometheus-rules.yml
amtool check-config ops/observability/alertmanager-sphere.example.yml
```

The repository does not install or restart Prometheus/Alertmanager automatically. Infrastructure ownership remains explicit; SPHERE only provides the scrape endpoint and versioned rule/config templates.
