// Scene13（破片）専用のシェーダー
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 3:00〜3:40 ごろ、三角形の画面を
// 埋めていた**白っぽく明るい、くしゃくしゃの箔（砕けた氷）のような面**。細かい面が光り、
// そのあいだに暗い細い折り目が走り、ところどころがきらめく。色は白〜青紫〜水色。
//
// 2026-11-01 に作り直した。最初は暗い地に粗い網目（ステンドグラスのよう）で、元映像の明るさと
// 細かさが無かった。
//
// 組み立て:
//   1. 座標をノイズでねじる（面がまっすぐな多角形に見えないように）
//   2. ボロノイ（点の勢力範囲の区切り）で面を作る。面ごとに明るさを変え、境目を暗い折り目にする
//   3. 細かさの違う2枚を掛け合わせ、大きなムラで陰を付け、細かいきらめきを足す
precision highp float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_flow;       // 流れの進み。時間を JS 側で積んだもの
uniform float u_time;       // 秒（きらめき）
uniform float u_beat;       // 拍の頭で 1、次の拍までに 0 へ
uniform int u_palette;      // 0 白と青紫 / 1 ピンクも混ぜる

// 元映像はかなり細かい（16・42 だと石畳のように粗かった）
const float SCALE_COARSE = 30.0;    // 粗い面の細かさ（画面の高さあたりの数）
const float SCALE_FINE = 75.0;      // 細かい面
const float WARP = 1.2;             // 座標のねじれ。大きいほど面がくしゃっとする
const float CREASE = 0.035;         // 折り目の太さ（面の大きさに対する比）
const float CREASE_DARK = 0.7;      // 折り目の暗さ
const float FACE_MIN = 0.6;         // 面の明るさの下限（元映像は全体に明るい）
const float FACE_MAX = 1.0;
const float SHADE_SCALE = 1.6;      // 大きな陰のムラの粗さ
const float SHADE_DEPTH = 0.45;     // 陰の深さ
const float SPARKLE_PX = 3.0;       // きらめきの粒の大きさ
const float SPARKLE_CHANCE = 0.025; // きらめく粒の割合
const float PINK_CHANCE = 0.15;     // ピンクの面の割合（u_palette 1 のとき）
const float BEAT_BOOST = 0.3;

float hash(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 hash2(vec2 p){
    return vec2(hash(p), hash(p + 17.31));
}

float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// ボロノイ。戻り値は (境目までの距離, 面ごとの乱数, もう1つの乱数)
vec3 voronoi(vec2 p, float time){
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float first = 8.0;
    float second = 8.0;
    vec2 owner = vec2(0.0);
    for(int y = -1; y <= 1; y++){
        for(int x = -1; x <= 1; x++){
            vec2 neighbor = vec2(float(x), float(y));
            vec2 seed = hash2(cell + neighbor);
            seed = 0.5 + 0.45 * sin(time * 0.5 + seed * 6.2831);
            float d = length(neighbor + seed - f);
            if(d < first){
                second = first;
                first = d;
                owner = cell + neighbor;
            } else if(d < second){
                second = d;
            }
        }
    }
    return vec3(second - first, hash(owner + 3.1), hash(owner + 9.7));
}

// 1枚ぶんの面の明るさ（折り目込み）と、面ごとの乱数
vec2 facets(vec2 p, float scale, float time){
    vec2 q = p * scale;
    q += WARP * (vec2(noise(q * 0.25 + time * 0.15), noise(q * 0.25 + 11.0 - time * 0.15)) - 0.5) * 2.0;
    vec3 v = voronoi(q, time);
    float face = mix(FACE_MIN, FACE_MAX, v.y);
    float crease = 1.0 - CREASE_DARK * (1.0 - smoothstep(0.0, CREASE, v.x));
    return vec2(face * crease, v.z);
}

void main(){
    vec2 p = vec2(vTexCoord.x * u_resolution.x / u_resolution.y, vTexCoord.y);
    vec2 coarse = facets(p, SCALE_COARSE, u_flow);
    vec2 fine = facets(p + 3.7, SCALE_FINE, u_flow * 1.3);
    float b = coarse.x * (0.55 + 0.45 * fine.x);

    // 大きなムラで陰を付ける
    float shade = noise(p * SHADE_SCALE + vec2(u_flow * 0.12, -u_flow * 0.08));
    b *= 1.0 - SHADE_DEPTH * smoothstep(0.6, 0.15, shade);

    // 色合い: 白 → 青紫 → 水色。面ごとに変える
    vec3 tint = mix(vec3(1.0), vec3(0.8, 0.84, 1.0), coarse.y);
    tint = mix(tint, vec3(0.7, 0.92, 1.0), step(0.8, coarse.y) * 0.6);
    if(u_palette == 1 && coarse.y < PINK_CHANCE){
        tint = vec3(1.0, 0.7, 0.88);
    }
    vec3 col = tint * b;

    // きらめき: ごく一部の細かい粒が強く光る
    vec2 cell = floor(vTexCoord * u_resolution / SPARKLE_PX);
    if(hash(cell) < SPARKLE_CHANCE){
        float twinkle = 0.5 + 0.5 * sin(u_time * mix(2.0, 7.0, hash(cell + 1.3)) + hash(cell + 4.1) * 6.2831);
        col += vec3(twinkle * 0.8);
    }

    col *= 1.0 + BEAT_BOOST * u_beat;
    gl_FragColor = vec4(min(col, 1.0), 1.0);
}
