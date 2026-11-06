import React from "react";
import { createRoot } from "react-dom/client";
import { EEGWebSimulator } from "./EEGWebSimulator";
import "./style.css";

function App() {
  return <>
    <a className="skip-link" href="#simulator">Skip to simulator</a>
    <header className="site-header"><a className="wordmark" href="https://nefs.gr" aria-label="Nikos Efstratiou home">nefs<span>.gr</span></a><nav aria-label="Site links"><a href="https://nefs.gr/project-automations/eeg-simulator">Project details</a><a href="https://github.com/nickefs/eeg-simulator">Python source</a></nav></header>
    <main>
      <section className="intro" aria-labelledby="page-title"><p className="eyebrow">Signal processing / Interactive demonstration</p><h1 id="page-title">EEG Simulator</h1><p className="lede">Explore generated brainwave-like signals as they change. Choose a mode, watch the live waveform and frequency spectrum, then export the samples you created.</p><div className="intro-actions"><a className="btn btn-primary" href="#simulator">Start exploring ↓</a><a className="btn btn-secondary" href="https://nefs.gr/project-automations/eeg-simulator">About this project ↗</a></div><p className="disclaimer">This is a synthetic demonstration. It does not read electrodes or interpret anyone’s brain activity.</p></section>
      <section className="simulator-section" id="simulator" aria-labelledby="simulator-title"><div className="section-heading"><p className="eyebrow">Live simulation</p><h2 id="simulator-title">Change the signal</h2><p>Eyes closed starts with stronger alpha activity. Choose another mode to see how the simulated rhythms and detector respond.</p></div><EEGWebSimulator/></section>
      <section className="about-section" aria-labelledby="about-title"><p className="eyebrow">Behind the display</p><h2 id="about-title">How it works</h2><div className="about-grid"><div><h3>Generated signal</h3><p>Alpha, theta and beta oscillations are combined with random background noise. Each mode changes their amplitudes over time.</p></div><div><h3>Measured bands</h3><p>The spectrum estimates how much signal power falls in each frequency range. The detector uses recent alpha power and simple thresholds.</p></div><div><h3>Simulated hardware</h3><p>An amplifier and 12-bit converter turn the generated signal into sample counts. The CSV contains the reconstructed values and selected mode.</p></div></div><p className="about-note">The detector thresholds and hardware model are illustrative. They have not been validated for real EEG.</p></section>
    </main>
    <footer className="site-footer"><span>Nikos Efstratiou</span><a href="https://nefs.gr/project-automations/eeg-simulator">Back to Engineering Projects ↗</a></footer>
  </>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
