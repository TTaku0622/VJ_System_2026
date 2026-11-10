// 破片（名前 'shards'。数字キーなし、デッキか操作画面から出す）
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 3:00〜3:40 ごろ、三角形の画面を
// 埋めていた、白っぽく明るいくしゃくしゃの箔のような細かい破片。描画はすべて shader/shards.frag の中で、このクラスは
// 流れの進みと拍を渡すだけ。
//
// 流れは時間をそのまま渡さず、毎フレーム足した値を渡す（Scene08 の流体と同じ）。
// 速さを変えた瞬間に模様が飛ばないように。
//
// キー: A 白と青紫 / S ピンクも混ぜる（元映像の寄りの画ではピンクの破片も見えた）
class Scene13 extends BaseScene {
    // shardsShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(shardsShader) {
        super(WEBGL);

        this.title = '破片';

        this.shardsShader = shardsShader;

        // 並び順がそのまま shards.frag の u_palette の値になる
        this.modes = { keys: ['A', 'S'], labels: ['白と青紫', 'ピンクも混ぜる'] };

        this.FLOW_SPEED = 0.35;         // 流れの速さ（1秒あたりに進む量）
        this.BEAT_SHARPNESS = 3;        // 拍の頭で光った後、戻る速さ

        this.flow = 0;
        this.lastMs = null;
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.shardsShader) return;

        const now = millis() / 1000;
        const dt = this.lastMs === null ? 0 : Math.min(now - this.lastMs, 0.05);
        this.lastMs = now;
        this.flow += this.FLOW_SPEED * dt;

        this.pg.shader(this.shardsShader);
        this.shardsShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.shardsShader.setUniform('u_flow', this.flow);
        this.shardsShader.setUniform('u_time', now);
        this.shardsShader.setUniform('u_beat', Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS));
        this.shardsShader.setUniform('u_palette', this.modeIndex);

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
