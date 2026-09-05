package com.caelan.mptree;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import java.util.ArrayList;
import java.util.List;

public class MusicScanner {

    public static List<Song> getDeviceSongs(Context context) {
        List<Song> songs = new ArrayList<>();
        ContentResolver contentResolver = context.getContentResolver();
        Uri musicUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        // Everything here is already indexed by MediaStore, so a wider projection
        // costs nothing measurable. GENRE is the exception: it only exists as a
        // column from API 30. Below that it lives in a separate genres table and
        // reading it would mean a query per song, which is not worth it, so older
        // devices simply get no genre from the scan. Users can still set one by
        // hand, and that is stored in song meta like a custom name.
        List<String> cols = new ArrayList<>();
        cols.add(MediaStore.Audio.Media.TITLE);
        cols.add(MediaStore.Audio.Media.ARTIST);
        cols.add(MediaStore.Audio.Media.DATA);
        cols.add(MediaStore.Audio.Media.DATE_ADDED);
        cols.add(MediaStore.Audio.Media.DURATION);
        cols.add(MediaStore.Audio.Media.ALBUM);
        cols.add(MediaStore.Audio.Media.ALBUM_ID);
        cols.add(MediaStore.Audio.Media.TRACK);
        cols.add(MediaStore.Audio.Media.YEAR);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            cols.add(MediaStore.Audio.Media.GENRE);
        }
        String[] projection = cols.toArray(new String[0]);

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sortOrder = MediaStore.Audio.Media.TITLE + " ASC";
        Cursor cursor = contentResolver.query(musicUri, projection, selection, null, sortOrder);

        if (cursor != null && cursor.moveToFirst()) {
            int titleColumn     = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
            int artistColumn    = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
            int dataColumn      = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);
            int dateAddedColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DATE_ADDED);
            int durationColumn  = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
            int albumColumn     = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
            int albumIdColumn   = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM_ID);
            int trackColumn     = cursor.getColumnIndex(MediaStore.Audio.Media.TRACK);
            int yearColumn      = cursor.getColumnIndex(MediaStore.Audio.Media.YEAR);
            int genreColumn     = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? cursor.getColumnIndex(MediaStore.Audio.Media.GENRE) : -1;

            do {
                String title  = cursor.getString(titleColumn);
                String artist = cursor.getString(artistColumn);
                String uri    = cursor.getString(dataColumn);
                long dateAdded = dateAddedColumn != -1 ? cursor.getLong(dateAddedColumn) * 1000L : 0;
                long duration  = durationColumn  != -1 ? cursor.getLong(durationColumn)  : 0;

                String album   = albumColumn   != -1 ? cursor.getString(albumColumn) : "";
                long   albumId = albumIdColumn != -1 ? cursor.getLong(albumIdColumn) : 0L;
                int    track   = trackColumn   != -1 ? cursor.getInt(trackColumn)    : 0;
                int    year    = yearColumn    != -1 ? cursor.getInt(yearColumn)     : 0;
                String genre   = genreColumn   != -1 ? cursor.getString(genreColumn) : "";

                if (title  == null) title  = "Unknown Title";
                if (artist == null || artist.equals("<unknown>")) artist = "";
                if (album  == null || album.equals("<unknown>"))  album  = "";
                if (genre  == null) genre = "";

                songs.add(new Song(title, artist, uri, dateAdded, duration,
                                   album, albumId, track, year, genre));
            } while (cursor.moveToNext());
            cursor.close();
        }
        return songs;
    }
}
