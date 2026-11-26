// Dreamer Blur: jeden przebieg rozdzielnego gaussiana (poziomo albo pionowo).
// Czyta poziom `lod` wejścia (piramida mipów), pisze do bufora tej samej wielkości.

uniform sampler2D inputBuffer;
uniform float lod;
/** Krok jednego teksela bufora docelowego, w uv, wzdłuż kierunku przebiegu. */
uniform vec2 texel;
/** σ w pikselach bufora docelowego. */
uniform float sigma;

varying vec2 vUv;

void main() {
  float s = max(sigma, 0.01);
  int r = int(min(ceil(s * 3.0), 32.0));
  vec3 acc = vec3(0.0);
  float sum = 0.0;
  for (int i = -32; i <= 32; i++) {
    if (i < -r || i > r) continue;
    float fi = float(i);
    float w = exp(-(fi * fi) / (2.0 * s * s));
    acc += w * textureLod(inputBuffer, vUv + texel * fi, lod).rgb;
    sum += w;
  }
  gl_FragColor = vec4(acc / sum, 1.0);
}
