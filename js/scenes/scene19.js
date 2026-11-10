// 縦線のノイズ（名前 'noise'。数字キーなし、デッキか操作画面から出す）
//
// 2026-11-10 本人「縦線（線の数はいっぱい。太さもランダム）がランダムに位置が変化する感じでノイズを
// 表現したシーン。基本ノイズは黒と白で」。
//
// 画面の上から下まで通る縦線をたくさん引き、**32分音符ごとに位置と太さを全部引き直す**。
// 線の位置は一様にばらまくだけでなく、毎回いくつかの「かたまり」を作って寄せる
// （全部が均等だと砂嵐のように平らになり、信号が乱れている感じが出ない）。
//
//   拍の頭      線の本数が増える（拍の終わりに向かって減る）
//   音量        線の本数が増える
//
// キー: A 黒地に白 / S 白地に黒
class Scene19 extends BaseScene {
    constructor() {
        super();                        // 2D。線の縁がにじまないように太さは整数ピクセルにそろえる

        this.title = '縦線のノイズ';

        this.modes = { keys: ['A', 'S'], labels: ['黒地に白', '白地に黒'] };

        this.STEPS_PER_BEAT = 8;        // 1拍あたりの引き直しの回数（8 で32分音符）
        this.LINE_COUNT = 90;           // 静かなときの線の本数
        this.BEAT_LINES = 40;           // 拍の頭で増える本数
        this.LEVEL_LINES = 40;          // 音量で増える本数（音量 1 のとき）
        this.BEAT_SHARPNESS = 2;

        // 太さ（画面の幅比）。細い線が多く、ときどき太い線が混ざる
        this.WIDTH_MIN = 0.0012;        // 1280 px で約 1.5 px
        this.WIDTH_MAX = 0.02;          // 1280 px で約 26 px
        this.WIDTH_BIAS = 4;            // 大きいほど細い線が多い。画面の白い割合が4〜5割に収まるように本数と合わせてある

        // かたまり
        this.CLUSTERS_MIN = 1;
        this.CLUSTERS_MAX = 4;
        this.CLUSTER_SHARE = 0.55;      // かたまりに寄せる線の割合（残りは一様にばらまく）
        this.CLUSTER_SPREAD = 0.07;     // かたまりの広がり（画面の幅比）
    }

    draw(spectrum) {
        const pg = this.pg;
        const w = pg.width;
        const h = pg.height;
        const inverted = this.modeIndex === 1;

        pg.background(inverted ? 255 : 0);
        pg.noStroke();
        pg.fill(inverted ? 0 : 255);

        // 刻みの番号から乱数を作るので、同じ刻みのあいだは同じ線が出る（毎フレーム変わらない）
        const step = Math.floor(this.beats() * this.STEPS_PER_BEAT);
        const random = this._random(step);

        const beat = Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS);
        const count = Math.round(this.LINE_COUNT + this.BEAT_LINES * beat + this.LEVEL_LINES * this.level(spectrum));

        const clusterCount = this.CLUSTERS_MIN + Math.floor(random() * (this.CLUSTERS_MAX - this.CLUSTERS_MIN + 1));
        const clusters = [];
        for (let i = 0; i < clusterCount; i++) clusters.push(random());

        for (let i = 0; i < count; i++) {
            let x;
            if (random() < this.CLUSTER_SHARE) {
                const center = clusters[Math.floor(random() * clusters.length)];
                x = center + this._gaussian(random) * this.CLUSTER_SPREAD;
            } else {
                x = random();
            }
            const width = this.WIDTH_MIN + (this.WIDTH_MAX - this.WIDTH_MIN) * Math.pow(random(), this.WIDTH_BIAS);
            const left = Math.round((x - width / 2) * w);
            pg.rect(left, 0, Math.max(1, Math.round(width * w)), h);
        }
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }

    // 種から決まる乱数（mulberry32）。同じ種なら同じ並びが出る
    _random(seed) {
        let a = (seed * 2654435761) >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 平均 0・標準偏差 1 くらいの正規分布（一様乱数を3つ足す近似）
    _gaussian(random) {
        return (random() + random() + random() - 1.5) * 2;
    }
}
