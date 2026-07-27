package com.caelan.mptree;

import com.getcapacitor.JSObject;

public class Song {
    public String title;
    public String artist;
    public String uri;
    public long   dateAdded;
    public long   duration;   // milliseconds; 0 = unknown

    public Song(String title, String artist, String uri, long dateAdded, long duration) {
        this.title     = title;
        this.artist    = artist;
        this.uri       = uri;
        this.dateAdded = dateAdded;
        this.duration  = duration;
    }

    public JSObject toJSObject() {
        JSObject obj = new JSObject();
        obj.put("title",     title);
        obj.put("artist",    artist);
        obj.put("uri",       uri);
        obj.put("dateAdded", dateAdded);
        obj.put("duration",  duration);
        return obj;
    }
}