export const SAMPLE_RATE = 250;
export const MODES = ["Eyes Closed", "Relaxed (Eyes Open)", "Concentrating"] as const;
export type EEGMode = (typeof MODES)[number];
export type EEGState = EEGMode | "Calibrating...";
export type EEGSample = { time: number; uv: number; adc: number; mode: EEGMode };

const targets: Record<EEGMode, [number, number, number]> = {
  "Eyes Closed": [18, 5, 3],
  "Relaxed (Eyes Open)": [6, 5, 3],
  "Concentrating": [3.5, 5.2, 3.4],
};
const frequencies = [9.3, 10.1, 11.2, 5.6, 6.4, 7.3, 17.4, 22.2, 27.1];
const gain = 10000;
const reference = 2.5;
const maxVoltage = 3.3;
const maxAdc = 4095;

function gaussian() {
  const u = Math.max(Number.EPSILON, Math.random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export function digitize(uv: number) {
  const voltage = Math.max(0, Math.min(maxVoltage, reference + uv * 1e-6 * gain));
  const adc = Math.round(voltage / maxVoltage * maxAdc);
  return { adc, uv: (adc / maxAdc * maxVoltage - reference) / gain * 1e6, voltage: adc / maxAdc * maxVoltage };
}

export function spectrum(samples: number[], maxFrequency = 45) {
  const length = samples.length;
  if (length < 2) return { frequencies: [] as number[], psd: [] as number[] };
  const mean = samples.reduce((sum, value) => sum + value, 0) / length;
  const window = samples.map((value, index) => (value - mean) * (0.5 - 0.5 * Math.cos(2 * Math.PI * index / length)));
  const windowPower = Array.from({ length }, (_, index) => {
    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / length);
    return w * w;
  }).reduce((sum, value) => sum + value, 0);
  const maxBin = Math.min(Math.floor(length / 2), Math.floor(maxFrequency * length / SAMPLE_RATE));
  const bins: number[] = [];
  const psd: number[] = [];
  for (let bin = 0; bin <= maxBin; bin++) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < length; index++) {
      const angle = 2 * Math.PI * bin * index / length;
      real += window[index] * Math.cos(angle);
      imaginary -= window[index] * Math.sin(angle);
    }
    bins.push(bin * SAMPLE_RATE / length);
    psd.push((real * real + imaginary * imaginary) / (SAMPLE_RATE * windowPower) * (bin === 0 || bin === length / 2 ? 1 : 2));
  }
  return { frequencies: bins, psd };
}

export function bandPower(frequencies: number[], psd: number[], low: number, high: number) {
  if (frequencies.length < 2) return 0;
  const width = frequencies[1] - frequencies[0];
  return frequencies.reduce((sum, frequency, index) => sum + (frequency >= low && frequency < high ? psd[index] * width : 0), 0);
}

export class EEGEngine {
  mode: EEGMode = "Eyes Closed";
  detected: EEGState = "Calibrating...";
  smoothedAlpha: number | null = null;
  samples: EEGSample[] = [];
  recording: EEGSample[] = [];
  totalSamples = 0;
  private amplitudes = [18, 5, 3];
  private phases = frequencies.map(() => Math.random() * 2 * Math.PI);
  private noise = 0;
  private alphaModulation = 0;

  generate(count: number) {
    const result: EEGSample[] = [];
    for (let sample = 0; sample < count; sample++) {
      const target = targets[this.mode];
      this.amplitudes[0] += (1 - Math.exp(-1 / (SAMPLE_RATE * 0.25))) * (target[0] - this.amplitudes[0]);
      for (let band = 1; band < 3; band++) this.amplitudes[band] += (1 - Math.exp(-1 / SAMPLE_RATE)) * (target[band] - this.amplitudes[band]);
      this.alphaModulation = 0.999 * this.alphaModulation + gaussian() * 0.025;
      const modulation = Math.max(0.35, Math.min(1.8, 1 + this.alphaModulation));
      const weights = [0.58 * modulation, 0.42 * modulation, 0.23 * modulation, 0.65, 0.4, 0.25, 0.7, 0.48, 0.32];
      let eeg = 0;
      for (let index = 0; index < frequencies.length; index++) {
        this.phases[index] = (this.phases[index] + 2 * Math.PI * frequencies[index] / SAMPLE_RATE) % (2 * Math.PI);
        eeg += this.amplitudes[index < 3 ? 0 : index < 6 ? 1 : 2] * weights[index] * Math.sin(this.phases[index]);
      }
      this.noise = 0.72 * this.noise + gaussian() * 2.5;
      const converted = digitize(eeg + this.noise);
      result.push({ time: this.totalSamples / SAMPLE_RATE, uv: converted.uv, adc: converted.adc, mode: this.mode });
      this.totalSamples++;
    }
    this.samples.push(...result);
    this.recording.push(...result);
    this.samples = this.samples.slice(-SAMPLE_RATE * 30);
    this.recording = this.recording.slice(-SAMPLE_RATE * 300);
    return result;
  }

  detect(alphaPower: number) {
    this.smoothedAlpha = this.smoothedAlpha === null ? alphaPower : 0.88 * this.smoothedAlpha + 0.12 * alphaPower;
    const power = this.smoothedAlpha;
    if (this.detected === "Eyes Closed") {
      if (power < 28) this.detected = "Relaxed (Eyes Open)";
    } else if (this.detected === "Concentrating") {
      if (power > 10) this.detected = "Relaxed (Eyes Open)";
    } else if (power > 45) this.detected = "Eyes Closed";
    else if (power < 5) this.detected = "Concentrating";
    else this.detected = "Relaxed (Eyes Open)";
    return this.detected;
  }
}
