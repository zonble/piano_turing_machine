import { describe, expect, it } from 'vitest'
import { applyPianoAction, createInitialMachine, octalTapeText, pianoActions, runStep, tapeText, type PianoAction } from './machine'

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

  it('exposes the simple physical keyboard mapping', () => {
    expect(pianoActions.y).toBe('write1')
    expect(pianoActions.z).toBe('setState0')
    expect(pianoActions.r).toBe('moveRight')
    expect(pianoActions.i).toBe('writeSeparator')
    expect(pianoActions.p).toBe('play')
    expect(pianoActions.a).toBe('stop')
    expect(pianoActions.s).toBe('reset')
  })

  it('decomposes 1#1 into 5 mechanical steps: read A, read B, ring bell & stamp =, stamp ones 0, release carry & stamp twos 1', () => {
    const inputMachine = enterOnePlusOne()
    // During INPUT, gear is not engaged yet
    expect(inputMachine.gear).toBeUndefined()

    // Step 1 (play -> SCAN / READ_A): head at 0, ratchet advances to 1
    let m = applyPianoAction(inputMachine, 'play')
    expect(m.state).toBe('SCAN')
    expect(m.head).toBe(0)
    expect(m.gear?.ratchetTotal).toBe(1)
    expect(m.gear?.phase).toBe('READ_A')

    // Step 2 (SCAN -> ADD / READ_B): head at 2, ratchet advances to 2, carry latch locks 1
    m = runStep(m)
    expect(m.state).toBe('ADD')
    expect(m.head).toBe(2)
    expect(m.gear?.ratchetTotal).toBe(2)
    expect(m.gear?.carryOut).toBe(1)
    expect(m.carry).toBe(1)
    expect(m.gear?.phase).toBe('READ_B')

    // Step 3 (ADD -> CARRY / BELL_EQ): rings bell, head at 3, stamps '='
    m = runStep(m)
    expect(m.state).toBe('CARRY')
    expect(m.head).toBe(3)
    expect(m.tape[3]).toBe('equals')
    expect(m.gear?.bellRung).toBe(true)
    expect(m.gear?.phase).toBe('BELL_EQ')

    // Step 4 (CARRY -> WRITE / STAMP_SUM): head moves to ones place (5), stamps '0'
    m = runStep(m)
    expect(m.state).toBe('WRITE')
    expect(m.head).toBe(5)
    expect(m.tape[5]).toBe('0')
    expect(m.halted).toBe(false)
    expect(m.gear?.phase).toBe('STAMP_SUM')

    // Step 5 (WRITE -> HALT / STAMP_CARRY): head steps left to twos place (4), releases carry latch, stamps '1'
    m = runStep(m)
    expect(m.state).toBe('HALT')
    expect(m.halted).toBe(true)
    expect(m.head).toBe(4)
    expect(m.tape[4]).toBe('1')
    expect(m.carry).toBe(0)
    expect(m.gear?.phase).toBe('STAMP_CARRY')
    expect(tapeText(m.tape)).toBe('1#1=10')
  })

  it('formats binary tape text into octal tape text (e.g. 101#1000=1101 -> 5#10=15)', () => {
    expect(octalTapeText('101#1000=1101')).toBe('5#10=15')
    expect(octalTapeText('1#1=10')).toBe('1#1=2')
    expect(octalTapeText('')).toBe('')
  })
})
