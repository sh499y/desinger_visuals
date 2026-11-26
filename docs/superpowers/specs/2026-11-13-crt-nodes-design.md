# Node'y CRT: Guns i Circuit

2026-11-13 · status: projekt do akceptacji

## Cel

Efekt kineskopu CRT liczony z modelu fizycznego, a nie nakładany z tekstur. Sterowanie to 6 „napięć” w dwóch node'ach. Glitche (rwanie synchronizacji, toczenie obrazu, zapadnięcie pionu, oddychanie, iskrzenie) wynikają z tych napięć. Każde pokrętło można podpiąć kablem do Audio, LFO lub Math, tak jak dowolny parametr liczbowy.

Node'y w edytorze grafu wyglądają jak analogowe efekty gitarowe (pokrętła, jacki, footswitch). Są dwa style do porównania: **A „Hammertone”** i **B „Black panel”** (makiety: `.superpowers/brainstorm/50848-1794521697/content/crt-nodes-v3.html`, lokalnie, poza gitem, inspiracje: `docs/inspo/crt/`).

Poza zakresem: katalog i kategorie efektów, pozostałe nowe efekty, zapis wyboru stylu w projekcie.

## Konwencja pokręteł

Wszystkie 6 parametrów: `min 0`, `max 1`, `step 0.005`, `default 0.5`. **0,5 = sprawny telewizor**: obraz bez zniekształceń, z widocznym rastrem i maską, ale bez glitchy. Odchylenie od 0,5 psuje obraz.

## Node'y (`src/shared/nodes.ts`)

| Typ | Etykieta | Parametry (`key`: etykieta) |
|---|---|---|
| `CRTGuns` | CRT Guns | `red`: Działo R, `green`: Działo G, `blue`: Działo B |
| `CRTCircuit` | CRT Circuit | `hv`: Anoda HV, `hdef`: Odchylanie H, `vdef`: Odchylanie V |

Oba to filtry (`category: 'filter'`, wejście i wyjście obrazu). Panel (suwaki w EffectsView, porty w edytorze) bierze parametry z definicji automatycznie.

## Model: CRT Guns (tor sygnału)

Dla kanału `c ∈ {R,G,B}` z napięciem `V_c`:

- **Prąd wiązki.** Sygnał wejściowy (liniowy) wracamy do postaci napięciowej `s = c^(1/2.2)`, potem `I_c = softclip((2·V_c·s)^2.4)`. Przy `V_c = 0,5` daje to obraz bliski wejściu. Niżej kanał gaśnie (dominanta barwna), wyżej się przepala. `softclip` łagodnie nasyca luminofor powyżej 1.
- **Zbieżność (misconvergence).** `r²` to kwadrat odległości od środka (z korektą proporcji). Przesunięcie kanału: `Δ_c = m·(V_c − 0,5)·r²·oś_c`, gdzie `oś_R = +x`, `oś_B = −x`, `oś_G = +y` (mniejsze `m`). W środku ekranu zbieżność jest zawsze dobra.
- **Pasmo wzmacniacza.** Przesterowanie `o_c = max(0, 2V_c − 1)`. Rozmycie poziome o szerokości `∝ o_c` (5 próbek) i dzwonienie: `c + ρ·o_c·(c(x) − c(x − δ))`, czyli jasne echo za krawędzią.

Bez Circuit node Guns działa samodzielnie jako efekt koloru i zbieżności.

### Tor sygnału (dodane 2026-11-13, po pierwszych testach)

Drugi rząd pokręteł w CRT Guns, zakres 0–1, **domyślnie 0 = czysty sygnał**. Wartości liczy `GunsSignal` w `model.ts`.

- **Echo** (`echo`): odbicia sygnału w kablu. Dwie kopie obrazu przesunięte w prawo, siła `0,6·echo` i połowa tego dla drugiej, z normalizacją jasności.
- **Delay** (`delay`): opóźnienie odbicia, od 0,5% do 8% szerokości ekranu.
- **Spread** (`spread`): różne drogi R, G i B. Opóźnienie R ×(1+0,6·s), B ×(1−0,6·s), do tego rozsunięcie zbieżności 0,4%·s.
- **Hum** (`hum`): przydźwięk 50 Hz. Linie falują w poziomie (do 1% szerokości), a ciemny pas (do 35%) przewija się w pionie z prędkością 0,3 ekranu/s.

## Model: CRT Circuit (kineskop)

Współrzędne ekranu `q = uv − 0,5`. Dla każdego piksela wyjścia liczymy, gdzie trafia wiązka, i jaki punkt sygnału wtedy rysuje.

- **HV (anoda).** Napięcie znamionowe przy 0,5. Spadek pod obciążeniem: `HV_eff = HV(k) − R·L̄`, gdzie `L̄` to średnia jasność bieżącej klatki (z mipmapy, liczona na GPU, bez odczytu na CPU).
  - wielkość obrazu `∝ 1/√HV_eff`: jasna scena daje spadek napięcia, a więc większy obraz („oddychanie”),
  - jasność `∝ HV_eff`, ostrość plamki `∝ HV_eff` (mniej napięcia, grubsza wiązka),
  - `k < 0,15`: obraz gaśnie i się rozmywa,
  - `k > 0,85`: iskrzenie, czyli losowy błysk (biały, z krótkim szarpnięciem geometrii) z prawdopodobieństwem na sekundę `∝ (k − 0,85)`, wygaszany w ~100 ms.
- **H (odchylanie poziome).** Szerokość `0,5 + k`. Nieliniowość poziomu (S-korekcja) i lekka poduszka `∝ |k − 0,5|`.
  - Zakres synchronizacji `|k − 0,5| ≤ 0,25`: tylko drżenie linii proporcjonalne do odchylenia.
  - Poza zakresem: rozstrojenie `Δf_h ∝ (|k − 0,5| − 0,25)`. Każda linia `n` przesuwa się o `frac(n·Δf_h + φ_h(t))`, obraz łamie się w ukośne pasy, a w miejscu zawinięcia widać czarny pas wygaszania.
- **V (odchylanie pionowe).** Wysokość `0,5 + k`, nieliniowość góra/dół.
  - Zakres synchronizacji jak w H. Poza nim obraz toczy się: `y' = frac(y + φ_v(t))`, `dφ_v/dt ∝ rozstrojenie`, z czarnym pasem wygaszania (~6% wysokości).
  - `k < 0,1`: zapadnięcie pionu. Wysokość spada liniowo do ~0,003, czyli obraz zamienia się w poziomą kreskę.
- **Raster z wiązki.** `N = 288` linii. Piksel bierze wkład dwóch najbliższych linii: każda ma próbkę sygnału z własnego środka i profil Gaussa `σ = σ₀·(1 + β·I)/ostrość(HV_eff)`. Energia linii jest zachowana: szczyt `∝ I/σ`. Jasne partie dają grube, zlewające się linie, ciemne cienkie z przerwą.
- **Maska (aperture grille).** Paski luminoforu R, G, B co 1 piksel wyjścia (pitch 3 px). Kanał spoza swojego paska jest tłumiony, a całość ma kompensację jasności.
- **Poświata luminoforu (P22).** Wyjście to `max(nowa_klatka, poprzednia·k_c)`, gdzie `k_c = exp(−dt/τ_c)` i `τ_G = 60 ms`, `τ_R = 40 ms`, `τ_B = 20 ms`. Smugi przy toczeniu i rwaniu mają przez to kolorowe ogony.

Bez Guns node Circuit przyjmuje sprawne działa (`V = 0,5`).

## Architektura

### Model na CPU, rysowanie na GPU

`src/renderer/src/engine/crt/model.ts` to czysty TS, bez WebGL:

- `gunUniforms(v)`: wzmocnienie, przesunięcie zbieżności, przesterowanie.
- `class CircuitModel` ze stanem (`φ_h`, `φ_v`, obwiednia iskry) i metodą `step(knobs, dt, random)`. Zapisuje wynik do gotowego obiektu z wartościami dla shadera (skale X/Y, nieliniowości, napięcie, ostrość, jasność, fazy, rozstrojenie H, flaga synchronizacji, wysokość pionu, iskra). Nie alokuje w klatce, a `random` jest wstrzykiwany, więc testy są deterministyczne.

Shadery (`crt/guns.frag`, `crt/circuit.frag`, importowane jako `?raw`) robią tylko to, czego nie da się policzyć na piksel na CPU: próbkowanie, profil wiązki, maskę, poświatę i spadek HV od średniej jasności.

### Zmiana w silniku

`EffectHandle` dostaje alternatywę dla `effect`:

```ts
export interface EffectHandle {
  effect?: Effect   // zwykły efekt postprocessing (jak dotąd)
  pass?: Pass       // własne przejście (CRT Circuit)
  apply(get: ParamGetter, dt: number): void
}
```

`Engine.rebuild()` dodaje `handle.pass ?? new EffectPass(camera, handle.effect)`. Do `apply` dochodzi `dt`, bo model Circuit jest zależny od czasu. Istniejące efekty ignorują ten argument.

- **CRTGuns**: `Effect` z własnym GLSL i `EffectAttribute.CONVOLUTION` (próbkuje sąsiednie piksele).
- **CRTCircuit**: `CrtCircuitPass extends Pass`, a w nim:
  1. zmniejszenie wejścia do 64×64 z mipmapą (średnia jasność `L̄` z najwyższego poziomu),
  2. shader kineskopu, który rysuje do bufora poświaty A i czyta poprzednią klatkę z bufora B,
  3. kopia na wyjście lub na ekran (`renderToScreen`), zamiana A z B,
  4. `setSize` i `dispose` zwalniają bufory.

Bypass i kolejność w grafie działają bez zmian, bo graf nadal kompiluje się tylko przy zmianie łańcucha.

### Panel: node'y w edytorze grafu

- `FlowNode.tsx`: dla `CRTGuns` i `CRTCircuit` renderuje `CrtNode` zamiast listy wierszy.
- `components/crt/Knob.tsx`: pokrętło 270°. Przeciąganie w pionie ustawia wartość (z Shift dokładniej), dwuklik przywraca wartość domyślną, a klasa `nodrag` blokuje przesuwanie node'a. Zmiana idzie przez `setParamValue`.
- Jack nad każdym pokrętłem to `Handle` React Flow z `id = key` parametru (`Position.Top`). Jeśli kabel jest wpięty, jack ma obwódkę, pokrętło jest prowadzone i nie przyjmuje przeciągania. Gdy źródłem jest Audio, pokrętło na żywo pokazuje wartość z mierników audio (`applyEdge`). Dla LFO i Math pokazuje wartość ustawioną.
- Footswitch przełącza `setBypass`, a dioda pokazuje, czy node jest włączony.
- Wideo wchodzi i wychodzi bokami, jak w innych node'ach.
- Style A i B: przełącznik „Styl CRT” w pasku narzędzi edytora, zapisywany w `localStorage` (z try/catch). Style żyją w `components/crt/crt.css`. Miernik kV pojawia się w Circuit tylko w stylu B i pokazuje wartość `hv` (ustawioną lub z Audio).

## Testy

- `engine/crt/model.test.ts`:
  - wszystkie pokrętła na 0,5 dają tożsamość: skala 1, brak rozstrojenia, faza się nie zmienia, brak iskier przy dowolnym `random`,
  - `vdef` 0 daje wysokość ≤ 0,005, a `vdef` 0,9 zmienia `φ_v` w czasie,
  - `hdef` w zakresie synchronizacji: brak rozstrojenia, poza nim rozstrojenie rośnie,
  - wyższe `hv` daje mniejszy obraz, `hv` 0,95 z `random → 0` daje iskrę, która gaśnie po ~100 ms,
  - `gunUniforms(0,5)`: wzmocnienie 1, przesunięcie 0, przesterowanie 0.
- `effects.test.ts`: oba typy zwracają uchwyt, a `apply` z domyślnymi parametrami nie rzuca błędu. Test dla `FILTER_TYPES` obejmuje `pass` albo `effect`.
- `nodes.test.ts`: oba typy przechodzą istniejące testy definicji i `sanitizeGraph`.
- Shadery, `CrtCircuitPass` i komponenty Reacta sprawdzamy ręcznie, zrzutami ekranu z działającej aplikacji, zgodnie z zasadą z `CLAUDE.md`.

## Wydajność

- Raster i maska to jeden pełnoekranowy shader z ~12 próbkami na piksel. Downsample 64×64 jest pomijalny.
- Dwa dodatkowe bufory w rozdzielczości renderu (HalfFloat) na każdą instancję Circuit.
- Brak alokacji w `apply` i w `CircuitModel.step`.

## Ryzyka

- Stałe (`m`, `ρ`, `σ₀`, `β`, `R`, zakresy) dostroimy na żywo. Testy sprawdzają zachowanie, nie konkretne liczby.
- Maska z pitchem 3 px na ekranach HiDPI przy niskiej „Rozdzielczości renderu” może dawać mory. Wtedy pitch będzie zależny od rozdzielczości.
