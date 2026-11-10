// モアレ（名前 'moire'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番のオプアート。白黒の縞を2組重ねて、ずれた所に浮かぶ大きなうねりを見せる。
// 描画はすべて shader/moire.frag の中で、このクラスは時間と拍を渡すだけ。
//
// キー: A 同心円（拍ごとに輪が1本ぶん外へ流れる）/ S 直線（ゆっくり回る）
class Scene21 extends BaseScene {
    // moireShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(moireShader) {
        super(WEBGL);

        this.title = 'モアレ';

        this.moireShader = moireShader;

        // 並び順がそのまま moire.frag の u_mode の値になる
        this.modes = { keys: ['A', 'S'], labels: ['同心円', '直線'] };

        this.BEAT_SHARPNESS = 3;        // 拍の頭で縞が細かくなった後、戻る速さ
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.moireShader) return;

        this.pg.shader(this.moireShader);
        this.moireShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.moireShader.setUniform('u_time', millis() / 1000);
        this.moireShader.setUniform('u_beats', this.beats());
        this.moireShader.setUniform('u_beat', Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS));
        this.moireShader.setUniform('u_mode', this.modeIndex);

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
