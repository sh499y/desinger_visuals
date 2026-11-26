# Dreamer w visualizerze: projekt

Data: 2026-11-26. Źródło: sekcja Dreamer z LightCrafta (`~/lightcraft`, gałąź `dreamer`,
`crates/pipeline/src/dreamer.rs`, `crates/develop/src/settings.rs`).

## Po co

Dźwięk ma na żywo zmieniać ziarno, rozmycie i kolor obrazu w stylu running.files (mocny blur, ziarno, gradient map).
Zmiany mają przechodzić **łagodnie**, bez skakania co klatkę. To ten sam ruch co wcześniej z CRT
(visualizer → LightCraft), tylko w drugą stronę.

## Cele

- Trzy nowe filtry: **Dreamer Blur**, **Dreamer Ziarno** i **Dreamer Gradient**. Każdy da się wpiąć osobno, w dowolnej
  kolejności i z innymi filtrami pomiędzy.
- Każdy parametr liczbowy da się sterować kablem z Audio, LFO, Math albo MPC.
- Nowy node sterujący **Wygładzanie** (Atak / Zwolnienie), który daje płynne przejścia dla dowolnego parametru dowolnego filtra.
- Wygląd zbliżony do LightCrafta: te same rodzaje blura i ziarna oraz te same presety gradientów.

## Poza zakresem

- Identyczność piksel w piksel z LightCraftem. Liczy GPU, na wideo, w czasie rzeczywistym.
- Uchwyty blura na obrazie (Edit on Photo), maski i realistyczny kurz.
- Zapisywanie własnych presetów gradientu jako kafelków (w LightCrafcie `prefs.json`). Gradient zapisuje się w projekcie razem z node'em.

## Czego nie wolno (anty-cele)

- Klatka nie może zwalniać: 60 fps przy 1080p na Macu z jednym kompletem Dreamera. Blur ma koszt ograniczony liczbą próbek, jak w LightCrafcie (`TAPS = 24`, piramida mipów).
- Ziarno nie może „pływać”, czyli zmieniać wzoru co klatkę, chyba że tak ustawisz. Kryterium: ziarno filmowe, nie cyfrowy szum.
- Płynność nie może zabić rytmu. Przy krótkim ataku stopa ma być słychać na obrazie od razu.

## Ograniczenia

- Zasady z `CLAUDE.md`: definicje w `src/shared/nodes.ts`, efekty w `engine/`, w pętli rAF żadnych alokacji, walidacja
  w `protocol.ts` / `sanitizeGraph` / `sanitizeParam`.
- Repo `desinger_visuals` ma cudze, niezacommitowane zmiany (`src/main/index.ts`, `engine/audio/capture*.ts`). Tych plików nie ruszamy i nie wrzucamy ich do commitów.
  Praca idzie na nowej gałęzi `dreamer`.
- Bez pushowania.

## Podejścia (wygładzanie)

1. **Node „Wygładzanie” w grafie** (*wybrane*): Audio → Wygładzanie → (Math) → parametr. Działa dla każdego filtra
   i każdego źródła, a każdy kabel może mieć inną bezwładność (ziarno szybko, kolor wolno).
2. Suwak „Bezwładność” wbudowany w każdy node Dreamera: mniej kabli, ale tylko dla Dreamera i jeden na cały node.
3. Atak i zwolnienie w node Audio: najprościej, ale wszystko z jednego Audio jest wygładzone tak samo.

Wybór użytkownika: 1.

Nody Dreamera: trzy osobne filtry, jak rozbity CRT. Jeden duży node odpadł, bo nie dałoby się zmieniać kolejności ani wpinać filtrów pomiędzy.

## Projekt

### Wygładzanie (`Smooth`, kategoria control)

- Wejście sygnału `in`, wyjście `out`.
- Parametry: `attack` (Atak, ms, 0–2000, domyślnie 30) i `release` (Zwolnienie, ms, 0–5000, domyślnie 400).
- W `SignalBus.evaluate`: `out += (in - out) * (1 - exp(-dt / tau))`, gdzie `tau` to atak, gdy wartość rośnie, i zwolnienie, gdy maleje. Przy 0 ms przepuszcza sygnał bez zmian. Stan trzyma
  per node w `Map`, tak jak fazy LFO. Kolejność w `controlOrder` już obsługuje łańcuchy node'ów sterujących.

### Dreamer Blur (`DreamerBlur`, filtr)

- `kind` (select): Gaussian, Motion, Spin, Zoom, Band, Ellipse.
- `amount` 0–100, `angle` 0–360°, `centerX` i `centerY` 0–1, `focus` (rozmiar ostrego obszaru) 0–1, `feather` 0–1.
  Panel pokazuje wszystkie parametry, bo generyczny node nie ukrywa nieużywanych. Etykiety mówią, którego rodzaju dotyczą.
- Własne przejście (`pass`) na GPU. Gaussian to rozdzielny blur dwuprzebiegowy na zmniejszonym buforze. Motion, Spin i Zoom zbierają do 24 próbek wzdłuż ścieżki
  z mipa dopasowanego do odstępu próbek. Band i Ellipse mieszają ostry obraz z rozmytym według odległości od strefy ostrości.
  Stałe (`GAUSS_MAX`, `MOTION_MAX`, `SPIN_MAX`, `ZOOM_MAX`) i geometria ostrości (`focus_geom`) są przeniesione z `dreamer.rs`.
  Rozmiary podawane są jako ułamek dłuższego boku.

### Dreamer Ziarno (`DreamerGrain`, filtr)

- `kind` (select): 11 rodzajów z `DreamerNoise::ALL` (Crystal, Clumps, Raw, Fine, Sand, Clouds, Cells, Streaks, Silver,
  Halftone, Dither…), bez Dust.
- `amount` 0–100, `size` 0–100, `softness` 0–100, `shadows` 0–200, `highlights` 0–200, a do tego nowy parametr `motion`
  0–1: jak często losuje się nowy wzór (0 = stały wzór, 1 = nowy co klatkę). Bez tego ziarno na wideo albo stoi, albo migocze. Ruch wzoru da się też sterować dźwiękiem.
- Shader: proceduralny szum (hash i wartość), działa na jasności w kodowaniu ekranowym i jest ważony tonem jak w LightCrafcie.
  Silver, Halftone i Dither to progowanie piksela.

### Dreamer Gradient (`DreamerGradient`, filtr z własnym node'em w panelu)

- Nowy rodzaj parametru `gradient`: lista stopów `{ pos: 0..1, color: '#rrggbb', hard: boolean }`, od 2 do 16 stopów.
  Zapisany jako tekst (`0:0e1428;0.35:3d4d75;1:ecd6a8`, `:h` = twardy stop). `ParamValue` już przyjmuje string, więc protokół się nie zmienia; walidacja w `sanitizeParam` (liczby skończone, hex, do 400 znaków).
- Dwa gradienty, `a` i `b`, oraz `mix` 0–1, który płynnie przechodzi z A do B. To jest „kolor sterowany dźwiękiem”: kabel
  z Wygładzania do `mix`.
- Pozostałe parametry: `shift` (Map Shift, -1–1), `contrast` (-1–1), `steps` (0–16, posteryzacja), `reverse` (bool), `opacity` 0–100.
- Silnik: z A i B robi tekstury 256×1 (tylko przy zmianie gradientu). Shader bierze jasność, przesuwa ją, zmienia kontrast i posteryzuje,
  a potem robi `mix(lut(A), lut(B), mix)` i miesza wynik z obrazem według krycia.
- Panel: własny komponent jak `CrtNode`. Dwa paski stopów (A i B): klik dodaje stop, przeciągnięcie to jeden krok cofania,
  dwuklik otwiera wybór koloru, przełącznik Step, usuwanie. Pod spodem kafelki 10 presetów z `builtin_gradients()`, które wpisują preset do A albo B.

### Wygląd nodów w panelu (decyzja użytkownika)

- Nody Dreamera i Wygładzania wyglądają jak nody CRT: ta sama budowa z pokrętłami (`Knob`), jackami sygnału nad pokrętłami,
  lampką i przełącznikiem nożnym (bypass). Komponent `DreamerNode` korzysta z części `crt/`, a nie je kopiuje.
- Skórka **metalicznie różowa**: anodyzowane, różowe aluminium z połyskiem (szczotkowanie i odblask jak w stali `hammertone`,
  tylko w różu), różowo-chromowe kołnierze pokręteł.
- Każdy node ma **własny gradient z presetów LightCrafta**, wtopiony w metal jako pas lub połysk płyty:
  Blur → Violet, Ziarno → Sunset, Gradient → Heat, Wygładzanie → Cyanotype (moja propozycja przydziału).
- Paski stopów gradientu (A i B) w node'zie Gradient leżą na płycie pod pokrętłami.

### Testy

- Wygładzanie: odpowiedź skokowa (atak i zwolnienie, przy 0 ms przepuszcza bez zmian).
- Gradient: `sanitizeParam` (złe hexy, za dużo stopów, NaN), próbkowanie rampy (twarde stopy, reverse, steps).
- Model blura i ziarna: czyste funkcje TS (geometria ostrości, wagi tonów) testowane jak `crt/model.test.ts`.
- Ręcznie: `npm run dev`, łańcuch Wideo → Blur → Ziarno → Gradient → Wyjście, Audio → Wygładzanie → parametry, sprawdzenie płynności i fps.

## Decyzje podjęte przeze mnie (do sprawdzenia)

- Repo `desinger_visuals`, gałąź `dreamer`, a nie klon crt-bender. Node MPC z crt-bendera i tak wpina się w te same parametry.
- Parametr `motion` w Ziarnie, nieobecny w LightCrafcie.
- Gradient A↔B zamiast jednego, presety jako przyciski bez zapisywania własnych kafelków.
- Domyślne wartości Wygładzania: 30 ms ataku i 400 ms zwolnienia.

## Do decyzji wykonawcy

Liczba przebiegów i rozdzielczość buforów blura, dokładne wzory szumów (z zachowaniem charakteru z `dreamer.rs`) oraz układ komponentu gradientu.
