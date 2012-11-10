Chromium bookmarks gnome shell extension.

This is an extension that allows you to search through chromium or chrome bookmarks.

Compatible with GNOME 3.2, 3.4, and 3.6.

The original version is by bsaleil (see the repository this is forked from), this is merely updated for GNOME 3.4 and 3.6, and also to include Google Chrome bookmarks and/or Chromium ones.

Would like to show favicons instead of application icon, but this is too hard - requires reading the sqlite file Favicons (locked while chrome is open) and saving each favicon's data to a file in order to read it back in as an icon. And every time the database changes we need to update ourselves with it.
