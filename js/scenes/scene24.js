// 網点（名前 'halftone'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番のオプアート。印刷の網点のように、斜めの格子に並んだ白い丸の大きさで濃淡を描く。
// 描画はすべて shader/halftone.frag の中で、このクラスは時間・拍・音量を渡すだけ。
//
//   拍の頭      丸が大きくなる
//   音量        丸が大きくなる（無音でも小さな点は残る）
//
// キー: A 波紋（中心から同心円の波が1拍に1つ広がる）/ S 雲（ノイズの雲がゆっくり流れる）
class Scene24 extends BaseScene {
    // halftoneShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(halftoneShader) {
        super(WEBGL);

        this.title = '網点';

        this.halftoneShader = halftoneShader;

        // 並び順がそのまま halftone.frag の u_mode の値になる
        this.modes = { keys: ['A', 'S'], labels: ['波紋', '雲'] };

        this.BEAT_SHARPNESS = 3;
        this.LEVEL_SMOOTH = 0.15;       // 音量をならす割合（1 でならさない）

        this.levelValue = 0;
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.halftoneShader) return;

        this.levelValue += (this.level(spectrum) - this.levelValue) * this.LEVEL_SMOOTH;

        this.pg.shader(this.halftoneShader);
        this.halftoneShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.halftoneShader.setUniform('u_time', millis() / 1000);
        this.halftoneShader.setUniform('u_beats', this.beats());
        this.halftoneShader.setUniform('u_beat', Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS));
        this.halftoneShader.setUniform('u_level', this.levelValue);
        this.halftoneShader.setUniform('u_mode', this.modeIndex);

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
