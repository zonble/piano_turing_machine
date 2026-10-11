let context: AudioContext | undefined
function getContext() { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume(); return context }

export function playTone(frequency: number, duration = 0.18, type: OscillatorType = 'triangle') {
  const audio = getContext(); const now = audio.currentTime; const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); oscillator.connect(gain).connect(audio.destination); oscillator.start(now); oscillator.stop(now + duration + 0.03)
}

export function playRatchetClick(notch = 1) {
  const audio = getContext()
  const now = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(280 + notch * 65, now)
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.055)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065)
  osc.connect(gain).connect(audio.destination)
  osc.start(now)
  osc.stop(now + 0.08)
}

export function playBellChime() {
  const audio = getContext()
  const now = audio.currentTime
  const partials: Array<[number, number, number]> = [
    [1567.98, 0.11, 0.95], // G6 fundamental bell tone
    [3135.96, 0.055, 0.65], // Octave harmonic
    [4186.01, 0.04, 0.45], // Metallic bell overtone (C8)
  ]
  for (const [freq, peak, decay] of partials) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)
    osc.connect(gain).connect(audio.destination)
    osc.start(now)
    osc.stop(now + decay + 0.04)
  }
}

export function playPunchStamp() {
  const audio = getContext()
  const now = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(165, now)
  osc.frequency.exponentialRampToValueAtTime(58, now + 0.11)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
  osc.connect(gain).connect(audio.destination)
  osc.start(now)
  osc.stop(now + 0.15)
}

export function playFinalChord() {
  for (const [midi, delay] of [[60, 0], [64, 0.05], [67, 0.1], [72, 0.15]] as const) {
    const audio = getContext()
    const now = audio.currentTime + delay
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(pianoFrequency(midi), now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
    osc.connect(gain).connect(audio.destination)
    osc.start(now)
    osc.stop(now + 0.6)
  }
}

export const pianoFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
