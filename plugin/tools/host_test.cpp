// Loads the built Luither.vst3 like a DAW would: restores a state, plays MIDI, renders, saves the state again.
// usage: luither_host_test <Luither.vst3> <msgs.json> <note> <out.f32>
#include <juce_audio_processors/juce_audio_processors.h>
#include <cstdio>
int main(int argc, char** argv) {
  juce::ScopedJuceInitialiser_GUI init;
  if (argc < 5) { std::fprintf(stderr, "usage\n"); return 1; }
  juce::AudioPluginFormatManager fm; fm.addFormat(new juce::VST3PluginFormat());
  juce::OwnedArray<juce::PluginDescription> types; juce::VST3PluginFormat vst3;
  vst3.findAllTypesForFile(types, argv[1]); if (types.isEmpty()) { std::fprintf(stderr, "no plugin found\n"); return 2; }
  juce::String err; auto inst = fm.createPluginInstance(*types[0], 48000, 512, err);
  if (!inst) { std::fprintf(stderr, "load failed: %s\n", err.toRawUTF8()); return 3; }
  std::printf("loaded: %s, in %d out %d, midi %d\n", inst->getName().toRawUTF8(), inst->getTotalNumInputChannels(), inst->getTotalNumOutputChannels(), (int) inst->acceptsMidi());
  // a project state: the engine messages + (no) UI config
  auto msgs = juce::JSON::parse(juce::File(argv[2]).loadFileAsString()); auto* m = new juce::DynamicObject();
  if (auto* arr = msgs.getArray()) for (auto& x : *arr) m->setProperty(juce::Identifier(x["t"].toString()), x);
  auto* st = new juce::DynamicObject(); st->setProperty("cfg", ""); st->setProperty("msgs", juce::var(m));
  auto js = juce::JSON::toString(juce::var(st));
  // a DAW stores VST3 state as the plugin's component stream: take the current one and swap our JSON in
  juce::MemoryBlock cur; inst->getStateInformation(cur); auto xml = juce::AudioProcessor::getXmlFromBinary(cur.getData(), (int) cur.getSize());
  juce::MemoryBlock comp; comp.fromBase64Encoding(xml->getChildByName("IComponent")->getAllSubText());
  auto raw = comp.toString(); int at = raw.indexOfChar('{'); std::printf("component stream: %d bytes, JSON at %d\n", (int) comp.getSize(), at);
  juce::MemoryBlock nc; nc.append(comp.getData(), (size_t) juce::jmax(0, at)); nc.append(js.toRawUTF8(), js.getNumBytesAsUTF8());
  auto* ce = xml->getChildByName("IComponent"); ce->deleteAllTextElements(); ce->addTextElement(nc.toBase64Encoding());
  juce::MemoryBlock mb; juce::AudioProcessor::copyXmlToBinary(*xml, mb); inst->setStateInformation(mb.getData(), (int) mb.getSize());
  inst->setPlayConfigDetails(0, 2, 48000, 512); inst->prepareToPlay(48000, 512);
  int note = std::atoi(argv[3]); std::vector<float> out; juce::AudioBuffer<float> buf(2, 512);
  for (int b = 0; b < 48000 * 3 / 512; b++) { juce::MidiBuffer mid; if (b == 0) mid.addEvent(juce::MidiMessage::noteOn(1, note, (juce::uint8) 102), 0);
    if (b == 48000 * 2 / 512) mid.addEvent(juce::MidiMessage::controllerEvent(1, 1, 127), 10);
    buf.clear(); inst->processBlock(buf, mid); for (int i = 0; i < 512; i++) out.push_back((buf.getSample(0, i) + buf.getSample(1, i)) / 2); }
  FILE* f = std::fopen(argv[4], "wb"); std::fwrite(out.data(), 4, out.size(), f); std::fclose(f);
  juce::MemoryBlock saved; inst->getStateInformation(saved);
  auto sx = juce::AudioProcessor::getXmlFromBinary(saved.getData(), (int) saved.getSize()); juce::MemoryBlock sc; sc.fromBase64Encoding(sx->getChildByName("IComponent")->getAllSubText());
  auto sraw = sc.toString(); auto back = juce::JSON::parse(sraw.substring(juce::jmax(0, sraw.indexOfChar('{')))); auto* bm = back["msgs"].getDynamicObject();
  std::printf("state round trip: %d bytes, %d messages kept\n", (int) saved.getSize(), bm ? bm->getProperties().size() : 0);
  float pk = 0; for (auto x : out) pk = std::max(pk, std::abs(x)); std::printf("peak %.1f dBFS, NaN-free %d\n", 20 * std::log10(pk + 1e-9), (int) std::all_of(out.begin(), out.end(), [](float x) { return std::isfinite(x); }));
  inst->releaseResources(); inst.reset(); return 0;
}
