// 音でどくどくする格子
//
// Life is Tech! の課題「リピーター２」をオリジナル化したものの移植。
// 格子状に並んだ四角が、音に合わせて大きさと枠の太さを変える。
//
// 仕掛けは3つ:
//   自動ゲイン    直近の平均と最大を覚えておき、音量差に関係なく 0〜1 に伸ばす
//   非対称の追従  大きくなる時は速く、戻る時はゆっくり。心臓の鼓動っぽくする
//   遅延参照      脈の履歴をためて、中心から遠いマスほど古い値を見る。波が外へ広がる
//
// 大きさ用の脈（pulse）と枠の太さ用の脈（edge）はわざと速さを変えてある。
// 同じ値を使うと「ふくらむ＝太くなる」で単調になるため。
class Scene07 extends BaseScene {
    constructor() {
        super();

        this.title = 'どくどく格子';

        // ---- 音の取り方 ----
        this.BASS_GAIN = 0.8;           // 低音（キック・ベース）の混ぜる量
        this.LEVEL_GAIN = 2.0;          // 全体音量の混ぜる量
        this.AVG_SMOOTHING = 0.02;      // 直近平均の追従。小さいほど長い時間で平均する
        this.MAX_DECAY = 0.997;         // 最大値の減衰。静かになると基準が下がってくる
        this.MAX_FLOOR = 0.02;          // 最大値の下限。長い無音で 0 に落ちて計算が壊れるのを防ぐ
        this.FLOOR_RATIO = 0.7;         // 平均のこの割合を下限にする（小さい音を切る）

        // 立ち上がりは速く、戻りはゆっくり
        this.PULSE_ATTACK = 0.5;
        this.PULSE_RELEASE = 0.10;
        // 枠の太さ用。大きさよりも行き帰りを速くしてタイミングをずらす
        this.EDGE_ATTACK = 0.85;
        this.EDGE_RELEASE = 0.30;

        // ---- 格子 ----
        // マスの間隔は画面の高さ基準。元は 500px に 6 マス（= 高さの 1/6.25）だった
        this.CELLS_IN_HEIGHT = 6.25;
        this.EXTRA_COLUMNS = 2;         // 画面外に余分に描く列数（全体拡大で端が欠けないように）

        // 四角3枚ひと組の大きさ。マスの間隔に対する比率で、**これを下げるとセット同士の
        // 余白だけが広がる**（形と音への反応は変わらない）。1.0 で最大時に隣とほぼ接する
        this.SET_SCALE = 0.8;

        // 以下は SET_SCALE をかけた大きさに対する比率。
        // 最大でも合計 0.975 に収めて、いちばんふくらんだ時も隣とぶつからないようにする
        this.SIZE_MIN_RATIO = 0.125;    // いちばん小さい時の一辺
        this.SIZE_RANGE_RATIO = 0.5;    // 脈で増える一辺
        this.WEIGHT_MIN_RATIO = 0.025;  // いちばん細い時の枠
        this.WEIGHT_RANGE_RATIO = 0.325;// 脈で増える枠

        this.WAVE_SPEED_RATIO = 0.15;   // 波の伝わる速さ。間隔に対する1フレームの距離
        this.ZOOM_RANGE = 0.04;         // 画面ぜんたいのふくらみ

        // ---- 色 ----
        // 色相を時間で回すので HSB で扱う（元は RGB で stroke(255, x / 2, y / 2) 固定だった）。
        // 位置による色の差は元と同じ幅にしてある：横に赤→黄で 52 度、縦に赤→マゼンタで -60 度
        this.HUE_SPEED = 0.3;           // 1フレームに回す色相（度）。60fps で約 20 秒に一周
        this.HUE_SPREAD_X = 52;         // 左右の色相差
        this.HUE_SPREAD_Y = -60;        // 上下の色相差
        this.SAT_NEAR = 90;             // 左上の濃さ
        this.SAT_FAR = 12;              // 右下の濃さ（元はここが白っぽかった）
        this.BRIGHTNESS = 100;
        this.ALPHA_MIN = 30;
        this.ALPHA_MAX = 255;
        this.OUTER_SHADE = 0.45;        // いちばん外側の暗さ。中の四角と見分けるために落とす
        this.BG_COLOR = 0;              // 背景

        // ---- 状態 ----
        this.pulse = 0;
        this.edge = 0;
        this.baseHue = 0;               // 全体の色相。毎フレーム回る
        this.rawAvg = 0;
        this.rawMax = 0.1;
        this.history = [];
        this.edgeHistory = [];

        this.step = 0;
        this.unit = 0;
        this.columns = 0;
        this.rows = 0;
        this.originX = 0;
        this.originY = 0;
        this.waveStep = 1;
        this.historyLength = 60;
    }

    setup() {
        // 四角形を中心基準で置く（x, y が中心座標になる）
        this.pg.rectMode(CENTER);

        // 3枚の四角を重ねて描くので、線は使わず塗りだけで作る
        this.pg.noStroke();

        // 色相・彩度・明度・不透明度の順。不透明度だけ 0〜255 のままにしておく
        this.pg.colorMode(HSB, 360, 100, 100, 255);

        this._layout();
    }

    // 画面サイズから格子の間隔と数を決める
    _layout() {
        this.step = this.pg.height / this.CELLS_IN_HEIGHT;
        this.columns = Math.ceil(this.pg.width / this.step) + this.EXTRA_COLUMNS;
        this.rows = Math.ceil(this.pg.height / this.step) + this.EXTRA_COLUMNS;

        // 中心にマスが来るように左上を決める（波の中心をそろえるため）
        this.originX = this.pg.width / 2 - (this.columns - 1) * this.step / 2;
        this.originY = this.pg.height / 2 - (this.rows - 1) * this.step / 2;

        // セット1つぶんの基準の大きさ。間隔より小さくしたぶんが、セット同士の余白になる
        this.unit = this.step * this.SET_SCALE;

        this.waveStep = this.step * this.WAVE_SPEED_RATIO;

        // いちばん遠い角まで波が届く長さを確保する。
        // 足りないと外周のマスが同じ値を見て、そこだけ動きがそろってしまう
        const corner = Math.hypot(this.pg.width, this.pg.height) / 2;
        this.historyLength = Math.ceil(corner / this.waveStep) + 2;
    }

    draw(spectrum) {
        this._updatePulse(spectrum);

        // 色相は音では変えない。無音でも色だけは移り変わっていく
        this.baseHue = (this.baseHue + this.HUE_SPEED) % 360;

        this.pg.background(this.BG_COLOR);

        this.pg.push();
        // 画面ぜんたいも脈に合わせて少しふくらませる
        this.pg.translate(this.pg.width / 2, this.pg.height / 2);
        this.pg.scale(1 + this.pulse * this.ZOOM_RANGE);
        this.pg.translate(-this.pg.width / 2, -this.pg.height / 2);

        for (let j = 0; j < this.rows; j++) {
            for (let i = 0; i < this.columns; i++) {
                this._drawCell(i, j);
            }
        }
        this.pg.pop();
    }

    // 音から脈（pulse / edge）を作り、履歴に積む
    _updatePulse(spectrum) {
        const raw = this.bass(spectrum) * this.BASS_GAIN + this.level(spectrum) * this.LEVEL_GAIN;

        // 直近の平均と最大を覚えておく。こうすると音源の音量が大きくても小さくても合う
        this.rawAvg = lerp(this.rawAvg, raw, this.AVG_SMOOTHING);
        this.rawMax = Math.max(raw, this.rawMax * this.MAX_DECAY, this.MAX_FLOOR);

        // 平均の少し下から最大までを 0〜1 に引きのばす
        const target = constrain(map(raw, this.rawAvg * this.FLOOR_RATIO, this.rawMax, 0, 1), 0, 1);

        this.pulse = lerp(this.pulse, target,
            target > this.pulse ? this.PULSE_ATTACK : this.PULSE_RELEASE);
        this.edge = lerp(this.edge, target,
            target > this.edge ? this.EDGE_ATTACK : this.EDGE_RELEASE);

        // 新しい値を先頭に積む。古いものは捨てる
        this.history.unshift(this.pulse);
        this.edgeHistory.unshift(this.edge);
        if (this.history.length > this.historyLength) {
            this.history.pop();
            this.edgeHistory.pop();
        }
    }

    // 格子1マスを描く
    _drawCell(i, j) {
        const x = this.originX + i * this.step;
        const y = this.originY + j * this.step;

        // 中心から遠いマスほど古い値を見る＝おくれてどくどくする
        const distance = dist(x, y, this.pg.width / 2, this.pg.height / 2);
        const delay = Math.min(Math.floor(distance / this.waveStep), this.history.length - 1);
        const p = this.history[delay];
        const e = this.edgeHistory[delay];

        // 色は位置で決める。そこへ baseHue を足すので、グラデを保ったまま全体が移り変わる。
        // 画面外にはみ出すマスは範囲を超えるので、端の色で止める
        const ratioX = constrain(x / this.pg.width, 0, 1);
        const ratioY = constrain(y / this.pg.height, 0, 1);
        // 引き算で負になることがあるので 360 を足してから剰余をとる
        const hue = (this.baseHue + ratioX * this.HUE_SPREAD_X
            + ratioY * this.HUE_SPREAD_Y + 360) % 360;
        const saturation = lerp(this.SAT_NEAR, this.SAT_FAR, (ratioX + ratioY) / 2);
        const alpha = map(p, 0, 1, this.ALPHA_MIN, this.ALPHA_MAX);

        const size = this.unit * (this.SIZE_MIN_RATIO + p * this.SIZE_RANGE_RATIO);
        // e を2乗して、細い時はうんと細く、太い時だけ太くする
        const band = this.unit * (this.WEIGHT_MIN_RATIO + e * e * this.WEIGHT_RANGE_RATIO);

        // 四角を3枚、外から内へすきまなく重ねる。
        // 元は太い線を1本引いて、線が白い面に食いこむぶんで内外に濃淡が出ていた。
        // それだと濃さを調整できないので、同じ3層を**別々の四角として描いている**。
        // 大きさは元と同じ（外 = size + band / 中 = size / 内 = size - band）
        this.pg.fill(hue, saturation, this.BRIGHTNESS * this.OUTER_SHADE, alpha);
        this.pg.rect(x, y, size + band, size + band);

        this.pg.fill(hue, saturation, this.BRIGHTNESS, alpha);
        this.pg.rect(x, y, size, size);

        // 脈がずれて線が四角より太くなることがあるので、負の大きさにしない
        const inner = Math.max(size - band, 0);
        this.pg.fill(0, 0, this.BRIGHTNESS);        // いちばん内側は白のまま
        this.pg.rect(x, y, inner, inner);
    }

    keyPressed(key) { }
}
