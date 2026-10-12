import { parseOperationInput } from './operations'

export type TapeSymbol = '0' | '1' | 'separator' | 'equals'
export type StateId = 'INPUT' | 'SCAN' | 'ADD' | 'CARRY' | 'WRITE' | 'HALT' | 'q0' | 'q1' | 'q2' | 'q3' | 'q4' | 'q5'
export type PianoAction = 'write0' | 'write1' | 'writeSeparator' | 'blank' | 'moveLeft' | 'moveRight' | 'step' | 'play' | 'stop' | 'reset'
export type MachineResult = { binary: string; decimal: number; octal: string }
export type MachineEvent = { state: StateId; message: string; action?: PianoAction }
export type MechanicalPhase = 'READ_A' | 'READ_B' | 'STAMP_SUM' | 'STAMP_CARRY'
export type GearState = {
  aBit: 0 | 1
  bBit: 0 | 1
  pawlStroke: 0 | 1
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

export type MechanicalProgram = {
  aPositions: number[]
  bPositions: number[]
  separatorPos: number
  eqPos: number
  onesPos: number
  bitIndex: number
  maxBits: number
  gear: GearState
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

export function createInitialMachine(): MachineSnapshot {
  return { operation: 'add', tape: {}, head: 0, state: 'INPUT', step: 0, carry: 0, halted: false }
}

function invalidInput(snapshot: MachineSnapshot): MachineSnapshot {
  const parsed = parseOperationInput('add', tapeText(snapshot.tape))
  if (parsed.ok) return snapshot
  return { ...snapshot, error: parsed.error.message, lastEvent: { state: snapshot.state, message: parsed.error.message } }
}

function trimLeadingZeroPositions(tape: Record<number, TapeSymbol>, positions: number[]): number[] {
  let idx = 0
  while (idx < positions.length - 1 && tape[positions[idx]] === '0') {
    idx += 1
  }
  return positions.slice(idx)
}

function extractOperandPositions(tape: Record<number, TapeSymbol>): {
  aPositions: number[]
  bPositions: number[]
  separatorPos: number
  lastInputPos: number
} | undefined {
  const positions = Object.keys(tape)
    .map(Number)
    .filter((pos) => tape[pos] === '0' || tape[pos] === '1' || tape[pos] === 'separator')
    .sort((a, b) => a - b)
  const separatorPos = positions.find((pos) => tape[pos] === 'separator')
  if (separatorPos === undefined) return undefined
  const rawA = positions.filter((pos) => pos < separatorPos && (tape[pos] === '0' || tape[pos] === '1'))
  const rawB = positions.filter((pos) => pos > separatorPos && (tape[pos] === '0' || tape[pos] === '1'))
  if (rawA.length === 0 || rawB.length === 0) return undefined
  const aPositions = trimLeadingZeroPositions(tape, rawA)
  const bPositions = trimLeadingZeroPositions(tape, rawB)
  const lastInputPos = positions[positions.length - 1]
  return { aPositions, bPositions, separatorPos, lastInputPos }
}

function computeBitGear(
  tape: Record<number, TapeSymbol>,
  aPositions: number[],
  bPositions: number[],
  bitIndex: number,
  maxBits: number,
  carryIn: 0 | 1,
): GearState {
  const aIdx = aPositions.length - 1 - bitIndex
  const bIdx = bPositions.length - 1 - bitIndex
  const aBit = (aIdx >= 0 && tape[aPositions[aIdx]] === '1' ? 1 : 0) as 0 | 1
  const bBit = (bIdx >= 0 && tape[bPositions[bIdx]] === '1' ? 1 : 0) as 0 | 1
  const ratchetTotal = (carryIn + aBit + bBit) as 0 | 1 | 2 | 3
  const sumBit = (ratchetTotal % 2) as 0 | 1
  const carryOut = (ratchetTotal >= 2 ? 1 : 0) as 0 | 1
  return {
    aBit,
    bBit,
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

function computeResultWidth(
  tape: Record<number, TapeSymbol>,
  aPositions: number[],
  bPositions: number[],
  maxBits: number,
): number {
  let carry: 0 | 1 = 0
  for (let i = 0; i < maxBits; i += 1) {
    const g = computeBitGear(tape, aPositions, bPositions, i, maxBits, carry)
    carry = g.carryOut
  }
  return maxBits + carry
}

function readResultFromTape(tape: Record<number, TapeSymbol>, eqPos: number): MachineResult {
  const bits = Object.keys(tape)
    .map(Number)
    .filter((pos) => pos > eqPos && (tape[pos] === '0' || tape[pos] === '1'))
    .sort((a, b) => a - b)
    .map((pos) => tape[pos])
    .join('')
  const binary = bits.replace(/^0+(?=\d)/, '') || '0'
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
  const { aPositions, bPositions, eqPos, onesPos, maxBits, separatorPos } = program
  const tape = bitIndex === 0 ? { ...snapshot.tape, [eqPos]: 'equals' as const } : snapshot.tape
  const nextGear = computeBitGear(tape, aPositions, bPositions, bitIndex, maxBits, carryIn)
  const aIdx = aPositions.length - 1 - bitIndex
  const hasA = aIdx >= 0
  const aPos = hasA ? aPositions[aIdx] : aPositions[0]
  const afterARatchet = (carryIn + nextGear.aBit) as 0 | 1 | 2 | 3
  const scanAGear: GearState = {
    ...nextGear,
    bBit: 0,
    pawlStroke: hasA ? nextGear.aBit : 0,
    prevNotch: carryIn,
    ratchetTotal: afterARatchet,
    sumBit: (afterARatchet % 2) as 0 | 1,
    carryOut: (afterARatchet >= 2 ? 1 : 0) as 0 | 1,
    phase: 'READ_A',
    punching: false,
  }
  const bitLabel = formatBitPosition(bitIndex)
  const carryPrefix = carryIn === 1 ? 'Previous carry advances ratchet to notch 1; ' : bitIndex > 0 ? 'Ratchet resets to 0; ' : ''
  const message = hasA
    ? `① Read A's ${bitLabel} (pos ${aPos}): ${carryPrefix}feeler pin senses ${nextGear.aBit}, driving pawl pushes +${nextGear.aBit} tooth → locking pawl holds notch ${afterARatchet}.`
    : `① Read A's ${bitLabel}: no higher bit in A (treated as 0, +0 tooth); ${carryIn === 1 ? 'advanced to notch 1 by previous carry' : 'ratchet stays at notch 0'}.`

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
  if (action === 'reset') {
    const restartingAfterHalt = snapshot.halted
    return { ...snapshot, tape: restartingAfterHalt ? {} : inputOnlyTape(snapshot.tape), state: 'INPUT', head: 0, step: 0, carry: 0, halted: false, gear: undefined, result: undefined, error: undefined, program: undefined, lastEvent: { state: 'INPUT', message: restartingAfterHalt ? 'Result cleared; enter a new Tape input.' : 'Machine reset; Tape preserved.', action } }
  }
  if (action === 'stop') {
    if (snapshot.program && !snapshot.halted) {
      return { ...snapshot, lastEvent: { state: snapshot.state, message: 'Paused by operator.', action } }
    }
    return { ...snapshot, halted: true, state: 'HALT', lastEvent: { state: 'HALT', message: 'Stopped by operator.', action } }
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
    const parsed = parseOperationInput('add', text)
    const extracted = extractOperandPositions(snapshot.tape)
    if (!parsed.ok || !extracted) return invalidInput(snapshot)

    const { aPositions, bPositions, separatorPos, lastInputPos } = extracted
    const maxBits = Math.max(aPositions.length, bPositions.length)
    const resultWidth = computeResultWidth(snapshot.tape, aPositions, bPositions, maxBits)
    const eqPos = lastInputPos + 1
    const onesPos = eqPos + resultWidth
    const initialGear = computeBitGear(snapshot.tape, aPositions, bPositions, 0, maxBits, 0)
    const initialProgram: MechanicalProgram = {
      aPositions,
      bPositions,
      separatorPos,
      eqPos,
      onesPos,
      bitIndex: 0,
      maxBits,
      gear: initialGear,
    }
    return startBitReadA(snapshot, initialProgram, 0, 0, action)
  }
  return snapshot
}

export function runStep(snapshot: MachineSnapshot): MachineSnapshot {
  if (snapshot.halted || !snapshot.program) return snapshot
  const { aPositions, bPositions, separatorPos, eqPos, onesPos, bitIndex, maxBits, gear } = snapshot.program
  const bitLabel = formatBitPosition(bitIndex)

  // Step 1 -> Step 2: READ_A -> READ_B
  if (snapshot.state === 'SCAN') {
    const bIdx = bPositions.length - 1 - bitIndex
    const hasB = bIdx >= 0
    const bPos = hasB ? bPositions[bIdx] : separatorPos
    const prevNotch = (gear.carryIn + gear.aBit) as 0 | 1 | 2 | 3
    const pawlStroke: 0 | 1 = hasB ? gear.bBit : 0
    const message = hasB
      ? `② Read B's ${bitLabel} (pos ${bPos}): feeler pin senses ${gear.bBit}, same driving pawl pushes +${gear.bBit} tooth → ratchet advances from notch ${prevNotch} to ${gear.ratchetTotal}${gear.carryOut ? ', locking Carry Latch (LOCK 1)' : ''}.`
      : `② Read B's ${bitLabel}: no higher bit in B (treated as 0, +0 tooth) → ratchet stays at notch ${gear.ratchetTotal}${gear.carryOut ? ', locking Carry Latch (LOCK 1)' : ''}.`

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

  // Step 2 -> Step 3: READ_B -> STAMP_SUM (stamp current bit's sumBit)
  if (snapshot.state === 'ADD') {
    const targetPos = onesPos - bitIndex
    const bit = (gear.sumBit === 1 ? '1' : '0') as '0' | '1'
    const tape = { ...snapshot.tape, [targetPos]: bit }
    const isLastInputBit = bitIndex >= maxBits - 1
    const completelyDone = isLastInputBit && gear.carryOut === 0

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
        result: readResultFromTape(tape, eqPos),
        lastEvent: {
          state: 'HALT',
          message: `③ Odd-even cam stamps sum's ${bitLabel} (pos ${targetPos}): ratchet notch ${gear.ratchetTotal} (${gear.sumBit === 1 ? 'odd lobe' : 'even valley'}) punches ${bit}; no carry out, calculation complete!`,
        },
      }
    }

    const nextHint = isLastInputBit
      ? ' (Carry Latch LOCK 1 ready to release for MSB)'
      : gear.carryOut === 1
        ? ` (Carry Latch LOCK 1 held for ${formatBitPosition(bitIndex + 1)})`
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
        message: `③ Odd-even cam stamps sum's ${bitLabel} (pos ${targetPos}): ratchet notch ${gear.ratchetTotal} (${gear.sumBit === 1 ? 'odd lobe' : 'even valley'}) punches ${bit}${nextHint}.`,
      },
    }
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
      message: `④ Release Carry Latch (sum's ${carryBitLabel}, pos ${targetPos}): head steps left, latch springs back to FREE 0 and punches final carry 1. Calculation complete!`,
    },
  }
}
