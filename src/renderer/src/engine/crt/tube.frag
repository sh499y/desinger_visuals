// CRT Tube: szkło i luminofory, w świetle liniowym.
// Nasycenie luminoforów → krzywa kineskopu (γ) → halacja: światło rozproszone
// w grubym szkle bańki, ciepłe (czerwień rozprasza się najdalej), z kilku
// poziomów mipmapy bufora o połowie rozdzielczości.

uniform sampler2D inputBuffer;
uniform sampler2D glowBuffer;
uniform float glowGain;
uniform float gamma;
uniform float saturation;

varying vec2 vUv;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec3 TINT = vec3(1.0, 0.82, 0.7);

void main() {
  vec3 c = max(texture2D(inputBuffer, vUv).rgb, 0.0);
  c = max(mix(vec3(dot(c, LUMA)), c, saturation), 0.0);
  c = pow(c, vec3(gamma));

  if (glowGain > 0.0) {
    vec3 g = textureLod(glowBuffer, vUv, 1.0).rgb * 0.15
      + textureLod(glowBuffer, vUv, 2.0).rgb * 0.25
      + textureLod(glowBuffer, vUv, 3.0).rgb * 0.25
      + textureLod(glowBuffer, vUv, 4.0).rgb * 0.2
      + textureLod(glowBuffer, vUv, 5.0).rgb * 0.15;
    c += glowGain * TINT * max(g, 0.0);
  }

  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
