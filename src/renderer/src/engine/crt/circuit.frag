// CRT Circuit: kineskop. Dla piksela ekranu liczy, gdzie trafia wiązka
// (geometria, HV, synchronizacja), rysuje raster z profilu wiązki,
// nakłada maskę luminoforu i poświatę poprzedniej klatki.
// Wartości zależne od czasu liczy CircuitModel (model.ts).

uniform sampler2D inputBuffer;
uniform sampler2D lumaBuffer;
uniform sampler2D prevBuffer;
uniform vec2 resolution;
uniform float time;
uniform vec3 decay;

uniform vec2 scale;
uniform vec2 lin;
uniform float pincushion;
uniform float hvRatio;
uniform float brightness;
uniform float focus;
uniform float jitter;
uniform float hDetune;
uniform float hPhase;
uniform float vRolling;
uniform float vPhase;
uniform float arc;

varying vec2 vUv;

const float LINES = 288.0;
const float SIGMA0 = 0.28; // szerokość wiązki w liniach
const float BETA = 0.6; // wzrost plamki z prądem
const float SAG_R = 0.25; // oporność zasilacza HV
const float MASK = 0.35; // przepuszczalność cudzego paska luminoforu
const float V_BLANK = 0.06;
const float H_BLANK = 0.12;
const float NORM = 1.0 / (SIGMA0 * 2.5066283); // 1/(σ0·√(2π)): energia linii zachowana

float hash(float x) {
  return fract(sin(x * 12.9898) * 43758.5453);
}

// Współrzędna rastra wzdłuż osi z poprawką liniowości: brzegi ±0,5 stoją w miejscu.
float linearity(float r, float k) {
  return r * (1.0 + k * (1.0 - 4.0 * r * r));
}

vec3 beamLine(float line, float d, float x, float focusEff) {
  // Synchronizacja pozioma: w zakresie tylko drżenie, poza nim faza rośnie z każdą linią.
  x += jitter * (hash(line + floor(time * 60.0) * 0.618) - 0.5);
  if (hDetune != 0.0) {
    x = fract(x + fract(line * hDetune + hPhase)) * (1.0 + H_BLANK) - H_BLANK;
  }
  if (x < 0.0 || x > 1.0 || line < 0.0 || line >= LINES) return vec3(0.0);
  vec3 I = max(texture2D(inputBuffer, vec2(x, (line + 0.5) / LINES)).rgb, 0.0);
  vec3 sigma = SIGMA0 * (1.0 + BETA * I) / focusEff;
  return I * exp(-d * d / (2.0 * sigma * sigma)) * (SIGMA0 / sigma);
}

void main() {
  // Spadek HV pod obciążeniem: średnia jasność klatki z najmniejszej mipmapy.
  float L = dot(textureLod(lumaBuffer, vec2(0.5), 6.0).rgb, vec3(0.2126, 0.7152, 0.0722));
  float hvEff = max(hvRatio - SAG_R * L, 0.05);
  float sag = sqrt(hvRatio / hvEff);

  vec2 r = (vUv - 0.5) / (scale * sag * (1.0 + 0.02 * arc));
  r *= 1.0 + pincushion * dot(r, r);
  r = vec2(linearity(r.x, lin.x), linearity(r.y, lin.y));
  vec2 uv = r + 0.5;

  vec3 color = vec3(0.0);
  // Wiązka pokrywa tylko uv.y ∈ [0,1]; toczenie przesuwa treść wewnątrz tego zakresu
  // (przy zapadniętym pionie zostaje jedna kreska, a nie powielone linie).
  bool onScreen = uv.y >= 0.0 && uv.y <= 1.0 && uv.x >= -H_BLANK && uv.x <= 1.0 + H_BLANK;
  if (onScreen && vRolling > 0.5) {
    uv.y = fract(uv.y + vPhase) * (1.0 + V_BLANK) - V_BLANK;
    onScreen = uv.y >= 0.0;
  }
  if (onScreen) {
    float ly = uv.y * LINES - 0.5;
    float n0 = floor(ly);
    float f = ly - n0;
    float focusEff = focus * hvEff / hvRatio;
    color = beamLine(n0, f, uv.x, focusEff) + beamLine(n0 + 1.0, 1.0 - f, uv.x, focusEff);
    color *= NORM;
  }

  // Maska szczelinowa: paski R, G, B co jeden piksel ekranu.
  float column = mod(floor(vUv.x * resolution.x), 3.0);
  vec3 mask = vec3(MASK);
  mask[int(column)] = 1.0;
  color *= mask * (3.0 / (1.0 + 2.0 * MASK));

  color *= brightness * hvEff / hvRatio;
  color += arc * vec3(0.85, 0.9, 1.0);

  vec3 prev = texture2D(prevBuffer, vUv).rgb;
  gl_FragColor = vec4(max(color, prev * decay), 1.0);
}
