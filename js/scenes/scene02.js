// 真っ黒なシーン
// 暗転用。曲間や MC で画を落とすときに使う。
// 音にも反応せず、キーも持たない。単純であることがそのまま価値。
//
// 「だんだん暗くする」はこのシーンではなく、**どのシーンでも効くマスター調光**
// （フェーダー1 / sceneManager の brightness）でやる。
class Scene02 extends BaseScene {
    constructor() {
        super();                // 2D。塗るだけなので WEBGL は要らない

        this.title = '黒';
        this.COLOR = 0;
    }

    draw(spectrum) {
        this.pg.background(this.COLOR);
    }
}
