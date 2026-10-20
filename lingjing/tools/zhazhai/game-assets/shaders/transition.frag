---
name: TransitionShader
type: fragment
uniform.uProgress: { "type": "1f", "value": 0.0 }
uniform.uDirection: { "type": "1f", "value": 1.0 }
uniform.uResolution: { "type": "2f", "value": { "x": 1920, "y": 1080 } }
uniform.uTime: { "type": "1f", "value": 0.0 }
uniform.uColor1: { "type": "3f", "value": { "x": 0.12, "y": 0.53, "z": 0.29 } }
uniform.uColor2: { "type": "3f", "value": { "x": 0.06, "y": 0.38, "z": 0.65 } }
uniform.iChannel0: { "type": "sampler2D", "value": null }
uniform.uFrameUV0: { "type": "2f", "value": { "x": 0.0, "y": 0.0 } }
uniform.uFrameUV1: { "type": "2f", "value": { "x": 1.0, "y": 1.0 } }
---

precision mediump float;

uniform float uProgress;
uniform float uDirection;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform sampler2D iChannel0;
uniform vec2 uFrameUV0;
uniform vec2 uFrameUV1;

const float divisions = 10.0;

void main() {
    // Flip Y for TL origin, normalize by biggest dim for square diamonds
    vec2 corrected_coord = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
    float biggest_dim = max(uResolution.x, uResolution.y);
    vec2 st = corrected_coord / biggest_dim;

    // Reverse time for reveal (plays the cover animation backwards → BR clears first)
    float p = uDirection > 0.5 ? uProgress : 1.0 - uProgress;
    float t = p * 3.0 - 1.0;

    // Diamond grid
    vec2 f_st = fract(st * divisions);
    vec2 i_st = floor(st * divisions);
    f_st -= 0.5;

    // Diagonal progression TL→BR (from Shadertoy reference)
    t = (1.0 - t + (i_st.x / divisions) - (1.0 - i_st.y / divisions));

    // Diamond shape mask — grows from TL→BR as progress increases
    float mask = step(t, 1.0 - abs(f_st.x + f_st.y)) * step(t, 1.0 - abs(f_st.x - f_st.y));

    // Alpha = mask: where diamonds have appeared, show the pattern
    float alpha = mask;

    // Vertical gradient with theme colors
    float gradientT = corrected_coord.y / uResolution.y;
    vec3 gradient = mix(uColor1, uColor2, gradientT);

    // Sample pattern texture with UV inset to avoid atlas padding bleeding
    // Atlas is 4096x4096 with 2px gaps between frames, inset by 1.5px to stay within frame content
    vec2 uvInset = vec2(1.5 / 4096.0);
    vec2 safeUV0 = uFrameUV0 + uvInset;
    vec2 safeUV1 = uFrameUV1 - uvInset;
    vec2 patternUV = mix(safeUV0, safeUV1, fract(st * 8.0));
    vec3 pattern = texture2D(iChannel0, patternUV).rgb;

    // Blend gradient with pattern
    vec3 fill = mix(gradient, gradient * pattern, 0.25);

    gl_FragColor = vec4(fill * alpha, alpha);
}
