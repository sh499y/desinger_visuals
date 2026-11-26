# CRT Bender: node „MPC” w wizualizerze

Data: 2026-11-26 · gałąź `crt-bender` (kopia `desinger_visuals`, gałąź `bez-timeline` @ 116bacc)

## Po co

Kacper chce grać na Akai MPC Sample i jednocześnie sterować efektami wizualizera Błażeja. Efekty już istnieją jako shadery w grafie node'ów, więc MPC ma być **kontrolerem**: pady, pokrętło i przyciski sterują parametrami efektów, a dźwięk z MPC napędza analizę audio. Obraz leci na dużym ekranie z wizualizera, nie na ekranie MPC.

## Cele

- Nowy node sterujący **MPC** (kategoria `control`, obok Audio, LFO, Math). Jego wyjścia wpina się kablem pod dowolny parametr efektu.
- Działa ze zwykłym samplerem Akai: pady grają sample, a przy okazji wysyłają MIDI przez USB. Na MPC nic nie trzeba instalować.
- Dźwięk: wejście „MPC Sample Audio” wybrane w panelu (mechanizm już istnieje), więc node Audio reaguje na to, co gra MPC.

## Poza zakresem

- Program na samym MPC (CRT Bender na ekranie 320×240, własne sample i syntezator). Odłożony na później.
- Wysyłanie czegokolwiek do MPC (podświetlanie padów, MIDI out).
- Zmiany w oryginalnym repo `~/Projekty/git/desinger_visuals`.

## Czego unikać

- Alokacji w pętli klatki (zasada projektu). Stan MIDI trzymany w stałych tablicach.
- Luzowania zabezpieczeń: zgoda na MIDI tylko dla okna wizualizacji, tak jak dziś `media`. Bez SysEx.
- Ruszania cudzej pracy w toku (niezacommitowane zmiany audio na macOS w oryginale).

## Podejścia

1. **Web MIDI w oknie wizualizacji (wybrane).** Okno to Chromium, `navigator.requestMIDIAccess()` działa bez zależności. Wiadomości trafiają prosto do silnika, który liczy sygnały co klatkę, więc opóźnienie jest najmniejsze.
2. MIDI w procesie głównym przez natywną bibliotekę (np. `@julusian/midi`) i IPC do okna. Wymaga przebudowy natywnego modułu pod Electron i dokłada skok IPC, a nic nie daje.
3. Program na MPC wysyłający dane siecią USB (`192.168.155.x`) do backendu. Niepotrzebne, skoro zwykły Akai wysyła MIDI. Może wrócić razem z aplikacją na MPC.

## Projekt

### Rozpoznanie (zrobione 2026-11-26)
Szczegóły w `docs/crt-bender/notatki-sprzet.md`. Pady wysyłają na kanale 1 nuty 36–51 (pad 1 = 36), velocity i poly aftertouch. Pokrętło i przyciski nie wysyłają nic, więc node ma tylko wyjścia padów. Na MPC trzeba ustawić MIDI Port = USB i Pad MIDI Out = zawsze.

### Definicja (`src/shared/nodes.ts`)
`MPC`: `category: 'control'`, bez wejść obrazu i sygnału.
- Wyjścia (0..1):
  - `hit`: obwiednia uderzenia, skacze do siły uderzenia i wygasa w czasie `decay`;
  - `held`: 1, dopóki pad jest wciśnięty (wartość = nacisk z poly aftertouch, a przed pierwszym aftertouchem siła uderzenia);
  - `last`: który pad uderzono ostatnio (0 = pad 1, 1 = pad 16). (Nazwa `pad` zderzałaby się z parametrem `pad`.)
- Parametry: `pad` (select: Wszystkie, Pad 1–16), `decay` (s, 0.05–3, domyślnie 0.4), `gain` (0–4, domyślnie 1).

### Wejście MIDI (`src/renderer/src/engine/midi/`)
- `MidiInput`: prosi o dostęp, nasłuchuje wszystkich wejść (z MPC na pierwszym miejscu), obsługuje podłączanie i odłączanie (`onstatechange`).
- Czysty, testowalny `MidiState`: tablice `Float32Array` na 128 nut (siła, wciśnięcie, licznik uderzeń), ostatni pad. Parser wiadomości note on/off i poly aftertouch bez alokacji (reszta ignorowana).
- Mapa: pad N = nuta 35 + N (36–51), w jednym miejscu. Kanał dowolny (nie filtrujemy).

### Sygnały (`src/renderer/src/engine/graph.ts`)
`SignalBus.evaluate(audio, midi, dt)`: przypadek `MPC` liczy obwiednię per node z jego `decay` i `gain`, filtrując po wybranym padzie. Brak urządzenia oznacza same zera, bez błędów.

### Zgoda (`src/main/index.ts`)
Handler uprawnień przepuszcza też `midi` dla okna wizualizacji. `midiSysex` dalej odrzucany.

### Panel
`MPC` dodany do listy node'ów sterujących (`EffectsView` `CONTROL_TYPES`) z własnym kolorem kabli (`palette.ts`). Parametry panel bierze z definicji automatycznie.

### Testy
- `MidiState`: parsowanie, note on z velocity 0 jako note off, poly aftertouch, nuty spoza 36–51 ignorowane, filtr po padzie.
- `SignalBus`: obwiednia `hit` i jej wygasanie, `held`, `pad`, `gain`, zera bez urządzenia.
- `sanitizeGraph` przyjmuje node `MPC` z poprawnymi parametrami.

## Dla wykonawcy
- Dokładne kolory i etykiety po polsku, w stylu istniejących node'ów.
- Status MIDI (podłączone, brak) w panelu: opcjonalnie, jeśli tanio wychodzi przez istniejący kanał statusu audio. Inaczej osobne zadanie.

## Weryfikacja
`npm run typecheck`, `npm run lint`, `npm test`, a potem ręcznie: `npm run dev`, node MPC w grafie, kabel do np. Glitch, stuknięcie w pad błyska efektem.
