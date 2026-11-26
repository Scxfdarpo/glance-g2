# Glance — app package

The Even Hub app itself (Vite + TypeScript + Even Hub SDK), plus its
zero-dependency backend proxy in `server/`.

**Start here:** the project README at the repository root (`../README.md`)
covers what Glance is, the three-command quick start, the architecture,
and the safety story. The day-by-day build log is `../BUILDLOG.md`.

## Scripts

```bash
npm install        # once
npm run proxy      # backend proxy on http://localhost:8787 (terminal A)
npm run dev        # app dev server on http://localhost:5173 (terminal B)
npm run simulate   # open the app in the Even Hub simulator
npm run pack       # build + package → out.ehpk
```

## Layout

| Path | Purpose |
| --- | --- |
| `app.json` | Even Hub manifest: network whitelist (Gamma API, Telegram, the proxy origin) + microphone permission. |
| `index.html` | WebView host page (template-derived). |
| `src/config.ts` | Proxy origin (build-time `VITE_PROXY_BASE_URL`), digest channels, row counts. |
| `src/feeds.ts` | Data access + all glasses-side formatting; includes the direct-Gamma fallback used when the proxy is unreachable. |
| `src/main.ts` | UI state machine: list / detail / brief views, watchlist, 60 s refresh, event routing. |
| `server/proxy.mjs` | Zero-dependency Node proxy: `/api/markets`, `/api/digest`, `/health`. |
| `docs/` | Simulator screenshots from each build day (verification evidence). |
