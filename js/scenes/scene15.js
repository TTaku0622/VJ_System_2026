// 万華鏡（名前 'kaleido'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番。画面の中心から放射状に鏡で折り返したフラクタル模様が、ゆっくり組み変わりながら回る。
// 描画はすべて shader/kaleido.frag の中で、このクラスは模様の進み・拍・低域を渡すだけ。
//
// 模様の進みは時間をそのまま渡さず、毎フレーム足した値を渡す（Scene08 の流体と同じ）。
// 低域が鳴ると速く進むが、速さが変わった瞬間に模様が飛ばない。
//
// キー: A 色 / S 白黒（白黒は他のレイヤーに加算で重ねる用）
class Scene15 extends BaseScene {
    // kaleidoShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(kaleidoShader) {
        super(WEBGL);

        this.title = '万華鏡';

        this.kaleidoShader = kaleidoShader;

        // 並び順がそのまま kaleido.frag の u_mode の値になる
        this.modes = { keys: ['A', 'S'], labels: ['色', '白黒'] };

        this.FLOW_SPEED = 0.6;          // 模様の進む速さ（1秒あたり）
        this.FLOW_BASS_BOOST = 1.5;     // 低域が鳴ったときに上乗せする速さ
        this.BEAT_SHARPNESS = 3;        // 拍の頭で寄った後、戻る速さ
        this.BASS_SMOOTH = 0.15;        // 低域の値をならす割合（1 でならさない）

        this.flow = 0;
        this.bassLevel = 0;
        this.lastMs = null;
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.kaleidoShader) return;

        const now = millis() / 1000;
        const dt = this.lastMs === null ? 0 : Math.min(now - this.lastMs, 0.05);
        this.lastMs = now;

        this.bassLevel += (this.bass(spectrum) - this.bassLevel) * this.BASS_SMOOTH;
        this.flow += (this.FLOW_SPEED + this.FLOW_BASS_BOOST * this.bassLevel) * dt;

        this.pg.shader(this.kaleidoShader);
        this.kaleidoShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.kaleidoShader.setUniform('u_time', now);
        this.kaleidoShader.setUniform('u_flow', this.flow);
        this.kaleidoShader.setUniform('u_beat', Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS));
        this.kaleidoShader.setUniform('u_bass', this.bassLevel);
        this.kaleidoShader.setUniform('u_mode', this.modeIndex);

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
