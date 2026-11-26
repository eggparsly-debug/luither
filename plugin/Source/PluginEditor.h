#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

// The plugin window: Luither's own web UI in a web view (WebView2 on Windows, WebKit on macOS/Linux)
class LuitherEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit LuitherEditor (LuitherProcessor&);
    ~LuitherEditor() override;
    void resized() override;

private:
    void timerCallback() override;
    static std::optional<juce::WebBrowserComponent::Resource> serve (const juce::String& url);
    juce::WebBrowserComponent::Options makeOptions();

    LuitherProcessor& proc;
    std::unique_ptr<juce::WebBrowserComponent> web;
    int seenRestore = 0; bool uiReady = false;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LuitherEditor)
};
