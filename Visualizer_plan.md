
# 🎛️ Visualizer: stack i zarys aplikacji (Linux)

Nov 7, 2026 · @Shaggy

## 🎯 Cel

Desktopowa aplikacja na Linuxa: uproszczony TouchDesigner, w którym wideo z plików jest przetwarzane na żywo filtrami sterowanymi dźwiękiem z systemu. Stack to **Electron + React + TypeScript + Three.js**. Efekty są gotowe (biblioteka `postprocessing`), więc nie trzeba pisać shaderów. macOS dochodzi później i zmienia tylko moduł przechwytywania audio.

- Wejście: dowolny dźwięk grający w systemie (Spotify, przeglądarka, DJ software)
- Źródła obrazu: pliki wideo z dysku, docelowo też kamera
- Sterowanie: graf node'ów, w którym pasma audio podpina się kablem pod parametry efektów
- Wyjście: okno podglądu oraz fullscreen na drugim monitorze/projektorze

## 🖥️ Zakres v0: front + backend na osobnym porcie

Wizualizacja i panel sterowania działają osobno. **Front** to okno Electrona, które tylko renderuje. **Backend** to lokalny serwer HTTP + WebSocket na własnym porcie, który serwuje panel w przeglądarce. Panel można otworzyć w Chrome albo na telefonie i nie zabiera on zasobów oknu wizualizacji.

| Element | Adres / port | Co robi |
| --- | --- | --- |
| Front (wizualizacja) | okno Electrona, bez portu | Pełnoekranowy canvas Three.js: aktywne wideo + efekty sterowane audio, zero UI |
| Backend (serwer) | `http://127.0.0.1:4000` | Biblioteka wideo, stan aplikacji, API REST, WebSocket, strumieniowanie plików wideo |
| Panel sterowania | `http://127.0.0.1:4000/` (statyczny build) | Lista wideo, wybór aktywnego, mały podgląd, suwaki efektów, mierniki audio |
| Dev: panel | `:5174` (Vite, proxy do `:4000`) | Hot reload panelu podczas pracy |
| Dev: front | `:5173` (electron-vite) | Hot reload wizualizacji |

Backend działa w main process Electrona, więc startuje i kończy się razem z aplikacją. Stan trzyma serwer. Zmiany z panelu idą przez WebSocket do serwera, a serwer przekazuje je do okna frontu przez IPC.

```text
Panel (przeglądarka) ──WS / REST──▶ Backend :4000 (main process) ──IPC──▶ Front (okno Electrona)
        ▲                                    │
        └──── mierniki audio co ~100 ms ──────┘◀── IPC ── Front (analiza FFT)
```

API na start:

```ts
// REST
GET    /api/library            // lista wideo { id, name, duration, thumb }
POST   /api/library            // upload pliku (multipart) do folderu biblioteki
DELETE /api/library/:id
GET    /media/:id              // plik wideo z obsługą Range (seek); używa go też front

// WebSocket ws://127.0.0.1:4000/ws
→ { type: "playback:select", id }
→ { type: "effects:set", effect: "bloom", param: "intensity", value: 1.2 }
← { type: "state", library, activeId, effects }   // pełny stan po każdej zmianie
← { type: "audio", bass, mid, high, beat }       // ~10 razy na sekundę
```

- Serwer: **Fastify** + `@fastify/websocket` + `@fastify/static` (panel) + `@fastify/multipart` (upload)
- Biblioteka to folder, np. `~/Videos/visualizer/`. Serwer go skanuje, a upload z panelu zapisuje tam pliki
- Domyślnie serwer słucha tylko na `127.0.0.1`. Dostęp z telefonu w sieci lokalnej (`0.0.0.0`) włączasz w ustawieniach i zabezpieczasz tokenem w URL
- Port ustawiany w configu (domyślnie `4000`). Jeśli jest zajęty, serwer wybiera następny wolny i pokazuje adres w oknie frontu
- W v0 efekty to stała lista z suwakami. Edytor node'ów z dalszej części dokumentu trafi później do panelu

## 🧱 Stack

Wszystko w TypeScripcie, jeden język od procesu głównego po efekty.

| Warstwa | Technologia | Rola |
| --- | --- | --- |
| Runtime desktop | Electron + `electron-vite` | Okno, dostęp do plików, fullscreen na drugim ekranie |
| UI | React 19 + TypeScript + Tailwind | Panel boczny, inspektor parametrów |
| Edytor node'ów | `@xyflow/react` (React Flow) | Graf: źródła → filtry → wyjście, kable audio → parametry |
| Stan | Zustand | Graf i parametry; pętla renderowania czyta store bez re-renderów |
| Rendering | Three.js (WebGL2) | Kanał GPU, tekstury wideo |
| Efekty | `postprocessing` (pmndrs) | Gotowe filtry: Bloom, ChromaticAberration, Glitch, Pixelation, HueSaturation, BrightnessContrast, Noise, Vignette |
| Wideo | `<video>` + `THREE.VideoTexture` | Dekodowanie sprzętowe przez Chromium (VAAPI) |
| Audio | Web Audio API: `AnalyserNode` (+ `AudioWorklet` później) | FFT, pasma bass/mid/high, wykrywanie beatu |
| Szybkie suwaki (dev) | `leva` | Debugowanie parametrów zanim powstanie edytor node'ów |
| Zapis projektów | JSON przez IPC → `fs` w main process | Zapis/odczyt grafu |
| Pakowanie | `electron-builder` | `.AppImage` i `.deb` |
| Jakość kodu | ESLint + Prettier + Vitest | Testy logiki audio i grafu |

## 🏗️ Architektura

&#91;embedded content: architektura · tor wideo, tor audio, jedna pętla renderowania\]

Wideo i audio płyną dwoma niezależnymi torami do pętli rAF. React tylko zapisuje parametry w store, więc nigdy nie blokuje klatki. Main process (Node.js) obsługuje wyłącznie rzeczy systemowe: okna, wybór pliku i zapis projektu.

## 📁 Struktura projektu

Podział z szablonu `electron-vite`. Prawie cała praca dzieje się w `renderer/`, a `engine/` nie wie nic o Reakcie.

```text
visualizer/
├─ src/
│  ├─ main/                 # Node.js: okna, pliki, IPC
│  │  ├─ index.ts           # tworzy okno podglądu + okno wyjścia
│  │  └─ ipc.ts             # openVideo, saveProject, loadProject
│  ├─ preload/
│  │  └─ index.ts           # contextBridge → window.api
│  └─ renderer/
│     └─ src/
│        ├─ engine/         # czysty TS, bez Reacta
│        │  ├─ audio/       # capture.ts, analyser.ts, beat.ts
│        │  ├─ video/       # VideoSource.ts (pool elementów <video>)
│        │  ├─ nodes/       # definicje node'ów: params + apply()
│        │  ├─ graph.ts     # kompilacja grafu → lista efektów
│        │  └─ renderer.ts  # Three.js + EffectComposer + pętla rAF
│        ├─ store/          # Zustand: graf, parametry, wartości audio
│        ├─ ui/
│        │  ├─ NodeEditor/  # React Flow + własne node'y
│        │  ├─ Inspector/   # suwaki wybranego node'a
│        │  └─ Meters/      # podgląd pasm audio
│        └─ App.tsx
├─ electron-builder.yml
└─ package.json
```

## 🧩 Model node'ów

Każdy node to definicja w `engine/nodes/` z listą parametrów liczbowych. Każdy parametr jest albo suwakiem, albo kablem z sygnału audio.

| Kategoria | Node'y (MVP) | Parametry przykładowe |
| --- | --- | --- |
| Źródła | `VideoFile` | plik, loop, prędkość odtwarzania |
| Filtry | `Brightness/Contrast`, `HueSaturation`, `Bloom`, `RGBSplit`, `Pixelate`, `Glitch`, `Noise`, `Vignette` | intensywność, offset, granularity |
| Mix | `Blend` (2 wejścia) | opacity, tryb mieszania |
| Sterowanie | `AudioIn`, `LFO`, `Math` (scale/offset/clamp) | wyjścia: bass, mid, high, level, beat |
| Wyjście | `Output` | okno, fullscreen, rozdzielczość |

Kabel audio na parametrze liczy się w każdej klatce: `wartość = clamp(sygnał × scale + offset, min, max)`.

Format zapisu grafu:

```json
{
  "version": 1,
  "nodes": [
    { "id": "v1", "type": "VideoFile", "params": { "path": "/home/shaggy/clips/a.mp4", "loop": true } },
    { "id": "a1", "type": "AudioIn", "params": {} },
    { "id": "b1", "type": "Bloom", "params": { "intensity": 1 } },
    { "id": "out", "type": "Output", "params": {} }
  ],
  "edges": [
    { "from": "v1.video", "to": "b1.input" },
    { "from": "b1.video", "to": "out.input" },
    { "from": "a1.bass", "to": "b1.intensity", "scale": 3, "offset": 0.5 }
  ]
}
```

## 🔊 Audio z systemu na Linuxie

Na Linuxie dźwięk z systemu to zwykłe wejście audio. PipeWire/PulseAudio ma dla każdego wyjścia źródło *Monitor of …*, które aplikacja otwiera przez `getUserMedia`, tak jak mikrofon.

Utwórz wirtualne wejście, które będzie widoczne na liście urządzeń:

```bash
pactl load-module module-remap-source \
  master=$(pactl get-default-sink).monitor \
  source_name=loopback \
  source_properties=device.description=Loopback
```

W aplikacji wybierz urządzenie po etykiecie i wyłącz obróbkę głosu:

```ts
const devices = await navigator.mediaDevices.enumerateDevices();
const loop = devices.find(d => d.kind === "audioinput" && /loopback|monitor/i.test(d.label));
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { deviceId: loop?.deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
});
```

- Bez tego modułu można też w `pavucontrol`, w zakładce *Nagrywanie*, przełączyć Electrona na *Monitor of …*
- W UI dodaj wybór urządzenia wejściowego, żeby nie polegać na nazwie
- Na macOS ten moduł zastąpi `getDisplayMedia` + `audio: 'loopback'` w Electronie, a reszta pipeline'u się nie zmieni

## ⚡ Wydajność: żeby się nie wieszało

Zasada główna: React nigdy nie uczestniczy w klatce. Pętla `requestAnimationFrame` w `engine/renderer.ts` działa niezależnie od UI.

- Wartości audio trzymaj w zwykłym obiekcie albo w `useRef`, nigdy w `useState`. Czytaj je przez `store.getState()`, bez subskrypcji
- W pętli niczego nie twórz: tablice FFT, efekty i tekstury powstają raz, a w klatce tylko się aktualizują
- Graf kompiluj tylko przy zmianie struktury (nowy node, nowy kabel), a nie w każdej klatce
- Wideo: H.264 1080p, żeby dekodowanie szło sprzętowo. Sprawdź `chrome://gpu` w Electronie (Video Decode: Hardware accelerated)
- Ogranicz rozdzielczość renderowania suwakiem (np. 0.5–1.0 ×), żeby słabszy GPU też dawał radę
- Panel UI aktualizuj co 100 ms, nie co klatkę (np. mierniki pasm)
- Własne DSP (lepszy beat, BPM) wrzuć do `AudioWorklet`, który działa w osobnym wątku audio
- Uruchamiaj Electrona z `--enable-features=VaapiVideoDecoder` i sprawdź, czy GPU jest używane

## 🚀 Roadmapa MVP

Pięć etapów, każdy kończy się czymś, co działa i co widać. Edytor node'ów wchodzi dopiero, kiedy efekty już reagują na muzykę.

1. **Szkielet v0**: `electron-vite` + React + TS, okno frontu + serwer Fastify na `:4000` w main process, osobny Vite dla panelu
2. **Biblioteka wideo**: folder biblioteki, upload i lista w panelu, `/media/:id` z Range, wybór aktywnego wideo przez WebSocket, które odtwarza się na froncie w pętli
3. **Audio**: loopback + `AnalyserNode` na froncie, mierniki bass/mid/high/beat wysyłane do panelu
4. **Efekty**: 3–4 efekty z `postprocessing` sterowane basem, włączane i regulowane suwakami w panelu
5. **Edytor node'ów**: React Flow w panelu, kable audio → parametry, zapis projektu do JSON, paczka `.AppImage`

Po MVP: `Blend` z dwoma wideo, kamera jako źródło, MIDI (Web MIDI API) do sterowania suwakami, wersja na macOS.

## 📦 Pakowanie na Linuxa

`electron-builder` buduje `.AppImage` (jeden plik, działa na większości dystrybucji) i `.deb`. Paczka waży ok. 100–150 MB, bo zawiera całe Chromium.

```yaml
# electron-builder.yml
appId: dev.addiator.visualizer
productName: Visualizer
linux:
  target: [AppImage, deb]
  category: AudioVideo
```

```bash
npm create @quick-start/electron@latest visualizer   # React + TypeScript
npm i three postprocessing @xyflow/react zustand leva
npm run build:linux
```
