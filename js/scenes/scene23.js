// パーティクル（名前 'particles'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番。何千もの白い粒が、見えない流れ（ノイズで決めた向きの場）に乗って尾を引きながら流れる。
// 前のフレームを薄い黒で塗って残すので、粒の通った跡が線になる。流れはカールノイズ（渦だけで、吸い込み口がない）。
//
//   拍の頭      粒が一瞬速くなる（尾が伸びる）
//   低域        流れ全体が速くなる
//   小節の頭    流れの向きの模様が少し組み変わる
//
// 描き方: 粒の数が多いので p5 の point() / line() は使わず、キャンバスの道（path）に全部の線を
// 足してから1回で引く（1本ずつ引くと重い）。
//
// キー: A 流れ（画面全体をうねって流れる）/ S 放射（中心から外へ吹き出す）
class Scene23 extends BaseScene {
    constructor() {
        super();                        // 2D

        this.title = 'パーティクル';

        this.modes = { keys: ['A', 'S'], labels: ['流れ', '放射'] };

        this.COUNT = 3500;              // 粒の数
        this.SPEED = 0.09;              // 進む速さ（画面の高さ/秒）
        this.BASS_SPEED = 0.15;         // 低域で上乗せする速さ
        this.BEAT_SPEED = 0.35;         // 拍の頭で上乗せする速さ
        this.BEAT_SHARPNESS = 4;
        this.FIELD_SCALE = 1.1;         // 流れの模様の細かさ（画面の高さあたり）
        this.CURL_EPS = 0.01;           // 流れの向きを出すときの、ノイズの坂を測る幅
        this.NOISE_OCTAVES = 2;         // ノイズの段の数（少ないほど大きな流れだけになる）
        this.NOISE_FALLOFF = 0.35;      // 細かい段の強さ
        this.FIELD_DRIFT = 0.06;        // 流れの模様が時間で変わる速さ
        this.BAR_SHIFT = 0.35;          // 小節の頭で模様をずらす量
        this.SWIRL = 0.6;               // 放射のときに横へ曲げる強さ（0 でまっすぐ外へ）
        this.LIFE_MIN = 1.5;            // 粒の寿命（秒）。尽きたら生まれ直す（同じ所に溜まらないように）
        this.LIFE_MAX = 5;
        this.TRAIL_ALPHA = 0.09;        // 残像の消え方（1 で残像なし）
        this.LINE_WEIGHT = 1.4;         // 1080p 基準
        this.BASS_SMOOTH = 0.1;

        this.lastMs = null;
        this.lastBar = null;
        this.fieldOffset = 0;
        this.bassLevel = 0;
    }

    setup() {
        const n = this.COUNT;
        this.x = new Float32Array(n);
        this.y = new Float32Array(n);
        this.life = new Float32Array(n);
        for (let i = 0; i < n; i++) this._spawn(i, true);
        this.pg.background(0);
    }

    onModeChanged() {
        // 向きが全く変わるので、粒を撒き直して前の残像を消す
        if (!this.x) return;        // setup() の前（操作画面から先に切り替えたとき）
        for (let i = 0; i < this.COUNT; i++) this._spawn(i, true);
        this.pg.background(0);
    }

    draw(spectrum) {
        const pg = this.pg;
        const ctx = pg.drawingContext;
        const w = pg.width;
        const h = pg.height;

        const now = millis() / 1000;
        const dt = this.lastMs === null ? 0 : Math.min(now - this.lastMs, 0.05);
        this.lastMs = now;

        const bar = Math.floor(this.beats() / tempoManager.BEATS_PER_BAR);
        if (this.lastBar !== null && bar !== this.lastBar) this.fieldOffset += this.BAR_SHIFT;
        this.lastBar = bar;

        this.bassLevel += (this.bass(spectrum) - this.bassLevel) * this.BASS_SMOOTH;
        const beat = Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS);
        const step = (this.SPEED + this.BASS_SPEED * this.bassLevel + this.BEAT_SPEED * beat) * h * dt;

        // 残像
        ctx.fillStyle = `rgba(0, 0, 0, ${this.TRAIL_ALPHA})`;
        ctx.fillRect(0, 0, w, h);

        const radial = this.modeIndex === 1;
        const z = now * this.FIELD_DRIFT + this.fieldOffset;
        const scale = this.FIELD_SCALE / h;
        const cx = w / 2;
        const cy = h / 2;

        // 細かい段（オクターブ）を減らして、大きくゆったりした流れにする。
        // カールノイズは坂を見るので、細かい段が残ると小さな渦だらけになる。
        // noiseDetail() は全体の設定なので、描き終わったら p5 の既定（4, 0.5）に戻す（地形のシーンも noise を使う）
        noiseDetail(this.NOISE_OCTAVES, this.NOISE_FALLOFF);
        ctx.beginPath();
        for (let i = 0; i < this.COUNT; i++) {
            const x0 = this.x[i];
            const y0 = this.y[i];
            let angle;
            if (radial) {
                angle = Math.atan2(y0 - cy, x0 - cx) + this.SWIRL * (noise(x0 * scale, y0 * scale, z) - 0.5) * 2;
            } else {
                // カールノイズ: ノイズの坂に沿って（直角に）流す。ノイズの値をそのまま向きにすると
                // 粒が吸い込まれる所ができ、数秒で数本の線に寄り集まって画面がすかすかになった
                const nx = x0 * scale;
                const ny = y0 * scale;
                const n = noise(nx, ny, z);
                const dx = noise(nx + this.CURL_EPS, ny, z) - n;
                const dy = noise(nx, ny + this.CURL_EPS, z) - n;
                angle = Math.atan2(-dx, dy);
            }
            const x1 = x0 + Math.cos(angle) * step;
            const y1 = y0 + Math.sin(angle) * step;
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            this.x[i] = x1;
            this.y[i] = y1;
            this.life[i] -= dt;
            if (this.life[i] <= 0 || x1 < 0 || x1 > w || y1 < 0 || y1 > h) this._spawn(i, false);
        }
        noiseDetail(4, 0.5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = this.LINE_WEIGHT * h / 1080;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }

    // 生まれ直し。放射のときは中心の近くから（最初だけは画面全体に撒く）
    _spawn(i, initial) {
        const w = this.pg.width;
        const h = this.pg.height;
        if (this.modeIndex === 1 && !initial) {
            const r = Math.random() * h * 0.08;
            const a = Math.random() * Math.PI * 2;
            this.x[i] = w / 2 + Math.cos(a) * r;
            this.y[i] = h / 2 + Math.sin(a) * r;
        } else {
            this.x[i] = Math.random() * w;
            this.y[i] = Math.random() * h;
        }
        this.life[i] = this.LIFE_MIN + Math.random() * (this.LIFE_MAX - this.LIFE_MIN);
    }
}
