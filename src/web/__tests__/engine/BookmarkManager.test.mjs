// src/web/__tests__/engine/BookmarkManager.test.mjs
jest.mock('../../../mjs/engine/Manga.mjs'); // Mock Manga module
import BookmarkManager from '../../mjs/engine/BookmarkManager.mjs';
import Chapter from '../../mjs/engine/Chapter.mjs';
import Manga from '../../../mjs/engine/Manga.mjs'; // Import the mocked Manga

// Mock global Engine and its dependencies
global.Engine = {
    Connectors: [],
    // ChaptermarkManager is no longer used by the simplified method
    Storage: {
        saveBookmarks: jest.fn().mockResolvedValue(undefined),
        loadBookmarks: jest.fn().mockResolvedValue([]),
    },
    Settings: { 
        addEventListener: jest.fn(),
    }
};

describe('BookmarkManager.getAllBookmarksWithNewChapters (Simplified Logic with Manga Mock)', () => {
    let bookmarkManager;
    let mockSettings;
    let consoleLogSpy;
    let consoleWarnSpy;
    let mockMangaInstance;
    let mockIsChapterFileExisting;

    beforeEach(() => {
        jest.clearAllMocks();
        
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        Engine.Connectors = [];

        // Setup Manga mock for each test
        Manga.mockClear();
        mockIsChapterFileExisting = jest.fn();
        mockMangaInstance = {
            id: 'mockMangaId', // Default mock values, can be customized per test if needed
            title: 'Mock Manga Title',
            connector: { id: 'mockConnectorId', label: 'Mock Connector' }, // Ensure connector has an id
            isChapterFileExisting: mockIsChapterFileExisting,
            // Add any other properties or methods of Manga that Chapter might use
            // For example, if Chapter's updateStatus calls other Manga methods
        };
        Manga.mockImplementation(() => mockMangaInstance);


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
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 0 chapters to download across all bookmarks.'));
    });

    test('should skip a bookmark if its connector fails to get chapters', async () => {
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockRejectedValue(new Error('Failed to fetch chapters')) 
        };
        Engine.Connectors.push(mockConnector);
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: 'Manga 1 (Failing Connector)' } }
        ];
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters).toEqual([]);
        expect(mockConnector._getChapters).toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 0 chapters to download across all bookmarks.'));
    });

    test('should log if connector returns no chapters', async () => {
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue([]) 
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga With No Chapters';
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: bookmarkTitle } }
        ];
        
        await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`No chapters returned from source for "${bookmarkTitle}".`));
        expect(Manga).toHaveBeenCalledWith(mockConnector, 'manga1', bookmarkTitle); // Manga instance created
    });
    
    test('should return available chapters, respecting mocked isChapterFileExisting', async () => {
        const rawChapterDataFromConnector = [ // No status property here
            { id: 'ch1', title: 'Chapter 1', language: 'en' }, 
            { id: 'ch2', title: 'Chapter 2', language: 'en' }, 
            { id: 'ch3', title: 'Chapter 3', language: 'en' }  
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(rawChapterDataFromConnector)
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga Test Title';
        bookmarkManager.bookmarks = [{ 
            key: { connector: 'test-connector', manga: 'manga1-id' }, 
            title: { manga: bookmarkTitle } 
        }];

        mockIsChapterFileExisting
            .mockReturnValueOnce(false) // ch1 -> available
            .mockReturnValueOnce(true)  // ch2 -> completed
            .mockReturnValueOnce(false); // ch3 -> available

        // Update mockMangaInstance for this specific test if Manga constructor args are important for the instance
        Manga.mockImplementation(() => ({
            id: 'manga1-id',
            title: bookmarkTitle,
            connector: mockConnector,
            isChapterFileExisting: mockIsChapterFileExisting
        }));


        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();

        expect(Manga).toHaveBeenCalledTimes(1);
        expect(Manga).toHaveBeenCalledWith(mockConnector, 'manga1-id', bookmarkTitle);
        expect(mockIsChapterFileExisting).toHaveBeenCalledTimes(3);

        expect(newChapters.length).toBe(2);
        const chapter1 = newChapters.find(c => c.id === 'ch1');
        const chapter3 = newChapters.find(c => c.id === 'ch3');

        expect(chapter1).toBeDefined();
        expect(chapter3).toBeDefined();
        expect(newChapters.find(c => c.id === 'ch2')).toBeUndefined();

        for (const chapter of newChapters) {
            expect(chapter).toBeInstanceOf(Chapter);
            expect(chapter.manga).toBe(Manga.mock.results[0].value); // Check it's our mocked Manga instance
            if (chapter.id === 'ch1') expect(chapter.status).toBe('available');
            if (chapter.id === 'ch3') expect(chapter.status).toBe('available');
        }
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Processed 3 chapters for "${bookmarkTitle}". Found 2 chapters not yet completed.`));
    });

    test('should return an empty array if all chapters are marked as completed by isChapterFileExisting', async () => {
        const rawChapterDataFromConnector = [
            { id: 'ch1', title: 'Chapter 1' }, { id: 'ch2', title: 'Chapter 2' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(rawChapterDataFromConnector) 
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga All Completed';
        bookmarkManager.bookmarks = [{ 
            key: { connector: 'test-connector', manga: 'mangaAllDone' }, 
            title: { manga: bookmarkTitle } 
        }];
        
        mockIsChapterFileExisting.mockReturnValue(true); // All chapters exist -> completed

        Manga.mockImplementation(() => ({ // Specific mock for this test
            id: 'mangaAllDone', title: bookmarkTitle, connector: mockConnector, isChapterFileExisting: mockIsChapterFileExisting
        }));

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters.length).toBe(0);
        expect(Manga).toHaveBeenCalledTimes(1);
        expect(mockIsChapterFileExisting).toHaveBeenCalledTimes(2);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Processed 2 chapters for "${bookmarkTitle}". Found 0 chapters not yet completed.`));
    });


    test('should handle multiple bookmarks with mixed chapter statuses based on isChapterFileExisting', async () => {
        const connector1ChaptersRaw = [ { id: 'bm1_ch1', title: 'BM1 CH1' }, { id: 'bm1_ch2', title: 'BM1 CH2' }];
        const mockConnector1 = { id: 'conn1', _getChapters: jest.fn().mockResolvedValue(connector1ChaptersRaw) };
        
        const connector2ChaptersRaw = [ { id: 'bm2_chA', title: 'BM2 CHA' }, { id: 'bm2_chB', title: 'BM2 CHB' }];
        const mockConnector2 = { id: 'conn2', _getChapters: jest.fn().mockResolvedValue(connector2ChaptersRaw) };

        Engine.Connectors.push(mockConnector1, mockConnector2);

        bookmarkManager.bookmarks = [
            { key: { connector: 'conn1', manga: 'mangaBM1' }, title: { manga: 'Manga BM1' } },
            { key: { connector: 'conn2', manga: 'mangaBM2' }, title: { manga: 'Manga BM2' } },
        ];
        
        // Setup Manga mock to return different instances or configure the shared one
        const mockMangaInstance1 = { id: 'mangaBM1', title: 'Manga BM1', connector: mockConnector1, isChapterFileExisting: jest.fn() };
        const mockMangaInstance2 = { id: 'mangaBM2', title: 'Manga BM2', connector: mockConnector2, isChapterFileExisting: jest.fn() };

        Manga
            .mockImplementationOnce(() => mockMangaInstance1)
            .mockImplementationOnce(() => mockMangaInstance2);

        // For mangaBM1: ch1 available, ch2 completed
        mockMangaInstance1.isChapterFileExisting.mockReturnValueOnce(false).mockReturnValueOnce(true);
        // For mangaBM2: chA completed, chB available
        mockMangaInstance2.isChapterFileExisting.mockReturnValueOnce(true).mockReturnValueOnce(false);
        
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        
        expect(Manga).toHaveBeenCalledTimes(2);
        expect(Manga).toHaveBeenCalledWith(mockConnector1, 'mangaBM1', 'Manga BM1');
        expect(Manga).toHaveBeenCalledWith(mockConnector2, 'mangaBM2', 'Manga BM2');

        expect(mockMangaInstance1.isChapterFileExisting).toHaveBeenCalledTimes(2);
        expect(mockMangaInstance2.isChapterFileExisting).toHaveBeenCalledTimes(2);
        
        // BM1: 1 new (bm1_ch1)
        // BM2: 1 new (bm2_chB)
        expect(newChapters.length).toBe(1 + 1); 
        
        for (const chapter of newChapters) {
            expect(chapter).toBeInstanceOf(Chapter);
        }

        const newChapterIds = newChapters.map(c => c.id);
        expect(newChapterIds).toContain('bm1_ch1'); // Available
        expect(newChapterIds).not.toContain('bm1_ch2'); // Completed
        expect(newChapterIds).not.toContain('bm2_chA'); // Completed
        expect(newChapterIds).toContain('bm2_chB'); // Available

        const bm1NewChapter = newChapters.find(c => c.id === 'bm1_ch1');
        expect(bm1NewChapter.manga).toBe(mockMangaInstance1);
        expect(bm1NewChapter.status).toBe('available');

        const bm2NewChapter = newChapters.find(c => c.id === 'bm2_chB');
        expect(bm2NewChapter.manga).toBe(mockMangaInstance2);
        expect(bm2NewChapter.status).toBe('available');
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processed 2 chapters for "Manga BM1". Found 1 chapters not yet completed.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processed 2 chapters for "Manga BM2". Found 1 chapters not yet completed.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 chapters to download across all bookmarks.'));
    });
});

// Helper functions are no longer needed as raw data is directly provided in tests.
