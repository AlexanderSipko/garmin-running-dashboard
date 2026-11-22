# Frontend structure

The frontend is a small React app organized by responsibility. The entry point only mounts the app and loads global styles.

```text
src/
├── app/             application state and page navigation
├── components/      UI shared by dashboard variants
├── dashboards/      the three selectable dashboard layouts
├── calculator/      pace calculator page and its UI
├── hooks/           Garmin sync and running coach API state
├── data/            preview data and dashboard choices
├── lib/             formatting and calculations without UI
└── styles/          Tailwind entrypoint and shared theme tokens
```

The backend's `coach.py` prepares coach prompts and delegates requests to the GigaChat REST client in `backend/providers/gigachat.py`. The client exchanges the project authorization key for a short-lived access token and keeps that token on the backend. The frontend never receives either key or token.

Use Tailwind utilities and responsive variants in the components. Put shared theme tokens and base Tailwind directives in `styles/index.css`. Keep credential variables in the backend configuration.

Keep calculations independent from React components where practical. Add a component to `components/` when more than one page uses it; keep page-specific pieces beside their page. The app uses function components and hooks.
