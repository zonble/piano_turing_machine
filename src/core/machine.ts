import { parseOperationInput } from './operations'

export type TapeSymbol = '0' | '1' | 'separator' | 'equals'
export type StateId = 'INPUT' | 'SCAN' | 'ADD' | 'CARRY' | 'WRITE' | 'HALT' | 'q0' | 'q1' | 'q2' | 'q3' | 'q4' | 'q5'
export type PianoAction = 'setState0' | 'setState1' | 'setState2' | 'setState3' | 'setState4' | 'setState5' | 'write0' | 'write1' | 'writeSeparator' | 'blank' | 'moveLeft' | 'moveRight' | 'step' | 'play' | 'stop' | 'reset'
export type MachineResult = { binary: string; decimal: number; octal: string }
export type MachineEvent = { state: StateId; message: string; action?: PianoAction }
export type MechanicalPhase = 'READ_A' | 'READ_B' | 'BELL_EQ' | 'STAMP_SUM' | 'STAMP_CARRY'
export type GearState = {
  aBit: 0 | 1
  bBit: 0 | 1
  carryIn: 0 | 1
  ratchetTotal: 0 | 1 | 2 | 3
  sumBit: 0 | 1
  carryOut: 0 | 1
  phase?: MechanicalPhase
  bellRung?: boolean
  punching?: boolean
}
export type MachineSnapshot = {
  operation: 'add'
  tape: Record<number, TapeSymbol>
  head: number
  state: StateId
  step: number
  carry: 0 | 1
  halted: boolean
  gear?: GearState
  result?: MachineResult
  error?: string
  lastEvent?: MachineEvent
  program?: { result: string; writeIndex: number; eqPos: number; gear: GearState }
}

export const pianoActions: Record<string, PianoAction> = {
  z: 'setState0',
  x: 'setState1',
  c: 'setState2',
  v: 'setState3',
  b: 'setState4',
  n: 'setState5',
  t: 'write0',
  y: 'write1',
  i: 'writeSeparator',
  u: 'blank',
  e: 'moveLeft',
  r: 'moveRight',
  o: 'step',
  p: 'play',
  a: 'stop',
  s: 'reset',
}

export const pianoActionLabels: Record<PianoAction, string> = {
  setState0: 'q0',
  setState1: 'q1',
  setState2: 'q2',
  setState3: 'q3',
  setState4: 'q4',
  setState5: 'q5',
  write0: '0',
  write1: '1',
  writeSeparator: '#',
  blank: '□',
  moveLeft: '←',
  moveRight: '→',
  step: '⏭',
  play: '▶',
  stop: '⏹',
  reset: '↺',
}

export function formatTapeSymbol(symbol?: TapeSymbol): string {
  if (symbol === 'separator') return '#'
  if (symbol === 'equals') return '='
  return symbol ?? '□'
}

export function tapeText(tape: Record<number, TapeSymbol>): string {
  return Object.keys(tape)
    .map(Number)
    .sort((a, b) => a - b)
    .map((position) => formatTapeSymbol(tape[position]))
    .join('')
}

export function octalTapeText(raw: string): string {
  if (!raw) return ''
  return raw.replace(/[01]+/g, (bits) => BigInt(`0b${bits}`).toString(8))
}

export function createInitialMachine(): MachineSnapshot {
  return { operation: 'add', tape: {}, head: 0, state: 'INPUT', step: 0, carry: 0, halted: false }
}

function computeGearForInput(input: string, carryIn: 0 | 1 = 0): GearState | undefined {
  const parsed = parseOperationInput('add', input)
  if (!parsed.ok) return undefined
  const [left, right] = parsed.operands
  const aBit = (left[left.length - 1] === '1' ? 1 : 0) as 0 | 1
  const bBit = (right[right.length - 1] === '1' ? 1 : 0) as 0 | 1
  const ratchetTotal = (aBit + bBit + carryIn) as 0 | 1 | 2 | 3
  const sumBit = (ratchetTotal % 2) as 0 | 1
  const carryOut = (ratchetTotal >= 2 ? 1 : 0) as 0 | 1
  return { aBit, bBit, carryIn, ratchetTotal, sumBit, carryOut }
}

function resultFor(input: string): MachineResult | undefined {
  const parsed = parseOperationInput('add', input)
  if (!parsed.ok) return undefined
  const value = BigInt(`0b${parsed.operands[0]}`) + BigInt(`0b${parsed.operands[1]}`)
  const binary = value.toString(2)
  return { binary, decimal: Number(value), octal: value.toString(8) }
}

function invalidInput(snapshot: MachineSnapshot): MachineSnapshot {
  const parsed = parseOperationInput('add', tapeText(snapshot.tape))
  if (parsed.ok) return snapshot
  return { ...snapshot, error: parsed.error.message, lastEvent: { state: snapshot.state, message: parsed.error.message } }
}

function tapeBounds(tape: Record<number, TapeSymbol>): { first: number; separator: number; last: number } {
  const positions = Object.keys(tape)
    .map(Number)
    .filter((pos) => tape[pos] === '0' || tape[pos] === '1' || tape[pos] === 'separator')
    .sort((a, b) => a - b)
  const first = positions[0] ?? 0
  const last = positions[positions.length - 1] ?? 2
  const separator = positions.find((pos) => tape[pos] === 'separator') ?? Math.floor((first + last) / 2)
  return { first, separator, last }
}

function inputOnlyTape(tape: Record<number, TapeSymbol>): Record<number, TapeSymbol> {
  const cleaned: Record<number, TapeSymbol> = {}
  const positions = Object.keys(tape).map(Number).sort((a, b) => a - b)
  for (const pos of positions) {
    if (tape[pos] === 'equals') break
    cleaned[pos] = tape[pos]
  }
  return cleaned
}

export function applyPianoAction(snapshot: MachineSnapshot, action: PianoAction): MachineSnapshot {
  if (action === 'reset') {
    const restartingAfterHalt = snapshot.halted
    return { ...snapshot, tape: restartingAfterHalt ? {} : snapshot.tape, state: 'INPUT', head: 0, step: 0, carry: 0, halted: false, gear: undefined, result: undefined, error: undefined, program: undefined, lastEvent: { state: 'INPUT', message: restartingAfterHalt ? 'Result cleared; enter a new Tape input.' : 'Machine reset; Tape preserved.', action } }
  }
  if (action === 'stop') return { ...snapshot, halted: true, state: 'HALT', lastEvent: { state: 'HALT', message: 'Stopped by operator.', action } }
  if (action.startsWith('setState')) {
    const stageNum = Number(action.slice(-1))
    const baseTape = inputOnlyTape(snapshot.tape)
    const text = tapeText(baseTape)
    const parsed = parseOperationInput('add', text)
    if (parsed.ok) {
      const bounds = tapeBounds(baseTape)
      const cleanInput: MachineSnapshot = {
        ...snapshot,
        tape: baseTape,
        head: bounds.last,
        state: 'INPUT',
        carry: 0,
        halted: false,
        gear: undefined,
        result: undefined,
        error: undefined,
        program: undefined,
      }
      if (stageNum === 0) {
        return {
          ...cleanInput,
          lastEvent: { state: 'INPUT', message: 'q0 待命：棘輪歸零，保留紙帶題目。', action },
        }
      }
      let current = applyPianoAction(cleanInput, 'play')
      for (let i = 1; i < stageNum && !current.halted; i += 1) {
        current = runStep(current)
      }
      return current
    }
    const state = `q${stageNum}` as StateId
    return { ...snapshot, state, error: undefined, lastEvent: { state, message: `State register set to ${state}.`, action } }
  }

  let tape = { ...snapshot.tape }
  let baseHead = snapshot.head
  const editingHaltedTape = snapshot.halted && ['write0', 'write1', 'writeSeparator', 'blank', 'moveLeft', 'moveRight'].includes(action)
  if (snapshot.halted && !editingHaltedTape) return snapshot
  if (editingHaltedTape && snapshot.result && Object.values(tape).includes('equals')) {
    tape = {}
    for (let i = 0; i < snapshot.result.binary.length; i += 1) {
      tape[i] = snapshot.result.binary[i] as '0' | '1'
    }
    baseHead = snapshot.result.binary.length - 1
  }

  if (action === 'write0') tape[baseHead] = '0'
  if (action === 'write1') tape[baseHead] = '1'
  if (action === 'writeSeparator') tape[baseHead] = 'separator'
  if (action === 'blank') delete tape[baseHead]
  if (action === 'moveLeft' || action === 'moveRight' || action === 'write0' || action === 'write1' || action === 'writeSeparator' || action === 'blank') {
    const nextHead = action === 'moveLeft' ? baseHead - 1 : action === 'moveRight' ? baseHead + 1 : baseHead
    return { ...snapshot, tape, head: nextHead, state: editingHaltedTape ? 'INPUT' : snapshot.state, halted: false, gear: editingHaltedTape ? undefined : snapshot.gear, result: editingHaltedTape ? undefined : snapshot.result, program: editingHaltedTape ? undefined : snapshot.program, error: undefined, lastEvent: { state: editingHaltedTape ? 'INPUT' : snapshot.state, message: editingHaltedTape ? `${pianoActionLabels[action]} Result Tape is editable.` : pianoActionLabels[action], action } }
  }
  if (action === 'play' || action === 'step') {
    if (snapshot.program) {
      return action === 'step' ? runStep(snapshot) : snapshot
    }
    const text = tapeText(snapshot.tape)
    const result = resultFor(text)
    const gear = computeGearForInput(text, 0)
    if (!result || !gear) return invalidInput(snapshot)
    const bounds = tapeBounds(snapshot.tape)
    const eqPos = bounds.last + 1
    const scanAGear: GearState = {
      aBit: gear.aBit,
      bBit: 0,
      carryIn: 0,
      ratchetTotal: gear.aBit,
      sumBit: gear.aBit,
      carryOut: 0,
      phase: 'READ_A',
      bellRung: false,
      punching: false,
    }
    return {
      ...snapshot,
      state: 'SCAN',
      head: bounds.first,
      step: snapshot.step + 1,
      carry: 0,
      gear: scanAGear,
      error: undefined,
      result: undefined,
      program: { result: result.binary, writeIndex: result.binary.length - 1, eqPos, gear },
      lastEvent: {
        state: 'SCAN',
        message: `① 讀取 A：讀寫頭移至 A(${gear.aBit})，A 棘爪將棘輪推至第 ${gear.aBit} 格。`,
        action,
      },
    }
  }
  return snapshot
}

export function runStep(snapshot: MachineSnapshot): MachineSnapshot {
  if (snapshot.halted || !snapshot.program) return snapshot
  const { gear, eqPos, result: binaryResult } = snapshot.program
  const bounds = tapeBounds(snapshot.tape)

  if (snapshot.state === 'SCAN') {
    return {
      ...snapshot,
      state: 'ADD',
      head: bounds.last,
      carry: gear.carryOut,
      gear: { ...gear, phase: 'READ_B', bellRung: false, punching: false },
      step: snapshot.step + 1,
      lastEvent: {
        state: 'ADD',
        message: `② 讀取 B：讀寫頭移至 B(${gear.bBit})，B 棘爪將棘輪推至第 ${gear.ratchetTotal} 格${gear.carryOut ? '，頂出進位栓 LOCK 1' : ''}。`,
      },
    }
  }

  if (snapshot.state === 'ADD') {
    const tape = { ...snapshot.tape, [eqPos]: 'equals' as const }
    return {
      ...snapshot,
      tape,
      state: 'CARRY',
      head: eqPos,
      carry: gear.carryOut,
      gear: { ...gear, phase: 'BELL_EQ', bellRung: true, punching: true },
      step: snapshot.step + 1,
      lastEvent: {
        state: 'CARRY',
        message: `③ 當——！讀完 A 與 B 敲響銅鈴，在紙帶印下「=」（棘輪停在第 ${gear.ratchetTotal} 格）。`,
      },
    }
  }

  if (snapshot.state === 'CARRY') {
    const writeIndex = snapshot.program.writeIndex
    const targetPos = eqPos + 1 + writeIndex
    const bit = binaryResult[writeIndex] as '0' | '1'
    const tape = { ...snapshot.tape, [targetPos]: bit }
    const done = writeIndex === 0
    if (done) {
      const value = BigInt(`0b${binaryResult}`)
      return {
        ...snapshot,
        tape,
        head: targetPos,
        state: 'HALT',
        halted: true,
        carry: 0,
        gear: { ...gear, phase: 'STAMP_SUM', bellRung: false, punching: true },
        step: snapshot.step + 1,
        result: { binary: binaryResult, decimal: Number(value), octal: value.toString(8) },
        lastEvent: {
          state: 'HALT',
          message: `④ 奇偶凸輪打孔：在個位格印下 ${bit}，無進位，算式完成！`,
        },
      }
    }
    return {
      ...snapshot,
      tape,
      head: targetPos,
      state: 'WRITE',
      gear: { ...gear, phase: 'STAMP_SUM', bellRung: false, punching: true },
      step: snapshot.step + 1,
      program: { ...snapshot.program, writeIndex: writeIndex - 1 },
      lastEvent: {
        state: 'WRITE',
        message: `④ 奇偶凸輪打孔：棘輪第 ${gear.ratchetTotal} 格（${gear.sumBit === 1 ? '奇數凸齒' : '偶數凹槽'}）在個位格印下 ${bit}。`,
      },
    }
  }

  const writeIndex = snapshot.program.writeIndex
  const targetPos = eqPos + 1 + writeIndex
  const bit = binaryResult[writeIndex] as '0' | '1'
  const tape = { ...snapshot.tape, [targetPos]: bit }
  const done = writeIndex === 0
  if (done) {
    const value = BigInt(`0b${binaryResult}`)
    return {
      ...snapshot,
      tape,
      head: targetPos,
      state: 'HALT',
      halted: true,
      carry: 0,
      gear: { ...gear, carryOut: 0, ratchetTotal: 0, phase: 'STAMP_CARRY', bellRung: false, punching: true },
      step: snapshot.step + 1,
      result: { binary: binaryResult, decimal: Number(value), octal: value.toString(8) },
      lastEvent: {
        state: 'HALT',
        message: `⑤ 釋放進位栓：讀寫頭往左退一格，進位栓彈回 FREE 0 並打孔印下進位 ${bit}，算式完成！`,
      },
    }
  }
  return {
    ...snapshot,
    tape,
    head: targetPos,
    gear: { ...gear, phase: 'STAMP_CARRY', bellRung: false, punching: true },
    step: snapshot.step + 1,
    program: { ...snapshot.program, writeIndex: writeIndex - 1 },
    lastEvent: {
      state: 'WRITE',
      message: `⑤ 往左移一格打孔印下高位 ${bit}。`,
    },
  }
}
