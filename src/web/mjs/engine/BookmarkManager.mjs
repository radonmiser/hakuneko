import Bookmark from './Bookmark.mjs';

const events = {
    added: 'added',
    removed: 'removed',
    changed: 'changed'
};

export default class BookmarkManager extends EventTarget {

    // TODO: use dependency injection instead of globals for Engine.Connetors, Engine.Storage
    constructor(settings, bookmarkImporter) {
        super();
        this.bookmarks = [];
        this._settings = settings;
        this._bookmarkImporter = bookmarkImporter;

        this._settings.addEventListener('saved', this._onSettingsChanged.bind(this));
    }

    _onSettingsChanged() {
        // TODO: only save bookmarks if the bookmark directory has changed
        this.saveProfile('default', undefined);
    }

    async importBookmarks( file ) {
        let bookmarks = await this._bookmarkImporter.importBookmarks( file );
        let added = '';
        let exists = '';
        let dropped = '';
        bookmarks.forEach( bookmark => {
            // check if connector / website is supported
            let supported = Engine.Connectors.findIndex( c => c.id === bookmark.key.connector ) > -1;
            if( !supported ) {
                dropped += `<tr><td style="color: #808080; font-weight: bold; padding-right: 1em;">${ bookmark.title.connector }</td><td>${ bookmark.title.manga }</td></tr>`;
            }
            // check if bookmark does not exist
            let exist = this.bookmarks.findIndex( b => bookmark.key.manga === b.key.manga && bookmark.key.connector === b.key.connector ) > -1;
            if( exist ) {
                exists += `<tr><td style="color: #808080; font-weight: bold; padding-right: 1em;">${ bookmark.title.connector }</td><td>${ bookmark.title.manga }</td></tr>`;
            }
            // is supported and can be added
            if( supported && !exist ) {
                added += `<tr><td style="color: #808080; font-weight: bold; padding-right: 1em;">${ bookmark.title.connector }</td><td>${ bookmark.title.manga }</td></tr>`;
                this.bookmarks.push( bookmark );
            }
        } );
        this.bookmarks.sort( this.compareBookmarks );
        this.saveProfile( 'default', undefined );
        this._showMergeResults( dropped, exists, added );
    }

    /**
     *
     */
    _showMergeResults( droppedHTML, existsHTML, addedHTML ) {
        let content = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
        </head>
        <body>
            <h1>Bookmark Import Results</h1>
            <!--
            <ul>
                <li><a target="_self" href="#dropped" title="List of all bookmarks that were not imported, because the website is not yet supported by HakuNeko.">Unsupported Bookmarks</a></li>
                <li><a target="_self" href="#exists" title="List of all bookmarks that were not imported, because the bookmarks already exists.">Existing Bookmarks</a></li>
                <li><a target="_self" href="#added" title="List of all bookmarks that were imported successfully.">Imported Bookmarks</a></li>
            </ul>
            -->
            <table style="font-family: monospace;">
                <tbody style="color: red;">
                <tr>
                    <th colspan="2" style="font-size: 1.5em; font-weight: bold; text-align: left; padding-top: 1em;">
                        <hr><a name="dropped">UNSUPPORTED BOOKMARKS</a>
                    </th>
                </tr>
                <tr>
                    <th colspan="2" style="font-family: initial; text-align: left; padding-bottom: 1.5em;">
                        List of all bookmarks that were not imported, because the websites are not yet supported by HakuNeko.<hr>
                    </th>
                </tr>
                ${ droppedHTML }
                </tbody>
                <tbody style="color: blue;">
                <tr>
                    <th colspan="2" style="font-size: 1.5em; font-weight: bold; text-align: left; padding-top: 1em;">
                        <hr><a name="exists">EXISTING BOOKMARKS</a>
                    </th>
                </tr>
                <tr>
                    <th colspan="2" style="font-family: initial; text-align: left; padding-bottom: 1.5em;">
                        List of all bookmarks that were not imported, because the bookmarks already exists in HakuNeko.<hr>
                    </th>
                </tr>
                ${ existsHTML }
                </tbody>
                <tbody style="color: green;">
                <tr>
                    <th colspan="2" style="font-size: 1.5em; font-weight: bold; text-align: left; padding-top: 1em;">
                        <hr><a name="added">ADDED BOOKMARKS</a>
                    </th>
                </tr>
                <tr>
                    <th colspan="2" style="font-family: initial; text-align: left; padding-bottom: 1.5em;">
                        List of all bookmarks that were imported successfully.<hr>
                    </th>
                </tr>
                ${ addedHTML }
                </tbody>
            </table>
        </body>
        </html>`;
        let dataURL = 'data:text/html;utf8,' + encodeURIComponent(content);
        window.open( dataURL, '_blank', 'title=Boommark Import Results,center=true,width=800,height=600' );
    }

    /**
     * Load and apply the bookmarks from the given profile.
     * Callback will be executed after the data has been loaded.
     * Callback will be provided with an error (or null if no error).
     */
    loadProfile( profile, callback ) {
        Engine.Storage.loadBookmarks( 'bookmarks' )
            .then( data => {
                try {
                    if( !data || !data.length || data.length === 0 ) {
                        throw new Error( 'Invalid bookmark list!' );
                    }
                    this.bookmarks = data;
                    this.bookmarks.sort( this.compareBookmarks );
                    this.dispatchEvent( new CustomEvent( events.changed, { detail: this.bookmarks } ) );
                    if( typeof callback === typeof Function ) {
                        callback( null );
                    }
                } catch( e ) {
                    console.error( 'Failed to load bookmarks:', e.message );
                    if( typeof callback === typeof Function ) {
                        callback( e );
                    }
                }
            } )
            .catch( error => {
                if( typeof callback === typeof Function ) {
                    callback( error );
                }
            } );
    }

    /**
     * Save the current bookmarks for the given profile.
     * Callback will be executed after the data has been saved.
     * Callback will be provided with an error (or null if no error).
     */
    saveProfile( profile, callback ) {
        Engine.Storage.saveBookmarks( 'bookmarks', this.bookmarks, 2 )
            .then( () => {
                this.dispatchEvent( new CustomEvent( events.changed, { detail: this.bookmarks } ) );
                if( typeof callback === typeof Function ) {
                    callback( null );
                }
            } )
            .catch( error => {
                console.error( 'Failed to save bookmarks:', error.message );
                if( typeof callback === typeof Function ) {
                    callback( error );
                }
            } );
    }

    /**
     *
     */
    addBookmark( manga ) {
        if( !manga || ! manga.connector ) {
            return false;
        }
        let index = this.bookmarks.findIndex( ( bookmark ) => {
            return bookmark.key.manga === manga.id && bookmark.key.connector === manga.connector.id;
        });
        if( index < 0 ) {
            let bookmark = new Bookmark( manga );
            this.bookmarks.push( bookmark );
            this.bookmarks.sort( this.compareBookmarks );
            this.saveProfile( 'default', undefined );
            this.dispatchEvent( new CustomEvent( events.added, { detail: bookmark } ) );
            return true;
        }
        return false;
    }

    /**
     *
     */
    deleteBookmark( bookmark ) {
        let index = this.bookmarks.findIndex( ( b ) => {
            return b.key.manga === bookmark.key.manga && b.key.connector === bookmark.key.connector;
        });
        if( index > -1 ) {
            this.bookmarks.splice( index, 1 );
            this.saveProfile( 'default', undefined );
            this.dispatchEvent( new CustomEvent( events.removed, { detail: bookmark } ) );
            return true;
        }
        return false;
    }

    /**
     * Helper function for sorting
     */
    compareBookmarks( a, b ) {
        return a.title.manga.toLowerCase() < b.title.manga.toLowerCase() ? -1 : 1;
    }

    async getAllBookmarksWithNewChapters() {
        const allNewChapters = [];
        if (!this.bookmarks || this.bookmarks.length === 0) {
            console.log('No bookmarks available to check for new chapters.');
            return allNewChapters;
        }

        // Engine.Connectors is used elsewhere in this file, so it should be available.
        // Engine.ChaptermarkManager access is less certain, so a placeholder will be used.

        for (const bookmark of this.bookmarks) {
            console.log('Checking for new chapters in bookmark:', bookmark.title.manga);
            try {
                const connector = Engine.Connectors.find(c => c.id === bookmark.key.connector);
                if (!connector) {
                    console.warn(`Connector with ID '${bookmark.key.connector}' not found for bookmark '${bookmark.title.manga}'. Skipping.`);
                    continue;
                }

                // The manga object for _getChapters usually needs at least an 'id'.
                // Provide title as well, as it can be useful for context or if chapter.manga needs it.
                const mangaForConnector = { 
                    id: bookmark.key.manga, 
                    title: bookmark.title.manga,
                    connector: connector // Add this
                    // Potentially other fields like connector ID if chapter.manga needs full context,
                    // but usually Connector._getChapters sets up its chapter.manga references correctly.
                };
                const sourceChapters = await connector._getChapters(mangaForConnector);

                if (sourceChapters && sourceChapters.length > 0) {
                    const mangaIdentity = { id: bookmark.key.manga, connector: { id: bookmark.key.connector } };
                    // Assuming Engine.ChaptermarkManager is available globally like Engine.Connectors
                    const markedChapterDetails = Engine.ChaptermarkManager.getChaptermark(mangaIdentity);

                    if (!markedChapterDetails) {
                        // No chapter mark, all source chapters are new
                        console.log(`No chaptermark for ${bookmark.title.manga}. Adding all ${sourceChapters.length} chapters as new.`);
                        for (const chapter of sourceChapters) {
                            if (!chapter.manga) { // Ensure manga reference is set
                                chapter.manga = mangaForConnector;
                            }
                            // Condition: chapter.status !== 'completed'
                            if (chapter.status !== 'completed') {
                                allNewChapters.push(chapter);
                            }
                        }
                    } else {
                        // ChaptermarkManager._getChapterIdentifier(chapter) is used internally by ChaptermarkManager
                        // to get a consistent ID (e.g. chapter.id.hash or chapter.id).
                        // markedChapterDetails.chapterID is the stored ID.
                        // Also, comparing titles as a fallback, similar to isChapterMarked logic.
                        let markedChapterIndex = sourceChapters.findIndex(sc => 
                            Engine.ChaptermarkManager._getChapterIdentifier(sc) === markedChapterDetails.chapterID || 
                            (sc.title && markedChapterDetails.chapterTitle && sc.title === markedChapterDetails.chapterTitle)
                        );

                        if (markedChapterIndex === -1) {
                            console.warn(`Marked chapter (ID: ${markedChapterDetails.chapterID}, Title: ${markedChapterDetails.chapterTitle}) not found in source for ${bookmark.title.manga}. Considering all ${sourceChapters.length} chapters as new.`);
                            for (const chapter of sourceChapters) {
                                if (!chapter.manga) { chapter.manga = mangaForConnector; }
                                // Condition: chapter.status !== 'completed'
                                if (chapter.status !== 'completed') {
                                    allNewChapters.push(chapter);
                                }
                            }
                        } else {
                            console.log(`Marked chapter for ${bookmark.title.manga} found at index ${markedChapterIndex}. Adding subsequent chapters as new.`);
                            for (let i = 0; i < sourceChapters.length; i++) {
                                if (i > markedChapterIndex) {
                                    const chapter = sourceChapters[i];
                                    if (!chapter.manga) { chapter.manga = mangaForConnector; }
                                    // Condition: chapter.status !== 'completed'
                                    if (chapter.status !== 'completed') {
                                        allNewChapters.push(chapter);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    console.log(`No chapters found for bookmark '${bookmark.title.manga}' via connector '${connector.id}'.`);
                }
            } catch (error) {
                console.error(`Error fetching/processing chapters for bookmark '${bookmark.title.manga}':`, error);
                // Continue to the next bookmark
            }
        }
        console.log(`Found ${allNewChapters.length} new chapters across all bookmarks.`);
        return allNewChapters;
    }
}