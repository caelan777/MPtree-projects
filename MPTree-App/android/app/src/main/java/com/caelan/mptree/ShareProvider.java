package com.caelan.mptree;

import androidx.core.content.FileProvider;

/**
 * Hands shared songs to other apps. It answers their real type again, as
 * FileProvider does ("audio/mpeg" for an .mp3): answered "a file" (build 100),
 * WhatsApp kept the name but nobody could open the song. Kept as its own class
 * so the authority in the manifest stays the same.
 */
public class ShareProvider extends FileProvider {
}
