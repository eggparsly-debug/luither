#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "LuitherEngine.h"

// Luither as a plugin: the C++ engine plays; the web UI (the same page as the browser prototype) edits.
// The UI talks to the engine with the same { t, v } messages it used to send to its AudioWorklet.
class LuitherProcessor : public juce::AudioProcessor
{
public:
    LuitherProcessor();
    ~LuitherProcessor() override = default;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return "Luither"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 4.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return "Default"; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    // ── from the UI (message thread)
    void uiMessage (const juce::var& m);            // an engine message: queued for the audio thread, remembered for saving
    void setUiConfig (const juce::String& json) { const juce::ScopedLock sl (stateLock); uiCfg = json; }
    juce::String getUiConfig() const { const juce::ScopedLock sl (stateLock); return uiCfg; }
    double getEngineRate() const { return currentRate; }

    // ── to the UI (polled by the editor's timer on the message thread)
    struct HostEvent { int kind; int a; float b; };  // kind: 0 note on, 1 note off, 2 controller, 3 pitch bend
    int popHostEvents (HostEvent* out, int max);
    bool takeViz (juce::var& out) { const juce::SpinLock::ScopedLockType sl (vizLock); if (vizPending.isVoid()) return false; out = std::move (vizPending); vizPending = juce::var(); return true; }
    std::atomic<bool> editorOpen { false };
    std::atomic<int> restoreCount { 0 };             // bumped when the host restores a project, so an open UI reloads

private:
    void applyQueued();
    void handleMidi (const juce::MidiMessage& m);
    void modWheel (double v);
    double snap (double n) const;

    std::unique_ptr<luither::Engine> engine;
    double currentRate = 48000;
    juce::SpinLock queueLock; std::vector<juce::var> queue, working;
    juce::CriticalSection stateLock; std::map<std::string, juce::var> lastMsg; juce::String uiCfg;
    juce::SpinLock vizLock; juce::var vizPending; int vizBlk = 0;
    juce::AbstractFifo evFifo { 512 }; std::array<HostEvent, 512> evBuf {};
    std::map<int, double> keyMap;                    // host key → played (scale-snapped) note
    // scale purity, mirrored from the UI so host notes snap too
    std::atomic<bool> purityOn { false }; int purityRoot = 0; std::array<bool, 12> purityScale {};
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LuitherProcessor)
};
