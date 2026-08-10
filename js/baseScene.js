// 全シーンの土台になるクラス
// 各シーンは createGraphics に描画し、SceneManager がそれをテクスチャとして
// ポストシェーダーに渡す。継承側で setup() / draw() を書けばよい。
//
// 使い方:
//   class MyScene extends BaseScene {
//       constructor() { super(WEBGL); }        // 2D なら super() だけ
//       setup() { ... }                        // 1度だけ呼ばれる
//       draw(spectrum) { this.pg.background(0); ... }
//       keyPressed(key) { ... }                // 表示中のシーンにだけ届く
//   }
class BaseScene {
    // mode: WEBGL（3D）または省略（2D）
    constructor(mode = undefined) {
        this.mode = mode;
        this.pg = mode ? createGraphics(width, height, mode) : createGraphics(width, height);

        // 操作画面（control.html）に出す表示名。省略するとクラス名が使われる
        this.title = '';

        // 「切替」の宣言。シーンのコンストラクタで設定すると、
        // 操作画面（control.html）への表示と、キー操作の処理が自動で効く。
        //   keys が1つ    → そのキーを押すたびに labels を循環する（Scene04 の T）
        //   keys が複数   → keys[i] を押すと i 番が選ばれる（Scene06 の A S D...）
        // 例: this.modes = { keys: ['T'], labels: ['円', '三角'] };
        this.modes = null;
        this.modeIndex = 0;
    }

    setup() { }

    draw(spectrum) { }

    // ---- 切替（modes を宣言したシーンだけ使う） ----

    // 現在の切替を index 番へ変える。**表示していないシーンに対しても呼べる**ので、
    // 操作画面からの遠隔操作もここを通す想定
    setMode(index) {
        if (!this.modes) return false;
        if (index < 0 || index >= this.modes.labels.length) return false;

        this.modeIndex = index;
        if (typeof this.onModeChanged === 'function') this.onModeChanged(index);
        return true;
    }

    // keyPressed から呼ぶ。切替キーだったら処理して true を返す
    handleModeKey(key) {
        if (!this.modes) return false;

        const upperKey = String(key).toUpperCase();
        const keys = this.modes.keys;

        // 1キーで循環
        if (keys.length === 1) {
            if (upperKey !== keys[0]) return false;
            return this.setMode((this.modeIndex + 1) % this.modes.labels.length);
        }

        // キーごとに直接選択
        const index = keys.indexOf(upperKey);
        if (index < 0) return false;
        return this.setMode(index);
    }

    // SceneManager がテクスチャとして受け取る描画バッファ
    getScene() {
        return this.pg;
    }

    // ---- オーディオ用ヘルパー（spectrum は 0.0〜1.0 の配列） ----

    // 指定した帯域の平均値。start / end は spectrum のインデックス
    avg(spectrum, start, end) {
        let sum = 0;
        let count = 0;
        for (let i = start; i <= end && i < spectrum.length; i++) {
            sum += spectrum[i];
            count++;
        }
        return count > 0 ? sum / count : 0;
    }

    // 32 bin 前提のざっくり帯域。bin 数を変えたら範囲も調整する
    bass(spectrum) { return this.avg(spectrum, 0, 2); }
    mid(spectrum) { return this.avg(spectrum, 3, 10); }
    treble(spectrum) { return this.avg(spectrum, 11, 31); }
    level(spectrum) { return this.avg(spectrum, 0, spectrum.length - 1); }
}
