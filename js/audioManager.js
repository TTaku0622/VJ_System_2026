// 音の読み込み・再生と FFT 解析をまとめるクラス
// spectrum は 0.0〜1.0 に正規化した配列（長さ = BIN_COUNT）で返す
class AudioManager {
    constructor(binCount = 32) {
        this.sound = undefined;
        this.mic = undefined;
        this.fft = new p5.FFT(0.8, binCount);
        this.source = 'mic';            // 'file' | 'mic'。既定はデバイスのマイク（ライン入力）
        this.emptySpectrum = new Array(binCount).fill(0);
    }

    // preload() から呼ぶ
    load(audioFilePath) {
        this.sound = loadSound(audioFilePath);
    }

    // 解析対象を FFT に接続する（setup() の最後で呼ぶ）
    // マイクは起動時にブラウザの許可を求める。AudioContext はユーザー操作が
    // あるまで止まったままなので、画面をクリックするかスペースで動き出す
    setup() {
        if (this.source === 'mic') {
            this._startMic();
            return;
        }
        if (this.sound) {
            this.fft.setInput(this.sound);
        }
    }

    analyze() {
        if (this.source === 'file' && !this.sound) return this.emptySpectrum;
        if (this.source === 'mic' && !this.mic) return this.emptySpectrum;

        const spectrum = this.fft.analyze();
        for (let i = 0; i < spectrum.length; i++) {
            spectrum[i] = map(spectrum[i], 0, 255, 0, 1);
        }
        return spectrum;
    }

    // 再生 / 一時停止のトグル。ファイル音源のときだけ効く。
    // マイクのときは AudioContext を動かすだけ（これを踏まないと解析値が 0 のまま）
    play() {
        if (this.source === 'mic') {
            userStartAudio();
            return;
        }
        if (!this.sound) return;
        userStartAudio();       // ブラウザの自動再生制限を解除
        if (this.sound.isPlaying()) {
            this.sound.pause();
        } else {
            this.sound.loop();
        }
    }

    // 音声入力を ファイル ↔ マイク（ライン入力）で切り替える
    toggleSource() {
        if (this.source === 'file') {
            if (this.sound && this.sound.isPlaying()) this.sound.pause();
            this._startMic();
            this.source = 'mic';
        } else {
            if (this.mic) this.mic.stop();
            if (this.sound) this.fft.setInput(this.sound);
            this.source = 'file';
        }
        return this.source;
    }

    // マイク（ライン入力）を開いて FFT につなぐ
    _startMic() {
        userStartAudio();
        if (!this.mic) this.mic = new p5.AudioIn();
        this.mic.start();
        this.fft.setInput(this.mic);
    }
}
