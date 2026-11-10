// 立方体の格子（名前 'cubes'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番。床に並んだ四角い柱を斜め上から見下ろし、柱の高さで波や音を見せる。
//
//   拍の頭      中心から輪の波が外へ広がる（毎拍1つ。輪が柱を持ち上げていく）
//   音          中心からの距離をスペクトルの帯に割り当て、中心＝低域・外側＝高域で柱が伸びる
//   カメラ      ゆっくり回り込む。正投影（遠近なし）で、図面のように見せる
//
// キー: A 白線（黒い柱に白い縁。他のレイヤーに加算で重ねやすい）/ S 塗り（光の当たった白い柱）
class Scene18 extends BaseScene {
    constructor() {
        super(WEBGL);

        this.title = '立方体の格子';

        this.modes = { keys: ['A', 'S'], labels: ['白線', '塗り'] };

        this.GRID = 15;                 // 1辺の柱の数（奇数で真ん中に1本立つ）。画面の外まで敷き詰める
        this.CELL = 0.105;              // 柱の間隔（画面の高さ比）
        this.GAP = 0.18;                // 柱と柱のすき間（間隔に対する比）
        this.BASE_HEIGHT = 0.15;        // 静かなときの高さ（間隔に対する比。0 だと消える）

        // ---- 拍の波 ----
        this.WAVE_HEIGHT = 3.5;         // 輪が通るときに持ち上がる高さ（間隔比）
        this.WAVE_WIDTH = 1.4;          // 輪の太さ（柱の本数）
        this.WAVE_REACH = 14;           // 1拍で輪が進む距離（柱の本数）

        // ---- 音 ----
        this.SPECTRUM_HEIGHT = 3;       // スペクトルで伸びる高さの最大（間隔比）
        this.SPECTRUM_SMOOTH = 0.25;    // ならす割合（1 でならさない）

        // ---- カメラ ----
        this.TILT = -0.62;              // 見下ろす角度（rad）
        this.ORBIT_SPEED = 0.12;        // 回り込む速さ（rad/秒）
        this.LINE_WEIGHT = 1.4;
        this.LINE_DIM = 70;             // 低い柱の線の明るさ。高い柱ほど 255 へ（波が読めるように）
        this.BRIGHT_HEIGHT = 3;         // この高さ（間隔比）で線が最も明るくなる

        this.levels = [];
        this.lastMs = null;
        this.orbit = Math.PI / 4;
    }

    setup() {
        const half = (this.GRID - 1) / 2;
        this.maxDistance = Math.hypot(half, half);
    }

    draw(spectrum) {
        const pg = this.pg;
        const now = millis() / 1000;
        const dt = this.lastMs === null ? 0 : Math.min(now - this.lastMs, 0.05);
        this.lastMs = now;
        this.orbit += this.ORBIT_SPEED * dt;

        // 中心からの距離 → スペクトルの帯。低域の bin を広めに取る（音楽は低域に寄っている）
        const bins = spectrum.length || 1;
        const rings = Math.ceil(this.maxDistance) + 1;
        for (let r = 0; r < rings; r++) {
            const t = r / (rings - 1);
            const bin = Math.min(bins - 1, Math.floor(Math.pow(t, 1.6) * (bins - 1)));
            const target = spectrum[bin] || 0;
            this.levels[r] = (this.levels[r] ?? 0) + (target - (this.levels[r] ?? 0)) * this.SPECTRUM_SMOOTH;
        }

        const filled = this.modeIndex === 1;
        pg.background(0);
        pg.ortho(-pg.width / 2, pg.width / 2, -pg.height / 2, pg.height / 2, -pg.height * 4, pg.height * 4);
        pg.push();
        pg.rotateX(this.TILT);
        pg.rotateY(this.orbit);

        if (filled) {
            pg.noStroke();
            pg.ambientLight(25);
            pg.directionalLight(255, 255, 255, 0.4, 1, -0.6);
            pg.directionalLight(120, 140, 255, -0.8, 0.3, 0.5);
            pg.specularMaterial(255);
            pg.shininess(20);
        } else {
            pg.strokeWeight(this.LINE_WEIGHT);
            pg.fill(0);
        }

        const cell = this.CELL * pg.height;
        const size = cell * (1 - this.GAP);
        const half = (this.GRID - 1) / 2;
        const beats = this.beats();
        const wavePos = (beats % 1) * this.WAVE_REACH;      // 今の拍の輪がどこまで進んだか
        const waveFade = 1 - (beats % 1);                    // 進むほど弱く

        for (let i = 0; i < this.GRID; i++) {
            for (let j = 0; j < this.GRID; j++) {
                const distance = Math.hypot(i - half, j - half);
                const offset = (distance - wavePos) / this.WAVE_WIDTH;
                const wave = this.WAVE_HEIGHT * waveFade * Math.exp(-offset * offset);
                const level = this.levels[Math.min(rings - 1, Math.round(distance))] || 0;
                const rise = this.BASE_HEIGHT + wave + this.SPECTRUM_HEIGHT * level;
                const height = cell * rise;
                if (!filled) pg.stroke(this.LINE_DIM + (255 - this.LINE_DIM) * Math.min(1, rise / this.BRIGHT_HEIGHT));

                pg.push();
                // 床（y = 0）から上へ伸ばす。p5 の y は下向きなので負の向きへ
                pg.translate((i - half) * cell, -height / 2, (j - half) * cell);
                pg.box(size, height, size);
                pg.pop();
            }
        }
        pg.pop();
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
