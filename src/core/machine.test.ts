import { describe, expect, it } from 'vitest'
import { applyPianoAction, createInitialMachine, octalTapeText, pianoActions, runStep, selectGear, tapeText, type PianoAction } from './machine'

const enterOnePlusOne = () => {
  let machine = createInitialMachine()
  const actions: PianoAction[] = ['write1', 'moveRight', 'writeSeparator', 'moveRight', 'write1']
  for (const action of actions) machine = applyPianoAction(machine, action)
  return machine
}

describe('piano-first machine', () => {
  it('starts in ADD input mode with an empty tape', () => {
    const machine = createInitialMachine()
    expect(machine.operation).toBe('add')
    expect(machine.tape).toEqual({})
    expect(machine.head).toBe(0)
    expect(machine.state).toBe('INPUT')
  })

  it('uses piano actions to enter 1#1', () => {
    const machine = enterOnePlusOne()
    expect(tapeText(machine.tape)).toBe('1#1')
    expect(machine.head).toBe(2)
    expect(machine.state).toBe('INPUT')
  })

  it('plays the current tape and reaches 1#1=10 in HALT', () => {
    let machine = applyPianoAction(enterOnePlusOne(), 'play')
    expect(machine.state).toBe('SCAN')
    while (!machine.halted) machine = runStep(machine)
    expect(tapeText(machine.tape)).toBe('1#1=10')
    expect(machine.state).toBe('HALT')
    expect(machine.result).toEqual({ binary: '10', decimal: 2, octal: '2' })
  })

  it('clears the finished result when reset starts a new run', () => {
    let machine = applyPianoAction(enterOnePlusOne(), 'play')
    while (!machine.halted) machine = runStep(machine)
    machine = applyPianoAction(machine, 'reset')
    expect(machine.tape).toEqual({})
    expect(machine.state).toBe('INPUT')
    expect(machine.halted).toBe(false)
  })

  it('can edit a finished result and use it as the next operand', () => {
    let machine = applyPianoAction(enterOnePlusOne(), 'play')
    while (!machine.halted) machine = runStep(machine)
    for (const action of ['moveRight', 'writeSeparator', 'moveRight', 'write1'] as PianoAction[]) machine = applyPianoAction(machine, action)
    expect(tapeText(machine.tape)).toBe('10#1')
    machine = applyPianoAction(machine, 'play')
    while (!machine.halted) machine = runStep(machine)
    expect(machine.result?.binary).toBe('11')
    expect(tapeText(machine.tape)).toBe('10#1=11')
  })

  it('exposes the single-octave physical keyboard mapping', () => {
    expect(pianoActions.a).toBe('moveLeft')
    expect(pianoActions.s).toBe('moveRight')
    expect(pianoActions.d).toBe('write1')
    expect(pianoActions.f).toBe('write0')
    expect(pianoActions.g).toBe('blank')
    expect(pianoActions.h).toBe('writeSeparator')
    expect(pianoActions.w).toBe('step')
    expect(pianoActions.e).toBe('reset')
    expect(pianoActions.t).toBe('play')
    expect(pianoActions.y).toBe('stop')
  })

  it('decomposes 1#1 into 4 mechanical steps: read A, read B, stamp ones 0, release carry & stamp twos 1', () => {
    const inputMachine = enterOnePlusOne()
    // During INPUT, gear is not engaged yet
    expect(inputMachine.gear).toBeUndefined()

    // Step 1 (play -> SCAN / READ_A): head at 0, driving pawl strokes +1, ratchet advances 0 -> 1
    let m = applyPianoAction(inputMachine, 'play')
    expect(m.state).toBe('SCAN')
    expect(m.head).toBe(0)
    expect(m.tape[3]).toBe('equals')
    expect(m.gear?.pawlStroke).toBe(1)
    expect(m.gear?.prevNotch).toBe(0)
    expect(m.gear?.ratchetTotal).toBe(1)
    expect(m.gear?.phase).toBe('READ_A')

    // Step 2 (SCAN -> ADD / READ_B): head at 2, same driving pawl strokes +1 again, ratchet advances 1 -> 2, carry latch locks 1
    m = runStep(m)
    expect(m.state).toBe('ADD')
    expect(m.head).toBe(2)
    expect(m.gear?.pawlStroke).toBe(1)
    expect(m.gear?.prevNotch).toBe(1)
    expect(m.gear?.ratchetTotal).toBe(2)
    expect(m.gear?.carryOut).toBe(1)
    expect(m.carry).toBe(1)
    expect(m.gear?.phase).toBe('READ_B')

    // Step 3 (ADD -> WRITE / STAMP_SUM): head moves to ones place (5), stamps '0'
    m = runStep(m)
    expect(m.state).toBe('WRITE')
    expect(m.head).toBe(5)
    expect(m.tape[5]).toBe('0')
    expect(m.halted).toBe(false)
    expect(m.gear?.pawlStroke).toBe(0)
    expect(m.gear?.phase).toBe('STAMP_SUM')

    // Step 4 (WRITE -> HALT / STAMP_CARRY): head steps left to twos place (4), releases carry latch, stamps '1'
    m = runStep(m)
    expect(m.state).toBe('HALT')
    expect(m.halted).toBe(true)
    expect(m.head).toBe(4)
    expect(m.tape[4]).toBe('1')
    expect(m.carry).toBe(0)
    expect(m.gear?.pawlStroke).toBe(0)
    expect(m.gear?.ratchetTotal).toBe(0)
    expect(m.gear?.phase).toBe('STAMP_CARRY')
    expect(tapeText(m.tape)).toBe('1#1=10')
  })

  it('formats binary tape text into octal tape text (e.g. 101#1000=1101 -> 5#10=15)', () => {
    expect(octalTapeText('101#1000=1101')).toBe('5#10=15')
    expect(octalTapeText('1#1=10')).toBe('1#1=2')
    expect(octalTapeText('')).toBe('')
  })

  it('can step manually with the step action directly from INPUT without pressing play first', () => {
    let m = enterOnePlusOne()
    expect(m.state).toBe('INPUT')

    m = applyPianoAction(m, 'step') // Step 1: READ_A
    expect(m.state).toBe('SCAN')
    expect(m.gear?.phase).toBe('READ_A')

    m = applyPianoAction(m, 'step') // Step 2: READ_B
    expect(m.state).toBe('ADD')
    expect(m.gear?.phase).toBe('READ_B')

    m = applyPianoAction(m, 'step') // Step 3: STAMP_SUM
    expect(m.state).toBe('WRITE')
    expect(m.gear?.phase).toBe('STAMP_SUM')

    m = applyPianoAction(m, 'step') // Step 4: STAMP_CARRY -> HALT
    expect(m.state).toBe('HALT')
    expect(m.halted).toBe(true)
    expect(tapeText(m.tape)).toBe('1#1=10')
  })

  it('pauses and resumes cleanly using stop (pause) and play/step', () => {
    let m = applyPianoAction(enterOnePlusOne(), 'play')
    expect(m.state).toBe('SCAN')
    expect(m.gear?.phase).toBe('READ_A')

    m = applyPianoAction(m, 'stop')
    expect(m.state).toBe('SCAN')
    expect(m.gear?.phase).toBe('READ_A')

    // play resumes from the paused state without skipping a step
    m = applyPianoAction(m, 'play')
    expect(m.state).toBe('SCAN')
    expect(m.gear?.phase).toBe('READ_A')

    // step advances to the next mechanical stage
    m = applyPianoAction(m, 'step')
    expect(m.state).toBe('ADD')
    expect(m.gear?.phase).toBe('READ_B')
  })

  it('steps through multi-bit addition (101101#11) bit-by-bit from right to left with detailed bit explanations', () => {
    let m = createInitialMachine()
    const raw = '101101#11'
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i]
      m = applyPianoAction(m, ch === '1' ? 'write1' : ch === '0' ? 'write0' : 'writeSeparator')
      if (i < raw.length - 1) m = applyPianoAction(m, 'moveRight')
    }
    expect(tapeText(m.tape)).toBe('101101#11')

    // Bit 0 (ones 2⁰): reads A at pos 5 ('1'), then B at pos 8 ('1')
    m = applyPianoAction(m, 'play')
    expect(m.head).toBe(5)
    expect(m.tape[9]).toBe('equals')
    expect(m.gear?.bitIndex).toBe(0)
    expect(m.gear?.ratchetTotal).toBe(1)
    expect(m.lastEvent?.message).toContain("Read A's bit 0 (ones 2⁰)")

    m = runStep(m) // READ_B bit 0 at pos 8 ('1')
    expect(m.head).toBe(8)
    expect(m.gear?.bitIndex).toBe(0)
    expect(m.gear?.ratchetTotal).toBe(2)
    expect(m.gear?.carryOut).toBe(1)
    expect(m.lastEvent?.message).toContain("Read B's bit 0 (ones 2⁰)")

    m = runStep(m) // STAMP_SUM bit 0 at pos 15 ('0')
    expect(m.head).toBe(15)
    expect(m.tape[15]).toBe('0')

    // Bit 1 (2¹ place): carries 1 in, reads A at pos 4 ('0') -> ratchet at 1
    m = runStep(m)
    expect(m.head).toBe(4)
    expect(m.gear?.bitIndex).toBe(1)
    expect(m.gear?.carryIn).toBe(1)
    expect(m.gear?.ratchetTotal).toBe(1)
    expect(m.lastEvent?.message).toContain("Read A's bit 1 (2¹ place)")

    // Finish remaining steps and verify every bit of 101101 + 11 = 110000 (45 + 3 = 48)
    while (!m.halted) {
      m = runStep(m)
    }
    expect(tapeText(m.tape)).toBe('101101#11=110000')
    expect(m.result).toEqual({ binary: '110000', decimal: 48, octal: '60' })
  })

  it('cycles gears via nextGear (j) and prevGear (u) piano actions', () => {
    expect(pianoActions.u).toBe('prevGear')
    expect(pianoActions.j).toBe('nextGear')

    let m = createInitialMachine()
    expect(m.operation).toBe('add')
    m = applyPianoAction(m, 'nextGear')
    expect(m.operation).toBe('subtract')
    m = applyPianoAction(m, 'prevGear')
    expect(m.operation).toBe('add')
  })

  it.each([
    ['subtract', '101#11', '101#11=010', '10', 2],
    ['multiply', '11#10', '11#10=110', '110', 6],
    ['and', '110#101', '110#101=100', '100', 4],
    ['or', '110#101', '110#101=111', '111', 7],
    ['xor', '110#101', '110#101=011', '11', 3],
    ['increment', '1011', '1011=1100', '1100', 12],
    ['shift', '101', '101=1010', '1010', 10],
    ['not', '1010', '1010=0101', '0101', 5],
  ] as const)('executes replaceable gear %s on %s -> %s', (gear, raw, expectedTape, expectedBin, expectedDec) => {
    let m = selectGear(createInitialMachine(), gear)
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i]
      m = applyPianoAction(m, ch === '1' ? 'write1' : ch === '0' ? 'write0' : 'writeSeparator')
      if (i < raw.length - 1) m = applyPianoAction(m, 'moveRight')
    }
    m = applyPianoAction(m, 'play')
    while (!m.halted) {
      m = runStep(m)
    }
    expect(tapeText(m.tape)).toBe(expectedTape)
    expect(m.result?.binary).toBe(expectedBin)
    expect(m.result?.decimal).toBe(expectedDec)
  })
})
