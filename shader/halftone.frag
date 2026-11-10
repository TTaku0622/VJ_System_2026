// Scene24（網点）専用のシェーダー
//
// 印刷の網点のように、斜め 45° の格子に並んだ白い丸の大きさで濃淡を描く。丸はマスごとに大きさが
// 1つに決まり（マスの中心で場の値を読む）、大きいと隣とつながって白い面になる。
//
//   u_mode 0  波紋     中心から同心円の波が外へ広がる（1拍で1つ）
//   u_mode 1  雲       ノイズの雲がゆっくり流れる
precision highp float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;       // 秒
uniform float u_beats;      // 通算の拍数（波を流す）
uniform float u_beat;       // 拍の頭で 1、次の拍までに 0 へ
uniform float u_level;      // 音量 0〜1
uniform int u_mode;

const float CELL = 0.032;           // 丸の間隔（画面の高さ比）
const float MAX_RADIUS = 0.62;      // 丸の半径の最大（間隔比）。0.5 を超えると隣とつながる
const float MIN_RADIUS = 0.06;      // 丸の半径の最小（無音でも点が残る）
const float WAVE_LENGTH = 0.32;     // 波紋の間隔（画面の高さ比）
const float WAVE_FADE = 1.1;        // 外へ行くほど波が弱くなる距離（画面の高さ比）
const float CLOUD_SCALE = 2.2;      // 雲の細かさ（画面の高さあたり）
const float CLOUD_SPEED = 0.07;
const float BEAT_BOOST = 0.25;      // 拍の頭で丸が大きくなる量
const float LEVEL_BOOST = 0.3;      // 音量で丸が大きくなる量

float hash(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// 場の値 0〜1（p は画面の中心が原点、高さ比）
float field(vec2 p){
    if(u_mode == 1){
        // 段ごとに座標を回し、さらに少しゆがめる。そのままだとノイズの格子が見え、雲の縁が直線になった
        vec2 q = p * CLOUD_SCALE + vec2(u_time * CLOUD_SPEED, -u_time * CLOUD_SPEED * 0.7);
        q += 0.6 * vec2(noise(q * 0.7 + 5.2), noise(q * 0.7 + 1.3));
        mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
        float n = 0.55 * noise(q);
        q = turn * q * 2.03 + 3.7;
        n += 0.3 * noise(q);
        q = turn * q * 2.01 + 9.1;
        n += 0.15 * noise(q);
        return smoothstep(0.2, 0.8, n);
    }
    float r = length(p);
    float wave = 0.5 + 0.5 * cos((r / WAVE_LENGTH - fract(u_beats)) * 6.28318);
    return wave * exp(-r / WAVE_FADE);
}

void main(){
    vec2 px = vTexCoord * u_resolution - 0.5 * u_resolution;
    float cellPx = CELL * u_resolution.y;

    // 45° 回した格子のマス
    const float c = 0.70710678;
    vec2 q = vec2(c * px.x - c * px.y, c * px.x + c * px.y);
    vec2 cellIndex = floor(q / cellPx);
    vec2 local = (q - (cellIndex + 0.5) * cellPx);

    // マスの中心を元の向きに戻して、そこで場を読む
    vec2 centerQ = (cellIndex + 0.5) * cellPx;
    vec2 center = vec2(c * centerQ.x + c * centerQ.y, -c * centerQ.x + c * centerQ.y);
    float v = field(center / u_resolution.y);
    v = clamp(v * (1.0 + BEAT_BOOST * u_beat + LEVEL_BOOST * u_level), 0.0, 1.0);

    float radius = mix(MIN_RADIUS, MAX_RADIUS, v) * cellPx;
    float d = length(local);
    float white = smoothstep(radius + 0.8, radius - 0.8, d);

    // 半径が 0.5 を超えた丸は隣のマスまではみ出すので、隣の4マスの丸も見る（つながって面になる）
    {
        for(int k = 0; k < 4; k++){
            vec2 offset = k == 0 ? vec2(1.0, 0.0) : k == 1 ? vec2(-1.0, 0.0) : k == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
            vec2 nq = (cellIndex + offset + 0.5) * cellPx;
            vec2 nCenter = vec2(c * nq.x + c * nq.y, -c * nq.x + c * nq.y);
            float nv = clamp(field(nCenter / u_resolution.y) * (1.0 + BEAT_BOOST * u_beat + LEVEL_BOOST * u_level), 0.0, 1.0);
            float nRadius = mix(MIN_RADIUS, MAX_RADIUS, nv) * cellPx;
            float nd = length(q - nq);
            white = max(white, smoothstep(nRadius + 0.8, nRadius - 0.8, nd));
        }
    }

    gl_FragColor = vec4(vec3(white), 1.0);
}
