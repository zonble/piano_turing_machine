let context: AudioContext | undefined
function getContext() {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

export function playTone(frequency: number, duration = 1.15, _type: OscillatorType = 'triangle') {
  const audio = getContext()
  const now = audio.currentTime

  // Master filter & envelope for piano string resonance
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(Math.min(12000, frequency * 7.5), now)
  filter.frequency.exponentialRampToValueAtTime(Math.max(420, frequency * 1.8), now + duration)
  filter.Q.setValueAtTime(1.2, now)

  const master = audio.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.linearRampToValueAtTime(0.18, now + 0.006)
  master.gain.exponentialRampToValueAtTime(0.055, now + 0.18)
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  filter.connect(master).connect(audio.destination)

  // Harmonic partials + slightly detuned unison string for upright piano warmth
  const partials: Array<{ ratio: number; detune: number; amp: number; decay: number; wave: OscillatorType }> = [
    { ratio: 1, detune: -1.8, amp: 0.55, decay: duration, wave: 'triangle' },
    { ratio: 1, detune: 1.8, amp: 0.45, decay: duration * 0.92, wave: 'sine' },
    { ratio: 2, detune: 0.8, amp: 0.28, decay: duration * 0.62, wave: 'sine' },
    { ratio: 3, detune: 1.5, amp: 0.13, decay: duration * 0.42, wave: 'sine' },
    { ratio: 4.01, detune: 2.5, amp: 0.06, decay: duration * 0.26, wave: 'sine' },
  ]

  for (const p of partials) {
    const partialFreq = frequency * p.ratio
    if (partialFreq > 14000) continue
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = p.wave
    osc.frequency.setValueAtTime(partialFreq, now)
    osc.detune.setValueAtTime(p.detune, now)
    gain.gain.setValueAtTime(p.amp, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.decay)
    osc.connect(gain).connect(filter)
    osc.start(now)
    osc.stop(now + p.decay + 0.03)
  }

  // Subtle felt-hammer woody thump on key strike
  const hammerOsc = audio.createOscillator()
  const hammerGain = audio.createGain()
  hammerOsc.type = 'triangle'
  hammerOsc.frequency.setValueAtTime(Math.min(320, Math.max(95, frequency * 0.5)), now)
  hammerOsc.frequency.exponentialRampToValueAtTime(48, now + 0.028)
  hammerGain.gain.setValueAtTime(0.0001, now)
  hammerGain.gain.linearRampToValueAtTime(0.06, now + 0.003)
  hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032)
  hammerOsc.connect(hammerGain).connect(audio.destination)
  hammerOsc.start(now)
  hammerOsc.stop(now + 0.038)
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
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.004)
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
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
  osc.connect(gain).connect(audio.destination)
  osc.start(now)
  osc.stop(now + 0.15)
}

export function playFinalChord() {
  for (const [midi, delay] of [[60, 0], [64, 55], [67, 110], [72, 165]] as const) {
    window.setTimeout(() => {
      playTone(pianoFrequency(midi), 1.4)
    }, delay)
  }
}

export const pianoFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
