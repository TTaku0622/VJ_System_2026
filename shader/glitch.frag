// Scene16（グリッチ）専用のシェーダー
//
// VJ の定番の「映像が壊れる」表現。元の絵（カラーバー or データの縞）を、
// **16分音符ごとに壊し方を引き直して**ずらす。拍の頭でいちばん強く壊れ、拍の終わりに向かって落ち着く。
//
//   横の帯ずれ   画面を横の帯に切り、帯ごとに左右へずらす（帯の数も毎回変わる）
//   色ずれ       赤と青を左右に引き離す
//   ブロック     画面を升目に切り、ところどころを別の場所の絵・単色で置き換える
//   走査線       ブラウン管の横縞と、下へ流れる明るい帯
//   反転         小節の頭だけ一瞬白黒が反転する
//
//   u_mode 0  カラーバー  テレビの試験信号（SMPTE）を壊す
//   u_mode 1  白黒        白い横長のブロックが並ぶデータの縞を壊す（他のレイヤーに加算で重ねる用）
precision highp float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;       // 秒
uniform float u_step;       // 16分音符の通し番号（壊し方を引き直す刻み）
uniform float u_glitch;     // 壊れる強さ 0〜1（拍の頭で 1）
uniform float u_flash;      // 小節の頭の反転 0〜1
uniform int u_mode;

const float ROWS_MIN = 6.0;         // 横の帯の数（毎回この範囲で引き直す）
const float ROWS_MAX = 48.0;
const float ROW_SHIFT_CHANCE = 0.55;    // 強さ 1 のとき、ずれる帯の割合
const float ROW_SHIFT_MAX = 0.35;       // 帯がずれる最大量（画面の幅比）
const float RGB_SPLIT = 0.025;          // 色ずれの最大量（画面の幅比）
const vec2 BLOCK_GRID_MIN = vec2(6.0, 4.0);     // 升目の数（毎回この範囲で引き直す。横長の升目も出る）
const vec2 BLOCK_GRID_MAX = vec2(40.0, 24.0);
const float BLOCK_CHANCE = 0.1;         // 強さ 1 のとき、置き換わる升目の割合
const float BLOCK_FILL = 0.2;           // 置き換わった升目のうち、単色で塗る割合
const float JUMP_CHANCE = 0.18;         // 強さ 1 のとき、画面全体が上下に跳ぶ確率（刻みごと）
const float SCANLINE = 0.18;            // 走査線の濃さ
const float ROLL_SPEED = 0.15;          // 明るい帯が下へ流れる速さ（画面/秒）
const float GRAIN = 0.08;               // ざらつき

float hash(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// テレビの試験信号。上 2/3 が7色の縦縞、細い帯をはさんで下は黒・白・灰
vec3 colorBars(vec2 uv){
    float i = floor(uv.x * 7.0);
    vec3 top = vec3(1.0);
    if(i == 1.0) top = vec3(1.0, 1.0, 0.0);
    else if(i == 2.0) top = vec3(0.0, 1.0, 1.0);
    else if(i == 3.0) top = vec3(0.0, 1.0, 0.0);
    else if(i == 4.0) top = vec3(1.0, 0.0, 1.0);
    else if(i == 5.0) top = vec3(1.0, 0.0, 0.0);
    else if(i == 6.0) top = vec3(0.0, 0.0, 1.0);
    top *= 0.85;
    if(uv.y < 0.67) return top;
    if(uv.y < 0.75){
        // 細い帯は上の並びを逆順に暗く
        float j = 6.0 - i;
        return (mod(j, 2.0) == 0.0) ? vec3(0.1, 0.1, 0.6) : vec3(0.05);
    }
    float k = floor(uv.x * 6.0);
    if(k == 0.0) return vec3(0.0, 0.15, 0.35);
    if(k == 1.0) return vec3(0.9);
    if(k == 2.0) return vec3(0.2, 0.0, 0.4);
    return vec3(0.04 * k);
}

// 白い横長のブロックが並ぶデータの縞。行ごとに升目の幅と流れる速さが違う
vec3 dataStripes(vec2 uv){
    float rows = 28.0;
    float row = floor(uv.y * rows);
    float fy = fract(uv.y * rows);
    float cols = mix(6.0, 60.0, hash(vec2(row, 1.7)));
    float speed = (hash(vec2(row, 3.1)) - 0.5) * 0.6;
    float x = uv.x * cols + u_time * speed * cols;
    float on = step(0.62, hash(vec2(floor(x), row)));
    float gap = step(0.15, fy) * step(fy, 0.85);         // 行と行のあいだに黒いすき間
    return vec3(on * gap);
}

vec3 source(vec2 uv){
    uv = fract(uv);
    return (u_mode == 1) ? dataStripes(uv) : colorBars(uv);
}

void main(){
    vec2 uv = vTexCoord;
    float g = u_glitch;
    float s = u_step;

    // ---- 画面全体の上下の跳び（ブラウン管の同期はずれ） ----
    if(hash(vec2(s, 9.1)) < JUMP_CHANCE * g){
        uv.y += (hash(vec2(s, 4.4)) - 0.5) * 0.5;
    }

    // ---- 横の帯ずれ ----
    float rows = floor(mix(ROWS_MIN, ROWS_MAX, hash(vec2(s, 0.3))));
    float row = floor(uv.y * rows);
    float rowRand = hash(vec2(row, s));
    if(rowRand < ROW_SHIFT_CHANCE * g){
        uv.x += (hash(vec2(row, s + 7.7)) - 0.5) * 2.0 * ROW_SHIFT_MAX * g;
    }

    // ---- ブロック ----
    vec2 grid = floor(mix(BLOCK_GRID_MIN, BLOCK_GRID_MAX, vec2(hash(vec2(s, 5.5)), hash(vec2(s, 6.6)))));
    vec2 cell = floor(vTexCoord * grid);
    float blockRand = hash(cell + s * 1.37);
    bool block = blockRand < BLOCK_CHANCE * g;
    if(block){
        // 別の升目の絵を持ってくる
        uv += (vec2(hash(cell + s), hash(cell - s)) - 0.5) * 0.6;
    }

    // ---- 色ずれ ----
    float split = RGB_SPLIT * (0.2 + g) * (hash(vec2(row, s + 3.3)) * 0.8 + 0.2);
    // 白黒はずれた帯だけ色をずらす（全部ずらすと虹色の縁だらけで白黒に見えない）
    if(u_mode == 1 && rowRand >= ROW_SHIFT_CHANCE * g) split = 0.0;
    vec3 col;
    col.r = source(uv + vec2(split, 0.0)).r;
    col.g = source(uv).g;
    col.b = source(uv - vec2(split, 0.0)).b;

    // ブロックの一部は単色で塗りつぶす
    // 色は元の絵の中の色から選ぶ（でたらめな色だと紙吹雪のように安っぽくなる）
    if(block && hash(cell + s * 2.1) < BLOCK_FILL){
        col = (u_mode == 1) ? vec3(1.0) : source(vec2(hash(cell + s), 0.3));
    }

    // ---- 走査線・流れる帯・ざらつき ----
    float scan = 1.0 - SCANLINE * (0.5 + 0.5 * sin(vTexCoord.y * u_resolution.y * 3.14159));
    float roll = 1.0 + 0.25 * smoothstep(0.08, 0.0, abs(fract(vTexCoord.y - u_time * ROLL_SPEED) - 0.5));
    float grain = 1.0 + GRAIN * (hash(vTexCoord * u_resolution + fract(u_time) * 100.0) - 0.5);
    col *= scan * roll * grain;

    // ---- 小節の頭の反転 ----
    col = mix(col, 1.0 - col, u_flash);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
