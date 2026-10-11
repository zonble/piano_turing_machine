import { describe, expect, it } from 'vitest'
import { applyPianoAction, createInitialMachine, pianoActions, runStep, tapeText, type PianoAction } from './machine'

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

  it('plays the current tape and reaches 10 in HALT', () => {
    let machine = applyPianoAction(enterOnePlusOne(), 'play')
    expect(machine.state).toBe('SCAN')
    while (!machine.halted) machine = runStep(machine)
    expect(tapeText(machine.tape)).toBe('10')
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

  it('steps the 4-notch mechanical adder gear accurately for 1#1 and 1#0', () => {
    let onePlusOne = applyPianoAction(enterOnePlusOne(), 'play')
    onePlusOne = runStep(onePlusOne) // SCAN -> ADD
    expect(onePlusOne.state).toBe('ADD')
    expect(onePlusOne.gear).toEqual({
      aBit: 1,
      bBit: 1,
      carryIn: 0,
      ratchetTotal: 2,
      sumBit: 0,
      carryOut: 1,
    })
    onePlusOne = runStep(onePlusOne) // ADD -> CARRY
    expect(onePlusOne.state).toBe('CARRY')
    expect(onePlusOne.carry).toBe(1)
    expect(onePlusOne.gear?.ratchetTotal).toBe(2)

    let onePlusZero = createInitialMachine()
    for (const action of ['write1', 'moveRight', 'writeSeparator', 'moveRight', 'write0'] as PianoAction[]) {
      onePlusZero = applyPianoAction(onePlusZero, action)
    }
    onePlusZero = applyPianoAction(onePlusZero, 'play')
    onePlusZero = runStep(onePlusZero) // SCAN -> ADD
    expect(onePlusZero.gear).toEqual({
      aBit: 1,
      bBit: 0,
      carryIn: 0,
      ratchetTotal: 1,
      sumBit: 1,
      carryOut: 0,
    })
    onePlusZero = runStep(onePlusZero) // ADD -> CARRY
    expect(onePlusZero.carry).toBe(0)
  })
})
