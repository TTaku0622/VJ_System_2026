// 多面体（名前 'solids'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番。正多面体（正四面体・立方体・正八面体・正十二面体・正二十面体）の辺だけを白線で描き、回す。
//
//   小節の頭    形が次の多面体に変わる（大きく飛び出してから元の大きさに収まる）
//   拍の頭      ふくらむ。頂点の点が光る
//
// 辺は「頂点どうしの距離がいちばん短い組」として計算で出す（正多面体はどの辺も同じ長さなので）。
//
// キー: A 入れ子（大中小の3つが逆向きに回る）/ S 群れ（小さい多面体が格子に並んで、ばらばらに回る）
class Scene25 extends BaseScene {
    constructor() {
        super(WEBGL);

        this.title = '多面体';

        this.modes = { keys: ['A', 'S'], labels: ['入れ子', '群れ'] };

        this.SIZE = 0.42;               // 入れ子のいちばん外の半径（画面の高さ比）
        this.NEST_SCALES = [1, 0.58, 0.32];     // 入れ子の大きさ
        this.NEST_SPEEDS = [0.35, -0.6, 0.9];   // 入れ子の回る速さ（rad/秒。負は逆回り）
        this.SWARM_ROWS = 3;            // 群れの段数（列は画面の比率で決まる）
        this.SWARM_SIZE = 0.11;         // 群れの1つの半径（画面の高さ比）
        this.BEAT_SWELL = 0.1;          // 拍の頭でふくらむ量
        this.BEAT_SHARPNESS = 3;
        this.POP_BEATS = 0.5;           // 形が変わってから元の大きさに収まるまで（拍）
        this.POP_OVERSHOOT = 0.45;      // 形が変わった瞬間の大きさの上乗せ（小節の頭がいちばん強い拍なので、そこで大きく見せる）
        this.LINE_WEIGHT = 3;           // 1080p 基準
        this.GLOW_WEIGHT = 7;
        this.GLOW_ALPHA = 45;
        this.POINT_WEIGHT = 9;          // 頂点の点の大きさ（拍の頭）

        this.solids = this._buildSolids();
        this.solidIndex = 0;
        this.lastBar = null;
        this.barStartBeats = 0;
        this.lastMs = null;
        this.spin = 0;
    }

    draw(spectrum) {
        const pg = this.pg;
        const h = pg.height;
        const now = millis() / 1000;
        const dt = this.lastMs === null ? 0 : Math.min(now - this.lastMs, 0.05);
        this.lastMs = now;
        this.spin += dt;

        const beats = this.beats();
        const bar = Math.floor(beats / tempoManager.BEATS_PER_BAR);
        if (this.lastBar !== null && bar !== this.lastBar) {
            this.solidIndex = (this.solidIndex + 1) % this.solids.length;
            this.barStartBeats = bar * tempoManager.BEATS_PER_BAR;
        }
        this.lastBar = bar;

        // 形が変わった直後は大きく飛び出して、元の大きさへ収まる。
        // 最初は小さい所から開く形にしたが、小節の頭（いちばん強い拍）に画面が空になったのでやめた
        const pop = Math.min(1, Math.max(0, (beats - this.barStartBeats) / this.POP_BEATS));
        const popScale = 1 + this.POP_OVERSHOOT * Math.pow(1 - pop, 3);
        const beat = Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS);
        const swell = (1 + this.BEAT_SWELL * beat) * (this.lastBar === null ? 1 : popScale);

        pg.background(0);
        pg.noFill();
        const scale = h / 1080;
        const solid = this.solids[this.solidIndex];

        if (this.modeIndex === 0) {
            this.NEST_SCALES.forEach((nest, i) => {
                const speed = this.NEST_SPEEDS[i];
                pg.push();
                pg.rotateY(this.spin * speed);
                pg.rotateX(this.spin * speed * 0.7 + i);
                pg.rotateZ(this.spin * speed * 0.3);
                this._drawSolid(solid, this.SIZE * h * nest * swell, scale, beat, 1 - i * 0.2);
                pg.pop();
            });
        } else {
            const rows = this.SWARM_ROWS;
            const gap = h / rows;
            const cols = Math.ceil(pg.width / gap);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const seed = r * 31 + c * 17;
                    pg.push();
                    pg.translate((c - (cols - 1) / 2) * gap, (r - (rows - 1) / 2) * gap, 0);
                    pg.rotateY(this.spin * (0.4 + (seed % 7) * 0.12) + seed);
                    pg.rotateX(this.spin * (0.3 + (seed % 5) * 0.1) + seed * 0.5);
                    // 隣どうしで形をずらす（全部同じだと単調）
                    const own = this.solids[(this.solidIndex + r + c) % this.solids.length];
                    this._drawSolid(own, this.SWARM_SIZE * h * swell, scale, beat, 1);
                    pg.pop();
                }
            }
        }
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }

    // にじみ → 芯 → 頂点の点
    _drawSolid(solid, radius, scale, beat, brightness) {
        const pg = this.pg;
        const tone = 255 * brightness;
        for (const [weight, alpha] of [[this.GLOW_WEIGHT, this.GLOW_ALPHA], [this.LINE_WEIGHT, 255]]) {
            pg.stroke(tone, alpha);
            pg.strokeWeight(weight * scale);
            pg.beginShape(LINES);
            for (const [a, b] of solid.edges) {
                const p = solid.vertices[a];
                const q = solid.vertices[b];
                pg.vertex(p[0] * radius, p[1] * radius, p[2] * radius);
                pg.vertex(q[0] * radius, q[1] * radius, q[2] * radius);
            }
            pg.endShape();
        }
        pg.stroke(tone);
        pg.strokeWeight((3 + this.POINT_WEIGHT * beat) * scale);
        for (const p of solid.vertices) pg.point(p[0] * radius, p[1] * radius, p[2] * radius);
    }

    // 正多面体の頂点（半径 1 にそろえる）と辺
    _buildSolids() {
        const phi = (1 + Math.sqrt(5)) / 2;
        const sets = [
            // 正四面体
            [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
            // 立方体
            [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]],
            // 正八面体
            [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
            // 正十二面体
            [
                [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
                [0, 1 / phi, phi], [0, 1 / phi, -phi], [0, -1 / phi, phi], [0, -1 / phi, -phi],
                [1 / phi, phi, 0], [1 / phi, -phi, 0], [-1 / phi, phi, 0], [-1 / phi, -phi, 0],
                [phi, 0, 1 / phi], [phi, 0, -1 / phi], [-phi, 0, 1 / phi], [-phi, 0, -1 / phi],
            ],
            // 正二十面体
            [
                [0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi],
                [1, phi, 0], [1, -phi, 0], [-1, phi, 0], [-1, -phi, 0],
                [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
            ],
        ];
        return sets.map((points) => {
            const vertices = points.map((p) => {
                const length = Math.hypot(p[0], p[1], p[2]);
                return p.map((v) => v / length);
            });
            // いちばん短い距離の組が辺
            let shortest = Infinity;
            for (let i = 0; i < vertices.length; i++) {
                for (let j = i + 1; j < vertices.length; j++) shortest = Math.min(shortest, this._distance(vertices[i], vertices[j]));
            }
            const edges = [];
            for (let i = 0; i < vertices.length; i++) {
                for (let j = i + 1; j < vertices.length; j++) {
                    if (this._distance(vertices[i], vertices[j]) < shortest * 1.01) edges.push([i, j]);
                }
            }
            return { vertices, edges };
        });
    }

    _distance(a, b) {
        return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
}
