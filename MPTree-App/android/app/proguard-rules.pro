# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── MPTree ───────────────────────────────────────────────────────────────────
# R8 is on for release builds (see build.gradle). It removes and renames what
# it cannot see being used. Three things here are only ever reached by name,
# from the web side or from Android itself, so they are kept as they are.

# Our own code: the plugins the web side calls by method name, the playback
# service, the widget. Small, and not worth one renamed method going missing.
-keep class com.caelan.mptree.** { *; }

# Capacitor's bridge between the WebView and the plugins. It finds plugins and
# their methods by annotation, and the WebView calls into it by name.
-keep class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
    @android.webkit.JavascriptInterface <methods>;
}

# Annotations and generic signatures are read at run time; line numbers make a
# crash report from Play readable.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, SourceFile, LineNumberTable
