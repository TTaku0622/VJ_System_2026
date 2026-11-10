// オシロスコープ（名前 'scope'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番。オシロスコープの XY 表示で描くリサージュ図形（x = sin(a·t + δ), y = sin(b·t)）。
// δ をゆっくり回すと、図形が立体的に回っているように見える。
//
//   小節の頭    a : b の比を引き直す（形がぱっと変わる）
//   拍の頭      図形がふくらむ
//   高域        線が細かく震える（音の波形を読んでいるように見せる）
//   残像        前のフレームを薄い黒で塗って残す（ブラウン管の残光）
//
// キー: A 白 / S 緑（ブラウン管の蛍光色）
class Scene20 extends BaseScene {
    constructor() {
        super();                        // 2D。線のアンチエイリアスが効く

        this.title = 'オシロスコープ';

        this.modes = { keys: ['A', 'S'], labels: ['白', '緑'] };

        // a : b の候補。小さい整数比ほど形がはっきり読める
        this.RATIOS = [[1, 2], [3, 2], [3, 4], [5, 4], [2, 3], [4, 5], [1, 3], [5, 6], [3, 5]];
        this.POINTS = 900;              // 1周の点の数
        this.SIZE = 0.38;               // 図形の半径（画面の高さ比）。横は画面の比率ぶん広げる
        this.WIDE = 1.35;               // 横に広げる倍率
        this.PHASE_SPEED = 0.35;        // δ が回る速さ（rad/秒）
        this.BEAT_SWELL = 0.12;         // 拍の頭でふくらむ量
        this.BEAT_SHARPNESS = 3;
        this.JITTER = 0.025;            // 高域で震える量（画面の高さ比）
        this.TRAIL_ALPHA = 70;          // 残像の消え方（大きいほど早く消える。255 で残像なし）

        // にじみ → 芯 の順に重ねる [太さ, 不透明度]
        this.STROKES = [[9, 25], [4, 60], [1.6, 255]];
        this.COLORS = [[255, 255, 255], [90, 255, 140]];

        this.delta = 0;
        this.ratio = this.RATIOS[0];
        this.lastBar = null;
        this.lastMs = null;
    }

    setup() {
        this.pg.background(0);
    }

    draw(spectrum) {
        const pg = this.pg;
        const w = pg.width;
        const h = pg.height;

        const now = millis() / 1000;
        const dt = this.lastMs === null ? 0 : Math.min(now - this.lastMs, 0.05);
        this.lastMs = now;
        this.delta += this.PHASE_SPEED * dt;

        const bar = Math.floor(this.beats() / tempoManager.BEATS_PER_BAR);
        if (bar !== this.lastBar) {
            const candidates = this.RATIOS.filter((r) => r !== this.ratio);
            this.ratio = candidates[Math.floor(Math.random() * candidates.length)];
        }
        this.lastBar = bar;

        // 残光: 前のフレームを薄く消す
        pg.noStroke();
        pg.fill(0, this.TRAIL_ALPHA);
        pg.rect(0, 0, w, h);

        const swell = 1 + this.BEAT_SWELL * Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS);
        const radius = this.SIZE * h * swell;
        const jitter = this.JITTER * h * this.treble(spectrum);
        const [a, b] = this.ratio;
        const [r, g, bl] = this.COLORS[this.modeIndex];

        // 点は一度だけ計算して、太さを変えて3回引く
        const points = [];
        for (let i = 0; i <= this.POINTS; i++) {
            const t = (i / this.POINTS) * Math.PI * 2;
            const shake = jitter * Math.sin(t * 97 + now * 40);
            points.push([
                w / 2 + (radius * this.WIDE + shake) * Math.sin(a * t + this.delta),
                h / 2 + (radius + shake) * Math.sin(b * t),
            ]);
        }

        pg.noFill();
        for (const [weight, alpha] of this.STROKES) {
            pg.stroke(r, g, bl, alpha);
            pg.strokeWeight(weight);
            pg.beginShape();
            for (const [x, y] of points) pg.vertex(x, y);
            pg.endShape();
        }
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
