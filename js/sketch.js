// エントリーポイント。シーンの登録とグローバルなキー操作だけを書く

let audioManager = new AudioManager();
let tempoManager = new TempoManager();  // BPM と拍の位置（タップテンポ・NUDGE・数値指定）
let sceneManager = new SceneManager();
let cameraManager = new CameraManager();
let statusBus = new StatusBus();    // 操作ウィンドウ（control.html）へ状態を送る
let midiManager = new MidiManager(); // MIDI コントローラー（js/midiMap.js の対応表でキーに翻訳）
let cameraShader;                   // Scene06（カメラ）が使うシーン内シェーダー
let fluidShader;                    // Scene08（流体）が使うシーン内シェーダー

// Shift ＋ 矢印 → テンポの命令
const TEMPO_ARROW_COMMANDS = {
    ArrowUp: 'tempo:adjust:1',
    ArrowDown: 'tempo:adjust:-1',
    ArrowLeft: 'tempo:nudge:-1',
    ArrowRight: 'tempo:nudge:1',
};

function preload() {
    // 音源を使うときは asset/sound に置いてコメントを外す
    // audioManager.load("asset/sound/music.mp3");
    sceneManager.loadPostShader("shader/main.vert", "shader/main.frag");
    cameraShader = loadShader("shader/main.vert", "shader/camera.frag");
    fluidShader = loadShader("shader/main.vert", "shader/fluid.frag");
}

function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
    noCursor();

    // ここにシーンを登録する。登録順に 1, 2, 3, ... キーへ割り当てられる
    sceneManager.addScene(new Scene01());
    sceneManager.addScene(new Scene02());
    sceneManager.addScene(new Scene03());
    sceneManager.addScene(new Scene04());
    sceneManager.addScene(new Scene05());
    sceneManager.addScene(new Scene06(cameraShader));
    sceneManager.addScene(new Scene07());
    sceneManager.addScene(new Scene08(fluidShader));
    sceneManager.addScene(new Scene09());

    sceneManager.setup(tempoManager);   // 切替フェードの長さを拍で数えるのに使う
    audioManager.setup();
    cameraManager.setup();
    // MIDI もキーボードと同じ入口（handleKey）へ流す。
    // sceneManager を渡すのは、選択中のシーンで対応表を切り替えるため
    midiManager.setup(handleKey, sceneManager, tempoManager);
    // 操作画面（control.html）からの命令も同じ入口へ。BPM の数値指定などがここを通る
    statusBus.onCommand(handleKey);
}

function draw() {
    const spectrum = audioManager.analyze();
    sceneManager.draw(spectrum);
    statusBus.publishFrom(sceneManager, audioManager, cameraManager, midiManager, spectrum, tempoManager);
    midiManager.updateLeds(sceneManager, audioManager);     // 使えるパッドと今の状態を光で出す
}

// キーボード・MIDI・操作画面の共通入口。**どこから来た操作も必ずここを通る**ので、
// 割り当てを増やすときに書き足す場所は1か所で済む
function handleKey(inputKey) {
    // MIDI の学習中は、飛ばす・戻る・終了 以外のキーを効かせない（誤爆を防ぐ）
    if (midiManager.learning) {
        midiManager.handleLearnKey(inputKey);
        return;
    }

    // テンポ（タップ・NUDGE・BPM の指定・頭をそろえる）
    if (tempoManager.handleCommand(inputKey)) return;

    const upperKey = String(inputKey).toUpperCase();

    if (inputKey === ' ') {
        audioManager.play();
        return;
    }
    if (upperKey === 'I') {
        audioManager.toggleSource();
        return;
    }
    // ヘルプは / 。H は Scene06 の加工キー（残像）に譲っている
    if (inputKey === '/' || inputKey === '?') {
        document.getElementById('help').classList.toggle('visible');
        return;
    }
    // MIDI の監視モード。押すと受けた MIDI の番号がコンソールに出る
    if (inputKey === midiManager.MONITOR_KEY) {
        midiManager.toggleMonitor();
        return;
    }
    // MIDI の学習モード。画面の指示どおりにパッドを押すと割り当てができる
    if (inputKey === midiManager.LEARN_KEY) {
        midiManager.toggleLearn();
        return;
    }

    sceneManager.keyPressed(inputKey);
}

function keyPressed() {
    // フルスクリーンは Enter。F は Scene06 の加工キー（ゆがみ）に譲っている。
    // 本番前に1度押すだけのフルスクリーンより、演奏中ずっと使う加工キーを優先した。
    // **key では取れないので keyCode で見る**＝MIDI からは呼べないので handleKey に入れない
    // 学習中はフルスクリーンも止める。handleKey を通らないキーはここで弾くしかない
    if (keyCode === ENTER && !midiManager.learning) {
        fullscreen(!fullscreen());
        return;
    }

    // Shift ＋ 矢印はテンポ（↑↓ で BPM ±1、←→ で拍を遅らせる / 早める）。
    // 矢印だけだとレイヤー操作なので、Shift の有無で分ける
    if (keyIsDown(SHIFT) && key in TEMPO_ARROW_COMMANDS) {
        handleKey(TEMPO_ARROW_COMMANDS[key]);
        return false;
    }

    handleKey(key);

    // スペース・矢印（レイヤー操作）・Tab（タップテンポ）でのスクロールやフォーカス移動を止める
    if (key === ' ' || key === 'Tab' || String(key).startsWith('Arrow')) return false;
}

function mousePressed() {
    audioManager.play();
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}
