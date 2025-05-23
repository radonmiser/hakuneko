// src/web/__tests__/engine/BookmarkManager.test.mjs
jest.mock('../../../mjs/engine/Manga.mjs'); // Mock Manga module
import BookmarkManager from '../../mjs/engine/BookmarkManager.mjs';
import Chapter from '../../mjs/engine/Chapter.mjs';
import Manga from '../../../mjs/engine/Manga.mjs'; // Import the mocked Manga

// Mock global Engine and its dependencies
global.Engine = {
    Connectors: [],
    Storage: {
        saveBookmarks: jest.fn().mockResolvedValue(undefined),
        loadBookmarks: jest.fn().mockResolvedValue([]),
        getExistingChapterTitles: jest.fn(), // Mock this
        // Mock sanatizePath for predictable filenames in tests
        sanatizePath: jest.fn(path => path ? path.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/_+/g, '_') : 'default_filename'),
    },
    Settings: { 
        addEventListener: jest.fn(),
        chapterFormat: { value: '.cbz' },       // For Chapter.file.full
        useSubdirectory: { value: true },      // For Chapter.file.full (indirectly via Manga._getOutputPath)
        baseDirectory: { value: '/downloads' } // For Chapter.file.full (indirectly via Manga._getOutputPath)
    }
};

describe('BookmarkManager.getAllBookmarksWithNewChapters (Storage Mock for Status)', () => {
    let bookmarkManager;
    let mockSettings;
    let consoleLogSpy;
    let consoleWarnSpy;
    // mockMangaInstance will be created by the Manga mock constructor
    // mockIsChapterFileExisting is part of the *real* Manga.prototype

    beforeEach(() => {
        jest.clearAllMocks();
        
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        Engine.Connectors = [];
        Engine.Storage.getExistingChapterTitles.mockReset(); // Reset this specific mock

        Manga.mockClear(); // Clear calls and instances from Manga constructor mock
        // Setup Manga mock to return instances that will have `existingChapters` set by SUT
        // and use their real `isChapterFileExisting` method.
        Manga.mockImplementation((connector, id, title) => {
            // Create a mock instance that behaves like a real Manga instance for our purposes
            const mangaInstance = {
                id: id,
                title: title,
                connector: connector,
                // existingChapters will be populated by BookmarkManager via mocked Engine.Storage
                existingChapters: {}, 
                // Use the actual prototype method for isChapterFileExisting
                // This requires Chapter to correctly form `chapter.file.full`
                isChapterFileExisting: jest.fn(function(chapter) { // `this` refers to mangaInstance
                    return !!(this.existingChapters && chapter && chapter.file && this.existingChapters[chapter.file.full]);
                }),
                // Mock _getOutputPath as Chapter constructor might use it via manga.path
                // This is a simplified mock; actual path generation can be complex.
                _getOutputPath: jest.fn(function() { 
                    return `${Engine.Settings.baseDirectory.value}/${Engine.Storage.sanatizePath(this.connector.label)}/${Engine.Storage.sanatizePath(this.title)}`;
                })
            };
            // Make sure path is available if Chapter's updateStatus uses it
            mangaInstance.path = mangaInstance._getOutputPath();
            return mangaInstance;
        });

        mockSettings = { addEventListener: jest.fn() };
        bookmarkManager = new BookmarkManager(mockSettings, null);
        bookmarkManager.bookmarks = [];
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    test('should return an empty array if no bookmarks are present', async () => {
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters).toEqual([]);
        expect(consoleLogSpy).toHaveBeenCalledWith('No bookmarks available to check for new chapters.');
    });

    test('should skip a bookmark if its connector is not found', async () => {
        bookmarkManager.bookmarks = [
            { key: { connector: 'non-existent-connector', manga: 'manga1' }, title: { manga: 'Manga 1 (No Connector)' } }
        ];
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters).toEqual([]);
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Connector with ID 'non-existent-connector' not found"));
    });

    test('should skip a bookmark if its connector fails to get chapters', async () => {
        const mockConnector = { 
            id: 'test-connector', 
            label: 'Test Connector',
            _getChapters: jest.fn().mockRejectedValue(new Error('Failed to fetch chapters')) 
        };
        Engine.Connectors.push(mockConnector);
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: 'Manga 1 (Failing Connector)' } }
        ];
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters).toEqual([]);
        expect(mockConnector._getChapters).toHaveBeenCalled();
    });
    
    test('should return available chapters based on Engine.Storage.getExistingChapterTitles', async () => {
        const rawChapterDataFromConnector = [ // No status property here
            { id: 'ch1', title: 'Chapter 01', language: 'en' }, 
            { id: 'ch2', title: 'Chapter 02', language: 'en' }, 
            { id: 'ch3', title: 'Chapter 03', language: 'en' }  
        ];
        const mockConnector = { 
            id: 'test-connector', 
            label: 'Test Connector',
            _getChapters: jest.fn().mockResolvedValue(rawChapterDataFromConnector)
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga Test Title';
        const mangaId = 'manga1-id';
        bookmarkManager.bookmarks = [{ 
            key: { connector: 'test-connector', manga: mangaId }, 
            title: { manga: bookmarkTitle } 
        }];

        // Mock Engine.Storage.getExistingChapterTitles for this manga instance
        // Predict filenames: Chapter_01.cbz, Chapter_02.cbz, Chapter_03.cbz
        Engine.Storage.getExistingChapterTitles.mockResolvedValueOnce({
            'Chapter_02.cbz': true // ch2 is 'completed'
        });

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();

        expect(Manga).toHaveBeenCalledTimes(1);
        expect(Manga).toHaveBeenCalledWith(mockConnector, mangaId, bookmarkTitle);
        expect(Engine.Storage.getExistingChapterTitles).toHaveBeenCalledTimes(1);
        // Check that getExistingChapterTitles was called with the manga instance created by the mock
        expect(Engine.Storage.getExistingChapterTitles.mock.calls[0][0]).toMatchObject({ id: mangaId, title: bookmarkTitle });


        expect(newChapters.length).toBe(2);
        const chapter1 = newChapters.find(c => c.id === 'ch1');
        const chapter3 = newChapters.find(c => c.id === 'ch3');

        expect(chapter1).toBeDefined();
        expect(chapter3).toBeDefined();
        expect(newChapters.find(c => c.id === 'ch2')).toBeUndefined();

        for (const chapter of newChapters) {
            expect(chapter).toBeInstanceOf(Chapter);
            expect(chapter.manga.id).toBe(mangaId);
            if (chapter.id === 'ch1') expect(chapter.status).toBe('available');
            if (chapter.id === 'ch3') expect(chapter.status).toBe('available');
        }
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Processed 3 chapters for "${bookmarkTitle}". Found 2 chapters not yet completed.`));
    });

    test('should return an empty array if all chapters are existing (completed)', async () => {
        const rawChapterDataFromConnector = [
            { id: 'ch1', title: 'Chapter 01' }, { id: 'ch2', title: 'Chapter 02' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            label: 'Test Connector',
            _getChapters: jest.fn().mockResolvedValue(rawChapterDataFromConnector) 
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga All Completed';
        bookmarkManager.bookmarks = [{ 
            key: { connector: 'test-connector', manga: 'mangaAllDone' }, 
            title: { manga: bookmarkTitle } 
        }];
        
        Engine.Storage.getExistingChapterTitles.mockResolvedValueOnce({
            'Chapter_01.cbz': true,
            'Chapter_02.cbz': true
        });

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters.length).toBe(0);
        expect(Manga).toHaveBeenCalledTimes(1);
        expect(Engine.Storage.getExistingChapterTitles).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Processed 2 chapters for "${bookmarkTitle}". Found 0 chapters not yet completed.`));
    });


    test('should handle multiple bookmarks with mixed chapter statuses based on storage', async () => {
        const connector1ChaptersRaw = [ { id: 'bm1_ch1', title: 'BM1 Chapter 01' }, { id: 'bm1_ch2', title: 'BM1 Chapter 02' }];
        const mockConnector1 = { id: 'conn1', label: 'Connector 1', _getChapters: jest.fn().mockResolvedValue(connector1ChaptersRaw) };
        
        const connector2ChaptersRaw = [ { id: 'bm2_chA', title: 'BM2 Chapter A' }, { id: 'bm2_chB', title: 'BM2 Chapter B' }];
        const mockConnector2 = { id: 'conn2', label: 'Connector 2', _getChapters: jest.fn().mockResolvedValue(connector2ChaptersRaw) };

        Engine.Connectors.push(mockConnector1, mockConnector2);

        bookmarkManager.bookmarks = [
            { key: { connector: 'conn1', manga: 'mangaBM1' }, title: { manga: 'Manga BM1' } },
            { key: { connector: 'conn2', manga: 'mangaBM2' }, title: { manga: 'Manga BM2' } },
        ];
        
        // For mangaBM1: ch1 available, ch2 completed
        Engine.Storage.getExistingChapterTitles.mockResolvedValueOnce({ 'BM1_Chapter_02.cbz': true });
        // For mangaBM2: chA completed, chB available
        Engine.Storage.getExistingChapterTitles.mockResolvedValueOnce({ 'BM2_Chapter_A.cbz': true });
        
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        
        expect(Manga).toHaveBeenCalledTimes(2);
        expect(Engine.Storage.getExistingChapterTitles).toHaveBeenCalledTimes(2);
        
        // BM1: 1 new (bm1_ch1)
        // BM2: 1 new (bm2_chB)
        expect(newChapters.length).toBe(1 + 1); 
        
        for (const chapter of newChapters) {
            expect(chapter).toBeInstanceOf(Chapter);
        }

        const newChapterIds = newChapters.map(c => c.id);
        expect(newChapterIds).toContain('bm1_ch1'); 
        expect(newChapterIds).not.toContain('bm1_ch2');
        expect(newChapterIds).not.toContain('bm2_chA');
        expect(newChapterIds).toContain('bm2_chB');

        const bm1NewChapter = newChapters.find(c => c.id === 'bm1_ch1');
        expect(bm1NewChapter.manga.id).toBe('mangaBM1');
        expect(bm1NewChapter.status).toBe('available');

        const bm2NewChapter = newChapters.find(c => c.id === 'bm2_chB');
        expect(bm2NewChapter.manga.id).toBe('mangaBM2');
        expect(bm2NewChapter.status).toBe('available');
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processed 2 chapters for "Manga BM1". Found 1 chapters not yet completed.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processed 2 chapters for "Manga BM2". Found 1 chapters not yet completed.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 chapters to download across all bookmarks.'));
    });
});

// Helper functions are no longer needed as raw data is directly provided in tests.
