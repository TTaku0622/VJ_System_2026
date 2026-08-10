// 真っ白なシーン
// 明転・フラッシュ・客席を照らす用。音にも反応せず、キーも持たない。
// 単純であることがそのまま価値（本番で確実に真っ白になる）。
class Scene01 extends BaseScene {
    constructor() {
        super();                // 2D。塗るだけなので WEBGL は要らない

        this.title = '白';
        this.COLOR = 255;
    }

    draw(spectrum) {
        this.pg.background(this.COLOR);
    }
}
