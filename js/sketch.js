// エントリーポイント。シーンの登録とグローバルなキー操作だけを書く

let audioManager = new AudioManager();
let sceneManager = new SceneManager();
let cameraManager = new CameraManager();
let statusBus = new StatusBus();    // 操作ウィンドウ（control.html）へ状態を送る
let cameraShader;                   // Scene06（カメラ）が使うシーン内シェーダー

function preload() {
    // 音源を使うときは asset/sound に置いてコメントを外す
    // audioManager.load("asset/sound/music.mp3");
    sceneManager.loadPostShader("shader/main.vert", "shader/main.frag");
    cameraShader = loadShader("shader/main.vert", "shader/camera.frag");
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

    sceneManager.setup();
    audioManager.setup();
    cameraManager.setup();
}

function draw() {
    const spectrum = audioManager.analyze();
    sceneManager.draw(spectrum);
    statusBus.publishFrom(sceneManager, audioManager, cameraManager, spectrum);
}

function keyPressed() {
    const upperKey = String(key).toUpperCase();

    if (key === ' ') {
        audioManager.play();
        return false;               // スペースでのスクロールを止める
    }
    if (upperKey === 'I') {
        audioManager.toggleSource();
        return;
    }
    // ヘルプは / 。H は Scene06 の加工キー（残像）に譲っている
    if (key === '/' || key === '?') {
        document.getElementById('help').classList.toggle('visible');
        return;
    }
    // フルスクリーンは Enter。F は Scene06 の加工キー（ゆがみ）に譲っている。
    // 本番前に1度押すだけのフルスクリーンより、演奏中ずっと使う加工キーを優先した
    if (keyCode === ENTER) {
        fullscreen(!fullscreen());
        return;
    }

    sceneManager.keyPressed(key);
}

function mousePressed() {
    audioManager.play();
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}
