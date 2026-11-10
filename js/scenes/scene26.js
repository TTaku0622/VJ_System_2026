// 文字（名前 'type'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番のタイポグラフィ。太い文字を画面いっぱいに出して、拍に合わせて切り替える。
// **出す言葉は WORDS を書き換える**（曲名・アーティスト名・歌詞の一語などに差し替える想定）。
//
//   A 1語ずつ   拍ごとに次の言葉。塗り / 縁取り / 縦に重ねた縁取り の3つの見せ方を順に回す。拍の頭で少し大きく
//   S 流れる帯  言葉をくり返した横の帯が何段も並び、段ごとに左右反対へ流れる。拍ごとに1段だけ白黒反転し、
//               言葉は小節ごとに入れ替わる
class Scene26 extends BaseScene {
    constructor() {
        super();                        // 2D

        this.title = '文字';

        this.modes = { keys: ['A', 'S'], labels: ['1語ずつ', '流れる帯'] };

        // 出す言葉。差し替えて使う
        this.WORDS = ['MUSIC', 'SOUND', 'LIGHT', 'NIGHT', 'DANCE', 'LIVE', '音', '光', '夜'];
        this.FONT = 'Helvetica Neue';   // 日本語は OS が自動でヒラギノなどに置き換える

        // ---- 1語ずつ ----
        this.FIT_WIDTH = 0.88;          // 言葉の幅の上限（画面の幅比）
        this.FIT_HEIGHT = 0.62;         // 文字の大きさの上限（画面の高さ比）
        this.PUNCH = 0.06;              // 拍の頭で大きくなる量
        this.BEAT_SHARPNESS = 4;
        this.OUTLINE_WEIGHT = 4;        // 縁取りの太さ（1080p 基準）
        this.ECHO_COUNT = 5;            // 縦に重ねる数（3つ目の見せ方）

        // ---- 流れる帯 ----
        this.ROWS = 5;
        this.ROW_FILL = 0.82;           // 文字の大きさ（段の高さ比）
        this.BEATS_PER_WORD = 2;        // 言葉1つぶん流れるのにかける拍数

        this.wordIndex = 0;
        this.lastBeat = null;
    }

    draw(spectrum) {
        const pg = this.pg;
        const beats = this.beats();
        const beat = Math.floor(beats);
        if (this.lastBeat !== null && beat !== this.lastBeat) this.wordIndex = (this.wordIndex + 1) % this.WORDS.length;
        this.lastBeat = beat;

        pg.background(0);
        pg.textFont(this.FONT);
        pg.textStyle(BOLD);
        if (this.modeIndex === 0) this._single(beat);
        else this._rows(beats, beat);
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }

    // ---- 1語ずつ ----

    _single(beat) {
        const pg = this.pg;
        const w = pg.width;
        const h = pg.height;
        const word = this.WORDS[this.wordIndex];
        const punch = 1 + this.PUNCH * Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS);
        const size = this._fitSize(word, w * this.FIT_WIDTH, h * this.FIT_HEIGHT) * punch;
        const style = ((beat % 3) + 3) % 3;     // 0 塗り / 1 縁取り / 2 縦に重ねた縁取り

        pg.textAlign(CENTER, CENTER);
        pg.textSize(size);
        const weight = this.OUTLINE_WEIGHT * h / 1080;

        if (style === 0) {
            pg.noStroke();
            pg.fill(255);
            pg.text(word, w / 2, h / 2);
        } else if (style === 1) {
            pg.noFill();
            pg.stroke(255);
            pg.strokeWeight(weight);
            pg.text(word, w / 2, h / 2);
        } else {
            // 小さめにして縦に重ねる。真ん中だけ塗り、外へ行くほど縁取りを暗く
            // 重ねた全体が画面の高さに収まる大きさ（大きいままだと上下の端が切れた）
            const echoSize = Math.min(size * 0.45, (h * 0.92) / (this.ECHO_COUNT * 0.95));
            pg.textSize(echoSize);
            const step = echoSize * 0.95;
            const half = (this.ECHO_COUNT - 1) / 2;
            for (let i = 0; i < this.ECHO_COUNT; i++) {
                const offset = i - half;
                const y = h / 2 + offset * step;
                if (offset === 0) {
                    pg.noStroke();
                    pg.fill(255);
                } else {
                    pg.noFill();
                    pg.stroke(255, 255 * (1 - Math.abs(offset) / (half + 1)));
                    pg.strokeWeight(weight);
                }
                pg.text(word, w / 2, y);
            }
        }
    }

    // 幅 maxWidth・高さ maxHeight に収まる文字の大きさ
    _fitSize(word, maxWidth, maxHeight) {
        const pg = this.pg;
        pg.textSize(100);
        const width = pg.textWidth(word);
        return Math.min(maxHeight, (maxWidth / Math.max(width, 1)) * 100);
    }

    // ---- 流れる帯 ----

    _rows(beats, beat) {
        const pg = this.pg;
        const w = pg.width;
        const h = pg.height;
        const rowHeight = h / this.ROWS;
        const size = rowHeight * this.ROW_FILL;
        const highlighted = ((beat % this.ROWS) + this.ROWS) % this.ROWS;   // 拍ごとに反転する段
        const weight = this.OUTLINE_WEIGHT * h / 1080;

        pg.textSize(size);
        pg.textAlign(LEFT, CENTER);
        // 帯の言葉は小節ごとに入れ替える（拍ごとだと、横に流れながら言葉まで変わって読めなかった）
        const barWord = Math.floor(beats / tempoManager.BEATS_PER_BAR);
        for (let row = 0; row < this.ROWS; row++) {
            const word = this.WORDS[(((barWord + row) % this.WORDS.length) + this.WORDS.length) % this.WORDS.length];
            const unit = pg.textWidth(word + '  ');
            const direction = row % 2 === 0 ? -1 : 1;
            const shift = ((beats / this.BEATS_PER_WORD) % 1) * unit * direction;
            const y = row * rowHeight + rowHeight / 2;
            const inverted = row === highlighted;

            if (inverted) {
                pg.noStroke();
                pg.fill(255);
                pg.rect(0, row * rowHeight, w, rowHeight);
            }
            // 段ごとに塗りと縁取りを交互に。反転した段は白地に黒い塗り
            const outline = !inverted && row % 2 === 1;
            if (outline) {
                pg.noFill();
                pg.stroke(255);
                pg.strokeWeight(weight);
            } else {
                pg.noStroke();
                pg.fill(inverted ? 0 : 255);
            }
            for (let x = shift - unit; x < w + unit; x += unit) pg.text(word, x, y);
        }
    }
}
