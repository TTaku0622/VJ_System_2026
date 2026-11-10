// Scene12（入れ子の三角形）専用のシェーダー
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 1:30〜1:55 ごろ。三角形の輪郭の帯が
// 何重にも重なって中心から広がる。**帯はやわらかくぼけたパステル（ピンク・白・水色・薄紫）で、
// 背景は明るい青紫。**ボケた光の丸が浮かぶ。
//
// 2026-11-01 に作り直した。最初は黒地にくっきりした原色の帯を 2D の線で描いていて、元映像の
// 柔らかさが出なかった。
//
// 三角形の「大きさ」の物差し m を使う。重心を原点にした、頂点が上の三角形の輪郭の上で m が一定になる:
//   m = max(−3y, 1.5·(|x|/s + y))   （y は上向き、s は 高さ1あたりの半幅）
// m を帯の間隔で割った値の整数部が「何番目の帯か」、小数部が帯の中の位置。
precision highp float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_progress;   // 何本ぶん広がったか（拍で進む。内へ縮むときは減る）
uniform float u_time;       // 秒（光の丸を漂わせる）
uniform float u_beat;       // 拍の頭で 1、次の拍までに 0 へ

const float BASE_RATIO = 1.8;       // 底辺の長さ ÷ 高さ（ほかのミュージック系のシーンと同じ形）
const float CENTER_Y = 0.42;        // 重心の高さ（画面の下から。0〜1）
// 元映像の帯は太くてやわらかくぼけている（0.075・ぼかし 0.22 だと細い線の縞に見えた）
const float BAND_STEP = 0.12;       // 帯の間隔（画面の高さ比）
const float WIDTH_MIN = 0.2;        // 帯の太さ（間隔に対する比）の下限
const float WIDTH_MAX = 0.55;       // 上限
const float SOFT = 0.4;             // 帯の縁のぼかし（間隔に対する比）
const float BAND_STRENGTH = 0.9;    // 帯の濃さ

const vec3 BG_INNER = vec3(0.55, 0.62, 0.95);   // 背景（中心）明るい青紫
const vec3 BG_OUTER = vec3(0.28, 0.33, 0.70);   // 背景（外側）

const int BOKEH_COUNT = 22;
const float BOKEH_MIN = 0.012;      // 光の丸の半径（画面の高さ比）
const float BOKEH_MAX = 0.035;
const float BOKEH_ALPHA = 0.45;

const float BEAT_BOOST = 0.25;

float hash(float n){
    return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

vec3 palette(float id){
    float k = floor(hash(id) * 5.0);
    if(k < 1.0) return vec3(1.0, 1.0, 1.0);         // 白
    if(k < 2.0) return vec3(1.0, 0.72, 0.9);        // ピンク
    if(k < 3.0) return vec3(0.68, 0.88, 1.0);       // 水色
    if(k < 4.0) return vec3(0.82, 0.76, 1.0);       // 薄紫
    return vec3(1.0, 0.86, 0.95);                   // 薄いピンク
}

void main(){
    float aspect = u_resolution.x / u_resolution.y;
    // 画面の高さを 1 とした座標。y は上向き（vTexCoord は上から下へ増えるので反転）
    vec2 p = vec2((vTexCoord.x - 0.5) * aspect, (1.0 - vTexCoord.y) - CENTER_Y);
    float slope = BASE_RATIO * 0.5;

    float m = max(-3.0 * p.y, 1.5 * (abs(p.x) / slope + p.y));
    float phase = m / BAND_STEP - u_progress;
    float id = floor(phase);
    float f = phase - id;

    float width = mix(WIDTH_MIN, WIDTH_MAX, hash(id + 13.0));
    float band = smoothstep(0.0, SOFT, f) * smoothstep(width + SOFT, width, f);

    vec3 bg = mix(BG_INNER, BG_OUTER, smoothstep(0.0, 1.2, length(p)));
    vec3 col = mix(bg, palette(id), band * BAND_STRENGTH);

    // ボケた光の丸。ゆっくり昇る
    for(int i = 0; i < BOKEH_COUNT; i++){
        float fi = float(i);
        vec2 center = vec2((hash(fi) - 0.5) * aspect, fract(hash(fi + 3.0) + u_time * mix(0.01, 0.04, hash(fi + 5.0))) - CENTER_Y);
        float r = mix(BOKEH_MIN, BOKEH_MAX, hash(fi + 7.0));
        float d = length(p - center);
        col = mix(col, vec3(1.0), BOKEH_ALPHA * smoothstep(r, r * 0.6, d));
    }

    col *= 1.0 + BEAT_BOOST * u_beat;
    gl_FragColor = vec4(min(col, 1.0), 1.0);
}
