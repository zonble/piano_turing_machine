export type OperationId =
  | 'increment'
  | 'shift'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
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
      return failure('ERR_SEPARATOR', '雙元運算需要一個 # 分隔左右兩個參數。')
    }

    const [left, right] = input.split('#')
    if (!left || !right) {
      return failure('ERR_EMPTY_OPERAND', '左右兩個參數都不能是空的。')
    }

    if (!/^[01]+$/.test(left) || !/^[01]+$/.test(right)) {
      return failure('ERR_INVALID_SYMBOL', '參數只能包含二進位符號 0 和 1。')
    }

    const normalizedLeft = normalizeOperand(left)
    const normalizedRight = normalizeOperand(right)

    if (operation === 'divide' && normalizedRight === '0') {
      return failure('ERR_DIV_ZERO', '除數不能是 0。')
    }

    if (
      operation === 'subtract' &&
      BigInt(`0b${normalizedLeft}`) < BigInt(`0b${normalizedRight}`)
    ) {
      return failure('ERR_NEGATIVE_RESULT', '目前的 Tape 不支援負數結果。')
    }

    return {
      ok: true,
      operation,
      operands: [normalizedLeft, normalizedRight],
      input: `${normalizedLeft}#${normalizedRight}`,
    }
  }

  if (input.includes('#')) {
    return failure('ERR_UNEXPECTED_SEPARATOR', '這個運算只接受一個二進位參數。')
  }

  if (!input) {
    return failure('ERR_EMPTY_OPERAND', '參數不能是空的。')
  }

  if (!/^[01]+$/.test(input)) {
    return failure('ERR_INVALID_SYMBOL', '參數只能包含二進位符號 0 和 1。')
  }

  const normalized = normalizeOperand(input)
  return { ok: true, operation, operands: [normalized], input: normalized }
}

export function encodeOperationInput(
  operation: OperationId,
  ...operands: string[]
): string {
  return binaryOperations.has(operation) ? operands.join('#') : operands[0] ?? ''
}
