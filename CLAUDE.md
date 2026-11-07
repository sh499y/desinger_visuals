# viusal

Aplikacja desktopowa: Electron 44 + React 19 + TypeScript 5.9, budowana przez electron-vite 6 (Vite 8), pakowana przez electron-builder.

## Struktura

| Ścieżka | Proces | tsconfig |
|---|---|---|
| `src/main/` | proces główny (Node + API Electrona) | `tsconfig.node.json` |
| `src/preload/` | preload, most `contextBridge` → `window.electron`, `window.api` | `tsconfig.node.json` (+ `index.d.ts` w `tsconfig.web.json`) |
| `src/renderer/src/` | UI w React (przeglądarka, bez Node) | `tsconfig.web.json`, alias `@renderer/*` |
| `resources/` | zasoby runtime (ikona); import z `?asset` | — |
| `build/` | zasoby dla electron-buildera (ikony, entitlements) | — |
| `electron.vite.config.ts`, `electron-builder.yml` | konfiguracja buildu i pakowania | — |

## Router agentów

Każde zadanie kieruj do subagenta, który jest właścicielem danego obszaru (`.claude/agents/`). Małe, jednoplikowe zmiany możesz zrobić sam, ale trzymaj się zasad danego obszaru.

| Zadanie dotyczy… | Agent |
|---|---|
| okien, menu, tray, dialogów, systemu plików, procesów, auto-update, cyklu życia aplikacji, handlerów `ipcMain` | `electron-main` |
| nowego kanału IPC, `contextBridge`, `window.api`, typów współdzielonych przez main i renderer | `ipc-bridge` |
| komponentów React, stanu, stylów, hooków, widoków, zasobów UI | `react-ui` |
| zależności npm, `package.json`, tsconfig, ESLint/Prettier, `electron.vite.config.ts`, `electron-builder.yml`, paczek instalacyjnych | `build-release` |
| przeglądu zmian, bezpieczeństwa Electrona, weryfikacji przed commitem | `reviewer` (tylko odczyt) |

### Zadania przekrojowe

Funkcja wymagająca komunikacji UI ↔ system (np. „otwórz plik i pokaż jego treść”) idzie w tej kolejności:

1. `ipc-bridge` – definiuje kontrakt: nazwa kanału, typy argumentów i wyniku, metoda w `window.api`.
2. `electron-main` – implementuje handler zgodny z kontraktem.
3. `react-ui` – używa `window.api.*` w interfejsie.
4. `reviewer` – sprawdza całość i uruchamia weryfikację.

Kroki 2 i 3 mogą iść równolegle, gdy kontrakt z kroku 1 jest gotowy. Nowa zależność npm zawsze przechodzi przez `build-release`.

## Zasady wspólne

- Renderer nigdy nie importuje `electron`, `fs`, `path` ani innych modułów Node. Wszystko idzie przez `window.api`.
- Nie wyłączaj `contextIsolation`, nie włączaj `nodeIntegration`, nie luzuj CSP w `src/renderer/index.html` bez uzasadnienia.
- IPC z odpowiedzią: `ipcMain.handle` + `ipcRenderer.invoke`. Jednokierunkowe: `send`/`on`. Waliduj argumenty w mainie – renderer jest niezaufany.
- Kod ma przejść `npm run typecheck` i `npm run lint`. Formatowanie: Prettier (`npm run format`).

## Weryfikacja

```bash
npm run typecheck   # tsc dla node i web
npm run lint        # eslint
npx electron-vite build
```

`npm run dev` uruchamia aplikację z HMR. Jeśli uruchamiasz z rozszerzenia VS Code, najpierw `unset ELECTRON_RUN_AS_NODE` – inaczej Electron startuje jako zwykły Node i pada na `app.isPackaged`.
