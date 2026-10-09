let context: AudioContext | undefined
function getContext() { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume(); return context }
export function playTone(frequency: number, duration = 0.18, type: OscillatorType = 'triangle') {
  const audio = getContext(); const now = audio.currentTime; const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); oscillator.connect(gain).connect(audio.destination); oscillator.start(now); oscillator.stop(now + duration + 0.03)
}
export const pianoFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
