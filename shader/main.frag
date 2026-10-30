precision mediump float;

varying vec2 vTexCoord;

uniform float u_time;
uniform vec2 u_resolution;

// オーディオ（0.0〜1.0）
uniform float u_vol;        // 全体の音量
uniform float u_bass;       // 低域
uniform float u_mid;        // 中域
uniform float u_treble;     // 高域

// ---- レイヤー（SceneManager の layers と対応）----
// **レイヤー1 がいちばん下。**GLSL ES 1.0 ではテクスチャを配列で回せないので、
// 1枚ごとに書き下してある。LAYER_COUNT を変えたら、この組と main() の合成を同じ数にする
//
//   Tex       今のシーン
//   FromTex   切替フェード中の前のシーン（遷移していなければ Tex と同じ）
//   Fade      0.0 = FromTex / 1.0 = Tex
//   Opacity   合成の強さ。空・バイパスのレイヤーは 0 で届く
//   Blend     合成モード。0 通常 / 1 加算 / 2 スクリーン / 3 乗算（SceneManager の BLEND_MODES の並び）
uniform sampler2D u_layer1Tex;
uniform sampler2D u_layer1FromTex;
uniform float u_layer1Fade;
uniform float u_layer1Opacity;
uniform int u_layer1Blend;

uniform sampler2D u_layer2Tex;
uniform sampler2D u_layer2FromTex;
uniform float u_layer2Fade;
uniform float u_layer2Opacity;
uniform int u_layer2Blend;

uniform sampler2D u_layer3Tex;
uniform sampler2D u_layer3FromTex;
uniform float u_layer3Fade;
uniform float u_layer3Opacity;
uniform int u_layer3Blend;

// エフェクト（SceneManager の effects と対応。キーを増やすときは両方に足す）
uniform bool u_isBEffectEnabled;
uniform bool u_isVEffectEnabled;
uniform bool u_isNEffectEnabled;
uniform bool u_isMEffectEnabled;

// 画面分割
uniform float u_tileColumns;
uniform float u_tileRows;

// 出力全体の明るさ（マスター調光）。0.0 で真っ黒、1.0 でそのまま
uniform float u_brightness;

float PI = 3.14159265358979;

float random(vec2 st){
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 上下左右のミラー
vec2 mirror(vec2 uv){
    return abs(uv - .5);
}

// 左右2画面のミラー
vec2 mirror2(vec2 uv){
    return vec2(abs(uv.x - .5), uv.y);
}

// n が小さいほど粗いモザイク
vec2 mosaic(vec2 uv, float n){
    return floor(uv * n) / n;
}

// uv を n×n のグリッドで繰り返す
vec2 grid(vec2 uv, float n){
    return mod(uv * n, 1.);
}

// factor < 1.0 で拡大、> 1.0 で縮小
vec2 zoom(vec2 uv, float factor){
    return .5 + (uv - .5) * factor;
}

// 画面分割。タイルの縦横比に合わせて中央基準でトリミングする
vec2 tileCover(vec2 uv){
    vec2 tileUv = fract(uv * vec2(u_tileColumns, u_tileRows));
    float sceneAspect = u_resolution.x / u_resolution.y;
    float tileAspect = (u_resolution.x / u_tileColumns) / (u_resolution.y / u_tileRows);
    vec2 cropScale = vec2(1.0);

    if(tileAspect < sceneAspect){
        cropScale.x = tileAspect / sceneAspect;
    } else {
        cropScale.y = sceneAspect / tileAspect;
    }

    return .5 + (tileUv - .5) * cropScale;
}

// 下の色 base に上の色 top を合成モードで重ねた結果（不透明度 100% のとき）
vec3 blendColor(vec3 base, vec3 top, int mode){
    if(mode == 1){
        return min(base + top, 1.0);                    // 加算: 黒は透明、明るい所が足される
    }
    if(mode == 2){
        return 1.0 - (1.0 - base) * (1.0 - top);        // スクリーン: 加算より白く飛びにくい
    }
    if(mode == 3){
        return base * top;                              // 乗算: 白は透明、暗い所が乗る
    }
    return top;                                         // 通常: 上が下を覆う
}

// 1レイヤーぶん重ねる。不透明度で「重ねる前」と「重ねた後」を混ぜる
vec3 composite(vec3 base, vec3 top, float opacity, int mode){
    return mix(base, blendColor(base, top, mode), opacity);
}

void main(void){
    vec2 uv = tileCover(vTexCoord);

    // ---- UV を歪ませる系のエフェクト ----
    if(u_isBEffectEnabled){
        uv = mirror(uv);
    }
    if(u_isVEffectEnabled){
        uv = mirror2(uv);
    }
    if(u_isNEffectEnabled){
        uv = mosaic(uv, 10.0);
    }
    if(u_isMEffectEnabled){
        uv = mosaic(uv, 100.0);
    }

    // ---- レイヤーを下から重ねる。いちばん下は黒 ----
    vec3 layer1 = mix(texture2D(u_layer1FromTex, uv).rgb, texture2D(u_layer1Tex, uv).rgb, u_layer1Fade);
    vec3 layer2 = mix(texture2D(u_layer2FromTex, uv).rgb, texture2D(u_layer2Tex, uv).rgb, u_layer2Fade);
    vec3 layer3 = mix(texture2D(u_layer3FromTex, uv).rgb, texture2D(u_layer3Tex, uv).rgb, u_layer3Fade);

    vec3 mixed = vec3(0.0);
    mixed = composite(mixed, layer1, u_layer1Opacity, u_layer1Blend);
    mixed = composite(mixed, layer2, u_layer2Opacity, u_layer2Blend);
    mixed = composite(mixed, layer3, u_layer3Opacity, u_layer3Blend);

    vec4 col = vec4(mixed, 1.0);

    // ---- 色をいじる系のエフェクトはここに追加する ----

    // マスター調光。**いちばん最後に掛ける**ので、どのシーン・どのエフェクトでも必ず効く
    col.rgb *= u_brightness;

    gl_FragColor = col;
}
