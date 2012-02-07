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

// Useful constants
// File that contains the chromium bookmarks
const FILEPATH = GLib.get_home_dir() + "/.config/chromium/Default/Bookmarks";
// Chromium executable file path
const CHROMIUMPATH = "/usr/bin/chromium-browser";
// Title in the overview
const OVERVIEWTITLE = "CHROMIUM BOOKMARKS";
// Icon used by clutter to display results
const ICONCLUTTER = "chromium-browser.desktop"

// Useful vars
// Lock the instance of the search provider
var ChromiumInst = null;
// Contains all the bookmarks
var bookmarksTab = new Array();
// Monitor for chromium bookmarks
var bookmarksMonitor = null;

function ChromiumBookmarksSearch()
{
	this._init();
}

ChromiumBookmarksSearch.prototype = 
{
	__proto__: Search.SearchProvider.prototype,

	_init: function() 
	{
		Search.SearchProvider.prototype._init.call(this, OVERVIEWTITLE);

		// Connect to bookmarks file changes
		//GLib.file_test(FILEPATH, GLib.FileTest.EXISTS);
		if (!GLib.file_test(FILEPATH, GLib.FileTest.EXISTS))
		{
			global.logError("Error while reading bookmarks file.");
			return false;
		}
		
		let file = Gio.file_new_for_path(FILEPATH);
		bookmarksMonitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
		bookmarksMonitor.connect('changed', Lang.bind(this, this._readChromiumBookmarks));
		
		this._readChromiumBookmarks();
		return true;
	},
	
	// Read and store all chromium bookmarks in "bookmarksTab"
	_readChromiumBookmarks: function()
	{
		if (!GLib.file_test(FILEPATH, GLib.FileTest.EXISTS))
		{
			global.logError("Error while reading bookmarks file.");
			return false;
		}
		
		let data;
		data = GLib.file_get_contents(FILEPATH, null, 0);
		// data[1] represents the content of the file
		let dataJson = JSON.parse(data[1]);
				
		bookmarksTab = new Array();
		
		// Bookmark_Bar and other folders
		let bookmarksJson = dataJson.roots.bookmark_bar.children;
		readFolder(bookmarksJson);
		let bookmarksJson = dataJson.roots.other.children;
		readFolder(bookmarksJson);
		
		// Read and store all bookmarks from a folder
		function readFolder(folder)
		{
			for (let i=0; i<folder.length; i++)
			{
				if (folder[i].type == "url")
				{
					bookmarksTab.push({
						'pos': bookmarksTab.length,
						'name': folder[i].name,
						'url': folder[i].url});
				}
				else if (folder[i].type == "folder")
				{ readFolder(folder[i].children); }
			}
		}
	},
	
	getResultMeta: function(resultId)
	{
		let appSys = Shell.AppSystem.get_default();
        	let app = appSys.lookup_app(ICONCLUTTER);
		return {'id': resultId,
			'name': bookmarksTab[resultId.pos].name,
			'createIcon': function(size) {return app.create_icon_texture(size);}}
	}, 
	
	activateResult: function(id) 
	{
		Util.spawn([CHROMIUMPATH, '', id.url]);
	},
	
	getInitialResultSet: function(terms) 
	{
		let results = [];
		for (let i=0; i<bookmarksTab.length; i++)
		{
			// concat name and url and remove spaces
			let str = bookmarksTab[i].name + bookmarksTab[i].url;
			str = str.replace(/\s/g,'');
			
			// remove spaces of 'terms'
			let prePattern = "";
			for (let j=0; j<terms.length; j++)
			{
				if (terms[j] != '') prePattern+=terms[j];
			}
			let pattern = new RegExp(prePattern,"gi");
			
			// Search pattern into str
			if (str.match(pattern))
				results.push(bookmarksTab[i]);
		}
		return results;
	},

	getSubsearchResultSet: function(previousResults, terms)
	{
		return this.getInitialResultSet(terms);
	},
}

function init(metadata)
{
}

function enable()
{
	if (ChromiumInst == null)
	{
		ChromiumInst = new ChromiumBookmarksSearch();
		Main.overview.addSearchProvider(ChromiumInst);
	}
}

function disable()
{
	if (ChromiumInst != null)
	{
		Main.overview.removeSearchProvider(ChromiumInst);
		ChromiumInst = null;
	}
	bookmarksMonitor.cancel();
}
