// エントリーポイント。シーンの登録とグローバルなキー操作だけを書く

let audioManager = new AudioManager();
let tempoManager = new TempoManager();  // BPM と拍の位置（タップテンポ・NUDGE・数値指定）
let sceneManager = new SceneManager();
let cameraManager = new CameraManager();
let statusBus = new StatusBus();    // 操作ウィンドウ（control.html）へ状態を送る
let midiManager = new MidiManager(); // MIDI コントローラー（js/midiMap.js の対応表でキーに翻訳）
let cameraShader;                   // Scene06（カメラ）が使うシーン内シェーダー
let fluidShader;                    // Scene08（流体）が使うシーン内シェーダー
let sparkleShader;                  // Scene10（光の粒）が使うシーン内シェーダー
let trianglesShader;                // Scene12（入れ子の三角形）が使うシーン内シェーダー
let shardsShader;                   // Scene13（破片）が使うシーン内シェーダー
let kaleidoShader;                  // Scene15（万華鏡）が使うシーン内シェーダー
let raysShader;                     // Scene27（放射）が使うシーン内シェーダー
let halftoneShader;                 // Scene24（網点）が使うシーン内シェーダー
let moireShader;                    // Scene21（モアレ）が使うシーン内シェーダー
let glitchShader;                   // Scene16（グリッチ）が使うシーン内シェーダー

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
    sparkleShader = loadShader("shader/main.vert", "shader/sparkle.frag");
    trianglesShader = loadShader("shader/main.vert", "shader/triangles.frag");
    shardsShader = loadShader("shader/main.vert", "shader/shards.frag");
    kaleidoShader = loadShader("shader/main.vert", "shader/kaleido.frag");
    glitchShader = loadShader("shader/main.vert", "shader/glitch.frag");
    moireShader = loadShader("shader/main.vert", "shader/moire.frag");
    halftoneShader = loadShader("shader/main.vert", "shader/halftone.frag");
    raysShader = loadShader("shader/main.vert", "shader/rays.frag");
}

function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
    noCursor();

    // ここにシーンを登録する。2つ目の引数がそのシーンの名前。
    // **名前は登録順ではなく固定している。**シーンを消しても残りのキー・デッキ・MIDI の表がずれないように。
    // '1'〜'9' '0' はそのまま数字キーで出せる。数字キーは10個しかないので、それ以外のシーンは
    // 2文字以上の名前で登録し、デッキ（APC40）か操作画面から出す
    sceneManager.addScene(new Scene01(), '1');
    sceneManager.addScene(new Scene02(), '2');
    sceneManager.addScene(new Scene03(), '3');
    sceneManager.addScene(new Scene04(), '4');
    sceneManager.addScene(new Scene05(), '5');
    sceneManager.addScene(new Scene06(cameraShader), '6');
    sceneManager.addScene(new Scene07(), '7');
    sceneManager.addScene(new Scene08(fluidShader), '8');
    sceneManager.addScene(new Scene09(), '9');
    sceneManager.addScene(new Scene10(sparkleShader), '0');

    // サカナクション「ミュージック」の場面から作ったシーン（数字キーなし）
    sceneManager.addScene(new Scene11(), 'chevron');
    sceneManager.addScene(new Scene12(trianglesShader), 'triangles');
    sceneManager.addScene(new Scene13(shardsShader), 'shards');
    sceneManager.addScene(new Scene14(), 'rednet');

    // VJ の定番から作ったシーン（数字キーなし）
    sceneManager.addScene(new Scene15(kaleidoShader), 'kaleido');
    sceneManager.addScene(new Scene16(glitchShader), 'glitch');
    sceneManager.addScene(new Scene17(), 'terrain');
    sceneManager.addScene(new Scene18(), 'cubes');
    sceneManager.addScene(new Scene19(), 'noise');
    sceneManager.addScene(new Scene20(), 'scope');
    sceneManager.addScene(new Scene21(moireShader), 'moire');
    sceneManager.addScene(new Scene22(), 'truchet');
    sceneManager.addScene(new Scene23(), 'particles');
    sceneManager.addScene(new Scene24(halftoneShader), 'halftone');
    sceneManager.addScene(new Scene25(), 'solids');
    sceneManager.addScene(new Scene26(), 'type');
    sceneManager.addScene(new Scene27(raysShader), 'rays');

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
