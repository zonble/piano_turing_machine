import * as Tone from 'tone'

let context: AudioContext | undefined
let sampler: Tone.Sampler | undefined
let samplerReady: Promise<void> | undefined
function getContext() { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume(); return context }
function ensureSampler() {
  samplerReady ??= Tone.start().then(() => new Promise<void>((resolve) => {
    sampler = new Tone.Sampler({
      urls: { C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3' },
      baseUrl: 'https://tonejs.github.io/audio/salamander/',
      onload: resolve,
    }).toDestination()
  }))
  return samplerReady
}
export function playTone(frequency: number, duration = 0.18, type: OscillatorType = 'triangle') {
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440)); void ensureSampler().then(() => sampler?.triggerAttackRelease(Tone.Frequency(midi, 'midi').toNote(), duration)).catch(() => undefined)
  const audio = getContext(); const now = audio.currentTime; const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); oscillator.connect(gain).connect(audio.destination); oscillator.start(now); oscillator.stop(now + duration + 0.03)
}
export const pianoFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
