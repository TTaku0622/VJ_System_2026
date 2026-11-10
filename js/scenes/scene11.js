// 入れ子の山形（名前 'chevron'。数字キーなし、デッキか操作画面から出す）
//
// サカナクション「ミュージック」（SAKANAQUARIUM 2024 "turn"）の 0:25 ごろ、三角形の画面に出ていた
// 細い白線の「∧」が上下に何段も重なった模様。
//
// **1拍で1段ぶん流れる。**段の間隔ぶん進むと元と同じ形に戻るので、拍の位置の小数部をそのまま
// ずらす量に使えば、継ぎ目なくループして、流れる速さが BPM に乗る。
//
// キー: A 上へ流れる / S 下へ流れる
class Scene11 extends BaseScene {
    constructor() {
        super();                        // 2D。線のアンチエイリアスが効く

        this.title = '入れ子の山形';

        this.modes = { keys: ['A', 'S'], labels: ['上へ流れる', '下へ流れる'] };

        this.SPACING_RATIO = 0.11;      // 段の間隔（画面の高さ比）
        this.ARM_ANGLE = 48 * Math.PI / 180;    // 腕の傾き（水平からの角度）。元映像の山形はやや急
        this.BEATS_PER_STEP = 1;        // 1段ぶん流れるのにかける拍数
        this.LINE_WEIGHT = 1.4;         // 線の太さ（ピクセル）
        this.LINE_ALPHA = 200;
        this.BEAT_FLASH = 0.35;         // 拍の頭で明るくなる量
        this.BEAT_SHARPNESS = 4;
        this.BG_COLOR = 0;
    }

    draw(spectrum) {
        this.pg.background(this.BG_COLOR);
        this.pg.strokeWeight(this.LINE_WEIGHT);
        this.pg.noFill();

        const w = this.pg.width;
        const h = this.pg.height;
        const spacing = h * this.SPACING_RATIO;
        const direction = this.modeIndex === 0 ? -1 : 1;     // 上へ = y が減る
        const shift = (this.beats() / this.BEATS_PER_STEP) % 1 * spacing * direction;
        const flash = 1 + this.BEAT_FLASH * Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS);

        // 腕は画面の端まで届く長さ。頂点の高さを段の間隔ずつずらして、画面の外まで並べる
        const reach = w / 2;
        const drop = reach * Math.tan(this.ARM_ANGLE);
        const cx = w / 2;
        const first = Math.floor(-drop / spacing) - 1;
        const last = Math.ceil(h / spacing) + 1;

        // 段は画面の外から出入りするので、端で急に現れたり消えたりはしない
        this.pg.stroke(255, Math.min(255, this.LINE_ALPHA * flash));
        for (let i = first; i <= last; i++) {
            const y = i * spacing + shift;
            this.pg.line(cx - reach, y + drop, cx, y);
            this.pg.line(cx, y, cx + reach, y + drop);
        }
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }
}
