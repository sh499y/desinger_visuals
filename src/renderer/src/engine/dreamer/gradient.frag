// Dreamer Gradient: jasność (w kodowaniu ekranowym) → przesunięcie, kontrast, schodki →
// kolor z dwóch map (A, B) zmieszanych przez `mixAB`, na obraz z kryciem `opacity`.
// Mapy to tekstury 256×1 w sRGB, dekodowane sprzętowo do liniowego.

uniform sampler2D lutA;
uniform sampler2D lutB;
uniform float mixAB;
uniform float shift;
uniform float contrast;
uniform float steps;
uniform float reverse;
uniform float opacity;

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

float toDisplay(float l) {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * pow(l, 1.0 / 2.4) - 0.055;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float l = toDisplay(clamp(dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0));
  if (reverse > 0.5) l = 1.0 - l;
  // Jak map_input w LightCrafcie: kontrast 4^c wokół środka, przesunięcie ±0.5,
  // Schodki n ≥ 2 to n płaskich poziomów od 0 do 1.
  l = clamp(0.5 + (l - 0.5) * pow(4.0, contrast) + shift * 0.5, 0.0, 1.0);
  if (steps >= 2.0) l = min(floor(l * steps), steps - 1.0) / (steps - 1.0);
  vec2 p = vec2((l * 255.0 + 0.5) / 256.0, 0.5);
  vec3 map = mix(texture2D(lutA, p).rgb, texture2D(lutB, p).rgb, mixAB);
  outputColor = vec4(mix(inputColor.rgb, map, opacity), inputColor.a);
}
