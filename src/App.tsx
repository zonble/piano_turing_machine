import { useEffect, useMemo, useState } from 'react'
import { applyPianoAction, createInitialMachine, pianoActions, runStep, tapeText, type MachineSnapshot, type PianoAction } from './core/machine'
import { pianoFrequency, playTone } from './core/audio'
import './App.css'

const keyNames = ['F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E']
const blackKeys = new Set(['F♯', 'G♯', 'A♯', 'C♯', 'D♯'])
const whiteKeyIndices = keyNames.map((name, index) => blackKeys.has(name) ? -1 : index).filter((index) => index >= 0)
const whiteKeyboardMap = ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'a', 's', 'd', 'f', 'g']
const whiteLabels = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'HALT', '·', '·', '←', '→', '0', '1', '□', '#', '⏭', '▶', '⏹', '↺', '', '', '']
const stateNames = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'HALT'] as const
const stateRegister = (state: MachineSnapshot['state']) => state === 'HALT' ? 'HALT' : state === 'INPUT' ? 'q0' : state === 'SCAN' ? 'q1' : state === 'ADD' ? 'q2' : state === 'CARRY' ? 'q3' : state === 'WRITE' ? 'q4' : state
const tapePositions = (head: number) => Array.from({ length: 19 }, (_, index) => head - 9 + index)

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
    if (keyIndex === undefined) soundForAction(action)
    else playTone(pianoFrequency(41 + keyIndex), .18, 'triangle')
    const next = applyPianoAction(machine, action)
    setMachine(next)
    if (action === 'play' && next.state === 'SCAN') setRunning(true)
    if (action === 'stop' || action === 'reset' || next.halted) setRunning(false)
  }

  useEffect(() => {
    if (!running || machine.halted) return
    const timer = window.setInterval(() => {
      setMachine((current) => {
        const next = runStep(current)
        if (next.halted) setRunning(false)
        if (next.lastEvent) playTone(pianoFrequency(next.state === 'CARRY' ? 48 : next.state === 'HALT' ? 72 : 60), .18, next.state === 'HALT' ? 'sine' : 'triangle')
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
  const [rawLeft = '', rawRight = ''] = rawTape.split('#')
  const previewA = rawLeft.endsWith('1') ? 1 : rawLeft.endsWith('0') ? 0 : null
  const previewB = rawTape.includes('#') ? (rawRight.endsWith('1') ? 1 : rawRight.endsWith('0') ? 0 : null) : null

  const activeGear = machine.gear
  const aBit = activeGear ? activeGear.aBit : machine.state === 'SCAN' && machine.program ? machine.program.gear.aBit : previewA
  const bBit = activeGear ? activeGear.bBit : machine.state === 'SCAN' ? null : previewB
  const carryIn = activeGear ? activeGear.carryIn : machine.carry
  const previewNotch = ((previewA ?? 0) + (previewB ?? 0) + carryIn) as 0 | 1 | 2 | 3
  const ratchetNotch = activeGear
    ? activeGear.ratchetTotal
    : machine.state === 'SCAN' && machine.program
      ? machine.program.gear.aBit
      : previewNotch
  const sumBit = activeGear ? activeGear.sumBit : (previewA !== null && previewB !== null ? (previewNotch % 2) as 0 | 1 : null)
  const carryLatched = activeGear ? activeGear.carryOut === 1 : machine.carry === 1 || previewNotch >= 2

  const currentSymbol = machine.tape[machine.head] === 'separator' ? '#' : machine.tape[machine.head] ?? '□'
  const gearWorking = running || ['SCAN', 'ADD', 'CARRY', 'WRITE'].includes(machine.state)
  const gearPhase = machine.state === 'SCAN' ? 'SCAN' : machine.state === 'ADD' ? 'RATCHET' : machine.state === 'CARRY' ? 'LATCH' : machine.state === 'WRITE' ? 'STAMP' : machine.state === 'HALT' ? 'HALT' : 'READY'
  const gearEquation = activeGear
    ? `${activeGear.aBit} + ${activeGear.bBit} + ${activeGear.carryIn} → 第 ${activeGear.ratchetTotal} 格 (${activeGear.ratchetTotal.toString(2).padStart(2, '0')}₂)`
    : `${aBit ?? '—'} + ${bBit ?? '—'} + ${carryIn} → 第 ${ratchetNotch} 格 (${ratchetNotch.toString(2).padStart(2, '0')}₂)`

  return <main className="app-shell">
    <header className="masthead"><div className="brand-mark">PTM<i /></div><div><p className="eyebrow">A MECHANICAL COMPUTING INSTRUMENT</p><h1>Piano <em>Turing</em> Machine</h1></div><div className={`machine-status ${running ? 'live' : ''}`}><span />{running ? 'PLAYING' : machine.halted ? 'HALT' : 'READY'}</div></header>

    <section className="machine-board">
      <section className="state-module module"><div className="module-heading"><span>STATE GEAR</span><span>CONTROL MEMORY</span></div><div className="state-wheel">{stateNames.map((state) => <div className={`state-slot ${stateRegister(machine.state) === state ? 'current' : ''}`} key={state}><i />{state}</div>)}</div><p className="module-note">目前狀態由狀態輪保存，不寫入 Tape。</p></section>
      <section className={`tape-module module ${machine.state === 'SCAN' ? 'scanning' : ''}`}>
        <div className="module-heading"><span>TAPE + HEAD</span><span>{currentSymbol} AT {machine.head >= 0 ? '+' : ''}{machine.head}</span></div>
        <div className="tape-window">
          <div className="playhead-frame" aria-hidden="true" />
          <div
            className="tape-cells"
            style={{ '--head': machine.head } as React.CSSProperties}
          >
            {cells.map((position) => {
              const symbol = machine.tape[position] === 'separator' ? '#' : machine.tape[position] ?? '□'
              const isSelected = position === machine.head
              return (
                <div
                  className={`tape-cell ${isSelected ? 'selected' : ''} ${machine.tape[position] ? 'punched' : ''}`}
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
        <div className="tape-readout"><span>RAW <b>{rawTape || 'blank'}</b></span><span>HEAD <b>{machine.head}</b></span><span>STEP <b>{String(machine.step).padStart(3, '0')}</b></span></div>
      </section>
      <section className={`operation-module module ${gearWorking ? 'working' : ''} phase-${gearPhase.toLowerCase()}`}>
        <div className="module-heading"><span>ARITHMETIC GEAR (4-NOTCH RATCHET)</span><span>{gearPhase}</span></div>
        <div className="ratchet-bench" aria-label="1900s 4-notch mechanical adder mechanism">
          <div className="pawl-stack">
            <div className={`input-pawl ${aBit === 1 ? 'engaged' : ''}`} aria-label="A input pawl">
              <span className="pawl-tag">A 棘爪</span>
              <strong>{aBit === null ? '—' : aBit === 1 ? '+1 齒' : '+0'}</strong>
            </div>
            <div className={`input-pawl ${bBit === 1 ? 'engaged' : ''}`} aria-label="B input pawl">
              <span className="pawl-tag">B 棘爪</span>
              <strong>{bBit === null ? '—' : bBit === 1 ? '+1 齒' : '+0'}</strong>
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

          <div className={`carry-latch ${carryLatched ? 'latched' : ''}`} aria-label="Carry latch pin">
            <span className="latch-title">進位栓</span>
            <div className="latch-track"><div className="latch-bolt" /></div>
            <strong>{carryLatched ? 'LOCK 1' : 'FREE 0'}</strong>
          </div>
        </div>

        <div className="gear-equation">
          <strong>{gearEquation}</strong>
          <span>
            {activeGear
              ? `棘輪停在第 ${ratchetNotch} 格（${ratchetNotch % 2 === 1 ? '奇數凸齒 → 寫入 1' : '偶數凹槽 → 寫入 0'}；${ratchetNotch >= 2 ? '≥2 頂出進位栓 → Carry 1' : '<2 進位栓不動作 → Carry 0'}）`
              : '輸入 A#B 後按 ▶，棘爪將依位元把中央 4 格棘輪推轉 +0～+3 格'}
          </span>
        </div>
        <div className="gear-explanation">
          <div><span>A / B 推進齒數</span><b>{aBit ?? '—'} 齒 + {bBit ?? '—'} 齒</b></div>
          <div><span>棘輪目前格位</span><b>第 {ratchetNotch} 格 ({ratchetNotch.toString(2).padStart(2, '0')}₂)</b></div>
          <div><span>奇偶凸輪 (Sum)</span><b>{sumBit === null ? '待寫入' : `寫入 ${sumBit}`}</b></div>
          <div><span>進位栓 (Carry)</span><b>{carryLatched ? '1 (頂出鎖定)' : '0 (釋放)'}</b></div>
        </div>
      </section>
    </section>

    <section className="piano-module module"><div className="module-heading"><span>PIANO CONTROL</span><span>白鍵是機器功能</span></div><div className="piano-wrap"><div className="piano"><div className="keybed">{keyNames.map((name, index) => { const whiteIndex = whiteKeyIndices.indexOf(index); const key = whiteIndex >= 0 ? whiteKeyboardMap[whiteIndex] : ''; const action = key ? pianoActions[key] : undefined; const label = whiteIndex >= 0 ? whiteLabels[whiteIndex] : ''; const active = pressedKey === index; return <button key={`${name}-${index}`} className={`piano-key ${blackKeys.has(name) ? 'black' : 'white'} ${active ? 'active' : ''}`} title={`${label || 'melody'}${key ? ` · ${key}` : ''}`} aria-label={`${label || 'melody'}${key ? ` · ${key}` : ''}`} onClick={() => { setPressedKey(index); window.setTimeout(() => setPressedKey(null), 180); if (action) dispatch(action, index); else playTone(pianoFrequency(41 + index), .18, 'triangle') }}><span>{label || name}</span><small>{key}</small></button> })}</div></div></div><div className="piano-guide"><span><b>←</b> move</span><span><b>0 1 #</b> write</span><span><b>⏭</b> step</span><span><b>▶</b> play</span><span><b>⏹</b> stop</span></div></section>
    <p className="one-plus-one">1 + 1：<b>1</b> → <b>→</b> → <b>#</b> → <b>→</b> → <b>1</b> → <b>▶</b></p>

    <section className="run-module module"><div className="module-heading"><span>MECHANICAL READOUT</span><span>{machine.lastEvent?.message ?? '請用鋼琴輸入 1#1'}</span></div><div className="run-status"><strong>{machine.state}</strong><span>{machine.halted && machine.result ? `${machine.result.binary}₂ = ${machine.result.decimal}₁₀ = ${machine.result.octal}₈` : `Tape: ${rawTape || 'blank'}`}</span></div><label>速度 <b>{speed} steps / sec</b><input type="range" min="0.5" max="6" step="0.5" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label></section>

    <details className="advanced-module"><summary>ADVANCED：transition table / complete key map / mechanical details</summary><p>State、Tape、Head 和 4 格加法棘輪（0 · 1 · 2 · 3）會在每個 transition 後同步更新。</p></details>
    <footer><span>PIANO TURING MACHINE / 2026</span><span>STATE · TAPE · GEAR · SOUND</span><span>{machine.halted ? 'FINAL CHORD' : 'READY TO PLAY'}</span></footer>
  </main>
}

export default App
