// Scene08 専用の流体シェーダー（ポストシェーダーとは別物）
//
// ノイズで座標をずらしてから縞を描く（domain warping）ことで、絵の具が混ざっていくような
// 流れを作る。**流体の計算（ナビエ・ストークス）はしていない。**見た目だけを作っている。
// 本物の流体計算は速度場を毎フレーム前のフレームから作り直す必要があり、シーンごとに
// バッファを2枚持つことになる。VJ で必要なのは「流れて見えること」なのでノイズで足りる。
//
// 組み立て:
//   1. 画面の座標を中心原点にして、必要なら上下左右に折り返す（鏡）
//   2. ノイズ2枚を x と y のずれとして使い、座標をゆがめる ＝ 流れ
//   3. ゆがめた座標から縞の位置を作る（横縞 ↔ 渦は u_swirl で混ぜる）
//   4. 縞の位置で配色を引く
//
// 参考: OpenProcessing "Rainflower Stone"（u277620。元は Zaron Chen "Unified Rupture"）。
//       ノイズで uv をずらしてから極座標で縞にする、という組み立てを借りている。
//       コードは移植ではなく、このシーンのために書き直したもの。
precision highp float;      // mediump だとノイズの整数計算が破綻して四角いムラが出る

varying vec2 vTexCoord;

uniform vec2 u_resolution;  // 描画バッファの解像度（アスペクト比の補正に使う）
uniform int u_palette;      // 配色 0=雨花石 1=墨 2=溶岩 3=虹
uniform float u_flow;       // 流れの進み。**時間ではなく累積した位相**なので速さを変えても飛ばない
uniform float u_warp;       // ゆがみの量（音が大きいほど増える）
uniform float u_zoom;       // 寄り（脈で少しだけ寄る）。1.0 で等倍
uniform float u_swirl;      // 渦の強さ 0.0=横縞 1.0=渦（切替は JS 側で補間して渡す）
uniform float u_mirror;     // 1.0 で上下左右の鏡
uniform float u_hue;        // 虹の配色の色相（度）。時間で回る
uniform float u_level;      // 音量 0.0〜1.0（平滑化済み）

// ---- 形の調整値。見た目はここをいじって決める ----
const int   OCTAVES       = 3;      // ノイズの重ね枚数。**fps が足りないときはまずここを減らす**
const float NOISE_SCALE   = 1.6;    // 流れの粗さ。大きいほど細かく渦巻く
const float FLOW_OFFSET   = 37.0;   // x 用と y 用のノイズをずらす距離（同じ形になるのを防ぐ）
const float DETAIL_SCALE  = 3.4;    // 縞の縁に足すゆらぎの粗さ
const float DETAIL_AMOUNT = 0.22;   // 縞の縁のゆらぎの量。大きいほど縞がちぎれる
const float BAND_DENSITY  = 4.0;    // 横縞のときの縞の数（画面の高さあたり）
const float SWIRL_TURNS   = 4.0;    // 渦のときに1周ぶんで数える縞の数
const float SWIRL_RINGS   = 2.4;    // 渦が外へ向かって進む量。0 にすると放射状になる
const vec2  SWIRL_EYE     = vec2(0.22, 0.22);   // 渦の中心。鏡のときは4隅に散って「目」が4つになる
const float EYE_SOFT      = 0.030;  // 渦の中心をぼかす半径。0 にすると1点に縞が集まって針のように尖る
const float EYE_SHADE     = 1.0;    // ぼかした中心の色（配色の明るい側）
const float BAND_DRIFT    = 0.30;   // 縞そのものが流れていく速さ（u_flow に対する比率）
const float SHADE_BIAS    = 0.65;   // 明るい側へどれだけ寄せるか。1 で等分、下げるほど濃い色が細い筋になる
const float BRIGHT_QUIET  = 0.82;   // 無音時の明るさ。0 にしないので絵は消えない
const float BRIGHT_LOUD   = 1.0;    // 大音量時の明るさ

// ---- 配色。4色の間をなめらかにつなぐ ----
const vec3 STONE_0 = vec3(0.01, 0.04, 0.22);    // 雨花石: 濃紺 → 青 → 白 → 淡い水色
const vec3 STONE_1 = vec3(0.05, 0.31, 0.98);
const vec3 STONE_2 = vec3(0.86, 0.99, 1.00);
const vec3 STONE_3 = vec3(0.60, 0.90, 0.99);

const vec3 INK_0 = vec3(0.0);                   // 墨: 黒 → 白。他シーンと並べたときに浮かない
const vec3 INK_1 = vec3(0.10);
const vec3 INK_2 = vec3(0.72);
const vec3 INK_3 = vec3(1.0);

const vec3 LAVA_0 = vec3(0.02, 0.0, 0.02);      // 溶岩: 黒 → 赤 → 橙 → 白
const vec3 LAVA_1 = vec3(0.62, 0.04, 0.05);
const vec3 LAVA_2 = vec3(1.0, 0.48, 0.05);
const vec3 LAVA_3 = vec3(1.0, 0.95, 0.80);

const float RAINBOW_SPREAD = 150.0;             // 虹: 縞の端から端までで回す色相（度）
const float RAINBOW_SAT    = 0.85;

const float TWO_PI = 6.28318530718;

// ---- 3次元シンプレックスノイズ ----
// Ashima Arts / Stefan Gustavson の実装（MIT License）。
// 3次元なので z を時間に使える＝**同じ形が流れるのではなく、形そのものが変わっていく**
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    // 格子のどのセルにいるか
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    // セルの中の4つの頂点
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    // 頂点ごとの疑似乱数
    i = mod289(i);
    vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    // 乱数から勾配ベクトルを作る
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    // 勾配の長さをそろえる
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // 4頂点の寄与を重みつきで足す
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// 粗いノイズから細かいノイズへ、半分ずつ弱めながら重ねる（fBm）。
// 1枚だけだとのっぺりするので、大きなうねりの上に細かいゆらぎを乗せる
float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
        sum += amp * snoise(p);
        p *= 2.0;               // z も一緒に伸びるので、細かい層ほど速く変化する
        amp *= 0.5;
    }
    return sum;
}

// 0→1 をなめらかに（両端の傾きが 0 になる5次の曲線）
float smoo5(float x) { return x * x * x * (x * (6.0 * x - 15.0) + 10.0); }

// 4色を等間隔でつなぐグラデーション。t は 0.0〜1.0
vec3 ramp(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t) {
    t = clamp(t, 0.0, 1.0) * 3.0;
    vec3 c = mix(c0, c1, clamp(t, 0.0, 1.0));
    c = mix(c, c2, clamp(t - 1.0, 0.0, 1.0));
    c = mix(c, c3, clamp(t - 2.0, 0.0, 1.0));
    return c;
}

// 色相（度）・彩度・明度 → RGB
vec3 hsb2rgb(float hue, float sat, float bri) {
    vec3 k = mod(vec3(5.0, 3.0, 1.0) + hue / 60.0, 6.0);
    return bri * (1.0 - sat * clamp(min(k, 4.0 - k), 0.0, 1.0));
}

void main(void){
    // 中心を原点に、縦を基準にした座標へ（横長でも形が引き伸ばされない）
    vec2 p = (vTexCoord - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) / u_zoom;

    float t = u_flow;

    // ノイズ2枚を x と y のずれとして使う。これが流れそのもの
    vec2 shift = vec2(
        fbm(vec3(p * NOISE_SCALE, t)),
        fbm(vec3(p * NOISE_SCALE + FLOW_OFFSET, t * 1.1))
    );
    vec2 warped = p + shift * u_warp;

    // 鏡は**ゆがませた後に折り返す**。先に折り返すと、折り目の左右でノイズの値が違うぶん
    // 模様が飛んで、画面の中央に十字の切れ目が出る。後から折れば折り目で模様がつながる
    vec2 q = u_mirror > 0.5 ? abs(warped) : warped;

    // 縞の位置。横縞は x をそのまま、渦は極座標の角度＋半径で数える。
    // **SWIRL_TURNS は整数にしておくこと。**角度は 1 周で 0 に戻るので、整数でないと
    // その継ぎ目が1本の線として画面に出てしまう
    vec2 eye = q - SWIRL_EYE * step(0.5, u_mirror);
    float radius = length(eye);
    float straight = q.x * BAND_DENSITY;
    float spiral = (atan(eye.y, eye.x) / TWO_PI + 0.5) * SWIRL_TURNS + radius * SWIRL_RINGS;
    float band = mix(straight, spiral, u_swirl);

    // 縞の縁を乱して、絵の具が滲んだような境目にする
    band += fbm(vec3(q * DETAIL_SCALE, t * 1.4)) * DETAIL_AMOUNT;
    band += t * BAND_DRIFT;

    // 0→1→0 と折り返す。fract のままだと 1 と 0 の継ぎ目が線として出てしまう
    float shade = smoo5(abs(fract(band) * 2.0 - 1.0));
    shade = pow(shade, SHADE_BIAS);

    // 渦の中心は縞が1点に集まるので、そのままだと針のように尖ってちらつく。
    // **縞の位置ではなく色のほうをぼかす**（縞をぼかすと角度の継ぎ目がずれて線が出る）
    shade = mix(shade, EYE_SHADE, (1.0 - smoothstep(0.0, EYE_SOFT, radius)) * u_swirl);

    vec3 color;
    if (u_palette == 0) {
        color = ramp(STONE_0, STONE_1, STONE_2, STONE_3, shade);
    } else if (u_palette == 1) {
        color = ramp(INK_0, INK_1, INK_2, INK_3, shade);
    } else if (u_palette == 2) {
        color = ramp(LAVA_0, LAVA_1, LAVA_2, LAVA_3, shade);
    } else {
        // 色相は音では変えず、時間だけで回す（無音でも色は移り変わる）
        color = hsb2rgb(mod(u_hue + shade * RAINBOW_SPREAD, 360.0), RAINBOW_SAT, 1.0);
    }

    // 音が大きいほど少し明るくする。無音でも BRIGHT_QUIET は残る
    color *= mix(BRIGHT_QUIET, BRIGHT_LOUD, u_level);

    gl_FragColor = vec4(color, 1.0);
}
