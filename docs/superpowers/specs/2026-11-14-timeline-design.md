# Timeline klipów – projekt

## Po co

W trakcie seta Kacper chce kontrolować, **z których plików** korzysta wizualizacja,
w jakiej kolejności lecą i **jakie efekty ma każdy klip**, oraz **dokładać klipy na
żywo**. Obraz przez cały czas leci bez przerwy. Timeline zastępuje też wcześniejszą
prośbę „zmieniaj wideo na beat, ale nie częściej niż co X”.

## Cele

- Kolejka klipów z biblioteki, ustawiana w panelu biblioteki: dodaj, usuń, przesuń
  w górę i w dół.
- Każdy element kolejki ma własny graf efektów. Gdy element gra, zmiany w edytorze
  grafu zapisują się do niego.
- Przejście do następnego klipu po czasie elementu (domyślnie 16 s). Z włączonym
  „czekaj na beat” cięcie wypada na najbliższe uderzenie basu.
- Każdy element może grać tylko fragment klipu: punkty „od” i „do” (np. 3 s
  z 30-sekundowego klipu), zapętlone, dopóki element gra.
- Kolejkę zmieniasz w trakcie grania i to nie przerywa obrazu: zmienia się tylko
  to, co będzie dalej.
- Timeline działa, gdy panel jest zamknięty.

## Poza zakresem

Przewijanie i oś czasu z podglądem, przejścia (crossfade), kilka ścieżek, tempo w BPM,
zapisywanie kolejki w projektach. Kolejka żyje w stanie aplikacji.

## Czego nie wolno zepsuć

- Cięcie nie może dać czarnej klatki ani przeładować okna.
- Zamknięcie lub uśpienie panelu nie zatrzymuje timeline'u.
- Bez włączonego timeline'u aplikacja działa dokładnie jak dziś.

## Rozważone podejścia

1. **Zegar w oknie Visualizera, przy renderowaniu (wybrane).** Beat jest liczony tam
   co klatkę, więc cięcie trafia w uderzenie. Panel tylko edytuje kolejkę.
2. Zegar w procesie głównym: poziomy dźwięku przychodzą tam co ~100 ms, więc cięcie
   spóźniałoby się o kilka klatek względem beatu.
3. Zegar w panelu: zamknięcie karty zatrzymuje set.

Kacper wybrał 1.

## Jak to działa

### Dane (`src/shared/types.ts`)

```ts
interface TimelineItem {
  id: string // unikalne w kolejce
  videoId: string // klip z biblioteki
  graph: Graph // efekty tego klipu
  duration: number // s, 1–600, domyślnie 16
  waitBeat: boolean // domyślnie true
  inPoint: number // s od początku klipu, domyślnie 0
  outPoint: number | null // s; null = do końca klipu
}
interface Timeline {
  playing: boolean
  index: number
  items: TimelineItem[]
}
```

`AppState.timeline: Timeline`. Stan jest zapisywany jak reszta stanu w `store.ts`
i rozsyłany komunikatem `state`. `sanitizeTimeline` robi to samo co `sanitizeGraph`:
przycina `duration`, ustawia `inPoint ≥ 0` i `outPoint > inPoint + 0,1 s`
(inaczej `null`), czyści graf przez `sanitizeGraph`, poprawia `index` do zakresu
i odrzuca elementy bez `videoId`. Elementy, których klipu już nie ma w bibliotece,
zostają, ale odtwarzanie je pomija.

### Komunikaty

Z panelu (walidowane w `protocol.ts`):
`timeline:add {videoId}` (graf = kopia bieżącego), `timeline:remove {id}`,
`timeline:move {id, to}`, `timeline:update {id, duration?, waitBeat?, inPoint?, outPoint?}`,
`timeline:play {playing}`, `timeline:goto {index}`.

Z okna Visualizera nowy kanał IPC `front:timeline-next` (w preload, jak `sendAudio`).
Proces główny przechodzi wtedy do następnego elementu, który ma istniejący klip
(zawijając na początek): ustawia `activeId = item.videoId` i `graph = item.graph`,
po czym rozsyła stan.

Gdy timeline gra, zmiany grafu (`graph:set`, `effects:set`, `node:bypass`) zapisują
się też do bieżącego elementu. `timeline:add` w trakcie grania tylko dopisuje element.

### Zegar (`src/renderer/src/engine/timeline.ts`)

Czysta klasa `Sequencer`:
`step(dt, beat: boolean, item: {duration, waitBeat} | null): boolean`, czyli „tnij teraz”.

- Liczy czas od ostatniego cięcia. Zeruje się, gdy zmieni się bieżący element,
  także po `goto` z panelu.
- Bez `waitBeat` tnie po `duration`. Z `waitBeat` tnie na pierwszym beacie
  (`BeatDetector.triggered`) po `duration`, ale najpóźniej 4 s po nim, żeby cisza
  nie zatrzymała seta.
- Wysyła jedno żądanie cięcia i czeka, aż zmieni się bieżący element.

### Fragment klipu (pętla od–do)

Gdy timeline gra, renderer przekazuje do `VideoPool` zakres bieżącego elementu.
W każdej klatce sprawdza, czy `currentTime ≥ outPoint` (albo koniec pliku); jeśli
tak, przewija do `inPoint`. Robi to w pętli rAF, bo `timeupdate` przychodzi za
rzadko (~250 ms) jak na krótkie pętle. Po cięciu nowy klip startuje od swojego
`inPoint`, a `outPoint` dłuższy niż plik działa jak „do końca”. Bez timeline'u
wideo zachowuje się jak dziś. Czystą logikę („czy przewinąć i dokąd”) trzymamy
w funkcji z testami.

### Panel

Kolejka jest w panelu Biblioteka, nad listą klipów:

```
┌ KOLEJKA ─────────────── [▶ Graj] [⏭] ┐
│ ▸ 1  clouds.mp4    16 s  ♪  ↑ ↓ ✕     │  ← gra, pasek postępu
│      fragment [ 12,0 ]–[ 15,0 ] s  ━━█▬▬█━━━ │  ← od–do na długości klipu
│   2  dancer.mp4     8 s  ♪  ↑ ↓ ✕     │
│   3  birds.mp4     24 s     ↑ ↓ ✕     │
└───────────────────────────────────────┘
  clouds.mp4   [+ do kolejki]
```

- Przy każdym klipie biblioteki jest przycisk „+ do kolejki”.
- Fragment: dwa pola „od” i „do” (s, krok 0,1) oraz pasek długości klipu
  z dwoma uchwytami. Puste „do” oznacza do końca.
- Pole czasu, przełącznik ♪ (czekaj na beat), ↑ ↓ i ✕ przy każdym elemencie.
- Klik w element przechodzi do niego (`goto`).
- Pasek postępu liczy panel z czasu stanu. Nie musi być idealny.

## Ryzyka dla wykonawcy

- Podmiana grafu przy cięciu przebudowuje łańcuch efektów. Nowy shader kompiluje
  się przy pierwszym użyciu, co może dać zacięcie. Trzeba to sprawdzić na żywo,
  a jeśli zacięcie jest widoczne, rozgrzać łańcuch następnego elementu wcześniej.
- `VideoPool` już podmienia klip dopiero po załadowaniu (dwa sloty), więc czarnej
  klatki nie powinno być. Trzeba to potwierdzić na żywo.

## Testy

Testy jednostkowe: `Sequencer` (czas, beat, limit 4 s, reset po zmianie elementu),
pętla fragmentu (przewinięcie przy `outPoint`, `outPoint` dłuższy niż plik, start od `inPoint`),
`sanitizeTimeline`, walidacja komunikatów w `protocol.ts`, obsługa komunikatów
w `store.ts` (dodaj, usuń, przesuń, następny z pomijaniem brakujących klipów,
zapis zmian grafu do bieżącego elementu). Panel i renderer sprawdza się zrzutami
i na żywo.

## Decyzje podjęte przeze mnie (do sprawdzenia)

- Domyślny czas elementu 16 s, z włączonym czekaniem na beat.
- Limit 4 s po czasie elementu, gdy beatu brak.
- Nowy element dostaje kopię bieżącego grafu.
- Kolejka zawija się na początek.
- Kolejka nie zapisuje się w projektach.
