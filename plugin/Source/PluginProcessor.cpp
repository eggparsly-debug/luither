#include "PluginProcessor.h"
#include "PluginEditor.h"

LuitherProcessor::LuitherProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
    queue.reserve (256); working.reserve (256);
}

bool LuitherProcessor::isBusesLayoutSupported (const BusesLayout& l) const
{
    auto o = l.getMainOutputChannelSet();
    return o == juce::AudioChannelSet::stereo() || o == juce::AudioChannelSet::mono();
}

// the messages that make up an instrument, in the order they're replayed into a fresh engine
static const char* STATE_KEYS[] = { "sdefs", "ex", "nk", "pk", "strings", "modes", "synth", "amp" };

void LuitherProcessor::prepareToPlay (double sampleRate, int)
{
    if (engine && std::abs (sampleRate - currentRate) < 1) return;
    currentRate = sampleRate;
    engine = std::make_unique<luither::Engine> (sampleRate);
    const juce::ScopedLock sl (stateLock);
    for (auto* k : STATE_KEYS) if (auto it = lastMsg.find (k); it != lastMsg.end()) engine->msg (it->second);
}

void LuitherProcessor::uiMessage (const juce::var& m)
{
    auto t = m["t"].toString();
    if (t == "purity")
    {
        auto v = m["v"]; purityRoot = (int) v["root"];
        std::array<bool, 12> sc {}; if (auto* a = v["set"].getArray()) for (auto& x : *a) { int i = ((int) x % 12 + 12) % 12; sc[(size_t) i] = true; }
        purityScale = sc; purityOn = (bool) v["on"];
        const juce::ScopedLock sl (stateLock); lastMsg["purity"] = m; return;
    }
    if (t != "on" && t != "off" && t != "sus" && t != "bend" && t != "panic" && t != "mw")
    { const juce::ScopedLock sl (stateLock); lastMsg[t.toStdString()] = m; }
    const juce::SpinLock::ScopedLockType sl (queueLock);
    queue.push_back (m);
}

void LuitherProcessor::applyQueued()
{
    { const juce::SpinLock::ScopedTryLockType sl (queueLock); if (! sl.isLocked() || queue.empty()) return; working.swap (queue); }
    for (auto& m : working) engine->msg (m);
    working.clear();
}

double LuitherProcessor::snap (double n) const
{
    if (! purityOn) return n;
    auto in = [this] (double x) { int pc = (((int) x - purityRoot) % 12 + 12) % 12; return purityScale[(size_t) pc]; };
    for (int d = 0; d < 12; d++) { if (in (n + d)) return n + d; if (in (n - d)) return n - d; }
    return n;
}

// the mod wheel works even with the window closed: vibrato on plucked/struck strings, pressure on a bow, strength on e-bow / wind
void LuitherProcessor::modWheel (double v)
{
    auto& e = *engine; auto t = e.ex.type;
    if (t == luither::Ex::bow) e.ex.pressure = e.exBase.pressure = v;
    else if (t == luither::Ex::ebow) e.ex.ebow = e.exBase.ebow = v;
    else if (t == luither::Ex::wind) e.ex.wind = e.exBase.wind = v;
    else { e.ex.vibDepth = e.exBase.vibDepth = std::round (35 * v); e.ex.vibDelay = e.exBase.vibDelay = 0; }
    e.derive(); e.syn->src[luither::S_MW] = v;
}

void LuitherProcessor::handleMidi (const juce::MidiMessage& m)
{
    auto push = [this] (int kind, int a, float b) {
        int s1, n1, s2, n2; evFifo.prepareToWrite (1, s1, n1, s2, n2);
        if (n1 > 0) evBuf[(size_t) s1] = { kind, a, b }; else if (n2 > 0) evBuf[(size_t) s2] = { kind, a, b };
        evFifo.finishedWrite (n1 + n2); };
    if (m.isNoteOn())
    {
        int k = m.getNoteNumber(); if (auto it = keyMap.find (k); it != keyMap.end()) engine->noteOff (it->second);
        double n = snap (k); keyMap[k] = n; engine->noteOn (n, m.getFloatVelocity()); push (0, k, m.getFloatVelocity());
    }
    else if (m.isNoteOff())
    {
        int k = m.getNoteNumber(); double n = k; if (auto it = keyMap.find (k); it != keyMap.end()) { n = it->second; keyMap.erase (it); }
        engine->noteOff (n); push (1, k, 0);
    }
    else if (m.isPitchWheel()) engine->bendSemis = ((m.getPitchWheelValue() - 8192) / 8192.0) * engine->nk.pbRange;
    else if (m.isController())
    {
        int cc = m.getControllerNumber(), val = m.getControllerValue();
        if (cc == 64) engine->setSus (val >= 64);
        else if (cc == 120 || cc == 123) { engine->panic(); keyMap.clear(); }
        else { if (cc == 1) modWheel (val / 127.0); push (2, cc, (float) val); }
    }
    else if (m.isAllNotesOff() || m.isAllSoundOff()) { engine->panic(); keyMap.clear(); }
}

int LuitherProcessor::popHostEvents (HostEvent* out, int max)
{
    int s1, n1, s2, n2; evFifo.prepareToRead (max, s1, n1, s2, n2);
    for (int i = 0; i < n1; i++) out[i] = evBuf[(size_t) (s1 + i)];
    for (int i = 0; i < n2; i++) out[n1 + i] = evBuf[(size_t) (s2 + i)];
    evFifo.finishedRead (n1 + n2); return n1 + n2;
}

void LuitherProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int total = buffer.getNumSamples(), nch = buffer.getNumChannels();
    if (! engine) { buffer.clear(); return; }
    applyQueued();
    float L[128], R[128];
    auto it = midi.begin(); int pos = 0;
    while (pos < total)
    {
        while (it != midi.end() && (*it).samplePosition <= pos) { handleMidi ((*it).getMessage()); ++it; }
        int next = it != midi.end() ? std::min (total, std::max (pos + 1, (*it).samplePosition)) : total;
        int n = std::min (128, next - pos);
        engine->process (L, R, n);
        if (nch >= 2) { buffer.copyFrom (0, pos, L, n); buffer.copyFrom (1, pos, R, n); }
        else if (nch == 1) { for (int i = 0; i < n; i++) L[i] = (L[i] + R[i]) * .5f; buffer.copyFrom (0, pos, L, n); }
        pos += n;
        if (++vizBlk >= 6) { vizBlk = 0; if (editorOpen) { auto v = engine->viz(); const juce::SpinLock::ScopedLockType sl (vizLock); vizPending = std::move (v); } }
    }
    for (; it != midi.end(); ++it) handleMidi ((*it).getMessage());
    for (int c = 2; c < nch; c++) buffer.clear (c, 0, total);
}

void LuitherProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto* o = new juce::DynamicObject(); auto* msgs = new juce::DynamicObject();
    { const juce::ScopedLock sl (stateLock); o->setProperty ("cfg", uiCfg); for (auto& [k, v] : lastMsg) msgs->setProperty (juce::Identifier (k), v); }
    o->setProperty ("msgs", juce::var (msgs)); o->setProperty ("version", 1);
    juce::MemoryOutputStream out (destData, false); out << juce::JSON::toString (juce::var (o), true);
}

void LuitherProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    auto v = juce::JSON::parse (juce::String::fromUTF8 ((const char*) data, sizeInBytes));
    if (! v.isObject()) return;
    {
        const juce::ScopedLock sl (stateLock); uiCfg = v["cfg"].toString(); lastMsg.clear();
        if (auto* m = v["msgs"].getDynamicObject()) for (auto& kv : m->getProperties()) lastMsg[kv.name.toString().toStdString()] = kv.value;
    }
    // replay into the engine (queued, so it lands on the audio thread between blocks)
    for (auto* k : STATE_KEYS) { const juce::ScopedLock sl (stateLock); if (auto it = lastMsg.find (k); it != lastMsg.end()) { const juce::SpinLock::ScopedLockType ql (queueLock); queue.push_back (it->second); } }
    { juce::var p; { const juce::ScopedLock sl (stateLock); if (auto it = lastMsg.find ("purity"); it != lastMsg.end()) p = it->second; } if (! p.isVoid()) uiMessage (p); }
    restoreCount++;
}

juce::AudioProcessorEditor* LuitherProcessor::createEditor() { return new LuitherEditor (*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new LuitherProcessor(); }
