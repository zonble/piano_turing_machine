export type OperationId =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'and'
  | 'or'
  | 'xor'
  | 'increment'
  | 'shift'
  | 'not'
  | 'palindrome'

export type ValidationCode =
  | 'ERR_EMPTY_OPERAND'
  | 'ERR_INVALID_SYMBOL'
  | 'ERR_SEPARATOR'
  | 'ERR_UNEXPECTED_SEPARATOR'
  | 'ERR_DIV_ZERO'
  | 'ERR_NEGATIVE_RESULT'

export type OperationInput = {
  ok: true
  operation: OperationId
  operands: string[]
  input: string
}

export type OperationInputError = {
  ok: false
  error: {
    code: ValidationCode
    message: string
  }
}

export type OperationInputResult = OperationInput | OperationInputError

const binaryOperations = new Set<OperationId>([
  'add',
  'subtract',
  'multiply',
  'divide',
  'and',
  'or',
  'xor',
])

const normalizeOperand = (operand: string) => operand.replace(/^0+(?=\d)/, '')

const failure = (code: ValidationCode, message: string): OperationInputError => ({
  ok: false,
  error: { code, message },
})

export function parseOperationInput(
  operation: OperationId,
  rawInput: string,
): OperationInputResult {
  const input = rawInput.replace(/\s/g, '')

  if (binaryOperations.has(operation)) {
    if (input.split('#').length !== 2) {
      return failure('ERR_SEPARATOR', 'Binary operation requires a single # separating A and B.')
    }

    const [left, right] = input.split('#')
    if (!left || !right) {
      return failure('ERR_EMPTY_OPERAND', 'Both left and right operands are required.')
    }

    if (!/^[01]+$/.test(left) || !/^[01]+$/.test(right)) {
      return failure('ERR_INVALID_SYMBOL', 'Operands may only contain binary digits 0 and 1.')
    }

    const normalizedLeft = normalizeOperand(left)
    const normalizedRight = normalizeOperand(right)

    if (operation === 'divide' && normalizedRight === '0') {
      return failure('ERR_DIV_ZERO', 'Divisor cannot be 0.')
    }

    if (
      operation === 'subtract' &&
      BigInt(`0b${normalizedLeft}`) < BigInt(`0b${normalizedRight}`)
    ) {
      return failure('ERR_NEGATIVE_RESULT', 'Negative results are not supported on the tape (require A ≥ B).')
    }

    return {
      ok: true,
      operation,
      operands: [normalizedLeft, normalizedRight],
      input: `${normalizedLeft}#${normalizedRight}`,
    }
  }

  if (input.includes('#')) {
    return failure('ERR_UNEXPECTED_SEPARATOR', 'This unary gear takes a single binary number without #.')
  }

  if (!input) {
    return failure('ERR_EMPTY_OPERAND', 'Operand cannot be empty.')
  }

  if (!/^[01]+$/.test(input)) {
    return failure('ERR_INVALID_SYMBOL', 'Operand may only contain binary digits 0 and 1.')
  }

  const normalized = operation === 'not' ? input : normalizeOperand(input)
  return { ok: true, operation, operands: [normalized], input: normalized }
}

export function encodeOperationInput(
  operation: OperationId,
  ...operands: string[]
): string {
  return binaryOperations.has(operation) ? operands.join('#') : operands[0] ?? ''
}
