# EEG Simulator

A desktop demonstration that generates synthetic EEG-like signals at 250 samples per second. Switch between eyes closed, relaxed eyes open, and concentrating modes to see the waveform, power spectrum, simulated 12-bit ADC output, and an illustrative state detector. Export the generated samples as CSV.

This is a simulation only. It does not read electrodes or diagnose a person's condition. The state thresholds are chosen for these generated signals and are not suitable for real EEG data.

## Run

Install Python 3.10 or newer. From this folder:

```powershell
python -m pip install -r requirements.txt
python eeg_simulator.py
```

Select a mode with the buttons. Use Pause, Reset, and Export CSV below the plots. CSV files contain elapsed time, reconstructed signal in microvolts, ADC count, and selected simulation mode.

## Model

The generator combines alpha, theta, and beta sinusoids with correlated noise. The amplifier and ADC model applies a gain of 10,000, a 2.5 V offset, clipping to 0–3.3 V, and 12-bit quantization. The spectrum uses Welch's method. The detector smooths one-second alpha-band power and applies hysteresis. These are simplified, illustrative choices, not a validated EEG acquisition system.
