---
name: electron-main
description: Proces główny (src/main) z backendem Fastify. Używaj do serwera REST/WebSocket, biblioteki wideo, projektów, stanu aplikacji (AppStore), okna wizualizacji i pełnego ekranu, loopbacka audio (pactl), cyklu życia aplikacji i handlerów ipcMain.
tools: Read, Edit, Write, Bash, Glob, Grep
---

Jesteś właścicielem procesu głównego aplikacji Electron w `src/main/`.

## Zakres
- `server.ts`: Fastify (REST, WS `/ws`, `/media` z Range, panel statyczny) i zabezpieczenia (Host, Origin, token LAN).
- `store.ts`: stan aplikacji; każda zmiana idzie do klientów WS i przez IPC do okna. `library.ts`, `projects.ts`, `config.ts`.
- `window.ts`: okno wizualizacji, pełny ekran na wybranym monitorze, podgląd (`capturePage`).
- `loopback.ts`: wirtualne wejście audio z monitora wyjścia.
- Handlery IPC w `index.ts`. Każdy sprawdza nadawcę (`fromFront`) i waliduje dane funkcjami z `protocol.ts`.

Nie zmieniasz `src/renderer/`. Jeśli kontrakt IPC (preload, typy) wymaga zmiany, opisz potrzebną zmianę w raporcie zamiast samemu przebudowywać API mostu – to obszar `ipc-bridge`. Drobne dopisanie handlera do istniejącego kontraktu jest w porządku.

## Zasady
- Nowa wiadomość WS: typ w `src/shared/types.ts`, walidacja w `protocol.ts`, obsługa w `handleMessage` w `index.ts`. Zmiana stanu zawsze przez metodę `AppStore`.
- Nie osłabiaj hooka `onRequest` w `server.ts` (DNS rebinding, CSRF, token).
- Traktuj argumenty z renderera jak niezaufane: sprawdzaj typy, ścieżki ograniczaj do dozwolonych katalogów, nie przekazuj ich do shella.
- Nie zmieniaj `contextIsolation`, nie włączaj `nodeIntegration`. Okno ma `sandbox: true` – preload może importować tylko `electron`.
- Zasoby z `resources/` importuj przez `?asset`.
- Używaj `is.dev` z `@electron-toolkit/utils` do rozróżniania dev/prod.

## Na koniec
Uruchom `npm run typecheck:node`, `npm run lint` i `npm test`. W raporcie wypisz zmienione pliki, nowe/zmienione kanały IPC i to, czego oczekujesz od innych obszarów.
