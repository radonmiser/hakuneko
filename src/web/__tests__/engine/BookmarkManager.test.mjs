// src/web/__tests__/engine/BookmarkManager.test.mjs
import BookmarkManager from '../../mjs/engine/BookmarkManager.mjs';

// Mock global Engine and its dependencies
// These mocks need to be defined before BookmarkManager is imported if it uses them at module load time,
// but since we are importing it directly, we can set up global.Engine before each test instantiation.

global.Engine = {
    Connectors: [],
    ChaptermarkManager: {
        getChaptermark: jest.fn(),
        // Mock _getChapterIdentifier as it's used by the refactored method within findIndex
        _getChapterIdentifier: jest.fn(chapter => chapter.id.hash || chapter.id),
    },
    Storage: {
        saveBookmarks: jest.fn().mockResolvedValue(undefined), // Used by saveProfile
        loadBookmarks: jest.fn().mockResolvedValue([]),      // Used by loadProfile
    },
    Settings: { // Passed to constructor
        addEventListener: jest.fn(),
    }
};

describe('BookmarkManager.getAllBookmarksWithNewChapters', () => {
    let bookmarkManager;
    let mockSettings;
    // let mockBookmarkImporter; // Not strictly needed if its methods aren't called

    beforeEach(() => {
        // Reset mocks for each test
        jest.clearAllMocks();
        
        // Reset Engine properties that are modified per test
        Engine.Connectors = [];
        Engine.ChaptermarkManager.getChaptermark.mockReset();
        // Re-assign _getChapterIdentifier if it's not meant to be cleared or re-mocked in a specific way.
        // For this case, having it defined once globally is fine as its behavior is static.
        // Engine.ChaptermarkManager._getChapterIdentifier.mockImplementation(chapter => chapter.id.hash || chapter.id);


        // Mock constructor dependencies
        mockSettings = { addEventListener: jest.fn() };
        // mockBookmarkImporter = {}; // Simple object if no methods are called

        bookmarkManager = new BookmarkManager(mockSettings, null /* mockBookmarkImporter */);
        bookmarkManager.bookmarks = []; // Start with no bookmarks for each test
    });

    // --- Test Scenario 1: No Bookmarks ---
    test('should return an empty array if no bookmarks are present', async () => {
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters).toEqual([]);
    });

    // --- Test Scenario 2: Bookmark with a Connector Not Found ---
    test('should skip a bookmark if its connector is not found and process others', async () => {
        bookmarkManager.bookmarks = [
            { key: { connector: 'non-existent-connector', manga: 'manga1' }, title: { manga: 'Manga 1 (No Connector)' } }
        ];
        // No connectors in Engine.Connectors

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters).toEqual([]);
        // Optionally, check console.warn if spied upon, but not essential for this test
    });

    // --- Test Scenario 3: Connector Fails to Get Chapters ---
    test('should skip a bookmark if its connector fails to get chapters', async () => {
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockRejectedValue(new Error('Failed to fetch chapters')) 
        };
        Engine.Connectors.push(mockConnector);
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: 'Manga 1 (Failing Connector)' } }
        ];

        Engine.ChaptermarkManager.getChaptermark.mockReturnValue(undefined); // Assume no chaptermark

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters).toEqual([]);
        expect(mockConnector._getChapters).toHaveBeenCalled();
        // Optionally, check console.error
    });

    // --- Test Scenario 4: No Chaptermark Exists for a Bookmark ---
    test('should return all chapters as new if no chaptermark exists', async () => {
        const chaptersFromConnector = [
            { id: 'ch1', title: 'Chapter 1' }, { id: 'ch2', title: 'Chapter 2' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(chaptersFromConnector) 
        };
        Engine.Connectors.push(mockConnector);
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: 'Manga 1' } }
        ];

        Engine.ChaptermarkManager.getChaptermark.mockReturnValue(undefined);

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters.length).toBe(2);
        expect(newChapters.map(c => c.id)).toEqual(['ch1', 'ch2']);
        expect(Engine.ChaptermarkManager.getChaptermark).toHaveBeenCalledWith({ id: 'manga1', connector: { id: 'test-connector' } });
        // Check if chapter.manga was assigned
        expect(newChapters[0].manga).toEqual(expect.objectContaining({ id: 'manga1', title: 'Manga 1' }));
    });

    // --- Test Scenario 5: Chaptermark Exists, and is the Latest Chapter ---
    test('should return no new chapters if chaptermark is for the latest chapter', async () => {
        const chaptersFromConnector = [
            { id: 'chA', title: 'Chapter A' }, { id: 'chB', title: 'Chapter B' }, { id: 'chC', title: 'Chapter C' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(chaptersFromConnector) 
        };
        Engine.Connectors.push(mockConnector);
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: 'Manga 1' } }
        ];

        Engine.ChaptermarkManager.getChaptermark.mockReturnValue({ 
            chapterID: 'chC', // ID of the marked chapter
            mangaID: 'manga1', 
            connectorID: 'test-connector',
            chapterTitle: 'Chapter C'
        });
         // Ensure _getChapterIdentifier mock is effective for comparison
        Engine.ChaptermarkManager._getChapterIdentifier.mockImplementation(chapter => chapter.id);


        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters.length).toBe(0);
        expect(Engine.ChaptermarkManager.getChaptermark).toHaveBeenCalledWith({ id: 'manga1', connector: { id: 'test-connector' } });
    });

    // --- Test Scenario 6: Chaptermark Exists, New Chapters Available ---
    test('should return new chapters after the marked one', async () => {
        const chaptersFromConnector = [
            { id: 'chA', title: 'Chapter A' }, { id: 'chB', title: 'Chapter B' }, 
            { id: 'chC', title: 'Chapter C' }, // Marked chapter
            { id: 'chD', title: 'Chapter D' }, { id: 'chE', title: 'Chapter E' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(chaptersFromConnector) 
        };
        Engine.Connectors.push(mockConnector);
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: 'Manga 1' } }
        ];

        Engine.ChaptermarkManager.getChaptermark.mockReturnValue({ 
            chapterID: 'chC', 
            mangaID: 'manga1', 
            connectorID: 'test-connector',
            chapterTitle: 'Chapter C' 
        });
        Engine.ChaptermarkManager._getChapterIdentifier.mockImplementation(chapter => chapter.id);

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters.length).toBe(2);
        expect(newChapters.map(c => c.id)).toEqual(['chD', 'chE']);
        expect(Engine.ChaptermarkManager.getChaptermark).toHaveBeenCalledWith({ id: 'manga1', connector: { id: 'test-connector' } });
        expect(newChapters[0].manga).toEqual(expect.objectContaining({ id: 'manga1', title: 'Manga 1' }));
    });

    // --- Test Scenario 7: Chaptermark Exists, but Marked Chapter Not Found in Source List ---
    test('should return all chapters as new if marked chapter is not in source list', async () => {
        const chaptersFromConnector = [
            { id: 'chX', title: 'Chapter X' }, { id: 'chY', title: 'Chapter Y' }, { id: 'chZ', title: 'Chapter Z' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(chaptersFromConnector) 
        };
        Engine.Connectors.push(mockConnector);
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: 'Manga 1' } }
        ];

        Engine.ChaptermarkManager.getChaptermark.mockReturnValue({ 
            chapterID: 'nonExistentCh', // This ID is not in chaptersFromConnector
            mangaID: 'manga1', 
            connectorID: 'test-connector',
            chapterTitle: 'Non Existent Chapter'
        });
        Engine.ChaptermarkManager._getChapterIdentifier.mockImplementation(chapter => chapter.id);

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters.length).toBe(3);
        expect(newChapters.map(c => c.id)).toEqual(['chX', 'chY', 'chZ']);
    });

    // --- Test Scenario 8: Multiple Bookmarks with Mixed Scenarios ---
    test('should handle multiple bookmarks with mixed scenarios correctly', async () => {
        // Bookmark 1: No chaptermark, all new
        const connector1Chapters = [{ id: 'bm1_ch1', title: 'BM1 CH1' }, { id: 'bm1_ch2', title: 'BM1 CH2' }];
        const mockConnector1 = { id: 'conn1', _getChapters: jest.fn().mockResolvedValue(connector1Chapters) };
        
        // Bookmark 2: Chaptermark is latest
        const connector2Chapters = [{ id: 'bm2_chA', title: 'BM2 CHA' }, { id: 'bm2_chB', title: 'BM2 CHB' }];
        const mockConnector2 = { id: 'conn2', _getChapters: jest.fn().mockResolvedValue(connector2Chapters) };

        // Bookmark 3: New chapters available
        const connector3Chapters = [{ id: 'bm3_chX', title: 'BM3 CHX' }, { id: 'bm3_chY', title: 'BM3 CHY' }, { id: 'bm3_chZ', title: 'BM3 CHZ' }];
        const mockConnector3 = { id: 'conn3', _getChapters: jest.fn().mockResolvedValue(connector3Chapters) };

        Engine.Connectors.push(mockConnector1, mockConnector2, mockConnector3);

        bookmarkManager.bookmarks = [
            { key: { connector: 'conn1', manga: 'mangaBM1' }, title: { manga: 'Manga BM1' } },
            { key: { connector: 'conn2', manga: 'mangaBM2' }, title: { manga: 'Manga BM2' } },
            { key: { connector: 'conn3', manga: 'mangaBM3' }, title: { manga: 'Manga BM3' } },
        ];

        // Mock getChaptermark behavior for each
        Engine.ChaptermarkManager.getChaptermark
            .mockReturnValueOnce(undefined) // For mangaBM1
            .mockReturnValueOnce({ chapterID: 'bm2_chB', mangaID: 'mangaBM2', connectorID: 'conn2', chapterTitle: 'BM2 CHB' }) // For mangaBM2
            .mockReturnValueOnce({ chapterID: 'bm3_chX', mangaID: 'mangaBM3', connectorID: 'conn3', chapterTitle: 'BM3 CHX' }); // For mangaBM3
        
        Engine.ChaptermarkManager._getChapterIdentifier.mockImplementation(chapter => chapter.id);

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        
        expect(newChapters.length).toBe(2 + 0 + 2); // BM1: 2 new, BM2: 0 new, BM3: 2 new
        
        const newChapterIds = newChapters.map(c => c.id);
        expect(newChapterIds).toContain('bm1_ch1');
        expect(newChapterIds).toContain('bm1_ch2');
        expect(newChapterIds).not.toContain('bm2_chA'); // Should not be new
        expect(newChapterIds).not.toContain('bm2_chB'); // Should not be new
        expect(newChapterIds).toContain('bm3_chY');
        expect(newChapterIds).toContain('bm3_chZ');

        expect(Engine.ChaptermarkManager.getChaptermark).toHaveBeenCalledTimes(3);
        expect(Engine.ChaptermarkManager.getChaptermark).toHaveBeenCalledWith({ id: 'mangaBM1', connector: { id: 'conn1' } });
        expect(Engine.ChaptermarkManager.getChaptermark).toHaveBeenCalledWith({ id: 'mangaBM2', connector: { id: 'conn2' } });
        expect(Engine.ChaptermarkManager.getChaptermark).toHaveBeenCalledWith({ id: 'mangaBM3', connector: { id: 'conn3' } });

        // Verify manga property assignment
        const bm1NewChapters = newChapters.filter(c => c.id.startsWith('bm1'));
        expect(bm1NewChapters[0].manga.id).toBe('mangaBM1');
        const bm3NewChapters = newChapters.filter(c => c.id.startsWith('bm3'));
        expect(bm3NewChapters[0].manga.id).toBe('mangaBM3');
    });
});

// Helper to create a simple bookmark
const createBookmark = (connectorId, mangaId, mangaTitle) => ({
    key: { connector: connectorId, manga: mangaId },
    title: { manga: mangaTitle }
});

// Helper to create a simple chapter
const createChapter = (id, title) => ({
    id: id,
    title: title
    // manga property will be assigned by the method under test
});
