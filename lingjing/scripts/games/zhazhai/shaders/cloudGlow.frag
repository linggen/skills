precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uDriftSpeed;
uniform float uGlowIntensity;
uniform float uWaveAmount;

varying vec2 outTexCoord;

void main() {
    vec2 uv = outTexCoord;
    
    float drift = sin(uTime * uDriftSpeed + uv.y * 3.14159) * 0.003 * uWaveAmount;
    uv.x = uv.x + drift;
    
    vec4 texColor = texture2D(uMainSampler, uv);
    
    if (texColor.a < 0.01) {
        gl_FragColor = texColor;
        return;
    }
    
    vec3 color = texColor.rgb;
    
    float glow = uGlowIntensity * 0.12;
    vec3 glowColor = color + vec3(glow * 0.8, glow * 0.85, glow * 1.0);
    
    vec3 finalColor = mix(color, glowColor, 0.5);
    
    float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
    vec3 quantized = floor(finalColor * 3.0 + 0.5) / 3.0;
    float cartoon = smoothstep(0.3, 0.5, lum);
    finalColor = mix(quantized * 0.92, finalColor, cartoon * 0.6);
    
    gl_FragColor = vec4(finalColor, texColor.a);
}
