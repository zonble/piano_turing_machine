import { useEffect, useMemo, useState } from 'react'
import { applyPianoAction, createInitialMachine, formatBitPosition, formatTapeSymbol, octalTapeText, pianoActions, runStep, tapeText, type MachineSnapshot, type MechanicalPhase, type PianoAction } from './core/machine'
import { pianoFrequency, playBellChime, playFinalChord, playPunchStamp, playRatchetClick, playTone } from './core/audio'
import './App.css'

const keyNames = ['F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E']
const blackKeys = new Set(['F♯', 'G♯', 'A♯', 'C♯', 'D♯'])
const whiteKeyIndices = keyNames.map((name, index) => blackKeys.has(name) ? -1 : index).filter((index) => index >= 0)
const whiteKeyboardMap = ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'a', 's', 'd', 'f', 'g']
const whiteLabels = ['q0待命', 'q1讀A', 'q2讀B', 'q3敲鈴', 'q4個位', 'q5進位', 'HALT', '·', '·', '←', '→', '0', '1', '□', '#', '⏭', '▶', '⏹', '↺', '', '', '']
const stateNames = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'HALT'] as const
const stateSlotTitles: Record<(typeof stateNames)[number], string> = {
  q0: 'q0 待命',
  q1: 'q1 讀A',
  q2: 'q2 讀B',
  q3: 'q3 敲鈴',
  q4: 'q4 個位',
  q5: 'q5 進位',
  HALT: 'HLT 完成',
}
const stateRegister = (snapshot: MachineSnapshot): (typeof stateNames)[number] => {
  const phase = snapshot.gear?.phase
  if (phase === 'READ_A') return 'q1'
  if (phase === 'READ_B') return 'q2'
  if (phase === 'BELL_EQ') return 'q3'
  if (phase === 'STAMP_SUM') return snapshot.halted ? 'HALT' : 'q4'
  if (phase === 'STAMP_CARRY') return 'q5'
  if (snapshot.state === 'HALT') return 'HALT'
  if (snapshot.state === 'INPUT') return 'q0'
  if (snapshot.state === 'SCAN') return 'q1'
  if (snapshot.state === 'ADD') return 'q2'
  if (snapshot.state === 'CARRY') return 'q3'
  if (snapshot.state === 'WRITE') return 'q4'
  return snapshot.state
}
const tapePositions = (head: number) => Array.from({ length: 19 }, (_, index) => head - 9 + index)

const mechanicalStages: Array<{ id: MechanicalPhase; action: PianoAction; step: string; code: string; title: string; detail: string }> = [
  { id: 'READ_A', action: 'setState1', step: '①', code: 'q1', title: '讀 A 推棘輪', detail: '推進爪推齒 → 止回爪鎖定' },
  { id: 'READ_B', action: 'setState2', step: '②', code: 'q2', title: '讀 B 再累加', detail: '同爪再推齒 → 頂出進位栓' },
  { id: 'BELL_EQ', action: 'setState3', step: '③', code: 'q3', title: '🔔 當！印 =', detail: '推進爪彈回 → 打孔印 =' },
  { id: 'STAMP_SUM', action: 'setState4', step: '④', code: 'q4', title: '凸輪印該位', detail: '奇偶凸輪 → 印當前 bit' },
  { id: 'STAMP_CARRY', action: 'setState5', step: '⑤', code: 'q5', title: '退格印進位', detail: '往左退格 → 釋放進位' },
]

function polarPoint(angleRad: number, radius: number): string {
  const x = (radius * Math.sin(angleRad)).toFixed(2)
  const y = (-radius * Math.cos(angleRad)).toFixed(2)
  return `${x},${y}`
}

function buildSpurGearPath(teeth = 14, outerR = 55, innerR = 45): string {
  const step = (2 * Math.PI) / teeth
  const commands: string[] = []
  for (let i = 0; i < teeth; i += 1) {
    const center = i * step
    const p0 = polarPoint(center - step * 0.32, innerR)
    const p1 = polarPoint(center - step * 0.19, outerR)
    const p2 = polarPoint(center + step * 0.19, outerR)
    const p3 = polarPoint(center + step * 0.32, innerR)
    commands.push(`${i === 0 ? 'M' : 'L'} ${p0} L ${p1} L ${p2} L ${p3}`)
  }
  return `${commands.join(' ')} Z`
}

function buildRatchetWheelPath(teeth = 12, outerR = 56, innerR = 42): string {
  const step = (2 * Math.PI) / teeth
  const commands: string[] = []
  for (let i = 0; i < teeth; i += 1) {
    const start = i * step
    const next = (i + 1) * step
    // Steep radial locking cliff, then long asymmetric sawtooth ramp
    const tip = polarPoint(start, outerR)
    const gullet = polarPoint(start + step * 0.1, innerR)
    const nextTip = polarPoint(next, outerR)
    commands.push(`${i === 0 ? 'M' : 'L'} ${tip} L ${gullet} L ${nextTip}`)
  }
  return `${commands.join(' ')} Z`
}

const spurGearPath = buildSpurGearPath(14, 55, 45)
const ratchetWheelPath = buildRatchetWheelPath(12, 56, 42)

const actionToKeyIndex = Object.fromEntries(
  Object.entries(pianoActions).map(([shortcut, action]) => {
    const whiteIdx = whiteKeyboardMap.indexOf(shortcut)
    return [action, whiteIdx >= 0 ? whiteKeyIndices[whiteIdx] : 19]
  }),
) as Record<PianoAction, number>

function playPhaseSound(snapshot: MachineSnapshot) {
  const phase = snapshot.gear?.phase
  if (phase === 'READ_A' || phase === 'READ_B') {
    playRatchetClick(snapshot.gear?.ratchetTotal ?? 1)
    return
  }
  if (phase === 'BELL_EQ') {
    playBellChime()
    playPunchStamp()
    return
  }
  if (phase === 'STAMP_SUM' || phase === 'STAMP_CARRY') {
    playPunchStamp()
    if (snapshot.halted) playFinalChord()
  }
}

function App() {
  const [machine, setMachine] = useState<MachineSnapshot>(() => createInitialMachine())
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [pressedKey, setPressedKey] = useState<number | null>(null)
  const cells = useMemo(() => tapePositions(machine.head), [machine.head])

  const dispatch = (action: PianoAction, keyIndex?: number) => {
    const resolvedKeyIndex = keyIndex ?? actionToKeyIndex[action]
    const next = applyPianoAction(machine, action)
    setMachine(next)
    playTone(pianoFrequency(41 + resolvedKeyIndex))
    if ((action === 'play' || action === 'step' || action.startsWith('setState')) && next.gear?.phase) {
      playPhaseSound(next)
    }
    if (keyIndex === undefined) {
      setPressedKey(resolvedKeyIndex)
      window.setTimeout(() => setPressedKey(null), 180)
    }
    if (action === 'play' && !next.halted && next.program) setRunning(true)
    if (action === 'step' || action.startsWith('setState') || action === 'stop' || action === 'reset' || next.halted) setRunning(false)
  }

  useEffect(() => {
    if (!running || machine.halted) return
    const timer = window.setInterval(() => {
      setMachine((current) => {
        const next = runStep(current)
        if (next.halted) setRunning(false)
        if (next.gear?.phase) {
          const stage = mechanicalStages.find((s) => s.id === next.gear?.phase)
          if (stage) {
            const stageKeyIdx = actionToKeyIndex[stage.action]
            setPressedKey(stageKeyIdx)
            window.setTimeout(() => setPressedKey(null), 180)
            playTone(pianoFrequency(41 + stageKeyIdx))
          }
          playPhaseSound(next)
        }
        return next
      })
    }, 1000 / speed)
    return () => window.clearInterval(timer)
  }, [running, machine.halted, speed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      const pressed = event.key.toLowerCase()
      const whiteIndex = whiteKeyboardMap.indexOf(pressed)
      const action = pianoActions[pressed]
      if (!action && whiteIndex < 0) return
      event.preventDefault()
      const keyIndex = whiteIndex >= 0 ? whiteKeyIndices[whiteIndex] : undefined
      if (keyIndex !== undefined) {
        setPressedKey(keyIndex)
        window.setTimeout(() => setPressedKey(null), 180)
      }
      if (action) {
        dispatch(action, keyIndex)
      } else if (keyIndex !== undefined) {
        playTone(pianoFrequency(41 + keyIndex))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const rawTape = tapeText(machine.tape)
  const octalTape = octalTapeText(rawTape)
  const activeGear = machine.gear
  const activePhase = activeGear?.phase
  const activePhaseIndex = activePhase ? mechanicalStages.findIndex((s) => s.id === activePhase) : -1

  // During INPUT, ratchet stays at 0 until ▶ / ⏭ starts decomposition
  const isProbing = activePhase === 'READ_A' || activePhase === 'READ_B'
  const pawlStroke = isProbing ? (activeGear?.pawlStroke ?? 0) : 0
  const ratchetNotch = activeGear ? activeGear.ratchetTotal : 0
  const sumBit = activeGear ? (ratchetNotch % 2 as 0 | 1) : null
  const carryLatched = activeGear ? activeGear.carryOut === 1 : false
  const bellRinging = Boolean(activeGear?.bellRung)
  const hammerPunching = Boolean(activeGear?.punching)

  const currentBitLabel = activeGear?.bitIndex !== undefined ? formatBitPosition(activeGear.bitIndex) : null
  const currentSymbol = formatTapeSymbol(machine.tape[machine.head])
  const gearWorking = running || ['SCAN', 'ADD', 'CARRY', 'WRITE'].includes(machine.state)
  const gearPhaseLabel = currentBitLabel && activePhase
    ? `${currentBitLabel} · ${activePhase}`
    : activePhase ?? (machine.state === 'HALT' ? 'HALT' : 'READY (0格)')
  const gearSummary = activeGear && machine.lastEvent?.message
    ? machine.lastEvent.message
    : '棘輪歸零 (00₂)；輸入 A#B 後按 ▶ 啟動逐位元分解。'

  const currentStateSlot = stateRegister(machine)
  const stateIndex = Math.max(0, stateNames.indexOf(currentStateSlot))
  const stateStepDeg = 360 / stateNames.length

  const currentCellSymbol = machine.tape[machine.head]
  const probeDropThrough = isProbing && currentCellSymbol === '1'
  const probeBlocked = isProbing && currentCellSymbol === '0'
  const isSeparatorCell = currentCellSymbol === 'separator'
  const isEqualsCell = currentCellSymbol === 'equals'
  const probeStatusText = activePhase === 'READ_A' && currentBitLabel
    ? `讀取 A 的${currentBitLabel} · ${probeDropThrough ? '● 穿孔 (1) → 推 +1 齒' : '○ 無孔 (0) → 推 +0 齒'}`
    : activePhase === 'READ_B' && currentBitLabel
      ? `讀取 B 的${currentBitLabel} · ${isSeparatorCell ? '無此高位 → +0 齒' : probeDropThrough ? '● 穿孔 (1) → 推 +1 齒' : '○ 無孔 (0) → 推 +0 齒'}`
      : isEqualsCell
        ? '🔔 雙橫槽孔 (=) · 觸發銅鈴與結果打孔'
        : isSeparatorCell
          ? '⊞ 分隔雙方孔 (#) · 區隔兩數'
          : hammerPunching && currentBitLabel
            ? `🔨 打孔印結果的${currentBitLabel} (${currentSymbol} AT ${machine.head >= 0 ? '+' : ''}${machine.head})`
            : hammerPunching
              ? `🔨 衝頭打孔 (${currentSymbol} AT ${machine.head >= 0 ? '+' : ''}${machine.head})`
              : probeDropThrough
                ? '● 單圓孔穿通 (1) · 氣閥進氣 (+1齒)'
                : probeBlocked || currentCellSymbol === '0'
                  ? '○ 無孔紙面 (0) · 擋住探針 (+0)'
                  : `${currentSymbol} AT ${machine.head >= 0 ? '+' : ''}${machine.head} · TRACKER BAR`

  return <main className="app-shell">
    <header className="masthead"><div className="brand-mark">PTM<i /></div><div><p className="eyebrow">A MECHANICAL COMPUTING INSTRUMENT</p><h1>Piano <em>Turing</em> Machine</h1></div><div className={`machine-status ${running ? 'live' : ''}`}><span />{running ? 'PLAYING' : machine.halted ? 'HALT' : 'READY'}</div></header>

    <section className="stage-strip" aria-label="5-step mechanical decomposition">
      {mechanicalStages.map((stage, index) => {
        const isCurrent = activePhase === stage.id
        const isDone = activePhaseIndex > index || (machine.halted && index <= activePhaseIndex)
        return (
          <button
            type="button"
            key={stage.id}
            className={`stage-pill ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
            onClick={() => dispatch(stage.action)}
            title={`點擊或按鋼琴 ${stage.code} 鍵直接切換至此分解步驟`}
          >
            <div className="stage-header">
              <span className="stage-num">{stage.step} {stage.code}</span>
              <strong>{stage.title}</strong>
            </div>
            <small>{stage.detail}</small>
          </button>
        )
      })}
    </section>

    <section className="machine-board">
      <section className={`tape-module module ${isProbing ? 'probing' : ''} ${bellRinging ? 'bell-flash' : ''}`}>
        <div className="module-heading"><span>TAPE + TRACKER BAR</span><span>{probeStatusText}</span></div>
        <div className="tape-window">
          <div
            className={`playhead-frame ${hammerPunching ? 'punching' : ''} ${probeDropThrough ? 'probe-open' : ''} ${probeBlocked ? 'probe-blocked' : ''} ${isSeparatorCell ? 'probe-separator' : ''} ${isEqualsCell ? 'probe-equals' : ''}`}
            aria-hidden="true"
          >
            <div className="feeler-pin">
              <i className="pin-spring" />
              <span className="pin-tip">▼</span>
            </div>
            <div className="tracker-port">
              <i className="port-nozzle" />
              <span>
                {probeDropThrough
                  ? 'AIR IN (1)'
                  : isSeparatorCell
                    ? 'SHIFT (#)'
                    : isEqualsCell
                      ? 'BELL (=)'
                      : hammerPunching
                        ? 'STAMP'
                        : 'SEALED'}
              </span>
            </div>
          </div>
          <div
            className="tape-cells"
            style={{ '--head': machine.head } as React.CSSProperties}
          >
            {cells.map((position) => {
              const rawSym = machine.tape[position]
              const symbol = formatTapeSymbol(rawSym)
              const isSelected = position === machine.head
              const holeType =
                rawSym === '1'
                  ? 'open-hole'
                  : rawSym === '0'
                    ? 'solid-mark'
                    : rawSym === 'separator'
                      ? 'separator-holes'
                      : rawSym === 'equals'
                        ? 'equals-holes'
                        : ''
              return (
                <div
                  className={`tape-cell ${isSelected ? 'selected' : ''} ${rawSym ? `punched sym-${rawSym}` : ''}`}
                  key={position}
                  style={{ '--cell-pos': position } as React.CSSProperties}
                >
                  <span className="sprocket top" aria-hidden="true" />
                  <span className="position">{position}</span>
                  <span className={`data-hole ${holeType}`} aria-hidden="true" />
                  <strong key={`${position}-${symbol}`}>{symbol}</strong>
                  <span className="hole-caption" aria-hidden="true">
                    {rawSym === '1' ? '● 穿孔' : rawSym === '0' ? '○ 無孔' : rawSym === 'separator' ? '⊞ 分隔孔' : rawSym === 'equals' ? '🔔 結算孔' : ''}
                  </span>
                  {isSelected && <span className="needle">⌄</span>}
                  <span className="sprocket bottom" aria-hidden="true" />
                </div>
              )
            })}
          </div>
        </div>
        <div className="tape-readout">
          <div className="tape-readout-stack">
            <span>RAW <b>{rawTape || 'blank'}</b></span>
            <span>OCT <b>{octalTape || 'blank'}</b></span>
          </div>
          <span>HEAD <b>{machine.head}</b></span>
          <span>STEP <b>{String(machine.step).padStart(3, '0')}</b></span>
        </div>
      </section>

      <section className={`state-module module ${gearWorking ? 'working' : ''}`}>
        <div className="module-heading"><span>STATE GEAR (正齒輪)</span><span>{stateSlotTitles[currentStateSlot]}</span></div>
        <div className="state-gear-bench">
          <div className="state-gear-housing">
            <div className="index-pawl" title="狀態齒輪定位指標">▼</div>
            <div
              className="state-gear-wheel"
              style={{ transform: `rotate(${-stateIndex * stateStepDeg}deg)` }}
              aria-label={`State gear wheel at ${currentStateSlot}`}
            >
              <svg className="wheel-svg spur-svg" viewBox="-60 -60 120 120" aria-hidden="true">
                <path d={spurGearPath} className="gear-rim spur-rim" />
                <circle cx="0" cy="0" r="41" className="gear-inner-ring" />
              </svg>
              {stateNames.map((state, idx) => (
                <span
                  key={state}
                  className={`state-tooth ${currentStateSlot === state ? 'active' : ''}`}
                  style={{ transform: `rotate(${idx * stateStepDeg}deg) translateY(-49px)` }}
                >
                  <b style={{ transform: `rotate(${stateIndex * stateStepDeg - idx * stateStepDeg}deg)` }}>
                    {state === 'HALT' ? 'HLT' : state}
                  </b>
                </span>
              ))}
              <div
                className="wheel-hub"
                style={{ transform: `rotate(${stateIndex * stateStepDeg}deg)` }}
              >
                <span>{currentStateSlot}</span>
              </div>
            </div>
          </div>
          <div className="state-wheel">
            {stateNames.map((state) => (
              <div className={`state-slot ${currentStateSlot === state ? 'current' : ''}`} key={state}>
                <i />{stateSlotTitles[state]}
              </div>
            ))}
          </div>
        </div>
        <p className="module-note">對稱方齒正齒輪（Spur Gear），隨每動旋轉切換狀態。</p>
      </section>

      <section className={`operation-module module ${gearWorking ? 'working' : ''}`}>
        <div className="module-heading"><span>ARITHMETIC RATCHET (斜齒棘輪)</span><span>{gearPhaseLabel}</span></div>
        <div className="ratchet-bench" aria-label="1900s 4-notch mechanical adder mechanism">
          <div className="pawl-stack">
            <div className={`input-pawl ${isProbing && pawlStroke === 1 ? 'pushing' : ''}`} aria-label="Driving pawl">
              <span className="pawl-tag">①② 推進爪</span>
              <strong>{isProbing ? (pawlStroke === 1 ? '+1 齒' : '+0 齒') : '待命'}</strong>
              <i className="pawl-claw" aria-hidden="true" />
            </div>
            <div className={`input-pawl ${activePhase === 'STAMP_SUM' ? 'pushing' : sumBit === 1 ? 'engaged' : ''}`} aria-label="Odd-even cam">
              <span className="pawl-tag">④ 奇偶凸輪</span>
              <strong>{sumBit === null ? '凹槽 0' : sumBit === 1 ? '凸齒 1' : '凹槽 0'}</strong>
              <i className="pawl-claw" aria-hidden="true" />
            </div>
          </div>

          <div className="ratchet-housing">
            <div className="index-pawl" title="頂部止回棘爪 (Locking Pawl)">▼</div>
            <div
              className={`ratchet-wheel notch-${ratchetNotch}`}
              style={{ transform: `rotate(${-ratchetNotch * 90}deg)` }}
              aria-label={`4-notch adder wheel at notch ${ratchetNotch}`}
            >
              <svg className="wheel-svg ratchet-svg" viewBox="-60 -60 120 120" aria-hidden="true">
                <path d={ratchetWheelPath} className="gear-rim ratchet-rim" />
                <circle cx="0" cy="0" r="39" className="gear-inner-ring" />
              </svg>
              <span className="wheel-notch n0"><b>0</b><small>00₂</small></span>
              <span className="wheel-notch n1 odd-cam"><b>1</b><small>01₂</small></span>
              <span className="wheel-notch n2 carry-cam"><b>2</b><small>10₂</small></span>
              <span className="wheel-notch n3 odd-cam carry-cam"><b>3</b><small>11₂</small></span>
              <div className="wheel-hub"><span>{ratchetNotch}格</span></div>
            </div>
          </div>

          <div className="right-mechanisms">
            <div className={`bell-indicator ${bellRinging ? 'ringing' : ''}`} aria-label="Read completion bell">
              <span className="mech-tag">③ 銅鈴</span>
              <strong>{bellRinging ? '🔔 當！' : '🔔 待命'}</strong>
            </div>
            <div className={`carry-latch ${carryLatched ? 'latched' : ''} ${activePhase === 'STAMP_CARRY' ? 'releasing' : ''}`} aria-label="Carry latch pin">
              <span className="latch-title">⑤ 進位栓</span>
              <div className="latch-track"><div className="latch-bolt" /></div>
              <strong>{activePhase === 'STAMP_CARRY' ? '釋放 → 1' : carryLatched ? 'LOCK 1' : 'FREE 0'}</strong>
            </div>
          </div>
        </div>
        <p className="module-note">{gearSummary}</p>
      </section>
    </section>

    <section className="piano-module module"><div className="module-heading"><span>PIANO CONTROL</span><span>白鍵是機器功能</span></div><div className="piano-wrap"><div className="piano"><div className="keybed">{keyNames.map((name, index) => { const whiteIndex = whiteKeyIndices.indexOf(index); const key = whiteIndex >= 0 ? whiteKeyboardMap[whiteIndex] : ''; const action = key ? pianoActions[key] : undefined; const label = whiteIndex >= 0 ? whiteLabels[whiteIndex] : ''; const active = pressedKey === index; return <button key={`${name}-${index}`} className={`piano-key ${blackKeys.has(name) ? 'black' : 'white'} ${active ? 'active' : ''}`} title={`${label || 'melody'}${key ? ` · ${key}` : ''}`} aria-label={`${label || 'melody'}${key ? ` · ${key}` : ''}`} onClick={() => { setPressedKey(index); window.setTimeout(() => setPressedKey(null), 180); if (action) dispatch(action, index); else playTone(pianoFrequency(41 + index)) }}><span>{label || name}</span><small>{key}</small></button> })}</div></div></div><div className="piano-guide"><span><b>←</b> move</span><span><b>0 1 #</b> write</span><span><b>⏭</b> step</span><span><b>▶</b> play</span><span><b>⏹</b> stop</span></div></section>
    <p className="one-plus-one">1 + 1：<b>1</b> → <b>→</b> → <b>#</b> → <b>→</b> → <b>1</b> → <b>▶</b>（或連按 <b>⏭</b> 逐步分解）</p>

    <section className="run-module module"><div className="module-heading"><span>MECHANICAL READOUT</span><span>{machine.lastEvent?.message ?? '請用鋼琴輸入 1#1'}</span></div><div className="run-status"><strong>{machine.state}</strong><span>{machine.halted && machine.result ? `${rawTape} （${machine.result.binary}₂ = ${machine.result.decimal}₁₀ = ${machine.result.octal}₈）` : `Tape: ${rawTape || 'blank'}`}</span></div><label>速度 <b>{speed} steps / sec</b><input type="range" min="0.5" max="6" step="0.5" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label></section>

    <details className="advanced-module"><summary>ADVANCED：transition table / complete key map / mechanical details</summary><p>按下 ▶ 或 ⏭ 後依序執行：① 探針讀首數，推進棘爪推棘輪並由止回爪卡住 → ② 探針跨過 # 讀次數，同一推進棘爪再把棘輪往上推並頂出進位栓 → ③ 推進爪彈回待命、敲響「當！」銅鈴並印 = → ④ 移至個位格，照棘輪奇偶凸輪印個位 → ⑤ 往左退一格釋放進位栓印高位。</p></details>
    <footer><span>PIANO TURING MACHINE / 2026</span><span>STATE · TAPE · GEAR · SOUND</span><span>{machine.halted ? 'FINAL CHORD' : 'READY TO PLAY'}</span></footer>
  </main>
}

export default App
