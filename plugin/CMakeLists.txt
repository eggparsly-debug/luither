cmake_minimum_required(VERSION 3.22)
project(Luither VERSION 0.1.0)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE: use a local checkout if given (-DJUCE_DIR=...), otherwise fetch it
if (JUCE_DIR)
  add_subdirectory(${JUCE_DIR} juce)
else()
  include(FetchContent)
  FetchContent_Declare(juce GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.4 GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(juce)
endif()

option(LUITHER_PLUGIN "Build the plugin (needs a web view: WebView2 on Windows, WebKitGTK on Linux)" ON)

# ── offline renderer: the C++ engine on its own, for comparing against the browser prototype
juce_add_console_app(luither_render PRODUCT_NAME "luither_render")
target_sources(luither_render PRIVATE tools/render_cli.cpp)
target_compile_definitions(luither_render PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
target_link_libraries(luither_render PRIVATE juce::juce_core juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)

if (LUITHER_PLUGIN)
  # the single-file UI built by build.py, served to the plugin's web view
  juce_add_binary_data(LuitherUI SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/../luither.html)

  juce_add_plugin(Luither
    COMPANY_NAME "eggparsly"
    PLUGIN_MANUFACTURER_CODE Eggp
    PLUGIN_CODE Luth
    FORMATS VST3 Standalone
    PRODUCT_NAME "Luither"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2 TRUE
    VST3_CATEGORIES Instrument Synth
    COPY_PLUGIN_AFTER_BUILD FALSE)

  target_sources(Luither PRIVATE Source/PluginProcessor.cpp Source/PluginEditor.cpp)
  target_compile_definitions(Luither PUBLIC
    JUCE_WEB_BROWSER=1 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1 JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(Luither PRIVATE LuitherUI
    juce::juce_audio_utils juce::juce_gui_extra juce::juce_audio_processors
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)
endif()

# ── host test: loads the built VST3 the way a DAW does (state restore, MIDI, render, state save)
option(LUITHER_HOST_TEST "Build the VST3 host test" OFF)
if (LUITHER_HOST_TEST)
  juce_add_console_app(luither_host_test PRODUCT_NAME "luither_host_test")
  target_sources(luither_host_test PRIVATE tools/host_test.cpp)
  target_compile_definitions(luither_host_test PRIVATE JUCE_PLUGINHOST_VST3=1 JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(luither_host_test PRIVATE juce::juce_audio_processors juce::juce_recommended_config_flags)
endif()
