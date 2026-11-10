// ワイヤーフレームの地形（名前 'terrain'。数字キーなし、デッキか操作画面から出す）
//
// VJ の定番の「レトロウェーブ（シンセウェーブ）」。地平線の縞模様の太陽に向かって、
// 方眼の地面の上を走り続ける。真ん中は平らな道で、左右に方眼の山が盛り上がる。
//
// 描き方: 2D のキャンバスに、自分で遠近の計算をして描く（WEBGL の線は本数が多いと重いため）。
// 奥の帯から手前の帯へ順に「帯の面を地面の色で塗る → 帯の線を引く」をくり返すので、
// 手前の山が奥の線を隠す（画家のアルゴリズム）。
//
//   拍の頭      線が明るくなり、太陽が少しふくらむ
//   低域        走る速さが上がる
//
// キー: A ネオン（紫の空と太陽）/ S 白黒（黒地に白線だけ。他のレイヤーに加算で重ねる用）
class Scene17 extends BaseScene {
    constructor() {
        super();                        // 2D。線のアンチエイリアスが効く

        this.title = 'ワイヤーの地形';

        this.modes = { keys: ['A', 'S'], labels: ['ネオン', '白黒'] };

        // ---- 地面の方眼（単位は「方眼1マス」）----
        this.COLS = 40;                 // 横のマス数
        this.X_RANGE = 20;              // 左右の端（中心からのマス数）
        this.ROWS = 44;                 // 奥行きのマス数
        this.NEAR = 1.5;                // いちばん手前の帯までの距離（行の位置は 0.5〜1.5 を動く）
        this.CAMERA_HEIGHT = 1.4;       // カメラの高さ
        this.FOCAL = 0.9;               // 焦点距離（画面の高さ比）。大きいほど望遠
        this.HORIZON = 0.52;            // 地平線の高さ（画面の上から、画面の高さ比）

        // ---- 山 ----
        this.ROAD_HALF = 2.5;           // 真ん中の平らな道の半分の幅
        this.MOUNTAIN_RISE = 6;         // 道の端から山が立ち上がりきるまでの幅
        this.MOUNTAIN_HEIGHT = 7;       // 山の高さの最大
        this.NOISE_SCALE = 0.16;        // 山の起伏の細かさ

        // ---- 走る ----
        this.SPEED = 5;                 // マス/秒
        this.BASS_SPEED = 8;            // 低域で上乗せする速さ
        this.BASS_SMOOTH = 0.1;

        // ---- 見た目 ----
        this.LINE_WEIGHT = 1.6;
        this.GLOW_WEIGHT = 5;
        this.GLOW_ALPHA = 60;
        this.BEAT_FLASH = 0.6;          // 拍の頭で線が明るくなる量
        this.BEAT_SHARPNESS = 3;
        this.FOG_START = 0.35;          // 奥行きのこの割合から先は線が地平線の色に溶ける
        this.HORIZON_GLOW = 0.05;       // 地平線の上のぼんやりした光の高さ（画面の高さ比）

        this.NEON = {
            skyTop: [12, 4, 40],
            skyHorizon: [120, 20, 110],
            ground: [10, 2, 24],
            line: [255, 60, 200],       // マゼンタ
            lineFar: [90, 200, 255],    // 奥はシアンへ
            sunTop: [255, 230, 90],
            sunBottom: [255, 40, 150],
        };
        this.MONO = {
            skyTop: [0, 0, 0],
            skyHorizon: [0, 0, 0],
            ground: [0, 0, 0],
            line: [255, 255, 255],
            lineFar: [160, 160, 160],
        };

        // ---- 太陽（ネオンだけ）----
        this.SUN_RADIUS = 0.26;         // 画面の高さ比
        this.SUN_RISE = 0.6;            // 中心が地平線から上にある量（半径比）
        this.SUN_STRIPE_TOP = -0.25;    // 切れ目が始まる高さ（中心からの半径比。負は中心より上）
        this.SUN_STRIPES = 6;           // 切れ目の本数（始まりから地平線まで）
        this.SUN_STRIPE_SPEED = 0.25;   // 切れ目が下へ流れる速さ（本/秒）
        this.SUN_PULSE = 0.04;

        this.STAR_COUNT = 90;

        this.travel = 0;
        this.bassLevel = 0;
        this.lastMs = null;
        this.stars = [];
        this.heights = [];
    }

    setup() {
        for (let i = 0; i < this.STAR_COUNT; i++) {
            this.stars.push({ x: Math.random(), y: Math.random() * this.HORIZON * 0.9, phase: Math.random() * 6.28, size: 1 + Math.random() * 1.5 });
        }
    }

    draw(spectrum) {
        const now = millis() / 1000;
        const dt = this.lastMs === null ? 0 : Math.min(now - this.lastMs, 0.05);
        this.lastMs = now;
        this.bassLevel += (this.bass(spectrum) - this.bassLevel) * this.BASS_SMOOTH;
        this.travel += (this.SPEED + this.BASS_SPEED * this.bassLevel) * dt;

        const colors = this.modeIndex === 0 ? this.NEON : this.MONO;
        const flash = this.BEAT_FLASH * Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS);

        this._sky(colors, now);
        if (this.modeIndex === 0) this._sun(colors, now);
        this._horizon(colors, flash);
        this._ground(colors, flash);
    }

    // 地平線の光る線。奥の方眼は地平線の色に溶かしてあるので、境目がぼやけないよう1本引く。
    // **地面より先に描く**（後に描くと山の手前を横切ってしまった）。山がある所は地面の塗りで隠れる
    _horizon(colors, flash) {
        const pg = this.pg;
        const ctx = pg.drawingContext;
        const y = this.HORIZON * pg.height;
        const [r, g, b] = colors.lineFar;
        const glow = ctx.createLinearGradient(0, y - this.HORIZON_GLOW * pg.height, 0, y);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${0.35 + 0.3 * flash})`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, y - this.HORIZON_GLOW * pg.height, pg.width, this.HORIZON_GLOW * pg.height);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
        ctx.lineWidth = this.LINE_WEIGHT * pg.height / 720;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(pg.width, y);
        ctx.stroke();
    }

    keyPressed(key) {
        this.handleModeKey(key);
    }

    // ---- 空 ----

    _sky(colors, now) {
        const pg = this.pg;
        const ctx = pg.drawingContext;
        const horizonY = this.HORIZON * pg.height;
        const gradient = ctx.createLinearGradient(0, 0, 0, horizonY);
        gradient.addColorStop(0, this._rgb(colors.skyTop));
        gradient.addColorStop(1, this._rgb(colors.skyHorizon));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, pg.width, horizonY + 1);
        ctx.fillStyle = this._rgb(colors.ground);
        ctx.fillRect(0, horizonY, pg.width, pg.height - horizonY);

        // 星（白黒のときは出さない。重ねたときにちらつくだけなので）
        if (this.modeIndex !== 0) return;
        pg.noStroke();
        for (const star of this.stars) {
            const twinkle = 0.5 + 0.5 * Math.sin(now * 2 + star.phase);
            pg.fill(255, 255, 255, 80 + 150 * twinkle);
            pg.circle(star.x * pg.width, star.y * pg.height, star.size);
        }
    }

    // 縞の入った太陽。下半分に横の切れ目があり、下ほど太い切れ目がゆっくり下へ流れる
    _sun(colors, now) {
        const pg = this.pg;
        const ctx = pg.drawingContext;
        const pulse = 1 + this.SUN_PULSE * Math.pow(1 - this.beatPhase(), this.BEAT_SHARPNESS);
        const radius = this.SUN_RADIUS * pg.height * pulse;
        const cx = pg.width / 2;
        const cy = this.HORIZON * pg.height - radius * this.SUN_RISE;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();

        const gradient = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
        gradient.addColorStop(0, this._rgb(colors.sunTop));
        gradient.addColorStop(1, this._rgb(colors.sunBottom));
        ctx.fillStyle = gradient;

        // 下のほうを切れ目で刻む。切れ目は下へ行くほど太く、ゆっくり下へ流れる。
        // 地平線より下は地面に隠れるので、切れ目は始まりから地平線までに収める
        const top = cy - radius;
        const stripeTop = cy + this.SUN_STRIPE_TOP * radius;
        const horizonY = this.HORIZON * pg.height;
        const band = (horizonY - stripeTop) / this.SUN_STRIPES;
        const shift = (now * this.SUN_STRIPE_SPEED) % 1;
        ctx.beginPath();
        ctx.rect(cx - radius, top, radius * 2, stripeTop - top);    // 上は切れ目なし
        for (let k = -1; k < this.SUN_STRIPES + 1; k++) {
            const y0 = stripeTop + (k + shift) * band;
            const t = Math.max(0, (k + shift) / this.SUN_STRIPES);
            const gap = band * (0.12 + 0.55 * t);
            const yStart = Math.max(stripeTop, y0 + gap);
            const yEnd = y0 + band;
            if (yEnd > yStart) ctx.rect(cx - radius, yStart, radius * 2, yEnd - yStart);
        }
        ctx.fill();
        ctx.restore();

        // 太陽のまわりのぼんやりした光
        const glow = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.8);
        glow.addColorStop(0, 'rgba(255, 80, 170, 0.25)');
        glow.addColorStop(1, 'rgba(255, 80, 170, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - radius * 2, cy - radius * 2, radius * 4, radius * 2 + radius * this.SUN_RISE);
    }

    // ---- 地面 ----

    _height(x, z) {
        const side = Math.abs(x) - this.ROAD_HALF;
        if (side <= 0) return 0;
        const rise = Math.min(1, side / this.MOUNTAIN_RISE);
        const eased = rise * rise * (3 - 2 * rise);
        return eased * this.MOUNTAIN_HEIGHT * noise(x * this.NOISE_SCALE + 100, z * this.NOISE_SCALE);
    }

    _ground(colors, flash) {
        const pg = this.pg;
        const ctx = pg.drawingContext;
        const w = pg.width;
        const h = pg.height;
        const focal = this.FOCAL * h;
        const horizonY = this.HORIZON * h;
        const cx = w / 2;

        // 格子点を投影しておく。行 i は奥行き、列 j は横
        const firstRow = Math.floor(this.travel);
        const points = [];
        for (let i = 0; i <= this.ROWS; i++) {
            const zWorld = firstRow + i;
            const z = zWorld - this.travel + this.NEAR;
            const row = [];
            for (let j = 0; j <= this.COLS; j++) {
                const x = -this.X_RANGE + (2 * this.X_RANGE * j) / this.COLS;
                const y = this._height(x, zWorld);
                row.push([cx + (x / z) * focal, horizonY + ((this.CAMERA_HEIGHT - y) / z) * focal]);
            }
            points.push(row);
        }

        ctx.lineJoin = 'round';
        // 奥の帯から順に。帯 i は行 i と行 i+1 のあいだ
        for (let i = this.ROWS - 1; i >= 0; i--) {
            const near = points[i];
            const far = points[i + 1];

            // 帯の面を地面の色で塗って、奥の線を隠す
            ctx.beginPath();
            for (let j = 0; j < this.COLS; j++) {
                ctx.moveTo(near[j][0], near[j][1]);
                ctx.lineTo(near[j + 1][0], near[j + 1][1]);
                ctx.lineTo(far[j + 1][0], far[j + 1][1]);
                ctx.lineTo(far[j][0], far[j][1]);
                ctx.closePath();
            }
            ctx.fillStyle = this._rgb(colors.ground);
            ctx.fill();

            // 帯の線: 手前の横線と、奥へ向かう縦線
            ctx.beginPath();
            ctx.moveTo(near[0][0], near[0][1]);
            for (let j = 1; j <= this.COLS; j++) ctx.lineTo(near[j][0], near[j][1]);
            for (let j = 0; j <= this.COLS; j++) {
                ctx.moveTo(near[j][0], near[j][1]);
                ctx.lineTo(far[j][0], far[j][1]);
            }

            // 奥ほど地平線の色に溶かす
            const depth = (i + 1 - (this.travel % 1)) / this.ROWS;
            const fog = Math.min(1, Math.max(0, (depth - this.FOG_START) / (1 - this.FOG_START)));
            const lineColor = this._mix(colors.line, colors.lineFar, Math.min(1, depth * 1.5));
            const bright = (1 - fog) * (1 + flash);
            const fadedColor = this._mix(colors.ground, lineColor, Math.min(1, bright));
            const hot = this._mix(fadedColor, [255, 255, 255], Math.max(0, bright - 1) * 0.7);

            ctx.strokeStyle = this._rgb(hot, this.GLOW_ALPHA / 255);
            ctx.lineWidth = this.GLOW_WEIGHT;
            ctx.stroke();
            ctx.strokeStyle = this._rgb(hot);
            ctx.lineWidth = this.LINE_WEIGHT;
            ctx.stroke();
        }
    }

    _mix(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }

    _rgb(c, alpha = 1) {
        return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;
    }
}
