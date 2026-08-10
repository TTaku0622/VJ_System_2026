# 音声の取り込み構成

PA卓から2回線（キック単体／バンド全体）を YAMAHA AG03MK2 経由でブラウザに取り込み、
シーンごとに反応させる音を選べるようにするための、接続・設定・実装のメモ。

最終更新: 2026-07-29

---

## 1. 全体の信号の流れ

```
[PA卓]
 ├ キックch DIRECT OUT ─────────────→ AG03MK2 CH1 → PCのL（解析用）
 └ AUX/MATRIX（全体）──[Y分岐]─┬───→ AG03MK2 CH2 → PCのR（解析用）
                                └───→ AG03MK2 AUX（イヤモニ用・PCには行かない）

AG03MK2 ──USB──→ MacBook Pro ──→ Chrome ──→ p5.js
AG03MK2 PHONES ──→ イヤモニ（MIX MINUS ON で CH1/CH2 が消え、AUX の全体だけ聞こえる）
```

**役割分担:**

| 経路 | 用途 | 音質の要求 |
| --- | --- | --- |
| CH1（キック） | 映像のトリガー（鳴った瞬間の検出） | 低くてよい |
| CH2（全体） | 映像のFFT解析（帯域分割） | 中 |
| AUX（全体） | イヤモニで聞く | 高い |

---

## 2. PA卓側

事前にPA担当へ依頼しておく（当日いきなりは断られる）。

| 回線 | 卓のどこから | 依頼の言い方 |
| --- | --- | --- |
| バスドラム単体 | キックchの **DIRECT OUT**（無ければ AUX を1系統キックだけに） | 「キックのダイレクトアウトを1本ください」 |
| バンド全体 | **post-fader の AUX** か **MATRIX** | 「post fader の AUX か MATRIX で全体ミックスをモノで1本」 |

- 「**映像の解析に使うだけで、音は出しません**」と添えると話が早い
- **MAIN OUT の分岐は頼まない**（PAの本線に手を入れることになる）
- REC OUT はメインフェーダー連動で音量が動く卓があるので避ける

---

## 3. AG03MK2 の設定

| 項目 | 設定 | 理由 |
| --- | --- | --- |
| **TO PC スイッチ** | **DRY CH 1-2G** | CH1→L、CH2→R として個別にPCへ送る唯一のモード |
| **MIX MINUS** | **ON** | CH1/CH2 をイヤモニから消し、AUX の全体だけを残す |
| **+48V** | **必ず OFF** | 卓の出力に48Vを送ると機器破損の恐れ |
| CH1 の入力端子 | **フォン側**（XLRではない） | XLRはマイクレベル。ラインを入れると過大入力で歪む |
| CH1 GAIN | PEAK LED が点かない位置 | PCへ送る音量はここで決まる |
| CH2 の GUITAR/LINE | **LINE** | GUITAR（Hi-Z）だと音が痩せる |
| CH1/CH2 フェーダー | どこでもよい | **DRYはフェーダーの影響を受けない**（＝PCへの信号は変わらない） |
| COMP/EQ、EFFECT | OFF | 解析用の音を加工しない |

### 覚えておく原則

- **GAIN = PCに送る音量／フェーダー = モニターの音量**（DRYはフェーダー前から分岐するため）
  - 出典: [Yamaha FAQ](https://usa.yamaha.com/products/music_production/interfaces/ag_series/faq.html)
  - > These signals will not be affected by the level knob/fader.
- **AUX に入れた音は PC に届かない**（DRYが送るのは CH1 と CH2G だけ）。だからモニター専用に使える
- **MIX MINUS は実質「ダイレクトモニターのオフ」**。CH1（とGuitar設定時のCH2）をモニターから外す

---

## 4. 用意するケーブル

| 用途 | ケーブル |
| --- | --- |
| 卓 → CH1 | XLR(メス) → 標準フォン |
| 卓 → CH2 | XLR(メス) → 標準フォン |
| 全体の分岐 | Y分岐（スプリッター） |
| 分岐 → AUX | 4極ミニ（CTIA）への変換 |

長さは卓〜VJ位置＋5m。10mあると安心。

---

## 5. ブラウザ側の実装方針

### 読み取りの流れ

```
getUserMedia（権限が要る）
      ↓
MediaStream（L/R 2ch）
      ↓ createMediaStreamSource
AudioContext
      ↓ createChannelSplitter(2)
  ┌───┴───┐
L(ch0)   R(ch1)
キック     全体
  ↓        ↓
Analyser  Analyser
  ↓        ↓
getByteTimeDomainData   getByteFrequencyData
（波形＝振幅）           （周波数スペクトル）
  ↓        ↓
  └───┬───┘
      ↓
draw(audio) で毎フレーム使う
```

### キックと全体で読み方が違う

| | メソッド | 返るもの | 理由 |
| --- | --- | --- | --- |
| **キック** | `getByteTimeDomainData` | 波形（振幅） | 「今ドンと鳴ったか」だけ知りたい。周波数分析は不要 |
| **全体** | `getByteFrequencyData` | 周波数スペクトル | 低域・中域・高域に分けたい |

キックにFFTを使うと、叩いた後にガクッと落ちて映像が気持ちよくない。
**振幅の閾値でトリガーを取り、そこから自前で減衰させる**（`decay`）と自然に光る。

### 核心コード

```js
// ① ストリームを取る
const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
        deviceId: { exact: agDeviceId },
        channelCount: 2,          // 無いとモノに潰されて分離できない
        echoCancellation: false,  // 切らないとキックが潰れる
        noiseSuppression: false,
        autoGainControl: false,   // 切らないと音量が勝手に動く
    }
});

// ② AudioContext に流す（p5.sound のものを流用）
const ctx = getAudioContext();
const source = ctx.createMediaStreamSource(stream);

// ③ L と R を切り離す
const splitter = ctx.createChannelSplitter(2);
source.connect(splitter);

// ④ 別々の Analyser へ
kickAnalyser = ctx.createAnalyser();
kickAnalyser.fftSize = 1024;
splitter.connect(kickAnalyser, 0);      // ch0 = L = キック

fullAnalyser = ctx.createAnalyser();
fullAnalyser.fftSize = 256;
splitter.connect(fullAnalyser, 1);      // ch1 = R = 全体

// ⑤ destination には繋がない（音を出す必要がない）
```

**`channelCount: 2` と `echoCancellation: false` はセットで必須。**
片方でも欠けると Chrome がモノラルにダウンミックスして、DRY で分離した意味がなくなる。

### p5.sound を解析に使わない理由

`p5.FFT` は内部の AnalyserNode が**ステレオをモノにダウンミックスしてから解析する**ため、L/R を分けられない。
ただし `getAudioContext()` / `userStartAudio()` と音源ファイル再生は p5.sound のものを使う。

### 起動時のフロー

```
「クリックして開始」を表示
      ↓ クリック
AudioContext を resume ＋ getUserMedia で権限取得
      ↓
enumerateDevices でデバイス一覧（※権限後でないと名前が空）
      ↓
AG03MK2 を選んで getUserMedia し直す
      ↓
解析開始
```

デバイス名は権限許可後にしか取れないので、**「一度権限を取る → 名前を見て選び直す」の2段階**になる。

### シーンに渡すデータ

```js
draw(audio) {
    audio.kick.decay      // 叩いた瞬間 1.0 → 徐々に 0 へ
    audio.kick.hit        // 叩いたフレームだけ true
    audio.kick.level      // キック回線の生の音量

    audio.full.bass       // 全体の低域
    audio.full.mid        // 全体の中域
    audio.full.treble     // 全体の高域
    audio.full.level      // 全体の音量
    audio.full.spectrum   // 32バンドの配列
}
```

**両方を全シーンに渡し、シーン側でどちらを使うか決める。**
シーンごとに音源を固定しないので、後から変更が1行で済む。

---

## 6. macOS側の準備

1. AG03MK2 を USB で接続（ドライバ不要）
2. システム設定 → サウンド → 入力 に AG03MK2 が出るか確認
3. **システム設定 → プライバシーとセキュリティ → マイク で Chrome を許可**（忘れると何も取れない）
4. Audio MIDI設定 で AG03MK2 の入力を 48000 Hz / 2ch に設定

---

## 7. リハでの確認手順

1. レベルメーターで **L と R が別々に振れるか**
2. **キックだけ叩いてもらう** → L だけ振れればOK。R が振れたらケーブルが逆
3. **全体を演奏** → R が振れるか、PEAK が点かないか
4. 演奏を止めて **ハムノイズが乗っていないか**
5. イヤモニで **キックが聞こえず、全体だけ聞こえるか**

---

## 8. 未解決の課題

### MIX MINUS ON でイヤモニにノイズが乗る（2026-07-29 時点）

本番構成そのものなので、本番までに切り分けが必要。

**切り分け方法:** MIX MINUS を OFF のまま、CH1 と CH2 のフェーダーを 0 まで下げる（＝AUXだけが聞こえる状態）。

| 結果 | 原因 | 対処 |
| --- | --- | --- |
| ノイズが乗る | AUX 入力側の問題 | プラグインパワー（マイクバイアス）かレベル不整合。下の代案へ |
| ノイズが乗らない | MIX MINUS 自体がノイズ源 | 代案へ |

**代案（機材追加なしで AUX を使わない構成）:**

CH1 と CH2 を入れ替える。

```
卓 全体ミックス ──→ CH1（音質が良い方）→ PCのL ＋ イヤモニで聞く
卓 キック      ──→ CH2              → PCのR ＋ フェーダー0で消す
```

CH1 はバランス受け可・GAIN連続可変・PEAK LED ありで音質面で有利。
キックは「鳴ったか」だけ分かればよいので、弱点のある CH2 に回してよい。
ケーブルの挿し替えだけで済むので当日でも対応できる。
**コード側は L/R 入れ替えスイッチで対応する。**

---

## 9. トラブル対処

| 症状 | 原因と対処 |
| --- | --- |
| ブラウザにAG03が出ない | macOSのマイク権限、Chrome再起動、USB挿し直し |
| L/Rが同じ動きをする | `channelCount: 2` か `echoCancellation: false` が抜けている |
| 音量が勝手に上下する | `autoGainControl: false` が抜けている |
| 音が細い・低音が出ない | CH2 が GUITAR(Hi-Z) になっている |
| 「ブーン」というハム | MacをACから外してバッテリー駆動に。直らなければDIボックス/アイソレータ |
| 音が小さい | 卓側のセンドレベルを上げてもらう → それでも駄目ならGAIN |
| 歪む・割れる | CH1をXLRで受けている、またはGAIN過大 |
| 2回線もらえなかった | 1系統をキックと全体の両方に流すフォールバックで動かす |

---

## 10. 制約として認識しておくこと

- **AG03MK2 で映像に反応させられるのは最大2系統**（DRY が送るのは CH1 と CH2G だけ）
- 3系統目が欲しくなっても AUX は PC に届かない。INPUT MIX にすると全部混ざって分離不可
- ただし**全体側をFFTで帯域分割すれば擬似的に増やせる**ので実用上は足りる

| 欲しいもの | 取り方 |
| --- | --- |
| キック | CH1 の専用回線（正確） |
| ベース | 全体の低域（bin 0〜2） |
| スネア・ボーカル | 全体の中域（bin 3〜10） |
| ハイハット・シンバル | 全体の高域（bin 11〜31） |

キックだけ専用回線にする価値が高いのは、**低域が被ってFFTでは分離しにくく、かつVJで一番使いたい情報だから**。
