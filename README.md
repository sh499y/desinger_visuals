# Visualizer

Desktopowa aplikacja na Linuksa: wideo z plików przetwarzane na żywo filtrami, które reagują na dźwięk grający w systemie (Spotify, przeglądarka, DJ software). Electron + React + TypeScript + Three.js + `postprocessing`.

- **Okno wizualizacji**: sam obraz, bez UI. F11 włącza pełny ekran, P otwiera panel.
- **Panel sterowania** w przeglądarce, domyślnie `http://127.0.0.1:4000/`. Zawiera bibliotekę wideo, efekty, edytor node'ów, mierniki audio, podgląd i projekty. Działa też na telefonie po włączeniu „dostępu z sieci lokalnej”.

## Uruchomienie

```bash
npm install
npm run dev        # okno (electron-vite, :5173) + panel z hot reloadem (:5174)
```

W trybie dev panel jest pod `http://127.0.0.1:5174` i przekazuje zapytania do backendu na `:4000`.

> Jeśli uruchamiasz z terminala rozszerzenia VS Code, najpierw wykonaj `unset ELECTRON_RUN_AS_NODE`. Bez tego Electron startuje jako zwykły Node.

## Jak to działa

```text
Panel (przeglądarka) ──WS / REST──▶ Backend :4000 (main process) ──IPC──▶ Okno wizualizacji
        ▲                                    │
        └──── mierniki audio co ~100 ms ─────┘◀── IPC ── analiza FFT w oknie
```

- **Backend** (Fastify w procesie głównym) trzyma stan, serwuje panel, API i pliki wideo z obsługą Range.
- **Okno wizualizacji** renderuje łańcuch: źródło wideo → filtry → wyjście. Analizuje też audio (bass/mid/high/level/beat).
- **Graf node'ów**: kabel z sygnału (Audio, LFO, Math) do parametru liczy `clamp(sygnał × skala + offset, min, max)` w każdej klatce.

## Audio z systemu

Chromium nie pokazuje źródeł „Monitor of …” jako wejść. Dlatego przy starcie aplikacja tworzy przez `pactl` wirtualne wejście **Visualizer-Loopback** z monitora domyślnego wyjścia i zdejmuje je przy zamknięciu. Po zmianie wyjścia audio kliknij „odtwórz” w sekcji Audio panelu. Wymaga `pactl` (pakiet `pulseaudio-utils` albo `pipewire-pulse`).

Ręcznie (gdy wyłączysz `autoLoopback`):

```bash
pactl load-module module-remap-source \
  master=$(pactl get-default-sink).monitor \
  source_name=loopback \
  source_properties=device.description=Loopback
```

## Dane i konfiguracja

| Co | Gdzie |
| --- | --- |
| Biblioteka wideo | `~/Videos/visualizer/` (pliki dodane ręcznie też się pojawią) |
| Konfiguracja | `~/.config/Visualizer/config.json` |
| Stan (graf, aktywne wideo, wejście audio) | `~/.config/Visualizer/state.json` |
| Projekty | `~/.config/Visualizer/projects/*.json` |

`config.json` zawiera:

- `port` (domyślnie 4000; gdy jest zajęty, aplikacja bierze następny wolny),
- `libraryDir`,
- `lan` i `token` (dostęp z sieci lokalnej; spoza komputera wymagany jest `?token=…`),
- `openPanelOnStart`,
- `autoLoopback`.

Wydajność: najlepiej H.264 1080p (sprzętowe dekodowanie, VAAPI). Na słabszym GPU obniż „Rozdzielczość renderu” w node'cie Wyjście.

## Komendy

| Komenda | Co robi |
| --- | --- |
| `npm run dev` | okno + panel z hot reloadem |
| `npm test` | testy jednostkowe (Vitest): serwer, stan, biblioteka, graf, efekty, audio, wideo, panel |
| `npm run test:coverage` | testy + raport pokrycia (`coverage/index.html`) |
| `npm run typecheck` / `npm run lint` | TypeScript i ESLint |
| `npm run build` | build okna, procesu głównego i panelu do `out/` |
| `npm run build:linux` | `dist/Visualizer-<wersja>.AppImage` i `dist/visualizer_<wersja>_amd64.deb` |

## API

```text
GET    /api/state                 pełny stan
GET    /api/library               lista wideo { id, name, size, duration, thumb }
POST   /api/library               upload (multipart)
DELETE /api/library/:id
POST   /api/library/:id/meta      { duration, thumb } – panel liczy miniatury w przeglądarce
GET    /media/:id                 plik wideo z obsługą Range
GET    /api/preview.jpg           klatka z okna wizualizacji
GET    /api/projects              lista projektów
POST   /api/projects              { name, graph? } – zapis bieżącego (lub podanego) grafu
GET    /api/projects/:name        pobranie JSON
POST   /api/projects/:name/load
DELETE /api/projects/:name

WS /ws
→ playback:select { id } · effects:set { node, param, value } · node:bypass { node, bypass }
→ graph:set { graph } · audio:device { deviceId } · audio:loopback
→ output:fullscreen { on, displayId } · settings:lan { enabled }
← state { …pełny stan } · param { node, param, value } · audio { bass, mid, high, level, beat }
```
