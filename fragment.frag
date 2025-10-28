#ifdef GL_ES
precision mediump float;
#endif

#define PI 3.141592653589793238

// Uniform variables passed from the JavaScript code and vertex shader
uniform float time;                // current time in seconds, used for animation
uniform vec3 uCamPos;              // camera position in world space
uniform vec3 u_color[9];           // array of colors used for palette blending
uniform float u_fresnel_speed;     // speed factor for fresnel-based UV panning
uniform float u_fresnel_tile;      // tiling factor for fresnel-based UV coordinates
uniform vec3 uLightDir;            // direction of a secondary light source
uniform vec3 uSunLightDir;         // direction of the primary "sun" light
uniform vec3 uSunLightColor;       // color of the sunlight
uniform float uMetalness;          // metalness factor for PBR shading
uniform float uRoughness;          // roughness factor for PBR shading (affects highlights)
uniform vec3 uSkyColor;            // color of the sky hemisphere
uniform vec3 uGroundColor;         // color of the ground hemisphere
uniform float uAmbientStrength;    // ambient lighting strength
uniform sampler2D uEnvMap;         // environment map (panoramic texture for reflections)

// Varyings passed from the vertex shader
varying vec3 vNormal;              // interpolated normal in world space
varying vec3 vWorldPosition;       // interpolated fragment position in world space

// A hash function for generating pseudo-random values from a 2D coordinate
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123);
}

// A pseudo-noise function built from hash. It creates smooth noise by blending corners.
float pseudoNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0,0.0));
    float c = hash(i + vec2(0.0,1.0));
    float d = hash(i + vec2(1.0,1.0));

    // Smooth interpolation factor u
    vec2 u = f*f*(3.0-2.0*f);

    // Bilinear interpolation of corner values
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

// Fresnel approximation using Schlick's formula to simulate reflection intensity at grazing angles
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0)*pow(1.0 - cosTheta, 5.0);
}

// Convert a reflection direction (in world space) into UV coordinates for sampling an equirectangular environment map.
// dir: normalized reflection direction
// returns: UV coordinates in [0,1] to sample from a panoramic (lat-long) environment map.
vec2 directionToUV(vec3 dir) {
    float theta = acos(clamp(dir.y, -1.0, 1.0));
    float phi = atan(dir.x, dir.z) + PI;
    float u = phi / (2.0 * PI);
    float v = theta / PI;
    return vec2(u, v);
}

void main() {
    // N: normalized surface normal at this fragment
    vec3 N = normalize(vNormal);
    // V: normalized vector from fragment to camera
    vec3 V = normalize(uCamPos - vWorldPosition);
    // L: normalized direction of a secondary light source
    vec3 L = normalize(uLightDir);
    // S: normalized direction of the main sunlight
    vec3 S = normalize(uSunLightDir);

    // Compute a fresnel-based UV coordinate influenced by noise and time
    // fresnel_uv is derived from the view angle (N·V)
    float fresnel_uv = pow(dot(N, V), 1.0);
    fresnel_uv = clamp(1.0 - fresnel_uv, 0.0, 1.0);

    // Offset for noise sampling based on position
    vec2 offset = vWorldPosition.xz * 0.1;
    float noiseVal = pseudoNoise(offset + time * 0.1);

    // Create a panning UV based on fresnel_uv, noise, tile, and speed
    vec2 panning_vUv = fract((vec2(fresnel_uv + noiseVal*0.5)) * u_fresnel_tile - time * u_fresnel_speed);

    // Palette blending:
    // Use panning_vUv.x to pick colors from u_color array using smooth steps.
    float zero = 0.0;
    float color_num = 5.0;             // total number of main colors
    float color_gap = 1.0 / color_num;
    vec3 baseColor = u_color[0];       // start with the first color as base
    for (int i = 0; i < 9; i++) {
        // Blend through the array of colors using smooth transitions as panning_vUv.x changes
        baseColor = mix(
            baseColor,
            u_color[i+1],
            smoothstep(zero + color_gap * float(i), zero + color_gap * float(i+1), panning_vUv.x)
        );
    }
    // Wrap around to first color at the end of the palette range
    baseColor = mix(baseColor, u_color[0], smoothstep(zero + color_gap * 4.0, zero + color_gap * 5.0, panning_vUv.x));

    // Apply a Fresnel-based rim lighting mask to baseColor
    float fresnel_mask = pow(dot(N, V)*1.35, 1.0);
    fresnel_mask = clamp(1.0 - fresnel_mask, 0.0, 1.0);
    // Soften fresnel by mixing with a noise factor
    fresnel_mask = mix(fresnel_mask, fresnel_mask*0.5, noiseVal);
    baseColor *= fresnel_mask;

    // Calculate simple diffuse lighting from the secondary light direction L
    float ndotl = max(dot(N, L), 0.0);
    vec3 diffuse = baseColor * ndotl * 0.5;

    // Compute PBR-like specular highlights from the main sunlight using GGX microfacet model
    float NdotS = max(dot(N, S), 0.0);
    float alpha = uRoughness*uRoughness;
    float alpha2 = alpha * alpha;
    vec3 H = normalize(V + S);
    float NdotH = max(dot(N,H),0.0);
    float denom = (NdotH*NdotH*(alpha2 - 1.0) + 1.0);
    float D = alpha2 / (PI * denom * denom);

    float NdotV = max(dot(N,V),0.0);
    float NdotL = NdotS;
    float k = (uRoughness+1.0)*(uRoughness+1.0)/8.0;
    float G_V = NdotV/(NdotV*(1.0-k)+k);
    float G_L = NdotL/(NdotL*(1.0-k)+k);
    float G = G_V * G_L;

    // Base reflectance: 
    // For metals, F0 ~ baseColor; for non-metals F0 ~0.04 (default specular)
    vec3 F0 = mix(vec3(0.04), baseColor, uMetalness);
    vec3 F = fresnelSchlick(NdotH, F0);

    // Specular term from microfacet BRDF
    vec3 numerator = D * F * G;
    float denominator = 4.0 * NdotV * NdotL + 0.001;
    vec3 specularSun = numerator / denominator;

    // Combine diffuse and specular from the sun
    // Non-metals use baseColor for diffuse; metals have mostly specular
    vec3 sunDiffuse = (1.0 - uMetalness) * baseColor * NdotS * uSunLightColor;
    vec3 sun = sunDiffuse + specularSun * 30.0 * uSunLightColor;

    // Add a height-based tint near the top parts of pillars
    // tipFactor varies with vWorldPosition.y, creating a vertical gradient effect
    float tipFactor = clamp((-vWorldPosition.y) / 50.0, 0.0, 1.0);
    vec3 highlightColor = mix(vec3(1.0, 0.9, 0.95), vec3(0.8, 0.9, 1.0), noiseVal);
    baseColor = mix(baseColor, highlightColor, pow(tipFactor, 1.5));

    // Hemisphere lighting for ambient: blend between sky and ground colors based on normal's Y
    float NdotUp = (N.y * 0.5) + 0.5; 
    vec3 hemiLight = mix(uGroundColor, uSkyColor, NdotUp);
    vec3 ambient = hemiLight * uAmbientStrength;

    // Compute reflection direction and sample environment map for reflections
    vec3 R = reflect(-V, N);
    R = normalize(R);
    vec2 envUV = directionToUV(R);
    vec3 envColor = texture2D(uEnvMap, envUV).rgb;

    // Adjust environment reflection intensity based on metalness and roughness
    float reflectivity = mix(0.1, 1.0, uMetalness);
    float reflectionStrength = mix(0.5, 1.0, 1.0 - uRoughness); 
    envColor *= reflectivity * reflectionStrength;

    // Combine all lighting components:
    // ambient + base diffuse + sunlight + baseColor itself (for extra color) + env reflections
    vec3 finalColor = ambient + diffuse + sun + baseColor*1.0 + envColor*1.1;
    finalColor = clamp(finalColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, 1.0);
}
