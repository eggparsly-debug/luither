#include "PluginEditor.h"
#include "BinaryData.h"

std::optional<juce::WebBrowserComponent::Resource> LuitherEditor::serve (const juce::String& url)
{
    auto path = url.fromFirstOccurrenceOf ("/", false, false).upToFirstOccurrenceOf ("?", false, false);
    if (path.isEmpty() || path == "index.html" || path == "luither.html")
    {
        auto* d = reinterpret_cast<const std::byte*> (BinaryData::luither_html);
        return juce::WebBrowserComponent::Resource { std::vector<std::byte> (d, d + BinaryData::luither_htmlSize), "text/html; charset=utf-8" };
    }
    return std::nullopt;
}

juce::WebBrowserComponent::Options LuitherEditor::makeOptions()
{
    using O = juce::WebBrowserComponent::Options;
    auto dataDir = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory).getChildFile ("Luither").getChildFile ("WebView");
    return O {}
        .withBackend (O::Backend::webview2)
        .withWinWebView2Options (O::WinWebView2 {}.withUserDataFolder (dataDir).withStatusBarDisabled())
        .withNativeIntegrationEnabled()
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withResourceProvider ([] (const juce::String& u) { return serve (u); })
        // engine messages from the UI
        .withEventListener ("msg", [this] (juce::var m) { proc.uiMessage (m); })
        // the whole instrument as the UI sees it (saved with the project)
        .withEventListener ("cfg", [this] (juce::var c) { proc.setUiConfig (c.toString()); })
        // the page is up: tell it the sample rate and hand it the saved instrument, if any
        .withEventListener ("hello", [this] (juce::var) {
            auto* o = new juce::DynamicObject(); o->setProperty ("sr", proc.getEngineRate()); o->setProperty ("cfg", proc.getUiConfig());
            web->emitEventIfBrowserIsVisible ("init", juce::var (o)); uiReady = true; seenRestore = proc.restoreCount; });
}

LuitherEditor::LuitherEditor (LuitherProcessor& p) : AudioProcessorEditor (&p), proc (p)
{
    web = std::make_unique<juce::WebBrowserComponent> (makeOptions());
    addAndMakeVisible (*web);
    setResizable (true, true);
    setResizeLimits (960, 620, 2560, 1600);
    setSize (1440, 900);
    web->goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    proc.editorOpen = true;
    startTimerHz (30);
}

LuitherEditor::~LuitherEditor() { proc.editorOpen = false; stopTimer(); }

void LuitherEditor::resized() { web->setBounds (getLocalBounds()); }

void LuitherEditor::timerCallback()
{
    if (! uiReady) return;
    // host MIDI: keyboard display, mod wheel and learned knobs
    LuitherProcessor::HostEvent ev[256]; int n = proc.popHostEvents (ev, 256);
    if (n > 0)
    {
        juce::Array<juce::var> list;
        for (int i = 0; i < n; i++) { juce::Array<juce::var> e { ev[i].kind, ev[i].a, ev[i].b }; list.add (e); }
        web->emitEventIfBrowserIsVisible ("midi", list);
    }
    juce::var viz; if (proc.takeViz (viz)) web->emitEventIfBrowserIsVisible ("viz", viz);
    if (proc.restoreCount != seenRestore)
    {
        seenRestore = proc.restoreCount; auto* o = new juce::DynamicObject(); o->setProperty ("cfg", proc.getUiConfig());
        web->emitEventIfBrowserIsVisible ("load", juce::var (o));
    }
}
