package com.caelan.mptree;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;

import java.util.ArrayList;
import java.util.List;

public class MusicScanner {

    public static List<Song> getDeviceSongs(Context context) {
        List<Song> songs = new ArrayList<>();
        ContentResolver contentResolver = context.getContentResolver();
        Uri musicUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        String[] projection = {
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.DATE_ADDED,
                MediaStore.Audio.Media.DURATION   // new — already indexed, zero cost
        };

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sortOrder = MediaStore.Audio.Media.TITLE + " ASC";
        Cursor cursor = contentResolver.query(musicUri, projection, selection, null, sortOrder);

        if (cursor != null && cursor.moveToFirst()) {
            int titleColumn     = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
            int artistColumn    = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
            int dataColumn      = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);
            int dateAddedColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DATE_ADDED);
            int durationColumn  = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);

            do {
                String title  = cursor.getString(titleColumn);
                String artist = cursor.getString(artistColumn);
                String uri    = cursor.getString(dataColumn);
                long dateAdded = dateAddedColumn != -1 ? cursor.getLong(dateAddedColumn) * 1000L : 0;
                long duration  = durationColumn  != -1 ? cursor.getLong(durationColumn)  : 0;

                if (title  == null) title  = "Unknown Title";
                if (artist == null || artist.equals("<unknown>")) artist = "";

                songs.add(new Song(title, artist, uri, dateAdded, duration));
            } while (cursor.moveToNext());
            cursor.close();
        }
        return songs;
    }
}



