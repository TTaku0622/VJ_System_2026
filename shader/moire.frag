// Scene21（モアレ）専用のシェーダー
//
// VJ の定番のオプアート。白黒の縞を2組重ねて XOR（片方だけ白なら白）すると、縞どうしがずれた所に
// 大きなうねり（モアレ）が浮かぶ。縞の中心や向きを少し動かすだけで、うねりは大きく動く。
//
//   u_mode 0  同心円   中心のずれた2組の同心円。拍ごとに輪が1本ぶん外へ流れる
//   u_mode 1  直線     わずかに角度のちがう2組の平行線。ゆっくり回る
precision highp float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;       // 秒
uniform float u_beats;      // 通算の拍数（輪を流す）
uniform float u_beat;       // 拍の頭で 1、次の拍までに 0 へ
uniform int u_mode;

const float RINGS = 28.0;           // 画面の高さあたりの輪の数
const float ORBIT = 0.18;           // 2つの中心が回る半径（画面の高さ比）
const float ORBIT_SPEED = 0.23;     // 中心が回る速さ（rad/秒）
const float LINES = 46.0;           // 画面の高さあたりの直線の数
const float LINE_ANGLE = 0.05;      // 2組の直線の角度の差（rad）。小さいほどうねりが大きい
const float LINE_SPIN = 0.06;       // 直線が回る速さ（rad/秒）
const float LINE_BREATH = 0.7;      // 角度の差が伸び縮みする割合
const float LINE_BREATH_SPEED = 0.4;    // 伸び縮みの速さ（rad/秒）
const float BEAT_SQUEEZE = 0.05;    // 拍の頭で縞が細かくなる量

// 縞 0〜1 を、1ピクセルぶんだけなめらかにして出す（ギザギザを消す）。
// freq は「画面の高さ」あたりの本数、x は高さ比の座標（傾きが 1 の量）
float stripes(float x, float freq){
    float s = sin(x * freq * 6.28318);
    float aa = freq * 6.28318 / u_resolution.y * 1.2;
    return smoothstep(-aa, aa, s);
}

void main(){
    vec2 p = (vTexCoord * u_resolution - 0.5 * u_resolution) / u_resolution.y;
    float squeeze = 1.0 + BEAT_SQUEEZE * u_beat;

    float a;
    float b;
    if(u_mode == 1){
        float angle = u_time * LINE_SPIN;
        vec2 d1 = vec2(cos(angle), sin(angle));
        // 角度の差をゆっくり伸び縮みさせる。差が小さいほどうねりの帯が太く、間隔が広がる
        float spread = LINE_ANGLE * (1.0 + LINE_BREATH * sin(u_time * LINE_BREATH_SPEED));
        vec2 d2 = vec2(cos(angle + spread), sin(angle + spread));
        a = stripes(dot(p, d1), LINES * squeeze);
        b = stripes(dot(p, d2) + 0.013 * u_time, LINES * squeeze);
    } else {
        float t = u_time * ORBIT_SPEED;
        vec2 c1 = ORBIT * vec2(cos(t), sin(t * 1.3));
        vec2 c2 = -ORBIT * vec2(cos(t * 0.8 + 1.0), sin(t));
        float flow = fract(u_beats);
        a = stripes(length(p - c1) - flow / RINGS, RINGS * squeeze);
        b = stripes(length(p - c2) - flow / RINGS, RINGS * squeeze);
    }

    // XOR: 片方だけ白なら白
    float v = a + b - 2.0 * a * b;
    gl_FragColor = vec4(vec3(v), 1.0);
}
