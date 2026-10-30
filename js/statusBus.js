// 出力ウィンドウ（index.html）と操作ウィンドウ（control.html）をつなぐ通信路。
//
// BroadcastChannel は同一オリジンのウィンドウ間でそのまま使える。サーバーもライブラリも要らない。
// window.opener.postMessage ではなくこちらを使っているのは、**どちらかのウィンドウを
// リロードしても勝手に繋ぎ直る**ため。本番で出力側を1回読み込み直しただけで
// 操作画面が死ぬのを避けたい。
//
// 注意: 2つのウィンドウは同じ URL（ホストとポート）で開くこと。
// localhost:5502 と 127.0.0.1:5503 は別オリジンなので通信できない。
//
// 逆向き（操作 → 出力）の命令は別の channel で送る。中身はキーや命令の文字列
// （'tempo:set:128' など）で、出力側は **sketch.js の handleKey() にそのまま流す**。
// キーボード・MIDI と同じ入口なので、操作画面に新しいボタンを足しても出力側は書き足さなくてよい。
class StatusBus {
    constructor(channelName = 'vj-status') {
        this.channel = new BroadcastChannel(channelName);
        this.commandChannel = new BroadcastChannel(`${channelName}-command`);

        // 何フレームおきに送るか。60fps なら毎秒15回で、メーターの表示には十分
        this.PUBLISH_INTERVAL = 4;
        this.frame = 0;
    }

    // 出力側から draw() の中で呼ぶ。毎フレーム送るのは無駄なので間引く。
    // 状態表示のために本番の描画が落ちては本末転倒なので、何が起きても例外を外に出さない
    publishFrom(sceneManager, audioManager, cameraManager, midiManager, spectrum, tempoManager) {
        this.frame++;
        if (this.frame % this.PUBLISH_INTERVAL !== 0) return;

        try {
            this.channel.postMessage(
                this._collect(sceneManager, audioManager, cameraManager, midiManager, spectrum, tempoManager));
        } catch (error) {
            // 送れなくても出力は続ける
        }
    }

    // 操作側から呼ぶ
    onUpdate(handler) {
        this.channel.onmessage = (event) => handler(event.data);
    }

    // 操作側から呼ぶ。key はキーか命令の文字列
    sendCommand(key) {
        this.commandChannel.postMessage({ key: String(key) });
    }

    // 出力側から呼ぶ。命令の処理で例外が出ても、出力の描画は止めない
    onCommand(handler) {
        this.commandChannel.onmessage = (event) => {
            const key = event.data && event.data.key;
            if (typeof key !== 'string') return;
            try {
                handler(key);
            } catch (error) {
                console.warn('[status] 操作画面からの命令を処理できなかった', key, error);
            }
        };
    }

    _collect(sceneManager, audioManager, cameraManager, midiManager, spectrum, tempoManager) {
        // 「いまのシーン」は選択中のレイヤーに載っているシーン（キーと MIDI が届く先）
        const scene = sceneManager.selectedScene();

        return {
            fps: Math.round(frameRate()),
            scene: {
                key: sceneManager.currentSceneKey(),     // 登録順が 1..9,0 に対応。空のレイヤーなら null
                name: scene ? (scene.title || scene.constructor.name) : '',
                layer: sceneManager.selectedLayer + 1,
            },
            fade: {
                enabled: sceneManager.fadeEnabled,
                transitioning: sceneManager.isTransitioning(),
            },
            layers: this._collectLayers(sceneManager),
            tempo: this._collectTempo(tempoManager),
            tile: sceneManager.activeTileKey,
            effects: Object.entries(sceneManager.effects).map(([key, effect]) => ({
                key,
                name: effect.name,
                enabled: effect.enabled,
            })),
            audio: {
                source: audioManager.source,
                level: this._avg(spectrum, 0, spectrum.length - 1),
                bass: this._avg(spectrum, 0, 2),
                mid: this._avg(spectrum, 3, 10),
                treble: this._avg(spectrum, 11, spectrum.length - 1),
            },
            camera: {
                ready: cameraManager.isReady(),
                label: cameraManager.label(),
                index: cameraManager.deviceIndex,
                total: cameraManager.devices.length,
            },
            midi: {
                ready: midiManager.isReady(),
                device: midiManager.deviceName,
                monitor: midiManager.monitor,
                led: midiManager.ledReady(),
                learning: midiManager.learning,
                learnDone: midiManager.learnIndex,
                learnTotal: midiManager.learnItems.length,
                stored: midiManager.usingStored,
                last: midiManager.lastMessage,
                error: midiManager.error,
            },
            // 切替を宣言しているシーンのときだけ入る
            mode: this._collectMode(scene),
            // つまみを宣言しているシーンのときだけ入る
            knobs: this._collectKnobs(sceneManager, scene),
        };
    }

    // BaseScene の modes 宣言から現在の切替を拾う。宣言していないシーンでは null。
    // 「1キーで循環」と「キーごとに直接選択」の違いはここで吸収して、
    // 操作画面側は options をそのまま並べるだけで済むようにする
    _collectMode(scene) {
        if (!scene || !scene.modes) return null;

        const { keys, labels } = scene.modes;
        const cycle = keys.length === 1;

        return {
            index: scene.modeIndex,
            label: labels[scene.modeIndex] || '',
            key: cycle ? keys[0] : keys[scene.modeIndex],
            cycle,
            options: labels.map((label, i) => ({ label, key: cycle ? keys[0] : keys[i] })),
        };
    }

    // テンポ。**拍の位置は「送った時刻にこの拍数だった」で渡す。**ウィンドウごとに
    // performance.now() の起点が違うので、操作画面は Date.now() との差から拍を進めて点滅させる
    // （毎秒15回の送信だけで点滅させるとガタつく）
    _collectTempo(tempoManager) {
        if (!tempoManager) return null;

        return {
            bpm: tempoManager.bpm,
            beats: tempoManager.beats(),
            sentAt: Date.now(),
            beatsPerBar: tempoManager.BEATS_PER_BAR,
            min: tempoManager.BPM_MIN,
            max: tempoManager.BPM_MAX,
        };
    }

    // レイヤーの一覧。操作画面は左からレイヤー1・2・3（APC40 の列と同じ並び）で出す
    _collectLayers(sceneManager) {
        return sceneManager.layers.map((layer, i) => {
            const playing = layer.sceneIndex;

            return {
                number: i + 1,
                selected: i === sceneManager.selectedLayer,
                key: playing === null ? null : sceneManager.sceneKeyForIndex(playing),
                name: playing === null ? '' : sceneManager.sceneName(playing),
                opacity: layer.opacity,
                output: sceneManager.layerOutputOpacity(layer),     // 実際に掛かっている強さ
                blend: sceneManager.BLEND_MODES[layer.blendIndex],
                bypass: layer.bypass,
                solo: layer.solo,
                fading: layer.fadeProgress < 1.0,
                // デッキ（このレイヤーで出せるシーン。上の段から）
                deck: (sceneManager.deck[i] || []).map((key) => {
                    const index = key ? sceneManager.sceneIndexForKey(key) : null;
                    return index === null ? null : { key, name: sceneManager.sceneName(index) };
                }),
            };
        });
    }

    // つまみの現在値。**手元のノブを見ても今どこかは分からない**（絶対値で送られるので、
    // シーンを切り替えるとノブの位置と実際の値がずれる）ので、数字で見えるようにしておく。
    // レイヤーの不透明度（target 付き）はレイヤーのカードに出すので、ここには入れない
    _collectKnobs(sceneManager, scene) {
        const entries = [];

        // 全体のつまみ → 選択中のシーンのつまみ の順に並べる
        for (const knob of sceneManager.knobs || []) {
            if (knob.target) continue;
            entries.push(this._knobState(sceneManager, knob));
        }
        for (const knob of (scene && scene.knobs) || []) entries.push(this._knobState(scene, knob));

        return entries.length > 0 ? entries : null;
    }

    _knobState(target, knob) {
        const value = target[knob.property];

        return {
            label: knob.label,
            value,
            ratio: (value - knob.min) / (knob.max - knob.min),
        };
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
