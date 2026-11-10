// MIDI コントローラー（APC40 MkII）からの操作を受け取る。
//
// **やっていることは「MIDI を キー に翻訳して、キーボードと同じ入口へ流す」だけ。**
// 対応表は js/midiMap.js。システム側の機能はすべてキー操作でできているので、
// MIDI のために各シーンへ手を入れる必要はない。
//
// 表は3層で、**レイヤーの表 → 選択中のシーンの表 → 全体の表** の順に引く。
// 同じパッドがシーンによって別の働きをするのはこのため。シーン操作の15個を使い回している。
//
// レイヤーの表（シーンを出す・レイヤーを選ぶ…）は機材の列にそのまま対応しているので
// midiMap.js に直接書いてあり、学習モードでは変えない。**それ以外**の割り当ては
// 学習モード（`;` キー）で作れる。画面に出る順にパッドを押すだけで、midiMap.js に
// 貼れるコードがコンソールに出る。接続・番号の調べ方は midi-setup.md。
class MidiManager {
    constructor() {
        this.MONITOR_KEY = '.';         // 監視モードの ON/OFF（受けた MIDI をコンソールに出す）
        this.LEARN_KEY = ';';           // 学習モードの開始 / 終了
        this.LEARN_BACK_KEY = 'Backspace';  // 学習中: 1つ戻ってやり直す
        this.LEARN_SKIP_KEY = '-';      // 学習中: この操作は割り当てずに飛ばす

        // 学習結果の保存先。再読み込みしても消えない。
        // **配置を「列 = レイヤー」に変えたとき（2026-10-31）に v2 にした。**旧配置で学習した
        // 結果はグリッドの列1〜3 を上書きしてしまうので読まない（ブラウザには残してある）
        this.STORAGE_KEY = 'vj-midi-map-v2';

        // MIDI のステータスバイト（下位4ビットはチャンネルなので落としてから比べる）
        this.NOTE_ON = 0x90;
        this.NOTE_OFF = 0x80;
        this.CONTROL_CHANGE = 0xB0;

        this.CC_THRESHOLD = 64;         // CC はこの値以上へ上がった瞬間を「押した」とみなす
        this.TRACK_FADER_CC = 0x07;     // トラックフェーダー。ここだけチャンネルでフェーダーを見分ける

        // ---- LED ----
        // **APC40 MkII は起動時 Generic Mode で、押している間しか光らない。**
        // ホストから光らせるにはモードを切り替える sysex（Introduction message）を送る。
        // Mode 2（全 LED ホスト制御）ではなく Mode 1 にしているのは、
        // **つまみの LED リングを APC 側が勝手に表示してくれる**ため（こちらで送らなくてよい）
        this.MODE_MESSAGE = [0xF0, 0x47, 0x7F, 0x29, 0x60, 0x00, 0x04, 0x41, 0x01, 0x01, 0x01, 0xF7];

        this.LED_MAX_NOTE = 39;         // クリップグリッドは 0〜39。ここだけ光らせる
        this.LED_INTERVAL = 4;          // 何フレームおきに見直すか（差分だけ送るので実際の送信はもっと少ない）
        this.LED_REFRESH_INTERVAL = 300;    // 何フレームおきに全部送り直すか（5秒。取りこぼしの保険）

        // 色（velocity）は公式の RGB LEDs テーブルより。4つ刻みで
        // 「明るい / 標準 / 暗い / 最暗」が並ぶので、**状態が ON のものを標準色、
        // 割り当てがあるだけのものを暗い色**にして、光の強さで役割を出している
        this.LED = {
            OFF: 0,                     // #000000
            WHITE: 3,                   // #FFFFFF  現在のシーン
            YELLOW: 13,                 // #FFFF00  ON の画面エフェクト
            YELLOW_DIM: 14,             // #595900
            GREEN: 21,                  // #00FF00  ON の音まわり
            GREEN_DIM: 22,              // #005900
            CYAN: 37,                   // #00A9FF  選択中のシーン内モード
            CYAN_DIM: 38,               // #004152
            BLUE_DIM: 46,               // #000059  出せるシーン（今は出ていない）
        };

        // グリッドの下のボタン列（SOLO・ACTIVATOR など）は単色 LED。0 で消灯、1 で点灯。
        // **実機での点き方は未確認**（光らなくても操作には影響しない）
        this.TRACK_LED_ON = 1;

        this.sysex = false;             // モード切替を送れたか（LED が使えるか）
        this.ledState = {};             // 前回送った色。**変わったパッドだけ送る**
        this.ledFrame = 0;
        this.LEARN_COOLDOWN = 500;      // 学習中、1つ記録した直後に入力を無視する時間（ms）

        this.access = undefined;
        this.inputs = [];
        this.outputs = [];
        this.deviceName = '';
        this.handler = null;            // キーを渡す先（sketch.js の handleKey）
        this.sceneManager = null;       // いまどのシーンかを聞く相手（表を切り替えるのに要る）

        this.monitor = false;
        this.lastMessage = '';          // 操作画面に出す用。最後に受けた1件
        this.error = '';                // 使えないときの理由（操作画面に出す）

        this.ccValues = {};             // CC の前回値。立ち上がりだけを拾うために覚えておく

        // ---- 学習モード ----
        this.learning = false;
        this.learnItems = [];           // 割り当てを聞く順に並んだ操作の一覧
        this.learnIndex = 0;
        this.learnResult = { global: {}, scenes: {}, knobs: { global: {}, scenes: {} } };
        this.learnLabels = {};          // 出力のコメント用。'シーン|番号' → ラベル
        this.learnNotice = '';          // 画面に出す一言（上書きしたとき・使えないパッドのとき）
        this.learnCooldownUntil = 0;    // つまみは値が連続で届くので、記録直後は受け付けない
        this.usingStored = false;       // 保存された学習結果を使っているか
    }

    // handler(key) にキーを渡す。setup() より後に挿しても onstatechange で拾う。
    // tempoManager は画面に出す名前（「タップテンポ」など）を引くためだけに使う
    setup(handler, sceneManager, tempoManager = null) {
        this.handler = handler;
        this.sceneManager = sceneManager;
        this.tempoManager = tempoManager;

        this._loadLearned();

        if (typeof navigator.requestMIDIAccess !== 'function') {
            this.error = 'このブラウザは Web MIDI に対応していない（Chrome で開く）';
            console.warn(`[midi] ${this.error}`);
            return;
        }

        // **sysex はモード切替（＝LED）にだけ要る。**操作そのものには不要なので、
        // 許可が下りなければ sysex 無しで開き直して、LED だけ諦める
        navigator.requestMIDIAccess({ sysex: true })
            .then((access) => {
                this.sysex = true;
                this._onAccess(access);
            })
            .catch(() => this._setupWithoutSysex());
    }

    isReady() {
        return this.inputs.length > 0;
    }

    // LED を光らせられるか。sysex が拒否されると操作はできても光らせられない
    ledReady() {
        return this.sysex && this.outputs.length > 0;
    }

    _setupWithoutSysex() {
        navigator.requestMIDIAccess({ sysex: false })
            .then((access) => {
                this.sysex = false;
                console.warn('[midi] sysex が許可されなかった。操作はできるが LED は光らない'
                    + '（アドレスバーの設定で MIDI を許可し直すと光る）');
                this._onAccess(access);
            })
            .catch((error) => {
                this.error = `MIDI を使う許可が下りなかった（${error.name}）`;
                console.warn(`[midi] ${this.error}。アドレスバーの設定で MIDI を許可する`);
            });
    }

    // `.` キーから呼ばれる。本番でコンソールが流れ続けないよう、既定は OFF
    toggleMonitor() {
        this.monitor = !this.monitor;
        console.log(this.monitor
            ? '[midi] 監視 ON。パッドを押すと midiMap.js に書く行が出る'
            : '[midi] 監視 OFF');
    }

    // LED を直接叩きたいとき用。ふだんは updateLeds() が面倒を見る
    sendNote(note, velocity, channel = 1) {
        for (const output of this.outputs) {
            output.send([this.NOTE_ON | (channel - 1), note, velocity]);
        }
    }

    // ================= LED =================
    //
    // **割り当てのあるパッドを光らせて、暗いブースでどこが使えるか見えるようにする。**
    // 状態が ON のもの（今のシーン・かかっているエフェクト・選択中のモード）は明るく、
    // 割り当てがあるだけのものは暗く光らせて、光の強さで役割を分けている。
    //
    // draw() から毎フレーム呼んでよい。**色が変わったパッドしか送らない**ので、
    // 実際に流れるメッセージは操作したときだけ。
    updateLeds(sceneManager, audioManager) {
        if (!this.ledReady()) return;

        this.ledFrame++;

        // ときどき全部送り直す。**押し離しの取りこぼしや、機器が勝手に消したぶんを拾い直す**
        if (this.ledFrame % this.LED_REFRESH_INTERVAL === 0) this.ledState = {};
        if (this.ledFrame % this.LED_INTERVAL !== 0) return;

        // キーは "チャンネル:ノート"。グリッドはチャンネル1、ボタン列は何列目かがチャンネル
        const targets = {};
        for (let note = 0; note <= this.LED_MAX_NOTE; note++) targets[`1:${note}`] = this.LED.OFF;

        for (const [id, key] of Object.entries(MIDI_MAP.global)) {
            const note = this._gridNote(id);
            if (note !== null) {
                targets[`1:${note}`] = this._globalColor(key, sceneManager, audioManager);
                continue;
            }

            // グリッドの下のボタン列に置いた全体操作（三角形の切り抜きなど）は、ON の間だけ点灯
            const button = this._trackButton(id);
            if (button) {
                const effect = sceneManager.effects[String(key).toUpperCase()];
                targets[`${button.channel}:${button.note}`] = effect && effect.enabled ? this.TRACK_LED_ON : this.LED.OFF;
            }
        }

        // レイヤーのぶん。グリッドの列1〜3 は「出ている / 出せる / 空き」、ボタン列は ON / OFF
        for (const [id, command] of Object.entries(MIDI_MAP.layers || {})) {
            const state = sceneManager.layerCommandState(command);
            const note = this._gridNote(id);
            if (note !== null) {
                targets[`1:${note}`] = this._slotColor(state);
                continue;
            }

            const button = this._trackButton(id);
            if (button) targets[`${button.channel}:${button.note}`] = state ? this.TRACK_LED_ON : this.LED.OFF;
        }

        // 選択中のシーンのぶん。**レイヤーを選び直すと右下の色が丸ごと入れ替わる**
        const sceneKey = sceneManager.currentSceneKey();
        const table = (sceneKey && MIDI_MAP.scenes[sceneKey]) || {};
        const scene = sceneManager.selectedScene();

        for (const [id, key] of Object.entries(table)) {
            const note = this._gridNote(id);
            if (note !== null) targets[`1:${note}`] = this._sceneColor(key, scene);
        }

        for (const [target, velocity] of Object.entries(targets)) {
            const [channel, note] = target.split(':').map(Number);
            this._setLed(note, velocity, channel);
        }
    }

    // 全部消す。本番の終わりに盤面を落としたいとき用
    clearLeds() {
        if (!this.ledReady()) return;
        for (let note = 0; note <= this.LED_MAX_NOTE; note++) this._setLed(note, this.LED.OFF);

        // ボタン列など、これまでに光らせたもの
        for (const target of Object.keys(this.ledState)) {
            const [channel, note] = target.split(':').map(Number);
            this._setLed(note, this.LED.OFF, channel);
        }
    }

    _sendIntroduction() {
        for (const output of this.outputs) output.send(this.MODE_MESSAGE);
        console.log('[midi] Ableton Live モードに切り替えた（LED をこちらから光らせる）');
    }

    // 前回と同じ色なら送らない。これをやらないと毎フレーム 40 通が流れる。
    // グリッドはチャンネル1（= Primary Color、点灯）、ボタン列はチャンネルが何列目かを表す
    _setLed(note, velocity, channel = 1) {
        const target = `${channel}:${note}`;
        if (this.ledState[target] === velocity) return;

        this.ledState[target] = velocity;
        this.sendNote(note, velocity, channel);
    }

    // "n2:50" のようなボタン列の ID。グリッドや SCENE LAUNCH（チャンネル無し）は null
    _trackButton(id) {
        const match = /^n(\d+):(\d+)$/.exec(id);
        if (!match) return null;
        return { channel: Number(match[1]), note: Number(match[2]) };
    }

    // デッキのマス（グリッドの列1〜3）の色。出ているシーンは白
    _slotColor(state) {
        if (state === 'playing') return this.LED.WHITE;
        if (state === 'ready') return this.LED.BLUE_DIM;
        return this.LED.OFF;
    }

    // "n:24" のようなグリッドの ID だけを拾う。トラック列（n3:49 など）は光らせない
    _gridNote(id) {
        const match = /^n:(\d+)$/.exec(id);
        if (!match) return null;

        const note = Number(match[1]);
        return (note >= 0 && note <= this.LED_MAX_NOTE) ? note : null;
    }

    // 全体操作の色。**今の状態が ON なら明るく**する
    _globalColor(key, sceneManager, audioManager) {
        const upperKey = String(key).toUpperCase();

        // シーン切替（数字キー）。どこかのレイヤーで出ているシーンは白
        if (key in sceneManager.sceneKeyMap) {
            return sceneManager.isScenePlaying(sceneManager.sceneKeyMap[key])
                ? this.LED.WHITE
                : this.LED.BLUE_DIM;
        }

        // 画面まわり（分割・エフェクト・切替フェード）
        if (upperKey in sceneManager.tileLayouts) {
            return sceneManager.activeTileKey === upperKey ? this.LED.YELLOW : this.LED.YELLOW_DIM;
        }
        if (upperKey in sceneManager.effects) {
            return sceneManager.effects[upperKey].enabled ? this.LED.YELLOW : this.LED.YELLOW_DIM;
        }
        if (upperKey === 'P') {
            return sceneManager.fadeEnabled ? this.LED.YELLOW : this.LED.YELLOW_DIM;
        }

        // 音まわり
        if (upperKey === 'I') {
            return audioManager && audioManager.source === 'mic' ? this.LED.GREEN : this.LED.GREEN_DIM;
        }
        if (key === ' ') return this.LED.GREEN_DIM;

        return this.LED.YELLOW_DIM;
    }

    // 選択中のシーンの色。**modes で選ばれているものだけ明るく**する
    _sceneColor(key, scene) {
        if (scene && scene.modes) {
            const keys = scene.modes.keys;
            const index = keys.indexOf(String(key).toUpperCase());

            // 1キーで循環するタイプは「選択中」が無いので、いつも明るくしておく
            if (index >= 0) {
                if (keys.length === 1) return this.LED.CYAN;
                return index === scene.modeIndex ? this.LED.CYAN : this.LED.CYAN_DIM;
            }
        }
        return this.LED.CYAN_DIM;
    }

    // ================= 学習モード =================
    //
    // 画面に出る順にパッドを押していくだけで割り当てができる。**54 個を手で書くのは
    // 現実的でない**ので用意した。終わるとコンソールに midiMap.js 用のコードが出る。

    toggleLearn() {
        if (this.learning) this.stopLearn();
        else this.startLearn();
    }

    startLearn() {
        if (!this.sceneManager) return;

        if (!this.isReady()) {
            console.warn('[midi] コントローラーが繋がっていない。挿してから `;` を押す');
            return;
        }

        this.learnItems = this._buildLearnItems();
        this.learnIndex = 0;
        this.learnResult = { global: {}, scenes: {}, knobs: { global: {}, scenes: {} } };
        this.learnLabels = {};
        this.learnNotice = '';
        this.learnCooldownUntil = 0;
        this.learning = true;

        console.log(`[midi] 学習モード開始。${this.learnItems.length} 個を順に割り当てる`
            + `（${this.LEARN_SKIP_KEY} 飛ばす / ${this.LEARN_BACK_KEY} 1つ戻る / ${this.LEARN_KEY} 終了）`);
        this._renderLearn();
    }

    // 途中で終えても、そこまでの割り当ては有効になる
    stopLearn() {
        if (!this.learning) return;

        this.learning = false;
        this._applyLearned();
        this._saveLearned();
        this._renderLearn();

        console.log(`[midi] 学習おわり。${this._learnedCount()} 個を割り当てた。`
            + 'この下のコードを js/midiMap.js の MIDI_MAP と差し替えると恒久化できる');
        console.log(this._formatMap());
    }

    // 学習中のキー操作。**学習中はここ以外のキーを効かせない**（誤爆を防ぐ）
    handleLearnKey(key) {
        if (key === this.LEARN_KEY) this.stopLearn();
        else if (key === this.LEARN_BACK_KEY) this.learnBack();
        else if (key === this.LEARN_SKIP_KEY) this.learnSkip();
    }

    // 1つ戻ってやり直す。戻った先の割り当ては消える
    learnBack() {
        if (this.learnIndex === 0) return;

        this.learnIndex--;
        const item = this.learnItems[this.learnIndex];
        if (item.assignedId) {
            delete this._learnTable(item)[item.assignedId];
            item.assignedId = null;
        }
        this.learnNotice = '';
        this.learnCooldownUntil = 0;
        this._renderLearn();
    }

    // この操作は割り当てずに次へ。使わない操作はここで飛ばす
    learnSkip() {
        this.learnNotice = '';
        this._advanceLearn();
    }

    // 保存した学習結果を消す。midiMap.js に貼った後、古い保存が勝つのを避けたいとき用
    clearLearned() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (error) {
            // 消せなくても実害はない
        }
        this.usingStored = false;
        console.log('[midi] 保存した学習結果を消した。読み込み直すと midiMap.js の内容だけになる');
    }

    // ================= 内部 =================

    _onAccess(access) {
        this.access = access;

        // 抜き差しに追従する。**本番でケーブルが抜けても、挿し直せば戻る**
        access.onstatechange = () => this._bindPorts();
        this._bindPorts();
    }

    // 入力ポートすべてに受信ハンドラを付け直す。
    // 機種を名前で絞り込んでいないのは、別のコントローラーを挿しても動くようにするため
    _bindPorts() {
        this.inputs = [];
        this.outputs = [];

        const names = [];
        this.access.inputs.forEach((input) => {
            input.onmidimessage = (event) => this._onMessage(event);
            this.inputs.push(input);
            names.push(input.name);
        });
        this.access.outputs.forEach((output) => this.outputs.push(output));

        const joined = names.join(' / ');
        if (joined === this.deviceName) return;         // 変化が無いときは黙っておく

        // **モードを切り替えないと LED はホストから制御できない。**
        // 抜き差しで繋ぎ直したときも送り直す（機器側は起動時 Generic Mode に戻っている）
        if (this.ledReady()) {
            this._sendIntroduction();
            this.ledState = {};         // 送り直しになるよう、覚えている色を捨てる
        }

        this.deviceName = joined;
        this.error = names.length > 0 ? '' : 'MIDI 入力が見つからない（USB を挿し直す）';
        console.log(names.length > 0
            ? `[midi] 接続: ${this.deviceName}`
            : `[midi] ${this.error}`);
    }

    _onMessage(event) {
        const [status, number, value] = event.data;
        const type = status & 0xF0;
        const channel = (status & 0x0F) + 1;

        // note off は操作としては無視する。キーボードの keyPressed と同じで「押した瞬間」だけ効かせる。
        // ただし**機器が押し離しで自分の LED を書き換えてしまう**ので、その位置は色を送り直させる
        if (type === this.NOTE_OFF || (type === this.NOTE_ON && value === 0)) {
            delete this.ledState[`${channel}:${number}`];
            return;
        }
        if (type === this.NOTE_ON) {
            delete this.ledState[`${channel}:${number}`];
            this._trigger('note', number, value, channel);
            return;
        }
        if (type === this.CONTROL_CHANGE) {
            const id = this._id('cc', channel, number);        // CC はチャンネルを含まない

            // **回した量だけを送るつまみ（TEMPO）。**値は 1〜63 が＋、64〜127 が −（127 = −1）
            const encoder = (MIDI_MAP.encoders || {})[id];
            if (encoder && !this.learning) {
                const delta = value < 64 ? value : value - 128;
                const command = `${encoder}:${delta}`;
                this.lastMessage = `${id}  v${value}  → ${this._keyLabel(command)}`;
                if (this.monitor) console.log(`[midi] ${id}  v${value}  → ${command}`);
                if (delta !== 0 && this.handler) this.handler(command);
                return;
            }

            // **つまみに割り当てられていれば、しきい値を見ずに値をそのまま渡す。**
            // ボタンと違って「押した瞬間」ではなく、回した位置そのものが欲しい
            if (!this.learning && this._applyKnob(id, value)) {
                this.lastMessage = `${id}  v${value}  → つまみ`;
                if (this.monitor) console.log(`[midi] ${id}  v${value}  → つまみ`);
                return;
            }

            const previous = this.ccValues[id] || 0;
            this.ccValues[id] = value;

            // ボタン扱いの CC は、しきい値を上へまたいだ1回だけ効かせる。
            // 監視モードでは番号を知りたいので、またいでいなくても表示はする
            const pressed = previous < this.CC_THRESHOLD && value >= this.CC_THRESHOLD;
            this._trigger('cc', number, value, channel, pressed);
        }
    }

    _trigger(kind, number, value, channel, enabled = true) {
        const id = this._id(kind, channel, number);
        const key = this._lookup(id);

        this.lastMessage = `${id}  v${value}${key ? `  → ${this._keyLabel(key)}` : ''}`;

        if (this.monitor) {
            console.log(`[midi] ${id}  v${value}`
                + `   midiMap.js に書くなら:   '${id}': '?',`);
        }

        // 学習中は操作せず、押されたパッド／回したつまみを記録するだけ。
        // **しきい値より前に見る**（つまみは 64 をまたぐとは限らない）
        if (this.learning) {
            this._learnRecord(kind, id);
            return;
        }

        if (!enabled) return;
        if (!key || !this.handler) return;
        this.handler(key);
    }

    // 番号の ID。**チャンネルを見るかどうかは公式プロトコルに合わせている。**
    //
    //   ノート 0x30〜0x49  チャンネル 0〜7 が トラック1〜8 を示す（RECORD ARM / SOLO /
    //                     ACTIVATOR / TRACK SELECTION / TRACK STOP / CLIP STOP）→ 見る
    //   それ以外のノート   仕様上チャンネルは無視される（クリップグリッド 0x00〜0x27 など）
    //   CC 0x07           トラックフェーダー。**8本とも同じ CC 番号で、チャンネルだけが
    //                     1〜8本目を表す**ので見ないと区別できない → 見る
    //   それ以外の CC     無視する。**Generic Mode では Device knob の送信チャンネルが
    //                     TRACK SELECTION ボタンで切り替わる**ので、覚えると選択を変えた
    //                     途端に効かなくなる
    _id(kind, channel, number) {
        if (kind !== 'note') {
            return (number === this.TRACK_FADER_CC) ? `c${channel}:${number}` : `c:${number}`;
        }
        return (number >= 0x30 && number <= 0x49) ? `n${channel}:${number}` : `n:${number}`;
    }

    // つまみ（CC）を選択中のシーンへ渡す。割り当てが無ければ false を返して
    // 従来どおりボタンとして扱わせる
    _applyKnob(id, value) {
        if (typeof MIDI_MAP === 'undefined' || !MIDI_MAP.knobs || !this.sceneManager) return false;

        const t = value / 127;

        // 全体のつまみが先。**どのシーンでも効いてほしい**ので、シーンの表より優先する
        const globalName = (MIDI_MAP.knobs.global || {})[id];
        if (globalName) return this.sceneManager.setKnob(globalName, t);

        const sceneKey = this.sceneManager.currentSceneKey();
        const table = sceneKey ? (MIDI_MAP.knobs.scenes || {})[sceneKey] : null;
        const name = table ? table[id] : undefined;
        if (!name) return false;

        const scene = this.sceneManager.selectedScene();
        if (!scene || typeof scene.setKnob !== 'function') return false;

        return scene.setKnob(name, t);
    }

    // レイヤーの表 → 選択中のシーンの表 → 全体の表 の順に見る。
    // **レイヤーの表が最初**なのは、シーンを出すパッドがどのシーンでも同じ働きであってほしいため
    _lookup(id) {
        if (typeof MIDI_MAP === 'undefined') return undefined;

        if (MIDI_MAP.layers && id in MIDI_MAP.layers) return MIDI_MAP.layers[id];

        const sceneKey = this.sceneManager ? this.sceneManager.currentSceneKey() : null;
        const sceneTable = sceneKey ? MIDI_MAP.scenes[sceneKey] : null;

        if (sceneTable && id in sceneTable) return sceneTable[id];
        return MIDI_MAP.global[id];
    }

    // ---- 学習台帳 ----

    // 割り当てを聞く順に並べる。各シーンの操作は登録済みのシーンから作るので、
    // **シーンを増やしても学習項目は勝手に増える**（書き足す場所が増えない）。
    // シーンを出す操作はレイヤーの表（MIDI_MAP.layers）が受け持つので聞かない
    _buildLearnItems() {
        const items = [];
        const scenes = this.sceneManager.scenes;

        // 1. 全体操作
        for (const item of MIDI_GLOBAL_ITEMS) {
            items.push({ scene: null, kind: 'key', key: item.key, label: item.label, assignedId: null });
        }

        // 2. 全体のつまみ（レイヤーの不透明度・全体の明るさ）
        for (const knob of this.sceneManager.knobs || []) {
            items.push({ scene: null, kind: 'knob', key: knob.name, label: knob.label, assignedId: null });
        }

        // 3. シーン固有の操作。選択中のシーンでだけ効くので、同じパッドを使い回せる
        scenes.forEach((scene, index) => {
            const sceneKey = this.sceneManager.sceneKeyForIndex(index);
            if (!sceneKey) return;

            for (const entry of this._sceneItems(scene)) {
                items.push({
                    scene: sceneKey,
                    kind: 'key',
                    key: entry.key,
                    label: `${this._sceneName(scene)}  ${entry.label}`,
                    assignedId: null,
                });
            }

            // つまみはパッドと入口が違う（CC）ので、そのシーンのキーの後にまとめて聞く
            for (const knob of scene.knobs || []) {
                items.push({
                    scene: sceneKey,
                    kind: 'knob',
                    key: knob.name,
                    label: `${this._sceneName(scene)}  ${knob.label}`,
                    assignedId: null,
                });
            }
        });

        return items;
    }

    // modes 宣言と keyHelp を合わせた、そのシーンのキー一覧
    _sceneItems(scene) {
        const entries = [];

        if (scene.modes) {
            const { keys, labels } = scene.modes;
            if (keys.length === 1) {
                // 1キーで循環するタイプ（Scene04 の T）はパッド1つで足りる
                entries.push({ key: keys[0], label: `${labels.join(' ↔ ')}（切替）` });
            } else {
                labels.forEach((label, i) => entries.push({ key: keys[i], label }));
            }
        }

        for (const entry of scene.keyHelp || []) entries.push(entry);

        return entries;
    }

    _sceneName(scene) {
        return scene.title || scene.constructor.name;
    }

    _learnTable(item) {
        const root = item.kind === 'knob' ? this.learnResult.knobs : this.learnResult;

        if (item.scene === null) return root.global;
        if (!root.scenes[item.scene]) root.scenes[item.scene] = {};
        return root.scenes[item.scene];
    }

    _learnRecord(kind, id) {
        const item = this.learnItems[this.learnIndex];
        if (!item) return;

        // つまみは回すと値が連続で届く。1つ受けた直後は少しのあいだ耳を塞ぐ
        if (Date.now() < this.learnCooldownUntil) return;

        // **つまみの項目は CC、パッドの項目はノートだけを受ける。**
        // 手が当たったつまみでパッドの枠が埋まる事故を防ぐ
        const wanted = item.kind === 'knob' ? 'cc' : 'note';
        if (kind !== wanted) {
            this.learnNotice = item.kind === 'knob'
                ? 'ここは「つまみ」。ノブかフェーダーを回す'
                : 'ここは「パッド」。ボタンを押す';
            this.learnCooldownUntil = Date.now() + this.LEARN_COOLDOWN;
            this._renderLearn();
            return;
        }

        // レイヤーの表のパッドは使えない。**レイヤーの表が最初に引かれる**ので、
        // 割り当てても効かないまま残ってしまう
        const layerTable = MIDI_MAP.layers || {};
        if (item.kind !== 'knob' && layerTable[id]) {
            this.learnNotice = `そこはレイヤー操作「${this._keyLabel(layerTable[id])}」で使用中。`
                + '列4〜8 のパッドにする（変えるなら midiMap.js の layers を直す）';
            this.learnCooldownUntil = Date.now() + this.LEARN_COOLDOWN;
            this._renderLearn();
            return;
        }

        // TEMPO つまみも同じ。回した量だけを送るので、位置で動かすつまみには使えない
        const encoderTable = MIDI_MAP.encoders || {};
        if (encoderTable[id]) {
            this.learnNotice = 'そこは TEMPO つまみ（BPM）で使用中。別のつまみ／フェーダーにする';
            this.learnCooldownUntil = Date.now() + this.LEARN_COOLDOWN;
            this._renderLearn();
            return;
        }

        // 全体操作に使ったパッドはシーン固有に使えない。シーンの表が優先されるので、
        // そのシーンでだけ全体操作が効かなくなり、本番で原因を探すことになる
        const globalTable = item.kind === 'knob' ? this.learnResult.knobs.global : this.learnResult.global;
        if (item.scene !== null && globalTable[id]) {
            const used = item.kind === 'knob' ? globalTable[id] : this._keyLabel(globalTable[id]);
            this.learnNotice = `そこは全体操作「${used}」で使用中。別のパッド／つまみにする`;
            this.learnCooldownUntil = Date.now() + this.LEARN_COOLDOWN;
            this._renderLearn();
            return;
        }

        const overwritten = this._learnForget(id, item);
        this._learnTable(item)[id] = item.key;
        this.learnLabels[`${item.scene}|${id}`] = item.label;
        item.assignedId = id;
        this.learnCooldownUntil = Date.now() + this.LEARN_COOLDOWN;

        this.learnNotice = overwritten.length > 0
            ? `そこに入っていた「${overwritten.join('・')}」を外した`
            : '';

        this._advanceLearn();
    }

    // 同じパッドの古い割り当てを外す。外したぶんのキーを返す（画面に出すため）。
    // 全体操作に割り当てるときは全シーンからも外す（全体操作は常に効いてほしい）
    _learnForget(id, item) {
        const root = item.kind === 'knob' ? this.learnResult.knobs : this.learnResult;
        const tables = item.scene === null
            ? [root.global].concat(Object.values(root.scenes))
            : [this._learnTable(item)];

        const removed = [];
        for (const table of tables) {
            if (!table[id]) continue;
            removed.push(item.kind === 'knob' ? table[id] : this._keyLabel(table[id]));
            delete table[id];
        }

        // 外した項目は「未割り当て」に戻す。戻るで巻き戻したときに二重に消さないため
        for (const other of this.learnItems) {
            if (other.assignedId !== id) continue;
            if (other.kind !== item.kind) continue;
            if (item.scene === null || other.scene === item.scene) other.assignedId = null;
        }

        return removed;
    }

    _advanceLearn() {
        this.learnIndex++;

        if (this.learnIndex >= this.learnItems.length) {
            this.stopLearn();
            return;
        }
        this._renderLearn();
    }

    _learnedCount() {
        let count = 0;
        for (const root of [this.learnResult, this.learnResult.knobs]) {
            count += Object.keys(root.global).length;
            for (const table of Object.values(root.scenes)) count += Object.keys(table).length;
        }
        return count;
    }

    // ---- 学習結果の反映・保存 ----

    // 学習は「全部やり直す」ものなので、古い表は残さずに置き換える
    _applyLearned() {
        MIDI_MAP.global = {};
        MIDI_MAP.scenes = {};
        MIDI_MAP.knobs = { global: {}, scenes: {} };
        this._mergeMap(this.learnResult);
    }

    // キーの表とつまみの表は同じ形（global / scenes）なので、同じやり方で重ねる
    _mergeMap(map) {
        this._mergeLayer(MIDI_MAP, map);
        this._mergeLayer(MIDI_MAP.knobs, map.knobs || {});
    }

    _mergeLayer(target, source) {
        Object.assign(target.global, source.global || {});

        for (const [sceneKey, table] of Object.entries(source.scenes || {})) {
            if (!target.scenes[sceneKey]) target.scenes[sceneKey] = {};
            Object.assign(target.scenes[sceneKey], table);
        }
    }

    // 保存しておくのは、**リハ中に読み込み直しても割り当てが消えないようにする**ため。
    // midiMap.js に貼るまでの仮置きなので、貼ったら clearLearned() で消してよい
    _saveLearned() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.learnResult));
            this.usingStored = true;
        } catch (error) {
            console.warn('[midi] 学習結果を保存できなかった。コンソールの表を midiMap.js に貼ること');
        }
    }

    _loadLearned() {
        let raw = null;
        try {
            raw = localStorage.getItem(this.STORAGE_KEY);
        } catch (error) {
            return;         // プライベートウィンドウなどで読めないことがある
        }
        if (!raw) return;

        try {
            this._mergeMap(JSON.parse(raw));
            this.usingStored = true;
            console.log('[midi] 保存された学習結果を読み込んだ'
                + '（midiMap.js に貼れば恒久化。消すなら midiManager.clearLearned()）');
        } catch (error) {
            console.warn('[midi] 保存された学習結果が壊れている。midiManager.clearLearned() で消せる');
        }
    }

    // midiMap.js にそのまま貼れる形で出す
    _formatMap() {
        const lines = ['const MIDI_MAP = {', '    global: {'];

        for (const [id, key] of Object.entries(this.learnResult.global)) {
            lines.push(this._formatEntry(8, id, key, this.learnLabels[`null|${id}`]));
        }
        lines.push('    },', '', '    scenes: {');

        for (const [sceneKey, table] of Object.entries(this.learnResult.scenes)) {
            const entries = Object.entries(table);
            if (entries.length === 0) continue;

            lines.push(`        // シーン${sceneKey}`);
            lines.push(`        '${sceneKey}': {`);
            for (const [id, key] of entries) {
                lines.push(this._formatEntry(12, id, key, this.learnLabels[`${sceneKey}|${id}`]));
            }
            lines.push('        },');
        }
        lines.push('    },', '', '    knobs: {', '        global: {');

        for (const [id, name] of Object.entries(this.learnResult.knobs.global)) {
            lines.push(this._formatEntry(12, id, name, this.learnLabels[`null|${id}`]));
        }
        lines.push('        },', '', '        scenes: {');

        for (const [sceneKey, table] of Object.entries(this.learnResult.knobs.scenes)) {
            const entries = Object.entries(table);
            if (entries.length === 0) continue;

            lines.push(`            '${sceneKey}': {`);
            for (const [id, name] of entries) {
                lines.push(this._formatEntry(16, id, name, this.learnLabels[`${sceneKey}|${id}`]));
            }
            lines.push('            },');
        }

        lines.push('        },', '    },', '};');
        return lines.join('\n');
    }

    _formatEntry(indent, id, key, label) {
        const body = `'${id}': '${key}',`;
        return ' '.repeat(indent) + body.padEnd(22) + (label ? `// ${label}` : '');
    }

    // ---- 画面表示 ----

    _renderLearn() {
        const element = document.getElementById('midi-learn');
        if (!element) return;

        if (!this.learning) {
            element.classList.remove('visible');
            return;
        }

        const item = this.learnItems[this.learnIndex];
        const scope = item.scene === null
            ? 'どのシーンでも効く'
            : `シーン${item.scene} でだけ効く`;

        // つまみはパッドと操作が違うので、指示の言い方も変える
        const line = item.kind === 'knob'
            ? `次に回す →  ( つまみ )  ${item.label}`
            : `次に押す →  [ ${this._keyLabel(item.key)} ]  ${item.label}`;

        const lines = [
            `MIDI 学習モード      ${this.learnIndex + 1} / ${this.learnItems.length}`,
            '',
            line,
            `             ${scope}`,
            '',
            `${this.LEARN_SKIP_KEY} 飛ばす    ${this.LEARN_BACK_KEY} 1つ戻る    ${this.LEARN_KEY} 終了`,
        ];
        if (this.learnNotice) lines.push('', this.learnNotice);

        element.textContent = lines.join('\n');
        element.classList.add('visible');
    }

    // キーなら大文字、命令なら「L2 を選択」「タップテンポ」のような名前
    _keyLabel(key) {
        if (key === ' ') return 'SPACE';

        const label = (this.sceneManager && this.sceneManager.commandLabel(key))
            || (this.tempoManager && this.tempoManager.commandLabel(key));
        return label || String(key).toUpperCase();
    }
}
