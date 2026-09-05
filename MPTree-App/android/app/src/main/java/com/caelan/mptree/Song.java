package com.caelan.mptree;

import com.getcapacitor.JSObject;

public class Song {
    public String title;
    public String artist;
    public String uri;
    public long   dateAdded;
    public long   duration;   // milliseconds; 0 = unknown

    // Album grouping. All four come straight out of MediaStore, which has them
    // indexed already, so reading them costs nothing beyond a wider projection.
    //
    // albumId earns its place twice over: it groups songs into albums, and it
    // addresses the system's own cached album thumbnail. Decoding cover art per
    // file means one MediaMetadataRetriever pass per song; going via albumId
    // means one lookup per album, which on a real library is an order of
    // magnitude fewer.
    public String album;
    public long   albumId;    // 0 = unknown
    public int    track;      // 0 = unknown. MediaStore encodes disc*1000 + track.
    public int    year;       // 0 = unknown
    public String genre;      // "" = unknown; only readable on API 30+

    public Song(String title, String artist, String uri, long dateAdded, long duration) {
        this(title, artist, uri, dateAdded, duration, "", 0L, 0, 0, "");
    }

    public Song(String title, String artist, String uri, long dateAdded, long duration,
                String album, long albumId, int track, int year, String genre) {
        this.title     = title;
        this.artist    = artist;
        this.uri       = uri;
        this.dateAdded = dateAdded;
        this.duration  = duration;
        this.album     = album;
        this.albumId   = albumId;
        this.track     = track;
        this.year      = year;
        this.genre     = genre;
    }

    public JSObject toJSObject() {
        JSObject obj = new JSObject();
        obj.put("title",     title);
        obj.put("artist",    artist);
        obj.put("uri",       uri);
        obj.put("dateAdded", dateAdded);
        obj.put("duration",  duration);
        obj.put("album",     album  != null ? album : "");
        obj.put("albumId",   albumId);
        // MediaStore packs the disc number into the thousands place. Callers only
        // ever want the position within its disc, so unpack it here rather than
        // making every consumer remember to.
        obj.put("track",     track > 1000 ? track % 1000 : track);
        obj.put("disc",      track > 1000 ? track / 1000 : 0);
        obj.put("year",      year);
        obj.put("genre",     genre != null ? genre : "");
        return obj;
    }
}
