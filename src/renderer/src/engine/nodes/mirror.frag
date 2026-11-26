// Mirror: piksele po „złej” stronie osi biorą kolor ze swojego odbicia.
// Liczone w proporcjach ekranu (aspect), żeby kąt osi był prawdziwy.

uniform vec2 normal;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 scale = vec2(aspect, 1.0);
  vec2 p = (uv - 0.5) * scale;
  float d = dot(p, normal);
  if (d >= 0.0) {
    outputColor = inputColor;
    return;
  }
  p -= 2.0 * d * normal;
  outputColor = texture2D(inputBuffer, clamp(p / scale + 0.5, 0.0, 1.0));
}
