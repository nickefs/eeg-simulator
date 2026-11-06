# EEG Simulator

A desktop and browser demonstration of synthetic EEG-like signals. The public browser version runs at `https://eeg-simulator.nefs.gr`.

Neither version reads electrodes or diagnoses a condition. The generated rhythms, detector thresholds, and hardware model are illustrative.

## Browser version

```powershell
npm install
npm run dev
```

Run `npm test` for signal and detector checks, then `npm run build` for the production build. The web app lives in `src/` and deploys from this repository to Vercel. It does not store visitor data on a server. Exported CSV data stays in the visitor's browser until they download it.

## Python desktop version

Install Python 3.10 or newer, then:

```powershell
python -m pip install -r requirements.txt
python eeg_simulator.py
```

The desktop app includes the same three synthetic modes, waveform and spectrum plots, a simulated 12-bit ADC, an illustrative detector, and CSV export.
