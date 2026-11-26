// Dreamer Blur: złożenie. W pikselach pełnej klatki, y w dół (jak w LightCrafcie).
// 0 Gaussian: gotowe rozmycie g0. 1–3 Motion/Spin/Zoom: do TAPS próbek wzdłuż ścieżki
// piksela z mipa, którego piksele są tak daleko od siebie jak próbki. 4–5 Band/Ellipse:
// ostry obraz i rozmycia σ/8, σ/4, σ/2, σ (g0..g3) mieszane wg odległości od strefy ostrości.

uniform sampler2D inputBuffer;
uniform sampler2D mipBuffer;
uniform sampler2D g0;
uniform sampler2D g1;
uniform sampler2D g2;
uniform sampler2D g3;
uniform vec2 resolution;
uniform float maxLod;
uniform int kind;
uniform float len;
uniform vec2 dir;
uniform float theta;
uniform float reach;
uniform vec2 center;
uniform float angle;
uniform float bandHalf;
uniform float bandOuter;
uniform vec2 radii;
uniform float outer;

varying vec2 vUv;

const int TAPS = 24;

vec2 toUv(vec2 p) {
  return vec2(p.x / resolution.x, 1.0 - p.y / resolution.y);
}

vec2 pathAt(vec2 p, float t) {
  if (kind == 1) return p + (t - 0.5) * len * dir;
  if (kind == 2) {
    float a = (t - 0.5) * theta;
    float s = sin(a);
    float c = cos(a);
    vec2 r = p - center;
    return center + vec2(r.x * c - r.y * s, r.x * s + r.y * c);
  }
  return center + (p - center) * (1.0 - reach * t);
}

float pathLen(vec2 p) {
  if (kind == 1) return len;
  float d = length(p - center);
  return kind == 2 ? d * theta : d * reach;
}

vec3 level(int i, vec2 uv) {
  if (i == 0) return texture2D(inputBuffer, uv).rgb;
  if (i == 1) return texture2D(g0, uv).rgb;
  if (i == 2) return texture2D(g1, uv).rgb;
  if (i == 3) return texture2D(g2, uv).rgb;
  return texture2D(g3, uv).rgb;
}

void main() {
  vec2 p = vec2(vUv.x * resolution.x, (1.0 - vUv.y) * resolution.y);
  if (kind == 0) {
    gl_FragColor = vec4(texture2D(g0, vUv).rgb, 1.0);
    return;
  }
  if (kind <= 3) {
    float l = pathLen(p);
    if (!(l >= 0.5)) {
      gl_FragColor = vec4(texture2D(inputBuffer, vUv).rgb, 1.0);
      return;
    }
    int n = int(clamp(ceil(l) + 1.0, 2.0, float(TAPS)));
    float fn = float(n - 1);
    float lod = min(log2(max(l / fn, 1.0)), maxLod);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
      if (i >= n) break;
      acc += textureLod(mipBuffer, toUv(pathAt(p, float(i) / fn)), lod).rgb;
    }
    gl_FragColor = vec4(acc / float(n), 1.0);
    return;
  }
  vec2 d = p - center;
  float s = sin(angle);
  float c = cos(angle);
  float along = d.x * c - d.y * s;
  float across = d.x * s + d.y * c;
  float m = kind == 4
    ? smoothstep(bandHalf, bandOuter, abs(across))
    : smoothstep(1.0, outer, length(vec2(along / radii.x, across / radii.y)));
  // poziom 0 ostry, poziom i (1..4) to σ / 2^(4 − i)
  float li = m <= 0.125 ? m * 8.0 : 1.0 + log2(m * 8.0);
  int i0 = int(min(floor(li), 3.0));
  float f = clamp(li - float(i0), 0.0, 1.0);
  gl_FragColor = vec4(mix(level(i0, vUv), level(i0 + 1, vUv), f), 1.0);
}
