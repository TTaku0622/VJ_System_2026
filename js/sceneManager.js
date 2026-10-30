// シーンの保持・レイヤーの合成・切替フェードと、ポストシェーダーへの受け渡しを担当する。
//
// **Resolume と同じ「レイヤー」の考え方で動く。**シーンはクリップにあたり、レイヤーに1つずつ
// 載せて下から順に重ねる。各レイヤーは不透明度と合成モードを持つ。
//
//   レイヤー3  白線     加算   100%    ← いちばん上
//   レイヤー2  カメラ   通常    40%
//   レイヤー1  流体     通常   100%    ← いちばん下
//
// キーと MIDI の「シーンの操作」は**選択中のレイヤーに載っているシーン**に届く。
// シーンを載せるとそのレイヤーが選ばれるので、出したシーンの操作がそのまま効く。
class SceneManager {
    constructor() {
        this.scenes = [];
        this.postShader = undefined;

        // フラグメントシェーダー側の bool uniform（u_is○○EffectEnabled）と対応
        this.effects = {
            B: { name: 'BEffect', enabled: false },
            V: { name: 'VEffect', enabled: false },
            N: { name: 'NEffect', enabled: false },
            M: { name: 'MEffect', enabled: false },
        };

        // 同時に有効にしないエフェクトの組み合わせ
        this.exclusivePairs = [['B', 'V'], ['N', 'M']];

        // 画面分割（同じキーをもう一度押すと解除）
        // 16分割は J から , へ移した。J は Scene06 の加工キー（ストロボ）に譲っている
        this.tileLayouts = {
            L: { columns: 2, rows: 1 },
            K: { columns: 2, rows: 2 },
            ',': { columns: 4, rows: 4 },
        };
        this.activeTileKey = null;

        // ---- レイヤー ----
        // **枚数を変えるときは shader/main.frag の u_layerN の組も同じ数にそろえる。**
        // GLSL ES 1.0 ではテクスチャを配列で回せないので、レイヤーごとに書き下してある
        this.LAYER_COUNT = 3;
        this.OPACITY_STEP = 0.1;        // ↑↓ キーで不透明度を動かす幅

        // 合成モード。**並び順が main.frag の u_layerNBlend の値になる**
        this.BLEND_MODES = ['通常', '加算', 'スクリーン', '乗算'];

        // 起動時の合成モード。下の2枚は覆う（通常）、上は黒を透かして線を乗せる（加算）。
        // 全シーンが背景を不透明に塗っているので、通常のままだと下のレイヤーが見えない
        this.DEFAULT_BLENDS = [0, 0, 1];

        // 各レイヤーで出せるシーン（Resolume のクリップの並び）。値はシーン切替キー、null は空き。
        // **MIDI グリッドの列1〜3 がそのままこの表になる**（上の段から順）。
        // SCENE LAUNCH ボタンは横一列（同じ段）をまとめて出す
        this.deck = [
            ['8', '5', '7', '2', '1'],          // レイヤー1  背景（流体 / トンネル / 格子 / 黒 / 白）
            ['6', null, null, null, null],      // レイヤー2  カメラ
            ['9', '3', '4', null, null],        // レイヤー3  上に乗せる線画（白線 / 幾何学 / 同心）
        ];

        this.layers = [];
        for (let i = 0; i < this.LAYER_COUNT; i++) {
            this.layers.push({
                sceneIndex: null,           // 載っているシーン（登録順）。null は空
                opacity: 1.0,
                blendIndex: this.DEFAULT_BLENDS[i] ?? 0,
                bypass: false,              // true の間は合成しない（Resolume の B）
                solo: false,                // どれかがソロなら、ソロのレイヤーだけを出す（Resolume の S）
                fromSceneIndex: null,       // 切替フェード中の、前のシーン
                fadeProgress: 1.0,          // 0.0（前のシーン）→ 1.0（今のシーン）。1.0 なら遷移していない
            });
        }
        this.layers[0].sceneIndex = 0;      // 起動時はレイヤー1に Scene01。触らなければ今までと同じ見た目
        this.selectedLayer = 0;

        // 空のレイヤーに渡す 1×1 の黒。**createGraphics は setup() より前に呼べない**ので setup() で作る
        this.blank = null;

        // キーボードでのレイヤー操作。**アルファベットは全部埋まっている**ので、矢印と記号を使う。
        // [ ] は US 配列と JIS 配列のどちらでもシフト無しで打てる
        this.LAYER_KEYS = {
            prev: 'ArrowLeft',      // 選択レイヤーを左（レイヤー1 側）へ
            next: 'ArrowRight',     // 選択レイヤーを右へ
            up: 'ArrowUp',          // 不透明度 ＋
            down: 'ArrowDown',      // 不透明度 −
            blend: '[',             // 合成モードを循環
            clear: ']',             // レイヤーを空にする
        };

        // ---- 切替フェード（P キー）----
        // レイヤーにシーンを載せ替えるとき、そのレイヤーの中で前のシーンから時間をかけて混ぜる
        // （Resolume のレイヤーの Transition）。既定は OFF（即時切替）。
        // **長さは拍で数える**（tempoManager の BPM）。120 BPM なら 4拍 = 2秒
        this.fadeEnabled = false;
        this.FADE_BEATS = 4;                // 遷移にかける拍数（1小節）
        this.FADE_MAX_STEP_MS = 100;        // 1フレームで進める時間の上限。止まっていた後に一気に終わらないように
        this.tempo = null;                  // setup() で受け取る tempoManager
        this.lastFrameMs = null;

        // ---- 出力全体の明るさ（マスター調光）----
        // **どのシーンを出していても効く。**ポストシェーダーのいちばん最後で掛けるので、
        // エフェクトや画面分割の状態にかかわらず必ず暗くなる。曲間の暗転を手で送るためのもの
        this.BRIGHTNESS_MIN = 0.0;      // 下げきり。真っ黒
        this.BRIGHTNESS_MAX = 1.0;      // 上げきり。そのままの明るさ
        this.brightness = this.BRIGHTNESS_MAX;      // 起動時は明るい側

        // つまみの宣言。BaseScene の knobs と同じ形で、こちらは全シーン共通。
        // **target があるものはその入れ物の property を動かす**（レイヤーの不透明度）
        this.knobs = [
            {
                name: 'brightness',
                label: '明るさ（全体）',
                property: 'brightness',
                min: this.BRIGHTNESS_MIN,
                max: this.BRIGHTNESS_MAX,
            },
        ];
        this.layers.forEach((layer, i) => {
            this.knobs.push({
                name: `opacity${i + 1}`,
                label: `レイヤー${i + 1} 不透明度`,
                target: layer,
                property: 'opacity',
                min: 0,
                max: 1,
            });
        });

        // シーン切替キー: 1..9,0 を登録順の 0..9 番に割り当てる
        this.sceneKeyMap = {
            '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
            '6': 5, '7': 6, '8': 7, '9': 8, '0': 9,
        };
    }

    // preload() から呼ぶ
    loadPostShader(vertFilePath, fragFilePath) {
        this.postShader = loadShader(vertFilePath, fragFilePath);
    }

    addScene(scene) {
        this.scenes.push(scene);
    }

    // tempo は tempoManager。切替フェードの長さを拍で数えるのに使う
    setup(tempo) {
        this.tempo = tempo;
        this.blank = createGraphics(1, 1);
        this.blank.background(0);

        for (let i = 0; i < this.scenes.length; i++) {
            this.scenes[i].setup();
        }
    }

    draw(spectrum) {
        if (this.scenes.length === 0) return;

        this._advanceFades();

        // 合成に使うシーンを集めて、**1シーンにつき1回だけ描く。**同じシーンを2つの
        // レイヤーに載せたとき、2回描くとアニメーションが倍速になってしまう。
        // 出ていない（空・不透明度0・バイパス）レイヤーのシーンは描かないので重さは0
        const drawn = new Set();
        for (const layer of this.layers) {
            if (this.layerOutputOpacity(layer) <= 0) continue;
            drawn.add(layer.sceneIndex);
            if (this._isFading(layer) && layer.fromSceneIndex !== null) drawn.add(layer.fromSceneIndex);
        }
        for (const index of drawn) this.scenes[index].draw(spectrum);

        shader(this.postShader);
        this.postShader.setUniform("u_time", frameCount * 0.01);
        this.postShader.setUniform("u_resolution", [width, height]);
        this.postShader.setUniform("u_vol", this._avg(spectrum, 0, spectrum.length - 1));
        this.postShader.setUniform("u_bass", this._avg(spectrum, 0, 2));
        this.postShader.setUniform("u_mid", this._avg(spectrum, 3, 10));
        this.postShader.setUniform("u_treble", this._avg(spectrum, 11, spectrum.length - 1));

        // uniform 名は 1 始まり（u_layer1〜）。画面や MIDI の表記に合わせている
        this.layers.forEach((layer, i) => this._setLayerUniforms(layer, i + 1));

        for (const effect of Object.values(this.effects)) {
            this.postShader.setUniform(`u_is${effect.name}Enabled`, effect.enabled);
        }

        this.postShader.setUniform("u_brightness", this.brightness);

        const tileLayout = this.activeTileKey ? this.tileLayouts[this.activeTileKey] : { columns: 1, rows: 1 };
        this.postShader.setUniform("u_tileColumns", tileLayout.columns);
        this.postShader.setUniform("u_tileRows", tileLayout.rows);

        rect(0, 0, width, height);
    }

    keyPressed(key) {
        // MIDI から来るレイヤー操作（"slot:1:2" のような命令）。キーボードからは来ない
        if (this._runLayerCommand(key)) return;

        // レイヤー操作キー（矢印・[ ]）。シーンには渡さない
        if (this._handleLayerKey(key)) return;

        // シーンを選択中のレイヤーに載せる
        if (key in this.sceneKeyMap) {
            const index = this.sceneIndexForKey(key);
            if (index !== null) this.launch(this.selectedLayer, index);
        }

        const upperKey = key.toUpperCase();

        // 画面分割
        if (upperKey in this.tileLayouts) {
            this.activeTileKey = this.activeTileKey === upperKey ? null : upperKey;
        }

        // エフェクト（排他ペアは片方を落とす）
        if (upperKey in this.effects) {
            this.effects[upperKey].enabled = !this.effects[upperKey].enabled;
            if (this.effects[upperKey].enabled) {
                for (const [a, b] of this.exclusivePairs) {
                    if (upperKey === a) this.effects[b].enabled = false;
                    if (upperKey === b) this.effects[a].enabled = false;
                }
            }
        }

        // 切替フェードの ON/OFF
        if (upperKey === 'P') {
            this.fadeEnabled = !this.fadeEnabled;
        }

        // 選択中のレイヤーのシーンにキーイベントを渡す
        const scene = this.selectedScene();
        if (scene && typeof scene.keyPressed === 'function') {
            scene.keyPressed(key);
        }
    }

    // つまみ（0.0〜1.0）を受ける。**BaseScene.setKnob と同じ形**にしてあるので、
    // MIDI 側は「全体なら sceneManager、シーン固有なら選択中のシーン」に同じ呼び方で渡せる
    setKnob(name, t) {
        const knob = this.knobs.find((entry) => entry.name === name);
        if (!knob) return false;

        const target = knob.target || this;
        target[knob.property] = knob.min + (knob.max - knob.min) * constrain(t, 0, 1);
        return true;
    }

    // ================= レイヤー =================

    // layerIndex 番のレイヤーにシーンを載せる。**載せたレイヤーが選択される**ので、
    // 出したシーンの操作がそのままキー・MIDI で効く（select = false は Column 用）
    launch(layerIndex, sceneIndex, select = true) {
        const layer = this.layers[layerIndex];
        if (!layer) return;
        if (sceneIndex === null || sceneIndex < 0 || sceneIndex >= this.scenes.length) return;

        if (select) this.selectedLayer = layerIndex;
        if (layer.sceneIndex === sceneIndex) return;
        if (this._isFading(layer)) return;      // 遷移中の多重切替は無視

        // 空のレイヤーへのフェードは、前のシーンの代わりに不透明度を 0 から上げる（layerOutputOpacity）
        if (this.fadeEnabled) {
            layer.fromSceneIndex = layer.sceneIndex;
            layer.fadeProgress = 0;
        }
        layer.sceneIndex = sceneIndex;
    }

    // 横一列（同じ段）をまとめて出す（Resolume の Column）。
    // **空きのマスのレイヤーは触らない。**本番で押したときにカメラが消える、といった事故を避ける
    launchColumn(row) {
        this.layers.forEach((layer, i) => {
            const sceneIndex = this.deckSceneIndex(i, row);
            if (sceneIndex !== null) this.launch(i, sceneIndex, false);
        });
    }

    selectLayer(layerIndex) {
        if (layerIndex < 0 || layerIndex >= this.layers.length) return;
        this.selectedLayer = layerIndex;
    }

    // レイヤーを空にする（Resolume の Clear / Eject）
    clearLayer(layerIndex) {
        const layer = this.layers[layerIndex];
        if (!layer) return;

        layer.sceneIndex = null;
        layer.fromSceneIndex = null;
        layer.fadeProgress = 1.0;
    }

    toggleBypass(layerIndex) {
        const layer = this.layers[layerIndex];
        if (layer) layer.bypass = !layer.bypass;
    }

    toggleSolo(layerIndex) {
        const layer = this.layers[layerIndex];
        if (layer) layer.solo = !layer.solo;
    }

    cycleBlend(layerIndex) {
        const layer = this.layers[layerIndex];
        if (layer) layer.blendIndex = (layer.blendIndex + 1) % this.BLEND_MODES.length;
    }

    // ソロが1つでもあればソロのレイヤーだけ、無ければバイパスしていないレイヤーを出す
    isLayerVisible(layer) {
        const anySolo = this.layers.some((entry) => entry.solo);
        return anySolo ? layer.solo : !layer.bypass;
    }

    // 実際に合成へ掛かる不透明度。空・バイパス・ソロの外は 0
    layerOutputOpacity(layer) {
        if (layer.sceneIndex === null || !this.isLayerVisible(layer)) return 0;

        // 空のレイヤーへの切替フェードは、不透明度を 0 から上げて出す
        if (this._isFading(layer) && layer.fromSceneIndex === null) return layer.opacity * layer.fadeProgress;
        return layer.opacity;
    }

    isTransitioning() {
        return this.layers.some((layer) => this._isFading(layer));
    }

    // どこかのレイヤーで出ているか（MIDI の LED 用）
    isScenePlaying(sceneIndex) {
        return this.layers.some((layer) => layer.sceneIndex === sceneIndex);
    }

    // 選択中のレイヤーに載っているシーン。空なら undefined
    selectedScene() {
        const index = this.layers[this.selectedLayer].sceneIndex;
        return index === null ? undefined : this.scenes[index];
    }

    // デッキの layerIndex 列・row 段（どちらも 0 始まり）のシーン。空きなら null
    deckSceneIndex(layerIndex, row) {
        const key = (this.deck[layerIndex] || [])[row];
        return key ? this.sceneIndexForKey(key) : null;
    }

    sceneIndexForKey(key) {
        if (!(key in this.sceneKeyMap)) return null;
        const index = this.sceneKeyMap[key];
        return index < this.scenes.length ? index : null;
    }

    sceneName(index) {
        const scene = this.scenes[index];
        return scene ? (scene.title || scene.constructor.name) : '';
    }

    // ---- MIDI の命令 ----
    //
    //   slot:<レイヤー>:<段>   そのレイヤーの段のシーンを出す（中身は deck）
    //   column:<段>           横一列をまとめて出す
    //   select / clear / bypass / solo / blend:<レイヤー>
    //
    // 数字は 1 始まり（盤面の列・段の数え方に合わせている）

    // 命令をばらす。命令でなければ null
    parseLayerCommand(command) {
        const match = /^(slot|column|select|clear|bypass|solo|blend):(\d+)(?::(\d+))?$/.exec(String(command));
        if (!match) return null;

        return {
            type: match[1],
            index: Number(match[2]) - 1,
            row: match[3] === undefined ? null : Number(match[3]) - 1,
        };
    }

    // 命令の状態。LED の点灯に使う（slot は 'empty' / 'playing' / 'ready'、それ以外は true / false）
    layerCommandState(command) {
        const parsed = this.parseLayerCommand(command);
        if (!parsed) return null;

        const layer = this.layers[parsed.index];
        if (parsed.type === 'column') return false;
        if (!layer) return null;

        switch (parsed.type) {
            case 'slot': {
                const sceneIndex = this.deckSceneIndex(parsed.index, parsed.row);
                if (sceneIndex === null) return 'empty';
                return layer.sceneIndex === sceneIndex ? 'playing' : 'ready';
            }
            case 'select': return parsed.index === this.selectedLayer;
            case 'clear': return layer.sceneIndex !== null;
            case 'bypass': return !layer.bypass;           // ACTIVATOR は「出ている」で点灯（Ableton と同じ）
            case 'solo': return layer.solo;
            case 'blend': return layer.blendIndex !== 0;    // 通常以外のときに点灯
            default: return null;
        }
    }

    // 画面や監視モードに出す名前
    commandLabel(command) {
        const parsed = this.parseLayerCommand(command);
        if (!parsed) return null;

        const layerName = `L${parsed.index + 1}`;
        switch (parsed.type) {
            case 'slot': return `${layerName} ${parsed.row + 1}段目`;
            case 'column': return `${parsed.index + 1}段目をまとめて`;
            case 'select': return `${layerName} を選択`;
            case 'clear': return `${layerName} を空に`;
            case 'bypass': return `${layerName} バイパス`;
            case 'solo': return `${layerName} ソロ`;
            case 'blend': return `${layerName} 合成モード`;
            default: return null;
        }
    }

    // 選択中のレイヤーに載っているシーンの切替キー（'1'〜'9' '0'）。
    // MIDI はこのキーで「いまどのシーンの表を見るか」を決める。空のレイヤーなら null
    currentSceneKey() {
        const index = this.layers[this.selectedLayer].sceneIndex;
        return index === null ? null : this.sceneKeyForIndex(index);
    }

    // 登録順 → 切替キー。10 個を超えたぶんには切替キーが無いので null
    sceneKeyForIndex(index) {
        if (index < 0 || index >= 10) return null;
        return index < 9 ? String(index + 1) : '0';
    }

    // ================= 内部 =================

    _runLayerCommand(command) {
        const parsed = this.parseLayerCommand(command);
        if (!parsed) return false;

        switch (parsed.type) {
            case 'slot': this.launch(parsed.index, this.deckSceneIndex(parsed.index, parsed.row)); break;
            case 'column': this.launchColumn(parsed.index); break;
            case 'select': this.selectLayer(parsed.index); break;
            case 'clear': this.clearLayer(parsed.index); break;
            case 'bypass': this.toggleBypass(parsed.index); break;
            case 'solo': this.toggleSolo(parsed.index); break;
            case 'blend': this.cycleBlend(parsed.index); break;
        }
        return true;
    }

    _handleLayerKey(key) {
        const keys = this.LAYER_KEYS;
        const layer = this.layers[this.selectedLayer];

        switch (key) {
            case keys.prev:
                this.selectLayer(this.selectedLayer - 1);
                return true;
            case keys.next:
                this.selectLayer(this.selectedLayer + 1);
                return true;
            case keys.up:
                layer.opacity = constrain(layer.opacity + this.OPACITY_STEP, 0, 1);
                return true;
            case keys.down:
                layer.opacity = constrain(layer.opacity - this.OPACITY_STEP, 0, 1);
                return true;
            case keys.blend:
                this.cycleBlend(this.selectedLayer);
                return true;
            case keys.clear:
                this.clearLayer(this.selectedLayer);
                return true;
            default:
                return false;
        }
    }

    _isFading(layer) {
        return layer.fadeProgress < 1.0;
    }

    // **経過時間 × いまの BPM で進める。**拍の位置（tempo.beats()）の差で数えると、
    // NUDGE や「頭をそろえる」で拍の位置が飛んだときにフェードまで飛んでしまう
    _advanceFades() {
        const now = performance.now();
        const elapsed = this.lastFrameMs === null ? 0 : Math.min(now - this.lastFrameMs, this.FADE_MAX_STEP_MS);
        this.lastFrameMs = now;

        const bpm = this.tempo ? this.tempo.bpm : 120;
        const step = elapsed * bpm / 60000 / this.FADE_BEATS;

        for (const layer of this.layers) {
            if (!this._isFading(layer)) continue;

            layer.fadeProgress += step;
            if (layer.fadeProgress >= 1.0) {
                layer.fadeProgress = 1.0;
                layer.fromSceneIndex = null;
            }
        }
    }

    // **出ていないレイヤーには 1×1 の黒を渡す。**2D のシーンはテクスチャとして毎フレーム
    // 転送されるので、描いていないシーンの大きなバッファを渡すと無駄に重くなる
    _setLayerUniforms(layer, number) {
        const opacity = this.layerOutputOpacity(layer);
        const active = opacity > 0;
        const current = active ? this.scenes[layer.sceneIndex].getScene() : this.blank;
        const fading = active && this._isFading(layer) && layer.fromSceneIndex !== null;
        const from = fading ? this.scenes[layer.fromSceneIndex].getScene() : current;

        this.postShader.setUniform(`u_layer${number}Tex`, current);
        this.postShader.setUniform(`u_layer${number}FromTex`, from);
        this.postShader.setUniform(`u_layer${number}Fade`, fading ? layer.fadeProgress : 1.0);
        this.postShader.setUniform(`u_layer${number}Opacity`, opacity);
        this.postShader.setUniform(`u_layer${number}Blend`, layer.blendIndex);
    }

    _avg(spectrum, start, end) {
        let sum = 0;
        let count = 0;
        for (let i = start; i <= end && i < spectrum.length; i++) {
            sum += spectrum[i];
            count++;
        }
        return count > 0 ? sum / count : 0;
    }
}
