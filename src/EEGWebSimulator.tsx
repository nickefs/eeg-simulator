import { useEffect, useRef, useState } from "react";
import { bandPower, EEGEngine, MODES, SAMPLE_RATE, spectrum, type EEGMode, type EEGState } from "./eeg-simulation";

type Display = {
  wave: number[];
  frequencies: number[];
  psd: number[];
  theta: number | null;
  alpha: number | null;
  beta: number | null;
  fastAlpha: number | null;
  detected: EEGState;
  adc: number | null;
  voltage: number | null;
  sampleCount: number;
};
const empty: Display = { wave: [], frequencies: [], psd: [], theta: null, alpha: null, beta: null, fastAlpha: null, detected: "Calibrating...", adc: null, voltage: null, sampleCount: 0 };

function linePath(values: number[], y: (value: number) => number) {
  if (!values.length) return "";
  return values.map((value, index) => `${index ? "L" : "M"}${(index / Math.max(1, values.length - 1) * 600).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
}

function number(value: number | null, unit: string) {
  return value === null ? "Collecting data" : `${value.toFixed(2)} ${unit}`;
}

export function EEGWebSimulator() {
  const engine = useRef(new EEGEngine());
  const running = useRef(true);
  const lastTick = useRef(0);
  const lastSpectrum = useRef(0);
  const [active, setActive] = useState(true);
  const [mode, setMode] = useState<EEGMode>("Eyes Closed");
  const [display, setDisplay] = useState<Display>(empty);

  useEffect(() => {
    lastTick.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTick.current;
      lastTick.current = now;
      if (!running.current) return;
      const instance = engine.current;
      instance.generate(Math.min(50, Math.max(0, Math.round(elapsed * SAMPLE_RATE / 1000))));
      const samples = instance.samples;
      const wave = samples.slice(-SAMPLE_RATE * 5).map(sample => sample.uv);
      const latest = samples.at(-1);
      let fastAlpha: number | null = null;
      if (samples.length >= SAMPLE_RATE) {
        const recent = samples.slice(-SAMPLE_RATE).map(sample => sample.uv);
        const estimate = spectrum(recent, 13);
        fastAlpha = bandPower(estimate.frequencies, estimate.psd, 8, 13);
        instance.detect(fastAlpha);
      }
      setDisplay(previous => {
        let frequencies = previous.frequencies;
        let psd = previous.psd;
        let theta = previous.theta;
        let alpha = previous.alpha;
        let beta = previous.beta;
        if (samples.length >= SAMPLE_RATE * 4 && now - lastSpectrum.current > 500) {
          const full = spectrum(samples.slice(-SAMPLE_RATE * 4).map(sample => sample.uv));
          frequencies = full.frequencies;
          psd = full.psd;
          theta = bandPower(frequencies, psd, 4, 8);
          alpha = bandPower(frequencies, psd, 8, 13);
          beta = bandPower(frequencies, psd, 13, 30);
          lastSpectrum.current = now;
        }
        return { wave, frequencies, psd, theta, alpha, beta, fastAlpha, detected: instance.detected, adc: latest?.adc ?? null, voltage: latest ? latest.adc / 4095 * 3.3 : null, sampleCount: instance.totalSamples };
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  function chooseMode(selected: EEGMode) {
    engine.current.mode = selected;
    setMode(selected);
  }

  function toggle() {
    running.current = !running.current;
    lastTick.current = performance.now();
    setActive(running.current);
  }

  function reset() {
    engine.current = new EEGEngine();
    engine.current.mode = mode;
    lastTick.current = performance.now();
    lastSpectrum.current = 0;
    setDisplay(empty);
  }

  function exportCsv() {
    const records = engine.current.recording;
    if (!records.length) return;
    const rows = ["time_s,eeg_uv,adc_count,simulated_mode", ...records.map(sample => `${sample.time.toFixed(3)},${sample.uv.toFixed(4)},${sample.adc},${sample.mode}`)];
    const url = URL.createObjectURL(new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eeg_simulation.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const wavePath = linePath(display.wave, value => 90 - Math.max(-70, Math.min(70, value)) / 70 * 76);
  const peak = Math.max(1, ...display.psd);
  const spectrumPath = linePath(display.psd, value => 168 - value / peak * 145);
  return <div className="eeg-sim" aria-label="Interactive synthetic EEG simulation">
    <div className="eeg-sim-toolbar" role="group" aria-label="Simulation mode">
      {MODES.map(option => <button key={option} type="button" className={`btn ${mode === option ? "btn-primary" : "btn-secondary"}`} aria-pressed={mode === option} onClick={() => chooseMode(option)}>{option}</button>)}
    </div>
    <p className="eeg-sim-status" role="status">{active ? "Live" : "Paused"} · Synthetic EEG · {SAMPLE_RATE} samples/s</p>
    <div className="eeg-sim-plots">
      <div className="eeg-sim-plot card"><div className="eeg-sim-plot-heading"><h3>Signal</h3><span>Last 5 seconds · µV</span></div><svg viewBox="0 0 600 180" role="img" aria-label="Live synthetic EEG waveform"><path className="eeg-sim-grid" d="M0 14H600 M0 90H600 M0 166H600"/><path className="eeg-sim-trace" d={wavePath}/></svg><div className="eeg-sim-axis"><span>-5 s</span><span>Now</span></div></div>
      <div className="eeg-sim-plot card"><div className="eeg-sim-plot-heading"><h3>Frequency spectrum</h3><span>4 second window · µV²/Hz</span></div><svg viewBox="0 0 600 180" role="img" aria-label="Power spectrum from zero to 45 hertz"><path className="eeg-sim-grid" d="M0 168H600 M0 90H600 M0 14H600"/><path className="eeg-sim-trace" d={spectrumPath}/></svg><div className="eeg-sim-axis"><span>0 Hz</span><span>45 Hz</span></div></div>
    </div>
    <div className="eeg-sim-readings" aria-live="off">
      <div><span>Theta · 4–8 Hz</span><strong>{number(display.theta, "µV²")}</strong></div>
      <div><span>Alpha · 8–13 Hz</span><strong>{number(display.alpha, "µV²")}</strong></div>
      <div><span>Beta · 13–30 Hz</span><strong>{number(display.beta, "µV²")}</strong></div>
      <div><span>Detector</span><strong>{display.detected}</strong></div>
    </div>
    <p className="eeg-sim-detail">Fast alpha power: {number(display.fastAlpha, "µV²")} · ADC: {display.adc ?? "--"} / 4095 · Voltage: {display.voltage?.toFixed(3) ?? "--"} V</p>
    <div className="eeg-sim-actions"><button type="button" className="btn btn-secondary" onClick={toggle}>{active ? "Pause" : "Resume"}</button><button type="button" className="btn btn-secondary" onClick={reset}>Reset</button><button type="button" className="btn btn-secondary" disabled={!display.sampleCount} onClick={exportCsv}>Export CSV</button></div>
    <p className="eeg-sim-note">Generated signals only. The detector is illustrative and cannot interpret real EEG. CSV export contains up to the latest five minutes.</p>
  </div>;
}
