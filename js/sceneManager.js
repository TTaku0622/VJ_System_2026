// シーンの保持・切替・クロスフェードと、ポストシェーダーへの受け渡しを担当する
class SceneManager {
    constructor() {
        this.scenes = [];
        this.sceneIndex = 0;
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

        // クロスフェード。既定は OFF（切替は即時）。P キーで ON にできる
        this.fadeEnabled = false;
        this.transitioning = false;
        this.fadeProgress = 0;       // 0.0（旧シーン）→ 1.0（新シーン）
        this.fadeDuration = 90;      // 遷移にかけるフレーム数
        this.fromSceneIndex = 0;
        this.pendingSceneIndex = null;

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

    setup() {
        for (let i = 0; i < this.scenes.length; i++) {
            this.scenes[i].setup();
        }
    }

    draw(spectrum) {
        if (this.scenes.length === 0) return;

        // クロスフェード進行
        if (this.transitioning) {
            this.fadeProgress += 1.0 / this.fadeDuration;
            if (this.fadeProgress >= 1.0) {
                this.fadeProgress = 1.0;
                this.sceneIndex = this.pendingSceneIndex;
                this.transitioning = false;
            }
        }

        // 遷移中は両シーンを描画し、それ以外は現在のシーンのみ
        if (this.transitioning) {
            this.scenes[this.fromSceneIndex].draw(spectrum);
            this.scenes[this.pendingSceneIndex].draw(spectrum);
        } else {
            this.scenes[this.sceneIndex].draw(spectrum);
        }

        shader(this.postShader);
        this.postShader.setUniform("u_time", frameCount * 0.01);
        this.postShader.setUniform("u_resolution", [width, height]);
        this.postShader.setUniform("u_vol", this._avg(spectrum, 0, spectrum.length - 1));
        this.postShader.setUniform("u_bass", this._avg(spectrum, 0, 2));
        this.postShader.setUniform("u_mid", this._avg(spectrum, 3, 10));
        this.postShader.setUniform("u_treble", this._avg(spectrum, 11, spectrum.length - 1));

        if (this.transitioning) {
            // 2つのシーンテクスチャをシェーダーに渡してクロスフェード
            this.postShader.setUniform("u_tex", this.scenes[this.fromSceneIndex].getScene());
            this.postShader.setUniform("u_tex2", this.scenes[this.pendingSceneIndex].getScene());
            this.postShader.setUniform("u_fade", this.fadeProgress);
        } else {
            this.postShader.setUniform("u_tex", this.scenes[this.sceneIndex].getScene());
            this.postShader.setUniform("u_tex2", this.scenes[this.sceneIndex].getScene());
            this.postShader.setUniform("u_fade", 0.0);
        }

        for (const effect of Object.values(this.effects)) {
            this.postShader.setUniform(`u_is${effect.name}Enabled`, effect.enabled);
        }

        const tileLayout = this.activeTileKey ? this.tileLayouts[this.activeTileKey] : { columns: 1, rows: 1 };
        this.postShader.setUniform("u_tileColumns", tileLayout.columns);
        this.postShader.setUniform("u_tileRows", tileLayout.rows);

        rect(0, 0, width, height);
    }

    keyPressed(key) {
        // シーン切替
        if (key in this.sceneKeyMap && this.sceneKeyMap[key] < this.scenes.length) {
            this.changeScene(this.sceneKeyMap[key]);
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

        // クロスフェードの ON/OFF
        if (upperKey === 'P') {
            this.fadeEnabled = !this.fadeEnabled;
        }

        // 現在のシーンにキーイベントを渡す
        const scene = this.scenes[this.sceneIndex];
        if (scene && typeof scene.keyPressed === 'function') {
            scene.keyPressed(key);
        }
    }

    changeScene(newIndex) {
        if (newIndex === this.sceneIndex || newIndex >= this.scenes.length) return;

        if (this.fadeEnabled) {
            if (this.transitioning) return;     // 遷移中の多重切替は無視
            this.fromSceneIndex = this.sceneIndex;
            this.pendingSceneIndex = newIndex;
            this.transitioning = true;
            this.fadeProgress = 0;
        } else {
            this.sceneIndex = newIndex;
            this.transitioning = false;
        }
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
