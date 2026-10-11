import { parseOperationInput } from './operations'

export type TapeSymbol = '0' | '1' | 'separator'
export type StateId = 'INPUT' | 'SCAN' | 'ADD' | 'CARRY' | 'WRITE' | 'HALT' | 'q0' | 'q1' | 'q2' | 'q3' | 'q4' | 'q5'
export type PianoAction = 'setState0' | 'setState1' | 'setState2' | 'setState3' | 'setState4' | 'setState5' | 'write0' | 'write1' | 'writeSeparator' | 'blank' | 'moveLeft' | 'moveRight' | 'step' | 'play' | 'stop' | 'reset'
export type MachineResult = { binary: string; decimal: number; octal: string }
export type MachineEvent = { state: StateId; message: string; action?: PianoAction }
export type GearState = {
  aBit: 0 | 1
  bBit: 0 | 1
  carryIn: 0 | 1
  ratchetTotal: 0 | 1 | 2 | 3
  sumBit: 0 | 1
  carryOut: 0 | 1
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
  program?: { result: string; writeIndex: number; gear: GearState }
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

export function tapeText(tape: Record<number, TapeSymbol>): string {
  return Object.keys(tape).map(Number).sort((a, b) => a - b).map((position) => tape[position] === 'separator' ? '#' : tape[position]).join('')
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

export function applyPianoAction(snapshot: MachineSnapshot, action: PianoAction): MachineSnapshot {
  if (action === 'reset') {
    const restartingAfterHalt = snapshot.halted
    return { ...snapshot, tape: restartingAfterHalt ? {} : snapshot.tape, state: 'INPUT', head: 0, step: 0, carry: 0, halted: false, gear: undefined, result: undefined, error: undefined, program: undefined, lastEvent: { state: 'INPUT', message: restartingAfterHalt ? 'Result cleared; enter a new Tape input.' : 'Machine reset; Tape preserved.', action } }
  }
  if (action === 'stop') return { ...snapshot, halted: true, state: 'HALT', lastEvent: { state: 'HALT', message: 'Stopped by operator.', action } }
  if (action.startsWith('setState')) { const state = `q${action.slice(-1)}` as StateId; return { ...snapshot, state, error: undefined, lastEvent: { state, message: `State register set to ${state}.`, action } } }
  const tape = { ...snapshot.tape }
  const editingHaltedTape = snapshot.halted && ['write0', 'write1', 'writeSeparator', 'blank', 'moveLeft', 'moveRight'].includes(action)
  if (snapshot.halted && !editingHaltedTape) return snapshot
  if (action === 'write0') tape[snapshot.head] = '0'
  if (action === 'write1') tape[snapshot.head] = '1'
  if (action === 'writeSeparator') tape[snapshot.head] = 'separator'
  if (action === 'blank') delete tape[snapshot.head]
  if (action === 'moveLeft' || action === 'moveRight' || action === 'write0' || action === 'write1' || action === 'writeSeparator' || action === 'blank') {
    const nextHead = action === 'moveLeft' ? snapshot.head - 1 : action === 'moveRight' ? snapshot.head + 1 : snapshot.head
    return { ...snapshot, tape, head: nextHead, state: editingHaltedTape ? 'INPUT' : snapshot.state, halted: false, gear: editingHaltedTape ? undefined : snapshot.gear, result: editingHaltedTape ? undefined : snapshot.result, program: editingHaltedTape ? undefined : snapshot.program, error: undefined, lastEvent: { state: editingHaltedTape ? 'INPUT' : snapshot.state, message: editingHaltedTape ? `${pianoActionLabels[action]} Result Tape is editable.` : pianoActionLabels[action], action } }
  }
  if (action === 'play') {
    const text = tapeText(snapshot.tape)
    const result = resultFor(text)
    const gear = computeGearForInput(text, 0)
    if (!result || !gear) return invalidInput(snapshot)
    return { ...snapshot, state: 'SCAN', step: snapshot.step + 1, carry: 0, gear: undefined, error: undefined, result: undefined, program: { result: result.binary, writeIndex: 0, gear }, lastEvent: { state: 'SCAN', message: 'Scan the two operands from the Tape.', action } }
  }
  if (action === 'step') return runStep(snapshot)
  return snapshot
}

export function runStep(snapshot: MachineSnapshot): MachineSnapshot {
  if (snapshot.halted || !snapshot.program) return snapshot
  const { gear } = snapshot.program
  if (snapshot.state === 'SCAN') {
    return {
      ...snapshot,
      state: 'ADD',
      gear,
      step: snapshot.step + 1,
      lastEvent: {
        state: 'ADD',
        message: `棘爪推進 A(${gear.aBit}) + B(${gear.bBit}) + C(${gear.carryIn}) → 加法棘輪轉至第 ${gear.ratchetTotal} 格。`,
      },
    }
  }
  if (snapshot.state === 'ADD') {
    const binSum = gear.ratchetTotal.toString(2).padStart(2, '0')
    return {
      ...snapshot,
      state: 'CARRY',
      carry: gear.carryOut,
      gear,
      step: snapshot.step + 1,
      lastEvent: {
        state: 'CARRY',
        message: `${gear.aBit} + ${gear.bBit} + ${gear.carryIn} = ${binSum}₂：奇偶凸輪寫入 ${gear.sumBit}，進位栓設為 ${gear.carryOut}。`,
      },
    }
  }
  if (snapshot.state === 'CARRY') {
    return {
      ...snapshot,
      state: 'WRITE',
      tape: {},
      head: 0,
      gear,
      step: snapshot.step + 1,
      lastEvent: {
        state: 'WRITE',
        message: gear.carryOut ? '進位栓釋放 1 推入下一欄，準備寫入結果 Tape。' : '進位栓保持 0，準備寫入結果 Tape。',
      },
    }
  }
  const bit = snapshot.program.result[snapshot.program.writeIndex] as '0' | '1'
  const tape = { ...snapshot.tape, [snapshot.program.writeIndex]: bit }
  const done = snapshot.program.writeIndex === snapshot.program.result.length - 1
  if (done) {
    const value = BigInt(`0b${snapshot.program.result}`)
    return {
      ...snapshot,
      tape,
      state: 'HALT',
      halted: true,
      carry: 0,
      gear,
      step: snapshot.step + 1,
      result: { binary: snapshot.program.result, decimal: Number(value), octal: value.toString(8) },
      lastEvent: { state: 'HALT', message: 'Result written. The machine halts.' },
    }
  }
  return {
    ...snapshot,
    tape,
    head: snapshot.program.writeIndex + 1,
    gear,
    step: snapshot.step + 1,
    program: { ...snapshot.program, writeIndex: snapshot.program.writeIndex + 1 },
    lastEvent: { state: 'WRITE', message: `Write result bit ${bit}.` },
  }
}
