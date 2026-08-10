precision mediump float;

varying vec2 vTexCoord;

uniform float u_time;
uniform vec2 u_resolution;

// オーディオ（0.0〜1.0）
uniform float u_vol;        // 全体の音量
uniform float u_bass;       // 低域
uniform float u_mid;        // 中域
uniform float u_treble;     // 高域

// シーンのテクスチャとクロスフェード
uniform sampler2D u_tex;    // フェードアウト側のシーン
uniform sampler2D u_tex2;   // フェードイン側のシーン
uniform float u_fade;       // 0.0 = u_tex / 1.0 = u_tex2

// エフェクト（SceneManager の effects と対応。キーを増やすときは両方に足す）
uniform bool u_isBEffectEnabled;
uniform bool u_isVEffectEnabled;
uniform bool u_isNEffectEnabled;
uniform bool u_isMEffectEnabled;

// 画面分割
uniform float u_tileColumns;
uniform float u_tileRows;

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

    vec4 col = mix(texture2D(u_tex, uv), texture2D(u_tex2, uv), u_fade);

    // ---- 色をいじる系のエフェクトはここに追加する ----

    gl_FragColor = col;
}
