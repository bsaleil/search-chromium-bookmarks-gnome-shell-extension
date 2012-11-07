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
            let app = appSys.initial_search([app]);
            if (!app.length) {
                return;
            }
            let bookmarksPath = BookmarkPaths[appn];
            let file = Gio.file_new_for_path(bookmarksPath),
                monitor = file.monitor(Gio.MonitorFlags.NONE, null);
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
                return;
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
                    match_against: (bm.name + bm.url).toLowerCase().replace(/\s/g, ''),
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

	getInitialResultSet: function (terms) {
		let results = [];
        let pattern = terms.join('').replace(/\s/g, '').toLowerCase();
        for (let id in this._bookmarks) {
            if (!this._bookmarks.hasOwnProperty(id)) {
                continue;
            }
            let bm = this._bookmarks[id];

			// Search pattern into lowercase name + url
			if (bm.match_against.indexOf(pattern) > -1) {
				results.push(bm);
            }
		}
        if (ShellVersion[1] >= 6) {
            this.searchSystem.pushResults(this, results);
        }
		return results;
	},

	getSubsearchResultSet: function (previousResults, terms) {
		return this.getInitialResultSet(terms);
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
	if (ChromiumInst == null)
	{
		ChromiumInst = new ChromiumBookmarksSearch();
		Main.overview.addSearchProvider(ChromiumInst);
	}
}

function disable() {
	if (ChromiumInst != null)
	{
		Main.overview.removeSearchProvider(ChromiumInst);
		ChromiumInst.destroy();
		ChromiumInst = null;
	}
}
