// CRT Echo: odbicia sygnału w kablu. Za każdą krawędzią przychodzą jej opóźnione
// obrysy (echa górnoprzepustowe) z naprzemiennym znakiem i zanikiem, osobno dla
// R, G i B – przy różnych opóźnieniach kanałów obrysy rozjeżdżają się kolorami.

uniform float echoGain;
uniform vec3 echoDelay;
uniform float spreadShift;

const float EDGE_GAIN = 3.0;
const float GHOST = 0.25; // słaba kopia całego obrazu pod pierwszym obrysem

float tap(vec2 p, vec3 mask) {
  return dot(texture2D(inputBuffer, p).rgb, mask);
}

float channel(vec2 uv, vec3 mask, float delay) {
  float s = tap(uv, mask);
  if (echoGain <= 0.0) return s;
  float dx = 3.0 * texelSize.x;
  s += GHOST * echoGain * tap(uv - vec2(delay, 0.0), mask);
  float w = echoGain;
  for (int k = 1; k <= 3; k++) {
    vec2 p = uv - vec2(float(k) * delay, 0.0);
    s += w * EDGE_GAIN * (tap(p, mask) - tap(p - vec2(dx, 0.0), mask));
    w *= -0.6;
  }
  return s;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float r = channel(uv + vec2(spreadShift, 0.0), vec3(1.0, 0.0, 0.0), echoDelay.r);
  float g = channel(uv, vec3(0.0, 1.0, 0.0), echoDelay.g);
  float b = channel(uv - vec2(spreadShift, 0.0), vec3(0.0, 0.0, 1.0), echoDelay.b);
  outputColor = vec4(max(vec3(r, g, b), 0.0), inputColor.a);
}
