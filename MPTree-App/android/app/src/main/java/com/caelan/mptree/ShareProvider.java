package com.caelan.mptree;

import android.net.Uri;

import androidx.core.content.FileProvider;

/**
 * Hands shared songs to other apps as plain files.
 *
 * WhatsApp does not go by the type on the share intent: it asks the provider
 * what the file is. FileProvider answers from the extension, "audio/mpeg" for
 * an .mp3, and WhatsApp then sends an audio message, which has no name: it
 * arrives as "audiofile". Answered "application/octet-stream", WhatsApp sends
 * a document, which keeps its name ("Artist - Title.mp3"). The file itself is
 * the same; a tap on it still opens a music player.
 */
public class ShareProvider extends FileProvider {
    @Override
    public String getType(Uri uri) {
        return "application/octet-stream";
    }
}
