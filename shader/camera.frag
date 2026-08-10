// Scene06 専用のカメラ加工シェーダー（ポストシェーダーとは別物）
// u_mode で加工を切り替える。エフェクトを増やすときは、ここに分岐を1つ足して
// scene06.js の MODE_KEYS に1文字足す（キーの並び順が u_mode の値になる）。
precision mediump float;

varying vec2 vTexCoord;

uniform sampler2D u_cam;        // カメラ映像
uniform sampler2D u_prev;       // 前フレームの出力（残像用）。画面座標なので vTexCoord で引く
uniform int u_mode;             // 0=生映像 1=輪郭線 2=古いテレビ 3=ゆがみ 4=2値化 5=残像 6=ストロボ
uniform vec2 u_coverScale;      // カメラと画面のアスペクト比を合わせる UV スケール
uniform float u_mirror;         // 1.0 で左右反転（手元カメラ用）
uniform float u_time;           // 経過時間（秒）。ノイズとロールバーの進行に使う
uniform float u_level;          // 音量 0.0〜1.0（平滑化済み）
uniform float u_flash;          // ストロボの発光量 1.0〜0.0（バスドラで 1 になり減衰する）

uniform vec2 u_screenTexel;     // 画面の1ピクセル分の UV（1.0 / バッファ解像度）。残像のぼかし用

// ---- 輪郭線（u_mode == 1）用 ----
uniform vec2 u_texel;           // 隣のピクセルまでの UV 距離（1.0 / カメラ解像度 × 太さ）
uniform float u_threshold;      // これを超えた勾配だけ線にする（小さいほど線が増える）
uniform float u_softness;       // 線の縁のなめらかさ

// ---- 古いテレビ（u_mode == 2）の調整値。見た目はここをいじって決める ----
const float TV_SCANLINES   = 240.0;    // 走査線の本数（少ないほど粗い）
const float TV_SCAN_DEPTH  = 0.35;     // 走査線の暗さ
const float TV_NOISE_MIN   = 0.06;     // 無音時のざらつき（0 にすると静かなとき普通の映像になる）
const float TV_NOISE_MAX   = 0.20;     // 大音量時のざらつき（上げすぎると絵が読めなくなる）
const float TV_NOISE_RATE  = 24.0;     // ノイズが変わる速さ（1秒あたりの更新回数）
const float TV_GRAIN_SCALE = 900.0;    // ざらつきの細かさ。小さくすると横縞になる
const float TV_JITTER_MIN  = 0.0015;   // 無音時の行ごとの横ずれ
const float TV_JITTER_MAX  = 0.0060;   // 大音量時の行ごとの横ずれ
const float TV_TEAR_CHANCE = 0.97;     // これを超えた行だけ大きく横へ飛ぶ（同期ズレ）
const float TV_TEAR_AMOUNT = 0.06;     // 飛ぶ量
const float TV_CHROMA      = 0.004;    // 色ずれの幅（R と B を左右にずらす）
const float TV_ROLL_SPEED  = 0.25;     // ロールバーが流れる速さ（1秒あたりの画面数）
const float TV_ROLL_WIDTH  = 0.12;     // ロールバーの太さ
const float TV_ROLL_GAIN   = 0.22;     // ロールバーの明るさ
const float TV_VIGNETTE    = 0.35;     // 四隅の落ち込み（ブラウン管の丸み）
const float TV_CONTRAST    = 0.85;     // 1 未満で褪せる

// ---- ゆがみ（u_mode == 3）の調整値 ----
const float WARP_AMP_MIN   = 0.006;    // 無音時の波の振幅（0 にすると静かなとき波が止まる）
const float WARP_AMP_MAX   = 0.030;    // 大音量時の波の振幅
const float WARP_FREQ      = 9.0;      // 波の細かさ（大きいほど細かい）
const float WARP_SPEED     = 1.1;      // 波が流れる速さ
const float WARP_BULGE     = 0.35;     // 中心の膨らみ（魚眼の強さ）。音では変えない

// ---- 2値化（u_mode == 4）の調整値 ----
const float BIN_QUIET      = 0.55;     // 無音時のしきい値（高い＝白が少ない）
const float BIN_LOUD       = 0.35;     // 大音量時のしきい値（低い＝白が増える）
const float BIN_SOFTNESS   = 0.02;     // 境界のなめらかさ。大きくすると2値でなくなる

// ---- 残像（u_mode == 5）の調整値 ----
const float TRAIL_DECAY_MIN = 0.90;    // 無音時の残り方（1 に近いほど長く残る）
const float TRAIL_DECAY_MAX = 0.955;   // 大音量時の残り方。1 を超えると白く飽和して戻らない
const float TRAIL_ZOOM      = 0.995;   // 前フレームの拡大率。1 未満で軌跡が外へ広がる
const float TRAIL_BLUR      = 2.5;     // ぼかしの半径（ピクセル）。毎フレーム積み重なるので
                                       // 1フレームでは弱くても軌跡全体はかなり柔らかくなる

// ---- ストロボ（u_mode == 6）の調整値 ----
// 光っていないときの明るさ。下げると発光の差は出るが、暗い会場では
// キックが検出されない間ずっと見えなくなるので下げすぎない
const float STROBE_BASE    = 0.65;
const float STROBE_GAIN    = 1.00;     // 発光時に足す明るさ（合計 1.65 倍まで持ち上がる）

// 疑似乱数。同じ座標でも seed が変わると別の値になる
float random(vec2 st){
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 明るさ（NTSC 係数）。色ではなく明暗の変化で輪郭を取る
float luma(vec2 uv){
    vec3 col = texture2D(u_cam, uv).rgb;
    return dot(col, vec3(0.299, 0.587, 0.114));
}

// Sobel の勾配の大きさ。3x3 の近傍から横方向 gx と縦方向 gy を出して合成する
float sobel(vec2 uv){
    float tl = luma(uv + u_texel * vec2(-1., -1.));
    float tc = luma(uv + u_texel * vec2( 0., -1.));
    float tr = luma(uv + u_texel * vec2( 1., -1.));
    float ml = luma(uv + u_texel * vec2(-1.,  0.));
    float mr = luma(uv + u_texel * vec2( 1.,  0.));
    float bl = luma(uv + u_texel * vec2(-1.,  1.));
    float bc = luma(uv + u_texel * vec2( 0.,  1.));
    float br = luma(uv + u_texel * vec2( 1.,  1.));

    float gx = (tr + 2. * mr + br) - (tl + 2. * ml + bl);
    float gy = (bl + 2. * bc + br) - (tl + 2. * tc + tr);

    return sqrt(gx * gx + gy * gy);
}

// 古いテレビ。走査線・ざらつき・行ごとの横ずれ・同期ズレ・色ずれ・ロールバーを重ねる。
// 音が大きいほど荒れるが、無音でも最小量は残るので「普通の映像」には戻らない
vec3 oldTv(vec2 uv){
    float row = floor(uv.y * TV_SCANLINES);             // 走査線の行番号
    float tick = floor(u_time * TV_NOISE_RATE);         // 段階的に進む時間

    // 行ごとの横ずれ。同じ行は同じ量ずれるので、横方向に切れ目が揃う
    float shift = (random(vec2(row, tick)) - .5) * 2. * mix(TV_JITTER_MIN, TV_JITTER_MAX, u_level);

    // まれに行がまとめて大きく飛ぶ（同期ズレ）
    if(random(vec2(tick, row * .1)) > TV_TEAR_CHANCE){
        shift += (random(vec2(row, tick + 1.)) - .5) * 2. * TV_TEAR_AMOUNT;
    }

    vec2 tvUv = clamp(uv + vec2(shift, 0.), 0., 1.);

    // 色ずれ。R と B だけ左右にずらして取る
    float chroma = TV_CHROMA * (1. + u_level);
    vec3 col = vec3(
        texture2D(u_cam, clamp(tvUv + vec2(chroma, 0.), 0., 1.)).r,
        texture2D(u_cam, tvUv).g,
        texture2D(u_cam, clamp(tvUv - vec2(chroma, 0.), 0., 1.)).b
    );

    // 走査線。1行おきに暗くする
    col *= 1. - TV_SCAN_DEPTH * step(.5, fract(uv.y * TV_SCANLINES * .5));

    // ざらつき。UV を大きく拡大してから乱数に渡す（そのまま渡すと横縞になる）
    float grain = random(uv * TV_GRAIN_SCALE + vec2(tick * .017, tick * .031)) - .5;
    col += grain * mix(TV_NOISE_MIN, TV_NOISE_MAX, u_level);

    // ロールバー。明るい帯がゆっくり縦に流れる
    float roll = fract(uv.y + u_time * TV_ROLL_SPEED);
    col += TV_ROLL_GAIN * smoothstep(TV_ROLL_WIDTH, 0., roll);

    // 四隅を落とす
    vec2 fromCenter = uv - .5;
    col *= 1. - TV_VIGNETTE * dot(fromCenter, fromCenter) * 2.;

    // コントラストを落として褪せさせる
    col = (col - .5) * TV_CONTRAST + .5;

    return clamp(col, 0., 1.);
}

// ゆがみ。常にゆっくり波打たせ、音が大きいほど波を大きくする。
// 膨らみ（魚眼）は音では変えない。動きは波、形は膨らみ、と役割を分けている
vec2 warp(vec2 uv){
    // 縦横で周波数と速さと向きを変える。揃えると単純な往復に見えてしまう
    float amp = mix(WARP_AMP_MIN, WARP_AMP_MAX, u_level);
    vec2 wavy = uv;
    wavy.x += sin(uv.y * WARP_FREQ + u_time * WARP_SPEED) * amp;
    wavy.y += sin(uv.x * WARP_FREQ * .7 - u_time * WARP_SPEED * 1.3) * amp * .6;

    // 中心から離れるほど外側を取りに行く＝中心が拡大されて魚眼になる。
    // 角（dot が最大 0.5）での倍率で割って正規化しておく。そうしないと端が
    // テクスチャの外を取りに行き、clamp で像が引き伸ばされて汚くなる
    vec2 fromCenter = wavy - .5;
    float bulge = (1. + WARP_BULGE * dot(fromCenter, fromCenter)) / (1. + WARP_BULGE * .5);

    return .5 + fromCenter * bulge;
}

// 2値化。明るさをしきい値で白と黒に割る。輪郭線が「線」で人を出すのに対して
// こちらは「面」で出す。音が大きいほどしきい値が下がって白い面が広がる
vec3 binary(vec2 uv){
    float t = mix(BIN_QUIET, BIN_LOUD, u_level);
    return vec3(smoothstep(t - BIN_SOFTNESS, t + BIN_SOFTNESS, luma(uv)));
}

// 前フレームを中心＋斜め4点でぼかして読む。1フレームぶんは弱いぼかしだが、
// フィードバックなので毎フレーム掛け合わさり、軌跡がだんだん柔らかく広がっていく
vec3 blurredPrev(vec2 uv){
    vec2 r = u_screenTexel * TRAIL_BLUR;

    vec3 sum = texture2D(u_prev, uv).rgb * 2.;      // 中心は重めに
    sum += texture2D(u_prev, clamp(uv + vec2( r.x,  r.y), 0., 1.)).rgb;
    sum += texture2D(u_prev, clamp(uv + vec2(-r.x,  r.y), 0., 1.)).rgb;
    sum += texture2D(u_prev, clamp(uv + vec2( r.x, -r.y), 0., 1.)).rgb;
    sum += texture2D(u_prev, clamp(uv + vec2(-r.x, -r.y), 0., 1.)).rgb;

    return sum / 6.;
}

// 残像。前フレームをぼかして拡大・減衰させ、今のフレームと明るい側を採用する。
// max で合成するので、明るい動きが軌跡として外へ広がりながら消えていく。
// screenUv（画面座標）で u_prev を引くこと。u_prev は加工後の出力を写したもので、
// カメラ座標（cover 補正済みの uv）とは座標系が違う
vec3 trail(vec2 camUv, vec2 screenUv){
    vec3 now = texture2D(u_cam, camUv).rgb;

    vec2 zoomed = clamp(.5 + (screenUv - .5) * TRAIL_ZOOM, 0., 1.);
    vec3 prev = blurredPrev(zoomed) * mix(TRAIL_DECAY_MIN, TRAIL_DECAY_MAX, u_level);

    return max(now, prev);
}

// ストロボ。バスドラの立ち上がりで一瞬だけ明るくする。
// 全面を白で塗らず明度の上げ下げに留めている（光感受性への配慮）。
// 発光の間隔の下限は JS 側（scene06.js の STROBE_MIN_INTERVAL）で担保する
vec3 strobe(vec2 uv){
    vec3 col = texture2D(u_cam, uv).rgb;
    return clamp(col * (STROBE_BASE + u_flash * STROBE_GAIN), 0., 1.);
}

void main(void){
    // 中央基準で切り取って画面いっぱいに出す（引き伸ばさない）
    vec2 uv = .5 + (vTexCoord - .5) * u_coverScale;

    if(u_mirror > .5){
        uv.x = 1. - uv.x;
    }

    // 映像の外側は出さない（端が枠のように光るのを防ぐ）
    if(uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.){
        gl_FragColor = vec4(0., 0., 0., 1.);
        return;
    }

    // ---- オリジナル（A）----
    if(u_mode == 0){
        gl_FragColor = vec4(texture2D(u_cam, uv).rgb, 1.);
        return;
    }

    // ---- 枠線のみ（S）。しきい値を境に 0（黒）→ 1（白線）へ ----
    if(u_mode == 1){
        float line = smoothstep(u_threshold, u_threshold + u_softness, sobel(uv));
        gl_FragColor = vec4(vec3(line), 1.);
        return;
    }

    // ---- 古いテレビ（D）----
    if(u_mode == 2){
        gl_FragColor = vec4(oldTv(uv), 1.);
        return;
    }

    // ---- ゆがみ（F）----
    if(u_mode == 3){
        gl_FragColor = vec4(texture2D(u_cam, clamp(warp(uv), 0., 1.)).rgb, 1.);
        return;
    }

    // ---- 2値化（G）----
    if(u_mode == 4){
        gl_FragColor = vec4(binary(uv), 1.);
        return;
    }

    // ---- 残像（H）----
    if(u_mode == 5){
        gl_FragColor = vec4(trail(uv, vTexCoord), 1.);
        return;
    }

    // ---- ストロボ（J）----
    if(u_mode == 6){
        gl_FragColor = vec4(strobe(uv), 1.);
        return;
    }

    // MODE_KEYS にキーを足したのに分岐を書き忘れると黒くなる
    gl_FragColor = vec4(0., 0., 0., 1.);
}
