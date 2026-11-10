// 放射（名前 'rays'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番のオプアート。中心から白黒の扇が交互に並んで回る。
// 描画はすべて shader/rays.frag の中で、このクラスは時間と拍を渡すだけ。
//
// キー: A 放射（拍の頭でぐっと回り、拍ごとに扇1枚ぶん進む）/ S 渦巻き（吸い込まれるように回り続ける）
class Scene27 extends BaseScene {
    // raysShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(raysShader) {
        super(WEBGL);

        this.title = '放射';

        this.raysShader = raysShader;

        // 並び順がそのまま rays.frag の u_mode の値になる
        this.modes = { keys: ['A', 'S'], labels: ['放射', '渦巻き'] };

        this.BEAT_SHARPNESS = 3;
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.raysShader) return;

        this.pg.shader(this.raysShader);
        this.raysShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.raysShader.setUniform('u_time', millis() / 1000);
        this.raysShader.setUniform('u_beats', this.beats());
        this.raysShader.setUniform('u_beat', Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS));
        this.raysShader.setUniform('u_mode', this.modeIndex);

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
