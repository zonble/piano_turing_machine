# Piano Turing Machine

## 1. 核心目標

把一台 player piano 想像成一台純機械計算機：紙捲是 Tape，讀寫頭沿著 Tape 移動，鋼琴鍵是操作機器的機械控制，狀態齒輪保存機器目前的控制狀態。

這不是一個「有鋼琴外觀的計算器」，而是一台讓人可以看見、聽見、並且親手操作計算過程的機器。

第一個必須跑通的 use case 是：

> 從空白 Tape 開始，只用鋼琴輸入 `1#1`，執行二進位加法，得到 `10`。

所有 UI 和程式設計都要能回到這個 use case 驗證。

---

## 2. 機器架構

```text
┌──────────────┬──────────────────────┬──────────────────┐
│ 狀態齒輪     │ Tape + Head          │ 算術卡片         │
│              │                      │                  │
│ q0 q1 q2 ... │ 1  #  1              │ ADD              │
└──────────────┴──────────────────────┴──────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    Piano Keyboard                      │
└─────────────────────────────────────────────────────────┘
```

### 2.1 Tape

Tape 保存資料，不保存控制狀態。每個位置可以保存：

```text
0 / 1 / # / blank
```

Tape 需要支援：

- 讀取目前 Head 位置的符號
- 寫入符號
- 向左或向右移動 Head
- 顯示目前 Head 位置
- 顯示 Tape 的原始符號和解碼後的數值

### 2.2 State register

機器需要一個獨立的 State register。State 不寫在 Tape 上。

軟體模型中，State register 是：

```ts
currentState: StateId
```

純機械模型中，State register 是一個具棘爪定位的狀態輪：

- 每個凹槽代表一個 State，例如 `q0`、`q1`、`q2`
- 另一個鎖定位置代表 `HALT`
- 棘爪固定目前位置，讓機器能「記住」State
- 齒輪只負責傳遞動力，不直接代表 State
- State 跳轉可以採用 reset-to-zero，再以棘輪推進到目標 State

### 2.3 Operation card

Operation card 代表目前載入的計算規則，例如：

```text
ADD
Input: A#B
Output: A+B
```

純機械版本可把它實作成：

- 可替換的凸輪鼓
- 一組 operation selector
- 一張帶孔的規則卡

Operation card 決定 transition logic，但不取代 State register。

### 2.5 加法齒輪的可理解說明

加法不能只透過 transition table 呈現。Operation card 必須同時提供三層說明：

1. **一句話原理**：加法齒輪從右到左逐位相加，並用進位栓保存 carry。
2. **機械部件圖**：顯示左輸入齒輪 A、右輸入齒輪 B、加法輪、結果齒輪與進位栓之間的關係。
3. **同步的逐步解剖**：每次 STEP 或 PLAY 時顯示 A bit、B bit、Carry、Sum、寫入結果與下一個 Head movement。

以 `1 + 1` 為例，說明應該呈現：

```text
A = 1
B = 1
Carry = 0

1 + 1 + 0 = 10
→ 寫入 0
→ Carry 設為 1
→ 向左移動一格
```

下一步再把 carry 寫成最高位的 `1`，最後進入 `HALT`，得到 `10₂`。

Transition table 是工程檢查視圖；加法齒輪的逐步解剖才是使用者理解運算原理的主要視圖。

### 2.4 Transition logic

每一步由以下條件決定：

```text
(Current State, Tape Symbol)
        ↓
(Write Symbol, Head Direction, Next State)
```

例如：

```text
(q0, 1) → (write 0, move right, q1)
```

純機械版本由 Tape reader、凸輪、槓桿和狀態輪共同完成這個決策。

---

## 3. `1 + 1` 的完整 use case

### 3.1 初始狀態

新進入機器時：

```text
Operation: ADD
Tape: 空白
Head: 位置 0
State: INPUT
```

使用者不需要先選 sample，也不需要先填表單。

### 3.2 用鋼琴建立輸入

用 Tape action 區的白鍵輸入：

```text
WRITE 1
MOVE RIGHT
WRITE #
MOVE RIGHT
WRITE 1
```

Tape 變成：

```text
[ 1 ][ # ][ 1 ]
  ↑
```

### 3.3 執行計算

按下鋼琴上的 `PLAY` 後，機器以 clock 逐步執行 transition：

```text
INPUT → SCAN → ADD → CARRY → WRITE → HALT
```

對 `1 + 1` 而言：

```text
1 + 1
→ 寫入 0
→ 產生 carry 1
→ 寫入更高位
→ 得到 10
→ HALT
```

最後畫面和機器狀態應該是：

```text
Tape: 10
State: HALT
Binary: 10₂
Decimal: 2₁₀
Octal: 2₈
```

---

## 4. 鋼琴鍵盤功能映射

鍵盤以雙手的空間分工表達機器結構：

```text
低音區                 中音區                    高音區
STATE                  TAPE ACTION              MACHINE CONTROL
```

### 4.1 左手／低音：State

左手低音區操作 State register：

```text
STATE 0 → 設定 q0
STATE 1 → 設定 q1
STATE 2 → 設定 q2
STATE 3 → 設定 q3
STATE 4 → 設定 q4
STATE 5 → 設定 q5
HALT    → 鎖定停機狀態
```

自動執行時，State 由 transition rule 改變；手動探索時，State key 可以直接轉動狀態齒輪。

### 4.2 中音／右手前段：Tape action

```text
WRITE 0
WRITE 1
WRITE SEPARATOR (#)
BLANK
MOVE LEFT
MOVE RIGHT
```

這些鍵直接作用在 Head 所在的 Tape cell。

### 4.3 高音／右手後段：Machine control

```text
STEP  → 執行一個 transition
PLAY  → 連續執行 transition
RESET → 重設 State、Head、Step，但保留 Tape
```

`PLAY` 必須是鋼琴鍵，不可以只存在於外部 HTML 按鈕。

### 4.4 黑鍵

黑鍵不承擔主要輸入，避免使用者必須記住複雜的黑鍵配置。黑鍵可以用於：

- READ 0 / READ 1 條件
- modifier
- transition 的輔助聲部
- 純音樂演奏

所有主要計算動作都應優先放在白鍵上。

### 4.5 鍵盤標示

每個有計算功能的琴鍵必須同時顯示：

- 琴鍵名稱
- 功能名稱
- 電腦鍵盤映射
- 按下後影響的機器部件

例如：

```text
Y
WRITE 1
Tape / Head cell
```

實際琴鍵上的主要標示應該極簡，直接使用功能符號，不把工程名稱塞進琴鍵：

```text
←       Head 向左
→       Head 向右
0       寫入 0
1       寫入 1
#       寫入分隔符
□       清除為 blank
▶       PLAY
⏹       STOP / HALT
⏭       STEP
```

完整解釋可以放在琴鍵下方或 key map 中；琴鍵本身只需要讓使用者一眼知道「按下會做什麼」。State 不應該用 `STATE 0` 這種抽象文字塞在 Tape action 鍵上，而應該由上方的狀態齒輪和目前亮起的 `q0`、`q1` 指示器表達。

---

## 5. UI 版面

### 上方：機器本體

```text
[State register] [Tape + Head] [Operation card]
```

三個區域必須互相對齊：

- State register 顯示目前 State
- Tape 顯示資料和 Head
- Operation card 顯示 ADD、輸入格式與規則摘要

### 下方：Piano

鋼琴是主要操作介面，不放在進階區，也不隱藏在頁面最下方。

鋼琴下方顯示一行當前操作說明，例如：

```text
WRITE 1 → MOVE RIGHT → WRITE # → MOVE RIGHT → WRITE 1 → PLAY
```

### 輔助資訊

以下內容可以收進 Advanced，但不能取代主流程：

- 完整 transition table
- 完整 key map
- raw Tape positions
- event history
- 機械結構細節

---

## 6. 計算模式

### 6.1 Manual / Explore

使用者透過鋼琴直接操作：

- 改變 Tape
- 移動 Head
- 改變 State
- 執行單步
- 執行播放

### 6.2 Auto computation

機器依照 Operation card 的 transition rules 自動執行。每一步需要同步顯示：

- Current State
- 讀到的 Tape symbol
- 寫入的 symbol
- Head movement
- Next State
- 對應的鋼琴鍵與聲音

---

## 7. 錯誤與停機

機器不得靜默失敗。至少需要處理：

- 缺少 `#`
- 超過一個 `#`
- 空 operand
- 非法 Tape symbol
- 除以零
- 不存在的 transition
- 已經 HALT 後再次 PLAY

錯誤應該顯示在 State／Operation 區域，並說明使用者下一步能做什麼。

---

## 8. 開發順序

1. 定義 State register、Tape、Head、Transition 的資料模型。
2. 讓 `1#1` 可以由 Piano action 建立。
3. 讓 Piano 的 PLAY 執行完整 transition。
4. 完成 `1 + 1 → 10` 的逐步計算和 HALT。
5. 顯示 State register、Tape、Operation card 三個上方模組。
6. 完成白鍵功能標示和實體鍵盤映射。
7. 再加入其他 operation 和 sample。
8. 最後加入 transition inspector、event history 和機械細節。

任何新功能都必須先確認不會破壞第一個 use case：

> 新使用者能否只用鋼琴完成 `1 + 1`？

---

## 9. 明確不採用的方向

- 不把 Piano 當作裝飾性的音樂 UI。
- 不把 State 寫進 Tape。
- 不要求使用者先理解 transition table 才能開始。
- 不讓 PLAY 只存在於 HTML 控制按鈕。
- 不先擴充大量 operation，再補核心的 `1 + 1` 體驗。
- 不把完整的馮紐曼式 Store、PC、IR 當成第一版純機械架構。

第一版選擇 Tape 型、有限狀態、凸輪控制的機械架構；算術模組可以逐步加入，但必須服務於可觀察、可操作的鋼琴計算體驗。
