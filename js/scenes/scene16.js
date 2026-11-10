// グリッチ（名前 'glitch'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番の「映像が壊れる」表現。描画はすべて shader/glitch.frag の中で、このクラスは
// 壊し方を引き直す刻み（16分音符）と、壊れる強さ・小節の頭の反転を渡すだけ。
//
// 壊れる強さは拍の頭で最大、拍の終わりに向かって GLITCH_MIN まで落ち着く。
// 高域が鳴っているときは落ち着ききらない（ハイハットが細かいほどざわつく）。
//
// キー: A カラーバー / S 白黒（白黒は他のレイヤーに加算で重ねる用）
class Scene16 extends BaseScene {
    // glitchShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(glitchShader) {
        super(WEBGL);

        this.title = 'グリッチ';

        this.glitchShader = glitchShader;

        // 並び順がそのまま glitch.frag の u_mode の値になる
        this.modes = { keys: ['A', 'S'], labels: ['カラーバー', '白黒'] };

        this.STEPS_PER_BEAT = 4;        // 壊し方を引き直す回数（1拍あたり。4 で16分音符）
        this.GLITCH_MIN = 0.12;         // 拍の終わりの、いちばん落ち着いたときの強さ
        this.GLITCH_SHARPNESS = 2;      // 大きいほど拍の頭のあと早く落ち着く
        this.TREBLE_BOOST = 0.6;        // 高域で上乗せする強さ
        this.FLASH_LENGTH = 0.12;       // 小節の頭の反転の長さ（拍の長さ比）
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.glitchShader) return;

        const phase = this.beatPhase();
        const decay = Math.pow(1 - phase, this.GLITCH_SHARPNESS);
        const glitch = Math.min(1, this.GLITCH_MIN + (1 - this.GLITCH_MIN) * decay + this.TREBLE_BOOST * this.treble(spectrum));
        const flash = this.beatInBar() === 0 && phase < this.FLASH_LENGTH ? 1 : 0;

        this.pg.shader(this.glitchShader);
        this.glitchShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.glitchShader.setUniform('u_time', millis() / 1000);
        this.glitchShader.setUniform('u_step', Math.floor(this.beats() * this.STEPS_PER_BEAT));
        this.glitchShader.setUniform('u_glitch', glitch);
        this.glitchShader.setUniform('u_flash', flash);
        this.glitchShader.setUniform('u_mode', this.modeIndex);

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
