import { describe, expect, it } from 'vitest'
import { encodeOperationInput, parseOperationInput } from './operations'

describe('operation input validation', () => {
  it.each([
    ['add', '10#101', ['10', '101']], ['subtract', '101#10', ['101', '10']], ['multiply', '11#10', ['11', '10']], ['divide', '110#10', ['110', '10']],
  ] as const)('parses %s operands', (operation, input, operands) => { const result = parseOperationInput(operation, input); expect(result.ok).toBe(true); if (result.ok) expect(result.operands).toEqual(operands) })
  it('normalizes leading zeroes for unary operations', () => { expect(parseOperationInput('increment', '000101')).toEqual({ ok: true, operation: 'increment', operands: ['101'], input: '101' }) })
  it.each([
    ['add', '10', 'ERR_SEPARATOR'], ['add', '10##101', 'ERR_SEPARATOR'], ['add', '#101', 'ERR_EMPTY_OPERAND'], ['increment', '10#1', 'ERR_UNEXPECTED_SEPARATOR'], ['add', '102#1', 'ERR_INVALID_SYMBOL'], ['divide', '10#0', 'ERR_DIV_ZERO'], ['subtract', '10#101', 'ERR_NEGATIVE_RESULT'],
  ] as const)('rejects %s %s with %s', (operation, input, code) => { expect(parseOperationInput(operation, input)).toMatchObject({ ok: false, error: { code } }) })
  it.each([['add', ['10', '101']], ['increment', ['101']]] as const)('encodes %s parameters back to Tape input', (operation, operands) => { expect(encodeOperationInput(operation, ...operands)).toBe(operation === 'add' ? '10#101' : '101') })
})
