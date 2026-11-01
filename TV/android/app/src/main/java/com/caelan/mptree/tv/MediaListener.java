package com.caelan.mptree.tv;

import android.service.notification.NotificationListenerService;

/**
 * Does nothing itself. Android only lets an app read what other apps are playing
 * (MediaSessionManager.getActiveSessions) when it is an allowed notification
 * listener, so this is what gets allowed. Android TV has no screen for that; it is
 * allowed once from a computer:
 *
 *   adb shell cmd notification allow_listener com.caelan.mptree.tv/com.caelan.mptree.tv.MediaListener
 *
 * The launcher never reads notifications: LauncherPlugin only asks for the media
 * sessions (the song, the artist, play or pause).
 */
public class MediaListener extends NotificationListenerService {
}
