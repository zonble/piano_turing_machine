import { useEffect, useMemo, useState } from 'react'
import {
  applyPianoAction,
  createInitialMachine,
  decimalTapeText,
  formatBitPosition,
  formatTapeSymbol,
  GEAR_MODES,
  GEAR_SPECS,
  octalTapeText,
  pianoActions,
  runStep,
  selectGear,
  tapeText,
  type GearMode,
  type MachineSnapshot,
  type MechanicalPhase,
  type PianoAction,
} from './core/machine'
import { pianoFrequency, playFinalChord, playPunchStamp, playRatchetClick, playTone, playTurretClunk } from './core/audio'
import './App.css'

const octaveKeys: Array<{
  midi: number
  note: string
  isBlack: boolean
  shortcut: string
  action: PianoAction
  symbol: string
  sublabel: string
}> = [
  { midi: 60, note: 'C4', isBlack: false, shortcut: 'a', action: 'moveLeft', symbol: '←', sublabel: 'Do · A' },
  { midi: 61, note: 'C♯4', isBlack: true, shortcut: 'w', action: 'step', symbol: '⏭', sublabel: 'step · W' },
  { midi: 62, note: 'D4', isBlack: false, shortcut: 's', action: 'moveRight', symbol: '→', sublabel: 'Re · S' },
  { midi: 63, note: 'D♯4', isBlack: true, shortcut: 'e', action: 'reset', symbol: '↺', sublabel: 'reset · E' },
  { midi: 64, note: 'E4', isBlack: false, shortcut: 'd', action: 'write1', symbol: '1', sublabel: 'Mi · D' },
  { midi: 65, note: 'F4', isBlack: false, shortcut: 'f', action: 'write0', symbol: '0', sublabel: 'Fa · F' },
  { midi: 66, note: 'F♯4', isBlack: true, shortcut: 't', action: 'play', symbol: '▶', sublabel: 'play · T' },
  { midi: 67, note: 'G4', isBlack: false, shortcut: 'g', action: 'blank', symbol: '□', sublabel: 'So · G' },
  { midi: 68, note: 'G♯4', isBlack: true, shortcut: 'y', action: 'stop', symbol: '⏸', sublabel: 'pause · Y' },
  { midi: 69, note: 'A4', isBlack: false, shortcut: 'h', action: 'writeSeparator', symbol: '#', sublabel: 'La · H' },
  { midi: 70, note: 'A♯4', isBlack: true, shortcut: 'u', action: 'prevGear', symbol: '◀⚙', sublabel: 'turret · U' },
  { midi: 71, note: 'B4', isBlack: false, shortcut: 'j', action: 'nextGear', symbol: '⚙▶', sublabel: 'Si · J' },
]

const stateNames = ['q0', 'q1', 'q2', 'q3', 'q4', 'HALT'] as const
const stateSlotTitles: Record<(typeof stateNames)[number], string> = {
  q0: 'q0 IDLE',
  q1: 'q1 READ A',
  q2: 'q2 READ B',
  q3: 'q3 STAMP',
  q4: 'q4 CARRY',
  HALT: 'HLT DONE',
}
const stateRegister = (snapshot: MachineSnapshot): (typeof stateNames)[number] => {
  const phase = snapshot.gear?.phase
  if (phase === 'READ_A') return 'q1'
  if (phase === 'READ_B') return 'q2'
  if (phase === 'STAMP_SUM') return snapshot.halted ? 'HALT' : 'q3'
  if (phase === 'STAMP_CARRY') return 'q4'
  if (snapshot.state === 'HALT') return 'HALT'
  if (snapshot.state === 'INPUT') return 'q0'
  if (snapshot.state === 'SCAN') return 'q1'
  if (snapshot.state === 'ADD') return 'q2'
  if (snapshot.state === 'WRITE') return 'q3'
  return 'q0'
}
const tapePositions = (head: number) => Array.from({ length: 19 }, (_, index) => head - 9 + index)

function getMechanicalStages(mode: GearMode): Array<{ id: MechanicalPhase; step: string; code: string; title: string; detail: string }> {
  const spec = GEAR_SPECS[mode]
  if (spec.isUnary) {
    return [
      { id: 'READ_A', step: '①', code: 'q1', title: 'Read A & Push', detail: 'Feeler pin probes A → drives ratchet' },
      { id: 'READ_B', step: '②', code: 'q2', title: 'Unary (Skip B)', detail: 'Single-operand gear → no B needed' },
      { id: 'STAMP_SUM', step: '③', code: 'q3', title: 'Cam Stamps Bit', detail: `${spec.camLabel} → punches bit` },
      { id: 'STAMP_CARRY', step: '④', code: 'q4', title: 'Step Left & Latch', detail: 'Shift left → release MSB carry/shift' },
    ]
  }
  if (mode === 'subtract') {
    return [
      { id: 'READ_A', step: '①', code: 'q1', title: 'Read A (+Push)', detail: 'Driving pawl advances +A tooth' },
      { id: 'READ_B', step: '②', code: 'q2', title: 'Read B (−Pull)', detail: 'Reverse pawl pulls −B → borrow latch' },
      { id: 'STAMP_SUM', step: '③', code: 'q3', title: 'Diff Cam Stamps', detail: 'Odd/even cam → punches diff bit' },
      { id: 'STAMP_CARRY', step: '④', code: 'q4', title: 'Propagate Borrow', detail: 'Shift left → apply borrow to next bit' },
    ]
  }
  if (mode === 'multiply') {
    return [
      { id: 'READ_A', step: '①', code: 'q1', title: 'Probe Multiplicand A', detail: 'Aligns shifted A with current place' },
      { id: 'READ_B', step: '②', code: 'q2', title: 'Read B & Clutch', detail: 'If B=1, clutch adds shifted A' },
      { id: 'STAMP_SUM', step: '③', code: 'q3', title: 'Product Cam Stamps', detail: 'Punches product bit, holds upper sum' },
      { id: 'STAMP_CARRY', step: '④', code: 'q4', title: 'Release Upper Sum', detail: 'Shift left → punches final MSB' },
    ]
  }
  if (mode === 'and' || mode === 'or' || mode === 'xor') {
    return [
      { id: 'READ_A', step: '①', code: 'q1', title: 'Read A & Push', detail: 'Driving pawl pushes +A tooth' },
      { id: 'READ_B', step: '②', code: 'q2', title: 'Read B & Push', detail: 'Same pawl pushes +B (0..2 teeth)' },
      { id: 'STAMP_SUM', step: '③', code: 'q3', title: `${spec.shortName} Cam Stamps`, detail: `${spec.camLabel} → punches bit` },
      { id: 'STAMP_CARRY', step: '④', code: 'q4', title: 'No Carry (Unhooked)', detail: 'Bitwise logic has no carry between bits' },
    ]
  }
  return [
    { id: 'READ_A', step: '①', code: 'q1', title: 'Read A & Push', detail: 'Driving pawl strokes → locking pawl holds' },
    { id: 'READ_B', step: '②', code: 'q2', title: 'Read B & Add', detail: 'Same pawl strokes → sets carry latch' },
    { id: 'STAMP_SUM', step: '③', code: 'q3', title: 'Cam Stamps Bit', detail: 'Odd/even cam → punches current bit' },
    { id: 'STAMP_CARRY', step: '④', code: 'q4', title: 'Step Left & Carry', detail: 'Shift left → release carry latch' },
  ]
}

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
    const tip = polarPoint(start, outerR)
    const gullet = polarPoint(start + step * 0.1, innerR)
    const nextTip = polarPoint(next, outerR)
    commands.push(`${i === 0 ? 'M' : 'L'} ${tip} L ${gullet} L ${nextTip}`)
  }
  return `${commands.join(' ')} Z`
}

const spurGearPath = buildSpurGearPath(14, 55, 45)
const ratchetWheelPath = buildRatchetWheelPath(12, 56, 42)
const turretPlatePath = buildSpurGearPath(27, 57, 52)
const miniGearPath = buildSpurGearPath(8, 17, 13)

const actionToKeyIndex = Object.fromEntries(
  octaveKeys.map((k, idx) => [k.action, idx]),
) as Record<PianoAction, number>

function keyIndexForStep(snapshot: MachineSnapshot): number {
  const sym = snapshot.tape[snapshot.head]
  if (sym === '1') return 4 // Mi (1)
  if (sym === '0') return 5 // Fa (0)
  if (sym === 'separator') return 9 // La (#)
  if (sym === 'equals') return 11 // Si
  return 0
}

function playPhaseSound(snapshot: MachineSnapshot) {
  const phase = snapshot.gear?.phase
  if (phase === 'READ_A' || phase === 'READ_B') {
    playRatchetClick(snapshot.gear?.ratchetTotal ?? 1)
    return
  }
  if (phase === 'STAMP_SUM' || phase === 'STAMP_CARRY') {
    playPunchStamp()
    if (snapshot.halted) playFinalChord()
  }
}

function shortestStepDelta(fromIdx: number, toIdx: number, count: number): number {
  let diff = (toIdx - fromIdx) % count
  if (diff > count / 2) diff -= count
  if (diff < -count / 2) diff += count
  return diff
}

const HELP_SEEN_STORAGE_KEY = 'piano_turing_machine_help_seen_v1'

function App() {
  const [machine, setMachine] = useState<MachineSnapshot>(() => createInitialMachine())
  const [running, setRunning] = useState(false)
  const [pressedKey, setPressedKey] = useState<number | null>(null)
  const [turretSteps, setTurretSteps] = useState(0)
  const [helpOpen, setHelpOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(HELP_SEEN_STORAGE_KEY) !== '1'
    } catch {
      return true
    }
  })
  const cells = useMemo(() => tapePositions(machine.head), [machine.head])

  const closeHelp = () => {
    try {
      window.localStorage.setItem(HELP_SEEN_STORAGE_KEY, '1')
    } catch {
      // ignore storage errors
    }
    setHelpOpen(false)
  }

  const dispatch = (action: PianoAction, keyIndex?: number) => {
    const resolvedKeyIndex = keyIndex ?? actionToKeyIndex[action]
    const next = applyPianoAction(machine, action)
    setMachine(next)
    playTone(pianoFrequency(octaveKeys[resolvedKeyIndex].midi))
    if (action === 'prevGear') {
      setTurretSteps((s) => s - 1)
      playTurretClunk()
    } else if (action === 'nextGear') {
      setTurretSteps((s) => s + 1)
      playTurretClunk()
    }
    if ((action === 'play' || action === 'step') && next.gear?.phase) {
      playPhaseSound(next)
    }
    if (keyIndex === undefined) {
      setPressedKey(resolvedKeyIndex)
      window.setTimeout(() => setPressedKey(null), 180)
    }
    if (action === 'play' && !next.halted && next.program) setRunning(true)
    if (action === 'step' || action === 'stop' || action === 'reset' || action === 'prevGear' || action === 'nextGear' || next.halted) {
      setRunning(false)
    }
  }

  const handleSelectGear = (mode: GearMode) => {
    const currentIdx = GEAR_MODES.indexOf(machine.operation)
    const targetIdx = GEAR_MODES.indexOf(mode)
    if (currentIdx === targetIdx) return
    const delta = shortestStepDelta(currentIdx, targetIdx, GEAR_MODES.length)
    setTurretSteps((s) => s + delta)
    setRunning(false)
    setMachine((current) => selectGear(current, mode))
    playTurretClunk()
  }

  useEffect(() => {
    if (!running || machine.halted) return
    const timer = window.setInterval(() => {
      setMachine((current) => {
        const next = runStep(current)
        if (next.halted) setRunning(false)
        if (next.gear?.phase) {
          const stepKeyIdx = keyIndexForStep(next)
          setPressedKey(stepKeyIdx)
          window.setTimeout(() => setPressedKey(null), 180)
          playTone(pianoFrequency(octaveKeys[stepKeyIdx].midi))
          playPhaseSound(next)
        }
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, machine.halted])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape' && helpOpen) {
        event.preventDefault()
        closeHelp()
        return
      }
      if (event.key === '?') {
        event.preventDefault()
        if (helpOpen) {
          closeHelp()
        } else {
          setHelpOpen(true)
        }
        return
      }
      if (helpOpen) return
      const pressed = event.key.toLowerCase()
      const keyIndex = octaveKeys.findIndex((k) => k.shortcut === pressed)
      const action = pianoActions[pressed]
      if (!action && keyIndex < 0) return
      event.preventDefault()
      if (keyIndex >= 0) {
        setPressedKey(keyIndex)
        window.setTimeout(() => setPressedKey(null), 180)
      }
      if (action) {
        dispatch(action, keyIndex >= 0 ? keyIndex : undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const activeSpec = GEAR_SPECS[machine.operation]
  const mechanicalStages = useMemo(() => getMechanicalStages(machine.operation), [machine.operation])
  const rawTape = tapeText(machine.tape)
  const decimalTape = decimalTapeText(rawTape)
  const octalTape = octalTapeText(rawTape)
  const activeGear = machine.gear
  const activePhase = activeGear?.phase
  const activePhaseIndex = activePhase ? mechanicalStages.findIndex((s) => s.id === activePhase) : -1

  // During INPUT, ratchet stays at 0 until ▶ / ⏭ starts decomposition
  const isProbing = activePhase === 'READ_A' || activePhase === 'READ_B'
  const pawlStroke = isProbing ? (activeGear?.pawlStroke ?? 0) : 0
  const ratchetNotch = (activeGear ? activeGear.ratchetTotal : 0) as 0 | 1 | 2 | 3
  const camHigh = activeGear ? activeGear.sumBit === 1 : activeSpec.camLobes.includes(0)
  const carryLatched = activeGear ? activeGear.carryOut === 1 : false
  const hammerPunching = Boolean(activeGear?.punching)

  const currentBitLabel = activeGear?.bitIndex !== undefined ? formatBitPosition(activeGear.bitIndex) : null
  const currentSymbol = formatTapeSymbol(machine.tape[machine.head])
  const gearWorking = running || ['SCAN', 'ADD', 'WRITE'].includes(machine.state)
  const gearPhaseLabel = currentBitLabel && activePhase
    ? `${currentBitLabel} · ${activePhase}`
    : activePhase ?? (machine.state === 'HALT' ? 'HALT' : `${activeSpec.title}`)
  const gearSummary = machine.error
    ? `⚠ ${machine.error}`
    : activeGear && machine.lastEvent?.message
      ? machine.lastEvent.message
      : activeSpec.idleNote

  const currentStateSlot = stateRegister(machine)
  const stateIndex = Math.max(0, stateNames.indexOf(currentStateSlot))
  const stateStepDeg = 360 / stateNames.length
  const turretStepDeg = 360 / GEAR_MODES.length
  const turretRotationDeg = -turretSteps * turretStepDeg

  const currentCellSymbol = machine.tape[machine.head]
  const probeDropThrough = isProbing && currentCellSymbol === '1'
  const probeBlocked = isProbing && currentCellSymbol === '0'
  const isSeparatorCell = currentCellSymbol === 'separator'
  const isEqualsCell = currentCellSymbol === 'equals'
  const probeStatusText = activePhase === 'READ_A' && currentBitLabel
    ? `READ A ${currentBitLabel} · ${probeDropThrough ? '● HOLE (1) → +1 TOOTH' : '○ SOLID (0) → +0 TOOTH'}`
    : activePhase === 'READ_B' && currentBitLabel
      ? `READ B ${currentBitLabel} · ${isSeparatorCell ? 'NO BIT → +0 TOOTH' : probeDropThrough ? `● HOLE (1) → ${machine.operation === 'subtract' ? '−1 TOOTH' : '+1 TOOTH'}` : '○ SOLID (0) → +0 TOOTH'}`
      : isEqualsCell
        ? 'DOUBLE SLOT (=) · SEPARATES INPUT & RESULT'
        : isSeparatorCell
          ? '⊞ TWIN HOLES (#) · SEPARATES OPERANDS'
          : hammerPunching && currentBitLabel
            ? `🔨 PUNCHING ${currentBitLabel} (${currentSymbol} AT ${machine.head >= 0 ? '+' : ''}${machine.head})`
            : hammerPunching
              ? `🔨 PUNCHING (${currentSymbol} AT ${machine.head >= 0 ? '+' : ''}${machine.head})`
              : probeDropThrough
                ? '● OPEN HOLE (1) · AIR IN (+1 TOOTH)'
                : probeBlocked || currentCellSymbol === '0'
                  ? '○ SOLID PAPER (0) · PIN BLOCKED (+0)'
                  : `${currentSymbol} AT ${machine.head >= 0 ? '+' : ''}${machine.head} · TRACKER BAR`

  const pawlStrokeLabel = isProbing
    ? pawlStroke === -1
      ? '−1 TOOTH'
      : pawlStroke === 1
        ? '+1 TOOTH'
        : '+0 TOOTH'
    : 'IDLE'

  return <main className="app-shell">
    <header className="masthead">
      <div>
        <h1>
          Piano <em>Turing</em> Machine
          <span className="masthead-sub"> — What if player pianos had bidirectional tapes?</span>
        </h1>
      </div>
      <button
        type="button"
        className="help-trigger"
        aria-label="Open operator manual"
        title="Operator Manual (?)"
        onClick={() => setHelpOpen(true)}
      >
        ?
      </button>
    </header>

    <section className="stage-strip" aria-label="4-step mechanical decomposition">
      {mechanicalStages.map((stage, index) => {
        const isCurrent = activePhase === stage.id
        const isDone = activePhaseIndex > index || (machine.halted && index <= activePhaseIndex)
        return (
          <div
            key={stage.id}
            className={`stage-pill ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
          >
            <div className="stage-header">
              <span className="stage-num">{stage.step} {stage.code}</span>
              <strong>{stage.title}</strong>
            </div>
            <small>{stage.detail}</small>
          </div>
        )
      })}
    </section>

    <section className="machine-board">
      <section className={`tape-module module ${isProbing ? 'probing' : ''}`}>
        <div className="module-heading"><span>TAPE + TRACKER BAR ({activeSpec.formula})</span><span>{probeStatusText}</span></div>
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
                      ? 'EQUALS (=)'
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
                    {rawSym === '1' ? '● HOLE' : rawSym === '0' ? '○ SOLID' : rawSym === 'separator' ? '⊞ SEP' : rawSym === 'equals' ? '═ EQUALS' : ''}
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
            <span>DEC <b>{decimalTape || 'blank'}</b></span>
            <span>OCT <b>{octalTape || 'blank'}</b></span>
          </div>
          <span>GEAR <b>{activeSpec.title}</b></span>
          <span>HEAD <b>{machine.head}</b></span>
          <span>STEP <b>{String(machine.step).padStart(3, '0')}</b></span>
        </div>
      </section>

      <section className={`state-module module ${gearWorking ? 'working' : ''}`}>
        <div className="module-heading"><span>STATE GEAR (SPUR GEAR)</span><span>{stateSlotTitles[currentStateSlot]}</span></div>
        <div className="state-gear-bench">
          <div className="state-gear-housing">
            <div className="index-pawl" title="State gear index pointer">▼</div>
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
        <p className="module-note">Symmetrical spur gear; rotates one tooth per mechanical stage.</p>
      </section>

      <section className={`operation-module module ${gearWorking ? 'working' : ''}`}>
        <div className="module-heading"><span>ROTARY GEAR TURRET &amp; RATCHET</span><span>{gearPhaseLabel}</span></div>
        <div className="turret-ratchet-bench" aria-label="Rotary gear turret meshing with 4-notch ratchet">
          <div className="turret-housing">
            <div className="turret-caption">TURRET (CLICK / U·J)</div>
            <div
              className="turret-wheel"
              style={{ transform: `rotate(${turretRotationDeg}deg)` }}
              role="tablist"
              aria-label="9-gear rotary revolver turret"
            >
              <svg className="wheel-svg turret-svg" viewBox="-60 -60 120 120" aria-hidden="true">
                <path d={turretPlatePath} className="gear-rim turret-rim" />
                <circle cx="0" cy="0" r="46" className="gear-inner-ring" />
                <circle cx="0" cy="0" r="24" className="turret-core-ring" />
              </svg>
              {GEAR_MODES.map((mode, idx) => {
                const spec = GEAR_SPECS[mode]
                const isSelected = machine.operation === mode
                const stationAngle = idx * turretStepDeg + 90
                const counterAngle = -turretRotationDeg - stationAngle
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`turret-station ${isSelected ? 'active' : ''}`}
                    style={{ transform: `rotate(${stationAngle}deg) translateY(-44px)` }}
                    onClick={() => handleSelectGear(mode)}
                    title={`${spec.title} (${spec.formula})`}
                  >
                    <svg className="mini-gear-svg" viewBox="-20 -20 40 40" aria-hidden="true">
                      <path d={miniGearPath} className="mini-gear-rim" />
                      <circle cx="0" cy="0" r="9.5" className="mini-gear-bore" />
                    </svg>
                    <b style={{ transform: `rotate(${counterAngle}deg)` }}>{spec.shortName}</b>
                  </button>
                )
              })}
              <div
                className="wheel-hub turret-hub"
                style={{ transform: `rotate(${-turretRotationDeg}deg)` }}
              >
                <span>{activeSpec.shortName}</span>
                <small>U ◀ ▶ J</small>
              </div>
            </div>
          </div>

          <div className="mesh-bridge" title="Turret gear meshed with arithmetic ratchet">
            <span className="mesh-arrow">▶</span>
            <small>MESH</small>
          </div>

          <div className="ratchet-housing">
            <div className="turret-caption">4-NOTCH RATCHET</div>
            <div className="index-pawl" title="Top Locking Pawl">▼</div>
            <div
              className={`ratchet-wheel notch-${ratchetNotch}`}
              style={{ transform: `rotate(${-ratchetNotch * 90}deg)` }}
              aria-label={`4-notch wheel at notch ${ratchetNotch}`}
            >
              <svg className="wheel-svg ratchet-svg" viewBox="-60 -60 120 120" aria-hidden="true">
                <path d={ratchetWheelPath} className="gear-rim ratchet-rim" />
                <circle cx="0" cy="0" r="39" className="gear-inner-ring" />
              </svg>
              {([0, 1, 2, 3] as const).map((n) => {
                const isLobe = activeSpec.camLobes.includes(n)
                const isCarry = activeSpec.carryNotches.includes(n)
                const bin = n.toString(2).padStart(2, '0')
                return (
                  <span
                    key={n}
                    className={`wheel-notch n${n} ${isLobe ? 'odd-cam' : ''} ${isCarry ? 'carry-cam' : ''}`}
                  >
                    <b>{n}</b>
                    <small>{bin}₂</small>
                  </span>
                )
              })}
              <div className="wheel-hub"><span>N{ratchetNotch}</span></div>
            </div>
          </div>
        </div>

        <div className="actuator-strip">
          <div className={`input-pawl ${isProbing && pawlStroke !== 0 ? 'pushing' : ''}`} aria-label="Driving pawl">
            <span className="pawl-tag">{activeSpec.pawlLabel}</span>
            <strong>{pawlStrokeLabel}</strong>
          </div>
          <div className={`input-pawl ${activePhase === 'STAMP_SUM' ? 'pushing' : camHigh ? 'engaged' : ''}`} aria-label="Cam follower">
            <span className="pawl-tag">{activeSpec.camLabel}</span>
            <strong>{camHigh ? 'LOBE 1' : 'VALLEY 0'}</strong>
          </div>
          <div className={`carry-latch ${carryLatched ? 'latched' : ''} ${activePhase === 'STAMP_CARRY' ? 'releasing' : ''}`} aria-label="Carry or borrow latch">
            <span className="latch-title">{activeSpec.latchLabel}</span>
            <div className="latch-track"><div className="latch-bolt" /></div>
            <strong>
              {activeSpec.carryNotches.length === 0
                ? 'UNHOOKED'
                : activePhase === 'STAMP_CARRY'
                  ? 'RELEASE → 1'
                  : carryLatched
                    ? 'LOCK 1'
                    : 'FREE 0'}
            </strong>
          </div>
        </div>
        <p className="module-note">{gearSummary}</p>
      </section>
    </section>

    <section className="piano-module module">
      <div className="module-heading"><span>PIANO CONTROL (SINGLE OCTAVE C4–B4)</span><span>WHITE KEYS: TAPE I/O &amp; TURRET ▶ · BLACK KEYS: TRANSPORT &amp; ◀ TURRET</span></div>
      <div className="piano-wrap">
        <div className="piano">
          <div className="keybed">
            {octaveKeys.map((k, index) => {
              const active = pressedKey === index
              return (
                <button
                  key={k.note}
                  className={`piano-key ${k.isBlack ? 'black' : 'white'} ${active ? 'active' : ''}`}
                  title={`${k.symbol} (${k.sublabel})`}
                  aria-label={`${k.symbol} (${k.sublabel})`}
                  onClick={() => {
                    setPressedKey(index)
                    window.setTimeout(() => setPressedKey(null), 180)
                    dispatch(k.action, index)
                  }}
                >
                  <span>{k.symbol}</span>
                  <small>{k.sublabel}</small>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="piano-guide">
        <span><b>← →</b> (Do/Re · A/S) Move</span>
        <span><b>1 0</b> (Mi/Fa · D/F) Write</span>
        <span><b>□ #</b> (So/La · G/H) Clear / Sep</span>
        <span><b>⏭ ↺</b> (C♯/D♯ · W/E) Step / Reset</span>
        <span><b>▶ ⏸</b> (F♯/G♯ · T/Y) Play / Pause</span>
        <span><b>◀⚙ ⚙▶</b> (A♯/Si · U/J) Rotate Turret</span>
      </div>
    </section>

    {helpOpen && (
      <div
        className="help-backdrop"
        role="presentation"
        onClick={closeHelp}
      >
        <div
          className="help-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="help-modal-header">
            <div>
              <span className="eyebrow">CURATOR&apos;S NOTE &amp; OPERATOR&apos;S MANUAL</span>
              <h2 id="help-modal-title">The 1900 Missing Link of Computing</h2>
            </div>
            <button
              type="button"
              className="help-close"
              aria-label="Close manual"
              onClick={closeHelp}
            >
              ×
            </button>
          </div>

          <div className="help-modal-body">
            <section className="help-section">
              <h3>1. The Concept: What If Turing Built His Machine in 1900?</h3>
              <figure className="help-exhibit-figure">
                <img
                  src={`${import.meta.env.BASE_URL}concept-product.jpg`}
                  alt="1900 Piano Turing Machine museum exhibit with bidirectional paper tape, 8-tooth state gear, and rotary gear turret"
                />
                <figcaption>
                  <span>EXHIBIT RECONSTRUCTION · LONDON c. 1900</span>
                  <span>Left: Bidirectional Paper Tape &amp; Tracker Bar · Center: 8-Tooth State Register · Right: Rotary Gear Turret, 4-Notch Ratchet &amp; Bell</span>
                </figcaption>
              </figure>
              <p>
                In computing history, there is a century-long conceptual gap between <b>19th-century mechanical calculators</b> (built from brass gears) and <b>Alan Turing&apos;s 1936 universal machine</b> (conceived as pure mathematical symbols on an infinite tape). Every physical component needed to build a Turing machine already existed in <b>1900</b>—inside a parlor player piano and a mechanical desk calculator:
              </p>
              <div className="help-era-grid">
                <div className="era-card">
                  <img
                    className="era-thumb"
                    src={`${import.meta.env.BASE_URL}era-babbage.jpg`}
                    alt="Pascal and Babbage brass gear columns where each digit requires its own gear wheel"
                  />
                  <span className="era-year">1642 – 1830s</span>
                  <strong>Pascal &amp; Babbage&apos;s Gear Calculators</strong>
                  <p>
                    Every digit required its own physical gear column. To add 40-digit numbers, you had to machine 40 interlocking brass wheels—bounded by hardware size.
                  </p>
                </div>
                <div className="era-card">
                  <img
                    className="era-thumb"
                    src={`${import.meta.env.BASE_URL}era-pianola.jpg`}
                    alt="1900s Player Piano perforated paper roll gliding over a brass pneumatic tracker bar"
                  />
                  <span className="era-year">1900s</span>
                  <strong>The Player Piano (Pianola)</strong>
                  <p>
                    Perforated paper rolls glided over a brass <b>Tracker Bar</b>. Whenever a punched hole passed an air port, suction tripped a pneumatic striker to play a piano key.
                  </p>
                </div>
                <div className="era-card highlight">
                  <img
                    className="era-thumb"
                    src={`${import.meta.env.BASE_URL}concept-product.jpg`}
                    alt="1900 Piano Turing Machine combining a bidirectional paper tape, state gear, and 1-bit ratchet turret"
                  />
                  <span className="era-year">1936 → 1900</span>
                  <strong>The Piano Turing Machine</strong>
                  <p>
                    Instead of 40 gear columns for 40 bits, a <b>single 1-bit ratchet wheel</b> rides back and forth across a <b>perforated paper tape</b>—computing numbers of <em>unlimited length</em>.
                  </p>
                </div>
              </div>
              <p className="help-hint">
                <b>Why this matters:</b> Moving memory off the gears and onto a scrollable paper tape is the exact leap from a fixed calculator to a general-purpose computer. Swapping the cam wheel on the <b>9-Gear Rotary Turret</b> transforms the same 4-notch ratchet into an <b>ALU</b> capable of Addition, Subtraction, Multiplication, and Bitwise Logic.
              </p>
            </section>

            <section className="help-section">
              <h3>2. Quick Start: Computing 1 + 1 = 2 (Binary 10)</h3>
              <p>
                Punching a symbol writes onto the <b>current cell</b> without moving the tape head, so move right one cell between each symbol to write <code>1#1</code>:
              </p>
              <div className="help-recipe-steps">
                <div className="recipe-step">
                  <span className="step-badge">Step 1</span>
                  <span className="step-action">Punch first number <code>1</code></span>
                  <kbd>D</kbd>
                  <small>Piano key: Mi (<code>1</code>)</small>
                </div>
                <div className="recipe-step">
                  <span className="step-badge">Step 2</span>
                  <span className="step-action">Move head to next cell</span>
                  <kbd>S</kbd>
                  <small>Piano key: Re (<code>→</code>)</small>
                </div>
                <div className="recipe-step">
                  <span className="step-badge">Step 3</span>
                  <span className="step-action">Punch operand separator <code>#</code></span>
                  <kbd>H</kbd>
                  <small>Piano key: La (<code>#</code>)</small>
                </div>
                <div className="recipe-step">
                  <span className="step-badge">Step 4</span>
                  <span className="step-action">Move head to next cell</span>
                  <kbd>S</kbd>
                  <small>Piano key: Re (<code>→</code>)</small>
                </div>
                <div className="recipe-step">
                  <span className="step-badge">Step 5</span>
                  <span className="step-action">Punch second number <code>1</code></span>
                  <kbd>D</kbd>
                  <small>Piano key: Mi (<code>1</code>)</small>
                </div>
                <div className="recipe-step run">
                  <span className="step-badge">Step 6</span>
                  <span className="step-action">Start the clockwork</span>
                  <kbd>T</kbd>
                  <small>F♯ (<code>▶ Play</code>) or <kbd>W</kbd> (<code>⏭ Step</code>)</small>
                </div>
              </div>
              <p className="help-hint">
                <b>Tip:</b> Multi-bit numbers work the same way — e.g. for <code>7 × 2 = 14</code>, rotate the turret to <b>MUL</b> (<kbd>J</kbd>) and punch <code>111#10</code>. For single-operand gears (<b>INC</b>, <b>SHL</b>, <b>NOT</b>), omit <code>#</code>.
              </p>
            </section>

            <section className="help-section">
              <h3>3. Single-Octave Piano Keyboard (C4–B4)</h3>
              <div className="help-grid">
                <div>
                  <strong>White Keys (Tape &amp; Turret)</strong>
                  <ul>
                    <li><b>Do (A) / Re (S)</b>: Move tape head Left <code>←</code> / Right <code>→</code></li>
                    <li><b>Mi (D) / Fa (F)</b>: Punch <code>1</code> (open hole) / <code>0</code> (solid mark)</li>
                    <li><b>So (G) / La (H)</b>: Clear cell <code>□</code> / Punch separator <code>#</code></li>
                    <li><b>Si (J)</b>: Rotate Gear Turret forward <code>⚙▶</code></li>
                  </ul>
                </div>
                <div>
                  <strong>Black Keys (Transport &amp; Turret)</strong>
                  <ul>
                    <li><b>C♯ (W)</b>: <code>⏭ Step</code> — advance 1 mechanical stage</li>
                    <li><b>D♯ (E)</b>: <code>↺ Reset</code> — reset head (or clear finished result)</li>
                    <li><b>F♯ (T)</b>: <code>▶ Play</code> — auto-step through the tape</li>
                    <li><b>G♯ (Y)</b>: <code>⏸ Pause</code> — pause at current stage</li>
                    <li><b>A♯ (U)</b>: <code>◀⚙</code> — rotate Gear Turret backward</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="help-section">
              <h3>4. How the Three Mechanical Assemblies Work Together</h3>
              <ol className="help-steps">
                <li>
                  <b>Paper Tape &amp; Pneumatic Tracker Bar (Left)</b>: Acts as both infinite memory and I/O. In stages <b>① q1</b> and <b>② q2</b>, the brass feeler pin drops into open holes (<code>1</code>), admitting air to stroke the driving pawl <code>+1 tooth</code>.
                </li>
                <li>
                  <b>8-Tooth State Spur Gear (Center)</b>: The machine&apos;s finite state register (<code>INPUT → SCAN → q1 → q2 → q3 → q4 → WRITE → HALT</code>), coordinating when the tape shuttles left or right.
                </li>
                <li>
                  <b>Rotary Gear Turret &amp; 4-Notch Ratchet (Right)</b>: Accumulates <code>A + B + Carry (0..3)</code> on a single 4-tooth wheel. In <b>③ q3</b>, raised cam lobes (<code>LOBE 1</code> vs <code>VALLEY 0</code>) fire the punch hammer; in <b>④ q4</b>, reaching Notch <code>≥ 2</code> locks the <b>Carry Latch</b> for the next bit to the left.
                </li>
              </ol>
            </section>
          </div>
        </div>
      </div>
    )}
  </main>
}

export default App
