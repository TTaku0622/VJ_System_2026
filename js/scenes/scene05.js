// 回転する四角のトンネル
//
// 中心から生まれた四角が、1枚ごとに少しずつ回りながら外へ広がっていく。
// 動きは3つ:
//   全体の回転  一定速度で回り続ける。音では変えない（無音でも止まらないように）
//   外への流れ  音が大きいほど速く流れる
//   ひねり      1枚ごとの回転差。音が大きいほど渦が締まる
//
// 四角の大きさは中心（0）から等間隔なので、流れが四角1枚ぶん進むと元と同じ形に戻る。
// つまり **継ぎ目なくループする**。中心で生まれる数枚だけ薄くして、湧き出す瞬間を隠している。
class Scene05 extends BaseScene {
    constructor() {
        super();

        this.title = '回転する四角';

        this.SIZE_STEP = 60;            // 1枚ごとに広がる量（四角同士の間隔）
        this.STROKE_WEIGHT = 1;
        this.EXTRA_RINGS = 2;           // 画面外に余分に描く枚数（縁で途切れないように）
        this.FADE_IN_RINGS = 2;         // 中心から生まれる何枚を薄くするか（継ぎ目隠し）

        // ---- 動き ----
        this.SPIN_SPEED = 0.002;        // 全体が回り続ける速さ。音では変えない
        this.FLOW_QUIET = 0.004;        // 無音時に外へ流れる速さ（0 にすると止まる）
        this.FLOW_LOUD = 0.020;         // 大音量時の流れる速さ
        this.TWIST_QUIET = 0.030;       // 無音時のひねり（1枚ごとの回転差）
        this.TWIST_LOUD = 0.110;        // 大音量時のひねり。渦が締まる
        this.LEVEL_FULL = 0.5;          // この音量で LOUD 側へ振り切る
        this.LEVEL_SMOOTHING = 0.12;    // 音量の追従の速さ（小さいほど滑らか）

        this.spin = 0;
        this.flowPhase = 0;
        this.smoothedLevel = 0;
        this.ringCount = 0;
    }

    setup() {
        this.pg.noFill();
        // 四角形を中心基準で置く（x, y が中心座標になる）
        this.pg.rectMode(CENTER);

        // 画面を覆いきるまで描けば十分。それ以上は見えないので枚数を決め打ちしない。
        // 回転しても中心から辺までの距離は一辺の半分のままなので、
        // 一辺が画面の対角線に達すればどんな角度でも四隅まで覆える
        const diagonal = Math.hypot(this.pg.width, this.pg.height);
        this.ringCount = Math.ceil(diagonal / this.SIZE_STEP) + this.EXTRA_RINGS;
    }

    draw(spectrum) {
        this.smoothedLevel += (this.level(spectrum) - this.smoothedLevel) * this.LEVEL_SMOOTHING;
        const loudness = constrain(this.smoothedLevel / this.LEVEL_FULL, 0, 1);
        const twist = lerp(this.TWIST_QUIET, this.TWIST_LOUD, loudness);

        this.spin += this.SPIN_SPEED;
        // 1 進むと四角1枚ぶんずれて元と同じ形に戻るので、剰余で巻き戻してよい
        this.flowPhase = (this.flowPhase + lerp(this.FLOW_QUIET, this.FLOW_LOUD, loudness)) % 1;

        this.pg.background(0);
        this.pg.strokeWeight(this.STROKE_WEIGHT);

        this.pg.push();
        this.pg.translate(this.pg.width / 2, this.pg.height / 2);
        // 流れたぶんもここで回しておく。そうしないとループの継ぎ目で角度が飛ぶ
        this.pg.rotate(this.spin + this.flowPhase * twist);

        for (let i = 0; i < this.ringCount; i++) {
            const ring = i + this.flowPhase;     // 中心からの位置。0 が中心
            const size = ring * this.SIZE_STEP;

            this.pg.rotate(twist);
            this.pg.stroke(255, Math.min(ring / this.FADE_IN_RINGS, 1) * 255);
            this.pg.rect(0, 0, size, size);
        }
        this.pg.pop();
    }

    keyPressed(key) { }
}
