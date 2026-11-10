// ストリングアート
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 0:35〜1:25 ごろの映像。
// **平面に引いた直線だけで立体に見せている。**直線の束が曲線の輪郭（包絡線）を作り、
// 点の間隔が端ほど詰まるので格子のマスが奥へ縮んで見える。
//
// **点の位置を関数で決める。**三角形の外周を1周 0〜1 の輪とみなし、線 i は
//   外周の位置 i/N の点  と  m·(i/N) + c の点
// を結ぶ（円の上で「i と 2i を結ぶ」と心臓形が浮かぶ掛け算表と同じ考え方）。線の組を2つ重ね、
// それぞれの m と c で形が決まる。**m と c を少しずつ動かすと、すべての線の端点が辺の上を滑り、
// 形が途切れずに次の形へ変わっていく**（2026-11-01 本人「フェードではなく線が移動して切り替わるように」）。
//
//   m = 1, c = 1/3   各辺の点を隣の辺の同じ位置と結ぶ → 3つの角に曲線の輪郭、真ん中に穴（目）
//   m = −1          外周を折り返して結ぶ → 平行な線（網・竪琴）
//   m = 2, 3 ...    外周を何周もする → 輪郭が増えて複雑な模様
//
// 外周はどこで切っても輪なので、位置を 1 で割った余りを取っても点は飛ばない（線は連続して動く）。
// 形の一覧は PRESETS。自動では小節ごとに次の形へ、TRANSITION_BEATS 拍かけて m と c を動かす。
// ROTATE_BARS を入れると、形を変えないあいだも外周の上をゆっくり回る（左右対称は崩れる）。
//
// 2026-11-01 に3回作り直した（平面で3つの角を結ぶだけ → 本物の3次元の糸 → 平面の線の組を
// フェードで切替 → 今の関数の形）。背景は黒（本人の指定）。
//
// キー: A 自動 / S 塔 / D 目 / F アーチ / G 網 / H 放射（選ぶと線が滑って移る）
class Scene05 extends BaseScene {
    constructor() {
        super();                        // 2D。線のアンチエイリアスが効く

        this.title = 'ストリングアート';

        // 形。線の組を2つ重ねる。1組目が [m, c]、**2組目はその鏡写し [m, −c]**（頂点を通る縦の軸で
        // 左右に折り返したもの）。だから形も、移り変わりの途中も、必ず左右対称になる。
        // 並び順が自動で移っていく順番（端で折り返す）
        this.PRESETS = [
            { name: '塔', m: 1, c: 1 / 2 },            // 元映像 0:35・1:00
            { name: '目', m: 1, c: 1 / 3 },            // 0:50
            { name: 'アーチ', m: 1, c: 1 / 6 },        // 0:45（大きく空いた穴）
            { name: '網', m: -1, c: 1 / 4 },           // 1:20〜1:25（ひし形の網）
            { name: '放射', m: -2, c: 1 / 2 },         // 1:15（頂点へ集まる線と横の線。遠近のある床のよう）
        ];
        this.modes = {
            keys: ['A', 'S', 'D', 'F', 'G', 'H'],
            labels: ['自動'].concat(this.PRESETS.map((preset) => preset.name)),
        };

        // ---- 動き ----
        this.HOLD_BARS = 2;             // 自動のとき、1つの形にとどまる小節数
        this.TRANSITION_BEATS = 8;      // 次の形へ線が滑って移るのにかける拍数（2小節）
        this.TRANSITION_BEATS_PER_M = 8;    // m が 1 変わるごとに足す拍数（アーチ → 網は m が 2 変わるので 24 拍）
        // 外周の上を1周回るのにかける小節数。0 で回らない。回すと左右対称が崩れるので既定は 0
        this.ROTATE_BARS = 0;

        // ---- 三角形（線を結ぶ土台。元映像のピラミッド型の画面と同じ形）----
        // **三角形の外枠の線は描かない**（2026-11-01 本人「四角いモニターを使うので三角形の枠は要らない」）。
        // 線の結び方・形・動きは三角形の外周の上のまま
        this.TRI_TOP = 0.05;            // 頂点の高さ（画面の高さ比。上から）
        this.TRI_BOTTOM = 0.97;         // 底辺の高さ
        this.TRI_BASE_RATIO = 1.8;      // 底辺の長さ ÷ 高さ

        // ---- 線 ----
        this.LINES_PER_SET = 72;        // 1組の線の本数
        this.SPACING_POWER = 1.35;      // 辺の上の点の間隔のかたより。大きいほど角に詰まって奥行きが出る
        this.LINE_WEIGHT = 2;           // 芯の太さ（ピクセル）
        this.GLOW_WEIGHT = 6;           // にじみの太さ
        this.LINE_COLOR = [232, 234, 255];      // 少し青みのある白
        this.LINE_ALPHA = 220;
        this.GLOW_ALPHA = 40;
        this.BG_COLOR = 0;              // 黒（本人の指定）
        // 線を、結んだ2点を通る直線として画面の端まで伸ばす（2026-11-01 本人の指定）。
        // 形と動きは変わらず、三角形の外まで線が続く。false で2点のあいだだけを引く
        this.EXTEND_LINES = true;

        // ---- 光の粒（線の上を流れる）----
        this.BEAD_BEATS = 2;            // 粒が線の端から端まで流れるのにかける拍数
        this.BEAD_SIZE = 4;
        this.BEAD_GLOW = 11;

        // ---- 拍 ----
        this.BEAT_FLASH = 0.45;
        this.BEAT_SHARPNESS = 4;

        // 手動で選んだときの移り変わり: 形 from → to を startBeat から
        this.tween = null;
        this.current = this.PRESETS[0];     // 今の形 { m, c }（移り変わりの途中も含む）
    }

    draw(spectrum) {
        const pg = this.pg;
        pg.background(this.BG_COLOR);

        const shape = this._currentShape();
        this.current = shape;
        const corners = this._corners();
        const rotate = this.ROTATE_BARS > 0 ? this.beats() / (this.ROTATE_BARS * tempoManager.BEATS_PER_BAR) : 0;
        const flash = Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS) * this.BEAT_FLASH;

        // 1組目 [m, c] と、その鏡写しの2組目 [m, −c]
        const lines = [];
        [shape.c, -shape.c].forEach((c, k) => {
            for (let i = 0; i < this.LINES_PER_SET; i++) {
                // 頂点を中心に −0.5〜0.5 で数える。m が変わったとき端点が走る距離が |a| に比例するので、
                // 0〜1 で数えるより遠い側の走りが半分で済む。左右で対称にもなる。
                // 2組目は −a 側から数えて鏡写しにする
                const a = (i + 0.5) / this.LINES_PER_SET - 0.5;
                const a2 = k === 0 ? a : -a;
                lines.push([this._perimeter(a2 + rotate, corners), this._perimeter(shape.m * a2 + c + rotate, corners)]);
            }
        });

        this._drawLines(lines, flash);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }

    // 形を選んだら、今の形から線を滑らせて移る
    onModeChanged(index) {
        if (index === 0) {
            this.tween = null;
            return;
        }
        this.tween = { from: this.current, to: this.PRESETS[index - 1], startBeat: this.beats() };
    }

    // ---- 形 ----

    _currentShape() {
        if (this.modeIndex === 0) return this._autoShape();

        const target = this.PRESETS[this.modeIndex - 1];
        if (!this.tween) return target;
        const t = (this.beats() - this.tween.startBeat) / this._transitionBeats(this.tween.from, this.tween.to);
        if (t >= 1) {
            this.tween = null;
            return target;
        }
        return this._mixShape(this.tween.from, this.tween.to, this._ease(t));
    }

    // 自動: HOLD_BARS 小節とどまり、次の形へ移る。拍で数えるので曲に乗る。
    // **m が変わる移り方は、変わる量に比例して長くかける**（_transitionBeats）。端点の走る速さを抑えるため
    _autoShape() {
        const holdBeats = this.HOLD_BARS * tempoManager.BEATS_PER_BAR;
        const steps = (this.PRESETS.length - 1) * 2;        // 往復1回ぶんの移り変わりの数
        const durations = [];
        for (let k = 0; k < steps; k++) {
            const from = this.PRESETS[this._pingPong(k)];
            const to = this.PRESETS[this._pingPong(k + 1)];
            durations.push(holdBeats + this._transitionBeats(from, to));
        }
        const period = durations.reduce((sum, d) => sum + d, 0);

        let within = this._mod(this.beats(), period);
        let k = 0;
        while (within >= durations[k]) {
            within -= durations[k];
            k++;
        }
        const current = this.PRESETS[this._pingPong(k)];
        const next = this.PRESETS[this._pingPong(k + 1)];
        if (within <= holdBeats) return current;
        return this._mixShape(current, next, this._ease((within - holdBeats) / (durations[k] - holdBeats)));
    }

    // 形 from から to へ移る拍数。m の変わる量 1 につき TRANSITION_BEATS_PER_M を足す
    _transitionBeats(from, to) {
        return this.TRANSITION_BEATS + Math.abs(to.m - from.m) * this.TRANSITION_BEATS_PER_M;
    }

    // m はそのまま、c は外周の上で近いほうの向きへ回して混ぜる（遠回りすると線が大きく暴れる）
    _mixShape(from, to, t) {
        let dc = this._mod(to.c - from.c, 1);
        if (dc > 0.5) dc -= 1;
        return { m: from.m + (to.m - from.m) * t, c: from.c + dc * t };
    }

    // ---- 外周 ----

    // 頂点・左下・右下。底辺が画面の幅を超えるときは幅に収める
    _corners() {
        const w = this.pg.width;
        const h = this.pg.height;
        const top = h * this.TRI_TOP;
        const bottom = h * this.TRI_BOTTOM;
        const halfBase = Math.min((bottom - top) * this.TRI_BASE_RATIO / 2, w / 2);
        return [
            { x: w / 2, y: top },
            { x: w / 2 - halfBase, y: bottom },
            { x: w / 2 + halfBase, y: bottom },
        ];
    }

    // 外周の位置 s（1 で1周）の点。頂点 → 左下 → 右下 → 頂点 の順。各辺を 1/3 ずつに割り当て、
    // 辺の中では角に近いほど点が詰まるようにかたよらせる
    _perimeter(s, corners) {
        const u = this._mod(s, 1) * 3;
        const edge = Math.min(2, Math.floor(u));
        const t = this._spacing(u - edge);
        const p = corners[edge];
        const q = corners[(edge + 1) % 3];
        return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }

    _spacing(t) {
        const k = this.SPACING_POWER;
        return t < 0.5 ? 0.5 * Math.pow(t * 2, k) : 1 - 0.5 * Math.pow((1 - t) * 2, k);
    }

    // ---- 描画 ----

    _drawLines(lines, flash) {
        const pg = this.pg;
        const [r, g, b] = this.LINE_COLOR;
        const lift = (v) => v + (255 - v) * flash;

        // 引く線（伸ばすときは画面の端まで）。光の粒は元の2点のあいだを流れる
        const drawn = this.EXTEND_LINES ? lines.map(([p, q]) => this._extend(p, q)) : lines;

        // にじみ → 芯
        pg.stroke(r, g, b, this.GLOW_ALPHA);
        pg.strokeWeight(this.GLOW_WEIGHT);
        for (const [p, q] of drawn) pg.line(p.x, p.y, q.x, q.y);
        pg.stroke(lift(r), lift(g), lift(b), this.LINE_ALPHA);
        pg.strokeWeight(this.LINE_WEIGHT);
        for (const [p, q] of drawn) pg.line(p.x, p.y, q.x, q.y);

        // 線の上を流れる光の粒
        const travel = this.beats() / this.BEAD_BEATS;
        pg.noStroke();
        lines.forEach(([p, q], i) => {
            const t = this._fract(travel + this._hash(i));
            const x = p.x + (q.x - p.x) * t;
            const y = p.y + (q.y - p.y) * t;
            pg.fill(r, g, b, 60);
            pg.circle(x, y, this.BEAD_GLOW);
            pg.fill(255);
            pg.circle(x, y, this.BEAD_SIZE);
        });
    }

    // 0, 1, 2, 3, 4, 3, 2, 1, 0, 1, ... と端で折り返す番号
    _pingPong(index) {
        const last = this.PRESETS.length - 1;
        const k = this._mod(index, last * 2);
        return k <= last ? k : last * 2 - k;
    }

    // p と q を通る直線を、画面の対角線ぶん両側へ伸ばす（画面の外は描画で切れる）。
    // 2点が重なっている線は向きが決まらないので伸ばさない
    _extend(p, q) {
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.5) return [p, q];

        const reach = Math.hypot(this.pg.width, this.pg.height);
        const ux = dx / length * reach;
        const uy = dy / length * reach;
        return [{ x: p.x - ux, y: p.y - uy }, { x: q.x + ux, y: q.y + uy }];
    }

    _ease(t) {
        t = Math.min(1, Math.max(0, t));
        return t * t * (3 - 2 * t);
    }

    _hash(n) {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return s - Math.floor(s);
    }

    _fract(v) {
        return v - Math.floor(v);
    }

    _mod(n, m) {
        return ((n % m) + m) % m;
    }
}
