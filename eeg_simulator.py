
import sys
import csv
import time
from collections import deque

import numpy as np
import pyqtgraph as pg
from scipy.signal import welch

from PySide6.QtCore import QTimer
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFileDialog
)


# =========================================================
# CONFIGURATION
# =========================================================

FS = 250                    # Samples per second
WINDOW_SECONDS = 5          # Visible EEG waveform
FFT_SECONDS = 4             # FFT visualization window
DETECTION_SECONDS = 1       # Fast detection window
BUFFER_SECONDS = 30
UPDATE_MS = 40

GAIN = 10000.0
ADC_REFERENCE = 2.5         # DC offset (V)
ADC_VMAX = 3.3
ADC_MAX = 4095              # 12-bit ADC

ALPHA_TRANSITION_TAU = 0.25  # Seconds

# Illustrative thresholds for synthetic EEG only
CLOSED_THRESHOLD = 35.0     # uV^2
RELAXED_THRESHOLD = 7.0     # uV^2


# =========================================================
# EEG SIGNAL GENERATOR
# =========================================================

class EEGSimulator:

    MODES = {
        "Eyes Closed": {
            "alpha": 18.0,
            "theta": 5.0,
            "beta": 3.0
        },
        "Relaxed (Eyes Open)": {
            "alpha": 6.0,
            "theta": 5.0,
            "beta": 3.0
        },
        "Concentrating": {
            "alpha": 3.5,
            "theta": 5.2,
            "beta": 3.4
        }
    }

    def __init__(self):

        self.rng = np.random.default_rng()
        self.mode = "Eyes Closed"

        self.alpha = 18.0
        self.theta = 5.0
        self.beta = 3.0

        self.frequencies = np.array([
            9.3, 10.1, 11.2,       # Alpha
            5.6, 6.4, 7.3,         # Theta
            17.4, 22.2, 27.1      # Beta
        ])

        self.phases = self.rng.uniform(
            0, 2 * np.pi, len(self.frequencies)
        )

        self.noise_state = 0.0
        self.alpha_modulation = 0.0

    def set_mode(self, mode):

        self.mode = mode

    def generate(self, n):
        """
        Generate n synthetic EEG samples (microvolts).

        The alpha response changes quickly when switching
        between eyes-open and eyes-closed conditions.
        """

        output = np.empty(n, dtype=np.float64)
        target = self.MODES[self.mode]

        # Exponential response coefficients
        alpha_transition = 1 - np.exp(
            -1 / (FS * ALPHA_TRANSITION_TAU)
        )

        other_transition = 1 - np.exp(
            -1 / (FS * 1.0)
        )

        for i in range(n):

            # Fast alpha transition
            self.alpha += alpha_transition * (
                target["alpha"] - self.alpha
            )

            # Slower theta and beta transitions
            self.theta += other_transition * (
                target["theta"] - self.theta
            )

            self.beta += other_transition * (
                target["beta"] - self.beta
            )

            # Natural fluctuations in alpha amplitude
            self.alpha_modulation = (
                0.999 * self.alpha_modulation
                + self.rng.normal(0, 0.025)
            )

            modulation = np.clip(
                1.0 + self.alpha_modulation,
                0.35, 1.8
            )

            amplitudes = np.array([
                self.alpha * 0.58 * modulation,
                self.alpha * 0.42 * modulation,
                self.alpha * 0.23 * modulation,

                self.theta * 0.65,
                self.theta * 0.40,
                self.theta * 0.25,

                self.beta * 0.70,
                self.beta * 0.48,
                self.beta * 0.32
            ])

            # Keep oscillations phase-continuous
            self.phases += (
                2 * np.pi * self.frequencies / FS
            )
            self.phases %= 2 * np.pi

            eeg = np.sum(
                amplitudes * np.sin(self.phases)
            )

            # Correlated background noise
            self.noise_state = (
                0.72 * self.noise_state
                + self.rng.normal(0, 2.5)
            )

            output[i] = eeg + self.noise_state

        return output


# =========================================================
# AMPLIFIER AND ADC SIMULATION
# =========================================================

def simulate_adc(eeg_uv):
    """
    EEG microvolts -> amplifier -> ADC counts
    -> reconstructed input-referred microvolts.

    This is an idealized hardware model.
    """

    voltage = (
        ADC_REFERENCE + eeg_uv * 1e-6 * GAIN
    )

    voltage = np.clip(
        voltage, 0.0, ADC_VMAX
    )

    adc_counts = np.rint(
        voltage / ADC_VMAX * ADC_MAX
    ).astype(np.int32)

    reconstructed_voltage = (
        adc_counts / ADC_MAX * ADC_VMAX
    )

    measured_uv = (
        (reconstructed_voltage - ADC_REFERENCE)
        / GAIN * 1e6
    )

    return measured_uv, adc_counts


# =========================================================
# SPECTRAL ANALYSIS
# =========================================================

def compute_spectrum(signal):
    """Return frequency bins and Welch PSD."""

    frequencies, psd = welch(
        signal,
        fs=FS,
        window="hann",
        nperseg=len(signal),
        detrend="constant"
    )

    return frequencies, psd


def calculate_band_power(freqs, psd, low, high):
    """Estimate power in a specified frequency band."""

    if len(freqs) < 2:
        return 0.0

    df = freqs[1] - freqs[0]

    mask = (freqs >= low) & (freqs < high)

    return float(np.sum(psd[mask]) * df)


# =========================================================
# AUTOMATIC EEG DETECTOR
# =========================================================

class EEGDetector:

    def __init__(self):
        self.smoothed_alpha = None
        self.current_state = "Calibrating..."

        # Synthetic demonstration thresholds
        self.closed_enter = 45.0
        self.closed_exit = 28.0

        self.focus_enter = 5.0
        self.focus_exit = 10.0

    def predict(self, alpha_power):

        # Smooth the alpha measurement
        if self.smoothed_alpha is None:
            self.smoothed_alpha = alpha_power
        else:
            self.smoothed_alpha = (
                0.95 * self.smoothed_alpha
                + 0.05 * alpha_power
            )

        p = self.smoothed_alpha

        # Hysteresis: different thresholds for entering
        # and leaving a state
        if self.current_state == "Eyes Closed":
            if p < self.closed_exit:
                self.current_state = "Relaxed (Eyes Open)"

        elif self.current_state == "Concentrating":
            if p > self.focus_exit:
                self.current_state = "Relaxed (Eyes Open)"

        else:
            if p > self.closed_enter:
                self.current_state = "Eyes Closed"

            elif p < self.focus_enter:
                self.current_state = "Concentrating"

            else:
                self.current_state = "Relaxed (Eyes Open)"

        return self.current_state# =========================================================
# MAIN APPLICATION
# =========================================================

class EEGWindow(QWidget):

    def __init__(self):

        super().__init__()

        self.setWindowTitle(
            "Live EEG Simulator - Fast State Detection"
        )

        self.resize(1150, 900)

        pg.setConfigOptions(antialias=True)

        self.simulator = EEGSimulator()
        self.detector = EEGDetector()

        self.buffer = deque(
            maxlen=FS * BUFFER_SECONDS
        )

        self.adc_buffer = deque(
            maxlen=FS * BUFFER_SECONDS
        )

        self.recording = []

        self.mode = "Eyes Closed"
        self.running = True

        self.total_samples = 0
        self.sample_fraction = 0.0
        self.last_clock = time.perf_counter()

        self.build_interface()

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_data)
        self.timer.start(UPDATE_MS)

    # -----------------------------------------------------
    # USER INTERFACE
    # -----------------------------------------------------

    def build_interface(self):

        layout = QVBoxLayout(self)

        # Simulation state selection
        modes = QHBoxLayout()

        self.buttons = {}

        for mode in EEGSimulator.MODES:

            button = QPushButton(mode)
            button.setCheckable(True)

            button.clicked.connect(
                lambda checked=False, m=mode:
                self.change_mode(m)
            )

            self.buttons[mode] = button
            modes.addWidget(button)

        layout.addLayout(modes)

        self.change_mode("Eyes Closed")

        # Status
        self.status = QLabel(
            "LIVE | Synthetic EEG | 250 Hz"
        )

        layout.addWidget(self.status)

        # EEG graph
        self.eeg_plot = pg.PlotWidget(
            title="Live EEG - Oz to Mastoid"
        )

        self.eeg_plot.setLabel(
            "left", "Amplitude", units="uV"
        )

        self.eeg_plot.setLabel(
            "bottom", "Time", units="s"
        )

        self.eeg_plot.setXRange(
            -WINDOW_SECONDS, 0, padding=0
        )

        self.eeg_plot.setYRange(-70, 70)

        self.eeg_plot.showGrid(
            x=True, y=True, alpha=0.3
        )

        self.eeg_curve = self.eeg_plot.plot(
            pen=pg.mkPen("#00B894", width=1.3)
        )

        layout.addWidget(self.eeg_plot, stretch=2)

        # FFT graph
        self.fft_plot = pg.PlotWidget(
            title="Live EEG Spectrum (4-second Welch PSD)"
        )

        self.fft_plot.setLabel(
            "left", "PSD", units="uV^2/Hz"
        )

        self.fft_plot.setLabel(
            "bottom", "Frequency", units="Hz"
        )

        self.fft_plot.setXRange(
            0, 45, padding=0
        )

        self.fft_plot.showGrid(
            x=True, y=True, alpha=0.3
        )

        self.fft_curve = self.fft_plot.plot(
            pen=pg.mkPen("#A29BFE", width=2)
        )

        layout.addWidget(self.fft_plot, stretch=2)

        # Frequency-band measurements
        powers = QHBoxLayout()

        self.theta_label = QLabel("Theta: --")
        self.alpha_label = QLabel("Alpha: --")
        self.beta_label = QLabel("Beta: --")

        powers.addWidget(self.theta_label)
        powers.addWidget(self.alpha_label)
        powers.addWidget(self.beta_label)

        layout.addLayout(powers)

        # ADC information
        self.adc_label = QLabel(
            "ADC: -- | Voltage: -- V"
        )

        layout.addWidget(self.adc_label)

        # Detector output
        self.detected_label = QLabel(
            "Detected State: Collecting data..."
        )

        self.detected_label.setStyleSheet(
            "font-size: 22px;"
            "font-weight: bold;"
            "color: #00B894;"
            "padding: 12px;"
        )

        layout.addWidget(self.detected_label)

        self.fast_alpha_label = QLabel(
            "Fast alpha power (1 s): --"
        )

        layout.addWidget(self.fast_alpha_label)

        # Controls
        controls = QHBoxLayout()

        self.pause_button = QPushButton("Pause")
        self.pause_button.clicked.connect(
            self.toggle_pause
        )

        self.save_button = QPushButton("Export CSV")
        self.save_button.clicked.connect(
            self.export_csv
        )

        self.reset_button = QPushButton("Reset")
        self.reset_button.clicked.connect(
            self.reset
        )

        controls.addWidget(self.pause_button)
        controls.addWidget(self.save_button)
        controls.addWidget(self.reset_button)

        layout.addLayout(controls)

    # -----------------------------------------------------
    # CHANGE SIMULATION STATE
    # -----------------------------------------------------

    def change_mode(self, mode):

        self.mode = mode
        self.simulator.set_mode(mode)

        for name, button in self.buttons.items():
            button.setChecked(name == mode)

    # -----------------------------------------------------
    # LIVE DATA STREAM
    # -----------------------------------------------------

    def update_data(self):

        now = time.perf_counter()

        elapsed = now - self.last_clock
        self.last_clock = now

        if not self.running:
            return

        # Determine number of new samples
        self.sample_fraction += elapsed * FS

        n = int(self.sample_fraction)
        self.sample_fraction -= n

        n = min(n, FS)

        if n <= 0:
            return

        # ================================================
        # EEG DATA SOURCE
        # ================================================

        # Generate synthetic EEG samples
        eeg_uv = self.simulator.generate(n)

        # Simulate the ADC
        measured_uv, adc_counts = simulate_adc(eeg_uv)

        # For real EEG, the synthetic generator and
        # simulated ADC are replaced by serial acquisition.

        # ================================================

        self.buffer.extend(measured_uv)
        self.adc_buffer.extend(adc_counts)

        start_sample = self.total_samples

        for i in range(n):

            timestamp = (start_sample + i) / FS

            self.recording.append((
                timestamp,
                float(measured_uv[i]),
                int(adc_counts[i]),
                self.mode
            ))

        self.total_samples += n

        self.update_graphs()

    # -----------------------------------------------------
    # GRAPHS AND DETECTION
    # -----------------------------------------------------

    def update_graphs(self):

        data = np.asarray(self.buffer)

        if len(data) < 2:
            return

        # ================================================
        # TIME-DOMAIN EEG
        # ================================================

        visible_n = min(
            len(data),
            FS * WINDOW_SECONDS
        )

        visible = data[-visible_n:]

        x = (
            np.arange(visible_n) / FS
            - visible_n / FS
        )

        self.eeg_curve.setData(x, visible)

        # ADC display
        last_adc = self.adc_buffer[-1]

        voltage = (
            last_adc / ADC_MAX * ADC_VMAX
        )

        self.adc_label.setText(
            f"ADC: {last_adc} / {ADC_MAX}"
            f" | Voltage: {voltage:.3f} V"
        )

        # ================================================
        # FAST STATE DETECTION - 1 SECOND
        # ================================================

        detection_n = FS * DETECTION_SECONDS

        if len(data) >= detection_n:

            detection_data = data[-detection_n:]

            det_freqs, det_psd = compute_spectrum(
                detection_data
            )

            fast_alpha = calculate_band_power(
                det_freqs, det_psd, 8, 13
            )

            predicted_state = self.detector.predict(
                fast_alpha
            )

            self.detected_label.setText(
                f"Detected State: {predicted_state}"
            )

            self.fast_alpha_label.setText(
                f"Fast alpha power (1 s): "
                f"{fast_alpha:.2f} uV²"
            )

        # ================================================
        # FFT VISUALIZATION - 4 SECONDS
        # ================================================

        fft_n = FS * FFT_SECONDS

        if len(data) < fft_n:
            return

        fft_data = data[-fft_n:]

        freqs, psd = compute_spectrum(fft_data)

        mask = freqs <= 45

        self.fft_curve.setData(
            freqs[mask],
            psd[mask]
        )

        theta = calculate_band_power(
            freqs, psd, 4, 8
        )

        alpha = calculate_band_power(
            freqs, psd, 8, 13
        )

        beta = calculate_band_power(
            freqs, psd, 13, 30
        )

        self.theta_label.setText(
            f"Theta (4-8 Hz): {theta:.2f} uV²"
        )

        self.alpha_label.setText(
            f"Alpha (8-13 Hz): {alpha:.2f} uV²"
        )

        self.beta_label.setText(
            f"Beta (13-30 Hz): {beta:.2f} uV²"
        )

    # -----------------------------------------------------
    # PAUSE / RESUME
    # -----------------------------------------------------

    def toggle_pause(self):

        self.running = not self.running

        self.last_clock = time.perf_counter()
        self.sample_fraction = 0.0

        self.pause_button.setText(
            "Pause" if self.running else "Resume"
        )

        self.status.setText(
            "LIVE | Synthetic EEG"
            if self.running else
            "PAUSED | Synthetic EEG"
        )

    # -----------------------------------------------------
    # RESET
    # -----------------------------------------------------

    def reset(self):

        self.buffer.clear()
        self.adc_buffer.clear()
        self.recording.clear()
        self.detector = EEGDetector()

        self.total_samples = 0
        self.sample_fraction = 0.0
        self.last_clock = time.perf_counter()

        self.simulator = EEGSimulator()
        self.simulator.set_mode(self.mode)

        self.eeg_curve.setData([], [])
        self.fft_curve.setData([], [])

        self.detected_label.setText(
            "Detected State: Collecting data..."
        )

        self.fast_alpha_label.setText(
            "Fast alpha power (1 s): --"
        )

        self.theta_label.setText("Theta: --")
        self.alpha_label.setText("Alpha: --")
        self.beta_label.setText("Beta: --")

        self.adc_label.setText("ADC: --")

    # -----------------------------------------------------
    # CSV EXPORT
    # -----------------------------------------------------

    def export_csv(self):

        if not self.recording:
            return

        filename, _ = QFileDialog.getSaveFileName(
            self,
            "Export EEG Recording",
            "eeg_simulation.csv",
            "CSV Files (*.csv)"
        )

        if not filename:
            return

        with open(
            filename, "w", newline="", encoding="utf-8"
        ) as file:

            writer = csv.writer(file)

            writer.writerow([
                "time_s",
                "eeg_uv",
                "adc_count",
                "simulated_mode"
            ])

            writer.writerows(self.recording)

        self.status.setText(
            f"Saved {len(self.recording)} samples"
        )


# =========================================================
# ENTRY POINT
# =========================================================

if __name__ == "__main__":

    app = QApplication(sys.argv)

    window = EEGWindow()
    window.show()

    sys.exit(app.exec())

