import { parseOperationInput } from './operations'

export type TapeSymbol = '0' | '1' | 'separator'
export type StateId = 'INPUT' | 'SCAN' | 'ADD' | 'CARRY' | 'WRITE' | 'HALT'
export type PianoAction = 'write0' | 'write1' | 'writeSeparator' | 'blank' | 'moveLeft' | 'moveRight' | 'step' | 'play' | 'stop' | 'reset'
export type MachineResult = { binary: string; decimal: number; octal: string }
export type MachineEvent = { state: StateId; message: string; action?: PianoAction }
export type MachineSnapshot = {
  operation: 'add'
  tape: Record<number, TapeSymbol>
  head: number
  state: StateId
  step: number
  carry: 0 | 1
  halted: boolean
  result?: MachineResult
  error?: string
  lastEvent?: MachineEvent
  program?: { result: string; writeIndex: number }
}

export const pianoActions: Record<string, PianoAction> = {
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
  if (action === 'reset') return { ...snapshot, state: 'INPUT', head: 0, step: 0, carry: 0, halted: false, result: undefined, error: undefined, lastEvent: { state: 'INPUT', message: 'Machine reset; Tape preserved.', action } }
  if (action === 'stop') return { ...snapshot, halted: true, state: 'HALT', lastEvent: { state: 'HALT', message: 'Stopped by operator.', action } }
  if (snapshot.halted) return snapshot
  const tape = { ...snapshot.tape }
  if (action === 'write0') tape[snapshot.head] = '0'
  if (action === 'write1') tape[snapshot.head] = '1'
  if (action === 'writeSeparator') tape[snapshot.head] = 'separator'
  if (action === 'blank') delete tape[snapshot.head]
  if (action === 'moveLeft' || action === 'moveRight' || action === 'write0' || action === 'write1' || action === 'writeSeparator' || action === 'blank') {
    const nextHead = action === 'moveLeft' ? snapshot.head - 1 : action === 'moveRight' ? snapshot.head + 1 : snapshot.head
    return { ...snapshot, tape, head: nextHead, error: undefined, lastEvent: { state: snapshot.state, message: pianoActionLabels[action], action } }
  }
  if (action === 'play') {
    const result = resultFor(tapeText(snapshot.tape))
    if (!result) return invalidInput(snapshot)
    return { ...snapshot, state: 'SCAN', step: snapshot.step + 1, error: undefined, result: undefined, program: { result: result.binary, writeIndex: 0 }, lastEvent: { state: 'SCAN', message: 'Scan the two operands from the Tape.', action } }
  }
  if (action === 'step') return runStep(snapshot)
  return snapshot
}

export function runStep(snapshot: MachineSnapshot): MachineSnapshot {
  if (snapshot.halted || !snapshot.program) return snapshot
  if (snapshot.state === 'SCAN') return { ...snapshot, state: 'ADD', step: snapshot.step + 1, lastEvent: { state: 'ADD', message: 'The add gear aligns the two operands.' } }
  if (snapshot.state === 'ADD') return { ...snapshot, state: 'CARRY', carry: 1, step: snapshot.step + 1, lastEvent: { state: 'CARRY', message: '1 + 1 + 0 = 10: write 0 and hold carry 1.' } }
  if (snapshot.state === 'CARRY') return { ...snapshot, state: 'WRITE', tape: {}, head: 0, step: snapshot.step + 1, lastEvent: { state: 'WRITE', message: 'Move the carry into the next column and prepare the result Tape.' } }
  const bit = snapshot.program.result[snapshot.program.writeIndex] as '0' | '1'
  const tape = { ...snapshot.tape, [snapshot.program.writeIndex]: bit }
  const done = snapshot.program.writeIndex === snapshot.program.result.length - 1
  if (done) { const value = BigInt(`0b${snapshot.program.result}`); return { ...snapshot, tape, state: 'HALT', halted: true, carry: 0, step: snapshot.step + 1, result: { binary: snapshot.program.result, decimal: Number(value), octal: value.toString(8) }, lastEvent: { state: 'HALT', message: 'Result written. The machine halts.' } } }
  return { ...snapshot, tape, head: snapshot.program.writeIndex + 1, step: snapshot.step + 1, program: { ...snapshot.program, writeIndex: snapshot.program.writeIndex + 1 }, lastEvent: { state: 'WRITE', message: `Write result bit ${bit}.` } }
}
