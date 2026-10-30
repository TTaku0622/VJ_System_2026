# CLAUDE.md

p5.js ベースの VJ システム。構成とキー割り当ては [README.md](README.md) を参照。

## 設計の約束

- シーンは `BaseScene` を継承し、`js/scenes/` に 1 ファイル 1 クラスで置く。
- 描画は必ず `this.pg`（createGraphics）に対して行う。canvas に直接描かない。
  ポストシェーダーがこのバッファをテクスチャとして受け取るため。
- シーンを追加したら `index.html` の script タグと `sketch.js` の `addScene()` の
  両方に登録する（どちらか片方だと動かない）。
- ポストシェーダーのエフェクトは `shader/main.frag` と `sceneManager.js` の
  `effects` がキー名で対応している。片方だけ変更しない。
- `setup()` より前に `createGraphics` は呼べない。シーンの `new` は
  `sketch.js` の `setup()` 内でのみ行う。
- レイヤーの枚数は `sceneManager.js` の `LAYER_COUNT` と `shader/main.frag` の
  `u_layerN` の組が対応している（GLSL ES 1.0 はテクスチャを配列で回せないので書き下し）。
  片方だけ変えない。`midiMap.js` の `layers` と `knobs.global` も枚数ぶん要る。
- MIDI でシーンを出すパッドは `midiMap.js` の `layers`（`slot:<レイヤー>:<段>`）で、
  どのシーンが入るかは `sceneManager.js` の `deck`。シーンの割り当てはパッドではなく `deck` を直す。

## 実行・確認

`file://` では動かない。`python3 -m http.server 5502` か Live Server で開く。

## コードスタイル

- インデントは 4 スペース、コメントは日本語。
- 既存シーンの書き方（クラス構文、`_` 始まりの内部メソッド）に合わせる。
- 定数はクラスのコンストラクタにまとめ、draw() 内にマジックナンバーを散らさない。
