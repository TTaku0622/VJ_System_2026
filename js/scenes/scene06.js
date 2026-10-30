// カメラ映像のシーン
// 映像の加工は shader/camera.frag の中で u_mode を切り替えて行う。
//
// エフェクトを増やすときは 2 か所だけ:
//   1. camera.frag に u_mode の分岐を足す
//   2. modes.keys と modes.labels に1つずつ足す（並び順がそのまま u_mode の値になる）
class Scene06 extends BaseScene {
    // cameraShader は sketch.js の preload() で読み込んだものを受け取る
    constructor(cameraShader) {
        super(WEBGL);

        this.title = 'カメラ';

        this.cameraShader = cameraShader;

        // 加工の切替。keys の並び順がそのまま u_mode の 0, 1, 2, ... になる。
        // labels は keys と必ず同じ並び・同じ長さにすること（操作画面に出る）
        this.modes = {
            keys: ['A', 'S', 'D', 'F', 'G', 'H', 'J'],
            labels: ['オリジナル', '枠線', '古いテレビ', 'ゆがみ', '2値化', '残像', 'ストロボ'],
        };

        // カメラを直接選ぶキー。並び順がデバイス一覧の 0, 1, 2 番目に対応する
        this.CAMERA_KEYS = ['Q', 'W', 'E'];

        // MIDI の学習モードで割り当てを聞くキー。加工（modes）は自動で含まれる
        this.keyHelp = [
            { key: 'Q', label: 'カメラ 1台目' },
            { key: 'W', label: 'カメラ 2台目' },
            { key: 'E', label: 'カメラ 3台目' },
            { key: 'R', label: 'カメラを再取得' },
        ];

        // ---- 枠線モードのしきい値。小さいほど細かい線まで出る ----
        this.THRESHOLD_QUIET = 0.50;    // 無音時。強い輪郭だけが残るので絵は消えない
        this.THRESHOLD_LOUD = 0.18;     // 大音量時。細部まで線になる
        this.LEVEL_FULL = 0.5;          // この音量で LOUD 側に振り切る
        this.LEVEL_SMOOTHING = 0.15;    // 音量の追従の速さ（小さいほど滑らか）
        this.SOFTNESS = 0.08;           // 線の縁のなめらかさ
        this.EDGE_SPREAD = 1.5;         // サンプル間隔＝線の太さ（カメラのピクセル数）

        // ---- ストロボ（J）。バスドラの立ち上がりで光らせる ----
        this.STROBE_BASS_MIN = 0.30;    // これ以下の低域では光らせない
        this.STROBE_RISE = 0.06;        // 前フレームからこれだけ増えたら「立ち上がり」とみなす
        this.STROBE_MIN_INTERVAL = 200; // 発光の最短間隔（ミリ秒）。5Hz を超えないための下限
        this.STROBE_DECAY = 0.18;       // 1フレームあたりの減光量（大きいほど短い閃光）

        this.MIRROR = false;            // 手元カメラを使うときは true

        this.smoothedLevel = 0;
        this.prev = undefined;          // 残像用に前フレームの出力を写しておくバッファ
        this.flash = 0;
        this.prevBass = 0;
        this.lastFlashAt = 0;
    }

    setup() {
        this.pg.noStroke();

        // 残像用のバッファ。シェーダーは書き込み中のバッファを読めないので、
        // 出力を毎フレームここへ写してから次のフレームで参照する
        this.prev = createGraphics(this.pg.width, this.pg.height);
    }

    draw(spectrum) {
        this.pg.background(0);

        // シェーダーの読み込み前・カメラ切替中は黒のまま（絵が崩れるより消えるほうを選ぶ）
        if (!this.cameraShader || !cameraManager.isReady()) return;

        const cam = cameraManager.get();

        this.smoothedLevel += (this.level(spectrum) - this.smoothedLevel) * this.LEVEL_SMOOTHING;
        const loudness = constrain(this.smoothedLevel / this.LEVEL_FULL, 0, 1);
        this._updateFlash(spectrum);

        this.pg.shader(this.cameraShader);
        this.cameraShader.setUniform('u_cam', cam);
        this.cameraShader.setUniform('u_prev', this.prev);
        this.cameraShader.setUniform('u_mode', this.modeIndex);
        this.cameraShader.setUniform('u_coverScale', this._coverScale());
        this.cameraShader.setUniform('u_mirror', this.MIRROR ? 1 : 0);
        this.cameraShader.setUniform('u_time', millis() / 1000);
        this.cameraShader.setUniform('u_level', loudness);
        this.cameraShader.setUniform('u_flash', this.flash);
        this.cameraShader.setUniform('u_screenTexel', [1 / this.pg.width, 1 / this.pg.height]);
        this.cameraShader.setUniform('u_texel', [
            this.EDGE_SPREAD / cam.width,
            this.EDGE_SPREAD / cam.height,
        ]);
        this.cameraShader.setUniform('u_threshold',
            lerp(this.THRESHOLD_QUIET, this.THRESHOLD_LOUD, loudness));
        this.cameraShader.setUniform('u_softness', this.SOFTNESS);

        // 画面いっぱいの四角にシェーダーをかける（main.vert が UV をそのまま渡す）
        this.pg.rect(0, 0, this.pg.width, this.pg.height);

        // 残像モードのときだけ出力を写す。他のモードでは無駄なので毎フレーム転送しない
        if (this._isTrailMode()) {
            this.prev.image(this.pg, 0, 0, this.prev.width, this.prev.height);
        }
    }

    // バスドラの立ち上がりを検出してストロボを焚く。
    // 音が大きいだけでは光らせず「前フレームより増えた瞬間」を拾う（打点に合う）。
    // 光感受性への配慮として、STROBE_MIN_INTERVAL より短い間隔では光らせない
    _updateFlash(spectrum) {
        const bass = this.bass(spectrum);
        const now = millis();

        if (bass > this.STROBE_BASS_MIN
            && bass - this.prevBass > this.STROBE_RISE
            && now - this.lastFlashAt > this.STROBE_MIN_INTERVAL) {
            this.flash = 1;
            this.lastFlashAt = now;
        }

        this.prevBass = bass;
        this.flash = max(0, this.flash - this.STROBE_DECAY);
    }

    _isTrailMode() {
        return this.modeIndex === this.modes.keys.indexOf('H');
    }

    // BaseScene の setMode から呼ばれる。キー操作でも遠隔操作でも必ず通る
    onModeChanged() {
        // 残像に入るときは古い軌跡を消す。残っていると前回の絵が一瞬見える
        if (this._isTrailMode() && this.prev) this.prev.clear();
    }

    // アスペクト比を保つための UV スケール。1 未満の軸が中央基準で切り取られる
    _coverScale() {
        const camAspect = cameraManager.aspect();
        const pgAspect = this.pg.width / this.pg.height;

        if (camAspect > pgAspect) {
            return [pgAspect / camAspect, 1];   // カメラのほうが横長 → 左右を切る
        }
        return [1, camAspect / pgAspect];       // カメラのほうが縦長 → 上下を切る
    }

    keyPressed(key) {
        const upperKey = String(key).toUpperCase();

        const cameraIndex = this.CAMERA_KEYS.indexOf(upperKey);
        if (cameraIndex >= 0) {
            cameraManager.select(cameraIndex);
            return;
        }

        if (this.handleModeKey(key)) return;

        if (upperKey === 'R') cameraManager.reopen();
    }
}
