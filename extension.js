// This extension is developed by Baptiste Saleil
// Contact me if you have any problem, bug,...
// http://bsaleil.org/
//
// Licence: GPLv2+

const Main = imports.ui.main;
const Search = imports.ui.search;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Util = imports.misc.util;

let ShellVersion = imports.misc.config.PACKAGE_VERSION.split('.');

// Useful constants
const DELIM = '!';
// File that contains the chromium bookmarks
const BookmarkPaths = {
    'chromium':
        GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'chromium/Default/Bookmarks'
        ]),
    'google-chrome':
        GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'google-chrome/Default/Bookmarks'
        ])
};
// GNOME 3.2 and 3.4: FileMonitorFlags. 3.6 (TODO: CHECK) MonitorFlags
if (!Gio.FileMonitorFlags) {
    Gio.FileMonitorFlags = Gio.MonitorFlags;
}

// Lock the instance of the search provider
var ChromiumInst = null;

function ChromiumBookmarksSearch() {
	this._init();
}

ChromiumBookmarksSearch.prototype = {
	__proto__: Search.SearchProvider.prototype,

	_init: function () {
		Search.SearchProvider.prototype._init.call(this, _("CHROMIUM/CHROME BOOKMARKS"));

        // work out which of google-chrome and chromium-browser is installed
        let appSys = Shell.AppSystem.get_default();
        this._apps = {};
        this._bookmarks = {};
        // determine what is installed.
        for (let appn in BookmarkPaths) {
            if (!BookmarkPaths.hasOwnProperty(appn)) {
                continue;
            }
            let app = appSys.initial_search([appn]);
            if (!app.length) {
                continue;
            }
            let bookmarksPath = BookmarkPaths[appn];
            let file = Gio.file_new_for_path(bookmarksPath),
                monitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
            monitor.connect('changed', Lang.bind(this, function () {
                this._readBookmarks(appn);
            }));
            this._apps[appn] = {
                path: bookmarksPath,
                monitor: monitor,
                app: app[0]
            };
            this._readBookmarks(appn);
        }
	},
	
	// Read and store all chromium bookmarks in this._bookmarks
	_readBookmarks: function (appn) {
        let appInfo = this._apps[appn];
		if (!appInfo || !GLib.file_test(appInfo.path, GLib.FileTest.EXISTS)) {
            return;
		}
		
		let data = GLib.file_get_contents(appInfo.path, null, 0);
        try {
            // data[1] represents the content of the file
            data = JSON.parse(data[1]);
        } catch (e) {
            log('Error reading bookmarks file %s: %s'.format(appInfo.path, e.message));
            return;
        }

        // delete old bookmarks for this app
        for (let bm in this._bookmarks) {
            if (!this._bookmarks.hasOwnProperty(bm)) {
                continue;
            }
            if (bm.substr(0, appn.length + DELIM.length) === (appn + DELIM)) {
                delete this._bookmarks[bm];
            }
        }

		// Bookmark_Bar and other folders
		this._readFolder(data.roots.bookmark_bar.children, appn);
		this._readFolder(data.roots.other.children, appn);
	},

    // Read and store all bookmarks from a folder (utility function)
    _readFolder: function (folder, appn) {
        for (let i = 0; i < folder.length; i++) {
            let bm = folder[i];
            if (bm.type === 'url') {
                // ID is [appname][delimiter][bookmark.id], where 'delimiter'
                // should be something that doesn't appear in appname.
                let id = appn + DELIM + bm.id;
                this._bookmarks[id] = {
                    id: id,
                    name: bm.name,
                    url_lower: bm.url.toLowerCase(),
                    name_lower: bm.name.toLowerCase(),
                    url: bm.url,
                    app: this._apps[appn].app,
                    createIcon: Lang.bind(this, function (size) {
                        return this._apps[appn].app.create_icon_texture(size);
                    })
                };
            } else if (bm.type === 'folder') {
                this._readFolder(bm.children, appn);
            }
        }
    },
	
	getResultMeta: function (resultId) {
		return this._bookmarks[resultId];
	},

	getResultMetas: function (ids, callback) {
        let metas = ids.map(this.getResultMeta);
        if (callback) {
            callback(metas);
        }
        return metas;
	},

	activateResult: function (id) {
        let result = this._bookmarks[id];
        // timestamp, URIs, workspace
        result.app.launch(global.get_current_time(), [result.url], -1);
	},

    _searchBookmarks: function (bookmarks, terms) {
        /* Items where term matches multiple criteria (e.g. name and URL)
         * before single matches.
         * Items which match on a prefix before non-prefix substring matches.
         */
        let prefixMatch = [];
        let otherMatch = [];
        for (let id = 0; id < bookmarks.length; ++id) {
            let bm = this._bookmarks[bookmarks[id]];

            // you must match *all* terms.
            let matches = false,
                prefix = false;
            for (let i = 0; i < terms.length; ++i) {
                let urlMatch = bm.url_lower.indexOf(terms[i]),
                    nameMatch = bm.name_lower.indexOf(terms[i]);
                if (urlMatch === -1 && nameMatch === -1) {
                    matches = false;
                    break;
                }
                matches = true;
                if (urlMatch === 0 || nameMatch === 0) {
                    prefix = true;
                }
            }
            if (!matches) {
                continue;
            }
            if (prefix) {
                prefixMatch.push(bm);
            } else {
                otherMatch.push(bm);
            }
		}
        // sort by name.
        // TODO: should really sort by "relevance"/score the prefix
        // and title a little higher than a url or substring match?
        prefixMatch.sort(function (bm1, bm2) {
            return bm1.name > bm2.name;
        });
        otherMatch.sort(function (bm1, bm2) {
            return bm1.name > bm2.name;
        });
        let results = prefixMatch.concat(otherMatch).map(function (bm) {
            return bm.id;
        });
        return results;
    },

    // TODO: make this async to speed things up?
    // On GNOME 3.2: getInitialResultSet should be fast, use this.addItems for
    // async.
    // On GNOME 3.4: there appears to be *Async methods that user pushResults
    // On GNOME 3.6: just use .pushResults for everything.
	getInitialResultSet: function (terms) {
        let results = this._searchBookmarks(Object.keys(this._bookmarks), terms);
        if (ShellVersion[1] >= 6) {
            this.searchSystem.pushResults(this, results);
        }
		return results;
	},

	getSubsearchResultSet: function (previousResults, terms) {
        let results = this._searchBookmarks(previousResults, terms);
        if (ShellVersion[1] >= 6) {
            this.searchSystem.pushResults(this, results);
        }
		return results;
	},

    destroy: function () {
        for (let appn in this._apps) {
            if (!this._apps.hasOwnProperty(appn)) {
                continue;
            }
            this._apps[appn].monitor.cancel();
            delete this._apps[appn];
        }
        this._bookmarks = {};
    }
};

function init() {
}

function enable() {
	if (ChromiumInst == null) {
		ChromiumInst = new ChromiumBookmarksSearch();
		Main.overview.addSearchProvider(ChromiumInst);
	}
}

function disable() {
	if (ChromiumInst != null) {
		Main.overview.removeSearchProvider(ChromiumInst);
		ChromiumInst.destroy();
		ChromiumInst = null;
	}
}
