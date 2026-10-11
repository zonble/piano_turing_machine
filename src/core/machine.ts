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
  pawlStroke: 0 | 1
  prevNotch: 0 | 1 | 2 | 3
  carryIn: 0 | 1
  ratchetTotal: 0 | 1 | 2 | 3
  sumBit: 0 | 1
  carryOut: 0 | 1
  bitIndex?: number
  totalBits?: number
  phase?: MechanicalPhase
  bellRung?: boolean
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

const superscriptDigits = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

function toSuperscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => superscriptDigits[Number(d)] ?? d)
    .join('')
}

export function formatBitPosition(bitIndex: number): string {
  const sup = `2${toSuperscript(bitIndex)}`
  return bitIndex === 0 ? `第 0 bit（個位 ${sup}）` : `第 ${bitIndex} bit（${sup} 位）`
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
  const nextGear = computeBitGear(snapshot.tape, aPositions, bPositions, bitIndex, maxBits, carryIn)
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
    bellRung: false,
    punching: false,
  }
  const bitLabel = formatBitPosition(bitIndex)
  const carryPrefix = carryIn === 1 ? '上一位進位栓先將棘輪推至第 1 格，' : bitIndex > 0 ? '棘輪歸零後，' : ''
  const message = hasA
    ? `① 讀取 A 的${bitLabel}（位置 ${aPos}）：${carryPrefix}探針讀到 ${nextGear.aBit}，推進爪推 +${nextGear.aBit} 齒 → 止回爪鎖定第 ${afterARatchet} 格。`
    : `① 讀取 A 的${bitLabel}：A 無此高位（視為 0，+0 齒），${carryIn === 1 ? '由上一位進位栓推至第 1 格' : '棘輪維持第 0 格'}。`

  return {
    ...snapshot,
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
      const targetPhase: MechanicalPhase =
        stageNum === 1
          ? 'READ_A'
          : stageNum === 2
            ? 'READ_B'
            : stageNum === 3
              ? 'BELL_EQ'
              : stageNum === 4
                ? 'STAMP_SUM'
                : 'STAMP_CARRY'
      while (!current.halted && current.gear?.phase !== targetPhase) {
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
      ? `② 讀取 B 的${bitLabel}（位置 ${bPos}）：探針讀到 ${gear.bBit}，同一支推進爪再推 +${gear.bBit} 齒 → 棘輪從第 ${prevNotch} 格推至第 ${gear.ratchetTotal} 格${gear.carryOut ? '，頂出進位栓 LOCK 1' : ''}。`
      : `② 讀取 B 的${bitLabel}：B 無此高位（視為 0，+0 齒）→ 棘輪維持在第 ${gear.ratchetTotal} 格${gear.carryOut ? '，頂出進位栓 LOCK 1' : ''}。`

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
        bellRung: false,
        punching: false,
      },
      step: snapshot.step + 1,
      lastEvent: {
        state: 'ADD',
        message,
      },
    }
  }

  // On bit 0, after READ_B we ring the bell and stamp '=' at eqPos
  if (snapshot.state === 'ADD' && bitIndex === 0) {
    const tape = { ...snapshot.tape, [eqPos]: 'equals' as const }
    return {
      ...snapshot,
      tape,
      state: 'CARRY',
      head: eqPos,
      carry: gear.carryOut,
      gear: { ...gear, pawlStroke: 0, prevNotch: gear.ratchetTotal, phase: 'BELL_EQ', bellRung: true, punching: true },
      step: snapshot.step + 1,
      lastEvent: {
        state: 'CARRY',
        message: `③ 當——！讀完${bitLabel}，推進爪彈回待命、止回爪鎖定第 ${gear.ratchetTotal} 格，在位置 ${eqPos} 打孔印下「=」。`,
      },
    }
  }

  // Stamp current bit's sumBit (after BELL_EQ on bit 0, or directly after READ_B on bitIndex >= 1)
  if (snapshot.state === 'CARRY' || (snapshot.state === 'ADD' && bitIndex > 0)) {
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
        gear: { ...gear, pawlStroke: 0, phase: 'STAMP_SUM', bellRung: false, punching: true },
        step: snapshot.step + 1,
        result: readResultFromTape(tape, eqPos),
        lastEvent: {
          state: 'HALT',
          message: `④ 奇偶凸輪打孔（結果的${bitLabel}，位置 ${targetPos}）：棘輪第 ${gear.ratchetTotal} 格（${gear.sumBit === 1 ? '奇數凸齒' : '偶數凹槽'}）印下 ${bit}，無進位，算式完成！`,
        },
      }
    }

    const nextHint = isLastInputBit
      ? '（進位栓 LOCK 1 準備釋放印最高位）'
      : gear.carryOut === 1
        ? `（進位栓 LOCK 1 留給${formatBitPosition(bitIndex + 1)}）`
        : `（繼續往左算${formatBitPosition(bitIndex + 1)}）`

    return {
      ...snapshot,
      tape,
      head: targetPos,
      state: 'WRITE',
      carry: gear.carryOut,
      gear: { ...gear, pawlStroke: 0, phase: 'STAMP_SUM', bellRung: false, punching: true },
      step: snapshot.step + 1,
      lastEvent: {
        state: 'WRITE',
        message: `④ 奇偶凸輪打孔（結果的${bitLabel}，位置 ${targetPos}）：棘輪第 ${gear.ratchetTotal} 格（${gear.sumBit === 1 ? '奇數凸齒' : '偶數凹槽'}）印下 ${bit}${nextHint}。`,
      },
    }
  }

  // In state === 'WRITE': either move to next bitIndex (READ_A), or if all bits read and carryOut === 1, stamp final carry!
  if (bitIndex + 1 < maxBits) {
    return startBitReadA(snapshot, snapshot.program, bitIndex + 1, gear.carryOut)
  }

  // Final carry release (STAMP_CARRY) at bitIndex = maxBits
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
      bellRung: false,
      punching: true,
    },
    step: snapshot.step + 1,
    result: readResultFromTape(tape, eqPos),
    lastEvent: {
      state: 'HALT',
      message: `⑤ 釋放進位栓（結果的${carryBitLabel}，位置 ${targetPos}）：讀寫頭往左退一格，進位栓彈回 FREE 0 並打孔印下最高位進位 1，算式完成！`,
    },
  }
}
