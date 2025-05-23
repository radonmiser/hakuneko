// src/web/__tests__/engine/BookmarkManager.test.mjs
import BookmarkManager from '../../mjs/engine/BookmarkManager.mjs';
import Chapter from '../../mjs/engine/Chapter.mjs';

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

describe('BookmarkManager.getAllBookmarksWithNewChapters (Simplified Logic)', () => {
    let bookmarkManager;
    let mockSettings;
    let consoleLogSpy;
    let consoleWarnSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        Engine.Connectors = [];
        // No ChaptermarkManager mocks to reset

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
            _getChapters: jest.fn().mockResolvedValue([]) // Connector returns empty array
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga With No Chapters';
        bookmarkManager.bookmarks = [
            { key: { connector: 'test-connector', manga: 'manga1' }, title: { manga: bookmarkTitle } }
        ];
        
        await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`No chapters returned from source for "${bookmarkTitle}".`));
    });
    
    test('should return only non-completed chapters, instantiating them correctly', async () => {
        const rawChapterDataWithStatus = [
            { id: 'ch1', title: 'Chapter 1', language: 'en', status: 'available' },
            { id: 'ch2', title: 'Chapter 2', language: 'en', status: 'completed' },
            { id: 'ch3', title: 'Chapter 3', language: 'en', status: 'available' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(rawChapterDataWithStatus) 
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga 1 Title';
        bookmarkManager.bookmarks = [{ 
            key: { connector: 'test-connector', manga: 'manga1' }, 
            title: { manga: bookmarkTitle } 
        }];

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();

        expect(newChapters.length).toBe(2);
        expect(newChapters.find(c => c.id === 'ch1')).toBeDefined();
        expect(newChapters.find(c => c.id === 'ch3')).toBeDefined();
        expect(newChapters.find(c => c.id === 'ch2')).toBeUndefined();

        for (const chapter of newChapters) {
            expect(chapter).toBeInstanceOf(Chapter);
            expect(chapter.manga.connector.id).toBe('test-connector');
            if(chapter.id === 'ch1') expect(chapter.status).toBe('available');
            if(chapter.id === 'ch3') expect(chapter.status).toBe('available');
        }
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Processed 3 chapters for "${bookmarkTitle}". Found 2 chapters not yet completed.`));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 chapters to download across all bookmarks.'));
    });

    test('should return an empty array if all chapters are already completed', async () => {
        const rawChapterDataWithStatus = [
            { id: 'ch1', title: 'Chapter 1', status: 'completed' },
            { id: 'ch2', title: 'Chapter 2', status: 'completed' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(rawChapterDataWithStatus) 
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga All Completed';
        bookmarkManager.bookmarks = [{ 
            key: { connector: 'test-connector', manga: 'mangaAllDone' }, 
            title: { manga: bookmarkTitle } 
        }];
        
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters.length).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Processed 2 chapters for "${bookmarkTitle}". Found 0 chapters not yet completed.`));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 0 chapters to download across all bookmarks.'));
    });

    test('should return all chapters if all are available (none completed)', async () => {
        const rawChapterDataWithStatus = [
            { id: 'ch1', title: 'Chapter 1', status: 'available' },
            { id: 'ch2', title: 'Chapter 2', status: 'available' }
        ];
        const mockConnector = { 
            id: 'test-connector', 
            _getChapters: jest.fn().mockResolvedValue(rawChapterDataWithStatus) 
        };
        Engine.Connectors.push(mockConnector);
        const bookmarkTitle = 'Manga All Available';
        bookmarkManager.bookmarks = [{ 
            key: { connector: 'test-connector', manga: 'mangaAllNew' }, 
            title: { manga: bookmarkTitle } 
        }];

        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        expect(newChapters.length).toBe(2);
        expect(newChapters.map(c => c.id)).toEqual(['ch1', 'ch2']);
        for (const chapter of newChapters) {
            expect(chapter).toBeInstanceOf(Chapter);
            expect(chapter.status).toBe('available');
        }
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Processed 2 chapters for "${bookmarkTitle}". Found 2 chapters not yet completed.`));
    });

    test('should handle multiple bookmarks with mixed chapter statuses correctly', async () => {
        const connector1ChaptersRaw = [
            { id: 'bm1_ch1', title: 'BM1 CH1', status: 'available' },
            { id: 'bm1_ch2', title: 'BM1 CH2', status: 'completed' }
        ];
        const mockConnector1 = { id: 'conn1', _getChapters: jest.fn().mockResolvedValue(connector1ChaptersRaw) };
        
        const connector2ChaptersRaw = [
            { id: 'bm2_chA', title: 'BM2 CHA', status: 'completed' },
            { id: 'bm2_chB', title: 'BM2 CHB', status: 'completed' }
        ];
        const mockConnector2 = { id: 'conn2', _getChapters: jest.fn().mockResolvedValue(connector2ChaptersRaw) };

        const connector3ChaptersRaw = [
            { id: 'bm3_chX', title: 'BM3 CHX', status: 'available' },
            { id: 'bm3_chY', title: 'BM3 CHY', status: 'available' }
        ];
        const mockConnector3 = { id: 'conn3', _getChapters: jest.fn().mockResolvedValue(connector3ChaptersRaw) };

        Engine.Connectors.push(mockConnector1, mockConnector2, mockConnector3);

        bookmarkManager.bookmarks = [
            { key: { connector: 'conn1', manga: 'mangaBM1' }, title: { manga: 'Manga BM1' } },
            { key: { connector: 'conn2', manga: 'mangaBM2' }, title: { manga: 'Manga BM2' } },
            { key: { connector: 'conn3', manga: 'mangaBM3' }, title: { manga: 'Manga BM3' } },
        ];
        
        const newChapters = await bookmarkManager.getAllBookmarksWithNewChapters();
        
        // BM1: 1 new (bm1_ch1)
        // BM2: 0 new
        // BM3: 2 new (bm3_chX, bm3_chY)
        expect(newChapters.length).toBe(1 + 0 + 2); 
        
        for (const chapter of newChapters) {
            expect(chapter).toBeInstanceOf(Chapter);
        }

        const newChapterIds = newChapters.map(c => c.id);
        expect(newChapterIds).toContain('bm1_ch1');
        expect(newChapterIds).not.toContain('bm1_ch2');
        expect(newChapterIds).not.toContain('bm2_chA');
        expect(newChapterIds).not.toContain('bm2_chB');
        expect(newChapterIds).toContain('bm3_chX');
        expect(newChapterIds).toContain('bm3_chY');

        const bm1NewChapter = newChapters.find(c => c.id === 'bm1_ch1');
        expect(bm1NewChapter.manga.connector).toBe(mockConnector1);
        const bm3NewChapterX = newChapters.find(c => c.id === 'bm3_chX');
        expect(bm3NewChapterX.manga.connector).toBe(mockConnector3);
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processed 2 chapters for "Manga BM1". Found 1 chapters not yet completed.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processed 2 chapters for "Manga BM2". Found 0 chapters not yet completed.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Processed 2 chapters for "Manga BM3". Found 2 chapters not yet completed.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 3 chapters to download across all bookmarks.'));
    });
});

// Helper functions are no longer needed as raw data is directly provided in tests.
