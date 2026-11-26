// Dreamer Ziarno: pole szumu liczone na GPU w pikselach klatki (y w dół), dodane do jasności
// w kodowaniu ekranowym i ważone tonem, jak w LightCrafcie. Pola mają rozrzut ~1
// (stałe normalizacji policzone z góry), Silver / Halftone / Dither to progi: piksel jaśniejszy
// od progu się zapala, ciemniejszy gaśnie. `seed` zmienia wzór (Ruch wzoru).

uniform int kind;
uniform float amount;
uniform float cell;
uniform float soft;
uniform float edge;
uniform float shadows;
uniform float highlights;
uniform uint seed;

const float GRAIN_MAX = 0.2;
/** Rozrzut szumu kratowego wygładzonego B-splajnem (średnia Σw² w 2D). */
const float LATTICE_SPREAD = 0.4794;
const float CELLS_MEAN = 0.4294;
const float CELLS_SPREAD = 0.1896;
const float SPECKS_SPREAD = 0.2802;

uint hash3(uint a, uint b, uint c) {
  uint v = (a * 0x8da6b343u) ^ (b * 0xd8163841u) ^ (c * 0xcb1ab31fu);
  v ^= v >> 16;
  v *= 0x7feb352du;
  v ^= v >> 15;
  v *= 0x846ca68bu;
  return v ^ (v >> 16);
}

float frac01(uint v) {
  return float(v >> 8) / 16777216.0;
}

/** Wartość punktu kraty: równomierna o średniej 0 i rozrzucie 1. */
float lat(ivec2 p, uint s) {
  return (frac01(hash3(uint(p.x), uint(p.y), s)) - 0.5) * 3.4641016;
}

vec4 bspline(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(
    (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0,
    (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0,
    (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0,
    t3 / 6.0
  );
}

/** Jedna oktawa: komórki `c` px (`stretch` razy dłuższe wzdłuż pierwszej osi), obrót `rot`. */
float lattice(vec2 px, float c, float stretch, float rot, uint s) {
  if (c < 1.0) return lat(ivec2(floor(px)), s) * max(c, 0.0);
  vec2 q = px / c;
  float sn = sin(rot);
  float cs = cos(rot);
  float u = (q.x * cs - q.y * sn) / max(stretch, 1.0);
  float t = q.x * sn + q.y * cs;
  vec2 i = floor(vec2(u, t));
  vec4 wu = bspline(u - i.x);
  vec4 wt = bspline(t - i.y);
  ivec2 b = ivec2(i) - 1;
  float acc = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      acc += wu[x] * wt[y] * lat(b + ivec2(x, y), s);
    }
  }
  return acc / LATTICE_SPREAD;
}

float cellsField(vec2 px, float g, uint s) {
  g = max(g, 2.0);
  vec2 p = px / g;
  ivec2 ip = ivec2(floor(p));
  float best = 1e9;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 c = ip + ivec2(dx, dy);
      vec2 o = vec2(frac01(hash3(uint(c.x), uint(c.y), s)), frac01(hash3(uint(c.x), uint(c.y), s ^ 0x5bd1u)));
      vec2 d = vec2(c) + o - p;
      best = min(best, dot(d, d));
    }
  }
  return (sqrt(best) - CELLS_MEAN) / CELLS_SPREAD;
}

float specks(vec2 px, float grid, uint s) {
  float g = max(grid, 1.5);
  ivec2 ip = ivec2(floor(px / g));
  float acc = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 ci = ip + ivec2(dx, dy);
      uint cx = uint(ci.x);
      uint cy = uint(ci.y);
      if (frac01(hash3(cx, cy, s)) >= 0.75) continue;
      uint k = hash3(cx, cy, s + 1u);
      uint kr = (k << 13) | (k >> 19);
      vec2 sp = (vec2(ci) + vec2(frac01(k), frac01(kr))) * g;
      uint m = hash3(cx, cy, s + 2u);
      float r = max(g * (0.35 + 0.35 * frac01(m)), 0.7);
      float dist = length(px - sp);
      if (dist < r) {
        float fall = 1.0 - (dist / r) * (dist / r);
        float sgn = (m & 1u) == 0u ? 1.0 : -1.0;
        uint m7 = (m << 7) | (m >> 25);
        acc += sgn * (0.5 + 0.5 * frac01(m7)) * fall * fall;
      }
    }
  }
  return acc / SPECKS_SPREAD;
}

/** Dystrybuanta rozkładu normalnego (Abramowitz & Stegun 7.1.26). */
float phi(float x) {
  float z = abs(x) / 1.41421356;
  float t = 1.0 / (1.0 + 0.3275911 * z);
  float poly = t * (0.2548296 + t * (-0.2844967 + t * (1.4214137 + t * (-1.453152 + t * 1.0614054))));
  float e = 1.0 - poly * exp(-z * z);
  return x >= 0.0 ? 0.5 * (1.0 + e) : 0.5 * (1.0 - e);
}

float bayer8(ivec2 p) {
  int v = 0;
  for (int bit = 0; bit < 3; bit++) {
    int xb = (p.x >> bit) & 1;
    int yb = (p.y >> bit) & 1;
    v |= (((xb ^ yb) << 1) | yb) << (2 * (2 - bit));
  }
  return (float(v) + 0.5) / 64.0;
}

/** Pole dodawane (rozrzut ~1) dla rodzajów 0–7. */
float addField(vec2 px, uint s) {
  float c = cell;
  if (kind == 0) {
    // Crystal: ostre kryształki dwóch wielkości (przybliżenie pola kryształów LightCrafta)
    float f = 0.8 * lattice(px, c * 0.7, 1.0, 0.5, s + 1u) + 0.45 * lattice(px, c * 1.8, 1.0, 1.7, s + 2u);
    return sign(f) * pow(abs(f) / 0.918, 0.8) * 1.1;
  }
  if (kind == 1) {
    float f = 0.55 * lattice(px, c, 1.0, 0.3, s + 21u) + 0.35 * lattice(px, c * 2.5, 1.0, 1.1, s + 22u)
      + 0.25 * lattice(px, c * 6.0, 1.0, 2.0, s + 23u);
    return f / 0.7;
  }
  if (kind == 2) return lattice(px, c * 0.6, 1.0, 0.0, s + 11u);
  if (kind == 3) {
    // Fine: szum bez własnego rozmycia, czyli tylko najdrobniejszy detal
    float base = lattice(px, c * 0.5, 1.0, 0.0, s + 31u);
    float r = max(c, 1.0) * 0.8;
    float low = 0.25 * (lattice(px + vec2(r, 0.0), c * 0.5, 1.0, 0.0, s + 31u)
      + lattice(px - vec2(r, 0.0), c * 0.5, 1.0, 0.0, s + 31u)
      + lattice(px + vec2(0.0, r), c * 0.5, 1.0, 0.0, s + 31u)
      + lattice(px - vec2(0.0, r), c * 0.5, 1.0, 0.0, s + 31u));
    return (base - low) / 1.118 * 1.5;
  }
  if (kind == 4) return specks(px, c * 2.0, s + 41u);
  if (kind == 5) {
    float acc = 0.0;
    float w = 1.0;
    float norm = 0.0;
    for (int i = 0; i < 6; i++) {
      acc += w * lattice(px, c * 40.0 / float(1 << i), 1.0, 0.7 * float(i), s + 51u + uint(i));
      norm += w * w;
      w *= 0.6;
    }
    return acc / sqrt(norm);
  }
  if (kind == 6) return cellsField(px, c * 5.0, s + 61u);
  float cc = max(c, 1.0);
  float f = 0.8 * lattice(px, cc, 40.0, 0.0, s + 71u) + 0.5 * lattice(px, cc * 3.0, 12.0, 0.0, s + 72u)
    + 0.25 * lattice(px, c * 0.6, 1.0, 0.0, s + 73u);
  return f / 0.976;
}

/** Próg 0..1 dla ekranów (rodzaje 8–10). */
float screenField(vec2 px, uint s) {
  if (kind == 8) {
    float f = (0.6 * lattice(px, cell * 0.9, 1.0, 0.4, s + 81u) + 0.4 * lattice(px, cell * 2.2, 1.0, 1.3, s + 82u)) / 0.7211;
    return phi(f);
  }
  if (kind == 9) {
    float p = max(cell * 6.0, 3.0);
    vec2 q = px;
    float u = (q.x * 0.70710678 - q.y * 0.70710678) / p;
    float v = (q.x * 0.70710678 + q.y * 0.70710678) / p;
    return 0.5 - 0.25 * (cos(6.2831853 * u) + cos(6.2831853 * v));
  }
  float block = max(floor(cell + 0.5), 1.0);
  return bayer8(ivec2(floor(px / block)));
}

float encode(float l) {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * pow(l, 1.0 / 2.4) - 0.055;
}

float decode(float e) {
  return e <= 0.04045 ? e / 12.92 : pow((e + 0.055) / 1.055, 2.4);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 lin = max(inputColor.rgb, 0.0);
  vec3 e = vec3(encode(lin.r), encode(lin.g), encode(lin.b));
  float l = clamp(dot(e, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  float tone = l < 0.5 ? shadows + (1.0 - shadows) * l * 2.0 : 1.0 + (highlights - 1.0) * (l - 0.5) * 2.0;
  vec2 px = vec2(uv.x, 1.0 - uv.y) * resolution;
  float delta;
  if (kind >= 8) {
    float t = clamp(screenField(px, seed), 0.0, 1.0);
    t = edge + t * (1.0 - 2.0 * edge);
    float on = smoothstep(t - edge, t + edge, l);
    delta = min(amount * tone, 1.0) * (on - l);
  } else {
    float n = addField(px, seed);
    if (soft >= 0.3) {
      // Miękkość: średnia pola w czterech punktach wokół, z powrotem do tego samego rozrzutu
      float d = soft * 1.2;
      float m = 0.4 * n + 0.15 * (addField(px + vec2(d, d), seed) + addField(px + vec2(-d, d), seed)
        + addField(px + vec2(d, -d), seed) + addField(px + vec2(-d, -d), seed));
      n = m * mix(1.0, 2.0, clamp(soft / max(cell, 1.0), 0.0, 1.0));
    }
    delta = amount * GRAIN_MAX * tone * n;
  }
  e = clamp(e + delta, 0.0, 1.0);
  outputColor = vec4(decode(e.r), decode(e.g), decode(e.b), inputColor.a);
}
