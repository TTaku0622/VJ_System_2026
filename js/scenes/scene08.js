// 流体のシーン
//
// 描画はすべて shader/fluid.frag の中で行う。このクラスがやるのは
// **音を「流れの速さ・ゆがみ・寄り」に変換して uniform に渡すこと**だけ。
// 形そのものの調整値はシェーダー冒頭の const にまとめてある。
//
// 流れの進み（flow）は時間ではなく、毎フレーム足した位相を渡している。
// 「時間 × 速さ」で渡すと、音で速さが変わった瞬間に絵が飛ぶため。
class Scene08 extends BaseScene {
    // fluidShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(fluidShader) {
        super(WEBGL);

        this.title = '流体';

        this.fluidShader = fluidShader;

        // 配色の切替。並び順がそのまま fluid.frag の u_palette の値になる
        this.modes = {
            keys: ['A', 'S', 'D', 'F'],
            labels: ['雨花石', '墨', '溶岩', '虹'],
        };

        // ---- 形の切替（modes とは別に持つトグル）----
        this.SWIRL_KEY = 'Z';           // 渦 ↔ 横縞
        this.MIRROR_KEY = 'X';          // 上下左右の鏡

        // MIDI の学習モードで割り当てを聞くキー。配色（modes）は自動で含まれる
        this.keyHelp = [
            { key: this.SWIRL_KEY, label: '渦 ↔ 横縞' },
            { key: this.MIRROR_KEY, label: '鏡（上下左右）' },
        ];

        // ---- 音の反応 ----
        this.FLOW_QUIET = 0.0015;       // 無音時に流れが進む速さ（0 にすると止まる）
        this.FLOW_LOUD = 0.0110;        // 大音量時の速さ
        this.WARP_QUIET = 0.30;         // 無音時のゆがみ。0 にすると縞がまっすぐになる
        this.WARP_LOUD = 0.85;          // 大音量時のゆがみ。上げすぎると縞が潰れて面になる
        this.LEVEL_FULL = 0.5;          // この音量で LOUD 側へ振り切る
        this.LEVEL_SMOOTHING = 0.10;    // 音量の追従の速さ（小さいほど滑らか）

        // 低域の脈で画面ごと寄る。立ち上がりは速く、戻りはゆっくり
        this.BASS_FULL = 0.55;          // この低域で脈が 1 になる
        this.PULSE_ATTACK = 0.35;
        this.PULSE_RELEASE = 0.08;
        this.ZOOM_RANGE = 0.12;         // 脈で寄る量（1.0 + これ が最大倍率）

        this.SWIRL_SMOOTHING = 0.05;    // 渦 ↔ 横縞 の切替をなめらかにする速さ
        this.HUE_SPEED = 0.25;          // 虹の配色で色相が回る速さ（度/フレーム）

        // ---- 状態 ----
        this.swirlOn = true;
        this.mirrorOn = true;
        this.swirl = 1;                 // 実際に渡す値。swirlOn へ向かって補間する
        this.flow = 0;
        this.smoothedLevel = 0;
        this.pulse = 0;
        this.hue = 0;
    }

    setup() {
        this.pg.noStroke();
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前は黒のまま
        if (!this.fluidShader) return;

        this.smoothedLevel += (this.level(spectrum) - this.smoothedLevel) * this.LEVEL_SMOOTHING;
        const loudness = constrain(this.smoothedLevel / this.LEVEL_FULL, 0, 1);

        const bass = constrain(this.bass(spectrum) / this.BASS_FULL, 0, 1);
        this.pulse = lerp(this.pulse, bass,
            bass > this.pulse ? this.PULSE_ATTACK : this.PULSE_RELEASE);

        this.flow += lerp(this.FLOW_QUIET, this.FLOW_LOUD, loudness);
        this.swirl = lerp(this.swirl, this.swirlOn ? 1 : 0, this.SWIRL_SMOOTHING);
        // 色相は音では変えない。無音でも色だけは移り変わっていく（虹の配色のときだけ効く）
        this.hue = (this.hue + this.HUE_SPEED) % 360;

        this.pg.shader(this.fluidShader);
        this.fluidShader.setUniform('u_resolution', [this.pg.width, this.pg.height]);
        this.fluidShader.setUniform('u_palette', this.modeIndex);
        this.fluidShader.setUniform('u_flow', this.flow);
        this.fluidShader.setUniform('u_warp', lerp(this.WARP_QUIET, this.WARP_LOUD, loudness));
        this.fluidShader.setUniform('u_zoom', 1 + this.pulse * this.ZOOM_RANGE);
        this.fluidShader.setUniform('u_swirl', this.swirl);
        this.fluidShader.setUniform('u_mirror', this.mirrorOn ? 1 : 0);
        this.fluidShader.setUniform('u_hue', this.hue);
        this.fluidShader.setUniform('u_level', loudness);

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);
    }

    keyPressed(key) {
        if (this.handleModeKey(key)) return;

        const upperKey = String(key).toUpperCase();
        if (upperKey === this.SWIRL_KEY) this.swirlOn = !this.swirlOn;
        if (upperKey === this.MIRROR_KEY) this.mirrorOn = !this.mirrorOn;
    }
}
