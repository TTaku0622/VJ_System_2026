// テンポ（BPM）と拍の位置を持つ時計。Resolume の BPM 欄にあたる。
//
// **拍はフレーム数ではなく実時間から出す。**シーンの多くは毎フレーム値を足して動いているので、
// fps が落ちると遅れる。拍に合わせたい部分だけはこの時計から取れば、fps に関係なく拍とずれない。
//
// BPM の決め方は4つ。どれも「命令」（'tempo:tap' など）で受けるので、キーボード・MIDI・
// 操作画面のどこから来ても sketch.js の handleKey() という同じ入口を通る。
//
//   tempo:tap            タップテンポ。叩いた間隔から BPM を出し、叩いた瞬間を拍の頭にそろえる
//   tempo:set:<BPM>      数値で指定する（操作画面の入力欄）
//   tempo:adjust:<差>    BPM を足し引きする（TEMPO つまみ・Shift ＋ ↑↓）
//   tempo:nudge:<±1>     拍の位置だけを少し前後へずらす（NUDGE）。BPM は変えない
//   tempo:resync         いまを小節の1拍目にする（頭をそろえる）
class TempoManager {
    constructor() {
        this.BPM_MIN = 60;
        this.BPM_MAX = 200;
        this.DEFAULT_BPM = 120;
        this.BEATS_PER_BAR = 4;

        this.TAP_RESET_MS = 2000;       // これより間が空いたら、新しいタップの始まりとみなす
        this.TAP_AVERAGE = 8;           // BPM の計算に使う直近のタップ数。多いほど手ぶれに強い
        this.NUDGE_BEATS = 0.05;        // NUDGE 1回で拍の位置をずらす量（拍）

        // キーボードのキー。**アルファベットは全部埋まっている**ので記号と Tab を使う。
        // `-` は US 配列と JIS 配列のどちらでもシフト無しで打てる
        this.KEY_TAP = 'Tab';
        this.KEY_RESYNC = '-';

        this.bpm = this.DEFAULT_BPM;
        this.originMs = performance.now();  // 0拍目（1小節目の1拍目）の時刻
        this.taps = [];                     // 直近のタップの時刻
        this.tapCount = 0;                  // いまのタップの並びで何回目か（拍の頭をそろえるのに使う）
    }

    // ---- 拍の位置 ----

    // 0拍目からの通算の拍数（小数）。ほかの値はすべてここから出す
    beats() {
        return (performance.now() - this.originMs) * this.bpm / 60000;
    }

    // 拍の中の位置。0.0（拍の頭）→ 1.0（次の拍の直前）
    phase() {
        return this._fract(this.beats());
    }

    // 小節の中の何拍目か。0〜3
    beatInBar() {
        return Math.floor(this._mod(this.beats(), this.BEATS_PER_BAR));
    }

    // 小節の中の位置。0.0〜1.0
    barPhase() {
        return this._mod(this.beats(), this.BEATS_PER_BAR) / this.BEATS_PER_BAR;
    }

    // ---- BPM を変える ----

    // **拍の位置を保ったまま** BPM を変える。0拍目の時刻を付け替えないと、
    // BPM を変えた瞬間に拍の位置が飛ぶ（数値を変えただけで小節の途中へ跳ぶ）
    setBpm(value) {
        if (!Number.isFinite(value)) return;

        const position = this.beats();
        this.bpm = Math.min(this.BPM_MAX, Math.max(this.BPM_MIN, value));
        this.originMs = performance.now() - position * 60000 / this.bpm;
    }

    adjustBpm(delta) {
        this.setBpm(this.bpm + delta);
    }

    // 叩いた間隔の平均から BPM を出す。**叩いた瞬間を拍の頭にそろえる**ので、
    // 曲の1拍目から叩きはじめれば小節の頭も合う（タップの並びの1回目 = 小節の1拍目）
    tap() {
        const now = performance.now();
        const last = this.taps[this.taps.length - 1];

        if (last === undefined || now - last > this.TAP_RESET_MS) {
            this.taps = [];
            this.tapCount = 0;
        }
        this.taps.push(now);
        this.tapCount++;
        if (this.taps.length > this.TAP_AVERAGE) this.taps.shift();

        if (this.taps.length >= 2) {
            const interval = (now - this.taps[0]) / (this.taps.length - 1);
            this.setBpm(Math.round(60000 / interval * 10) / 10);    // 0.1 刻みに丸める
        }

        // このタップを (tapCount - 1) 拍目の頭にする
        this.originMs = now - (this.tapCount - 1) * 60000 / this.bpm;
    }

    // 拍の位置だけをずらす。+1 で早める（次の拍が早く来る）、-1 で遅らせる
    nudge(direction) {
        this.originMs -= Math.sign(direction) * this.NUDGE_BEATS * 60000 / this.bpm;
    }

    // いまを小節の1拍目にする
    resync() {
        this.originMs = performance.now();
        this.taps = [];
        this.tapCount = 0;
    }

    // ---- 命令 ----

    // テンポの命令（またはテンポ用のキー）なら処理して true を返す
    handleCommand(command) {
        if (command === this.KEY_TAP) {
            this.tap();
            return true;
        }
        if (command === this.KEY_RESYNC) {
            this.resync();
            return true;
        }

        const match = /^tempo:(tap|resync|set|adjust|nudge)(?::(-?\d+(?:\.\d+)?))?$/.exec(String(command));
        if (!match) return false;

        const value = match[2] === undefined ? null : Number(match[2]);
        switch (match[1]) {
            case 'tap': this.tap(); break;
            case 'resync': this.resync(); break;
            case 'set': if (value !== null) this.setBpm(value); break;
            case 'adjust': if (value !== null) this.adjustBpm(value); break;
            case 'nudge': if (value !== null) this.nudge(value); break;
        }
        return true;
    }

    // 画面や監視モードに出す名前。テンポの命令でなければ null
    commandLabel(command) {
        const match = /^tempo:(tap|resync|set|adjust|nudge)(?::(-?\d+(?:\.\d+)?))?$/.exec(String(command));
        if (!match) return null;

        const value = match[2];
        switch (match[1]) {
            case 'tap': return 'タップテンポ';
            case 'resync': return '拍の頭をそろえる';
            case 'set': return `BPM ${value}`;
            case 'adjust': return `BPM ${Number(value) > 0 ? '+' : ''}${value}`;
            case 'nudge': return Number(value) > 0 ? '拍を早める' : '拍を遅らせる';
            default: return null;
        }
    }

    _fract(x) {
        return x - Math.floor(x);
    }

    // 負の数でも 0〜m に収める（拍の頭をそろえた直後や NUDGE で拍数が負になることがある）
    _mod(x, m) {
        return ((x % m) + m) % m;
    }
}
