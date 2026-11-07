# Visualizer

Desktopowa aplikacja na Linuksa: wideo z plików przetwarzane na żywo filtrami sterowanymi dźwiękiem z systemu. Electron 44 + React 19 + TypeScript 5.9 + Three.js + `postprocessing`, build przez electron-vite 6 (Vite 8), pakowanie przez electron-builder. Plan produktu: `Visualizer_plan.md`, opis dla ludzi: `README.md`.

## Architektura

```text
Panel (przeglądarka) ──WS / REST──▶ Backend :4000 (main process) ──IPC──▶ Okno wizualizacji (renderer)
        ▲                                    │
        └──── mierniki audio co ~100 ms ─────┘◀── IPC ── analiza FFT w oknie
```

Stan trzyma serwer (`AppStore`). Panel wysyła zmiany przez WS, serwer rozsyła pełny `state` albo lekką łatkę `param` do klientów WS i przez IPC do okna.

## Struktura

| Ścieżka | Co | tsconfig |
|---|---|---|
| `src/shared/` | typy protokołu (`types.ts`), definicje node'ów (`nodes.ts`), operacje na grafie (`graph.ts`). Bez importów z Electrona, Node ani DOM | wszystkie trzy |
| `src/main/` | proces główny: `index.ts` (start, IPC), `server.ts` (Fastify, REST, WS, zabezpieczenia), `store.ts` (stan + zapis), `library.ts`, `projects.ts`, `loopback.ts` (pactl), `window.ts`, `protocol.ts` (walidacja wiadomości), `config.ts` | `tsconfig.node.json` |
| `src/preload/` | `window.api` (typ `FrontApi` z `src/shared/types.ts`) | `tsconfig.node.json` |
| `src/renderer/src/` | okno wizualizacji: `App.tsx` (canvas + nakładka) i `engine/` (czysty TS: `renderer.ts`, `graph.ts`, `audio/`, `video/`, `nodes/effects.ts`) | `tsconfig.web.json` |
| `src/panel/` | panel sterowania (osobny Vite: `vite.panel.config.mts`, Tailwind 4, Zustand, React Flow). Build do `out/panel`, serwowany przez backend | `tsconfig.panel.json` |

Aliasy: `@shared/*` wszędzie, `@renderer/*` w oknie, `@panel/*` w panelu. Nowy alias dodaj w konfigu Vite, w tsconfig i w `vitest.config.mts`.

## Router agentów

Każde zadanie kieruj do subagenta, który jest właścicielem danego obszaru (`.claude/agents/`). Małe, jednoplikowe zmiany możesz zrobić sam, ale trzymaj się zasad danego obszaru.

| Zadanie dotyczy… | Agent |
|---|---|
| backendu (Fastify, REST, WS, biblioteka, projekty), okien, pełnego ekranu, loopbacka audio, cyklu życia aplikacji | `electron-main` |
| protokołu: typy w `src/shared/types.ts`, wiadomości WS/IPC, `window.api`, walidacja w `protocol.ts` | `ipc-bridge` |
| silnika wizualizacji (`engine/`), node'ów i efektów, panelu sterowania (`src/panel/`) | `react-ui` |
| zależności npm, tsconfig, ESLint/Prettier, konfigi Vite, `electron-builder.yml`, paczek | `build-release` |
| przeglądu zmian, bezpieczeństwa, weryfikacji przed commitem | `reviewer` (tylko odczyt) |

### Zadania przekrojowe

Nowa funkcja panel ↔ system (np. „nagrywanie wyjścia do pliku”):

1. `ipc-bridge` definiuje wiadomość albo endpoint w `src/shared/types.ts` i jego walidację.
2. `electron-main` dodaje obsługę w serwerze lub store.
3. `react-ui` dodaje UI w panelu lub logikę w silniku.
4. `reviewer` sprawdza całość.

Nowy typ node'a: definicja w `src/shared/nodes.ts`, a dla filtra efekt w `engine/nodes/effects.ts` (`react-ui`). Panel i edytor grafu biorą parametry z definicji automatycznie.

## Zasady wspólne

- Renderer i panel nie importują `electron` ani modułów Node. Okno korzysta z `window.api`, panel z REST/WS (`src/panel/src/api.ts`).
- Wszystko z sieci i z IPC jest niezaufane. Waliduj w `protocol.ts` i `sanitizeGraph` / `sanitizeParam`. Nie osłabiaj kontroli Host/Origin/tokenu w `server.ts`.
- `contextIsolation` zostaje włączone, `sandbox` w oknie też. Nie luzuj CSP w `src/renderer/index.html` bez powodu.
- Wydajność: React nie bierze udziału w klatce. W pętli rAF niczego nie alokuj. Graf kompiluj tylko przy zmianie struktury. Bypass przebudowuje przejścia efektów, bo wyłączone ostatnie przejście nie rysowałoby na ekran.
- Kod ma przejść `npm run typecheck`, `npm run lint` i `npm test`. Formatowanie: Prettier.

## Weryfikacja

```bash
npm run typecheck   # node + web + panel
npm run lint
npm test            # vitest
npm run build       # out/main, out/preload, out/renderer, out/panel
```

`npm run dev` uruchamia okno i panel (`:5174`) z HMR. Z rozszerzenia VS Code najpierw `unset ELECTRON_RUN_AS_NODE`. Aplikacja ma blokadę jednej instancji, więc drugie uruchomienie tylko fokusuje okno.

## Pułapki

- Chromium na Linuksie nie widzi źródeł „Monitor of …”. Dlatego `loopback.ts` tworzy `module-remap-source` (`visualizer_loopback`).
- `/media/:id` zwraca nagłówek CORS tylko z kluczem `?k=` z `FrontInit.mediaKey`. Bez niego tekstura WebGL z innego originu zostanie zablokowana.
- Pusty POST z `content-type: application/json` Fastify odrzuci. Przy POST bez treści nie ustawiaj tego nagłówka.
