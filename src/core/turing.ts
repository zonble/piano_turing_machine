export type TapeSymbol = '0' | '1' | 'blank'
export type Direction = 'L' | 'R' | 'S'
export type Transition = { from: string; read: TapeSymbol; to: string; write: TapeSymbol; direction: Direction }
export type Preset = { id: string; name: string; description: string; musicalNote: string; initialTape: Record<number, TapeSymbol>; head: number; startState: string; transitions: Transition[] }
export type MachineSnapshot = { tape: Record<number, TapeSymbol>; head: number; state: string; step: number; halted: boolean; lastTransition?: Transition }
export const symbolLabel = (symbol: TapeSymbol) => symbol === 'blank' ? '□' : symbol
export const directionLabel = (direction: Direction) => direction === 'L' ? '←' : direction === 'R' ? '→' : '·'

const incrementer: Transition[] = [
  { from: 'q0', read: '0', to: 'q0', write: '0', direction: 'R' }, { from: 'q0', read: '1', to: 'q0', write: '1', direction: 'R' }, { from: 'q0', read: 'blank', to: 'q1', write: 'blank', direction: 'L' },
  { from: 'q1', read: '0', to: 'halt', write: '1', direction: 'S' }, { from: 'q1', read: '1', to: 'q1', write: '0', direction: 'L' }, { from: 'q1', read: 'blank', to: 'halt', write: '1', direction: 'S' },
]
const addition: Transition[] = [
  { from: 'scan', read: '0', to: 'scan', write: '0', direction: 'R' }, { from: 'scan', read: '1', to: 'scan', write: '1', direction: 'R' }, { from: 'scan', read: 'blank', to: 'carry', write: 'blank', direction: 'L' },
  { from: 'carry', read: '0', to: 'halt', write: '1', direction: 'S' }, { from: 'carry', read: '1', to: 'carry', write: '0', direction: 'L' }, { from: 'carry', read: 'blank', to: 'halt', write: '1', direction: 'S' },
]
const busyBeaver: Transition[] = [{ from: 'a', read: '0', to: 'b', write: '1', direction: 'R' }, { from: 'a', read: '1', to: 'halt', write: '1', direction: 'S' }, { from: 'b', read: '0', to: 'a', write: '1', direction: 'L' }, { from: 'b', read: '1', to: 'b', write: '1', direction: 'R' }]
const palindrome: Transition[] = [{ from: 'scan', read: '0', to: 'scan', write: '0', direction: 'R' }, { from: 'scan', read: '1', to: 'scan', write: '1', direction: 'R' }, { from: 'scan', read: 'blank', to: 'return', write: 'blank', direction: 'L' }, { from: 'return', read: '0', to: 'return', write: '0', direction: 'L' }, { from: 'return', read: '1', to: 'return', write: '1', direction: 'L' }, { from: 'return', read: 'blank', to: 'halt', write: 'blank', direction: 'S' }]
const shift: Transition[] = [{ from: 'scan', read: '0', to: 'scan', write: '0', direction: 'R' }, { from: 'scan', read: '1', to: 'scan', write: '1', direction: 'R' }, { from: 'scan', read: 'blank', to: 'write', write: '0', direction: 'S' }, { from: 'write', read: '0', to: 'halt', write: '0', direction: 'S' }]
export const presets: Preset[] = [
  { id: 'increment', name: '二進位自增 1', description: '將紙帶上的二進位數字加一。', musicalNote: '進位時向左掃音，形成連續低音律動。', initialTape: { 0: '1', 1: '0', 2: '1', 3: '1' }, head: 0, startState: 'q0', transitions: incrementer },
  { id: 'addition', name: '二進位加法', description: '以進位狀態將兩段輸入合併成總和。', musicalNote: '讀寫頭往返，旋律像兩個數字彼此對話。', initialTape: { 0: '1', 1: '0', 2: '1', 3: '1' }, head: 0, startState: 'scan', transitions: addition },
  { id: 'beaver', name: '忙碌海狸', description: '在有限步數裡寫下盡可能多的 1。', musicalNote: '非週期性的跳躍節奏，直到終止和弦。', initialTape: {}, head: 0, startState: 'a', transitions: busyBeaver },
  { id: 'palindrome', name: '迴文檢查', description: '掃描輸入字串並確認它是否對稱。', musicalNote: '左右往返的對稱音型。', initialTape: { 0: '1', 1: '0', 2: '0', 3: '1' }, head: 0, startState: 'scan', transitions: palindrome },
  { id: 'shift', name: '乘二／位元左移', description: '在數字末端補上 0，完成乘二。', musicalNote: '單向推動的上行琶音。', initialTape: { 0: '1', 1: '0', 2: '1' }, head: 0, startState: 'scan', transitions: shift },
]
export function resetMachine(preset: Preset): MachineSnapshot { return { tape: { ...preset.initialTape }, head: preset.head, state: preset.startState, step: 0, halted: false } }
export function executeStep(snapshot: MachineSnapshot, preset: Preset): MachineSnapshot {
  if (snapshot.halted) return snapshot
  const read = snapshot.tape[snapshot.head] ?? 'blank'; const transition = preset.transitions.find((item) => item.from === snapshot.state && item.read === read)
  if (!transition) return { ...snapshot, halted: true, lastTransition: undefined }
  const tape = { ...snapshot.tape }; if (transition.write === 'blank') delete tape[snapshot.head]; else tape[snapshot.head] = transition.write
  const head = snapshot.head + (transition.direction === 'L' ? -1 : transition.direction === 'R' ? 1 : 0)
  return { tape, head, state: transition.to, step: snapshot.step + 1, halted: transition.to === 'halt', lastTransition: transition }
}
export function tapeValue(tape: Record<number, TapeSymbol>) { const keys = Object.keys(tape).map(Number).sort((a, b) => a - b); if (!keys.length) return '0'; return keys.map((key) => tape[key] === '1' ? '1' : '0').join('').replace(/^0+/, '') || '0' }
