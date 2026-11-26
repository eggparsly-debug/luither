// Luither — C++ port of the browser engine (biquad.js, synthdsp.js, ampdsp.js, dsp.js).
// The port is deliberately line-for-line so the plugin sounds like the prototype; comments name the JS it mirrors.
// Messages are the same { t, v } objects the web UI already sends, as juce::var.
#pragma once
#include <juce_core/juce_core.h>
#include <cmath>
#include <vector>
#include <string>
#include <map>
#include <unordered_map>
#include <memory>
#include <array>
#include <algorithm>
#include <random>

namespace luither {

constexpr double PI = 3.14159265358979323846, TWO_PI = 2 * PI;
inline double fz(double x) { return (x > 1e-15 || x < -1e-15) ? x : 0; }
inline double jsRound(double x) { return std::floor(x + 0.5); }
inline double clamp01(double x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
inline double dbToLin(double d) { return std::pow(10.0, d / 20); }

// Math.random()
struct Rng { std::mt19937 g { 1234567u }; double operator()() { return std::uniform_real_distribution<double>(0, 1)(g); } };
inline Rng& rnd() { static thread_local Rng r; return r; }

// ── var helpers: JS `x.k ?? def` / `x.k || def`
inline bool has(const juce::var& o, const char* k) { auto* d = o.getDynamicObject(); return d && d->hasProperty(k) && !d->getProperty(k).isVoid() && !d->getProperty(k).isUndefined(); }
inline double num(const juce::var& o, const char* k, double def) { // ??
  if (!has(o, k)) return def; auto v = o[k]; if (v.isBool()) return (bool) v ? 1 : 0; if (v.isString()) return v.toString().getDoubleValue(); return (double) v; }
inline double numOr(const juce::var& o, const char* k, double def) { double v = num(o, k, 0); return v != 0 && std::isfinite(v) ? v : def; } // ||
inline bool flag(const juce::var& o, const char* k, bool def = false) { if (!has(o, k)) return def; auto v = o[k]; if (v.isBool()) return (bool) v; if (v.isString()) return v.toString().isNotEmpty(); return (double) v != 0; }
inline std::string str(const juce::var& o, const char* k, const std::string& def = "") { if (!has(o, k)) return def; return o[k].toString().toStdString(); }

// divBeats('1/8.') etc.
inline double divBeats(const std::string& d) {
  auto sl = d.find('/'); if (sl == std::string::npos) return 1;
  try { double a = std::stod(d.substr(0, sl)); std::string rest = d.substr(sl + 1); char suf = 0;
    if (!rest.empty() && (rest.back() == '.' || rest.back() == 't')) { suf = rest.back(); rest.pop_back(); }
    double b = std::stod(rest); return 4 * a / b * (suf == '.' ? 1.5 : suf == 't' ? 2.0 / 3 : 1); } catch (...) { return 1; }
}

// ───────────── biquad.js ─────────────
enum class BQ { lp, hp, bp, notch, ap, peak, ls, hs, none };
inline BQ bqType(const std::string& t) {
  if (t == "lp") return BQ::lp; if (t == "hp") return BQ::hp; if (t == "bp") return BQ::bp; if (t == "notch") return BQ::notch;
  if (t == "ap") return BQ::ap; if (t == "peak") return BQ::peak; if (t == "ls") return BQ::ls; if (t == "hs") return BQ::hs; return BQ::none; }
inline std::array<double, 5> bqCoefs(BQ type, double f, double q, double gdb, double fs) {
  f = std::max(10.0, std::min(f, fs * 0.45)); q = std::max(0.05, q != 0 ? q : 0.707);
  double w = 2 * PI * f / fs, cw = std::cos(w), sw = std::sin(w), al = sw / (2 * q), A = std::pow(10.0, gdb / 40);
  double b0, b1, b2, a0, a1, a2;
  switch (type) {
    case BQ::lp: b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case BQ::hp: b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case BQ::bp: b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case BQ::notch: b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case BQ::ap: b0 = 1 - al; b1 = -2 * cw; b2 = 1 + al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case BQ::peak: b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case BQ::ls: { double s = 2 * std::sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break; }
    case BQ::hs: { double s = 2 * std::sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break; }
    default: return { 1, 0, 0, 0, 0 };
  }
  return { b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0 };
}
struct FDesign { BQ t; double f, q, g; };
struct StackV { double bf, mf, mq, base, tf, bw, mw, tw; };
inline StackV stackOf(const std::string& s) {
  if (s == "fender") return { 110, 420, .6, -7, 2600, 2.4, 1.4, 2.6 };
  if (s == "vox") return { 130, 1000, .8, -4, 3400, 1.8, 1.3, 3 };
  if (s == "modern") return { 90, 750, .9, -3, 2800, 2, 2, 2.2 };
  if (s == "flat") return { 80, 800, .7, 0, 3000, 2.4, 1.6, 2.4 };
  return { 120, 650, .7, -2.5, 3000, 2.2, 1.6, 2.4 }; // marshall (default)
}
inline std::vector<FDesign> toneStackDesign(const juce::var& h) {
  auto s = stackOf(str(h, "stack", "marshall")); std::vector<FDesign> out;
  double bass = num(h, "bass", 5), mid = num(h, "mid", 5), tr = num(h, "treble", 5), pres = num(h, "presence", 5), res = num(h, "resonance", 0), gain = num(h, "gain", 5);
  out.push_back({ BQ::ls, s.bf, .7, (bass - 5) * s.bw });
  out.push_back({ BQ::peak, s.mf, s.mq, s.base * (1 - mid / 10 * .6) + (mid - 5) * s.mw });
  out.push_back({ BQ::hs, s.tf, .7, (tr - 5) * s.tw });
  out.push_back({ BQ::hs, 3800, .6, (pres - 5) * 1.4 });
  out.push_back({ BQ::peak, 100, 1.1, res * 6 });
  if (flag(h, "bright")) out.push_back({ BQ::hs, 2200, .7, 6 * (1 - std::min(1.0, gain / 10) * .7) });
  return out;
}
inline std::vector<FDesign> cabDesign(const juce::var& c) {
  struct Box { double hp; double bump[3]; double dip[3]; }; struct Spk { double pk[3], pk2[3], lp; };
  auto cab = str(c, "cab", "4x12"), spk = str(c, "speaker", "v30"), mic = str(c, "mic", "dyn57");
  Box b = { 65, { 95, 1.5, 5.5 }, { 400, .9, -1.5 } };
  if (cab == "1x12 open") b = { 85, { 95, 1.2, 1 }, { 180, 1.2, -2 } }; else if (cab == "2x12 open") b = { 75, { 100, 1.1, 2.5 }, { 200, 1.4, -1.5 } };
  else if (cab == "2x12 closed") b = { 70, { 105, 1.3, 4 }, { 300, 1, -1 } }; else if (cab == "1x15 bass") b = { 38, { 60, 1.2, 4 }, { 500, .8, -2 } };
  else if (cab == "8x10 bass") b = { 42, { 75, 1.1, 5 }, { 900, 1, -1 } };
  Spk s = { { 2400, 1.3, 4.5 }, { 1200, 1, 1.5 }, 5200 };
  if (spk == "green") s = { { 1500, 1.1, 3 }, { 3000, 2, -2 }, 4500 }; else if (spk == "alnico") s = { { 3000, 1.4, 4 }, { 700, 1, -1.5 }, 6500 };
  else if (spk == "jensen") s = { { 2200, 1.2, 2 }, { 500, .8, -2.5 }, 5500 }; else if (spk == "bass") s = { { 800, 1, 2 }, { 2200, 1, -3 }, 3200 };
  else if (spk == "fullrange") s = { { 3000, 1, 0 }, { 800, 1, 0 }, 14000 };
  double pos = num(c, "pos", .3), dist = num(c, "dist", .3);
  std::vector<FDesign> out = { { BQ::hp, b.hp, .8, 0 }, { BQ::peak, b.bump[0], b.bump[1], b.bump[2] }, { BQ::peak, b.dip[0], b.dip[1], b.dip[2] },
    { BQ::peak, s.pk[0], s.pk[1], s.pk[2] }, { BQ::peak, s.pk2[0], s.pk2[1], s.pk2[2] } };
  double lp = s.lp * (1 - pos * .45);
  out.push_back({ BQ::lp, lp, .8, 0 }); out.push_back({ BQ::lp, lp * 1.15, .6, 0 });
  out.push_back({ BQ::peak, 3500, .8, (0.5 - pos) * 6 });
  if (mic == "ribbon") { out.push_back({ BQ::hs, 4000, .7, -6 }); out.push_back({ BQ::ls, 160, .7, 2.5 }); }
  else if (mic == "cond") { out.push_back({ BQ::hs, 9000, .7, 2.5 }); out.push_back({ BQ::peak, 2500, .9, 1 }); }
  else { out.push_back({ BQ::hp, 90, .7, 0 }); out.push_back({ BQ::peak, 5500, 1.5, 5 }); }
  out.push_back({ BQ::ls, 200, .7, (0.5 - dist) * 5 });
  return out;
}

// ───────────── ampdsp.js ─────────────
struct Biq {
  double z1 = 0, z2 = 0; std::array<double, 5> c { 1, 0, 0, 0, 0 };
  Biq& set(BQ t, double f, double q, double g, double fs) { c = bqCoefs(t, f, q, g, fs); return *this; }
  inline double run(double x) { double y = c[0] * x + z1; double z = c[1] * x - c[3] * y + z2; z1 = fz(z); z = c[2] * x - c[4] * y; z2 = fz(z); return y; }
};
struct OS2 {
  Biq u[2], d[2]; double a = 0, b = 0;
  explicit OS2(double fs = 48000) { double f2 = fs * 2; u[0].set(BQ::lp, fs * .45, .54, 0, f2); u[1].set(BQ::lp, fs * .45, 1.31, 0, f2); d[0].set(BQ::lp, fs * .45, .54, 0, f2); d[1].set(BQ::lp, fs * .45, 1.31, 0, f2); }
  inline void up(double x) { a = u[1].run(u[0].run(x * 2)); b = u[1].run(u[0].run(0)); }
  inline double down(double A, double B) { double y = d[1].run(d[0].run(A)); d[1].run(d[0].run(B)); return y; }
};
struct DL {
  std::vector<float> b; int k = 0, w = 0;
  explicit DL(int n = 16) { int m = 1; while (m < n + 2) m <<= 1; b.assign(m, 0); k = m - 1; }
  inline void put(double x) { b[w] = (float) fz(x); w = (w + 1) & k; }
  inline double get(double d) const { double rp = w - 1 - d; int i = (int) std::floor(rp); double f = rp - i; double a = b[i & k]; return a + (b[(i + 1) & k] - a) * f; }
};
inline double tanhF(double x) { return x < -3 ? -1 : x > 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x); }
inline double hardClip(double x) { return x <= -1.5 ? -1 : x >= 1.5 ? 1 : x - x * x * x / 6.75; }
constexpr double REF = .3;
inline double dcorr(const std::string& t, double v) {
  static const std::map<std::string, std::array<double, 5>> C = { { "od", { 1.7, 4.2, 1.9, .7, -.8 } }, { "dist", { .1, -6.9, -9.2, -10.5, -11 } },
    { "fuzz", { 6.9, -1.7, -4.1, -5.3, -6.1 } }, { "octave", { -4.6, -1.3, -3.2, -4.7, -5.6 } }, { "amp", { 12.5, 7.5, 3.5, .4, -.8 } } };
  auto& c = C.at(t); double x = clamp01(v) * 4; int i = std::min(3, (int) std::floor(x)); return dbToLin(c[i] + (c[i + 1] - c[i]) * (x - i));
}

struct AmpRack;
using VMap = std::vector<std::pair<std::string, double>>;
inline void vset(VMap& m, const std::string& k, double v) { for (auto& p : m) if (p.first == k) { p.second = v; return; } m.push_back({ k, v }); }
inline double vget(const VMap& m, const std::string& k, double def = NAN) { for (auto& p : m) if (p.first == k) return p.second; return def; }

struct Pedal {
  double fs; AmpRack* rack; std::unordered_map<std::string, double> p; juce::var o { new juce::DynamicObject() }; VMap v; double mix = 0; bool on = true; std::string type;
  double l = 0, r = 0;
  Pedal(double f, AmpRack* rk) : fs(f), rack(rk) {}
  virtual ~Pedal() = default;
  double P(const char* k, double def = NAN) const { auto it = p.find(k); return it == p.end() ? def : it->second; } // p.k (undefined → NaN unless def)
  double Por(const char* k, double def) const { double x = P(k, 0); return x != 0 && std::isfinite(x) ? x : def; } // p.k || def
  void setP(const juce::var& pp, const juce::var& oo) {
    if (auto* d = pp.getDynamicObject()) for (auto& kv : d->getProperties()) { auto& x = kv.value; p[kv.name.toString().toStdString()] = x.isBool() ? ((bool) x ? 1 : 0) : (double) x; }
    if (auto* d = oo.getDynamicObject()) for (auto& kv : d->getProperties()) o.getDynamicObject()->setProperty(kv.name, kv.value);
    update(); }
  virtual void update() {} virtual void block(int) {} virtual void run(double L, double R) { l = L; r = R; }
};
struct Comp : Pedal { double env = 0, gr = 0, at = 0, rt = 0, mk = 1; using Pedal::Pedal;
  void update() override { at = 1 - std::exp(-1 / (Por("attack", 5) * .001 * fs)); rt = 1 - std::exp(-1 / (Por("release", 120) * .001 * fs)); mk = dbToLin(Por("makeup", 0)); }
  void run(double L, double R) override { double a = std::max(std::abs(L), std::abs(R)); env += (a - env) * (a > env ? at : rt);
    double db = 20 * std::log10(env + 1e-9), over = db - P("thresh"), knee = 6, ratio = P("ratio");
    double g_ = over <= -knee / 2 ? 0 : over >= knee / 2 ? over * (1 - 1 / ratio) : std::pow(over + knee / 2, 2) / (2 * knee) * (1 - 1 / ratio);
    gr = g_; double g = dbToLin(-g_) * mk, b = P("blend", 1); l = L * (1 - b) + L * g * b; r = R * (1 - b) + R * g * b;
    double vg = vget(v, "gr"); if (g_ > vg || !(vg > 0)) vset(v, "gr", g_); } };
struct Boost : Pedal { Biq f[2][2]; double g = 1; using Pedal::Pedal;
  void update() override { double t = Por("tone", 0); for (auto& c : f) { c[0].set(BQ::ls, 250, .7, -t * 6, fs); c[1].set(BQ::hs, 2500, .7, t * 6, fs); } g = dbToLin(Por("gain", 0)); }
  void run(double L, double R) override { l = tanhF(f[0][1].run(f[0][0].run(L)) * g * .9) / .9; r = tanhF(f[1][1].run(f[1][0].run(R)) * g * .9) / .9; } };
struct Drive : Pedal { OS2 os[2]; double pk = 0, curveGain = 1; Drive(double f, AmpRack* rk) : Pedal(f, rk) { os[0] = OS2(f); os[1] = OS2(f); }
  virtual double one(double x, int k) = 0;
  void run(double L, double R) override { l = one(L, 0); r = one(R, 1); double a = std::max(std::abs(L), std::abs(R)); if (a > pk) pk = a; }
  void block(int) override { vset(v, "in", pk); vset(v, "drive", curveGain); pk *= .9; } };
struct Overdrive : Drive { struct Ch { Biq hp, tone, out; } ch[2]; double g = 1, nrm = 1, lvl = 1; using Drive::Drive;
  void update() override { g = 1 + P("drive") * 25; curveGain = g; nrm = 1 / tanhF(g * REF * .6); lvl = dbToLin(Por("level", 0)) * .42 * dcorr("od", P("drive"));
    for (auto& c : ch) { c.hp.set(BQ::hp, 720, .7, 0, fs); c.tone.set(BQ::lp, 700 * std::pow(10.0, P("tone") * 1.05), .7, 0, fs); c.out.set(BQ::hp, 40, .7, 0, fs); } }
  double one(double x, int k) override { auto& c = ch[k]; double h = c.hp.run(x); auto& o2 = os[k]; o2.up(h); double y = o2.down(tanhF(o2.a * g), tanhF(o2.b * g)) * nrm * .35 + x * .6;
    return c.out.run(c.tone.run(y)) * lvl; } };
struct Distortion : Drive { struct Ch { Biq op, filt, pre, fizz; } ch[2]; double g = 1, nrm = 1, lvl = 1; using Drive::Drive;
  static double cl(double v) { return .5 * tanhF(v) + .5 * hardClip(v); }
  void update() override { g = 1 + P("dist") * 80; curveGain = g; nrm = 1 / cl(g * REF); lvl = dbToLin(Por("level", 0)) * .26 * dcorr("dist", P("dist"));
    for (auto& c : ch) { c.pre.set(BQ::hp, 100, .7, 0, fs); c.fizz.set(BQ::lp, 7500, .6, 0, fs); c.op.set(BQ::lp, std::max(900.0, 90000 / g), .7, 0, fs); c.filt.set(BQ::lp, 15000 * std::pow(600.0 / 15000, P("filter")), .7, 0, fs); } }
  double one(double x, int k) override { auto& c = ch[k]; auto& o2 = os[k]; o2.up(c.op.run(c.pre.run(x))); double y = o2.down(cl(o2.a * g), cl(o2.b * g)); return c.fizz.run(c.filt.run(y)) * nrm * lvl; } };
struct Fuzz : Drive { struct Ch { Biq hp, lp, hp2, dc, fizz; } ch[2]; double g1 = 1, nrm = 1, lvl = 1; using Drive::Drive;
  double nl(double v) const { v = tanhF(v * g1 + .15) - .149; return tanhF(v * 4 + .1) - .0997; }
  void update() override { g1 = 1 + P("sustain") * 20; curveGain = g1 * 4; nrm = 1 / std::max(.05, std::abs(nl(REF))); lvl = dbToLin(Por("level", 0)) * .3 * dcorr("fuzz", P("sustain"));
    for (auto& c : ch) { c.fizz.set(BQ::lp, 7000, .6, 0, fs); c.hp.set(BQ::hp, 110, .7, 0, fs); c.lp.set(BQ::lp, 500, .6, 0, fs); c.hp2.set(BQ::hp, 1200, .6, 0, fs); c.dc.set(BQ::hp, 25, .7, 0, fs); } }
  double one(double x, int k) override { auto& c = ch[k]; double tn = P("tone"); auto& o2 = os[k]; o2.up(c.hp.run(x)); double y = o2.down(nl(o2.a), nl(o2.b));
    y = c.fizz.run(c.dc.run(y)); return (c.lp.run(y) * (1 - tn) * 1.6 + c.hp2.run(y) * tn * 1.3) * nrm * lvl; } };
struct OctaveFuzz : Drive { struct Ch { Biq hp, dc, lp; } ch[2]; double g = 1, nrm = 1, lvl = 1; using Drive::Drive;
  static double nl(double v, double oc) { double f = tanhF(v); return f * (1 - oc) + (std::abs(f) * 2 - .6) * oc; }
  void update() override { g = 1 + P("fuzz") * 20; curveGain = g; nrm = 1 / tanhF(g * REF); lvl = dbToLin(Por("level", 0)) * .32 * dcorr("octave", P("fuzz"));
    for (auto& c : ch) { c.hp.set(BQ::hp, 150, .7, 0, fs); c.dc.set(BQ::hp, 40, .7, 0, fs); c.lp.set(BQ::lp, 5000, .7, 0, fs); } }
  double one(double x, int k) override { auto& c = ch[k]; double oc = P("octave"), h = c.hp.run(x); auto& o2 = os[k]; o2.up(h); double y = o2.down(nl(o2.a * g, oc), nl(o2.b * g, oc));
    return c.lp.run(c.dc.run(y)) * nrm * lvl; } };
struct Crusher : Pedal { int cnt = 0; double hl = 0, hr = 0; using Pedal::Pedal;
  void run(double L, double R) override { double step = std::pow(2.0, Por("bits", 8) - 1);
    if (++cnt >= Por("down", 1)) { cnt = 0; hl = jsRound(L * step) / step; hr = jsRound(R * step) / step; }
    double m = P("mix", 1); l = L * (1 - m) + hl * m; r = R * (1 - m) + hr * m; } };
struct Phaser : Pedal { double ph = 0, st[2][24] {}, fb[2] {}, a[2] {}; bool hasA = false; using Pedal::Pedal;
  void block(int n) override; // needs rack tempo
  double one(double x, int k) { int ns = (int) num(o, "stages", 0); if (ns <= 0) ns = 6; ns = std::min(24, ns); double* s = st[k]; double A = hasA ? a[k] : 0; double y = x + fb[k] * P("fb");
    for (int i = 0; i < ns; i++) { double oo = A * y + s[i]; s[i] = fz(y - A * oo); y = oo; }
    fb[k] = y; double m = P("mix"); return (x * (1 - m * .5) + y * m * .5) * (1 + m * .3); }
  void run(double L, double R) override { l = one(L, 0); r = one(R, 1); } };
struct Rotary : Pedal { double hp = 0, dp = 0, hs = .8, ds = .66; Biq x, xh; DL dh { 2048 }, dd { 2048 }; double HL[4] {}, HR[4] {}, DLr[4] {}, DRr[4] {}; int j = 0; bool hasHL = false;
  using Pedal::Pedal;
  void update() override { x.set(BQ::lp, 800, .7, 0, fs); xh.set(BQ::hp, 800, .7, 0, fs); }
  void block(int n) override { bool fast = flag(o, "fast"); double dt = n / fs, sp = PI * P("spread", .6);
    hs += ((fast ? 6.8 : .8) - hs) * std::min(1.0, dt / .7); ds += ((fast ? 5.9 : .66) - ds) * std::min(1.0, dt / 3);
    double h0 = 2 * PI * hp, d0 = 2 * PI * dp; hp = std::fmod(hp + hs * dt, 1.0); dp = std::fmod(dp + ds * dt, 1.0); vset(v, "hp", hp); vset(v, "dp", dp); vset(v, "fast", fast ? 1 : 0);
    double h1 = 2 * PI * hp, d1 = 2 * PI * dp; if (h1 < h0) h1 += 2 * PI; if (d1 < d0) d1 += 2 * PI;
    auto tr = [n](double* o4, double a0, double a1) { o4[0] = std::sin(a0); o4[1] = std::cos(a0); o4[2] = (std::sin(a1) - std::sin(a0)) / n; o4[3] = (std::cos(a1) - std::cos(a0)) / n; };
    tr(HL, h0, h1); tr(HR, h0 + sp, h1 + sp); tr(DLr, d0, d1); tr(DRr, d0 + sp, d1 + sp); j = 0; hasHL = true; }
  void run(double L, double R) override { double X = (L + R) * .5; double dr = P("drive"); if (dr > .01) X = std::tanh(X * (1 + dr * 6)) / (1 + dr * 2);
    double lo = x.run(X), hi = xh.run(X); if (!hasHL) block(128);
    int J = j++; dh.put(hi); dd.put(lo);
    double hl = dh.get(fs * (.0012 + .00035 * (HL[0] + HL[2] * J))) * (1 - .45 * (HL[1] + HL[3] * J)), hr = dh.get(fs * (.0012 + .00035 * (HR[0] + HR[2] * J))) * (1 - .45 * (HR[1] + HR[3] * J));
    double dl = dd.get(fs * (.002 + .0002 * (DLr[0] + DLr[2] * J))) * (1 - .3 * (DLr[1] + DLr[3] * J)), drr = dd.get(fs * (.002 + .0002 * (DRr[0] + DRr[2] * J))) * (1 - .3 * (DRr[1] + DRr[3] * J));
    double bal = P("balance"); l = (hl * bal + dl * (1 - bal)) * 1.4; r = (hr * bal + drr * (1 - bal)) * 1.4; } };
struct Gate : Pedal { double env = 0, g = 1, rt = 0, at = 0; using Pedal::Pedal;
  void update() override { rt = 1 - std::exp(-1 / (Por("release", 80) * .001 * fs)); at = 1 - std::exp(-1 / (.0005 * fs)); }
  void run(double L, double R) override { double a = std::max(std::abs(L), std::abs(R)); env += (a - env) * (a > env ? .2 : .002);
    double th = dbToLin(P("thresh")); bool open = env > th || (g > .5 && env > th * .5); double tgt = open ? 1 : dbToLin(-P("range"));
    g += (tgt - g) * (tgt > g ? at : rt); l = L * g; r = R * g; vset(v, "open", g); } };
struct GEQ : Pedal { Biq b[2][7]; double lv = 1; using Pedal::Pedal;
  void update() override { static const double F[7] = { 100, 200, 400, 800, 1600, 3200, 6400 }; for (auto& ch : b) for (int i = 0; i < 7; i++) { std::string k = "b" + std::to_string(i); ch[i].set(BQ::peak, F[i], 1.1, Por(k.c_str(), 0), fs); } lv = dbToLin(Por("level", 0)); }
  void run(double L, double R) override { for (auto& q : b[0]) L = q.run(L); for (auto& q : b[1]) R = q.run(R); l = L * lv; r = R * lv; } };
struct DelayPedal : Pedal { DL d[2]; double t, tt, wph = 0; Biq lp[2], hp[2];
  DelayPedal(double f, AmpRack* rk) : Pedal(f, rk), d { DL((int) std::ceil(f * 2.2)), DL((int) std::ceil(f * 2.2)) }, t(f * .35), tt(f * .35) {}
  void update() override { for (int k = 0; k < 2; k++) { lp[k].set(BQ::lp, P("tone"), .7, 0, fs); hp[k].set(BQ::hp, 90, .7, 0, fs); } }
  void block(int n) override;
  void run(double L, double R) override { t += (tt - t) * .0005; double wow = P("wow"), fbk = P("fb"), mx = P("mix");
    double w = 1 + std::sin(2 * PI * wph) * wow * .004 + std::sin(2 * PI * wph * 3.7) * wow * .0015; bool pp = flag(o, "pp");
    double yl = d[0].get(t * w), yr = d[1].get(t * w * (pp ? 1 : 1.0007));
    double fl = hp[0].run(lp[0].run(yl)) * fbk, fr = hp[1].run(lp[1].run(yr)) * fbk;
    if (pp) { d[0].put(tanhF((L + R) * .5 + fr)); d[1].put(tanhF(fl)); } else { d[0].put(tanhF(L + fl)); d[1].put(tanhF(R + fr)); }
    l = L + yl * mx; r = R + yr * mx; } };
struct Spring : Pedal { struct Sp { DL d; double ap[12] {}; Biq lp; double len; }; std::vector<Sp> s[2]; Biq hp[2];
  Spring(double f, AmpRack* rk) : Pedal(f, rk) { for (int k = 0; k < 2; k++) for (int j = 0; j < 2; j++) s[k].push_back({ DL((int) std::ceil(f * .08)), {}, {}, f * (j ? .0413 : .0337) * (k ? 1.07 : 1) }); }
  void update() override { for (auto& ch : s) for (auto& sp : ch) sp.lp.set(BQ::lp, P("tone"), .7, 0, fs); for (auto& h : hp) h.set(BQ::hp, 180, .7, 0, fs); }
  double one(double x, int k) { double a = .62, fb = .55 + P("decay") * .42, out = 0, inp = hp[k].run(x) * .5;
    for (auto& sp : s[k]) { double y = sp.d.get(sp.len); for (int i = 0; i < 12; i++) { double o2 = a * y + sp.ap[i]; sp.ap[i] = fz(y - a * o2); y = o2; } y = sp.lp.run(y); sp.d.put(inp + y * fb); out += y; }
    return x + out * P("mix") * .8; }
  void run(double L, double R) override { l = one(L, 0); r = one(R, 1); } };
struct Hall : Pedal { struct C { std::vector<float> b; int i = 0, n = 0; double f = 0; }; struct A { std::vector<float> b; int i = 0; };
  std::vector<C> c[2]; std::vector<A> a[2]; DL pd; int fl = 0; double o2[2] {};
  Hall(double f, AmpRack* rk) : Pedal(f, rk), pd((int) std::ceil(f * .25)) { static const int FC[8] = { 1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617 }, FA[4] = { 556, 441, 341, 225 }; double k = f / 44100;
    for (int ch = 0; ch < 2; ch++) { for (int n : FC) { C cc; cc.b.assign((size_t) jsRound((n + ch * 23) * k * 1.3), 0); c[ch].push_back(cc); } for (int n : FA) { A aa; aa.b.assign((size_t) jsRound((n + ch * 23) * k), 0); a[ch].push_back(aa); } } }
  void update() override { for (auto& ch : c) for (auto& cc : ch) { cc.n = std::max(8, (int) jsRound(cc.b.size() * (.55 + P("size", .7) * .45))); if (cc.i >= cc.n) cc.i = 0; } }
  void run(double L, double R) override { double fb = .7 + P("size") * .28, damp = P("damp") * .6, ud = 1 - damp;
    pd.put((L + R) * .5); double x = pd.get(P("pre") * .001 * fs) * .1;
    for (int ch = 0; ch < 2; ch++) { double s = 0; for (auto& cc : c[ch]) { double y = cc.b[cc.i]; cc.f = y * ud + cc.f * damp; cc.b[cc.i] = (float) (x + cc.f * fb); if (++cc.i >= cc.n) cc.i = 0; s += y; }
      for (auto& aa : a[ch]) { double y = aa.b[aa.i]; aa.b[aa.i] = (float) (s + y * .5); if (++aa.i >= (int) aa.b.size()) aa.i = 0; s = y - s; } o2[ch] = fz(s); }
    double w = P("width"), mx = P("mix"), wl = o2[0] * (.5 + w / 2) + o2[1] * (.5 - w / 2), wr = o2[1] * (.5 + w / 2) + o2[0] * (.5 - w / 2);
    l = L * (1 - mx * .5) + wl * mx * .8; r = R * (1 - mx * .5) + wr * mx * .8;
    if (++fl >= 4096) { fl = 0; for (auto& ch : c) for (auto& cc : ch) if (std::abs(cc.f) < 1e-15) cc.f = 0; } } };

struct AmpHead {
  double fs; OS2 os[2]; juce::var h; Biq inHP[2]; struct St { Biq hp, lp; } stage[2][4]; std::vector<Biq> tone[2];
  double sag = 0, pkIn = 0, pkOut = 0, G = 1, gs = 1, bias = 0, ch = 0, b0 = 0, comp = 1, post = 1, sagA = 0, sagR = 0, mv = 1, l = 0, r = 0; int n = 1; VMap v;
  explicit AmpHead(double f) : fs(f) { os[0] = OS2(f); os[1] = OS2(f); }
  double clip(double x) const { x += bias; return (1 - ch) * tanhF(x) + ch * hardClip(x * 1.2) - b0; }
  void set(const juce::var& H) {
    h = H; double f2 = fs * 2, tight = num(H, "tight", 80), gain = num(H, "gain", 5);
    for (int k = 0; k < 2; k++) { inHP[k].set(BQ::hp, tight, .7, 0, fs); for (auto& s : stage[k]) { s.hp.set(BQ::hp, 25 + tight * .3, .7, 0, f2); s.lp.set(BQ::lp, 7500 - gain * 250, .7, 0, f2); }
      auto d = toneStackDesign(H); tone[k].resize(d.size()); for (size_t i = 0; i < d.size(); i++) tone[k][i].set(d[i].t, d[i].f, d[i].q, d[i].g, fs); }
    G = .5 * std::pow(10.0, gain / 10 * 2.3); n = std::max(1, std::min(4, (int) jsRound(num(H, "stages", 2)))); gs = std::pow(G, 1.0 / n) * (n > 1 ? 1.25 : 1);
    bias = num(H, "bias", 0) * .35; ch = num(H, "character", .5); b0 = (1 - ch) * tanhF(bias) + ch * hardClip(bias * 1.2);
    { double x = REF; for (int i = 0; i < n; i++) x = clip(x * gs); comp = .45 / std::max(.02, std::abs(x)); post = dcorr("amp", gain / 10); }
    sagA = 1 - std::exp(-1 / (.02 * fs)); sagR = 1 - std::exp(-1 / (.25 * fs)); mv = std::pow(num(H, "master", 5) / 10, 1.5) * 1.8;
  }
  double pre(double x) { auto* st = stage[0]; for (int i = 0; i < n; i++) { x = clip(st[i].hp.run(x) * gs); x = st[i].lp.run(x); } return x; }
  double one(double x, int k) {
    x = inHP[k].run(x); auto& o2 = os[k]; o2.up(x); double y = o2.down(pre(o2.a), pre(o2.b)); // (the JS leaves `* comp` inside a comment: kept identical)
    for (auto& t : tone[k]) y = t.run(y);
    double sg = 1 - num(h, "sag", 0) * .55 * std::min(1.0, sag * 1.5), pd = (1 + num(h, "pdrive", 0) * 5) * .8;
    y = tanhF(y * sg * pd) / tanhF(.45 * pd) * .45 * post; return y * mv; }
  void run(double L, double R) { double x = (L + R) * .5, a = std::abs(x); if (a > pkIn) pkIn = a; double y = one(x, 0); l = r = y; double o = std::abs(y);
    sag += (o - sag) * (o > sag ? sagA : sagR); if (o > pkOut) pkOut = o; }
  void block() { v = { { "in", pkIn }, { "out", pkOut }, { "sag", sag } }; pkIn *= .9; pkOut *= .9; }
};
struct Cab {
  double fs; std::vector<Biq> f[2]; DL room[2]; Biq rlp[2]; double rd[2] {}, rm = 0, l = 0, r = 0;
  explicit Cab(double s) : fs(s), room { DL((int) std::ceil(s * .02)), DL((int) std::ceil(s * .02)) } {}
  void set(const juce::var& c) { auto d = cabDesign(c); for (int k = 0; k < 2; k++) { f[k].resize(d.size()); for (size_t i = 0; i < d.size(); i++) f[k][i].set(d[i].t, d[i].f, d[i].q, d[i].g, fs); rlp[k].set(BQ::lp, 3000, .7, 0, fs); }
    double dist = num(c, "dist", .3); rd[0] = fs * (.0035 + dist * .009); rd[1] = fs * (.0047 + dist * .011); rm = dist * .45; }
  double one(double x, int k) { for (auto& q : f[k]) x = q.run(x); room[k].put(x); return x + rlp[k].run(room[k].get(rd[k])) * rm; }
  void run(double L, double R) { l = r = one((L + R) * .5, 0); }
};
struct AmpRack {
  double fs, tempo = 120; std::map<std::string, std::unique_ptr<Pedal>> inst; std::vector<Pedal*> pre, post; AmpHead head; Cab cab; bool on = false, cabOn = true; double out = 1, trim = 1, xf, l = 0, r = 0;
  explicit AmpRack(double f) : fs(f), head(f), cab(f), xf(1 - std::exp(-1 / (.01 * f))) {}
  std::unique_ptr<Pedal> make(const std::string& t) {
    if (t == "comp") return std::make_unique<Comp>(fs, this); if (t == "boost") return std::make_unique<Boost>(fs, this); if (t == "od") return std::make_unique<Overdrive>(fs, this);
    if (t == "dist") return std::make_unique<Distortion>(fs, this); if (t == "fuzz") return std::make_unique<Fuzz>(fs, this); if (t == "octave") return std::make_unique<OctaveFuzz>(fs, this);
    if (t == "crush") return std::make_unique<Crusher>(fs, this); if (t == "phaser") return std::make_unique<Phaser>(fs, this); if (t == "rotary") return std::make_unique<Rotary>(fs, this);
    if (t == "gate") return std::make_unique<Gate>(fs, this); if (t == "geq") return std::make_unique<GEQ>(fs, this); if (t == "delay") return std::make_unique<DelayPedal>(fs, this);
    if (t == "spring") return std::make_unique<Spring>(fs, this); if (t == "hall") return std::make_unique<Hall>(fs, this); return nullptr; }
  void set(const juce::var& a) {
    std::vector<Pedal*> keep;
    auto mk = [&](const juce::var& d) -> Pedal* { auto uid = str(d, "uid"), type = str(d, "type"); auto it = inst.find(uid);
      if (it == inst.end() || it->second->type != type) { auto p = make(type); if (!p) return nullptr; p->type = type; inst[uid] = std::move(p); }
      auto* p = inst[uid].get(); p->on = flag(d, "on"); p->setP(d["p"], d["o"]); keep.push_back(p); return p; };
    pre.clear(); post.clear();
    if (auto* arr = a["pre"].getArray()) for (auto& d : *arr) if (auto* p = mk(d)) pre.push_back(p);
    if (auto* arr = a["post"].getArray()) for (auto& d : *arr) if (auto* p = mk(d)) post.push_back(p);
    for (auto it = inst.begin(); it != inst.end();) { if (std::find(keep.begin(), keep.end(), it->second.get()) == keep.end()) it = inst.erase(it); else ++it; }
    on = flag(a, "on"); cabOn = has(a, "cab") && flag(a["cab"], "on", true); if (has(a, "head")) head.set(a["head"]); if (has(a, "cab")) cab.set(a["cab"]);
    out = dbToLin(numOr(a, "out", 0)); trim = dbToLin(numOr(a, "trim", 0)); }
  void block(int n) { for (auto* p : pre) p->block(n); for (auto* p : post) p->block(n); if (on) head.block(); }
  void chain(std::vector<Pedal*>& list, double L, double R) {
    for (auto* p : list) { double tgt = p->on ? 1 : 0; p->mix += (tgt - p->mix) * xf; if (p->mix < 1e-4 && !p->on) { p->mix = 0; continue; }
      p->run(L, R); double m = p->mix; L = L + (p->l - L) * m; R = R + (p->r - R) * m; }
    l = L; r = R; }
  void run(double L, double R) {
    chain(pre, L, R); L = l; R = r;
    if (on) { head.run(L, R); L = head.l * trim; R = head.r * trim; if (cabOn) { cab.run(L, R); L = cab.l; R = cab.r; } }
    chain(post, L, R); l *= out; r *= out; }
  juce::var viz() { auto* pd = new juce::DynamicObject();
    for (auto& [u, p] : inst) { auto* o = new juce::DynamicObject(); for (auto& kv : p->v) o->setProperty(juce::Identifier(kv.first), kv.second); o->setProperty("mix", p->mix); pd->setProperty(juce::Identifier(u), juce::var(o)); for (auto& kv : p->v) if (kv.first == "gr") kv.second = 0; }
    auto* hv = new juce::DynamicObject(); for (auto& kv : head.v) hv->setProperty(juce::Identifier(kv.first), kv.second);
    auto* o = new juce::DynamicObject(); o->setProperty("pd", juce::var(pd)); o->setProperty("head", juce::var(hv)); return juce::var(o); }
};
inline void Phaser::block(int n) { std::string sy = str(o, "sync"); double rate = !sy.empty() && sy != "free" ? rack->tempo / 60 / divBeats(sy) : P("rate");
  ph = std::fmod(ph + rate * n / fs, 1.0); vset(v, "ph", ph);
  auto sweep = [&](int k) { double lfo = (std::sin(2 * PI * (ph + k * .25)) + 1) / 2; return P("center") * std::pow(2.0, (lfo - .5) * P("depth") * 5); };
  double fq[2] = { sweep(0), sweep(1) }; vset(v, "f", fq[0]);
  for (int k = 0; k < 2; k++) { double t = std::tan(PI * std::min(fq[k], fs * .45) / fs); a[k] = (t - 1) / (t + 1); } hasA = true; }
inline void DelayPedal::block(int n) { std::string sy = str(o, "sync"); double sec = !sy.empty() && sy != "free" ? divBeats(sy) * 60 / rack->tempo : P("time") / 1000;
  tt = std::min(2.1, std::max(.01, sec)) * fs; wph += n / fs * .9; vset(v, "time", sec); vset(v, "fb", P("fb")); }

// ───────────── synthdsp.js ─────────────
inline double polyblep(double t, double dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
inline double oscWave(double ph, double dt, double m) {
  double sine = std::sin(TWO_PI * ph); if (m <= 0.001) return sine;
  double tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; if (m < 1.0 / 3) { double k = m * 3; return sine + (tri - sine) * k; }
  double saw = 2 * ph - 1 - polyblep(ph, dt); if (m < 2.0 / 3) { double k = (m - 1.0 / 3) * 3; return tri + (saw - tri) * k; }
  double sq = (ph < 0.5 ? 1 : -1) + polyblep(ph, dt) - polyblep(std::fmod(ph + 0.5, 1.0), dt);
  double k = std::min(1.0, (m - 2.0 / 3) * 3); return saw + (sq * 0.8 - saw) * k; }
struct SVF { double a = 0, b = 0, lp = 0, bp = 0, hp = 0;
  inline void run(double x, double g, double k) { double a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2; double v3 = x - b, v1 = a1 * a + a2 * v3, v2 = b + a2 * a + a3 * v3;
    a = fz(2 * v1 - a); b = fz(2 * v2 - b); lp = v2; bp = v1; hp = x - k * v1 - v2; if (!(a < 1e6 && a > -1e6)) { a = 0; b = 0; } } };
enum class FT { lp, hp, bp, notch, peak, formant, other };
inline FT ftype(const std::string& s) { if (s == "lp") return FT::lp; if (s == "hp") return FT::hp; if (s == "bp") return FT::bp; if (s == "notch") return FT::notch; if (s == "peak") return FT::peak; if (s == "formant") return FT::formant; return FT::other; }
struct Filter { SVF s[2]; SVF fm[2][3];
  double process(double x, int ch, double g, double k, FT type, double drive, const double* vowelF, double mix) {
    double y = x; if (drive > 0.001) y = std::tanh(y * (1 + drive * 6)) / (1 + drive * 1.5);
    if (type == FT::formant) { double o = 0; for (int j = 0; j < 3; j++) { fm[ch][j].run(y, vowelF[j], 0.12); o += fm[ch][j].bp * 0.12 * (j == 0 ? 1.6 : j == 1 ? 1.1 : 0.7); } y = o * 2.2; }
    else { auto& S = s[ch]; S.run(y, g, k);
      switch (type) { case FT::lp: y = S.lp; break; case FT::hp: y = S.hp; break; case FT::bp: y = S.bp * k * (1 + 3 / (k + 0.3)) * 0.55; break; case FT::notch: y = y - k * S.bp; break; case FT::peak: y = S.lp - S.hp; break; default: break; } }
    return x + (y - x) * mix; } };

struct Engine;
// a synth parameter definition (from synthDefs())
struct PDef { double min = 0, max = 1; bool log = false; };
static const char* SRC_NAMES[] = { "lfo1", "lfo2", "env1", "env2", "fol", "vel", "note", "mw", "rnd", "energy", "gate" };
enum SrcI { S_LFO1, S_LFO2, S_ENV1, S_ENV2, S_FOL, S_VEL, S_NOTE, S_MW, S_RND, S_ENERGY, S_GATE, S_N };
inline int srcIndex(const std::string& s) { for (int i = 0; i < S_N; i++) if (s == SRC_NAMES[i]) return i; return -1; }
struct Mod { int s; std::string d; double a; };

struct Synth {
  Engine* E; double fs;
  std::unordered_map<std::string, double> p, eff; juce::var o { new juce::DynamicObject() }; std::unordered_map<std::string, PDef> def; std::vector<Mod> mods; std::vector<std::string> modTargets; bool physActive = false;
  double src[S_N] {};
  struct Lfo { double ph, v = 0, sh = 0, tgt = 0, sm = 0; } lfo[2] { { 0 }, { 0.25 } };
  struct Env { double v = 0; int st = 0; } env[2];
  double folV = 0; int nHeld = 0; Filter f1, f2; double g[2] {}, gPrev[2] {}, vf[2][3] {}, kf[2] { 2, 2 }, drv[2] {}, mixf[2] { 1, 1 };
  std::vector<float> md[2], ps[2]; int mdw = 0, psw = 0; double mdPh = 0, mdT = 3, mdTPrev = 3, mdDepth = 0, mdRate = .5, mdFb = 0, mdMix = .5, mdMixP = .5, mdSpread = .5, psPh = 0;
  double psRatio = 1, psMix = 0, psMixP = 0, psFb = 0, ampNow = 1, ampPrevBlk = 1, pan = 0, gDepth = 1, gSmooth = 0, stepLen = 1, folA = 0, folR = 0;
  double gatePh = 0; int gateStep = 0; double gateEnv = 1;
  bool oscOn = false; double oscMul = 1, oscLvl = 0, oscLvlP = 0, oscShape = 0, srcLvl = 1, srcLvlP = 1; bool haveSrcLvl = false, haveMdMix = false, havePsMix = false, haveAmpNow = false;
  // per-block resolved options
  bool f1on = false, f2on = false, parallel = false, mfxOn = false, psOn = false, gateOn = false; FT ft[2] { FT::lp, FT::lp }; int oscMode = 0; std::vector<bool> steps;
  double l = 0, r = 0;
  explicit Synth(Engine* e);
  bool isTarget(const std::string& id) const { return std::find(modTargets.begin(), modTargets.end(), id) != modTargets.end(); }
  double pv(const std::string& id, bool& found) const { auto it = p.find(id); found = it != p.end(); return found ? it->second : 0; }
  // V(id) with JS `||` / `??` defaults
  double Vraw(const std::string& id, bool& found) const { if (isTarget(id)) { auto it = eff.find(id); found = it != eff.end(); return found ? it->second : 0; } return pv(id, found); }
  double Vor(const std::string& id, double d) const { bool f; double x = Vraw(id, f); return f && x != 0 && std::isfinite(x) ? x : d; }
  double Vq(const std::string& id, double d) const { bool f; double x = Vraw(id, f); return f && std::isfinite(x) ? x : d; }
  double Por(const std::string& id, double d) const { bool f; double x = pv(id, f); return f && x != 0 ? x : d; }
  double Pq(const std::string& id, double d) const { bool f; double x = pv(id, f); return f ? x : d; }
  std::string O(const std::string& k) const { return str(o, k.c_str()); }
  bool Ob(const std::string& k) const { return flag(o, k.c_str()); }
  void setDefs(const juce::var& d) { def.clear(); if (auto* obj = d.getDynamicObject()) for (auto& kv : obj->getProperties()) { PDef pd; pd.min = num(kv.value, "min", 0); pd.max = num(kv.value, "max", 1); pd.log = flag(kv.value, "log"); def[kv.name.toString().toStdString()] = pd; } }
  void set(const juce::var& d);
  double toN(const std::string& id, double v) const { auto it = def.find(id); if (it == def.end()) return 0; auto& dd = it->second; return dd.log ? std::log(v / dd.min) / std::log(dd.max / dd.min) : (v - dd.min) / (dd.max - dd.min); }
  double fromN(const std::string& id, double n) const { auto it = def.find(id); if (it == def.end()) return 0; auto& dd = it->second; n = clamp01(n); return dd.log ? dd.min * std::pow(dd.max / dd.min, n) : dd.min + (dd.max - dd.min) * n; }
  double base(const std::string& id) const;
  void noteOn(double n, double v, bool fromSilence) { src[S_VEL] = v; src[S_NOTE] = std::max(0.0, std::min(1.0, (n - 24) / 72)); src[S_RND] = rnd()(); nHeld++;
    for (auto& e : env) e.st = 1; for (int i = 0; i < 2; i++) if (Ob("lfo" + std::to_string(i + 1) + "_retrig")) lfo[i].ph = i * 0.25; if (fromSilence) { gatePh = 0; gateStep = 0; } }
  void allOff() { nHeld = 0; for (auto& e : env) if (e.st) e.st = 4; }
  void block(int n);
  inline double rd(const std::vector<float>& buf, int w, double d) const { double rp = w - d; int i0 = (int) std::floor(rp); double f = rp - i0; double x0 = buf[i0 & 16383], x1 = buf[(i0 + 1) & 16383]; return x0 + (x1 - x0) * f; }
  void run(double L, double R, double oscSum, double ringSum, int i, int n) {
    double t = (double) (i + 1) / n; double sl = srcLvlP + (srcLvl - srcLvlP) * t; L *= sl; R *= sl;
    if (oscOn) { double lv = oscLvlP + (oscLvl - oscLvlP) * t; if (oscMode == 0) { L += oscSum * lv; R += oscSum * lv; } else if (oscMode == 1) { L = L * (1 - lv) + oscSum * lv; R = R * (1 - lv) + oscSum * lv; } else { L = L * (1 - lv) + ringSum * lv; R = R * (1 - lv) + ringSum * lv; } }
    double a = std::abs(L + R) * 0.5; folV += (a - folV) * (a > folV ? folA : folR);
    if (f1on || f2on) { double g1 = gPrev[0] + (g[0] - gPrev[0]) * t, g2 = gPrev[1] + (g[1] - gPrev[1]) * t;
      if (parallel && f1on && f2on) { double m0 = mixf[0], m1 = mixf[1], dry = std::max(0.0, 1 - m0 - m1);
        double al = f1.process(L, 0, g1, kf[0], ft[0], drv[0], vf[0], 1), ar = f1.process(R, 1, g1, kf[0], ft[0], drv[0], vf[0], 1);
        double bl = f2.process(L, 0, g2, kf[1], ft[1], drv[1], vf[1], 1), br = f2.process(R, 1, g2, kf[1], ft[1], drv[1], vf[1], 1);
        L = al * m0 + bl * m1 + L * dry; R = ar * m0 + br * m1 + R * dry; }
      else { if (f1on) { L = f1.process(L, 0, g1, kf[0], ft[0], drv[0], vf[0], mixf[0]); R = f1.process(R, 1, g1, kf[0], ft[0], drv[0], vf[0], mixf[0]); }
        if (f2on) { L = f2.process(L, 0, g2, kf[1], ft[1], drv[1], vf[1], mixf[1]); R = f2.process(R, 1, g2, kf[1], ft[1], drv[1], vf[1], mixf[1]); } } }
    if (mfxOn) { int w = mdw; mdPh += mdRate / fs; if (mdPh >= 1) mdPh -= 1;
      double T = (mdTPrev + (mdT - mdTPrev) * t) * 0.001 * fs, dep = mdDepth * 0.95;
      double tl = std::max(1.5, T * (1 + dep * std::sin(TWO_PI * mdPh))), tr = std::max(1.5, T * (1 + dep * std::sin(TWO_PI * (mdPh + mdSpread * 0.25))));
      double yl = rd(md[0], w, tl), yr = rd(md[1], w, tr); md[0][w] = (float) fz(L + yl * mdFb); md[1][w] = (float) fz(R + yr * mdFb); mdw = (w + 1) & 16383;
      double mm = mdMixP + (mdMix - mdMixP) * t; L = L * (1 - mm) + yl * mm; R = R * (1 - mm) + yr * mm; }
    if (psOn && (psMix > 0.001 || psMixP > 0.001)) { double win = 0.06 * fs; int w = psw; psPh += (1 - psRatio) / win; psPh -= std::floor(psPh);
      double p1 = psPh, p2 = std::fmod(p1 + 0.5, 1.0), w1 = std::pow(std::sin(PI * p1), 2), w2 = std::pow(std::sin(PI * p2), 2), d1 = 2 + p1 * win, d2 = 2 + p2 * win;
      double yl = rd(ps[0], w, d1) * w1 + rd(ps[0], w, d2) * w2, yr = rd(ps[1], w, d1) * w1 + rd(ps[1], w, d2) * w2;
      ps[0][w] = (float) fz(L + yl * psFb); ps[1][w] = (float) fz(R + yr * psFb); psw = (w + 1) & 16383;
      double pm = psMixP + (psMix - psMixP) * t, dry = 1 - std::max(0.0, pm * 2 - 1), wet = std::min(1.0, pm * 2); L = L * dry + yl * wet; R = R * dry + yr * wet; }
    double gv = 1;
    if (gateOn) { if (++gatePh >= stepLen) { gatePh = 0; gateStep = (gateStep + 1) & 15; } bool on = gateStep < (int) steps.size() && steps[gateStep];
      gateEnv += ((on ? 1 : 1 - gDepth) - gateEnv) * gSmooth; gv = gateEnv; }
    else if (++gatePh >= stepLen) { gatePh = 0; gateStep = (gateStep + 1) & 15; }
    double amp = (ampPrevBlk + (ampNow - ampPrevBlk) * t) * gv, pl = pan > 0 ? 1 - pan : 1, pr = pan < 0 ? 1 + pan : 1;
    l = L * amp * pl; r = R * amp * pr; }
  juce::var viz() { auto* o2 = new juce::DynamicObject(); auto* s = new juce::DynamicObject(); for (int i = 0; i < S_N; i++) s->setProperty(SRC_NAMES[i], src[i]);
    auto* mv = new juce::DynamicObject(); for (auto& id : modTargets) mv->setProperty(juce::Identifier(id), eff["n_" + id]);
    juce::Array<juce::var> ph { lfo[0].ph, lfo[1].ph }; o2->setProperty("src", juce::var(s)); o2->setProperty("lfoPh", ph); o2->setProperty("step", gateStep); o2->setProperty("mv", juce::var(mv)); return juce::var(o2); }
};

// ───────────── dsp.js ─────────────
constexpr int DMAX = 8192, DM = DMAX - 1;
inline double mtof(double n) { return 440 * std::pow(2.0, (n - 69) / 12); }
constexpr double OSC_G = 0.3, RING_G = 0.5, GHOST = 20.0 / 127;
inline double lpDelay(double d, double w) { return std::atan2(d * std::sin(w), 1 - d * std::cos(w)) / w; }
inline double apDelay(double a, double w) { return -(std::atan2(-std::sin(w), a + std::cos(w)) - std::atan2(-a * std::sin(w), 1 + a * std::cos(w))) / w; }
enum class Ex { pick, finger, hammer, bow, ebow, wind };
inline Ex exType(const std::string& s) { if (s == "finger") return Ex::finger; if (s == "hammer") return Ex::hammer; if (s == "bow") return Ex::bow; if (s == "ebow") return Ex::ebow; if (s == "wind") return Ex::wind; return Ex::pick; }
inline bool CONT(Ex t) { return t == Ex::bow || t == Ex::ebow || t == Ex::wind; }
inline double TRIM(Ex t) { switch (t) { case Ex::pick: return 3; case Ex::finger: return 9; case Ex::hammer: return 5; case Ex::bow: return .5; case Ex::ebow: return 2; case Ex::wind: return .5; } return 1; }
enum Role { R_STOPPED, R_OPEN, R_DRONE, R_SYMP };
inline Role roleOf(const std::string& s) { if (s == "open") return R_OPEN; if (s == "drone") return R_DRONE; if (s == "symp") return R_SYMP; return R_STOPPED; }

struct ExP { Ex type = Ex::pick; double pos = .15, pickStiff = .6, fingerSoft = .4, hammerHard = .6, pressure = .5, speed = .5, attack = .08, release = .2; bool bowChange = true;
  double humanize = .3, vibDepth = 0, vibDelay = .4, vibRate = 5.5, ebow = .6, wind = .5, gust = .3, drone = .35, fretNoise = .5, slideTime = .12; std::string fretter = "fingers", slideMat = "steel"; bool slideFr = false;
  void apply(const juce::var& v) {
    if (has(v, "type")) type = exType(str(v, "type"));
    auto N = [&](const char* k, double& x) { if (has(v, k)) x = num(v, k, x); };
    N("pos", pos); N("pickStiff", pickStiff); N("fingerSoft", fingerSoft); N("hammerHard", hammerHard); N("pressure", pressure); N("speed", speed); N("attack", attack); N("release", release);
    if (has(v, "bowChange")) bowChange = flag(v, "bowChange"); N("humanize", humanize); N("vibDepth", vibDepth); N("vibDelay", vibDelay); N("vibRate", vibRate); N("ebow", ebow); N("wind", wind); N("gust", gust); N("drone", drone);
    N("fretNoise", fretNoise); if (has(v, "slideTime")) { double s = num(v, "slideTime", 0); slideTime = s != 0 ? s : .12; }
    if (has(v, "fretter")) { fretter = str(v, "fretter"); if (fretter.empty()) fretter = "fingers"; } slideFr = fretter == "slide"; if (has(v, "slideMat")) slideMat = str(v, "slideMat"); }
  double* key(const std::string& k) { if (k == "pos") return &pos; if (k == "pressure") return &pressure; if (k == "speed") return &speed; if (k == "ebow") return &ebow; if (k == "wind") return &wind; return nullptr; }
};
struct NkP { bool frets = true; double buzz = 0, jawari = 0; std::string legato = "smart"; double thr = 4, glide = .01, pbRange = 2, pressBend = 2; bool dampOpen = false; double mute = .25, coupling = .5, sympC = .3;
  void apply(const juce::var& v) { auto N = [&](const char* k, double& x) { if (has(v, k)) x = num(v, k, x); };
    if (has(v, "frets")) frets = flag(v, "frets"); N("buzz", buzz); N("jawari", jawari); if (has(v, "legato")) legato = str(v, "legato"); N("thr", thr); N("glide", glide); N("pbRange", pbRange); N("pressBend", pressBend);
    if (has(v, "dampOpen")) dampOpen = flag(v, "dampOpen"); N("mute", mute); N("coupling", coupling); N("sympC", sympC); }
  double* key(const std::string& k) { if (k == "jawari") return &jawari; if (k == "buzz") return &buzz; return nullptr; }
};
struct PkP { double mag = 0, magPos = .12, piezo = .3, mic = .8, master = .8, scale = 0;
  void apply(const juce::var& v) { auto N = [&](const char* k, double& x) { if (has(v, k)) x = num(v, k, x); }; N("mag", mag); N("magPos", magPos); N("piezo", piezo); N("mic", mic); N("master", master); N("scale", scale); } };

struct Delay { std::vector<float> b = std::vector<float>(DMAX, 0.f); int w = 0; double last = 0;
  inline double tick(double x, double len) { double rp = w - len; int i = (int) std::floor(rp); double f = rp - i;
    double y0 = b[(i - 1) & DM], y1 = b[i & DM], y2 = b[(i + 1) & DM], y3 = b[(i + 2) & DM], fm1 = f - 1, fm2 = f - 2, fp1 = f + 1;
    last = -y0 * f * fm1 * fm2 / 6 + y1 * fp1 * fm1 * fm2 / 2 - y2 * fp1 * f * fm2 / 2 + y3 * fp1 * f * fm1 / 6; b[w] = (float) x; w = (w + 1) & DM; return last; } };

struct FNPart { double f, q, dec, gain; bool imp; };
inline const std::vector<FNPart>* fnoiseSpec(const std::string& t) {
  static const std::map<std::string, std::vector<FNPart>> F = {
    { "hammer", { { 340, .8, .007, 1, 0 }, { 3200, 7, .0018, .45, 1 }, { 1500, 3, .002, .25, 1 } } }, { "pull", { { 2600, 2.2, .009, .55, 0 }, { 650, .9, .004, .45, 0 } } },
    { "lift", { { 300, .8, .009, .5, 0 }, { 1900, 3, .003, .12, 0 } } }, { "press", { { 420, .9, .004, .35, 0 }, { 3300, 7, .0012, .2, 1 } } },
    { "clack", { { 900, 6, .012, 1, 1 }, { 2400, 4, .004, .45, 1 }, { 260, 1, .006, .4, 0 } } }, { "unclack", { { 700, 5, .01, .45, 1 }, { 240, 1, .005, .25, 0 } } },
    { "clank", { { 4300, 14, .05, .55, 1 }, { 2150, 12, .04, .45, 1 }, { 1150, 2, .004, .3, 0 } } }, { "slidelift", { { 3000, 3, .006, .3, 0 } } } };
  auto it = F.find(t); return it == F.end() ? nullptr : &it->second; }
inline double fnScale(const std::string& t) { if (t == "hammer" || t == "pull") return 2.2; if (t == "lift") return 3; if (t == "press") return 5; if (t == "clack") return 9; if (t == "unclack") return 6; if (t == "clank") return 12; if (t == "slidelift") return 3; return 1; }
struct Slide { double f, q, g, ring; };
inline Slide slideOf(const std::string& m) { if (m == "glass") return { 1700, 1.1, .7, .8 }; if (m == "brass") return { 3300, 2, 1.25, 1.3 }; return { 2600, 1.7, 1, 1.1 }; }

struct Str {
  Engine* E; Delay neck, br; std::vector<float> hist = std::vector<float>(DMAX, 0.f); int hw = 0, magD = 10;
  double lp = 0, apx[4] {}, apy[4] {}, Bo = 0, hf = 25, fOpen = 110; int mw = 0; double jpk = 0, jy = 0, jm = 0, jPi = 0, jPo = 0, rn = 0;
  double freq = 110, target = 110, gc = 1, note = 45, g = .99; std::vector<double> stack; bool held = false, pend = false; double lastUse = 0;
  std::vector<float> pulse; size_t pi = 0; bool hasPulse = false; double cont = 0, contT = 0, bowDir = 1, bowAmp = 1;
  double damp = 1, wantDamp = 0, env = 0, acc = 0, rms = 0, t = 0, vib = 1, vph, drift = 0, b1 = 0, b2 = 0, bpA1 = 0, bpA2 = 0, bpG = 0;
  Role role = R_STOPPED; double open = 45, range = 12, mag = 0; int awake = 0; double sqL = 0, sqT = 0, sq1 = 0, sq2 = 0, sqx1 = 0, sqx2 = 0, sqA1 = 0, sqA2 = 0, sqB = 0, pf = 0, oph, oenv = 0, cf = 110, bj = 0;
  bool harm = false; double touch = 45, d = .2, apA = -.2, comp = 1, tm = .05, decay = 5, el = 0, elC = 0; bool wound = false, idle = false, sliding = false;
  struct Steps { bool on = false; double to = 0, cur = 0, dir = 0, per = 0, cnt = 0; } slideSteps;
  float mr1[64] {}, mr2[64] {}; double ms1 = 0, ms2 = 0; int mj = 64;
  explicit Str(Engine* e) : E(e) { vph = rnd()() * 6; oph = rnd()(); stack.reserve(16); pulse.reserve(4096 + 512); }
  void set(const juce::var& p);
  void calcG(); void setNote(double n, double glide); void pluckPulse(double v, double vel, double click = 0); void excite(double v); void restrike(); void ghost(double n, double v, int h);
  void start(double n, double v, int h = 0); void slur(double n, double v, bool off = false); void wake(); void release(); void block(int n); double tick(double feed);
  double magOut(double o) { hist[hw] = (float) o; double v = o - hist[(hw - magD) & DM]; hw = (hw + 1) & DM;
    int W = mw; if (W > 1) { int j = mj; ms1 += v - mr1[(j - W) & 63]; mr1[j & 63] = (float) v; double u = ms1 / W; ms2 += u - mr2[(j - W) & 63]; mr2[j & 63] = (float) u; v = ms2 / W; mj = (j + 1) & 0x3fffffff; }
    return v * mag; }
  void setAperture(double scale, double fs) { double c = 2 * std::max(.1, scale) * fOpen; int W = (int) jsRound(fs * .025 / c / 2);
    if (W != mw) { mw = std::max(1, std::min(60, W)); std::fill(std::begin(mr1), std::end(mr1), 0.f); std::fill(std::begin(mr2), std::end(mr2), 0.f); ms1 = ms2 = 0; mj = 64; } }
};

struct Mode { double y1 = 0, y2 = 0, e = 0, a1 = 0, a2 = 0, b0 = 0, aL = 0, aR = 0; };
struct FnEvent { int t = 0, len = 0; int np = 0; struct Part { double a1, a2, b0, g, ed, e, y1, y2, x1, x2; bool imp; } parts[3]; };

struct Engine {
  double fs; std::vector<std::unique_ptr<Str>> S; std::vector<Mode> modes;
  ExP ex, exBase; NkP nk, nkBase; PkP pk;
  std::vector<double> held; std::map<double, int> map; std::map<double, double> nvel; bool sus = false; double bendSemis = 0, bendMul = 1, clock = 0;
  double sympFeed = 0, dc[8] {}, lim = 1, limMin = 1, dcA, dcB; double frame = 0, lastOn = -1e9, bin1 = 0, bin2 = 0; std::vector<FnEvent> fn; double pa = 0, pb = 0, pa1, pa2, pa3, limRel; int blk = 0;
  uint32_t seed = 22222; double gustV = 0, gustT = 0, gustTarget = 0;
  double bowSlope = 1, bowMax = .1, grit = 0, atkC = 0, relC = 0, beta = .15, jRel = 0, jLeak = 0, jMean = 0, jEn = 0, jaw = 0, tune = 1, buzz = 0;
  double SRR, SRK; std::unique_ptr<Synth> syn; std::unique_ptr<AmpRack> rack;
  explicit Engine(double sampleRate) : fs(sampleRate) {
    SRR = fs / 48000; SRK = 48000 / fs; dcA = 1 - 2 * PI * 5 / fs; dcB = 1 - 2 * PI * 3 / fs;
    { double g = std::tan(PI * std::min(3800.0, fs * .45) / fs), k = 1 / 1.6; pa1 = 1 / (1 + g * (g + k)); pa2 = g * pa1; pa3 = g * pa2; } limRel = 1 - std::exp(-1 / (0.12 * fs));
    exBase = ex; nkBase = nk; syn = std::make_unique<Synth>(this); rack = std::make_unique<AmpRack>(fs); fn.reserve(32); held.reserve(64); derive(); }
  double noise() { seed = seed * 1664525u + 1013904223u; return seed / 4294967296.0 - 0.5; }
  void derive() { bowSlope = std::max(0.8, 5 - 4.2 * ex.pressure); bowMax = 0.03 + 0.3 * ex.speed; grit = std::max(0.0, ex.pressure - 0.7) * 0.25;
    atkC = 1 - std::exp(-1 / (std::max(0.002, ex.attack) * fs)); relC = 1 - std::exp(-1 / (std::max(0.005, ex.release) * fs)); beta = std::min(0.5, std::max(0.02, ex.pos));
    jRel = std::exp(-1 / (.03 * fs)); jLeak = 1 - 2 * PI * 15 / fs; jMean = 1 - std::exp(-2 * PI * 8 / fs); jEn = 1 - std::exp(-1 / (.04 * fs)); jaw = nk.jawari;
    tune = ex.type == Ex::bow ? 0.9855 : ex.type == Ex::ebow ? 0.99 : 1; buzz = nk.frets ? nk.buzz : 0; }
  void fretNoise(const std::string& type, double v, Str* s) {
    double amt = ex.fretNoise; auto* spec = fnoiseSpec(type); if (!spec || amt <= 0 || fn.size() > 24) return;
    bool isSl = type == "clank" || type == "slidelift"; Slide sl = slideOf(ex.slideMat);
    double a = std::min(1.2, v) * amt * .045 * fnScale(type) * (s && s->wound && (type == "pull" || type == "lift") ? 1.4 : 1) * (isSl ? sl.ring : 1);
    FnEvent ev; ev.t = 0; ev.len = (int) jsRound(fs * .08); ev.np = (int) spec->size();
    for (int i = 0; i < ev.np; i++) { auto P = (*spec)[i]; double f = P.f * (.94 + rnd()() * .12); double r = P.imp ? std::exp(-1 / (P.dec * fs)) : std::exp(-PI * f / (P.q * fs));
      ev.parts[i] = { 2 * r * std::cos(2 * PI * f / fs), r * r, P.imp ? (1 - r * r) * 4 : (1 - r * r) * .5, P.gain * a, std::exp(-1 / (P.dec * fs)), 1, 0, 0, 0, 0, P.imp }; }
    fn.push_back(ev); }
  void msg(const juce::var& d) {
    auto t = str(d, "t"); auto v = d["v"];
    if (t == "ex") { bool was = CONT(ex.type); ex.apply(v); exBase.apply(v); derive(); if (was != CONT(ex.type)) for (auto& s : S) s->calcG(); }
    else if (t == "nk") { nk.apply(v); nkBase.apply(v); derive(); for (auto& s : S) s->calcG(); }
    else if (t == "sdefs") syn->setDefs(v);
    else if (t == "synth") syn->set(v);
    else if (t == "mw") syn->src[S_MW] = (double) v;
    else if (t == "amp") rack->set(v);
    else if (t == "pk") { pk.apply(v); for (auto& s : S) s->setAperture(pk.scale != 0 ? pk.scale : .65, fs); }
    else if (t == "strings") setStrings(v);
    else if (t == "modes") setModes(v);
    else if (t == "on") noteOn(num(d, "n", 60), num(d, "v", .8));
    else if (t == "off") noteOff(num(d, "n", 60));
    else if (t == "sus") setSus(flag(d, "v"));
    else if (t == "bend") bendSemis = (double) v * nk.pbRange;
    else if (t == "panic") panic();
  }
  void setStrings(const juce::var& list) { auto* arr = list.getArray(); if (!arr) return; if ((size_t) arr->size() != S.size()) panic();
    while (S.size() < (size_t) arr->size()) S.push_back(std::make_unique<Str>(this)); S.resize(arr->size()); for (int i = 0; i < arr->size(); i++) S[i]->set((*arr)[i]); }
  void setModes(const juce::var& list) { auto* arr = list.getArray(); if (!arr) return; std::vector<Mode> nm(arr->size());
    for (int i = 0; i < arr->size(); i++) { auto m = arr->getReference(i); Mode o = i < (int) modes.size() ? modes[i] : Mode(); double f = num(m, "f", 100), q = num(m, "q", 10), amp = num(m, "amp", 0), pan = num(m, "pan", 0);
      double r = std::exp(-PI * f / (q * fs)), w = 2 * PI * f / fs; o.a1 = 2 * r * std::cos(w); o.a2 = r * r; o.b0 = (1 - r * r) * 0.5;
      double k48 = 1 / (2 * std::sin(std::min(1.5, 2 * PI * f / 48000))); o.aL = amp * (1 - pan) * k48; o.aR = amp * (1 + pan) * k48; o.e = 0; nm[i] = o; }
    modes.swap(nm); }
  void panic() { for (auto& s : S) { s->stack.clear(); s->held = false; s->contT = 0; s->cont = 0; s->hasPulse = false; s->damp = .5; s->wantDamp = .5; } held.clear(); map.clear(); }
  bool reach(const Str& s, double n) const { return n >= s.open - 0.01 && n <= s.open + s.range + 0.01; }
  int pick(double n) {
    int best = -1; double bs = 1e12; auto consider = [&](int i, double sc) { if (sc < bs) { bs = sc; best = i; } };
    for (int i = 0; i < (int) S.size(); i++) { auto& s = *S[i]; if (s.role == R_OPEN && std::abs(s.open - n) < 0.01) consider(i, (s.held ? 1e6 : 0) + s.lastUse); } if (best >= 0) return best;
    for (int i = 0; i < (int) S.size(); i++) { auto& s = *S[i]; if (s.role == R_STOPPED && reach(s, n)) consider(i, (s.stack.size() ? 1e6 + s.lastUse : 0) + (n - s.open)); } if (best >= 0) return best;
    for (int i = 0; i < (int) S.size(); i++) { auto& s = *S[i]; double dd = n - s.open; if (s.role == R_OPEN && dd > 0 && dd <= nk.pressBend + 0.01) consider(i, (s.held ? 1e6 : 0) + dd); } if (best >= 0) return best;
    for (int i = 0; i < (int) S.size(); i++) { auto& s = *S[i]; if (s.role == R_OPEN || s.role == R_STOPPED) { double lo = s.open, hi = s.role == R_STOPPED ? s.open + s.range : s.open;
      double dist = n < lo ? lo - n : n > hi ? n - hi : 0; consider(i, dist * 10 + (s.held ? 1e5 : 0)); } }
    return best; }
  bool harmString(double n, int& si, int& hh) { double bs = 1e9; bool found = false;
    for (int i = 0; i < (int) S.size(); i++) { auto& s = *S[i]; if (s.role != R_STOPPED && s.role != R_OPEN) continue;
      for (int h = 2; h <= 6; h++) { double dd = std::abs(n - (s.open + 12 * std::log2((double) h))); if (dd < 0.2) { double sc = h * 10 + dd + (s.held ? 100 : 0); if (sc < bs) { bs = sc; si = i; hh = h; found = true; } } } }
    return found; }
  void eraseHeld(double n) { held.erase(std::remove(held.begin(), held.end(), n), held.end()); }
  void noteOn(double n, double v) {
    clock++; if (map.count(n)) noteOff(n);
    syn->noteOn(n, v, held.empty());
    bool together = frame - lastOn < 0.035 * fs; lastOn = frame; nvel[n] = v;
    if (nk.legato != "poly" && !held.empty() && (!together || nk.legato == "legato")) {
      double last = held.back(); auto it = map.find(last);
      if (it != map.end() && it->second < (int) S.size()) { int si = it->second; auto& s = *S[si];
        if (s.role == R_STOPPED && reach(s, n) && (nk.legato == "legato" || std::abs(n - last) <= nk.thr)) { s.stack.push_back(n); map[n] = si; held.push_back(n); s.slur(n, v); return; } } }
    int si = -1, hh = 0;
    if ((ex.type == Ex::pick || ex.type == Ex::finger) && v < GHOST * 0.6) { int a = -1, b = 0; if (harmString(n, a, b)) { si = a; hh = b; } }
    if (si < 0) si = pick(n); if (si < 0) return;
    auto& s = *S[si];
    for (double hn : s.stack) { auto it = map.find(hn); if (it != map.end() && it->second == si) { map.erase(it); eraseHeld(hn); } }
    s.stack.clear(); s.stack.push_back(n); map[n] = si; held.push_back(n);
    s.start(n, v, hh);
    bool cont = CONT(ex.type);
    for (auto& d : S) if (d->role == R_DRONE) { if (cont ? d->contT == 0 : (!d->held || d->t > 0.35)) d->start(d->open, v * ex.drone); }
  }
  void noteOff(double n) {
    eraseHeld(n); auto it = map.find(n); if (it == map.end()) return; int si = it->second; map.erase(it);
    if (si >= (int) S.size()) return; auto& s = *S[si];
    int idx = -1; for (int i = (int) s.stack.size() - 1; i >= 0; i--) if (s.stack[i] == n) { idx = i; break; } if (idx >= 0) s.stack.erase(s.stack.begin() + idx);
    double rv = .6; auto vt = nvel.find(n); if (vt != nvel.end()) { rv = vt->second; nvel.erase(vt); }
    if (!s.stack.empty()) { if (idx == (int) s.stack.size()) s.slur(s.stack.back(), rv, true); }
    else if (sus) s.pend = true; else s.release();
    if (held.empty() && !sus) { for (auto& d : S) if (d->role == R_DRONE && d->held) d->release(); syn->allOff(); }
  }
  void setSus(bool v) { sus = v; if (!v) { for (auto& s : S) if (s->pend) s->release(); if (held.empty()) { for (auto& d : S) if (d->role == R_DRONE && d->held) d->release(); syn->allOff(); } } }
  // one block (n ≤ 128) of stereo output
  void process(float* L, float* R, int n);
  // the same viz message the worklet posts
  juce::var viz() {
    juce::Array<juce::var> amp, note, harm, hl, me;
    for (auto& s : S) { amp.add(s->rms); note.add(s->harm ? s->touch : s->note + 12 * std::log2(s->freq / s->target)); harm.add(s->harm); hl.add(s->held || s->cont > 0.02); }
    for (auto& m : modes) { me.add(m.e); m.e = 0; }
    auto* o = new juce::DynamicObject(); o->setProperty("t", "viz"); o->setProperty("amp", amp); o->setProperty("note", note); o->setProperty("harm", harm); o->setProperty("held", hl);
    o->setProperty("syn", syn->viz()); o->setProperty("rig", rack->viz()); o->setProperty("lim", limMin); o->setProperty("modeE", me); limMin = 1; return juce::var(o); }
};

// ── Synth members that need Engine
inline Synth::Synth(Engine* e) : E(e), fs(e->fs) { md[0].assign(16384, 0); md[1].assign(16384, 0); ps[0].assign(16384, 0); ps[1].assign(16384, 0); }
inline double Synth::base(const std::string& id) const {
  if (id == "ph_pos") return E->exBase.pos; if (id == "ph_pressure") return E->exBase.pressure; if (id == "ph_speed") return E->exBase.speed; if (id == "ph_ebow") return E->exBase.ebow; if (id == "ph_wind") return E->exBase.wind;
  if (id == "ph_jawari") return E->nkBase.jawari; if (id == "ph_buzz") return E->nkBase.buzz; auto it = p.find(id); return it == p.end() ? NAN : it->second; }
inline bool isPhys(const std::string& id) { return id == "ph_pos" || id == "ph_pressure" || id == "ph_speed" || id == "ph_ebow" || id == "ph_wind" || id == "ph_jawari" || id == "ph_buzz"; }
inline void Synth::set(const juce::var& d) {
  if (auto* pp = d["p"].getDynamicObject()) for (auto& kv : pp->getProperties()) { auto& x = kv.value; if (x.isBool()) p[kv.name.toString().toStdString()] = (bool) x ? 1 : 0; else if (x.isDouble() || x.isInt() || x.isInt64()) p[kv.name.toString().toStdString()] = (double) x; }
  if (auto* oo = d["o"].getDynamicObject()) for (auto& kv : oo->getProperties()) o.getDynamicObject()->setProperty(kv.name, kv.value);
  if (has(d, "mods")) { mods.clear(); modTargets.clear();
    if (auto* arr = d["mods"].getArray()) for (auto& m : *arr) { auto dst = str(m, "d"); if (!def.count(dst)) continue; mods.push_back({ srcIndex(str(m, "s")), dst, num(m, "a", 0) });
      if (std::find(modTargets.begin(), modTargets.end(), dst) == modTargets.end()) modTargets.push_back(dst); }
    bool was = physActive; physActive = false; for (auto& m : mods) if (isPhys(m.d)) physActive = true;
    if (was && !physActive) { E->ex = E->exBase; E->nk = E->nkBase; E->derive(); } }
}
inline void Synth::block(int n) {
  double dt = n / fs; double bpm = (isTarget("tempo") ? eff["tempo"] : Pq("tempo", 0)); if (!(bpm != 0)) bpm = 120;
  for (int i = 0; i < 2; i++) { auto& L = lfo[i]; std::string k = "lfo" + std::to_string(i + 1), sh = O(k + "_shape"), sy = O(k + "_sync"); if (sh.empty()) sh = "sine";
    double rate = !sy.empty() && sy != "free" ? bpm / 60 / divBeats(sy) : (isTarget(k + "_rate") ? eff[k + "_rate"] : Pq(k + "_rate", 0)); if (!(rate != 0)) rate = 1;
    L.ph += rate * dt; bool wrapped = false; if (L.ph >= 1) { L.ph -= std::floor(L.ph); wrapped = true; }
    double ph = L.ph, v;
    if (sh == "tri") v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; else if (sh == "saw") v = 2 * ph - 1; else if (sh == "ramp") v = 1 - 2 * ph; else if (sh == "square") v = ph < 0.5 ? 1 : -1;
    else if (sh == "sh") { if (wrapped) L.sh = rnd()() * 2 - 1; v = L.sh; } else if (sh == "smooth") { if (wrapped) L.tgt = rnd()() * 2 - 1; L.sm += (L.tgt - L.sm) * std::min(1.0, rate * dt * 4); v = L.sm; }
    else v = std::sin(TWO_PI * ph);
    L.v = v; src[i == 0 ? S_LFO1 : S_LFO2] = v; }
  for (int i = 0; i < 2; i++) { auto& e = env[i]; std::string k = "env" + std::to_string(i + 1); double A = Por(k + "_a", .01), D = Por(k + "_d", .3), Sv = Pq(k + "_s", .6), R = Por(k + "_r", .4);
    if (e.st == 1) { e.v += dt / A; if (e.v >= 1) { e.v = 1; e.st = 2; } } else if (e.st == 2) { e.v += (Sv - e.v) * (1 - std::exp(-dt * 4 / D)); if (std::abs(e.v - Sv) < 1e-3) e.st = 3; }
    else if (e.st == 3) e.v = Sv; else if (e.st == 4) { e.v *= std::exp(-dt * 4.6 / R); if (e.v < 1e-4) { e.v = 0; e.st = 0; } }
    src[i == 0 ? S_ENV1 : S_ENV2] = e.v; }
  { double fdb = 20 * std::log10(folV + 1e-9); src[S_FOL] = std::max(0.0, std::min(1.0, (fdb + 36 + (Pq("fol_gain", .5) - .5) * 24) / 36)); }
  double en = 0; for (auto& s : E->S) if (s->role != R_SYMP) en += s->env; src[S_ENERGY] = std::min(1.0, en * 4);
  steps.clear(); if (auto* arr = o["gate_steps"].getArray()) for (auto& x : *arr) steps.push_back(x.isBool() ? (bool) x : (double) x != 0);
  src[S_GATE] = gateStep < (int) steps.size() && steps[gateStep] ? 1 : 0;
  for (auto& id : modTargets) { double nv = toN(id, base(id)); for (auto& m : mods) if (m.d == id) nv += m.a * (m.s >= 0 ? src[m.s] : 0); eff[id] = fromN(id, nv); eff["n_" + id] = clamp01(nv); }
  if (physActive) { static const char* PH[] = { "ph_pos", "ph_pressure", "ph_speed", "ph_ebow", "ph_wind", "ph_jawari", "ph_buzz" };
    for (auto* id : PH) { std::string sid = id, key = sid.substr(3); double val = isTarget(sid) ? eff[sid] : (sid == "ph_jawari" || sid == "ph_buzz" ? *E->nkBase.key(key) : *E->exBase.key(key));
      if (double* dst = (sid == "ph_jawari" || sid == "ph_buzz") ? E->nk.key(key) : E->ex.key(key)) *dst = val; }
    E->derive(); }
  oscLvlP = oscLvl; oscLvl = Vor("osc_lvl", 0); oscOn = oscLvl > 0.001 || oscLvlP > 0.001;
  oscShape = Vq("osc_shape", 0.66); oscMul = std::pow(2.0, (Vor("osc_semi", 0) + Vor("osc_fine", 0) / 100) / 12);
  srcLvlP = haveSrcLvl ? srcLvl : 1; srcLvl = Vq("src_lvl", 1); haveSrcLvl = true;
  { auto om = O("osc_mode"); oscMode = om == "morph" ? 1 : om == "ring" ? 2 : 0; if (om != "" && om != "layer" && om != "morph") oscMode = 2; if (om.empty()) oscMode = 0; }
  f1on = Ob("f1_on"); f2on = Ob("f2_on"); parallel = O("f_route") == "parallel"; mfxOn = Ob("mfx_on"); psOn = Ob("ps_on"); gateOn = Ob("gate_on");
  for (int f = 0; f < 2; f++) { std::string pre = f ? "f2_" : "f1_"; gPrev[f] = g[f]; double cut = std::min(fs * 0.45, Vor(pre + "cut", 1000)); g[f] = std::tan(PI * cut / fs);
    kf[f] = 2 - 1.96 * std::min(1.0, Vq(pre + "res", 0.1)); drv[f] = Vor(pre + "drive", 0); mixf[f] = Vq(pre + "mix", 1); ft[f] = ftype(O(pre + "type"));
    if (ft[f] == FT::formant) { static const double VOW[5][3] = { { 730, 1090, 2440 }, { 530, 1840, 2480 }, { 270, 2290, 3010 }, { 570, 840, 2410 }, { 300, 870, 2240 } };
      double vw = Vor(pre + "vowel", 0) * 4; int i0 = std::min(3, (int) std::floor(vw)); double fr = vw - i0, sc = std::max(0.5, std::min(2.0, cut / 1000));
      for (int j = 0; j < 3; j++) { double F = (VOW[i0][j] + (VOW[i0 + 1][j] - VOW[i0][j]) * fr) * sc; vf[f][j] = std::tan(PI * std::min(fs * 0.45, F) / fs); } } }
  mdTPrev = mdT; mdT = Vor("mfx_time", 3); mdDepth = Vor("mfx_depth", 0);
  { auto sy = O("mfx_sync"); mdRate = !sy.empty() && sy != "free" ? bpm / 60 / divBeats(sy) : Vor("mfx_rate", 0.5); }
  mdFb = Vor("mfx_fb", 0); mdMixP = haveMdMix ? mdMix : 0.5; mdMix = Vq("mfx_mix", 0.5); haveMdMix = true; mdSpread = Vq("mfx_spread", 0.5);
  psRatio = std::pow(2.0, (Vor("ps_semi", 0) + Vor("ps_fine", 0) / 100) / 12); psMixP = havePsMix ? psMix : 0; psMix = Vor("ps_mix", 0); havePsMix = true; psFb = Vor("ps_fb", 0);
  ampPrevBlk = haveAmpNow ? ampNow : 1; ampNow = Vq("amp_lvl", 1); haveAmpNow = true; pan = Vor("amp_pan", 0);
  gDepth = Vq("gate_depth", 1); gSmooth = 1 - std::exp(-1 / (Vor("gate_smooth", 6) * 0.001 * fs));
  { auto gv = o["gate_div"]; std::string gd = gv.isDouble() || gv.isInt() || gv.isInt64() ? "1/" + juce::String((double) gv, (double) gv == std::floor((double) gv) ? 0 : 3).toStdString() : (gv.isString() && gv.toString().isNotEmpty() ? gv.toString().toStdString() : "1/16");
    stepLen = divBeats(gd) * 60 / Vor("tempo", 120) * fs; }
  folA = 1 - std::exp(-1 / (Por("fol_atk", .005) * fs)); folR = 1 - std::exp(-1 / (Por("fol_rel", .15) * fs));
}

// ── Str members
inline void Str::set(const juce::var& p) {
  Role nr = roleOf(str(p, "role", "stopped")); bool roleChanged = role != nr; role = nr; open = num(p, "note", 45); range = num(p, "range", 12);
  auto m = p["mat"]; double gauge = num(p, "gauge", .3); bool wnd = flag(p, "wound");
  Bo = std::min(4e-3, num(m, "stiff", .3) * 4.2e-4 * (wnd ? .5 + 1.6 * gauge * gauge : .25 + 1.2 * gauge)); fOpen = mtof(open);
  hf = (has(m, "hf") ? num(m, "hf", 10) : 6 + 60 * std::pow(num(m, "bright", .1), 1.5)) * (wnd ? 1 + .9 * gauge : 1);
  decay = num(m, "decay", 5) * (1.2 - 0.4 * gauge) * (role == R_SYMP ? 1.4 : 1) * numOr(p, "sus", 1);
  tm = (1 - num(p, "tension", .5)) * 0.12; mag = num(m, "magnetic", 0); wound = wnd;
  setAperture(E->pk.scale != 0 ? E->pk.scale : .65, E->fs);
  if (!held || roleChanged) setNote(open, 0); else calcG(); }
inline void Str::calcG() {
  double f = target, fs = E->fs, T60 = decay * std::pow(110 / f, 0.4) * (1 + 1.6 * E->jaw), R0 = 60 / T60; g = std::pow(10.0, -R0 / (20 * f));
  double fh = std::min(2500.0, fs * .4), w = 2 * PI * fh / fs, r = std::pow(10.0, -(hf * (1 - .7 * E->jaw) * fh / 1000) / (20 * f)), r2 = r * r, c = std::cos(w);
  double dd = 0; if (r2 < .999999) { double A = 1 - r2, Bq = 1 - r2 * c; dd = (Bq - std::sqrt(std::max(0.0, Bq * Bq - A * A))) / A; } d = std::min(.97, std::max(0.0, dd));
  double B = (role == R_STOPPED ? Bo * std::pow(f / fOpen, 2) : Bo) * (CONT(E->ex.type) ? .08 : 1), w0 = 2 * PI * f / fs, N0 = fs / f;
  int k = std::max(2, std::min(12, (int) std::floor(5000 / f))); double wk = w0 * k * std::sqrt(1 + B * k * k), need = N0 - N0 / std::sqrt(1 + B * k * k);
  double best = 0, be = 1e300;
  if (B > 1e-7) for (int i = 1; i <= 48; i++) { double a = -1 + std::pow(i / 49.0, 1.6) * .999, D1 = apDelay(a, w0), got = 4 * (D1 - apDelay(a, wk)), e = std::abs(got - need); if (e < be && 4 * D1 < N0 * .45) { be = e; best = a; } }
  apA = best; comp = 2 + lpDelay(d, w0) + 4 * apDelay(best, w0); }
inline void Str::setNote(double n, double glide) { note = n; target = mtof(n); if (glide <= 0) { freq = target; gc = 1; } else gc = 1 - std::exp(-1 / (glide * E->fs)); calcG(); }
inline void Str::pluckPulse(double v, double vel, double click) {
  auto& ex = E->ex; Ex type = ex.type; double L, noise = 0;
  if (type == Ex::pick) { L = 4 + jsRound((1 - ex.pickStiff) * 30); noise = 48; } else if (type == Ex::finger) L = 4 + jsRound(ex.fingerSoft * 24); else L = 2 + jsRound((1 - ex.hammerHard) * 30);
  int Li = (int) std::max(1.0, jsRound(L * (1.4 - 0.7 * std::min(1.0, vel)) * E->SRR)); if (click != 0) noise = std::max(noise, 90.0); int nz = (int) jsRound(noise * E->SRR);
  double k = v * PI / (2 * Li) * E->SRR;
  std::vector<float> arr(Li + nz, 0.f); for (int i = 0; i < Li; i++) arr[i] = (float) (k * std::sin(PI * (i + 0.5) / Li));
  if (type != Ex::hammer) { double fs = E->fs, f0 = std::max(20.0, target), fc = f0 * .8, rho = std::exp(-2 * PI * fc / fs);
    int tail = (int) std::min(4096.0, std::ceil(4 * fs / (2 * PI * fc))); double gn = (1 - rho) * std::sqrt(1 + std::pow(f0 / fc, 2)) * (f0 < 300 ? std::pow(300 / f0, .45) : 1);
    pulse.assign(Li + tail, 0.f); double y = 0; for (size_t i = 0; i < pulse.size(); i++) { y = ((int) i < Li ? arr[i] : 0) + rho * y; pulse[i] = (float) (y * gn); }
    for (size_t i = pulse.size() > 64 ? pulse.size() - 64 : 0; i < pulse.size(); i++) pulse[i] *= (float) ((pulse.size() - i) / 64.0); }
  else pulse = arr;
  for (int i = 0; i < nz && i < (int) pulse.size(); i++) pulse[i] += (float) ((rnd()() - 0.5) * (v * 0.06 * ex.pickStiff + click) * (1 - (double) i / nz));
  if (type == Ex::hammer) for (int i = 0; i < Li; i++) pulse[i] *= 1.4f;
  pi = 0; hasPulse = !pulse.empty(); }
inline void Str::excite(double v) {
  auto& ex = E->ex;
  if (CONT(ex.type)) { if (ex.bowChange && cont > 0.02) bowDir = -bowDir; else if (ex.bowChange) bowDir = -bowDir; contT = 1; bowAmp = 0.45 + 0.55 * v;
    if (ex.type == Ex::ebow && env < 0.02) { ex.type = Ex::finger; pluckPulse(0.25 * v, 0.25 * v); ex.type = Ex::ebow; } }
  else if (role == R_STOPPED || role == R_OPEN) { double k = std::max(0.0, (v - GHOST) / (1 - GHOST)); pluckPulse(0.22 + 0.78 * std::pow(k, 0.85), v); }
  else pluckPulse(v, v); }
inline void Str::restrike() { if (env < 0.004) return; Ex t = E->ex.type; float k = t == Ex::finger ? 0.15f : t == Ex::hammer ? 0.6f : 0.3f;
  for (int i = 0; i < DMAX; i++) { neck.b[i] *= k; br.b[i] *= k; } neck.last *= k; br.last *= k; lp *= k; env *= k; }
inline void Str::ghost(double n, double v, int h) {
  double p = std::max(0.0, std::min(1.0, v / GHOST)); restrike(); touch = n;
  if (h) { touch = open - 12 * std::log2(1 - 1.0 / h); double c = 1 - p / 0.6; harm = true; setNote(open + 12 * std::log2((double) h), 0);
    damp = std::pow(10.0, -3 / ((0.2 + 6 * c * c) * freq)); pluckPulse(0.55 * (0.7 + 0.3 * c), 0.7, 0.01 * (1 - c)); }
  else { setNote(n, 0); damp = std::pow(10.0, -3 / ((0.02 + 0.16 * (1 - p) * (1 - p)) * freq)); pluckPulse(0.42, 0.5, 0.03); } }
inline void Str::start(double n, double v, int h) {
  idle = false; wake(); lastUse = E->clock; held = true; pend = false; sliding = E->ex.fretter == "slide";
  damp = 1; wantDamp = 0; t = 0; harm = false; touch = n; Ex type = E->ex.type; bool plucked = type == Ex::pick || type == Ex::finger;
  bj = CONT(type) ? 0 : (rnd()() - 0.5) * 0.03 * E->ex.humanize;
  if (plucked && v < GHOST && (role == R_STOPPED || role == R_OPEN)) { ghost(n, v, h); return; }
  if (!CONT(type)) restrike(); setNote(n, 0); excite(v);
  if (role == R_STOPPED) { auto& fr = E->ex.fretter; bool fretted = n - open > .5;
    if (fr == "keys" && fretted) E->fretNoise("clack", v * .7, this); else if (fr == "slide" && fretted) E->fretNoise("clank", v * .5, this); else if (fr == "fingers" && fretted) E->fretNoise("press", v * .5, this); } }
inline void Str::slur(double n, double v, bool off) {
  idle = false; wake(); auto& nk = E->nk; auto fr = E->ex.fretter; double from = note;
  lastUse = E->clock; damp = 1; wantDamp = 0; held = true; harm = false; touch = n;
  double jump = std::abs(n - from); bool fretSlide = fr == "fingers" && nk.frets && jump > 2.5 && !off;
  bool fretless = fr == "fingers" && !nk.frets && role == R_STOPPED, flSlide = fretless && v < 70.0 / 127;
  slideSteps.on = false; sliding = fr == "slide" || flSlide;
  if (fretSlide) { double dir = n > from ? 1 : n < from ? -1 : 0; slideSteps = { true, n, jsRound(from) + dir, dir, std::max(.012, E->ex.slideTime / jump) * E->fs, 0 }; setNote(slideSteps.cur, .002); }
  else setNote(n, sliding ? E->ex.slideTime * (.55 + .22 * std::sqrt(jump)) / 3 : (fr == "keys" || fretless) ? .002 : nk.frets ? std::max(0.004, nk.glide * 0.25) : nk.glide);
  if (CONT(E->ex.type)) { if (contT == 0) excite(v); }
  else if (sliding || fretSlide) {}
  else if (nk.frets || fr == "keys" || fretless) pluckPulse(v * (off ? 0.42 : 0.35), v * (off ? 0.42 : 0.35));
  else pluckPulse(v * 0.08, v * 0.08);
  if (role == R_STOPPED && !fretSlide && !flSlide) E->fretNoise(fr == "fingers" ? (off ? "pull" : "hammer") : fr == "keys" ? "clack" : "", off ? std::min(.8, v) : v, this); }
inline void Str::wake() { awake = (int) jsRound(3 * E->fs / std::max(20.0, std::min(freq, target))) + 1024; }
inline void Str::release() {
  slideSteps.on = false; held = false; pend = false; contT = 0; auto& nk = E->nk; if (harm) return;
  if (role == R_STOPPED && note - open > .5) { auto& fr = E->ex.fretter; E->fretNoise(fr == "keys" ? "unclack" : fr == "slide" ? "slidelift" : "lift", .5 + .3 * std::min(1.0, env * 4), this); }
  if (role == R_STOPPED || (role == R_OPEN && nk.dampOpen)) { double mt = CONT(E->ex.type) ? 0.5 : nk.mute; wantDamp = std::pow(10.0, -3 / (mt * freq)); if (!CONT(E->ex.type)) damp = wantDamp; } }
inline void Str::block(int n) {
  auto& ex = E->ex; double fs = E->fs; t += n / fs;
  if (wantDamp != 0 && !held && cont < 0.02) damp = wantDamp;
  if (held && ex.vibDepth > 0 && role != R_SYMP) { double r = (t - ex.vibDelay) / 0.6; r = r < 0 ? 0 : r > 1 ? 1 : r; vph += 6.2832 * ex.vibRate * n / fs; vib = std::pow(2.0, ex.vibDepth * r * std::sin(vph) / 1200); }
  else vib = 1;
  if (ex.type == Ex::wind) { double h = 1 + std::floor(ex.wind * 7), c = freq * h; if (c > fs * 0.4) c = freq; double r = std::exp(-PI * (c / 18) / fs); bpA1 = 2 * r * std::cos(6.2832 * c / fs); bpA2 = r * r; bpG = 1 - r; }
  elC = 1 - std::exp(-6.2832 * 1.3 * freq / fs);
  { double rate = std::abs(std::log2(freq / (pf != 0 ? pf : freq))) * fs / n; pf = freq;
    if (slideSteps.on) { auto& st = slideSteps; st.cnt += n; while (st.cnt >= st.per && slideSteps.on) { st.cnt -= st.per; if (st.cur == st.to) { slideSteps.on = false; break; } st.cur += st.dir; setNote(st.cur, .002); } }
    auto& fr = ex.fretter; double amt = ex.fretNoise, lvl = 0, f = 1500, q = 6; bool sl = sliding || slideSteps.on;
    if (held && role == R_STOPPED && fr != "keys" && sl && rate > .03 && amt > 0) {
      if (fr == "slide") { auto S = slideOf(ex.slideMat); lvl = std::min(1.0, rate / 2.5) * (wound ? 1 : .3) * S.g * amt * .3; f = S.f * (.8 + std::min(.6, rate * .15)); q = S.q; }
      else { lvl = std::min(1.0, rate / 3) * (wound ? 1 : .1) * amt * .56; f = 1200 + std::min(4200.0, rate * 700); q = 7; } }
    sqT = lvl * .02 * std::sqrt(E->SRR); if (lvl > 0 || sqL > 1e-6) { double r = std::exp(-PI * f / (q * fs)); sqA1 = 2 * r * std::cos(2 * PI * f / fs); sqA2 = r * r; sqB = (1 - r * r) * .5; } }
  rms = std::sqrt(acc / n); acc = 0; awake -= n;
  bool quiet = awake <= 0 && env < 2e-6 && rms < 1e-6 && !hasPulse && cont == 0 && contT == 0;
  if (quiet && !idle) { idle = true; std::fill(neck.b.begin(), neck.b.end(), 0.f); std::fill(br.b.begin(), br.b.end(), 0.f); neck.last = br.last = 0; lp = 0; for (int i = 0; i < 4; i++) apx[i] = apy[i] = 0; env = 0; oenv = 0; }
  else if (!quiet) idle = false;
  double N = fs / freq - comp; magD = (int) std::max(1.0, jsRound(E->pk.magPos * N)); }
inline double Str::tick(double feed) {
  auto& e = *E; freq += (target - freq) * gc;
  double f = freq * e.tune * e.bendMul * vib * (1 + tm * env + e.jaw * 0.02 * (env > 0.3 ? 1 : env * 3.3)); cf = f;
  double N = e.fs / f - comp, bl = N * (e.beta + bj); if (bl < 2) bl = 2; double nl = N - bl; if (nl < 2) nl = 2;
  double d0 = (e.ex.slideFr && held && role == R_STOPPED) ? d * .55 : d; double dd = e.jaw > 0 ? d0 * (1 - e.jaw * 0.8 * (env > 0.25 ? 1 : env * 4)) : d0;
  lp = (1 - dd) * br.last + dd * lp; double x = lp * g * damp;
  double a = apA; if (a != 0) for (int q = 0; q < 4; q++) { double y = a * x + apx[q] - a * apy[q]; apx[q] = x; apy[q] = y; x = y; }
  if (e.jaw > 0) { double y = jy = jy * e.jLeak + x; jm += (y - jm) * e.jMean; double yc = y - jm; jpk = yc > jpk ? yc : jpk * e.jRel;
    double th = jm + jpk * (1 - .8 * e.jaw), pen = std::min(y - th, jpk * .8 * e.jaw); double xin = x;
    if (pen > 0) { double push = pen * 1.75 * e.jaw * cf * 6.2832 / e.fs * std::min(1.0, env * 25); x -= push; jy -= push; }
    double k = e.jEn; jPi += (xin * xin - jPi) * k; jPo += (x * x - jPo) * k;
    if (jPo > 1e-12) { double gcn = std::sqrt(jPi / jPo); if (gcn > 1.03) gcn = 1.03; else if (gcn < 1) gcn = 1; x *= gcn; jy += x - x / gcn; } }
  if (e.buzz > 0 && role == R_STOPPED && held) { double th = 0.35 * (1.05 - e.buzz);
    if (x > th) x = th + (x - th) * 0.3 + e.noise() * 0.01 * e.buzz; else if (x < -th) x = -th + (x + th) * 0.3 + e.noise() * 0.01 * e.buzz; }
  double bR = -x, nR = -neck.last, sv = bR + nR, nv = feed;
  if (hasPulse) { nv += pulse[pi++]; if (pi >= pulse.size()) hasPulse = false; }
  if (contT > 0 || cont > 1e-4) {
    cont += (contT - cont) * (contT > cont ? e.atkC : e.relC); if (contT == 0 && cont < 0.02) cont = 0;
    Ex type = e.ex.type; double c = cont;
    if (type == Ex::bow) { drift += e.noise() * 0.004 - drift * 0.0004; double vb = c * e.bowMax * bowAmp * bowDir * (1 + drift * e.ex.humanize);
      rn += (e.noise() - rn) * .35; vb += rn * 1.6 * (e.grit + 0.004) * c; double dv = vb - sv; double s = dv * e.bowSlope; s = (s < 0 ? -s : s) + 0.75; s = s * s; s = 1 / (s * s); if (s > 1) s = 1;
      if (c > 0.003) nv += dv * s; }
    else if (type == Ex::ebow) { el += (sv - el) * elC; double tgt = 0.06 + 0.22 * e.ex.ebow, gn = 1 - env / tgt; nv += c * (gn > 0 ? 0.8 * gn * e.SRK : 0) * el + e.noise() * 2e-4 * c; }
    else if (type == Ex::wind) { double gust = 1 + e.gustV * e.ex.gust, w = e.noise() * gust, yb = bpG * w + bpA1 * b1 - bpA2 * b2; b2 = b1; b1 = yb;
      double tgt = 0.05 + 0.2 * e.ex.wind, gn = 1 - env / tgt; nv += yb * c * e.ex.wind * 0.35 + (gn > 0 ? 0.01 * e.SRK * gn * c * e.ex.wind : 0) * sv; } }
  else cont = 0;
  neck.tick(bR + nv, nl); double o = br.tick(nR + nv, bl);
  double av = sv < 0 ? -sv : sv; env += (av - env) * 0.002 * e.SRK; acc += o * o; return o; }

inline void Engine::process(float* L, float* R, int n) {
  int nS = (int) S.size(), nM = (int) modes.size();
  for (int k = 0; k < nS; k++) S[k]->block(n);
  for (auto& m : modes) if (m.y1 < 1e-15 && m.y1 > -1e-15 && m.y2 < 1e-15 && m.y2 > -1e-15) m.y1 = m.y2 = 0;
  syn->block(n); frame += n; rack->tempo = syn->Por("tempo", 120); rack->block(n);
  bool oscOn = syn->oscOn; double oscShape = syn->oscShape, oscMul = syn->oscMul / fs;
  bendMul = std::pow(2.0, bendSemis / 12);
  if ((gustT -= n) <= 0) { gustT = 2000 + rnd()() * 6000; gustTarget = rnd()() * 2 - 0.6; } gustV += (gustTarget - gustV) * 0.02;
  double cpl = nk.coupling * 0.6, sc = nk.sympC * 0.1 * SRK, mg = pk.mag * 0.6, pz = pk.piezo, mic = pk.mic, mast = pk.master * 2.5 * TRIM(ex.type);
  for (int i = 0; i < n; i++) {
    double bm = 0, bsy = 0, mgs = 0, oscSum = 0, ringSum = 0, nz = 0;
    for (int j = (int) fn.size() - 1; j >= 0; j--) { auto& ev = fn[j];
      for (int pI = 0; pI < ev.np; pI++) { auto& q = ev.parts[pI]; double x = q.imp ? (ev.t == 0 ? 1 : 0) : noise() * q.e; q.e *= q.ed;
        double y = q.b0 * (x - q.x2) + q.a1 * q.y1 - q.a2 * q.y2; q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y; nz += y * q.g; }
      if (++ev.t >= ev.len) fn.erase(fn.begin() + j); }
    double feed = sympFeed;
    for (int k = 0; k < nS; k++) { auto& s = *S[k];
      if (s.idle && (s.role != R_SYMP || (feed < 1e-7 && feed > -1e-7))) continue;
      if (s.role == R_SYMP) { if (s.idle) s.wake(); s.idle = false; double o = s.tick(feed); bsy += o; if (s.mag > 0) mgs += s.magOut(o) * 0.5; }
      else { if (s.sqT > 0 || s.sqL > 1e-6) { s.sqL += (s.sqT - s.sqL) * .002; double x = noise() * s.sqL, y = s.sqB * (x - s.sqx2) + s.sqA1 * s.sq1 - s.sqA2 * s.sq2; s.sqx2 = s.sqx1; s.sqx1 = x; s.sq2 = s.sq1; s.sq1 = y; nz += y * 6; }
        double o = s.tick(0); bm += o; if (s.mag > 0) mgs += s.magOut(o);
        if (oscOn && s.role != R_DRONE) { double ao = o < 0 ? -o : o; s.oenv += (ao - s.oenv) * (ao > s.oenv ? 0.02 * SRK : 0.0006 * SRK);
          double dt = s.cf * oscMul; s.oph += dt; if (s.oph >= 1) s.oph -= 1; double w = oscWave(s.oph, dt, oscShape); oscSum += w * s.oenv; ringSum += w * o; } } }
    sympFeed = bm * sc;
    double bin = (bm + bsy + nz * .4) * cpl, bl = 0, br = 0, bx = bin - bin2; bin2 = bin1; bin1 = bin;
    for (int k = 0; k < nM; k++) { auto& m = modes[k]; double y = m.b0 * bx + m.a1 * m.y1 - m.a2 * m.y2; m.y2 = m.y1; m.y1 = y; bl += y * m.aL; br += y * m.aR; m.e += y * y; }
    double bs = bm + bsy, p = bs * 0.5 + (bl + br) * 0.04, direct = bs * 0.06;
    { double v3 = mgs - pb, v1 = pa1 * pa + pa2 * v3, v2 = pb + pa2 * pa + pa3 * v3; pa = 2 * v1 - pa; pb = 2 * v2 - pb; mgs = v2 * 1.6; }
    double nzo = nz * (mic * .45 + pz * .35 + mg * .5);
    double l = mgs * mg + p * pz + (bl + direct) * mic + nzo, r = mgs * mg + p * pz + (br + direct) * mic + nzo;
    double yl = l - dc[0] + dcA * dc[1]; dc[0] = l; dc[1] = yl; double yr = r - dc[2] + dcA * dc[3]; dc[2] = r; dc[3] = yr;
    syn->run(yl * mast, yr * mast, oscSum * mast * OSC_G, ringSum * mast * RING_G, i, n);
    rack->run(syn->l, syn->r);
    double ol = rack->l - dc[4] + dcB * dc[5]; dc[4] = rack->l; dc[5] = ol; double orr = rack->r - dc[6] + dcB * dc[7]; dc[6] = rack->r; dc[7] = orr;
    double pkv = std::max(std::abs(ol), std::abs(orr)); if (pkv * lim > 0.891) lim = 0.891 / pkv; else lim += (1 - lim) * limRel;
    ol *= lim; orr *= lim; if (!std::isfinite(ol)) ol = 0; if (!std::isfinite(orr)) orr = 0;
    L[i] = (float) (ol > 1 ? 1 : ol < -1 ? -1 : ol); R[i] = (float) (orr > 1 ? 1 : orr < -1 ? -1 : orr); if (lim < limMin) limMin = lim;
  }
}

} // namespace luither
