// 出力ウィンドウ（index.html）と操作ウィンドウ（control.html）をつなぐ通信路。
//
// BroadcastChannel は同一オリジンのウィンドウ間でそのまま使える。サーバーもライブラリも要らない。
// window.opener.postMessage ではなくこちらを使っているのは、**どちらかのウィンドウを
// リロードしても勝手に繋ぎ直る**ため。本番で出力側を1回読み込み直しただけで
// 操作画面が死ぬのを避けたい。
//
// 注意: 2つのウィンドウは同じ URL（ホストとポート）で開くこと。
// localhost:5502 と 127.0.0.1:5503 は別オリジンなので通信できない。
class StatusBus {
    constructor(channelName = 'vj-status') {
        this.channel = new BroadcastChannel(channelName);

        // 何フレームおきに送るか。60fps なら毎秒15回で、メーターの表示には十分
        this.PUBLISH_INTERVAL = 4;
        this.frame = 0;
    }

    // 出力側から draw() の中で呼ぶ。毎フレーム送るのは無駄なので間引く。
    // 状態表示のために本番の描画が落ちては本末転倒なので、何が起きても例外を外に出さない
    publishFrom(sceneManager, audioManager, cameraManager, spectrum) {
        this.frame++;
        if (this.frame % this.PUBLISH_INTERVAL !== 0) return;

        try {
            this.channel.postMessage(this._collect(sceneManager, audioManager, cameraManager, spectrum));
        } catch (error) {
            // 送れなくても出力は続ける
        }
    }

    // 操作側から呼ぶ
    onUpdate(handler) {
        this.channel.onmessage = (event) => handler(event.data);
    }

    _collect(sceneManager, audioManager, cameraManager, spectrum) {
        const scene = sceneManager.scenes[sceneManager.sceneIndex];
        const sceneIndex = sceneManager.sceneIndex;

        return {
            fps: Math.round(frameRate()),
            scene: {
                index: sceneIndex,
                key: sceneIndex < 9 ? String(sceneIndex + 1) : '0',   // 登録順が 1..9,0 に対応
                name: scene ? (scene.title || scene.constructor.name) : '-',
                total: sceneManager.scenes.length,
            },
            fade: {
                enabled: sceneManager.fadeEnabled,
                transitioning: sceneManager.transitioning,
            },
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
            // 切替を宣言しているシーンのときだけ入る
            mode: this._collectMode(scene),
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
