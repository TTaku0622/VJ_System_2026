// 迷路タイル（名前 'truchet'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番のジェネラティブ模様（トルシェ・タイル）。正方形のタイルに、辺の真ん中どうしを結ぶ
// 線を2本ずつ描き、向きをばらばらに並べると、つながった線が迷路のようにうねる。
//
//   拍の頭      ランダムに選んだタイルが 90° 回り、迷路が組み変わる（くるっと回る動きを見せる）
//   小節の頭    回るタイルが多い
//   回っている最中のタイルは明るく光る
//
// キー: A 円弧（丸くうねる）/ S 斜線（ギザギザの迷路）
class Scene22 extends BaseScene {
    constructor() {
        super();                        // 2D。線のアンチエイリアスが効く

        this.title = '迷路タイル';

        this.modes = { keys: ['A', 'S'], labels: ['円弧', '斜線'] };

        this.ROWS = 12;                 // 縦のタイル数。横は画面の比率で決まる
        this.FLIP_SHARE = 0.18;         // 拍の頭で回るタイルの割合
        this.BAR_FLIP_SHARE = 0.45;     // 小節の頭で回るタイルの割合
        this.TURN_BEATS = 0.35;         // 90° 回りきるまで（拍）
        this.LINE_WEIGHT = 4.5;         // 線の太さ（ピクセル。1080p 基準で画面に合わせて縮める）
        this.GLOW_WEIGHT = 14;
        this.GLOW_ALPHA = 40;
        this.DIM = 185;                 // 止まっているタイルの線の明るさ（回っている最中は 255）

        this.tiles = [];
        this.lastBeat = null;
    }

    setup() {
        this._layout();
    }

    _layout() {
        const pg = this.pg;
        this.cell = pg.height / this.ROWS;
        this.cols = Math.ceil(pg.width / this.cell);
        this.offsetX = (pg.width - this.cols * this.cell) / 2;
        this.tiles = [];
        for (let i = 0; i < this.cols * this.ROWS; i++) {
            const turns = Math.floor(Math.random() * 2);
            // from → to へ startBeat から回る。止まっているときは from = to
            this.tiles.push({ from: turns, to: turns, startBeat: -1 });
        }
    }

    draw(spectrum) {
        const pg = this.pg;
        const beats = this.beats();
        this._flipOnBeat(beats);

        pg.background(0);
        pg.noFill();
        pg.strokeCap(ROUND);

        const scale = pg.height / 1080;
        const cell = this.cell;
        const half = cell / 2;
        const arcs = this.modeIndex === 0;

        // 止まっているタイルと回っているタイルで明るさが違うので、2回に分けて描く
        for (const moving of [false, true]) {
            for (const pass of ['glow', 'core']) {
                const tone = moving ? 255 : this.DIM;
                if (pass === 'glow') {
                    pg.stroke(tone, this.GLOW_ALPHA);
                    pg.strokeWeight(this.GLOW_WEIGHT * scale);
                } else {
                    pg.stroke(tone);
                    pg.strokeWeight(this.LINE_WEIGHT * scale);
                }
                for (let row = 0; row < this.ROWS; row++) {
                    for (let col = 0; col < this.cols; col++) {
                        const tile = this.tiles[row * this.cols + col];
                        const progress = this._progress(tile, beats);
                        if ((progress < 1) !== moving) continue;

                        const eased = progress * progress * (3 - 2 * progress);
                        const angle = (tile.from + (tile.to - tile.from) * eased) * HALF_PI;
                        pg.push();
                        pg.translate(this.offsetX + col * cell + half, row * cell + half);
                        pg.rotate(angle);
                        if (arcs) {
                            // 左上の角と右下の角を中心にした4分の1円（辺の真ん中どうしを結ぶ）
                            pg.arc(-half, -half, cell, cell, 0, HALF_PI);
                            pg.arc(half, half, cell, cell, PI, PI + HALF_PI);
                        } else {
                            pg.line(-half, half, half, -half);
                        }
                        pg.pop();
                    }
                }
            }
        }
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }

    // 回り始めてからの進み 0〜1（1 で止まっている）
    _progress(tile, beats) {
        if (tile.from === tile.to) return 1;
        const t = (beats - tile.startBeat) / this.TURN_BEATS;
        if (t >= 1) {
            tile.from = tile.to;
            return 1;
        }
        return Math.max(0, t);
    }

    // 拍が変わった瞬間に、何枚かを 90° 回し始める
    _flipOnBeat(beats) {
        const beat = Math.floor(beats);
        const changed = this.lastBeat !== null && beat !== this.lastBeat;
        this.lastBeat = beat;
        if (!changed) return;

        const share = this.beatInBar() === 0 ? this.BAR_FLIP_SHARE : this.FLIP_SHARE;
        for (const tile of this.tiles) {
            if (Math.random() >= share) continue;
            tile.from = tile.to % 4;        // 角度が増え続けないように 0〜3 に戻す（見た目は同じ）
            tile.to = tile.from + 1;
            tile.startBeat = beat;
        }
    }
}
