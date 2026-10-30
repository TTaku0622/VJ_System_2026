// 白線
//
// 縦・横それぞれ3本の白線を、画面のどこかにランダムに引く。
// **拍に合わせて位置を自動で引き直す。**間隔は 1/4（四分音符 = 1拍）・1/8・1/16 の3つから
// A S D で選ぶ。拍は tempoManager（BPM）から取るので、TAP TEMPO で合わせればそのまま曲に乗る。
// Q を押すとその場でも引き直す。起動時にも1回引いているので、最初から位置はばらばら。
//
// 発光は「太くて薄い線を重ねる」ことで作る。外側ほど太く薄い線を何枚か重ねると、
// 縁に向かって暗くなる光の帯になり、最後に引く芯の白と合わさって光って見える。
//
// canvas の影（shadowBlur）を使うともっと滑らかににじむが、**画面いっぱいの線に
// かけると1枚あたり 10ms 近くかかって 60fps を割った**（実測）。線を重ねるだけなら
// ほぼ無料なので、こちらを選んでいる。
class Scene09 extends BaseScene {
    constructor() {
        super();                    // 2D。線を引くだけなので WEBGL は要らない

        this.title = '白線';

        this.LINE_COUNT = 3;        // 縦・横それぞれの本数
        this.LINE_WEIGHT = 3;       // 線の太さ（ピクセル）
        this.LINE_COLOR = 255;
        this.BG_COLOR = 0;

        // ---- 発光 ----
        this.GLOW_WIDTH = 26;       // いちばん外側の光の太さ（ピクセル）。光の広がり
        this.GLOW_LAYERS = 8;       // 光を重ねる枚数。多いほどなめらか（重さはほぼ変わらない）
        this.GLOW_ALPHA = 26;       // 1枚あたりの濃さ（0〜255）。光の強さ

        // ---- 太さの調節（MIDI のつまみ）----
        // 芯と光を同じ倍率で太らせる。**芯だけ太くすると光の帯との比が崩れて**、
        // 「太い線」ではなく「光っていない白い棒」に見える
        this.WEIGHT_SCALE_MIN = 1.0;    // 絞りきった状態＝上の定数そのままの見た目
        this.WEIGHT_SCALE_MAX = 6.0;    // 回しきった状態。芯 3→18px、光 26→156px
        this.weightScale = this.WEIGHT_SCALE_MIN;

        // つまみの宣言。min が絞りきりなので、下げれば必ず元の見た目に戻る
        this.knobs = [
            {
                name: 'weight',
                label: '線の太さ',
                property: 'weightScale',
                min: this.WEIGHT_SCALE_MIN,
                max: this.WEIGHT_SCALE_MAX,
            },
        ];

        // ---- 拍に合わせた引き直し ----
        // 1拍をいくつに割るか。並び順が modes の並び（A = 1/4、S = 1/8、D = 1/16）
        this.BEAT_DIVISIONS = [1, 2, 4];
        this.modes = { keys: ['A', 'S', 'D'], labels: ['1/4', '1/8', '1/16'] };
        this.lastStep = null;       // 前に引き直した刻み。刻みが変わった瞬間に引き直す

        this.SHUFFLE_KEY = 'Q';

        // MIDI の学習モードで割り当てを聞くキー（modes の A S D は自動で入る）
        this.keyHelp = [
            { key: this.SHUFFLE_KEY, label: '位置を引き直す' },
        ];

        this.px = [];               // 縦線の x
        this.py = [];               // 横線の y
    }

    setup() {
        this._shuffle();
    }

    draw(spectrum) {
        this._shuffleOnBeat();

        this.pg.background(this.BG_COLOR);

        // つまみで芯と光をまとめて太らせる
        const weight = this.LINE_WEIGHT * this.weightScale;
        const glowWidth = this.GLOW_WIDTH * this.weightScale;

        // 外側（太くて薄い）から内側へ重ねる
        for (let i = 0; i < this.GLOW_LAYERS; i++) {
            const ratio = i / this.GLOW_LAYERS;
            this.pg.stroke(this.LINE_COLOR, this.GLOW_ALPHA);
            this.pg.strokeWeight(lerp(glowWidth, weight, ratio));
            this._drawLines();
        }

        // 最後に芯を引く。これが無いと光るだけで線が読めない
        this.pg.stroke(this.LINE_COLOR);
        this.pg.strokeWeight(weight);
        this._drawLines();
    }

    _drawLines() {
        for (let i = 0; i < this.LINE_COUNT; i++) {
            this.pg.line(this.px[i], 0, this.px[i], this.pg.height);
        }
        for (let i = 0; i < this.LINE_COUNT; i++) {
            this.pg.line(0, this.py[i], this.pg.width, this.py[i]);
        }
    }

    keyPressed(key) {
        if (this.handleModeKey(key)) return;
        if (String(key).toUpperCase() !== this.SHUFFLE_KEY) return;

        this._shuffle();
    }

    // 拍の刻み（通算の拍数 × 割る数 の整数部）が変わったら引き直す。
    // **フレーム数ではなく拍の位置で見ている**ので、fps が落ちても拍の頭からずれない
    // （刻みより fps が遅いときは、間の刻みを飛ばして1回だけ引き直す）
    _shuffleOnBeat() {
        const step = Math.floor(this.beats() * this.BEAT_DIVISIONS[this.modeIndex]);
        if (step === this.lastStep) return;

        this.lastStep = step;
        this._shuffle();
    }

    // 位置を引き直す。完全にランダムなので、間隔も端からの余白も見ない
    _shuffle() {
        this.px = [];
        this.py = [];

        for (let i = 0; i < this.LINE_COUNT; i++) {
            this.px[i] = random(this.pg.width);
            this.py[i] = random(this.pg.height);
        }
    }
}
