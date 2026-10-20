precision mediump float;

uniform vec4 uParams;
uniform vec3 uColor;

#define uTime uParams.x
#define uRadius uParams.y
#define uIntensity uParams.z
#define uQuadSize uParams.w

vec3 fireGradient(float t) {
    vec3 core = vec3(0.976, 0.714, 0.306);
    vec3 inner = vec3(0.910, 0.333, 0.200);
    vec3 outer = vec3(0.800, 0.267, 0.200);
    return t > 0.5 ? mix(inner, core, (t - 0.5) * 2.0) : mix(outer, inner, t * 2.0);
}

void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 uv = gl_FragCoord.xy / uQuadSize;
    float dist = length(uv - center);
    float normalizedDist = dist / uRadius;

    float flash = 1.0 / (1.0 + uTime * 15.0);
    float flashMask = smoothstep(0.5, 0.0, normalizedDist);
    flash *= flashMask;

    float coreGlow = 1.0 / (1.0 + normalizedDist * normalizedDist * 4.0);

    float ringRadius = uTime * 1.5;
    float ring = smoothstep(0.15, 0.0, abs(normalizedDist - ringRadius));
    ring *= smoothstep(0.0, 0.1, uTime);
    ring *= smoothstep(0.6, 0.3, uTime);

    float heatWave = (normalizedDist * 3.7 - uTime * 4.0) * 0.08;
    float heatMask = smoothstep(0.4, 0.0, normalizedDist) * uIntensity;
    
    float explosion = (coreGlow * 0.8 + ring * 0.4 + heatWave * heatMask) * uIntensity;
    explosion += flash * 0.5;

    float colorT = 1.0 - normalizedDist;
    vec3 fireColor = fireGradient(colorT);
    fireColor = mix(fireColor, uColor, 0.25);

    float mask = step(normalizedDist, 1.0);
    explosion *= mask;

    gl_FragColor = vec4(fireColor * explosion, explosion);
}
