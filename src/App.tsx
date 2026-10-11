import { useEffect, useMemo, useState } from 'react'
import { applyPianoAction, createInitialMachine, formatTapeSymbol, octalTapeText, pianoActions, runStep, tapeText, type MachineSnapshot, type MechanicalPhase, type PianoAction } from './core/machine'
import { pianoFrequency, playBellChime, playFinalChord, playPunchStamp, playRatchetClick, playTone } from './core/audio'
import './App.css'

const keyNames = ['F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E']
const blackKeys = new Set(['F♯', 'G♯', 'A♯', 'C♯', 'D♯'])
const whiteKeyIndices = keyNames.map((name, index) => blackKeys.has(name) ? -1 : index).filter((index) => index >= 0)
const whiteKeyboardMap = ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'a', 's', 'd', 'f', 'g']
const whiteLabels = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'HALT', '·', '·', '←', '→', '0', '1', '□', '#', '⏭', '▶', '⏹', '↺', '', '', '']
const stateNames = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'HALT'] as const
const stateRegister = (state: MachineSnapshot['state']) => state === 'HALT' ? 'HALT' : state === 'INPUT' ? 'q0' : state === 'SCAN' ? 'q1' : state === 'ADD' ? 'q2' : state === 'CARRY' ? 'q3' : state === 'WRITE' ? 'q4' : state
const tapePositions = (head: number) => Array.from({ length: 19 }, (_, index) => head - 9 + index)

const mechanicalStages: Array<{ id: MechanicalPhase; step: string; title: string; detail: string }> = [
  { id: 'READ_A', step: '①', title: '讀 A 推棘輪', detail: '探針讀 A → 推棘輪' },
  { id: 'READ_B', step: '②', title: '讀 B 推棘輪', detail: '探針讀 B → 鎖進位栓' },
  { id: 'BELL_EQ', step: '③', title: '🔔 當！印 =', detail: '讀完敲鈴 → 打孔印 =' },
  { id: 'STAMP_SUM', step: '④', title: '凸輪印個位', detail: '移至個位 → 印奇偶位' },
  { id: 'STAMP_CARRY', step: '⑤', title: '退格印進位', detail: '往左退格 → 釋放進位' },
]

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

  const soundForAction = (action: PianoAction) => {
    const midi = action === 'moveLeft' ? 48 : action === 'moveRight' ? 60 : action === 'write1' ? 67 : action === 'play' ? 72 : 64
    playTone(pianoFrequency(midi), .18, action === 'play' ? 'sine' : 'triangle')
  }

  const dispatch = (action: PianoAction, keyIndex?: number) => {
    const next = applyPianoAction(machine, action)
    setMachine(next)
    if ((action === 'play' || action === 'step') && next.gear?.phase) {
      playPhaseSound(next)
    } else if (keyIndex === undefined) {
      soundForAction(action)
    } else {
      playTone(pianoFrequency(41 + keyIndex), .18, 'triangle')
    }
    if (action === 'play' && next.state === 'SCAN') setRunning(true)
    if (action === 'stop' || action === 'reset' || next.halted) setRunning(false)
  }

  useEffect(() => {
    if (!running || machine.halted) return
    const timer = window.setInterval(() => {
      setMachine((current) => {
        const next = runStep(current)
        if (next.halted) setRunning(false)
        if (next.gear?.phase) playPhaseSound(next)
        return next
      })
    }, 1000 / speed)
    return () => window.clearInterval(timer)
  }, [running, machine.halted, speed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = pianoActions[event.key.toLowerCase()]
      if (!action || event.repeat) return
      event.preventDefault()
      const whiteIndex = whiteKeyboardMap.indexOf(event.key.toLowerCase())
      const keyIndex = whiteIndex >= 0 ? whiteKeyIndices[whiteIndex] : undefined
      if (keyIndex !== undefined) {
        setPressedKey(keyIndex)
        window.setTimeout(() => setPressedKey(null), 180)
      }
      dispatch(action, keyIndex)
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
  const aBit = activeGear ? activeGear.aBit : null
  const bBit = activeGear && activePhase !== 'READ_A' ? activeGear.bBit : null
  const carryIn = activeGear ? activeGear.carryIn : 0
  const ratchetNotch = activeGear ? activeGear.ratchetTotal : 0
  const sumBit = activeGear && activePhase !== 'READ_A' ? activeGear.sumBit : null
  const carryLatched = activeGear ? activeGear.carryOut === 1 : false
  const bellRinging = Boolean(activeGear?.bellRung)
  const hammerPunching = Boolean(activeGear?.punching)

  const currentSymbol = formatTapeSymbol(machine.tape[machine.head])
  const gearWorking = running || ['SCAN', 'ADD', 'CARRY', 'WRITE'].includes(machine.state)
  const gearPhaseLabel = activePhase ?? (machine.state === 'HALT' ? 'HALT' : 'READY (0格)')
  const gearEquation = activeGear
    ? activePhase === 'READ_A'
      ? `① 讀 A(${activeGear.aBit}) → 棘輪推至第 ${ratchetNotch} 格`
      : activePhase === 'READ_B'
        ? `② 讀 B(${activeGear.bBit}) → ${activeGear.aBit} + ${activeGear.bBit} = 第 ${ratchetNotch} 格 (${ratchetNotch.toString(2).padStart(2, '0')}₂)`
        : activePhase === 'BELL_EQ'
          ? `③ 🔔 當——！讀完 A+B（第 ${ratchetNotch} 格），打孔印出「=」`
          : activePhase === 'STAMP_SUM'
            ? `④ 凸輪打孔：第 ${ratchetNotch} 格（${activeGear.sumBit === 1 ? '奇數凸齒' : '偶數凹槽'}）→ 個位格印 ${activeGear.sumBit}`
            : `⑤ 進位栓釋放：往左退一格印出進位 1 → 棘輪歸零`
    : '輸入 A#B 時棘輪保持歸零 (0 格)；按下 ▶ 開始五動分解運算'

  const currentStateSlot = stateRegister(machine.state)
  const stateIndex = Math.max(0, stateNames.indexOf(currentStateSlot))
  const stateStepDeg = 360 / stateNames.length

  return <main className="app-shell">
    <header className="masthead"><div className="brand-mark">PTM<i /></div><div><p className="eyebrow">A MECHANICAL COMPUTING INSTRUMENT</p><h1>Piano <em>Turing</em> Machine</h1></div><div className={`machine-status ${running ? 'live' : ''}`}><span />{running ? 'PLAYING' : machine.halted ? 'HALT' : 'READY'}</div></header>

    <section className="stage-strip" aria-label="5-step mechanical decomposition">
      {mechanicalStages.map((stage, index) => {
        const isCurrent = activePhase === stage.id
        const isDone = activePhaseIndex > index || (machine.halted && index <= activePhaseIndex)
        return (
          <div
            key={stage.id}
            className={`stage-pill ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
          >
            <div className="stage-header">
              <span className="stage-num">{stage.step}</span>
              <strong>{stage.title}</strong>
            </div>
            <small>{stage.detail}</small>
          </div>
        )
      })}
    </section>

    <section className="machine-board">
      <section className={`tape-module module ${machine.state === 'SCAN' ? 'scanning' : ''} ${bellRinging ? 'bell-flash' : ''}`}>
        <div className="module-heading"><span>TAPE + HEAD</span><span>{currentSymbol} AT {machine.head >= 0 ? '+' : ''}{machine.head}</span></div>
        <div className="tape-window">
          <div className={`playhead-frame ${hammerPunching ? 'punching' : ''}`} aria-hidden="true" />
          <div
            className="tape-cells"
            style={{ '--head': machine.head } as React.CSSProperties}
          >
            {cells.map((position) => {
              const symbol = formatTapeSymbol(machine.tape[position])
              const isSelected = position === machine.head
              return (
                <div
                  className={`tape-cell ${isSelected ? 'selected' : ''} ${machine.tape[position] ? 'punched' : ''} ${machine.tape[position] === 'equals' ? 'equals-cell' : ''}`}
                  key={position}
                  style={{ '--cell-pos': position } as React.CSSProperties}
                >
                  <span className="sprocket top" aria-hidden="true" />
                  <span className="position">{position}</span>
                  <strong key={`${position}-${symbol}`}>{symbol}</strong>
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
        <div className="module-heading"><span>STATE GEAR</span><span>{currentStateSlot} · {machine.state}</span></div>
        <div className="state-gear-bench">
          <div className="state-gear-housing">
            <div className="index-pawl" title="狀態輪定位棘爪">▼</div>
            <div
              className="state-gear-wheel"
              style={{ transform: `rotate(${-stateIndex * stateStepDeg}deg)` }}
              aria-label={`State gear wheel at ${currentStateSlot}`}
            >
              {stateNames.map((state, idx) => (
                <span
                  key={state}
                  className={`state-tooth ${currentStateSlot === state ? 'active' : ''}`}
                  style={{ transform: `rotate(${idx * stateStepDeg}deg) translateY(-38px)` }}
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
                <i />{state}
              </div>
            ))}
          </div>
        </div>
        <p className="module-note">狀態輪隨每步推進旋轉，與右側加法棘輪連動。</p>
      </section>

      <section className={`operation-module module ${gearWorking ? 'working' : ''}`}>
        <div className="module-heading"><span>ARITHMETIC GEAR (4-NOTCH RATCHET)</span><span>{gearPhaseLabel}</span></div>
        <div className="ratchet-bench" aria-label="1900s 4-notch mechanical adder mechanism">
          <div className="pawl-stack">
            <div className={`input-pawl ${activePhase === 'READ_A' ? 'pushing' : ''} ${aBit === 1 ? 'engaged' : ''}`} aria-label="A input pawl">
              <span className="pawl-tag">① A 棘爪</span>
              <strong>{aBit === null ? '待命' : aBit === 1 ? '+1 齒' : '+0'}</strong>
            </div>
            <div className={`input-pawl ${activePhase === 'READ_B' ? 'pushing' : ''} ${bBit === 1 ? 'engaged' : ''}`} aria-label="B input pawl">
              <span className="pawl-tag">② B 棘爪</span>
              <strong>{bBit === null ? '待命' : bBit === 1 ? '+1 齒' : '+0'}</strong>
            </div>
          </div>

          <div className="ratchet-housing">
            <div className="index-pawl" title="頂部定位棘爪 (Index Pawl)">▼</div>
            <div
              className={`ratchet-wheel notch-${ratchetNotch}`}
              style={{ transform: `rotate(${-ratchetNotch * 90}deg)` }}
              aria-label={`4-notch adder wheel at notch ${ratchetNotch}`}
            >
              <span className="wheel-notch n0"><b>0</b><small>00₂</small></span>
              <span className="wheel-notch n1 odd-cam"><b>1</b><small>01₂</small></span>
              <span className="wheel-notch n2 carry-cam"><b>2</b><small>10₂</small></span>
              <span className="wheel-notch n3 odd-cam carry-cam"><b>3</b><small>11₂</small></span>
              <div className="wheel-hub"><span>+{ratchetNotch}</span></div>
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

        <div className="gear-equation">
          <strong>{gearEquation}</strong>
          <span>
            {activeGear
              ? `棘輪停在第 ${ratchetNotch} 格（奇偶凸輪 Sum=${activeGear.sumBit}；進位栓 Carry=${carryLatched ? 1 : 0}；打孔錘=${hammerPunching ? '🔨 壓印中' : '抬起'}）`
              : `目前紙帶：${rawTape || '空白'}（彈完 1#1 後按 ▶ 或連按 ⏭ 觀察五動分解）`}
          </span>
        </div>
        <div className="gear-explanation">
          <div><span>①② A/B 推齒</span><b>{aBit ?? '—'} 齒 / {bBit ?? '—'} 齒</b></div>
          <div><span>棘輪目前格位</span><b>第 {ratchetNotch} 格 ({ratchetNotch.toString(2).padStart(2, '0')}₂)</b></div>
          <div><span>④ 奇偶凸輪</span><b>{sumBit === null ? '待命' : `個位印 ${sumBit}`}</b></div>
          <div><span>⑤ 進位栓</span><b>{activePhase === 'STAMP_CARRY' ? '釋放印 1' : carryLatched ? 'LOCK 1' : `FREE ${carryIn}`}</b></div>
        </div>
      </section>
    </section>

    <section className="piano-module module"><div className="module-heading"><span>PIANO CONTROL</span><span>白鍵是機器功能</span></div><div className="piano-wrap"><div className="piano"><div className="keybed">{keyNames.map((name, index) => { const whiteIndex = whiteKeyIndices.indexOf(index); const key = whiteIndex >= 0 ? whiteKeyboardMap[whiteIndex] : ''; const action = key ? pianoActions[key] : undefined; const label = whiteIndex >= 0 ? whiteLabels[whiteIndex] : ''; const active = pressedKey === index; return <button key={`${name}-${index}`} className={`piano-key ${blackKeys.has(name) ? 'black' : 'white'} ${active ? 'active' : ''}`} title={`${label || 'melody'}${key ? ` · ${key}` : ''}`} aria-label={`${label || 'melody'}${key ? ` · ${key}` : ''}`} onClick={() => { setPressedKey(index); window.setTimeout(() => setPressedKey(null), 180); if (action) dispatch(action, index); else playTone(pianoFrequency(41 + index), .18, 'triangle') }}><span>{label || name}</span><small>{key}</small></button> })}</div></div></div><div className="piano-guide"><span><b>←</b> move</span><span><b>0 1 #</b> write</span><span><b>⏭</b> step</span><span><b>▶</b> play</span><span><b>⏹</b> stop</span></div></section>
    <p className="one-plus-one">1 + 1：<b>1</b> → <b>→</b> → <b>#</b> → <b>→</b> → <b>1</b> → <b>▶</b>（或連按 <b>⏭</b> 逐步分解）</p>

    <section className="run-module module"><div className="module-heading"><span>MECHANICAL READOUT</span><span>{machine.lastEvent?.message ?? '請用鋼琴輸入 1#1'}</span></div><div className="run-status"><strong>{machine.state}</strong><span>{machine.halted && machine.result ? `${rawTape} （${machine.result.binary}₂ = ${machine.result.decimal}₁₀ = ${machine.result.octal}₈）` : `Tape: ${rawTape || 'blank'}`}</span></div><label>速度 <b>{speed} steps / sec</b><input type="range" min="0.5" max="6" step="0.5" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label></section>

    <details className="advanced-module"><summary>ADVANCED：transition table / complete key map / mechanical details</summary><p>按下 ▶ 或 ⏭ 後依序執行：① 讀 A 推棘輪 → ② 讀 B 推棘輪並鎖進位栓 → ③ 敲響「當！」銅鈴並印 = → ④ 移至個位格印奇偶位 → ⑤ 往左退一格釋放進位栓印高位。</p></details>
    <footer><span>PIANO TURING MACHINE / 2026</span><span>STATE · TAPE · GEAR · SOUND</span><span>{machine.halted ? 'FINAL CHORD' : 'READY TO PLAY'}</span></footer>
  </main>
}

export default App
