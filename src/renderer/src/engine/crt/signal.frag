// CRT Signal: tor sygnału kompozytowego.
// Przydźwięk 50 Hz (falowanie linii, przewijany ciemny pas), błąd podstawy czasu
// (każda linia szarpie się w poziomie) i chrominancja o wąskim paśmie
// (kolor rozlewa się w prawo za krawędzie, przesycenie, przesunięcie barwy).

uniform float humAmp;
uniform float humBar;
uniform float humPhase;
uniform float jitterAmp;
uniform float jitterTime;
uniform float chromaBleed;
uniform float chromaSat;
uniform float chromaHue;

const float LINES = 288.0;
const mat3 RGB2YIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
const mat3 YIQ2RGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);

float hash(float x) {
  return fract(sin(x * 12.9898) * 43758.5453);
}

float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f) * 2.0 - 1.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 p = uv;
  float line = floor(uv.y * LINES);
  p.x += humAmp * sin(6.2831853 * (uv.y * 3.0 + humPhase * 5.0));
  // Jitter: płynne falowanie co kilka linii + szorstkość pojedynczych linii.
  float t = jitterTime;
  p.x += jitterAmp * (0.7 * vnoise(line * 0.15 + t * 7.0) +
    0.3 * (hash(line + floor(t * 30.0) * 17.0) * 2.0 - 1.0));

  vec3 yiq = RGB2YIQ * texture2D(inputBuffer, p).rgb;
  if (chromaBleed > 0.0) {
    vec2 iq = vec2(0.0);
    float wsum = 0.0;
    for (int k = 0; k <= 8; k++) {
      float w = exp(-float(k * k) / 16.0);
      vec2 q = p - vec2(float(k) * chromaBleed / 8.0, 0.0);
      iq += w * (RGB2YIQ * texture2D(inputBuffer, q).rgb).yz;
      wsum += w;
    }
    yiq.yz = iq / wsum;
  }
  float c = cos(chromaHue);
  float s = sin(chromaHue);
  yiq.yz = mat2(c, s, -s, c) * yiq.yz * chromaSat;

  vec3 rgb = YIQ2RGB * yiq;
  float band = fract(uv.y - humPhase) - 0.5;
  rgb *= 1.0 - humBar * exp(-band * band / 0.018);
  outputColor = vec4(max(rgb, 0.0), inputColor.a);
}
