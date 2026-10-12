import { parseOperationInput } from './operations'

export type TapeSymbol = '0' | '1' | 'separator' | 'equals'
export type StateId = 'INPUT' | 'SCAN' | 'ADD' | 'CARRY' | 'WRITE' | 'HALT' | 'q0' | 'q1' | 'q2' | 'q3' | 'q4' | 'q5'
export type GearMode =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'and'
  | 'or'
  | 'xor'
  | 'increment'
  | 'shift'
  | 'not'
export type PianoAction =
  | 'write0'
  | 'write1'
  | 'writeSeparator'
  | 'blank'
  | 'moveLeft'
  | 'moveRight'
  | 'step'
  | 'play'
  | 'stop'
  | 'reset'
  | 'prevGear'
  | 'nextGear'
export type MachineResult = { binary: string; decimal: number; octal: string }
export type MachineEvent = { state: StateId; message: string; action?: PianoAction }
export type MechanicalPhase = 'READ_A' | 'READ_B' | 'STAMP_SUM' | 'STAMP_CARRY'
export type GearState = {
  aBit: 0 | 1
  bBit: 0 | 1
  pawlStroke: -1 | 0 | 1
  prevNotch: 0 | 1 | 2 | 3
  carryIn: 0 | 1
  ratchetTotal: 0 | 1 | 2 | 3
  sumBit: 0 | 1
  carryOut: 0 | 1
  bitIndex?: number
  totalBits?: number
  phase?: MechanicalPhase
  punching?: boolean
}

export type GearSpec = {
  id: GearMode
  shortName: string
  title: string
  formula: string
  isUnary: boolean
  camLobes: Array<0 | 1 | 2 | 3>
  carryNotches: Array<0 | 1 | 2 | 3>
  pawlLabel: string
  camLabel: string
  latchLabel: string
  idleNote: string
}

export const GEAR_MODES: GearMode[] = [
  'add',
  'subtract',
  'multiply',
  'and',
  'or',
  'xor',
  'increment',
  'shift',
  'not',
]

export const GEAR_SPECS: Record<GearMode, GearSpec> = {
  add: {
    id: 'add',
    shortName: 'ADD',
    title: 'ADD (A + B)',
    formula: 'A # B',
    isUnary: false,
    camLobes: [1, 3],
    carryNotches: [2, 3],
    pawlLabel: '①② DRIVING PAWL',
    camLabel: '③ ODD/EVEN CAM',
    latchLabel: '④ CARRY LATCH',
    idleNote: 'Adder Ratchet (00₂). Enter A#B on the piano, then press ▶ or ⏭ to add bit by bit.',
  },
  subtract: {
    id: 'subtract',
    shortName: 'SUB',
    title: 'SUB (A − B)',
    formula: 'A # B (A ≥ B)',
    isUnary: false,
    camLobes: [1, 3],
    carryNotches: [2, 3],
    pawlLabel: '①② +/- PAWL',
    camLabel: '③ DIFF CAM',
    latchLabel: '④ BORROW LATCH',
    idleNote: 'Subtractor Ratchet: Read A pushes +1 tooth; Read B pulls −1 tooth and latches borrow.',
  },
  multiply: {
    id: 'multiply',
    shortName: 'MUL',
    title: 'MUL (A × B)',
    formula: 'A # B',
    isUnary: false,
    camLobes: [1, 3],
    carryNotches: [2, 3],
    pawlLabel: '①② MUL CLUTCH',
    camLabel: '③ PRODUCT CAM',
    latchLabel: '④ ACCUMULATOR',
    idleNote: 'Shift-and-Add Multiplier: each 1 in B engages the clutch to accumulate shifted A.',
  },
  and: {
    id: 'and',
    shortName: 'AND',
    title: 'AND (A & B)',
    formula: 'A # B',
    isUnary: false,
    camLobes: [2],
    carryNotches: [],
    pawlLabel: '①② DRIVING PAWL',
    camLabel: '③ NOTCH-2 CAM',
    latchLabel: '④ NO CARRY',
    idleNote: 'Bitwise AND Cam: only Notch 2 (both A=1 and B=1) has a raised cam lobe; carry unhooked.',
  },
  or: {
    id: 'or',
    shortName: 'OR',
    title: 'OR (A | B)',
    formula: 'A # B',
    isUnary: false,
    camLobes: [1, 2, 3],
    carryNotches: [],
    pawlLabel: '①② DRIVING PAWL',
    camLabel: '③ NOTCH-1/2 CAM',
    latchLabel: '④ NO CARRY',
    idleNote: 'Bitwise OR Cam: Notches 1 and 2 have raised cam lobes (1 if either bit is 1); no carry.',
  },
  xor: {
    id: 'xor',
    shortName: 'XOR',
    title: 'XOR (A ^ B)',
    formula: 'A # B',
    isUnary: false,
    camLobes: [1, 3],
    carryNotches: [],
    pawlLabel: '①② DRIVING PAWL',
    camLabel: '③ NOTCH-1 CAM',
    latchLabel: '④ NO CARRY',
    idleNote: 'Bitwise XOR Cam: Odd cam lobe at Notch 1 punches 1 when A ≠ B; carry latch unhooked.',
  },
  increment: {
    id: 'increment',
    shortName: 'INC',
    title: 'INC (A + 1)',
    formula: 'A (unary)',
    isUnary: true,
    camLobes: [1, 3],
    carryNotches: [2, 3],
    pawlLabel: '① DRIVING PAWL',
    camLabel: '③ ODD/EVEN CAM',
    latchLabel: '④ +1 CARRY LATCH',
    idleNote: 'Increment Gear: pre-loads +1 into the Carry Latch at bit 0 and ripples through A.',
  },
  shift: {
    id: 'shift',
    shortName: 'SHL',
    title: 'SHL (A × 2)',
    formula: 'A (unary)',
    isUnary: true,
    camLobes: [1, 3],
    carryNotches: [2, 3],
    pawlLabel: '① SHIFT PAWL',
    camLabel: '③ BIT CAM',
    latchLabel: '④ SHIFT LATCH',
    idleNote: 'Left-Shift Gear: punches 0 at ones place and shifts every bit of A one cell left.',
  },
  not: {
    id: 'not',
    shortName: 'NOT',
    title: 'NOT (~A)',
    formula: 'A (unary)',
    isUnary: true,
    camLobes: [0, 2],
    carryNotches: [],
    pawlLabel: '① DRIVING PAWL',
    camLabel: '③ INVERTING CAM',
    latchLabel: '④ NO CARRY',
    idleNote: 'Bitwise NOT Cam: Notch 0 has a raised lobe (0 → 1) and Notch 1 is a valley (1 → 0).',
  },
}

export type MechanicalProgram = {
  aPositions: number[]
  bPositions: number[]
  separatorPos: number
  eqPos: number
  onesPos: number
  bitIndex: number
  maxBits: number
  expectedBits: string
  gear: GearState
}

export type MachineSnapshot = {
  operation: GearMode
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
  program?: MechanicalProgram
}

export const pianoActions: Record<string, PianoAction> = {
  a: 'moveLeft',
  s: 'moveRight',
  d: 'write1',
  f: 'write0',
  g: 'blank',
  h: 'writeSeparator',
  w: 'step',
  e: 'reset',
  t: 'play',
  y: 'stop',
  u: 'prevGear',
  j: 'nextGear',
}

export const pianoActionLabels: Record<PianoAction, string> = {
  moveLeft: '←',
  moveRight: '→',
  write1: '1',
  write0: '0',
  blank: '□',
  writeSeparator: '#',
  step: '⏭',
  reset: '↺',
  play: '▶',
  stop: '⏸',
  prevGear: '◀ GEAR',
  nextGear: 'GEAR ▶',
}

const superscriptDigits = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

function toSuperscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => superscriptDigits[Number(d)] ?? d)
    .join('')
}

export function formatBitPosition(bitIndex: number): string {
  const sup = `2${toSuperscript(bitIndex)}`
  return bitIndex === 0 ? `bit 0 (ones ${sup})` : `bit ${bitIndex} (${sup} place)`
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

export function decimalTapeText(raw: string): string {
  if (!raw) return ''
  return raw.replace(/[01]+/g, (bits) => BigInt(`0b${bits}`).toString(10))
}

export function createInitialMachine(): MachineSnapshot {
  return { operation: 'add', tape: {}, head: 0, state: 'INPUT', step: 0, carry: 0, halted: false }
}

export function selectGear(snapshot: MachineSnapshot, operation: GearMode): MachineSnapshot {
  const cleanedTape = snapshot.halted ? inputOnlyTape(snapshot.tape) : snapshot.tape
  return {
    ...snapshot,
    operation,
    tape: cleanedTape,
    state: 'INPUT',
    carry: 0,
    halted: false,
    gear: undefined,
    result: undefined,
    error: undefined,
    program: undefined,
    lastEvent: {
      state: 'INPUT',
      message: `Switched gear to ${GEAR_SPECS[operation].title}.`,
    },
  }
}

function invalidInput(snapshot: MachineSnapshot, message: string): MachineSnapshot {
  return {
    ...snapshot,
    error: message,
    lastEvent: { state: snapshot.state, message },
  }
}

function trimLeadingZeroPositions(tape: Record<number, TapeSymbol>, positions: number[]): number[] {
  let idx = 0
  while (idx < positions.length - 1 && tape[positions[idx]] === '0') {
    idx += 1
  }
  return positions.slice(idx)
}

function extractOperandPositions(
  operation: GearMode,
  tape: Record<number, TapeSymbol>,
): {
  aPositions: number[]
  bPositions: number[]
  separatorPos: number
  lastInputPos: number
} | undefined {
  const positions = Object.keys(tape)
    .map(Number)
    .filter((pos) => tape[pos] === '0' || tape[pos] === '1' || tape[pos] === 'separator')
    .sort((a, b) => a - b)
  if (positions.length === 0) return undefined

  const isUnary = GEAR_SPECS[operation].isUnary
  const separatorPos = positions.find((pos) => tape[pos] === 'separator')

  if (isUnary) {
    const rawA = positions.filter(
      (pos) => (separatorPos === undefined || pos < separatorPos) && (tape[pos] === '0' || tape[pos] === '1'),
    )
    if (rawA.length === 0) return undefined
    const aPositions = operation === 'not' ? rawA : trimLeadingZeroPositions(tape, rawA)
    const lastInputPos = positions[positions.length - 1]
    return {
      aPositions,
      bPositions: [],
      separatorPos: separatorPos ?? aPositions[0],
      lastInputPos,
    }
  }

  if (separatorPos === undefined) return undefined
  const rawA = positions.filter((pos) => pos < separatorPos && (tape[pos] === '0' || tape[pos] === '1'))
  const rawB = positions.filter((pos) => pos > separatorPos && (tape[pos] === '0' || tape[pos] === '1'))
  if (rawA.length === 0 || rawB.length === 0) return undefined
  const aPositions = trimLeadingZeroPositions(tape, rawA)
  const bPositions = trimLeadingZeroPositions(tape, rawB)
  const lastInputPos = positions[positions.length - 1]
  return { aPositions, bPositions, separatorPos, lastInputPos }
}

function bitsFromPositions(tape: Record<number, TapeSymbol>, positions: number[]): string {
  return positions.map((p) => (tape[p] === '1' ? '1' : '0')).join('') || '0'
}

function computeExpectedResultBits(
  operation: GearMode,
  tape: Record<number, TapeSymbol>,
  aPositions: number[],
  bPositions: number[],
): { ok: true; bits: string; maxBits: number; hasFinalCarry: boolean } | { ok: false; message: string } {
  const aStr = bitsFromPositions(tape, aPositions)
  const bStr = bitsFromPositions(tape, bPositions)
  const aVal = BigInt(`0b${aStr}`)
  const bVal = bPositions.length > 0 ? BigInt(`0b${bStr}`) : 0n
  const inputMaxBits = Math.max(aPositions.length, bPositions.length, 1)

  if (operation === 'subtract' && aVal < bVal) {
    return { ok: false, message: 'SUB gear requires A ≥ B (negative results not supported on tape).' }
  }

  if (operation === 'add') {
    const out = (aVal + bVal).toString(2)
    return { ok: true, bits: out, maxBits: inputMaxBits, hasFinalCarry: out.length > inputMaxBits }
  }
  if (operation === 'subtract') {
    const out = (aVal - bVal).toString(2).padStart(inputMaxBits, '0')
    return { ok: true, bits: out, maxBits: inputMaxBits, hasFinalCarry: false }
  }
  if (operation === 'multiply') {
    const out = (aVal * bVal).toString(2)
    const hasFinalCarry = out.length > inputMaxBits
    const maxBits = hasFinalCarry ? out.length - 1 : Math.max(out.length, inputMaxBits)
    return {
      ok: true,
      bits: out.padStart(maxBits + (hasFinalCarry ? 1 : 0), '0'),
      maxBits,
      hasFinalCarry,
    }
  }
  if (operation === 'and') {
    const out = (aVal & bVal).toString(2).padStart(inputMaxBits, '0')
    return { ok: true, bits: out, maxBits: inputMaxBits, hasFinalCarry: false }
  }
  if (operation === 'or') {
    const out = (aVal | bVal).toString(2).padStart(inputMaxBits, '0')
    return { ok: true, bits: out, maxBits: inputMaxBits, hasFinalCarry: false }
  }
  if (operation === 'xor') {
    const out = (aVal ^ bVal).toString(2).padStart(inputMaxBits, '0')
    return { ok: true, bits: out, maxBits: inputMaxBits, hasFinalCarry: false }
  }
  if (operation === 'increment') {
    const out = (aVal + 1n).toString(2)
    return { ok: true, bits: out, maxBits: aPositions.length, hasFinalCarry: out.length > aPositions.length }
  }
  if (operation === 'shift') {
    if (aVal === 0n) {
      return { ok: true, bits: '0', maxBits: 1, hasFinalCarry: false }
    }
    const out = (aVal << 1n).toString(2)
    return { ok: true, bits: out, maxBits: aPositions.length, hasFinalCarry: true }
  }
  // 'not'
  const out = aStr
    .split('')
    .map((ch) => (ch === '1' ? '0' : '1'))
    .join('')
  return { ok: true, bits: out, maxBits: aPositions.length, hasFinalCarry: false }
}

function computeBitGear(
  operation: GearMode,
  tape: Record<number, TapeSymbol>,
  aPositions: number[],
  bPositions: number[],
  bitIndex: number,
  maxBits: number,
  carryIn: 0 | 1,
  expectedBits: string,
): GearState {
  const aIdx = aPositions.length - 1 - bitIndex
  const bIdx = bPositions.length - 1 - bitIndex
  const aBit = (aIdx >= 0 && tape[aPositions[aIdx]] === '1' ? 1 : 0) as 0 | 1
  const bBit = (bIdx >= 0 && tape[bPositions[bIdx]] === '1' ? 1 : 0) as 0 | 1
  const expectedIdx = expectedBits.length - 1 - bitIndex
  const expectedSumBit = (expectedIdx >= 0 && expectedBits[expectedIdx] === '1' ? 1 : 0) as 0 | 1

  if (operation === 'subtract') {
    const rawDiff = aBit - bBit - carryIn
    const sumBit = ((rawDiff & 1) === 1 ? 1 : 0) as 0 | 1
    const borrowOut = (rawDiff < 0 ? 1 : 0) as 0 | 1
    const prevNotch = ((aBit - carryIn + 4) % 4) as 0 | 1 | 2 | 3
    const ratchetTotal = (borrowOut * 2 + sumBit) as 0 | 1 | 2 | 3
    return {
      aBit,
      bBit,
      pawlStroke: 0,
      prevNotch,
      carryIn,
      ratchetTotal,
      sumBit,
      carryOut: borrowOut,
      bitIndex,
      totalBits: maxBits,
    }
  }

  if (operation === 'and' || operation === 'or' || operation === 'xor') {
    const ratchetTotal = (aBit + bBit) as 0 | 1 | 2 | 3
    return {
      aBit,
      bBit,
      pawlStroke: 0,
      prevNotch: aBit,
      carryIn: 0,
      ratchetTotal,
      sumBit: expectedSumBit,
      carryOut: 0,
      bitIndex,
      totalBits: maxBits,
    }
  }

  if (operation === 'not') {
    const ratchetTotal = aBit as 0 | 1 | 2 | 3
    return {
      aBit,
      bBit: 0,
      pawlStroke: 0,
      prevNotch: aBit,
      carryIn: 0,
      ratchetTotal,
      sumBit: (aBit === 0 ? 1 : 0) as 0 | 1,
      carryOut: 0,
      bitIndex,
      totalBits: maxBits,
    }
  }

  if (operation === 'shift') {
    const sumBit = bitIndex === 0 ? 0 : carryIn
    const carryOut = aBit
    const ratchetTotal = (carryOut * 2 + sumBit) as 0 | 1 | 2 | 3
    return {
      aBit,
      bBit: 0,
      pawlStroke: 0,
      prevNotch: ratchetTotal,
      carryIn,
      ratchetTotal,
      sumBit,
      carryOut,
      bitIndex,
      totalBits: maxBits,
    }
  }

  if (operation === 'multiply') {
    const hasMoreUpperBits =
      bitIndex + 1 < maxBits
        ? expectedBits.slice(0, expectedBits.length - 1 - bitIndex).includes('1')
        : expectedBits.length > maxBits && expectedBits[0] === '1'
    const carryOut = (hasMoreUpperBits ? 1 : 0) as 0 | 1
    const ratchetTotal = (carryOut * 2 + expectedSumBit) as 0 | 1 | 2 | 3
    return {
      aBit,
      bBit,
      pawlStroke: 0,
      prevNotch: (carryIn + aBit) as 0 | 1 | 2 | 3,
      carryIn,
      ratchetTotal,
      sumBit: expectedSumBit,
      carryOut,
      bitIndex,
      totalBits: maxBits,
    }
  }

  // 'add' or 'increment'
  const effectiveBBit = operation === 'increment' ? 0 : bBit
  const ratchetTotal = (carryIn + aBit + effectiveBBit) as 0 | 1 | 2 | 3
  const sumBit = (ratchetTotal % 2) as 0 | 1
  const carryOut = (ratchetTotal >= 2 ? 1 : 0) as 0 | 1
  return {
    aBit,
    bBit: effectiveBBit,
    pawlStroke: 0,
    prevNotch: (carryIn + aBit) as 0 | 1 | 2 | 3,
    carryIn,
    ratchetTotal,
    sumBit,
    carryOut,
    bitIndex,
    totalBits: maxBits,
  }
}

function readResultFromTape(tape: Record<number, TapeSymbol>, eqPos: number, preserveLeadingZero = false): MachineResult {
  const bits = Object.keys(tape)
    .map(Number)
    .filter((pos) => pos > eqPos && (tape[pos] === '0' || tape[pos] === '1'))
    .sort((a, b) => a - b)
    .map((pos) => tape[pos])
    .join('')
  const binary = preserveLeadingZero ? bits || '0' : bits.replace(/^0+(?=\d)/, '') || '0'
  const value = BigInt(`0b${binary}`)
  return { binary, decimal: Number(value), octal: value.toString(8) }
}

function startBitReadA(
  snapshot: MachineSnapshot,
  program: MechanicalProgram,
  bitIndex: number,
  carryIn: 0 | 1,
  action?: PianoAction,
): MachineSnapshot {
  const { aPositions, bPositions, eqPos, onesPos, maxBits, separatorPos, expectedBits } = program
  const tape = bitIndex === 0 ? { ...snapshot.tape, [eqPos]: 'equals' as const } : snapshot.tape
  const nextGear = computeBitGear(
    snapshot.operation,
    tape,
    aPositions,
    bPositions,
    bitIndex,
    maxBits,
    carryIn,
    expectedBits,
  )
  const aIdx = aPositions.length - 1 - bitIndex
  const hasA = aIdx >= 0
  const aPos = hasA ? aPositions[aIdx] : aPositions[0]
  const isUnary = GEAR_SPECS[snapshot.operation].isUnary
  const afterARatchet = isUnary
    ? nextGear.ratchetTotal
    : snapshot.operation === 'subtract'
      ? nextGear.prevNotch
      : ((carryIn + nextGear.aBit) as 0 | 1 | 2 | 3)

  const scanAGear: GearState = {
    ...nextGear,
    bBit: 0,
    pawlStroke: hasA ? nextGear.aBit : 0,
    prevNotch: carryIn,
    ratchetTotal: afterARatchet,
    sumBit: isUnary ? nextGear.sumBit : ((afterARatchet % 2) as 0 | 1),
    carryOut: isUnary ? nextGear.carryOut : ((afterARatchet >= 2 ? 1 : 0) as 0 | 1),
    phase: 'READ_A',
    punching: false,
  }
  const bitLabel = formatBitPosition(bitIndex)
  const carryPrefix =
    snapshot.operation === 'increment' && bitIndex === 0
      ? 'Pre-loaded +1 Carry Latch advances ratchet to notch 1; '
      : carryIn === 1
        ? snapshot.operation === 'subtract'
          ? 'Previous borrow pulls ratchet −1 tooth; '
          : 'Previous carry advances ratchet to notch 1; '
        : bitIndex > 0
          ? 'Ratchet resets to 0; '
          : ''
  const message = hasA
    ? `① Read A's ${bitLabel} (pos ${aPos}): ${carryPrefix}feeler pin senses ${nextGear.aBit}, driving pawl pushes +${nextGear.aBit} tooth → locking pawl holds notch ${afterARatchet}.`
    : `① Read A's ${bitLabel}: no higher bit in A (treated as 0, +0 tooth); ${carryIn === 1 ? 'advanced by previous latch' : 'ratchet stays at notch 0'}.`

  return {
    ...snapshot,
    tape,
    state: 'SCAN',
    head: aPos,
    step: snapshot.step + 1,
    carry: carryIn,
    gear: scanAGear,
    error: undefined,
    result: undefined,
    program: {
      aPositions,
      bPositions,
      separatorPos,
      eqPos,
      onesPos,
      bitIndex,
      maxBits,
      expectedBits,
      gear: nextGear,
    },
    lastEvent: {
      state: 'SCAN',
      message,
      action,
    },
  }
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
  if (action === 'prevGear' || action === 'nextGear') {
    const idx = GEAR_MODES.indexOf(snapshot.operation)
    const delta = action === 'nextGear' ? 1 : -1
    const nextMode = GEAR_MODES[(idx + delta + GEAR_MODES.length) % GEAR_MODES.length]
    return selectGear(snapshot, nextMode)
  }
  if (action === 'reset') {
    const restartingAfterHalt = snapshot.halted
    return {
      ...snapshot,
      tape: restartingAfterHalt ? {} : inputOnlyTape(snapshot.tape),
      state: 'INPUT',
      head: 0,
      step: 0,
      carry: 0,
      halted: false,
      gear: undefined,
      result: undefined,
      error: undefined,
      program: undefined,
      lastEvent: {
        state: 'INPUT',
        message: restartingAfterHalt ? 'Result cleared; enter a new Tape input.' : 'Machine reset; Tape preserved.',
        action,
      },
    }
  }
  if (action === 'stop') {
    if (snapshot.program && !snapshot.halted) {
      return { ...snapshot, lastEvent: { state: snapshot.state, message: 'Paused by operator.', action } }
    }
    return { ...snapshot, halted: true, state: 'HALT', lastEvent: { state: 'HALT', message: 'Stopped by operator.', action } }
  }

  let tape = { ...snapshot.tape }
  let baseHead = snapshot.head
  const editingHaltedTape =
    snapshot.halted && ['write0', 'write1', 'writeSeparator', 'blank', 'moveLeft', 'moveRight'].includes(action)
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
  if (
    action === 'moveLeft' ||
    action === 'moveRight' ||
    action === 'write0' ||
    action === 'write1' ||
    action === 'writeSeparator' ||
    action === 'blank'
  ) {
    const nextHead = action === 'moveLeft' ? baseHead - 1 : action === 'moveRight' ? baseHead + 1 : baseHead
    return {
      ...snapshot,
      tape,
      head: nextHead,
      state: editingHaltedTape ? 'INPUT' : snapshot.state,
      halted: false,
      gear: editingHaltedTape ? undefined : snapshot.gear,
      result: editingHaltedTape ? undefined : snapshot.result,
      program: editingHaltedTape ? undefined : snapshot.program,
      error: undefined,
      lastEvent: {
        state: editingHaltedTape ? 'INPUT' : snapshot.state,
        message: editingHaltedTape ? `${pianoActionLabels[action]} Result Tape is editable.` : pianoActionLabels[action],
        action,
      },
    }
  }
  if (action === 'play' || action === 'step') {
    if (snapshot.program) {
      return action === 'step' ? runStep(snapshot) : snapshot
    }
    const cleanedTape = inputOnlyTape(snapshot.tape)
    const extracted = extractOperandPositions(snapshot.operation, cleanedTape)
    if (!extracted) {
      const parsed = parseOperationInput(snapshot.operation, tapeText(cleanedTape))
      return invalidInput(snapshot, parsed.ok ? 'Invalid tape input.' : parsed.error.message)
    }

    const { aPositions, bPositions, separatorPos, lastInputPos } = extracted
    const expected = computeExpectedResultBits(snapshot.operation, cleanedTape, aPositions, bPositions)
    if (!expected.ok) {
      return invalidInput(snapshot, expected.message)
    }

    const { bits: expectedBits, maxBits, hasFinalCarry } = expected
    const resultWidth = maxBits + (hasFinalCarry ? 1 : 0)
    const eqPos = lastInputPos + 1
    const onesPos = eqPos + resultWidth
    const initialCarry: 0 | 1 = snapshot.operation === 'increment' ? 1 : 0
    const initialGear = computeBitGear(
      snapshot.operation,
      cleanedTape,
      aPositions,
      bPositions,
      0,
      maxBits,
      initialCarry,
      expectedBits,
    )
    const initialProgram: MechanicalProgram = {
      aPositions,
      bPositions,
      separatorPos,
      eqPos,
      onesPos,
      bitIndex: 0,
      maxBits,
      expectedBits,
      gear: initialGear,
    }
    return startBitReadA({ ...snapshot, tape: cleanedTape }, initialProgram, 0, initialCarry, action)
  }
  return snapshot
}

function stampSumStep(snapshot: MachineSnapshot): MachineSnapshot {
  if (!snapshot.program) return snapshot
  const { eqPos, onesPos, bitIndex, maxBits, expectedBits, gear } = snapshot.program
  const bitLabel = formatBitPosition(bitIndex)
  const targetPos = onesPos - bitIndex
  const bit = (gear.sumBit === 1 ? '1' : '0') as '0' | '1'
  const tape = { ...snapshot.tape, [targetPos]: bit }
  const isLastInputBit = bitIndex >= maxBits - 1
  const hasFinalCarry = expectedBits.length > maxBits && expectedBits[0] === '1'
  const completelyDone = isLastInputBit && !hasFinalCarry
  const spec = GEAR_SPECS[snapshot.operation]
  const preserveLeadingZero = snapshot.operation === 'not'

  if (completelyDone) {
    return {
      ...snapshot,
      tape,
      head: targetPos,
      state: 'HALT',
      halted: true,
      carry: 0,
      gear: { ...gear, pawlStroke: 0, phase: 'STAMP_SUM', punching: true },
      step: snapshot.step + 1,
      result: readResultFromTape(tape, eqPos, preserveLeadingZero),
      lastEvent: {
        state: 'HALT',
        message: `③ ${spec.camLabel} stamps result's ${bitLabel} (pos ${targetPos}): ratchet notch ${gear.ratchetTotal} punches ${bit}; calculation complete!`,
      },
    }
  }

  const nextHint = isLastInputBit
    ? ` (${spec.latchLabel} LOCK 1 ready to release for MSB)`
    : gear.carryOut === 1
      ? ` (${spec.latchLabel} LOCK 1 held for ${formatBitPosition(bitIndex + 1)})`
      : ` (stepping left to ${formatBitPosition(bitIndex + 1)})`

  return {
    ...snapshot,
    tape,
    head: targetPos,
    state: 'WRITE',
    carry: gear.carryOut,
    gear: { ...gear, pawlStroke: 0, phase: 'STAMP_SUM', punching: true },
    step: snapshot.step + 1,
    lastEvent: {
      state: 'WRITE',
      message: `③ ${spec.camLabel} stamps result's ${bitLabel} (pos ${targetPos}): ratchet notch ${gear.ratchetTotal} punches ${bit}${nextHint}.`,
    },
  }
}

export function runStep(snapshot: MachineSnapshot): MachineSnapshot {
  if (snapshot.halted || !snapshot.program) return snapshot
  const { bPositions, separatorPos, eqPos, onesPos, bitIndex, maxBits, gear } = snapshot.program
  const bitLabel = formatBitPosition(bitIndex)
  const isUnary = GEAR_SPECS[snapshot.operation].isUnary

  // Unary gears skip READ_B and go directly from SCAN (READ_A) to STAMP_SUM
  if (snapshot.state === 'SCAN' && isUnary) {
    return stampSumStep(snapshot)
  }

  // Step 1 -> Step 2: READ_A -> READ_B (Binary gears)
  if (snapshot.state === 'SCAN') {
    const bIdx = bPositions.length - 1 - bitIndex
    const hasB = bIdx >= 0
    const bPos = hasB ? bPositions[bIdx] : separatorPos
    const prevNotch = gear.prevNotch
    const pawlStroke: -1 | 0 | 1 = hasB ? (snapshot.operation === 'subtract' ? (-gear.bBit as -1 | 0) : gear.bBit) : 0
    const strokeText =
      snapshot.operation === 'subtract'
        ? `pulls −${gear.bBit} tooth`
        : snapshot.operation === 'multiply'
          ? gear.bBit === 1
            ? 'engages multiplier clutch (+A)'
            : 'slips clutch (+0)'
          : `pushes +${gear.bBit} tooth`
    const latchNote = gear.carryOut
      ? snapshot.operation === 'subtract'
        ? ', locking Borrow Latch (LOCK 1)'
        : ', locking Carry Latch (LOCK 1)'
      : ''
    const message = hasB
      ? `② Read B's ${bitLabel} (pos ${bPos}): feeler pin senses ${gear.bBit}, ${strokeText} → ratchet moves from notch ${prevNotch} to ${gear.ratchetTotal}${latchNote}.`
      : `② Read B's ${bitLabel}: no higher bit in B (treated as 0, +0 tooth) → ratchet stays at notch ${gear.ratchetTotal}${latchNote}.`

    return {
      ...snapshot,
      state: 'ADD',
      head: bPos,
      carry: gear.carryOut,
      gear: {
        ...gear,
        pawlStroke,
        prevNotch,
        phase: 'READ_B',
        punching: false,
      },
      step: snapshot.step + 1,
      lastEvent: {
        state: 'ADD',
        message,
      },
    }
  }

  // Step 2 -> Step 3: READ_B -> STAMP_SUM
  if (snapshot.state === 'ADD') {
    return stampSumStep(snapshot)
  }

  // In state === 'WRITE': either move to next bitIndex (READ_A), or if all bits read and carryOut === 1, stamp final carry!
  if (bitIndex + 1 < maxBits) {
    return startBitReadA(snapshot, snapshot.program, bitIndex + 1, gear.carryOut)
  }

  // Step 3 -> Step 4: Final carry release (STAMP_CARRY) at bitIndex = maxBits
  const targetPos = onesPos - maxBits
  const tape = { ...snapshot.tape, [targetPos]: '1' as const }
  const carryBitLabel = formatBitPosition(maxBits)
  return {
    ...snapshot,
    tape,
    head: targetPos,
    state: 'HALT',
    halted: true,
    carry: 0,
    gear: {
      ...gear,
      pawlStroke: 0,
      carryOut: 0,
      ratchetTotal: 0,
      bitIndex: maxBits,
      phase: 'STAMP_CARRY',
      punching: true,
    },
    step: snapshot.step + 1,
    result: readResultFromTape(tape, eqPos),
    lastEvent: {
      state: 'HALT',
      message: `④ Release Latch (result's ${carryBitLabel}, pos ${targetPos}): head steps left, latch springs back to FREE 0 and punches final MSB 1. Calculation complete!`,
    },
  }
}
