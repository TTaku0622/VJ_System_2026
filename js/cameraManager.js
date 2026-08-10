// カメラの取得・切替を1箇所にまとめるクラス
// 同じデバイスをシーンごとに createCapture すると USB の帯域を二重に食うので、
// ここで1本だけ開いてシーンから参照する（カメラを使うシーンが増えても共有できる）。
//
// 使い方:
//   cameraManager.setup();            // setup() から1度だけ
//   if (cameraManager.isReady()) { shader.setUniform('u_cam', cameraManager.get()); }
class CameraManager {
    constructor() {
        // 720p / 30fps。camera-setup.md の「3台同時なら720pに固定」に合わせる。
        // 非圧縮の 1080p は1台で USB2.0 の帯域を使い切る
        this.CAPTURE_WIDTH = 1280;
        this.CAPTURE_HEIGHT = 720;
        this.CAPTURE_FPS = 30;

        // 開いてからこの時間まで映像が来なければコンソールに警告を出す（ミリ秒）
        this.WARN_DELAY = 3000;

        this.capture = undefined;
        this.devices = [];          // videoinput の一覧（{ deviceId, label }）
        this.deviceIndex = 0;
        this.listing = false;       // 一覧の取得中フラグ（毎フレーム投げないため）
        this.openedAt = 0;
        this.warned = false;
    }

    // setup() から呼ぶ。最初は既定のカメラを開く。
    // デバイスの一覧はカメラの許可が下りるまで取れないので、開いたあとで取り直す
    setup() {
        this._open();
    }

    // 映像が使える状態か。false の間はシーン側で描画をスキップする。
    // p5 の loadedmetadata フラグは当てにせず、video 要素の実状態を見る
    // （フラグが立たないまま映像だけ来ていることがあり、その場合サイズが 300x150 のまま残る）
    isReady() {
        const elt = this.capture && this.capture.elt;
        if (!elt || elt.readyState < 2 || !elt.videoWidth) {
            this._warnIfStuck();
            return false;
        }

        // p5 側のサイズが埋まっていなければ補う。テクスチャの解像度がこれで決まる
        if (this.capture.width !== elt.videoWidth) {
            this.capture.width = elt.width = elt.videoWidth;
            this.capture.height = elt.height = elt.videoHeight;
        }
        // 映像が来たのに一覧が空なら取り直す（loadedmetadata が来ないことがあるため）
        if (this.devices.length === 0 && !this.listing) this._listDevices();
        return true;
    }

    // シーンからテクスチャとして使う p5.MediaElement
    get() {
        return this.capture;
    }

    // カメラのアスペクト比。取れていないときは 16:9 を返す
    aspect() {
        if (!this.isReady()) {
            return this.CAPTURE_WIDTH / this.CAPTURE_HEIGHT;
        }
        return this.capture.width / this.capture.height;
    }

    // カメラを番号で直接選ぶ（Q / W / E）。繋がっていない番号は無視する
    select(index) {
        if (index < 0 || index >= this.devices.length) {
            console.warn(`[camera] ${index + 1} 台目は繋がっていません（現在 ${this.devices.length} 台）`);
            return;
        }
        if (index === this.deviceIndex) return;

        this.deviceIndex = index;
        this._open(this.devices[index].deviceId);
    }

    // 今のカメラを開き直す。ブラウザはストリームが切れても自動復帰しないので、
    // 本番でケーブルが抜けたときはこれで復帰させる（camera-setup.md 7節）
    reopen() {
        const device = this.devices[this.deviceIndex];
        this._open(device ? device.deviceId : undefined);
    }

    // 現在のカメラ名。デバイス一覧がまだ取れていないときは既定表示
    label() {
        const device = this.devices[this.deviceIndex];
        if (!device) return 'default camera';
        return device.label || `camera ${this.deviceIndex + 1}`;
    }

    // deviceId 省略で既定のカメラを開く
    _open(deviceId) {
        this._close();

        const video = {
            width: this.CAPTURE_WIDTH,
            height: this.CAPTURE_HEIGHT,
            frameRate: this.CAPTURE_FPS,
        };
        // deviceId は USB を挿し直すと変わる。取得に失敗しないよう exact は開くときだけ使う
        if (deviceId) video.deviceId = { exact: deviceId };

        this.capture = createCapture({ video, audio: false }, () => {
            if (this.devices.length === 0 && !this.listing) this._listDevices();
        });
        this.capture.hide();        // DOM の <video> は表示しない（必須）

        this.openedAt = millis();
        this.warned = false;
    }

    // 映像が来ないまま黙って真っ暗になるのを防ぐ。原因の当たりをコンソールに出す
    _warnIfStuck() {
        if (this.warned || millis() - this.openedAt < this.WARN_DELAY) return;
        this.warned = true;
        console.warn(
            '[camera] 映像が来ていません。'
            + 'アドレスバーのカメラアイコンで許可されているか、'
            + '他のアプリがカメラを掴んでいないかを確認してください。R キーで再取得できます。'
        );
    }

    // 開いているストリームを止めて要素を捨てる。止めないとカメラが掴まれたまま残る
    _close() {
        if (!this.capture) return;

        const stream = this.capture.elt && this.capture.elt.srcObject;
        if (stream) {
            for (const track of stream.getTracks()) track.stop();
        }
        this.capture.remove();
        this.capture = undefined;
    }

    // 許可が下りたあとでないとラベルも deviceId も取れないので、開くたびに取り直す
    _listDevices() {
        this.listing = true;
        navigator.mediaDevices.enumerateDevices().then((devices) => {
            this.devices = devices.filter((device) => device.kind === 'videoinput');

            // 実際に開いたデバイスが一覧の何番目かを合わせる
            const stream = this.capture && this.capture.elt && this.capture.elt.srcObject;
            const track = stream && stream.getVideoTracks()[0];
            const openedId = track ? track.getSettings().deviceId : undefined;
            const index = this.devices.findIndex((device) => device.deviceId === openedId);
            if (index >= 0) this.deviceIndex = index;

            console.log(`[camera] ${this.deviceIndex + 1}/${this.devices.length} ${this.label()}`);
        }).catch((error) => {
            console.warn('[camera] デバイス一覧の取得に失敗', error);
        }).finally(() => {
            this.listing = false;
        });
    }
}
