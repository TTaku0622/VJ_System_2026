// 光の粒（キー 0）
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 0:05〜0:30・2:00 ごろ、三角形の画面を
// ぎっしり埋めていた白い光の粒の面。描画はすべて shader/sparkle.frag の中で、このクラスは時間と拍を渡すだけ。
// 三角形の形にしたいときは全体エフェクトの「三角形で切り抜く」（Y）を重ねる。
//
// キー: A きらめき / S しずく / D 山形
class Scene10 extends BaseScene {
    // sparkleShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(sparkleShader) {
        super(WEBGL);

        this.title = '光の粒';

        this.sparkleShader = sparkleShader;

        // 並び順がそのまま sparkle.frag の u_mode の値になる
        this.modes = { keys: ['A', 'S', 'D'], labels: ['きらめき', 'しずく', '山形'] };

        this.BEAT_SHARPNESS = 3;        // 拍の頭で明るくなった後、戻る速さ。大きいほど一瞬
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.sparkleShader) return;

        this.pg.shader(this.sparkleShader);
        this.sparkleShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.sparkleShader.setUniform('u_time', millis() / 1000);
        this.sparkleShader.setUniform('u_mode', this.modeIndex);
        this.sparkleShader.setUniform('u_beats', this.beats());
        this.sparkleShader.setUniform('u_beat', Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS));

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
