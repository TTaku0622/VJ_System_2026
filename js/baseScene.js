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

        // MIDI の学習モードで割り当てを聞く、このシーン固有のキー。
        // **modes で宣言したキーは自動で含まれる**ので、ここに書くのはそれ以外だけ。
        // 例: this.keyHelp = [{ key: 'Q', label: '位置を引き直す' }];
        this.keyHelp = [];

        // つまみ（MIDI の CC）で連続して動かすパラメータの宣言。
        // **min が「絞りきった状態」**なので、いまの見た目を min に置けば
        // つまみを下げても元の絵に戻るだけで、崩れることがない。
        // 例: this.knobs = [{ name: 'weight', label: '線の太さ',
        //                     property: 'weightScale', min: 1, max: 6 }];
        this.knobs = [];
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

    // ---- つまみ（knobs を宣言したシーンだけ使う） ----

    // t は 0.0〜1.0。宣言した範囲へ写して代入する。
    // **表示していないシーンに対しても呼べる**ので、操作画面からの遠隔操作もここを通す想定
    setKnob(name, t) {
        const knob = this.knobs.find((entry) => entry.name === name);
        if (!knob) return false;

        this[knob.property] = knob.min + (knob.max - knob.min) * constrain(t, 0, 1);
        if (typeof this.onKnobChanged === 'function') this.onKnobChanged(name);
        return true;
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

    // ---- テンポ用ヘルパー（拍に合わせたいシーンだけ使う） ----
    // **フレーム数ではなく実時間から出している**ので、fps が落ちても拍とずれない

    bpm() { return tempoManager.bpm; }
    beats() { return tempoManager.beats(); }            // 通算の拍数（小数）。刻みを数えるのに使う
    beatPhase() { return tempoManager.phase(); }        // 拍の中の位置 0.0〜1.0（0 が拍の頭）
    beatInBar() { return tempoManager.beatInBar(); }    // 小節の中の何拍目か 0〜3
    barPhase() { return tempoManager.barPhase(); }      // 小節の中の位置 0.0〜1.0
}
