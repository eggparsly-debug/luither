# Luither

A physically modelled string synth, prototyped in the browser on the way to a VST3 plugin.

You build the instrument, and the sound comes from simulating it. Strings, the exciter, the body, and the pickups are all modelled.

Open **`luither.html`** in Chrome, click *Start audio*, and play from a MIDI keyboard or the computer keys (A–; to play, Z/X to change octave, Space for sustain). The **?** button in the header explains the gestures.

## The three faces

- **Builder:** this is where you design the instrument.
  - Strings: any material, any role (stopped, open, drone, sympathetic).
  - Exciters: pick, finger, hammer, bow, e-bow, wind.
  - Fretting hand: fingers, keys/tangents, or slide.
  - Body: a free-form outline with any depth profile. The top can be a wooden plate or a drum head (Mylar, Fiberskyn, calf, goat), with an open-back option.
  - Neck, head, and pegs.
  - Pickups: magnetic, piezo, and mic.
- **Synth:** a Vital-style layer on top of the instrument.
  - Oscillator layer, filters, LFOs, envelopes, and gates.
  - A two-grain pitch shifter and mod FX.
  - Drag-and-drop modulation.
- **Amp & Pedals:** a pedalboard, an amp head, and a cab, with a screen on every effect.

There are 23 factory presets, including guitars, bass, violin family, harps, sitar, tanpura, koto, guzheng, oud, hurdy-gurdy, two banjos, a resonator slide guitar, and a few impossible instruments.

## How it sounds real

- **Strings:** digital waveguides with 3rd-order Lagrange delays. Loss is set per material and per second, so highs decay at measured rates whatever the pitch. Stiffness is fitted to measured inharmonicity, and a bow locks the overtones back into tune.
- **Plucks:** a pluck releases a displaced string, so its spectrum falls off at −6 dB per octave.
- **Magnetic pickups:** the model includes the pickup's 2.5 cm sensing window and a coil-and-cable resonance.
- **Jawari:** a displacement-based curved-bridge contact (the sitar's buzzing bridge) that keeps the note's energy.
- **Bodies:** modal resonators. Plates come from the outline, thickness, material, and bracing. Drum heads are membrane (Bessel) modes from tension, and light heads drain string energy, which gives the banjo its fast, punchy decay.
- **Fret-hand noises:** hammer-on, pull-off, lift, squeak, and slide scrape, each mixed at a level measured against the note.

`realism/` holds the tools that compared Luither against recorded samples (the Tone.js instrument samples, CC-BY 3.0, and FluidR3): harmonic profiles, decay per band, inharmonicity, and spectral balance.

## Files

| File | What it is |
|---|---|
| `dsp.js` | AudioWorklet string engine |
| `synthdsp.js` | Synth engine |
| `ampdsp.js` | Pedals, amp, and cab |
| `biquad.js` | Shared filter design |
| `instdefs.js` | Materials, presets, and level calibration |
| `bodygeo.js` | Body outlines, necks, heads, pegs, and harp frame |
| `synthdefs.js`, `synthui.js` | Synth face |
| `ampdefs.js`, `ampui.js` | Amp face |
| `app.html` | Main page, builder UI, and drawing |
| `build.py` | Inlines everything into the single-file `luither.html` |

## Build and test

```
python3 build.py              # → luither.html
node test.js                  # engine tests: tuning, NaN, exciters, legato
node qa.js inst|cal|sr|amp    # level, CPU, and sample-rate checks; `cal` measures the preset levels
python3 realism/applycal.py   # re-level all presets to about −3 dBFS
node noiseqa.js               # fret-noise levels against the note
node realism/legato.js        # fretless slide vs hammer-on timing
python3 realism/compare.py    # compare against reference recordings (needs the samples in /tmp/refs/wav)
node browser_test.js          # headless Chrome smoke test (serve the folder on :8765 first)
```

## Next

Port the engine to C++ (JUCE) as a VST3, using `realism/` to check the plugin against this prototype note for note.
