// スペクトル同心シェイプ: 同心円 / 同心三角のサウンドビジュアライザー
//
// スペクトルの各バンドの値をそのまま「図形の大きさ」にして、中心から相似形を
// 何重にも重ねる。バンド間は線形補間して本数を増やしているので、隣り合う線が
// 少しずつずれて縞になり、音が動くと縞がうねる。
//
//   円     val をそのまま直径にした同心円。値が 0 なら消える
//   三角   val を最小〜最大へ写した二等辺三角形。左右対称で、上向き固定。
//          最小があるので音が小さくても形が残る
//
// どちらも最大は画面短辺を超えるので、鳴ったときは画面の外まで開く。
// 線の太さは中心側（低域）が細く、外側（高域）へ向かうほど太い。高域は値が
// 小さいので、太い線ほど内側に集まって密になる。
//
// キー: T 円 ↔ 三角（切替以外の操作は持たない）
class Scene04 extends BaseScene {
    constructor() {
        super();                        // 2D。線のアンチエイリアスが効く

        this.title = 'スペクトル';

        this.MODES = ['circle', 'triangle'];
        // T を押すたびに循環する。表示名は操作画面（control.html）に出る
        this.modes = { keys: ['T'], labels: ['円', '三角'] };

        // ---- 形（すべて画面短辺比） ----
        this.CIRCLE_MAX_SIZE = 1.3;     // 円の直径の最大
        this.TRI_MIN_SIZE = 0.22;       // 三角の高さの最小（無音でも残る大きさ）
        this.TRI_MAX_SIZE = 1.8;        // 三角の高さの最大
        this.TRI_BASE = 1.5;            // 三角の底辺の広さ（高さに対する比）

        this.INTERP = 12;               // バンド間の補間倍率。線の密度

        // ---- 見た目 ----
        this.BG_COLOR = 0;              // 背景は黒
        this.LINE_COLOR = 255;          // 線は白
        this.WEIGHT_MIN = 0.5;          // 中心側（低域）の太さ
        this.WEIGHT_MAX = 2.5;          // 外側（高域）の太さ

        // 状態（modeIndex）は BaseScene が持つ。既定は 0 = 円
    }

    setup() {
        this.pg.noFill();
        this.pg.stroke(this.LINE_COLOR);
    }

    draw(spectrum) {
        this.pg.background(this.BG_COLOR);
        this.pg.noFill();
        this.pg.stroke(this.LINE_COLOR);

        const cx = width / 2;
        const cy = height / 2;
        const base = Math.min(width, height);

        // バンド間を補間して本数を増やした配列
        const values = this._interpolate(spectrum, spectrum.length * this.INTERP);

        if (this.MODES[this.modeIndex] === 'circle') {
            this._drawCircles(values, cx, cy, base);
        } else {
            this._drawTriangles(values, cx, cy, base);
        }
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }

    // ---- 内部 ----

    // spectrum のバンド間を線形補間して count 本の値にする
    _interpolate(spectrum, count) {
        const values = new Array(count);
        for (let i = 0; i < count; i++) {
            const fi = (i / count) * spectrum.length;
            const lo = Math.floor(fi);
            const hi = Math.min(lo + 1, spectrum.length - 1);
            const t = fi - lo;
            values[i] = spectrum[lo] * (1 - t) + spectrum[hi] * t;
        }
        return values;
    }

    _drawCircles(values, cx, cy, base) {
        for (let i = 0; i < values.length; i++) {
            const d = values[i] * base * this.CIRCLE_MAX_SIZE;
            this.pg.strokeWeight(this._weight(i, values.length));
            this.pg.ellipse(cx, cy, d, d);
        }
    }

    _drawTriangles(values, cx, cy, base) {
        const range = this.TRI_MAX_SIZE - this.TRI_MIN_SIZE;

        for (let i = 0; i < values.length; i++) {
            // 最小サイズから最大サイズへの写像。値が 0 でも TRI_MIN_SIZE 分は残る
            const h = (this.TRI_MIN_SIZE + values[i] * range) * base;
            const halfH = h * 0.5;
            const halfW = h * this.TRI_BASE * 0.5;

            this.pg.strokeWeight(this._weight(i, values.length));
            this.pg.triangle(cx, cy - halfH, cx - halfW, cy + halfH, cx + halfW, cy + halfH);
        }
    }

    // 中心側を細く、外側ほど太く
    _weight(i, total) {
        return this.WEIGHT_MIN + (i / total) * (this.WEIGHT_MAX - this.WEIGHT_MIN);
    }
}
