// Scene15（万華鏡）専用のシェーダー
//
// 画面の中心から放射状に SEGMENTS 枚の鏡で折り返し、その中に「折り返しを繰り返すフラクタル」
// （p = abs(p) / dot(p, p) − c を何回も回す。Kaliset と呼ばれる形）を描く。
// c をゆっくり動かすと模様が生き物のように組み変わる。
//
//   u_mode 0  色      虹色の帯が回る
//   u_mode 1  白黒    白い線だけ（他のレイヤーに加算で重ねやすい）
precision highp float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;       // 秒
uniform float u_flow;       // 模様の進み（JS で毎フレーム足す。速さを変えても飛ばない）
uniform float u_beat;       // 拍の頭で 1、次の拍までに 0 へ
uniform float u_bass;       // 低域の大きさ 0〜1
uniform int u_mode;

const float SEGMENTS = 8.0;         // 鏡の枚数
const int ITERATIONS = 6;           // 折り返しの回数（多いほど細かい。多すぎると泡のように濁る）
const float ZOOM = 1.0;             // 模様の大きさ（小さいほど寄る＝模様が大きい）
const float BEAT_ZOOM = 0.12;       // 拍の頭で寄る量
const float SPIN = 0.08;            // 鏡ごと回る速さ（rad/秒）
const float LINE_SHARP = 28.0;      // 線の細さ（大きいほど細い）
const float RING = 0.5;             // 線になる輪の半径
const float FILL = 0.18;            // 線のまわりの面の明るさ
const float FILL_WIDTH = 0.25;      // 面の広さ
const float HUE_STEP = 0.13;        // 折り返し1回ごとに色相をずらす量
const float WHITE_SHARP = 1.8;      // 白黒のときだけ線をさらに細くする倍率（太いとにじんで見える）

// iq の余弦パレット。t を 0〜1 で回すと虹色が一周する
vec3 palette(float t){
    return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67)));
}

void main(){
    vec2 uv = (vTexCoord * u_resolution - 0.5 * u_resolution) / u_resolution.y;

    // 鏡で折り返す: 角度を1枚ぶんに畳み、半分で反転
    float r = length(uv);
    float a = atan(uv.y, uv.x) + u_time * SPIN;
    float seg = 6.28318 / SEGMENTS;
    a = mod(a, seg);
    a = abs(a - 0.5 * seg);
    vec2 p = r * vec2(cos(a), sin(a));

    p *= ZOOM * (1.0 - BEAT_ZOOM * u_beat);
    p += vec2(0.35 + 0.15 * sin(u_flow * 0.31), 0.2 + 0.15 * cos(u_flow * 0.23));

    vec2 c = vec2(0.72 + 0.08 * sin(u_flow * 0.17), 0.64 + 0.08 * cos(u_flow * 0.13));

    // 折り返すたびに「輪からの距離」を測り、いちばん近づいた回（trap）で色を決める。
    // 回ごとに全部足すと細かい泡が重なって濁るので、いちばん近い1回だけを使ってくっきりさせる
    float trap = 1e3;
    float trapIndex = 0.0;
    float lines = 0.0;
    for(int i = 0; i < ITERATIONS; i++){
        p = abs(p) / dot(p, p) - c;
        float d = abs(length(p) - RING);
        if(d < trap){
            trap = d;
            trapIndex = float(i);
        }
        lines += exp(-d * LINE_SHARP * WHITE_SHARP);
    }
    lines = min(lines, 1.5);
    float edge = exp(-trap * LINE_SHARP);                       // 線
    float fill = FILL * smoothstep(FILL_WIDTH, 0.0, trap);      // 線のまわりのうっすらした面
    vec3 col = palette(trapIndex * HUE_STEP + u_flow * 0.04 + r * 0.25) * (edge * 1.3 + fill);
    col += vec3(1.0) * pow(edge, 6.0) * 0.6;                    // 線の芯は白く飛ばす

    // 中心ほど明るく、外へ向かって少し落とす（画面のふちが うるさくならないように）
    float vignette = smoothstep(1.3, 0.2, r);
    float boost = 1.0 + 0.6 * u_beat + 0.4 * u_bass;

    vec3 outCol = (u_mode == 1) ? vec3(lines) : col;
    gl_FragColor = vec4(clamp(outCol * vignette * boost, 0.0, 1.0), 1.0);
}
