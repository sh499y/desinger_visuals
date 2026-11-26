// CRT Flicker: klatka zastąpiona czarną albo białą (flashTone) w proporcji flash.

uniform float flash;
uniform float flashTone;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(mix(inputColor.rgb, vec3(flashTone), flash), inputColor.a);
}
