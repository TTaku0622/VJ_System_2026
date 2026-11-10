// 入れ子の三角形（名前 'triangles'。数字キーなし、デッキか操作画面から出す）
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 1:30〜1:55 ごろ。三角形の輪郭の帯が
// 何重にも重なって中心から広がる。帯はやわらかくぼけたパステルで、背景は明るい青紫。
// 描画はすべて shader/triangles.frag の中で、このクラスは進み具合と拍を渡すだけ。
//
// **1拍で帯1本ぶん広がる。**帯の色と太さは「何番目の帯か」で決めているので、広がっても入れ替わらない。
//
// 2026-11-01 に作り直した。最初は黒地にくっきりした原色の帯を 2D の線で描いていた。
//
// キー: A 外へ広がる / S 内へ縮む
class Scene12 extends BaseScene {
    // trianglesShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(trianglesShader) {
        super(WEBGL);

        this.title = '入れ子の三角形';

        this.trianglesShader = trianglesShader;

        this.modes = { keys: ['A', 'S'], labels: ['外へ広がる', '内へ縮む'] };

        this.BEATS_PER_BAND = 1;        // 帯1本ぶん広がるのにかける拍数
        this.BEAT_SHARPNESS = 4;
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.trianglesShader) return;

        const direction = this.modeIndex === 0 ? 1 : -1;

        this.pg.shader(this.trianglesShader);
        this.trianglesShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.trianglesShader.setUniform('u_progress', this.beats() / this.BEATS_PER_BAND * direction);
        this.trianglesShader.setUniform('u_time', millis() / 1000);
        this.trianglesShader.setUniform('u_beat', Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS));

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
