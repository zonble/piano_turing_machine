import { useEffect, useMemo, useState } from 'react'
import { applyPianoAction, createInitialMachine, pianoActions, runStep, tapeText, type MachineSnapshot, type PianoAction } from './core/machine'
import { pianoFrequency, playTone } from './core/audio'
import './App.css'

const keyNames = ['F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E']
const blackKeys = new Set(['F♯', 'G♯', 'A♯', 'C♯', 'D♯'])
const whiteKeyIndices = keyNames.map((name, index) => blackKeys.has(name) ? -1 : index).filter((index) => index >= 0)
const whiteKeyboardMap = ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'a', 's', 'd', 'f', 'g']
const whiteLabels = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'HALT', '·', '·', '←', '→', '0', '1', '□', '#', '⏭', '▶', '⏹', '↺', '', '', '']
const stateNames: MachineSnapshot['state'][] = ['INPUT', 'SCAN', 'ADD', 'CARRY', 'WRITE', 'HALT']
const tapePositions = (head: number) => Array.from({ length: 13 }, (_, index) => head - 6 + index)

function App() {
  const [machine, setMachine] = useState<MachineSnapshot>(() => createInitialMachine())
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(4)
  const [pressedKey, setPressedKey] = useState<number | null>(null)
  const cells = useMemo(() => tapePositions(machine.head), [machine.head])

  const soundForAction = (action: PianoAction) => {
    const midi = action === 'moveLeft' ? 48 : action === 'moveRight' ? 60 : action === 'write1' ? 67 : action === 'play' ? 72 : 64
    playTone(pianoFrequency(midi), .18, action === 'play' ? 'sine' : 'triangle')
  }

  const dispatch = (action: PianoAction) => {
    soundForAction(action)
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
      dispatch(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const currentSymbol = machine.tape[machine.head] === 'separator' ? '#' : machine.tape[machine.head] ?? '□'
  const currentAction = machine.lastEvent?.action

  return <main className="app-shell">
    <header className="masthead"><div className="brand-mark">PTM<i /></div><div><p className="eyebrow">A MECHANICAL COMPUTING INSTRUMENT</p><h1>Piano <em>Turing</em> Machine</h1></div><div className={`machine-status ${running ? 'live' : ''}`}><span />{running ? 'PLAYING' : machine.halted ? 'HALT' : 'READY'}</div></header>

    <section className="machine-board">
      <section className="state-module module"><div className="module-heading"><span>STATE GEAR</span><span>CONTROL MEMORY</span></div><div className="state-wheel">{stateNames.map((state) => <div className={`state-slot ${machine.state === state ? 'current' : ''}`} key={state}><i />{state}</div>)}</div><p className="module-note">目前狀態由狀態輪保存，不寫入 Tape。</p></section>
      <section className="tape-module module"><div className="module-heading"><span>TAPE + HEAD</span><span>{currentSymbol} AT {machine.head >= 0 ? '+' : ''}{machine.head}</span></div><div className="tape-window"><div className="tape-cells">{cells.map((position) => <div className={`tape-cell ${position === machine.head ? 'selected' : ''}`} key={position}><span className="position">{position}</span><strong>{machine.tape[position] === 'separator' ? '#' : machine.tape[position] ?? '□'}</strong>{position === machine.head && <span className="needle">⌄</span>}</div>)}</div></div><div className="tape-readout"><span>RAW <b>{tapeText(machine.tape) || 'blank'}</b></span><span>HEAD <b>{machine.head}</b></span><span>STEP <b>{String(machine.step).padStart(3, '0')}</b></span></div></section>
      <section className="operation-module module"><div className="module-heading"><span>ARITHMETIC CARD</span><span>LOADED</span></div><div className="card-face"><div className="card-hole">+</div><div><strong>ADD</strong><small>從右到左逐位相加</small></div></div><div className="gear-explanation"><div><span>A bit</span><b>{machine.state === 'CARRY' ? '1' : '—'}</b></div><div><span>B bit</span><b>{machine.state === 'CARRY' ? '1' : '—'}</b></div><div><span>Carry</span><b>{machine.carry}</b></div><div><span>Next</span><b>{machine.state}</b></div></div><p className="module-note">加法輪讀取兩個 bit，寫回 sum，並用 carry 齒輪保存進位。</p></section>
    </section>

    <section className="piano-module module"><div className="module-heading"><span>PIANO CONTROL</span><span>白鍵是機器功能</span></div><div className="piano-wrap"><div className="piano"><div className="keybed">{keyNames.map((name, index) => { const whiteIndex = whiteKeyIndices.indexOf(index); const key = whiteIndex >= 0 ? whiteKeyboardMap[whiteIndex] : ''; const action = key ? pianoActions[key] : undefined; const label = whiteIndex >= 0 ? whiteLabels[whiteIndex] : ''; const active = pressedKey === index || action === currentAction; return <button key={`${name}-${index}`} className={`piano-key ${blackKeys.has(name) ? 'black' : 'white'} ${active ? 'active' : ''}`} title={`${label || 'melody'}${key ? ` · ${key}` : ''}`} aria-label={`${label || 'melody'}${key ? ` · ${key}` : ''}`} onClick={() => { setPressedKey(index); window.setTimeout(() => setPressedKey(null), 180); if (action) dispatch(action) }}><span>{label || name}</span><small>{key}</small></button> })}</div></div></div><div className="piano-guide"><span><b>←</b> move</span><span><b>0 1 #</b> write</span><span><b>⏭</b> step</span><span><b>▶</b> play</span><span><b>⏹</b> stop</span></div></section>
    <p className="one-plus-one">1 + 1：<b>1</b> → <b>→</b> → <b>#</b> → <b>→</b> → <b>1</b> → <b>▶</b></p>

    <section className="run-module module"><div className="module-heading"><span>MECHANICAL READOUT</span><span>{machine.lastEvent?.message ?? '請用鋼琴輸入 1#1'}</span></div><div className="run-status"><strong>{machine.state}</strong><span>{machine.halted && machine.result ? `${machine.result.binary}₂ = ${machine.result.decimal}₁₀ = ${machine.result.octal}₈` : `Tape: ${tapeText(machine.tape) || 'blank'}`}</span></div><label>速度 <b>{speed} steps / sec</b><input type="range" min="1" max="12" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label></section>

    <details className="advanced-module"><summary>ADVANCED：transition table / complete key map / mechanical details</summary><p>State、Tape、Head 和 Operation card 的狀態會在每個 transition 後同步更新。</p></details>
    <footer><span>PIANO TURING MACHINE / 2026</span><span>STATE · TAPE · GEAR · SOUND</span><span>{machine.halted ? 'FINAL CHORD' : 'READY TO PLAY'}</span></footer>
  </main>
}

export default App
