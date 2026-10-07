import { useCallback, useEffect, useMemo, useState } from 'react'
import { directionLabel, executeStep, inputTape, presets, resetMachine, symbolLabel, tapeInput, tapeNumber, tapeText, tapeValue, type MachineSnapshot, type Preset, type TapeSymbol } from './core/turing'
import { parseOperationInput, type OperationId } from './core/operations'
import { pianoFrequency, playTone } from './core/audio'
import './App.css'

const keyNames = ['F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E']
const blackKeys = new Set(['F♯', 'G♯', 'A♯', 'C♯', 'D♯'])
const whiteKeyIndices = keyNames.map((name, index) => blackKeys.has(name) ? -1 : index).filter((index) => index >= 0)
const whitePurposes = ['STATE 0', 'STATE 1', 'STATE 2', 'STATE 3', 'STATE 4', 'STATE 5', 'HALT', 'READ 0', 'READ 1', 'MOVE LEFT', 'MOVE RIGHT', 'WRITE 0', 'WRITE 1', 'BLANK', 'STEP', 'CARRY', 'COMPARE', 'STATE CHANGE', 'FINAL CHORD', 'RESERVED', 'RESERVED', 'RESERVED']
const whiteKeyboardMap = ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'a', 's', 'd', 'f', 'g']
const keyboardMap = keyNames.map((_, index) => whiteKeyboardMap[whiteKeyIndices.indexOf(index)] ?? '—')
const keyPurpose = (index: number) => { const whiteIndex = whiteKeyIndices.indexOf(index); return whiteIndex >= 0 ? whitePurposes[whiteIndex] : 'MELODY ONLY' }
const operationForPreset = (item: Preset): OperationId => item.operation ?? item.id as OperationId
const binaryOperation = (operation: OperationId) => operation === 'add' || operation === 'subtract' || operation === 'multiply' || operation === 'divide'
const operationLabel = (operation: OperationId) => ({ increment: '加一', shift: '左移', add: '加法', subtract: '減法', multiply: '乘法', divide: '除法', palindrome: '迴文檢查' }[operation])

const transitionPurposes = (rule: MachineSnapshot['lastTransition']) => {
  if (!rule) return []
  const purposes: string[] = []
  if (rule.read !== 'blank') purposes.push(`READ ${rule.read}`)
  purposes.push(rule.write === 'blank' ? 'BLANK' : `WRITE ${rule.write}`)
  if (rule.direction === 'L') purposes.push('MOVE LEFT')
  if (rule.direction === 'R') purposes.push('MOVE RIGHT')
  if (rule.to === 'halt') purposes.push('HALT')
  else { const stateNumber = rule.to.match(/\d+/)?.[0]; if (stateNumber) purposes.push(`STATE ${stateNumber}`) }
  return purposes
}

function App() {
  const [preset, setPreset] = useState<Preset>(presets[0])
  const [machine, setMachine] = useState<MachineSnapshot>(() => resetMachine(presets[0]))
  const [inputDraft, setInputDraft] = useState(() => tapeInput(presets[0].initialTape))
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(4)
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [pressedKey, setPressedKey] = useState<number | null>(null)
  const operation = operationForPreset(preset)
  const validation = parseOperationInput(operation, inputDraft)
  const operands = inputDraft.split('#')
  const activeRule = machine.lastTransition
  const activePurposes = running && !machine.halted ? transitionPurposes(activeRule) : []
  const cells = useMemo(() => Array.from({ length: 13 }, (_, index) => machine.head - 6 + index), [machine.head])

  const resetState = useCallback((next = preset) => {
    setRunning(false)
    setMachine((current) => ({ ...current, state: next.startState, step: 0, halted: false, lastTransition: undefined, program: undefined }))
  }, [preset])

  const step = useCallback(() => {
    setMachine((current) => {
      const next = executeStep(current, preset)
      const rule = next.lastTransition
      if (rule) {
        const midi = rule.direction === 'L' ? 48 : rule.direction === 'R' ? 60 : rule.write === '1' ? 67 : 64
        playTone(pianoFrequency(midi), .2, rule.to === 'halt' ? 'sine' : 'triangle')
      } else playTone(pianoFrequency(41), .5, 'sine')
      if (next.halted) setRunning(false)
      return next
    })
  }, [preset])

  const loadExample = useCallback(() => {
    setRunning(false)
    setMachine(resetMachine(preset))
    setInputDraft(tapeInput(preset.initialTape))
  }, [preset])

  const applyInput = (nextInput: string) => {
    setInputDraft(nextInput)
    setRunning(false)
    setMachine((current) => ({ ...current, tape: inputTape(nextInput), head: 0, state: preset.startState, step: 0, halted: false, lastTransition: undefined, program: undefined }))
  }

  const choosePreset = (next: Preset) => {
    setPreset(next)
    setRunning(false)
    setMachine((current) => ({ ...current, state: next.startState, step: 0, halted: false, lastTransition: undefined, program: undefined }))
  }

  const editCell = (position: number) => setMachine((current) => {
    const currentSymbol = current.tape[position] ?? 'blank'
    const nextSymbol: TapeSymbol = currentSymbol === 'blank' ? '0' : currentSymbol === '0' ? '1' : currentSymbol === '1' ? 'separator' : 'blank'
    const tape = { ...current.tape }
    if (nextSymbol === 'blank') delete tape[position]
    else tape[position] = nextSymbol
    setInputDraft(tapeInput(tape))
    return { ...current, tape, halted: false, program: undefined }
  })

  const activateKey = useCallback((index: number) => {
    setPressedKey(index)
    playTone(pianoFrequency(41 + index), .45)
    window.setTimeout(() => setPressedKey(null), 220)
    const action = keyPurpose(index)
    if (action === 'STEP') { step(); return }
    setMachine((current) => {
      const tape = { ...current.tape }
      if (action === 'MOVE LEFT') return { ...current, head: current.head - 1, step: current.step + 1 }
      if (action === 'MOVE RIGHT') return { ...current, head: current.head + 1, step: current.step + 1 }
      if (action === 'WRITE 0') { tape[current.head] = '0'; setInputDraft(tapeInput(tape)); return { ...current, tape, step: current.step + 1 } }
      if (action === 'WRITE 1') { tape[current.head] = '1'; setInputDraft(tapeInput(tape)); return { ...current, tape, step: current.step + 1 } }
      if (action === 'BLANK') { delete tape[current.head]; setInputDraft(tapeInput(tape)); return { ...current, tape, step: current.step + 1 } }
      return current
    })
  }, [step])

  const togglePlay = () => {
    if (!running && !validation.ok) return
    setRunning((value) => !value)
  }

  useEffect(() => {
    if (!running || machine.halted) return
    const timer = window.setInterval(step, 1000 / speed)
    return () => window.clearInterval(timer)
  }, [running, machine.halted, speed, step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const pianoIndex = keyboardMap.indexOf(event.key.toLowerCase())
      if (pianoIndex >= 0) { if (!event.repeat) activateKey(pianoIndex); return }
      if (event.code === 'Space') { event.preventDefault(); togglePlay() }
      if (event.shiftKey && event.key.toLowerCase() === 's') step()
      if (event.shiftKey && event.key.toLowerCase() === 'r') resetState()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activateKey, resetState, step, running, validation.ok])

  return <main className="app-shell">
    <header className="masthead"><div className="brand-mark"><span>PTM</span><i /></div><div><p className="eyebrow">A MUSICAL COMPUTATION INSTRUMENT</p><h1>Piano <em>Turing</em> Machine</h1></div><div className="machine-status"><span className={running ? 'status-dot live' : 'status-dot'} />{running ? 'COMPUTING' : machine.halted ? 'HALTED' : 'READY'}</div></header>
    <section className="workflow-guide"><div><b>1</b><strong>選一個範例</strong><span>先決定要做哪種運算</span></div><div><b>2</b><strong>確認輸入</strong><span>需要時修改 A、B 或 Tape</span></div><div><b>3</b><strong>開始運算</strong><span>按 PLAY 觀看結果</span></div></section>
    <div className="experience-layout"><div className="main-column">

      <section className="tape-panel panel-texture"><div className="section-label"><span>THE TAPE</span><span>點擊格子可編輯</span></div><div className="tape-window"><div className="tape-cells">{cells.map((position) => <button className={`tape-cell ${position === machine.head ? 'selected' : ''}`} key={position} onClick={() => editCell(position)}><span className="position">{position}</span><strong>{symbolLabel(machine.tape[position] ?? 'blank')}</strong>{position === machine.head && <span className="needle">⌄</span>}</button>)}</div></div><div className="tape-caption"><span>HEAD <b>{machine.head >= 0 ? '+' : ''}{machine.head}</b></span><span>SYMBOL <b>{symbolLabel(machine.tape[machine.head] ?? 'blank')}</b></span><span>VALUE <b>{tapeNumber(machine.tape).toString(8)}<small>₈</small></b><small className="value-breakdown">{tapeText(machine.tape)} · {tapeValue(machine.tape)}₂ · {tapeNumber(machine.tape)}₁₀</small></span></div></section>
      <section className="instrument-panel"><section className="piano-panel"><div className="section-label"><span>THE INSTRUMENT</span><span>F2 — F5 · 37 KEYS</span></div><div className="piano-wrap"><div className="piano"><div className="keybed">{keyNames.map((name, index) => { const active = pressedKey === index || activePurposes.includes(keyPurpose(index)); return <button key={`${name}-${index}`} title={`${name} — ${keyPurpose(index)} — keyboard ${keyboardMap[index]}`} aria-label={`${name} — ${keyPurpose(index)} — keyboard ${keyboardMap[index]}`} className={`piano-key ${blackKeys.has(name) ? 'black' : 'white'} ${active ? 'active' : ''}`} onClick={() => activateKey(index)}><span>{index % 12 === 0 ? name + Math.floor(index / 12 + 2) : name}</span></button> })}</div></div><div className="hand-labels"><span>LEFT HAND · STATE / STRUCTURE</span><span>RIGHT HAND · TAPE / MOTION</span></div></div></section></section><details className="advanced-panel"><summary>進階：按鍵對應與 transition table</summary><details className="key-map"><summary>KEY MAP — 每個按鍵的計算用途</summary><div className="key-map-grid">{keyNames.map((name, index) => <span key={`map-${name}-${index}`}><b>{keyboardMap[index]}</b>{name} · {keyPurpose(index)}</span>)}</div></details><div className="table-wrap"><table><thead><tr><th>FROM</th><th>READ</th><th>WRITE</th><th>MOVE</th><th>TO</th></tr></thead><tbody>{preset.transitions.map((rule, index) => <tr className={activeRule === rule ? 'fired' : ''} key={`${rule.from}-${rule.read}-${index}`}><td>{rule.from}</td><td>{symbolLabel(rule.read)}</td><td>{symbolLabel(rule.write)}</td><td>{directionLabel(rule.direction)}</td><td>{rule.to}</td></tr>)}</tbody></table></div></details>
      <section className="run-card"><div className="section-label"><span>STEP 3 / RUN</span><span>{running ? 'COMPUTING' : machine.halted ? 'DONE' : 'READY'}</span></div><div className="run-grid"><div className="transport"><button className="play-button" onClick={togglePlay}>{running ? 'Ⅱ' : '▶'}</button><button onClick={step}>STEP</button><button onClick={() => resetState()}>RESET</button></div><div className="run-readout"><span>{!validation.ok ? validation.error.message : machine.halted ? `完成：${tapeValue(machine.tape)}₂ = ${tapeNumber(machine.tape)}₁₀` : activeRule ? `目前規則：${activeRule.from} 讀取 ${symbolLabel(activeRule.read)}，${directionLabel(activeRule.direction)} 移動` : '確認範例後，按 PLAY 開始。'}</span><strong>STEP {String(machine.step).padStart(3, '0')}</strong></div></div><label className="range-label">速度 <strong>{speed} steps / sec</strong><input type="range" min="1" max="12" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label><div className="mode-toggle"><button className={mode === 'auto' ? 'selected' : ''} onClick={() => setMode('auto')}>AUTO COMPUTE</button><button className={mode === 'manual' ? 'selected' : ''} onClick={() => setMode('manual')}>EXPLORE</button></div></section>
      <section className="result-card"><div className="section-label"><span>RESULT</span><span>{machine.halted ? 'COMPUTED' : 'WAITING'}</span></div><p>{machine.halted ? `Tape result: ${tapeValue(machine.tape)}₂ = ${tapeNumber(machine.tape)}₁₀ = ${tapeNumber(machine.tape).toString(8)}₈` : '運算完成後，結果會出現在這裡。'}</p><div><button onClick={() => { resetState(); setRunning(true) }}>RUN AGAIN</button><button onClick={() => document.querySelector('.tape-panel')?.scrollIntoView({ behavior: 'smooth' })}>EDIT TAPE</button></div></section>
    </div><aside className="sample-rail"><div className="section-label"><span>STEP 1 / EXAMPLES</span><span>先選一個</span></div><p className="sample-intro">不知道怎麼開始？選一個範例，系統會把你帶到下一步。</p><div className="sample-list">{presets.map((item, index) => <button className={`sample-item ${item.id === preset.id ? 'selected' : ''}`} key={item.id} onClick={() => choosePreset(item)}><span className="preset-number">0{index + 1}</span><span><strong>{item.name}</strong><small>{item.description}</small></span><span className="arrow">→</span></button>)}</div>      <section className="operation-card panel-texture"><div className="section-label"><span>STEP 2 / CONFIRM INPUT</span><span>{operationLabel(operation)} · {operation}</span></div><h2>{preset.name}</h2><p className="operation-description">{preset.description}</p><div className="operation-fields">{operands.slice(0, binaryOperation(operation) ? 2 : 1).map((value, index) => <label key={index}>{binaryOperation(operation) ? index === 0 ? 'A' : 'B' : 'VALUE'}<input value={value} aria-label={binaryOperation(operation) ? index === 0 ? '參數 A' : '參數 B' : '運算參數'} onChange={(event) => { const next = [...operands]; next[index] = event.target.value; applyInput(next.slice(0, binaryOperation(operation) ? 2 : 1).join(binaryOperation(operation) ? '#' : '')) }} /></label>)}</div><div className="operation-preview"><span>這次會計算</span><strong>{validation.ok ? validation.input : inputDraft || '—'}</strong>{!validation.ok && <em>{validation.error.message}</em>}</div><div className="operation-actions"><button onClick={loadExample}>LOAD EXAMPLE</button><button onClick={() => resetState()}>RESET STATE</button><button className="primary-action" onClick={togglePlay}>{running ? 'PAUSE' : 'PLAY'}</button></div></section>\n    </aside></div>
    <footer><span>PIANO TURING MACHINE / 2026</span><span>{preset.musicalNote}</span><span>AN INSTRUMENT FOR THINKING</span></footer>
  </main>
}

export default App
