precision mediump float;

attribute vec3 aPosition;
attribute vec3 aNormal;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  // We use the raw aPosition as the "world" position for simplicity.
  vWorldPosition = aPosition;
  
  // Pass the normal through, already normalized in JavaScript for flat shading.
  vNormal = normalize(aNormal);
  
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
