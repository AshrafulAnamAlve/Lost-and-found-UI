# Lost & Found — Web UI

Angular 21 front end for the Lost & Found recovery platform: report lost/found
items, get explainable AI match suggestions, and chat with the other party in
real time.

- **Live app:** https://ashrafulanamalve.github.io/Lost-and-found-UI/
- **API:** https://lostandfoundd.runasp.net (source: [Lost-FoundAPI](https://github.com/AshrafulAnamAlve/Lost-FoundAPI))
- **API health:** https://lostandfoundd.runasp.net/api/health

## Configuration

The backend origin lives in one place — `src/environments/` — and is consumed
through `src/app/api.ts`. Nothing else in the app hardcodes a URL.

| Build | File | Backend it talks to |
| --- | --- | --- |
| `development` (`ng serve`) | `environment.ts` | `https://<page hostname>:7124` — the API running on your machine |
| `production` (`ng build`) | `environment.prod.ts` | `https://lostandfoundd.runasp.net` |

The development origin is derived from `location.hostname` rather than
hardcoded, so opening the dev server from another device on the same network
(`https://192.168.0.103:4200`) still reaches that machine's API.

## Development

```bash
npm install
npm start          # http://localhost:4200
```

Run the API (`dotnet run --launch-profile https`) first, and start
`ml_service/start.ps1` alongside it if you want the semantic matching layer
active — without it the API falls back to rule-based matching only. `/api/health`
reports which mode is live.

## Build

```bash
npm run build      # production build -> dist/LostandFoundUI/browser
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the app
and publishes it to GitHub Pages. Two details are specific to Pages:

- The site is served from a sub-path, so the build passes
  `--base-href /Lost-and-found-UI/`.
- Pages has no SPA rewrite rule, so `index.html` is also published as
  `404.html`. A hard refresh on `/dashbord` then still boots the app and the
  Angular router resolves the URL.
