// src/web/__tests__/HakuNeko.test.mjs
import HakuNeko from '../mjs/HakuNeko.mjs';

// Mock all dependencies of HakuNeko.mjs
jest.mock('../mjs/engine/InterProcessCommunication.mjs');
jest.mock('../mjs/engine/Enums.mjs', () => ({
    // Provide any specific enum values if HakuNeko's constructor or _initializeGlobals depends on them.
    // For now, an empty object or a simple structure should suffice.
    EventListener: {} 
}));
jest.mock('../mjs/engine/Connector.mjs'); // Imported by HakuNeko but not directly instantiated.
jest.mock('../mjs/engine/Blacklist.mjs');
// BookmarkImporter is a dependency of BookmarkManager, which is itself mocked.
// So, direct mocking of BookmarkImporter might not be needed here if BookmarkManager mock is complete.
// jest.mock('../mjs/engine/BookmarkImporter.mjs'); 
jest.mock('../mjs/engine/BookmarkManager.mjs');
jest.mock('../mjs/engine/ChaptermarkManager.mjs');
jest.mock('../mjs/engine/Connectors.mjs');
jest.mock('../mjs/engine/DownloadManager.mjs');
jest.mock('../mjs/engine/ComicInfoGenerator.mjs');
jest.mock('../mjs/engine/Request.mjs');
jest.mock('../mjs/engine/Settings.mjs');
jest.mock('../mjs/engine/Storage.mjs');
jest.mock('../mjs/VersionInfo.mjs', () => ({ Version: 'test-version' })); // Mock VersionInfo
jest.mock('../mjs/engine/DiscordPresence.mjs');


describe('HakuNeko.updateBookmarksAndDownloadNewChapters', () => {
    let hakuNekoInstance;
    let mockBookmarkManagerInstance;
    let mockDownloadManagerInstance;
    let consoleLogSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        // HakuNeko constructor creates instances of managers.
        // jest.mock() ensures that the constructor uses the mocked versions.
        hakuNekoInstance = new HakuNeko({}); // Pass mock context for _initializeGlobals

        // Access the mock instances that were created and assigned by the HakuNeko constructor
        mockBookmarkManagerInstance = hakuNekoInstance._bookmarkManager;
        mockDownloadManagerInstance = hakuNekoInstance._downloadManager;

        // Ensure methods are mocks and reset them
        if (!jest.isMockFunction(mockBookmarkManagerInstance.getAllBookmarksWithNewChapters)) {
            mockBookmarkManagerInstance.getAllBookmarksWithNewChapters = jest.fn();
        }
        if (!jest.isMockFunction(mockDownloadManagerInstance.addDownload)) {
            mockDownloadManagerInstance.addDownload = jest.fn();
        }
        
        mockBookmarkManagerInstance.getAllBookmarksWithNewChapters.mockReset();
        mockDownloadManagerInstance.addDownload.mockReset();

        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console spies
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    // --- Scenario 1: No New Chapters Found ---
    test('should not call addDownload if no new chapters are found', async () => {
        mockBookmarkManagerInstance.getAllBookmarksWithNewChapters.mockResolvedValue([]);
        
        await hakuNekoInstance.updateBookmarksAndDownloadNewChapters();
        
        expect(mockBookmarkManagerInstance.getAllBookmarksWithNewChapters).toHaveBeenCalledTimes(1);
        expect(mockDownloadManagerInstance.addDownload).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith('Found 0 new chapters to download.');
        expect(consoleLogSpy).toHaveBeenCalledWith('All bookmarks are up-to-date. No new chapters to download.');
    });

    // --- Scenario 2: Multiple New Chapters Found ---
    test('should call addDownload for each new chapter', async () => {
        const chapters = [
            { id: 'ch1', title: 'Chapter 1', manga: { title: 'Manga 1' } },
            { id: 'ch2', title: 'Chapter 2', manga: { title: 'Manga 2' } }
        ];
        mockBookmarkManagerInstance.getAllBookmarksWithNewChapters.mockResolvedValue(chapters);
        
        await hakuNekoInstance.updateBookmarksAndDownloadNewChapters();
        
        expect(mockBookmarkManagerInstance.getAllBookmarksWithNewChapters).toHaveBeenCalledTimes(1);
        expect(mockDownloadManagerInstance.addDownload).toHaveBeenCalledTimes(2);
        expect(mockDownloadManagerInstance.addDownload).toHaveBeenCalledWith(chapters[0]);
        expect(mockDownloadManagerInstance.addDownload).toHaveBeenCalledWith(chapters[1]);
        expect(consoleLogSpy).toHaveBeenCalledWith('Found 2 new chapters to download.');
        expect(consoleLogSpy).toHaveBeenCalledWith('Queuing for download: Manga 1 - Chapter 1');
        expect(consoleLogSpy).toHaveBeenCalledWith('Queuing for download: Manga 2 - Chapter 2');
        expect(consoleLogSpy).toHaveBeenCalledWith('All new chapters have been queued for download.');
    });
    
    // --- Scenario 3: getAllBookmarksWithNewChapters Throws an Error ---
    test('should log error if getAllBookmarksWithNewChapters fails', async () => {
        const expectedError = new Error('Fetch failed');
        mockBookmarkManagerInstance.getAllBookmarksWithNewChapters.mockRejectedValue(expectedError);
        
        await hakuNekoInstance.updateBookmarksAndDownloadNewChapters();
        
        expect(mockBookmarkManagerInstance.getAllBookmarksWithNewChapters).toHaveBeenCalledTimes(1);
        expect(mockDownloadManagerInstance.addDownload).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error during updateBookmarksAndDownloadNewChapters:', expectedError);
    });
    
    // --- Scenario 4: addDownload Throws an Error ---
    test('should handle error from addDownload and log, then stop processing further chapters from that call', async () => {
        const chapters = [
            { id: 'ch1', title: 'Chapter 1', manga: { title: 'Manga 1' } },
            { id: 'ch2', title: 'Chapter 2', manga: { title: 'Manga 2' } } // This won't be processed
        ];
        const expectedError = new Error('Download failed');
        mockBookmarkManagerInstance.getAllBookmarksWithNewChapters.mockResolvedValue(chapters);
        mockDownloadManagerInstance.addDownload.mockImplementation((chapter) => {
            if (chapter.id === 'ch1') {
                throw expectedError;
            }
        });

        await hakuNekoInstance.updateBookmarksAndDownloadNewChapters();

        expect(mockBookmarkManagerInstance.getAllBookmarksWithNewChapters).toHaveBeenCalledTimes(1);
        expect(mockDownloadManagerInstance.addDownload).toHaveBeenCalledTimes(1); // Called for ch1, then error
        expect(mockDownloadManagerInstance.addDownload).toHaveBeenCalledWith(chapters[0]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error during updateBookmarksAndDownloadNewChapters:', expectedError);
        expect(consoleLogSpy).toHaveBeenCalledWith('Found 2 new chapters to download.');
        expect(consoleLogSpy).toHaveBeenCalledWith('Queuing for download: Manga 1 - Chapter 1');
        // "All new chapters have been queued" should not be logged if an error occurs mid-queue
        expect(consoleLogSpy).not.toHaveBeenCalledWith('All new chapters have been queued for download.'); 
    });

    test('should skip chapter if manga or title details are missing and log warning', async () => {
        const chapters = [
            { id: 'ch1' /* manga missing */, title: 'Chapter 1' },
            { id: 'ch2', manga: { /* title missing */ }, title: 'Chapter 2'},
            { id: 'ch3', manga: { title: 'Manga 3' } /* chapter title missing */},
            { id: 'ch4', manga: { title: 'Manga 4' }, title: 'Chapter 4' } // Valid chapter
        ];
        mockBookmarkManagerInstance.getAllBookmarksWithNewChapters.mockResolvedValue(chapters);
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await hakuNekoInstance.updateBookmarksAndDownloadNewChapters();

        expect(mockDownloadManagerInstance.addDownload).toHaveBeenCalledTimes(1);
        expect(mockDownloadManagerInstance.addDownload).toHaveBeenCalledWith(chapters[3]); // Only ch4 is valid
        expect(consoleWarnSpy).toHaveBeenCalledWith('Skipping invalid or incomplete chapter object:', chapters[0]);
        expect(consoleWarnSpy).toHaveBeenCalledWith('Skipping invalid or incomplete chapter object:', chapters[1]);
        expect(consoleWarnSpy).toHaveBeenCalledWith('Skipping invalid or incomplete chapter object:', chapters[2]);
        expect(consoleLogSpy).toHaveBeenCalledWith('Found 4 new chapters to download.');
        expect(consoleLogSpy).toHaveBeenCalledWith('Queuing for download: Manga 4 - Chapter 4');
        expect(consoleLogSpy).toHaveBeenCalledWith('All new chapters have been queued for download.'); // Since one was queued

        consoleWarnSpy.mockRestore();
    });
});
