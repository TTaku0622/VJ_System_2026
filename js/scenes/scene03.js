// 鼓動する地球儀
//
// 黒い画面の中で、三角形の網目（ジオデシック球）の白い線でできた球が 20 個、房のように固まって跳ねる。
// 元ネタはサカナクション「ミュージック」のライブ（SAKANAQUARIUM 2024 "turn"）の 2:15〜2:55 ごろに
// 後ろに流れていた映像。線はくっきりした白で、小さい球ほど少し暗くして奥行きを出している。
//
// 動きは4つが重なっている:
//   鼓動     BPM どおり、メトロノームと同じタイミング（毎拍）で全部の球が一斉にふくらんで戻る。
//            1拍目だけ少し強い
//   バウンド 画面を箱として、月より弱い重力と空気の抵抗で、風船のようにふわっと跳ねる。床の反発は低め。
//            止まりそうになった球は**次の小節の頭で跳ね上げる**ので、ずっと動き続け、跳ねる瞬間も曲に合う
//   重なり   **球どうしの当たり判定は無い**（2026-11-01 本人「元映像に近くしたい」。元映像の球は重なり合って
//            房になっている）。**大きい球ほど手前に置いて**、重なった部分は手前の球が奥の球を隠す
//   回転     **実際のボールと同じく、当たった面とのこすれ（摩擦）で回る。**床を転がれば進む速さに
//            合った回転になり、空中ではその回転が続く（空気の抵抗で少しずつ落ちる）
//
// **どれも時間で動かしている（フレーム数で積まない）。**鼓動は tempoManager の拍、
// 動きは前のフレームからの経過時間。fps が落ちても拍とずれず、落ちる速さも変わらない。
//
// **裏側の線は隠す**（2026-11-01 本人の指定。最初は透ける案だった）。線の少し内側に黒い球を描き、
// 奥の線を深度で隠している。
//
// 回転は3次元で持つ（角速度ベクトル ω と、向きを表す四元数 q）。画面の中の動きは2次元でも、
// 当たり方しだいで横向きの回転も生まれる。座標は p5 の WEBGL と同じ（x 右・y 下・z 手前）。
class Scene03 extends BaseScene {
    constructor() {
        super(WEBGL);

        this.title = '鼓動する地球儀';

        // ---- 球の数と大きさ ----
        // 大きさは最大〜最小のあいだに等間隔で振る（大小ばらばら）。どちらも画面の短辺に対する比率。
        // **元映像は数十個が房のように固まっている**ので 20 個にした（2026-11-01。8個のときは 0.12〜0.05）
        this.BALL_COUNT = 20;
        this.RADIUS_MAX_RATIO = 0.09;
        this.RADIUS_MIN_RATIO = 0.035;

        // ---- 真ん中に寄せる ----
        // **画面の中央（幅の CENTER_ZONE_RATIO × 2）の中は自由に動き、外へ出た球だけを
        // ゆるいバネで中央へ戻す。**見えない壁に跳ね返すと不自然なので、力でじわっと戻す
        this.CENTER_ZONE_RATIO = 0.2;       // 中央から左右にこの割合（画面の幅比）までは力を掛けない
        this.CENTER_PULL = 8;               // 外に出た分に掛ける戻す力（/秒²）。大きいほど早く戻る（約2秒で往復する強さ）

        // ---- 見た目: 三角形の網目（ジオデシック球）----
        // **元映像の球は緯度経度ではなく三角形の網目**（2026-11-01、本人と元映像を見比べて決定）。
        // 正二十面体の各面を FREQUENCY × FREQUENCY に割って球面へふくらませる。
        // 2 で三角形 80 枚・辺 120 本。3 にすると 180 枚・270 本で細かくなる
        this.GEODESIC_FREQUENCY = 2;
        this.ARC_SEGMENTS = 4;              // 1本の辺を何分割の折れ線で描くか。球面に沿って曲がって見える
        this.LINE_COLOR = 255;
        this.BG_COLOR = 0;
        this.START_SPIN_MAX = 1.0;          // 最初に持たせる回転の速さの上限（rad/秒）。向きはばらばら

        // ---- 線 ----
        // **くっきりした白い線**（2026-11-01 本人「もっと線がくっきりしている」）。
        // にじみ（太くて薄い線を先に重ねる。Scene09 と同じ作り）は外してある。戻すなら GLOW_WEIGHTS に
        // 太さを入れる（例 [5, 3]。7・4px だと球が小さいぶん線が灰色の管に見えた）
        this.LINE_WEIGHT = 2;               // 線の太さ（ピクセル）
        this.GLOW_WEIGHTS = [];             // にじみの太さ（ピクセル）。外側から順に重ねる。空でにじみ無し
        this.GLOW_ALPHA = 30;               // にじみ1枚あたりの濃さ（0〜255）

        // ---- 奥行き ----
        // 小さい球ほど少し暗くして、奥にあるように見せる。暗くしすぎると線がぼやけて見えるので控えめに
        // （0.45 にしたら小さい球が灰色になり「くっきり」しなかった）
        this.FAR_BRIGHTNESS = 0.8;          // いちばん小さい球の明るさ（いちばん大きい球が 1.0）

        // 裏側の線を隠す黒い球。線と同じ半径だと手前の線まで隠れるので、ほんの少し小さくする。
        // 1.0 に近いほど輪郭ぎわまで隠れる。下げすぎると縁の近くで裏の線が透ける
        this.OCCLUDER_RATIO = 0.99;
        this.OCCLUDER_DETAIL_X = 32;        // 黒い球の分割数。見えないので粗くてよい
        this.OCCLUDER_DETAIL_Y = 24;

        // ---- 鼓動（毎拍。全部の球がそろって）----
        // 倍率 = 1 + PULSE_AMOUNT × (1 − 拍の中の位置)^PULSE_SHARPNESS。拍の頭で最大、すっと戻る
        this.PULSE_AMOUNT = 0.16;           // 拍の頭でふくらむ量（半径の 16%。1拍目は ×1.6 で 26%）
        this.PULSE_SHARPNESS = 3;           // 大きいほど一瞬でしぼむ
        this.DOWNBEAT_ACCENT = 1.6;         // 1拍目だけ強くする倍率（メトロノームの1拍目）。1 で全拍同じ

        // ---- バウンド（ふわふわ）----
        // **風船のようにふわっと漂う**（2026-11-01 本人「もう少しふわふわしている」）。
        // 重力を月（画面の高さを 2m とみなして 0.81 画面/秒²）より弱くし、空気の抵抗を足してある。
        // 抵抗があると落ちる速さに上限ができ（重力 ÷ 抵抗 = 0.375 画面/秒）、ゆっくり降りてくる
        this.GRAVITY_RATIO = 0.3;           // 重力。画面の高さ/秒²（月の設定のときは 0.81）
        this.AIR_DRAG = 0.8;                // 空気の抵抗（/秒）。速さに比例してブレーキが掛かる
        this.SPIN_DRAG = 0.3;               // 空気による回転のブレーキ（/秒）
        this.FLOOR_RESTITUTION = 0.55;      // 床の反発。低いほど跳ねない
        this.WALL_RESTITUTION = 0.8;        // 左右の壁と天井の反発
        this.REST_HEIGHT_RATIO = 0.03;      // 跳ねる高さがこれ（画面の高さ比）未満なら床に置く
        this.MAX_DT = 0.05;                 // 1フレームで進める時間の上限（秒）。止まっていた後に吹き飛ばない
        // 1回の計算で進める時間の上限（秒）。フレームの間隔がこれより長いときは細かく分けて計算する。
        // fps が落ちて1回で大きく進んでも、床や壁での跳ね返りが同じになる
        // （当たり判定があった頃は、11fps で球どうしが 70% 重なった。実測）
        this.MAX_STEP = 1 / 120;

        // ---- 奥行き（重なったときの前後）----
        // 大きい球ほど手前。球と球の奥行きの差を「2つの半径の和 × 鼓動の最大倍率」以上空けるので、
        // 画面の上で重なっても球の中身どうしがめり込まない（手前の黒い球が奥の線をきれいに隠す）
        this.DEPTH_MARGIN = 1.05;           // 奥行きの差に掛ける余裕

        // ---- 回転（摩擦）----
        // 当たった瞬間に「滑らずに転がる」状態へどれだけ近づけるか（0 = つるつる、1 = 一発で転がる）
        this.WALL_GRIP = 0.5;               // 床・壁・天井にぶつかった瞬間
        this.ROLL_GRIP_RATE = 12;           // 床に置いて転がっている間、転がりに合わせる速さ（/秒）
        this.ROLL_DAMPING = 0.8;            // 転がりの抵抗。床にいる間、速さと回転が一緒に落ちる（/秒）

        // ---- 跳ね上げ（小節の頭）----
        this.KICK_THRESHOLD_RATIO = 0.15;   // 到達できる高さがこれ未満になった球を、次の小節の頭で跳ね上げる
        // 跳ね上げる高さ。床から天井までに対する比率。高めにして群れが画面の上のほうまで漂うようにする
        this.KICK_HEIGHT_MIN = 0.6;
        this.KICK_HEIGHT_MAX = 0.9;
        this.SIDE_SPEED_MIN = 0.10;         // 横の速さ。画面の幅に対する比率（/秒）
        this.SIDE_SPEED_MAX = 0.30;
        // 1小節に跳ね上げる球の上限。勢いの落ちている順に選ぶ。
        // ふわふわにした後は 6 個だと床で順番待ちが出て群れが下に溜まった。10 個で平均の高さが
        // 画面の 33% → 39%、中ほど（高さ 25〜75%）にいる時間が 47% → 59%（実測）。上限なしだと騒がしい
        this.KICK_MAX_PER_BAR = 10;

        // ---- 状態 ----
        this.edges = [];                    // 単位球の上の辺（球面に沿った折れ線）
        this.globe = null;                  // 線をまとめた形。setup() で1回だけ作り、全部の球で使い回す
        // 1つの球: { x, y, z, vx, vy, radius, mass, inertia, brightness, w: [ωx, ωy, ωz], q: [w, x, y, z] }
        // 位置と速さは左上原点のピクセル。z は奥行き（0 が最も手前、奥ほど負）。
        // w は角速度（rad/秒）、q は向き（四元数）
        this.balls = [];
        this.lastMs = null;
        this.lastBar = null;                // 前のフレームの小節番号。変わった瞬間が小節の頭
    }

    setup() {
        this._buildGeodesic();

        // **線は1回だけ組み立てて使い回す。**毎フレーム beginShape で線を引くと
        // 球1つで 2.5ms かかった（緯度経度のとき実測）。まとめておけば描くだけで済む（0.01ms）
        this.globe = this.pg.buildGeometry(() => this._drawEdges());

        this._createBalls();

        // 正投影。**遠近があると手前側が大きく写り、壁に当たる位置と見た目がずれる**。
        // 奥へ並べた球が全部映るよう、奥行きの範囲（far）を球の並びの深さぶん広げる
        const eyeZ = (this.pg.height / 2) / Math.tan(Math.PI / 6);     // p5 の既定のカメラの位置
        const deepest = Math.min(...this.balls.map((ball) => ball.z - ball.radius * this._maxPulse()));
        this.pg.ortho(-this.pg.width / 2, this.pg.width / 2, -this.pg.height / 2, this.pg.height / 2,
            0, eyeZ - deepest + 100);
    }

    draw(spectrum) {
        this._updatePhysics();

        const pulse = this._pulse();

        this.pg.background(this.BG_COLOR);

        for (const ball of this.balls) {
            const [angle, axis] = this._quatToAxisAngle(ball.q);

            // WEBGL の原点は画面の中心。物理は左上原点で計算しているので、ここでずらす
            this.pg.push();
            this.pg.translate(ball.x - this.pg.width / 2, ball.y - this.pg.height / 2, ball.z);
            if (angle > 0) this.pg.rotate(angle, axis);
            this.pg.scale(ball.radius * pulse);

            // 先に黒い球を描いて、奥にある線を深度で隠す
            this.pg.noStroke();
            this.pg.fill(this.BG_COLOR);
            this.pg.sphere(this.OCCLUDER_RATIO, this.OCCLUDER_DETAIL_X, this.OCCLUDER_DETAIL_Y);

            // にじみ（太くて薄い線）→ 芯（細い線）の順に重ねる。小さい球ほど暗い（奥にあるように見せる）
            this.pg.noFill();
            const tone = this.LINE_COLOR * ball.brightness;
            for (const weight of this.GLOW_WEIGHTS) {
                this.pg.stroke(tone, this.GLOW_ALPHA);
                this.pg.strokeWeight(weight);
                this.pg.model(this.globe);
            }
            this.pg.stroke(tone);
            this.pg.strokeWeight(this.LINE_WEIGHT);
            this.pg.model(this.globe);
            this.pg.pop();
        }
    }

    // ---- 見た目 ----

    // 三角形の網目（ジオデシック球）の辺を作る。正二十面体の各面を FREQUENCY 等分の三角形に割り、
    // 頂点を球面へ押し出す。辺は球面に沿った弧（ARC_SEGMENTS 分割の折れ線）にする
    _buildGeodesic() {
        const n = this.GEODESIC_FREQUENCY;
        const { vertices, faces } = this._icosahedron();
        const seen = new Set();
        this.edges = [];

        const addEdge = (a, b) => {
            // 隣り合う面で同じ辺が2回出てくるので、端の座標で1本にまとめる
            const key = [a, b].map((p) => p.map((v) => v.toFixed(4)).join(',')).sort().join('|');
            if (seen.has(key)) return;
            seen.add(key);
            this.edges.push(this._arc(a, b));
        };

        for (const [ia, ib, ic] of faces) {
            const [A, B, C] = [vertices[ia], vertices[ib], vertices[ic]];
            // 面の上の格子点 P(i, j) = A + (B − A)·i/n + (C − A)·j/n を球面へ
            const point = (i, j) => this._normalize(A.map((a, k) => a + (B[k] - a) * i / n + (C[k] - a) * j / n));

            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n - i; j++) {
                    addEdge(point(i, j), point(i + 1, j));
                    addEdge(point(i, j), point(i, j + 1));
                    addEdge(point(i + 1, j), point(i, j + 1));
                }
            }
        }
    }

    // 正二十面体。頂点は単位球の上
    _icosahedron() {
        const t = (1 + Math.sqrt(5)) / 2;
        const vertices = [
            [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
            [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
            [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
        ].map((v) => this._normalize(v));
        const faces = [
            [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
            [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
            [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
            [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
        ];
        return { vertices, faces };
    }

    // a から b への球面に沿った弧（直線で結ぶと球の内側を通り、黒い球に隠れてしまう）
    _arc(a, b) {
        const points = [];
        for (let s = 0; s <= this.ARC_SEGMENTS; s++) {
            const t = s / this.ARC_SEGMENTS;
            points.push(this._normalize(a.map((v, k) => v + (b[k] - v) * t)));
        }
        return points;
    }

    // 線を描く。setup() の buildGeometry の中で1回だけ呼ぶ
    _drawEdges() {
        this.pg.noFill();
        for (const edge of this.edges) {
            this.pg.beginShape();
            for (const [px, py, pz] of edge) this.pg.vertex(px, py, pz);
            this.pg.endShape();
        }
    }

    // 拍の頭で最大、次の拍までにすっと戻る。1拍目だけ強い。全部の球で同じ値を使う
    _pulse() {
        const accent = this.beatInBar() === 0 ? this.DOWNBEAT_ACCENT : 1;
        return 1 + this.PULSE_AMOUNT * accent * Math.pow(1 - this.beatPhase(), this.PULSE_SHARPNESS);
    }

    // 鼓動でいちばんふくらんだときの倍率（1拍目の頭）
    _maxPulse() {
        return 1 + this.PULSE_AMOUNT * this.DOWNBEAT_ACCENT;
    }

    // ---- 球を作る ----

    // 大きい順に、上の方の中央の範囲へ置いて、横に少し速さを持たせて落とす。
    // 奥行きは大きい順に手前から並べる（隣どうしの差は 2つの半径の和 × 鼓動の最大倍率 以上）
    _createBalls() {
        const shortSide = Math.min(this.pg.width, this.pg.height);
        this.balls = [];

        let z = 0;
        let previousRadius = null;
        for (let i = 0; i < this.BALL_COUNT; i++) {
            const t = this.BALL_COUNT > 1 ? i / (this.BALL_COUNT - 1) : 0;
            const radius = shortSide * (this.RADIUS_MAX_RATIO + (this.RADIUS_MIN_RATIO - this.RADIUS_MAX_RATIO) * t);
            const mass = radius * radius * radius;      // 体積に比例（床や壁とのこすれで回る量に効く）

            if (previousRadius !== null) z -= (previousRadius + radius) * this._maxPulse() * this.DEPTH_MARGIN;
            previousRadius = radius;

            const zone = this.pg.width * this.CENTER_ZONE_RATIO;
            const ball = {
                x: this.pg.width / 2 + (Math.random() * 2 - 1) * zone,
                y: radius + Math.random() * (this.pg.height / 2 - radius),
                z,
                vx: this._sideSpeed(),
                vy: 0,
                radius,
                mass,
                inertia: 0.4 * mass * radius * radius,  // 中身の詰まった球の慣性モーメント（2/5 m r²）
                brightness: 1 + (this.FAR_BRIGHTNESS - 1) * t,    // 大きい球 1.0 → 小さい球 FAR_BRIGHTNESS
                w: this._randomSpin(),
                // 向きはばらばら（三角形の網目に上下は無いので、どの向きから始めてもよい）
                q: this._quatFromAxisAngle(this._randomAxis(), Math.random() * Math.PI * 2),
            };
            this.balls.push(ball);
        }
    }

    _sideSpeed() {
        const speed = this.SIDE_SPEED_MIN + Math.random() * (this.SIDE_SPEED_MAX - this.SIDE_SPEED_MIN);
        return (Math.random() < 0.5 ? -1 : 1) * speed * this.pg.width;
    }

    // 向きも速さもばらばらの回転
    _randomSpin() {
        const speed = Math.random() * this.START_SPIN_MAX;
        return this._randomAxis().map((v) => v * speed);
    }

    _randomAxis() {
        return this._normalize([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]);
    }

    // ---- 動き ----

    _gravity() {
        return this.GRAVITY_RATIO * this.pg.height;     // ピクセル/秒²
    }

    // 上向きの速さ speed で打ち上げたときに届く高さ（空気の抵抗込み）。
    // 抵抗が速さに比例するとき h = v/k − (g/k²)·ln(1 + k·v/g)。抵抗 0 なら v²/2g
    _riseHeight(speed, gravity) {
        const k = this.AIR_DRAG;
        if (k <= 0) return speed * speed / (2 * gravity);
        return speed / k - (gravity / (k * k)) * Math.log(1 + k * speed / gravity);
    }

    // height まで届く打ち上げの速さ。_riseHeight の逆を二分探索で求める（式で解けないため）
    _launchSpeed(height, gravity) {
        let low = 0;
        let high = gravity;     // 届かなければ倍にしていく
        while (this._riseHeight(high, gravity) < height) high *= 2;
        for (let i = 0; i < 40; i++) {
            const mid = (low + high) / 2;
            if (this._riseHeight(mid, gravity) < height) low = mid;
            else high = mid;
        }
        return high;
    }

    // **床・壁との当たり判定はふくらむ前の半径。**拍の頭で少し壁にめり込むのは「つぶれる」見え方として許している
    _updatePhysics() {
        const now = performance.now();
        const dt = this.lastMs === null ? 0 : Math.min((now - this.lastMs) / 1000, this.MAX_DT);
        this.lastMs = now;

        const gravity = this._gravity();

        this._kickOnBar(gravity);

        // フレームの間隔を MAX_STEP 以下に分けて進める。fps が落ちても同じ動きになる
        const steps = Math.max(1, Math.ceil(dt / this.MAX_STEP));
        for (let i = 0; i < steps; i++) this._step(dt / steps, gravity);
    }

    // 球どうしの当たり判定は無いので、1個ずつ独立に動かすだけ
    _step(dt, gravity) {
        for (const ball of this.balls) {
            this._move(ball, dt, gravity);
            this._rotate(ball, dt);
        }
    }

    // 1つの球を動かして、壁・天井・床で跳ね返す。ぶつかった面とのこすれで回転も変わる
    _move(ball, dt, gravity) {
        const floor = this.pg.height - ball.radius;

        // 中央の範囲の外に出ていたら、その分だけ中央へ戻す力を掛ける（空中でも床でも）
        const offset = ball.x - this.pg.width / 2;
        const zone = this.pg.width * this.CENTER_ZONE_RATIO;
        const excess = Math.sign(offset) * Math.max(0, Math.abs(offset) - zone);
        ball.vx -= this.CENTER_PULL * excess * dt;

        // 床に置いている間は転がるだけ。**滑らずに転がる状態へ寄せつつ**、転がりの抵抗で止まっていく
        const resting = ball.y >= floor && ball.vy === 0;
        if (resting) {
            this._frictionWithSurface(ball, [0, -1, 0], 1 - Math.exp(-this.ROLL_GRIP_RATE * dt));
            const damping = Math.exp(-this.ROLL_DAMPING * dt);
            ball.vx *= damping;
            ball.w = ball.w.map((v) => v * damping);
        } else {
            ball.vy += gravity * dt;

            // 空気の抵抗。速さと回転に比例したブレーキで、ふわっと漂う
            const drag = Math.exp(-this.AIR_DRAG * dt);
            ball.vx *= drag;
            ball.vy *= drag;
            const spinDrag = Math.exp(-this.SPIN_DRAG * dt);
            ball.w = ball.w.map((v) => v * spinDrag);
        }
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // 左右の壁（法線は球の側を向く向き）
        if (ball.x < ball.radius) {
            ball.x = ball.radius;
            ball.vx = Math.abs(ball.vx) * this.WALL_RESTITUTION;
            this._frictionWithSurface(ball, [1, 0, 0], this.WALL_GRIP);
        } else if (ball.x > this.pg.width - ball.radius) {
            ball.x = this.pg.width - ball.radius;
            ball.vx = -Math.abs(ball.vx) * this.WALL_RESTITUTION;
            this._frictionWithSurface(ball, [-1, 0, 0], this.WALL_GRIP);
        }

        // 天井
        if (ball.y < ball.radius) {
            ball.y = ball.radius;
            ball.vy = Math.abs(ball.vy) * this.WALL_RESTITUTION;
            this._frictionWithSurface(ball, [0, 1, 0], this.WALL_GRIP);
        }

        // 床。跳ねる高さが小さくなったら床に置いて止める（細かい跳ねを延々と続けない）
        if (ball.y > floor) {
            ball.y = floor;
            ball.vy = -Math.abs(ball.vy) * this.FLOOR_RESTITUTION;
            this._frictionWithSurface(ball, [0, -1, 0], this.WALL_GRIP);

            const bounceHeight = this._riseHeight(Math.abs(ball.vy), gravity);
            if (bounceHeight < this.pg.height * this.REST_HEIGHT_RATIO) ball.vy = 0;
        }
    }

    // 動かない面（床・壁・天井）とのこすれ。n は面から球の中心へ向かう向き。
    // 接している点の速さ（球の速さ ＋ 回転による速さ）の、面に沿った成分を grip の割合だけ打ち消す。
    // 打ち消す力は球の進みと回転の両方に掛かる（中身の詰まった球なので 2/7 が進み、残りが回転へ）
    _frictionWithSurface(ball, n, grip) {
        const contact = n.map((v) => -v * ball.radius);         // 中心から接点へ
        const slip = this._tangent(this._pointVelocity(ball, contact), n);

        // 接点の滑りをちょうど止める力積は 滑り × 2m/7
        const impulse = slip.map((v) => -v * grip * 2 * ball.mass / 7);
        this._applyImpulse(ball, contact, impulse);
    }

    // 中心から contact だけ離れた点が動く速さ = 球の速さ ＋ ω × contact
    _pointVelocity(ball, contact) {
        const spin = this._cross(ball.w, contact);
        return [ball.vx + spin[0], ball.vy + spin[1], spin[2]];
    }

    // 力積を contact の点に加える。進み（x・y）と回転の両方が変わる。
    // **画面の奥行き方向（z）の進みは捨てる**（球は画面の中だけを動く）。回転には効かせる
    _applyImpulse(ball, contact, impulse) {
        ball.vx += impulse[0] / ball.mass;
        ball.vy += impulse[1] / ball.mass;
        const torque = this._cross(contact, impulse);
        ball.w = ball.w.map((v, i) => v + torque[i] / ball.inertia);
    }

    // 角速度ぶん向きを回す。ω は画面（世界）の座標で持っているので、今の向きの左から掛ける
    _rotate(ball, dt) {
        const speed = Math.hypot(ball.w[0], ball.w[1], ball.w[2]);
        if (speed === 0) return;

        const axis = ball.w.map((v) => v / speed);
        ball.q = this._quatNormalize(this._quatMultiply(this._quatFromAxisAngle(axis, speed * dt), ball.q));
    }

    // 到達できる高さが小さくなっている球を、**次の小節の頭で**跳ね上げる。
    // 小節番号が変わった瞬間だけを見る（Scene09 の _shuffleOnBeat() と同じ書き方）
    _kickOnBar(gravity) {
        const bar = Math.floor(this.beats() / tempoManager.BEATS_PER_BAR);
        const barChanged = this.lastBar !== null && bar !== this.lastBar;
        this.lastBar = bar;
        if (!barChanged) return;

        // 床からの高さ ＋ 上向きの速さで届く高さ。これが小さい（勢いの落ちている）球から順に選ぶ
        const reachOf = (ball) => (this.pg.height - ball.radius - ball.y)
            + (ball.vy < 0 ? this._riseHeight(-ball.vy, gravity) : 0);
        const candidates = this.balls
            .filter((ball) => reachOf(ball) < this.pg.height * this.KICK_THRESHOLD_RATIO)
            .sort((a, b) => reachOf(a) - reachOf(b))
            .slice(0, this.KICK_MAX_PER_BAR);

        for (const ball of candidates) {
            const floor = this.pg.height - ball.radius;
            const room = floor - ball.radius;       // 床から天井までの距離
            const ratio = this.KICK_HEIGHT_MIN + Math.random() * (this.KICK_HEIGHT_MAX - this.KICK_HEIGHT_MIN);
            // 空気の抵抗があるので、狙った高さに届く速さを逆算して打ち上げる
            ball.vy = -this._launchSpeed(room * ratio, gravity);
            ball.vx = this._sideSpeedTowardCenter(ball);
        }
    }

    // 中央の範囲の外にいる球は中央へ向けて、中にいる球は左右どちらかへランダムに跳ね上げる
    _sideSpeedTowardCenter(ball) {
        const speed = Math.abs(this._sideSpeed());
        const offset = ball.x - this.pg.width / 2;
        if (Math.abs(offset) <= this.pg.width * this.CENTER_ZONE_RATIO) return this._sideSpeed();
        return -Math.sign(offset) * speed;
    }

    // ---- ベクトルと四元数 ----

    _cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ];
    }

    // v から n 方向の成分を除いた、面に沿った成分
    _tangent(v, n) {
        const along = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
        return v.map((value, i) => value - along * n[i]);
    }

    _normalize(v) {
        const length = Math.hypot(v[0], v[1], v[2]) || 1;
        return v.map((value) => value / length);
    }

    // 四元数は [w, x, y, z]
    _quatFromAxisAngle(axis, angle) {
        const s = Math.sin(angle / 2);
        return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
    }

    _quatMultiply(a, b) {
        return [
            a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
            a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
            a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
            a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
        ];
    }

    _quatNormalize(q) {
        const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        return q.map((value) => value / length);
    }

    // p5 の rotate(angle, axis) に渡す形へ。回っていなければ角度 0
    _quatToAxisAngle(q) {
        const w = Math.min(1, Math.max(-1, q[0]));
        const angle = 2 * Math.acos(w);
        const s = Math.sqrt(1 - w * w);
        if (s < 1e-6) return [0, [0, 1, 0]];
        return [angle, [q[1] / s, q[2] / s, q[3] / s]];
    }
}
