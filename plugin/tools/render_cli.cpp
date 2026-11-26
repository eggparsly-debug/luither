// Offline renderer for the C++ engine: replays the JSON messages render.js sends, plays one note, writes mono f32.
// usage: luither_render <messages.json> <midi> <vel> <hold s> <total s> <out.f32> [sampleRate]
#include "../Source/LuitherEngine.h"
#include <cstdio>
int main(int argc, char** argv) {
  if (argc < 7) { std::fprintf(stderr, "usage: luither_render msgs.json note vel hold total out.f32 [sr]\n"); return 1; }
  double sr = argc > 7 ? std::atof(argv[7]) : 48000;
  auto msgs = juce::JSON::parse(juce::File(juce::File::getCurrentWorkingDirectory().getChildFile(argv[1])).loadFileAsString());
  luither::Engine e(sr); e.seed = 4242;
  if (auto* arr = msgs.getArray()) for (auto& m : *arr) e.msg(m);
  double note = std::atof(argv[2]), vel = std::atof(argv[3]), hold = std::atof(argv[4]), tot = std::atof(argv[5]);
  int N = (int) std::round(tot * sr), off = (int) std::round(hold * sr); std::vector<float> M(N); float l[128], r[128];
  e.noteOn(note, vel); bool sent = false;
  for (int i = 0; i < N; i += 128) { if (!sent && i >= off) { e.noteOff(note); sent = true; } e.process(l, r, 128); for (int k = 0; k < 128 && i + k < N; k++) M[i + k] = (l[k] + r[k]) / 2; }
  FILE* f = std::fopen(argv[6], "wb"); std::fwrite(M.data(), 4, M.size(), f); std::fclose(f); return 0;
}
