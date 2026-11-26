// Mirror: piksele po „złej” stronie osi biorą kolor ze swojego odbicia.
// Liczone w proporcjach ekranu (aspect), żeby kąt osi był prawdziwy.
// offset przesuwa oś wzdłuż normalnej (w wysokościach kadru). W pasie o szerokości
// softness za osią oryginał płynnie przechodzi w odbicie, więc szew nie jest ostry.

uniform vec2 normal;
uniform float offset;
uniform float softness;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 scale = vec2(aspect, 1.0);
  vec2 p = (uv - 0.5) * scale;
  float d = dot(p, normal) - offset;
  if (d >= 0.0) {
    outputColor = inputColor;
    return;
  }
  p -= 2.0 * d * normal;
  vec4 reflected = texture2D(inputBuffer, clamp(p / scale + 0.5, 0.0, 1.0));
  float t = softness > 0.0 ? smoothstep(0.0, softness, -d) : 1.0;
  outputColor = mix(inputColor, reflected, t);
}
