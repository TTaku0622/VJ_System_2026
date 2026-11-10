// Scene27（放射）専用のシェーダー
//
// VJ の定番のオプアート。中心から白黒の扇が交互に並び、回る。
//
//   u_mode 0  放射     まっすぐな扇。拍の頭でぐっと回り、拍の終わりに向けてゆるむ（拍ごとに1枚ぶん進む）
//   u_mode 1  渦巻き   扇を中心からの距離でねじって渦巻きにする。吸い込まれるように回り続ける
precision highp float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;       // 秒
uniform float u_beats;      // 通算の拍数
uniform float u_beat;       // 拍の頭で 1、次の拍までに 0 へ
uniform int u_mode;

const float RAYS = 24.0;            // 白と黒の扇の組の数
const float TWIST = 5.0;            // 渦巻きのねじれ（中心から画面の高さ1つぶんで何回転ねじれるか）
const float SPIN = 0.25;            // 渦巻きが回る速さ（回転/秒）
const float CENTER_HOLE = 0.035;    // 中心の黒い丸（扇が細くなりすぎてつぶれる所を隠す。画面の高さ比）

void main(){
    vec2 p = (vTexCoord * u_resolution - 0.5 * u_resolution) / u_resolution.y;
    float r = length(p);
    float a = atan(p.y, p.x) / 6.28318;     // 1周で 1

    float turn;
    if(u_mode == 1){
        turn = a + r * TWIST / RAYS * 2.0 - u_time * SPIN / RAYS * 4.0;
    } else {
        // 拍ごとに扇1枚ぶん（1/RAYS 周の半分）進む。拍の頭で速く、後半はゆっくり（ease out）
        float phase = fract(u_beats);
        float eased = 1.0 - pow(1.0 - phase, 3.0);
        turn = a + (floor(u_beats) + eased) / RAYS * 0.5;
    }

    // 扇の縁を1ピクセルぶんだけぼかす（扇の幅は中心ほど細いので、r に合わせて広げる）
    float s = sin(turn * RAYS * 6.28318);
    float aa = RAYS * 6.28318 / (6.28318 * max(r, 0.001) * u_resolution.y) * 1.2;
    float white = smoothstep(-aa, aa, s);

    white *= smoothstep(CENTER_HOLE, CENTER_HOLE + 2.0 / u_resolution.y, r);
    // 拍の頭で外側が少し暗くなる（中心へ光が集まる）
    white *= 1.0 - 0.35 * u_beat * smoothstep(0.2, 0.9, r);
    gl_FragColor = vec4(vec3(white), 1.0);
}
