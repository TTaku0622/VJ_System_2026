// 赤い線の網（名前 'rednet'。数字キーなし、デッキか操作画面から出す）
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 3:45〜3:55 ごろの映像。
// **明るい淡いピンク〜薄紫の地に、白い太い線が交差する網。**ところどころが赤・オレンジの線で、
// 網のあいだに灰色のボケた丸が浮かぶ。線はやわらかくにじむ。
//
// 2026-11-01 に作り直した。最初は黒っぽい赤の地に赤い線を引いていて、元映像の明るさと違った。
//
// 線は2つの向き（右上がり・右下がり）の組で網を作り、少しずつ回りながら漂う。
// **小節の頭ごとに何本かを引き直す**ので、網が曲に合わせて組み変わる。拍の頭で白い線が明るくなる。
//
// キーなし。調整はクラス冒頭の定数で行う。
class Scene14 extends BaseScene {
    constructor() {
        super();                        // 2D。線のアンチエイリアスが効く

        this.title = '赤い線の網';

        // ---- 地 ----
        this.BG_TOP = [212, 196, 222];      // 上（薄紫）
        this.BG_BOTTOM = [232, 200, 212];   // 下（淡いピンク）

        // ---- 線 ----
        this.LINE_COUNT = 40;
        this.FAMILY_ANGLES = [-0.6, 0.6];   // 網の2つの向き（rad。水平から）
        this.ANGLE_SPREAD = 0.35;           // 向きのばらつき
        this.WEIGHT_MIN = 4;                // 太さ（ピクセル）
        this.WEIGHT_MAX = 14;
        this.SPIN_MAX = 0.04;               // 回る速さの上限（rad/秒）
        this.DRIFT_MAX = 0.015;             // 横に漂う速さの上限（画面の対角線/秒）
        this.REFRESH_PER_BAR = 5;           // 小節の頭ごとに引き直す本数
        this.WHITE = [250, 246, 250];
        this.REDS = [
            [225, 45, 40],                  // 赤
            [245, 120, 50],                 // オレンジ
            [235, 90, 110],                 // 赤みのピンク
        ];
        this.RED_CHANCE = 0.2;              // 赤系の線の割合（残りは白）。元映像は白が主で赤は差し色
        this.GLOW_EXTRA = 8;                // にじみの太さの上乗せ（ピクセル）
        this.GLOW_ALPHA = 60;

        // ---- ボケた丸 ----
        this.CIRCLE_COUNT = 12;
        this.CIRCLE_SIZE_MIN = 0.05;        // 直径（画面の高さ比）
        this.CIRCLE_SIZE_MAX = 0.14;
        this.CIRCLE_COLOR = [95, 88, 115];  // 灰色がかった紫
        this.CIRCLE_ALPHA = 150;

        this.BEAT_FLASH = 0.35;
        this.BEAT_SHARPNESS = 4;

        this.lines = [];
        this.circles = [];
        this.lastMs = null;
        this.lastBar = null;
    }

    setup() {
        for (let i = 0; i < this.LINE_COUNT; i++) this.lines.push(this._newLine());
        for (let i = 0; i < this.CIRCLE_COUNT; i++) {
            this.circles.push({
                x: Math.random(),
                y: Math.random(),
                size: this.CIRCLE_SIZE_MIN + Math.random() * (this.CIRCLE_SIZE_MAX - this.CIRCLE_SIZE_MIN),
                vx: (Math.random() * 2 - 1) * 0.01,
                vy: (Math.random() * 2 - 1) * 0.01,
            });
        }
    }

    draw(spectrum) {
        const now = millis() / 1000;
        const dt = this.lastMs === null ? 0 : Math.min(now - this.lastMs, 0.05);
        this.lastMs = now;
        this._refreshOnBar();

        const pg = this.pg;
        const w = pg.width;
        const h = pg.height;
        const diagonal = Math.hypot(w, h);
        const flash = Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS) * this.BEAT_FLASH;

        this._background(w, h);
        pg.strokeCap(SQUARE);

        // 線: 画面の中心から法線方向に offset だけ離れた、角度 angle の線。にじみ → 芯
        for (const line of this.lines) {
            line.angle += line.spin * dt;
            line.offset += line.drift * dt;
            if (Math.abs(line.offset) > 0.5) line.drift = -line.drift;      // 画面の外へ出ていかないよう折り返す
        }
        for (const glow of [true, false]) {
            for (const line of this.lines) {
                const dx = Math.cos(line.angle);
                const dy = Math.sin(line.angle);
                const ox = w / 2 - dy * line.offset * diagonal;
                const oy = h / 2 + dx * line.offset * diagonal;
                const [r, g, b] = line.color;

                if (glow) {
                    pg.stroke(r, g, b, this.GLOW_ALPHA);
                    pg.strokeWeight(line.weight + this.GLOW_EXTRA);
                } else {
                    // 拍の頭で白に寄せて明るくする
                    pg.stroke(r + (255 - r) * flash, g + (255 - g) * flash, b + (255 - b) * flash);
                    pg.strokeWeight(line.weight);
                }
                pg.line(ox - dx * diagonal, oy - dy * diagonal, ox + dx * diagonal, oy + dy * diagonal);
            }
        }

        // ボケた丸を手前に。縁をぼかすため、少しずつ小さい丸を重ねる
        pg.noStroke();
        const [cr, cg, cb] = this.CIRCLE_COLOR;
        for (const circle of this.circles) {
            circle.x = this._wrap(circle.x + circle.vx * dt);
            circle.y = this._wrap(circle.y + circle.vy * dt);
            for (let k = 0; k < 4; k++) {
                pg.fill(cr, cg, cb, this.CIRCLE_ALPHA / 4);
                pg.circle(circle.x * w, circle.y * h, circle.size * h * (1 - k * 0.12));
            }
        }
    }

    _background(w, h) {
        const pg = this.pg;
        const [r1, g1, b1] = this.BG_TOP;
        const [r2, g2, b2] = this.BG_BOTTOM;
        const steps = 24;
        pg.noStroke();
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            pg.fill(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
            pg.rect(0, (i / steps) * h, w, h / steps + 1);
        }
    }

    _newLine() {
        const red = Math.random() < this.RED_CHANCE;
        const family = this.FAMILY_ANGLES[Math.floor(Math.random() * this.FAMILY_ANGLES.length)];
        return {
            angle: family + (Math.random() * 2 - 1) * this.ANGLE_SPREAD,
            offset: (Math.random() * 2 - 1) * 0.45,     // 中心からの距離（画面の対角線比）
            weight: this.WEIGHT_MIN + Math.pow(Math.random(), 1.5) * (this.WEIGHT_MAX - this.WEIGHT_MIN),
            color: red ? this.REDS[Math.floor(Math.random() * this.REDS.length)] : this.WHITE,
            spin: (Math.random() * 2 - 1) * this.SPIN_MAX,
            drift: (Math.random() * 2 - 1) * this.DRIFT_MAX,
        };
    }

    // 小節番号が変わった瞬間に、何本かを引き直す（Scene09 の _shuffleOnBeat() と同じ書き方）
    _refreshOnBar() {
        const bar = Math.floor(this.beats() / tempoManager.BEATS_PER_BAR);
        const changed = this.lastBar !== null && bar !== this.lastBar;
        this.lastBar = bar;
        if (!changed) return;

        for (let i = 0; i < this.REFRESH_PER_BAR; i++) {
            this.lines[Math.floor(Math.random() * this.lines.length)] = this._newLine();
        }
    }

    _wrap(v) {
        return ((v % 1) + 1) % 1;
    }
}
