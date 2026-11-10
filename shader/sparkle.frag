// Scene10（光の粒）専用のシェーダー
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 0:05〜0:30・2:00 ごろ、三角形の画面を
// **ぎっしり埋めていた白い光の粒の面**。粒は細かく、濃いところと薄いところが雲のようにゆっくり動く。
// 縦に垂れる筋や、粒が抜けて暗い山形（∨ の入れ子）が浮かぶ場面もある。
//
// 2026-11-01 に作り直した。最初はまばらな点を並べただけで、元映像の「光の面」に見えなかった。
//
//   u_mode 0  きらめき   細かい粒が雲のような濃淡で埋め尽くし、1つずつ明滅する
//   u_mode 1  しずく     粒が縦に連なり、ゆっくり垂れ落ちる（元映像 0:05 の縦の筋）
//   u_mode 2  山形       粒の面に暗い山形の入れ子が浮かび、拍に合わせて上へ流れる（元映像 0:20）
precision highp float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;       // 秒
uniform float u_beats;      // 通算の拍数（山形を流す）
uniform int u_mode;
uniform float u_beat;       // 拍の頭で 1、次の拍までに 0 へ（JS 側で計算）

// ---- 粒 ----
const float FINE_PX = 3.0;          // 細かい粒の大きさ（ピクセル）
const float COARSE_PX = 7.0;        // 大きめの粒
const float DENSITY_MIN = 0.3;      // 雲の薄いところの粒の割合
const float DENSITY_MAX = 0.95;     // 濃いところ
const float CLOUD_SCALE = 0.35;     // 雲の大きさ（画面の高さ比）
const float CLOUD_SPEED = 0.04;     // 雲の流れる速さ
const float HAZE = 0.32;            // 粒のあいだのもや（白い面に見せる）

// ---- しずく ----
const float DRIP_W_PX = 3.0;        // 縦に連なる粒の幅
const float DRIP_H_PX = 12.0;       // 1粒の縦の長さ
const float DRIP_SPEED_MIN = 10.0;  // 垂れる速さ（ピクセル/秒）
const float DRIP_SPEED_MAX = 45.0;

// ---- 山形 ----
const float CHEVRON_BANDS = 5.0;    // 画面の高さあたりの山形の数
const float CHEVRON_SLOPE = 1.1;    // 山形の傾き
const float CHEVRON_DARK = 0.85;    // 山形の暗さ
const float CHEVRON_WIDTH = 0.35;   // 暗い帯の太さ（山形の間隔に対する比）

const float JITTER = 0.7;           // 粒の中心がマスの中でずれる量（マスの大きさ比）
const float BRIGHTNESS = 1.4;       // 全体の明るさ（元映像は明るい光の面。2026-11-10 に 1.25 から上げた）

const float BEAT_BOOST = 0.35;
const vec3 COLOR = vec3(0.9, 0.95, 1.0);    // わずかに青みのある白

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

float cloud(vec2 p){
    return 0.65 * noise(p) + 0.35 * noise(p * 2.3 + 7.1);
}

// マスごとに「粒があるか・明るさ・明滅」を乱数で決める
float glitter(vec2 px, vec2 cellSize, float density, float seed){
    vec2 cell = floor(px / cellSize);
    if(hash(cell + seed) > density) return 0.0;
    // 粒の中心をマスの中で少しずらす（ずらさないと粒が方眼に並び、デジタルの網点に見える）
    vec2 jitter = (vec2(hash(cell + seed + 11.3), hash(cell + seed + 17.9)) - 0.5) * JITTER;
    vec2 f = fract(px / cellSize) - 0.5 - jitter;
    float shape = smoothstep(0.55, 0.1, length(f));
    float twinkle = 0.55 + 0.45 * sin(u_time * mix(1.0, 6.0, hash(cell + seed + 2.1)) * 6.2831 + hash(cell + 7.0) * 6.2831);
    float brightness = mix(0.35, 1.0, hash(cell + seed + 4.4));
    return shape * twinkle * brightness;
}

void main(){
    vec2 px = vTexCoord * u_resolution;     // y は上から下へ増える（main.vert で上下を戻してある）
    vec2 p = px / u_resolution.y;
    float c = cloud(p / CLOUD_SCALE + vec2(u_time * CLOUD_SPEED, -u_time * CLOUD_SPEED * 0.6));
    float density = mix(DENSITY_MIN, DENSITY_MAX, c);

    float b;
    if(u_mode == 1){
        // しずく: 列ごとに違う速さで、縦長の粒が下へ流れる
        float column = floor(px.x / DRIP_W_PX);
        float speed = mix(DRIP_SPEED_MIN, DRIP_SPEED_MAX, hash(vec2(column, 3.3)));
        vec2 q = vec2(px.x, px.y - u_time * speed + hash(vec2(column, 8.8)) * 500.0);
        b = glitter(q, vec2(DRIP_W_PX, DRIP_H_PX), density * 0.85, 1.0);
        b += 0.5 * glitter(px, vec2(FINE_PX), density * 0.5, 5.0);
    } else {
        b = glitter(px, vec2(FINE_PX), density, 1.0) + 0.7 * glitter(px + 1.7, vec2(COARSE_PX), density * 0.6, 9.0);
    }
    b += HAZE * c;

    if(u_mode == 2){
        // 山形: 頂点が上の ∧ の入れ子。拍ごとに1段ずつ上へ流れる
        float chevron = p.y - abs(p.x - 0.5 * u_resolution.x / u_resolution.y) * CHEVRON_SLOPE;
        float phase = fract(chevron * CHEVRON_BANDS + u_beats);
        float band = smoothstep(0.0, 0.06, phase) * smoothstep(CHEVRON_WIDTH + 0.06, CHEVRON_WIDTH, phase);
        b *= 1.0 - CHEVRON_DARK * band;
    }

    b *= BRIGHTNESS * (1.0 + BEAT_BOOST * u_beat);
    gl_FragColor = vec4(COLOR * b, 1.0);
}
