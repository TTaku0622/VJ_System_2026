// 幾何学シーン: 頂点が動いて幾何学模様になる
//
// 描くのは直線だけ。折れ線は使わない。
// 「頂点」を1つ置き、そこから2本の直線（レイ）を下向きに伸ばす。
// 角に見える部分は折れているのではなく、原点を共有した2本の直線の角度差。
//
//   レイA  外下へ 45 度。並ぶと Λ の稜線に平行な斜め線群になる
//   レイB  真下。並ぶと階段状の縦線になる
//
// 線は「動く頂点 → キャンバス端の固定点」を結ぶ線分として描く。
// 端の点は base の状態で一度決めたら動かさないので、画面の縁での線の位置が
// 固定される。頂点が動くと端が固定されているぶん角度が変わる。
//
// 頂点には2つの役割があり、稜線の並び順に1つおきで交互に割り当てる。
//
//   上へ動く頂点   上へ登りながら、少しだけ内側へも寄る
//   内側へ動く頂点 中央軸へ寄りながら、ほんの少しだけ上へも動く。
//                  内寄せが 1 を超えると軸を越えて反対側へ入り込む
//
// 役割が交互に並ぶので、動きの小さい側が骨組みとして残り、大きい側がその間に
// 食い込んで細かい交差が生まれる。
//
// 起点の頂点（軸上）は「内側へ動く」側に割り当てる（parityOffset = 1）。
// 軸上の頂点は内寄せで動かないため、外周の Λ が残って三角形の輪郭が保たれる。
//
// 音への反応は未実装（MIDI で後から付ける）。
//
// 参考: サカナクション SAKANAQUARIUM 2024 "turn" の base.jpg / 2.jpg を実測
//
// キー: Q リセット / W 自動進行 / A S 進行を手動で増減
//       Z X 上昇の距離 / R T 上昇の内側寄り / C D 内寄せの量
//       U 内寄せの上昇（段階切替） / O 役割の割り当てを反転
//       E 頂点の数 / Y 左右対称 / G 現在値をコンソールに出力
class Scene03 extends BaseScene {
    constructor() {
        super();                        // 2D。線のアンチエイリアスが効く

        this.title = '幾何学';

        // ---- base の形（base.jpg の実測値。角度は真下を 0、外向きを正とする） ----
        this.APEX_X = 0.5;              // 頂点列の起点（画面幅比）
        this.APEX_Y = 0.06;             // 頂点列の起点（画面高さ比）
        this.LOCUS_ANGLE = PI * 0.172;  // 頂点が並ぶ稜線の向き。真下から約31度
        this.RAY_A_ANGLE = PI * 0.25;   // レイAの角度。真下から45度
        this.PIN_SPACING = 0.116;       // 頂点の間隔（画面高さ比）

        // ---- アニメーション ----
        this.DEFAULT_RISE = 0.60;       // 上へ動く頂点の移動距離（画面高さ比）
        this.DEFAULT_RISE_INWARD = 0.35;// 登るときに軸へ引き寄せる割合（「少しだけ内側に」）
        this.DEFAULT_INWARD = 1.30;     // 内寄せの割合。1 を超えると軸を越えて交差する

        // 内側へ動く頂点にも足す上昇（画面高さ比）。U キーで段階的に切り替える。
        // 空きキーが1つしか無いので −/＋ ではなく循環にしている
        this.INWARD_RISE_LEVELS = [0, 0.05, 0.10, 0.18];
        this.inwardRiseIndex = 1;       // 既定は「ほんの少しだけ」

        this.PROGRESS_SPEED = 0.0022;   // 自動進行の速さ（1フレームあたり）
        this.PROGRESS_STEP = 0.05;      // A / S で手動操作する刻み

        // ---- 調整の刻みと範囲 ----
        this.RISE_STEP = 0.05;
        this.RISE_INWARD_STEP = 0.05;
        this.INWARD_STEP = 0.05;
        this.MIN_PINS = 4;
        this.MAX_PINS = 24;
        this.AXIS_EPSILON = 0.5;        // 軸上とみなす距離(px)

        // ---- 見た目 ----
        this.BG_COLOR = 0;              // 背景は黒
        this.LINE_COLOR = 255;          // 線は白
        this.LINE_ALPHA = 200;
        this.LINE_WEIGHT = 1.4;

        // ---- 状態 ----
        this.pinCount = 12;             // 片側。起点の頂点を含む
        this.progress = 0;              // 0.0（base）〜 1.0（動ききる）
        this.progressDir = 1;           // 自動進行の向き
        this.autoProgress = false;      // 既定は base で止めておく
        this.riseDistance = this.DEFAULT_RISE;
        this.riseInward = this.DEFAULT_RISE_INWARD;
        this.inwardFactor = this.DEFAULT_INWARD;
        this.parityOffset = 1;          // 1 なら起点が「内側へ動く」側
        this.mirrorEnabled = true;
    }

    setup() {
        this.pg.strokeCap(ROUND);
    }

    draw(spectrum) {
        this._updateProgress();

        const apexX = width * this.APEX_X;
        const apexY = height * this.APEX_Y;
        const step = this.PIN_SPACING * height;
        const t = this._smoothstep(this.progress);

        this.pg.background(this.BG_COLOR);
        this.pg.stroke(this.LINE_COLOR, this.LINE_ALPHA);
        this.pg.strokeWeight(this.LINE_WEIGHT);
        this.pg.noFill();

        for (let i = 0; i < this.pinCount; i++) {
            // base の頂点。端の固定点はこの位置から決めるので動かさない
            const d = i * step;
            const baseX = apexX + Math.sin(this.LOCUS_ANGLE) * d;
            const baseY = apexY + Math.cos(this.LOCUS_ANGLE) * d;
            const onAxis = Math.abs(baseX - apexX) < this.AXIS_EPSILON;

            // 動いた頂点。役割は並び順に1つおき
            let px = baseX;
            let py = baseY;
            if ((i + this.parityOffset) % 2 === 0) {
                // 上へ動く頂点。登りながら少しだけ内側へも寄る。
                // 引き寄せは軸からの距離に比例させるので、軸上の頂点は横に動かない
                py -= t * this.riseDistance * height;
                px -= (px - apexX) * t * this.riseInward;
            } else {
                // 内側へ動く頂点。1 を超えると軸を越えて反対側へ入り込む。
                // 寄りながらほんの少しだけ上へも動く
                px -= (px - apexX) * t * this.inwardFactor;
                py -= t * this.INWARD_RISE_LEVELS[this.inwardRiseIndex] * height;
            }

            this._drawToEdge(px, py, baseX, baseY, this.RAY_A_ANGLE, apexX, true);
            this._drawToEdge(px, py, baseX, baseY, 0, apexX, !onAxis);

            // 軸上の頂点は上端へも1本。中央の縦線を突き抜けさせるため
            if (onAxis) this._drawToEdge(px, py, baseX, baseY, PI, apexX, false);
        }
    }

    keyPressed(key) {
        const upperKey = String(key).toUpperCase();

        if (upperKey === 'Q') {                 // base に戻す
            this.progress = 0;
            this.progressDir = 1;
            this.autoProgress = false;
        }
        if (upperKey === 'W') {
            this.autoProgress = !this.autoProgress;
        }
        if (upperKey === 'A') {
            this.progress = constrain(this.progress - this.PROGRESS_STEP, 0, 1);
            this.autoProgress = false;
        }
        if (upperKey === 'S') {
            this.progress = constrain(this.progress + this.PROGRESS_STEP, 0, 1);
            this.autoProgress = false;
        }
        if (upperKey === 'Z') {
            this.riseDistance = max(0, this.riseDistance - this.RISE_STEP);
        }
        if (upperKey === 'X') {
            this.riseDistance += this.RISE_STEP;
        }
        if (upperKey === 'R') {                 // 上へ動く頂点の内側寄りを弱く
            this.riseInward = max(0, this.riseInward - this.RISE_INWARD_STEP);
        }
        if (upperKey === 'T') {                 // 上へ動く頂点の内側寄りを強く
            this.riseInward += this.RISE_INWARD_STEP;
        }
        if (upperKey === 'C') {
            this.inwardFactor = max(0, this.inwardFactor - this.INWARD_STEP);
        }
        if (upperKey === 'D') {
            this.inwardFactor += this.INWARD_STEP;
        }
        if (upperKey === 'U') {                 // 内側へ動く頂点の上昇を段階的に切替
            this.inwardRiseIndex = (this.inwardRiseIndex + 1) % this.INWARD_RISE_LEVELS.length;
        }
        if (upperKey === 'O') {                 // どちらの役割から始めるかを入れ替える
            this.parityOffset = 1 - this.parityOffset;
        }
        if (upperKey === 'E') {
            this.pinCount++;
            if (this.pinCount > this.MAX_PINS) this.pinCount = this.MIN_PINS;
        }
        if (upperKey === 'Y') {
            this.mirrorEnabled = !this.mirrorEnabled;
        }
        if (upperKey === 'G') {
            this._logSettings();
        }
    }

    // ---- 内部 ----

    // 動いた頂点から、base の頂点で決めた端の固定点へ線分を引く。
    // 端が固定されているので、頂点が動くと角度が変わる。
    // mirrorable が false のときは鏡像を描かない（軸上の縦線が重なるため）
    _drawToEdge(px, py, baseX, baseY, angle, apexX, mirrorable) {
        const anchor = this._edgeAnchor(baseX, baseY, angle);
        if (!anchor) return;

        this.pg.line(px, py, anchor.x, anchor.y);

        if (this.mirrorEnabled && mirrorable) {
            this.pg.line(2 * apexX - px, py, 2 * apexX - anchor.x, anchor.y);
        }
    }

    // (x, y) を通り angle 方向へ進む直線が、キャンバスから出ていく点。
    // スラブ法で矩形との交差区間を求め、その遠い側を返す。
    // 頂点がキャンバスの外にあっても正しく求まる。交差しなければ null。
    _edgeAnchor(x, y, angle) {
        const dx = Math.sin(angle);
        const dy = Math.cos(angle);
        let tNear = -Infinity;
        let tFar = Infinity;

        if (Math.abs(dx) < 1e-9) {
            if (x < 0 || x > width) return null;
        } else {
            let t1 = (0 - x) / dx;
            let t2 = (width - x) / dx;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tNear = max(tNear, t1);
            tFar = min(tFar, t2);
        }

        if (Math.abs(dy) < 1e-9) {
            if (y < 0 || y > height) return null;
        } else {
            let t1 = (0 - y) / dy;
            let t2 = (height - y) / dy;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tNear = max(tNear, t1);
            tFar = min(tFar, t2);
        }

        if (tFar < tNear || !isFinite(tFar)) return null;
        return { x: x + dx * tFar, y: y + dy * tFar };
    }

    // 自動進行。0 と 1 で折り返して往復する
    _updateProgress() {
        if (!this.autoProgress) return;

        this.progress += this.PROGRESS_SPEED * this.progressDir;
        if (this.progress >= 1) {
            this.progress = 1;
            this.progressDir = -1;
        } else if (this.progress <= 0) {
            this.progress = 0;
            this.progressDir = 1;
        }
    }

    // 調整した値を定数へ書き戻せるようにコンソールへ出す
    _logSettings() {
        console.log(
            `progress:     ${this.progress.toFixed(2)}\n` +
            `riseDistance: ${this.riseDistance.toFixed(2)}\n` +
            `riseInward:   ${this.riseInward.toFixed(2)}\n` +
            `inwardFactor: ${this.inwardFactor.toFixed(2)}\n` +
            `inwardRise:   ${this.INWARD_RISE_LEVELS[this.inwardRiseIndex].toFixed(2)}\n` +
            `parityOffset: ${this.parityOffset}\n` +
            `pinCount:     ${this.pinCount}`
        );
    }

    _smoothstep(t) {
        return t * t * (3 - 2 * t);
    }
}
