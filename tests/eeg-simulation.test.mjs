import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bandPower, digitize, EEGEngine, SAMPLE_RATE, spectrum } from '../src/eeg-simulation.ts';

test('ADC quantization stays in 12-bit range and reconstructs microvolts', () => {
  assert.equal(digitize(10000).adc, 4095);
  assert.equal(digitize(-10000).adc, 0);
  const measured = digitize(20);
  assert.ok(Math.abs(measured.uv - 20) < 0.1);
});

test('spectrum and band power identify a 10 Hz signal', () => {
  const signal = Array.from({ length: SAMPLE_RATE * 4 }, (_, index) => 20 * Math.sin(2 * Math.PI * 10 * index / SAMPLE_RATE));
  const result = spectrum(signal);
  const alpha = bandPower(result.frequencies, result.psd, 8, 13);
  assert.ok(alpha > 190 && alpha < 210, `expected about 200 µV², got ${alpha}`);
  assert.ok(bandPower(result.frequencies, result.psd, 4, 8) < 0.01);
  assert.ok(bandPower(result.frequencies, result.psd, 13, 30) < 0.01);
});

test('generator advances sample time and records the selected mode', () => {
  const engine = new EEGEngine();
  assert.equal(engine.generate(10).length, 10);
  engine.mode = 'Concentrating';
  const next = engine.generate(2);
  assert.equal(next[0].time, 10 / SAMPLE_RATE);
  assert.equal(next[0].mode, 'Concentrating');
  assert.equal(engine.recording.length, 12);
  assert.ok(engine.samples.every(sample => Number.isFinite(sample.uv) && sample.adc >= 0 && sample.adc <= 4095));
});

test('detector applies hysteresis across state changes', () => {
  const engine = new EEGEngine();
  assert.equal(engine.detect(60), 'Eyes Closed');
  for (let index = 0; index < 8; index++) engine.detect(0);
  assert.equal(engine.detected, 'Relaxed (Eyes Open)');
  for (let index = 0; index < 25; index++) engine.detect(0);
  assert.equal(engine.detected, 'Concentrating');
});
