# 鋼琴圖靈機 (Piano Turing Machine) 企劃與規格書

## 1. 專案願景與核心概念

自動鋼琴（Player Piano）在歷史上採用單向捲動的打孔紙捲（Piano Roll）來驅動機械彈奏。如果我們將紙捲改為**可雙向捲動、可讀取、可寫入**的 Tape，並將鋼琴按鍵賦予讀寫與狀態轉移的邏輯，鋼琴就昇華為一台「通用圖靈機（Universal Turing Machine）」。

每一次數學運算，都是一首具備對位與極簡主義律動的鋼琴曲；運算停機（HALT）之時，正是樂章終曲。

---

## 2. 核心功能與互動架構

### 2.1 雙模互動架構
* **自動演奏運算模式（Auto Computation Mode）**：
  * 使用者選取演算法範例（或自訂初始 Tape），按下「播放」。
  * 圖靈機讀取 Tape，命中的轉移規則會自動驅動對應的鋼琴鍵下沉並發出琴聲。
  * 支援 **Play / Pause / Step（單步）/ Reset** 以及 **速度調節（BPM / Steps per sec）**。
* **手動彈奏 / 探索模式（Interactive Piano Mode）**：
  * 使用者可自由點擊或使用電腦鍵盤彈奏鋼琴，體驗琴聲與即時觸發的 Tape 操作或狀態變化。
  * 可直接點擊 Tape 上的方格，隨意切換或編輯初始 0 / 1 / 空白狀態。

---

## 3. 鋼琴鍵盤與圖靈機映射體系（雙手結構）

鍵盤採用 **3 個八度（37 鍵，F2 ～ F5）**，模擬古典鋼琴演奏中的雙手對位結構：

```
[         左手區：低音部 (F2 ~ E3)         ]  [          右手區：高音部 (F3 ~ F5)          ]
[ 狀態轉移 (State Transition / Bassline)   ]  [ Tape 讀寫與移動 (Tape Action / Melody)      ]
```

### 3.1 左手部：狀態低音（Bass / State Representation）
* 對應圖靈機的內部狀態（State 0, State 1, State 2, ..., Halt）。
* 每當狀態發生改變時，左手低音鍵沉下，敲響厚重的低音和弦或根音，營造結構性律動。
* 特殊狀態（如 HALT 停機）有對應的終止和弦音。

### 3.2 右手部：動作旋律（Melody / Tape Actions）
* 對應圖靈機讀寫頭（Head）的具體微操作：
  * **Move Left**（例如低階高音，如 G3）
  * **Move Right**（例如高階高音，如 C4）
  * **Write 0**（特定白鍵音）
  * **Write 1**（特定白鍵音）
  * **Read 0 / Read 1**（配合輕巧裝飾音或黑鍵）
* 當計算來回循環時，右手會形成如 Steve Reich / Philip Glass 般的極簡主義琶音與節奏。

---

## 4. 聲音引擎（Audio Engine）

* **技術實現**：基於 Web Audio API / Tone.js。
* **音色取樣**：載入高品質、輕量級的原聲鋼琴取樣（Acoustic Piano Samples / SoundFont）。
* **音樂表現**：
  * 支援 Polyphony（複音演奏，左右手可同時發聲）。
  * 琴鍵下沉有擊弦力度（Velocity）感與自然釋放衰減（Release / Decay）。

---

## 5. 視覺風格與 UI/UX 設計

以 **「19 世紀末自動鋼琴打孔紙捲（Player Piano Roll）+ 精密機械」** 為主視覺風格：

### 5.1 上方：打孔紙捲（Player Piano Roll & Head）
* **質感**：泛黃復古牛皮紙質、網格微紋理。
* **符號打孔**：`0` 與 `1` 呈現為機械穿孔圓孔與穿透光影（未穿孔為空白格）。
* **讀寫頭（Head）**：金屬黃銅質感探針指針，指示目前讀取的 Cell，讀寫與移動時伴隨步進動畫。
* **直接互動**：使用者可滑鼠點擊任意格快速改寫資料。

### 5.2 中間：37 鍵互動鋼琴鍵盤（Piano Keyboard）
* 擬真黑白鋼琴鍵盤，具備陰影與按壓下沉動畫。
* 琴鍵上方具備發光標籤（例如標註對應的 State 名稱或 Action 動作）。
* 自動演奏時，命中的琴鍵會點亮並觸發漣漪光暈效果。

### 5.3 下方：狀態儀表與轉移規則查看器（Inspector & Controls）
* **控制面板**：播放 / 暫停、單步向前、重置、速度滑桿（BPM）、總步數（Step Count）。
* **狀態儀表**：目前 State、當前讀取值、目前 Tape 數值解碼（二進位轉十進位數字）。
* **轉移規則查看器（Transition Table Inspector）**：
  * 列表呈現當前題目的圖靈機規則表（$\delta(Q, \Sigma) \to (Q', \Sigma', \text{Dir})$）。
  * 每次執行時，**即時高亮目前被觸發的那一行規則**，讓使用者一目了然機器如何決策。

---

## 6. 內建演算法範例庫（Built-in Presets）

系統將內建以下 5 個經典圖靈機程序，附帶說明與初始資料：

1. **二進位自增 1（Binary Incrementer）**
   * *說明*：將紙帶上的二進位數字加 1（例如 `1011` $\to$ `1100`）。
   * *音樂特色*：進位時連續向左掃音，極具律動感。
2. **二進位加法（Binary Addition）**
   * *說明*：計算兩個二進位數的總和（例如 `3 + 5 = 8`）。
   * *音樂特色*：兩數之間來回搬移資料，旋律穿梭反覆。
3. **忙碌海狸（Busy Beaver - 3/4 State）**
   * *說明*：從全空白紙帶開始，在有限步內打出最多的 1 並停機。
   * *音樂特色*：高度複雜的非週期循環節奏，宛如即興現代古典樂。
4. **迴文檢查（Palindrome Checker）**
   * *說明*：檢查輸入字串是否對稱（例如 `1001`）。
   * *音樂特色*：讀寫頭往返兩端對比，左右跳躍的對稱音型。
5. **乘二運算 / 位元左移（Multiply by 2 / Bit Shift）**
   * *說明*：在末端補 0 並向左整理符號。
   * *音樂特色*：單向推動的琶音效果。

---

## 7. 前端技術棧與模組規劃

* **核心技術棧**：
  * **Bundler & Framework**：Vite + React 18+ + TypeScript
  * **Styling**：Tailwind CSS + Lucide Icons + 自訂復古紙捲/黃銅金屬 CSS 紋理
  * **Audio**：Tone.js（Sampler 加載真實原聲鋼琴取樣）
* **模組劃分**：
  * `core/turing/`：圖靈機核心引擎（Tape, Head, State Machine, Step Execution, Presets）。
  * `core/audio/`：聲音引擎（Tone.js Sampler 管理、音高映射、觸鍵與釋音）。
  * `components/tape/`：打孔紙捲渲染元件、探針讀寫頭動畫、單元格點擊編輯。
  * `components/piano/`：37 鍵鋼琴鍵盤、按鍵互動事件、音域映射標示。
  * `components/inspector/`：轉移規則表高亮顯示、控制按鈕組、速度滑桿、狀態儀表。
