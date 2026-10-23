# Contributing

Issues and pull requests are welcome.

## Setup

```powershell
npm ci
npm run lint
npm run build
```

## Guidelines

- Keep the control free of external service calls (`external-service-usage` must stay `enabled="false"`), so it is not a premium component.
- The host dataset is the only data source; do not add unrestricted Web API retrievals of the view.
- Bump `version` in `UniversalGrid/ControlManifest.Input.xml` and the solution version in `Solution/src/Other/Solution.xml` for every release, and add an entry to `CHANGELOG.md`.
- `npm run lint` and `npm run build` must pass (CI runs both).
- Never commit `node_modules`, `out`, `bin`, `obj`; only the release zip files in `releases/` are tracked.
- Never commit environment URLs, tokens or credentials.
