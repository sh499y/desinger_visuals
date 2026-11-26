// CRT Guns: tor sygnału trzech dział elektronowych.
// Dla każdego kanału: zbieżność (przesunięcie ∝ r²), pasmo wzmacniacza
// (rozmycie i dzwonienie w poziomie) i prąd wiązki I = (gain · sygnał)^2.4.

uniform vec3 gain;
uniform vec3 convergence;
uniform vec3 overdrive;

const float M_RB = 0.012;
const float M_G = 0.006;
const float RING = 0.6;

float softclip(float x) {
  return x < 1.0 ? x : 1.0 + (1.0 - exp(-(x - 1.0))) * 0.25;
}

float tap(vec2 p, vec3 mask) {
  return dot(texture2D(inputBuffer, p).rgb, mask);
}

float gun(vec2 p, vec3 mask, float drive, float od) {
  float dx = texelSize.x * (1.0 + 3.0 * od);
  float center = tap(p, mask);
  float blur = 0.1 * tap(p - vec2(2.0 * dx, 0.0), mask) + 0.2 * tap(p - vec2(dx, 0.0), mask) +
    0.4 * center + 0.2 * tap(p + vec2(dx, 0.0), mask) + 0.1 * tap(p + vec2(2.0 * dx, 0.0), mask);
  float s = mix(center, blur, od);
  // Dzwonienie: echo krawędzi za przejściem jasności.
  s += RING * od * (s - tap(p - vec2(3.0 * dx, 0.0), mask));
  float v = pow(max(s, 0.0), 1.0 / 2.2);
  return softclip(pow(drive * v, 2.4));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 q = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
  float r2 = dot(q, q);
  float r = gun(uv + vec2(M_RB * convergence.r * r2, 0.0), vec3(1.0, 0.0, 0.0), gain.r, overdrive.r);
  float g = gun(uv + vec2(0.0, M_G * convergence.g * r2), vec3(0.0, 1.0, 0.0), gain.g, overdrive.g);
  float b = gun(uv - vec2(M_RB * convergence.b * r2, 0.0), vec3(0.0, 0.0, 1.0), gain.b, overdrive.b);
  outputColor = vec4(r, g, b, inputColor.a);
}
