const path = require('path');
const { ConsoleLogger } = require('@logtrine/logtrine');
const Configuration = require('./Configuration');
const ConfigurationLinux = require('./ConfigurationLinux');
const ConfigurationDarwin = require('./ConfigurationDarwin');
const ConfigurationWindows = require('./ConfigurationWindows');
const CommandlineArgumentExtractor = require('./CommandlineArgumentExtractor');
const UpdateServerManager = require('./UpdateServerManager');
const CacheDirectoryManager = require('./CacheDirectoryManager');
const Updater = require('./Updater');
const ElectronBootstrap = require('./ElectronBootstrap');

const loadingPage = `
<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -100%); font-family: monospace; font-size: 1.25em; font-weight: bold; text-align: center; opacity: 0.33;">
    <div style="margin-bottom: 1.5em;">Checking for Update</div>
    <progress></progress>
</div>
`;

module.exports = class App {

    constructor(logger) {
        this._logger = logger || new ConsoleLogger(ConsoleLogger.LEVEL.Warn);
        this._extractor = new CommandlineArgumentExtractor(process.argv);
        this._options = this._extractor.options; // Make options available
        this._configuration = this._getConfiguration(this._options);
        let serverManager = new UpdateServerManager(this._configuration.applicationUpdateURL, this._logger);
        let cacheManager = new CacheDirectoryManager(this._configuration.applicationCacheDirectory, this._logger);
        this._updater = new Updater(serverManager, cacheManager, this._logger);
        this._electron = new ElectronBootstrap(this._configuration, this._logger);
    }

    _getConfiguration(options) {
        if(Configuration.isPortableMode) {
            return new Configuration(options);
        }
        if(process.platform === 'linux') {
            return new ConfigurationLinux(options);
        }
        if(process.platform === 'darwin') {
            return new ConfigurationDarwin(options);
        }
        if(process.platform === 'win32') {
            return new ConfigurationWindows(options);
        }
    }

    printInfo() {
        let separator = '--------------';
        console.log('');
        console.log(separator);
        console.log('Framework Info');
        console.log(separator );
        console.log('Electron :', process.versions.electron);
        console.log('Chrome   :', process.versions.chrome);
        console.log('Node     :', process.versions.node);
        console.log('');
    }

    async run() {
        try {
            // If no specific action flags are provided, print info and exit
            if (this._options.applicationStartupURL === undefined &&
                this._options.applicationCacheDirectory === undefined &&
                this._options.applicationUserDataDirectory === undefined &&
                this._options.applicationUpdateURL === undefined &&
                !this._options.updateBookmarksAndDownloadNewChapters) {
                this._extractor.printInfo();
                this.printInfo();
                this._configuration.printInfo();
                return process.exit(0);
            }

            if (this._options.updateBookmarksAndDownloadNewChapters) {
                console.log('CLI command --update-bookmarks-and-download-new-chapters detected. Triggering update and download process...');
                // TODO: Implement IPC call to HakuNeko engine to trigger updateBookmarksAndDownloadNewChapters()
                // Assuming for now that if this CLI flag is present, we perform the action and exit.
                // If other flags are present, their behavior might also need to be considered
                // for whether the app should exit or continue to full UI launch.
                // For now, let's exit as it's a specific CLI task.
                return process.exit(0); // Or handle as appropriate for the app's lifecycle
            }

            // If other flags were set that imply launching the UI, or if no flags were set (which now defaults to launching UI after previous checks)
            this._extractor.printInfo();
            this.printInfo();
            this._configuration.printInfo();
            // add HakuNeko's application directory to the environment variable path (make ffmpeg available on windows)
            process.env.PATH = path.dirname(process.execPath) + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;
            // add HakuNeko's portable mode as environment variable to be easily available in render process
            if(Configuration.isPortableMode) {
                process.env.HAKUNEKO_PORTABLE = 'TRUE';
            } else {
                delete process.env.HAKUNEKO_PORTABLE;
            }
            await this._electron.launch();
            await this._electron.loadHTML(loadingPage);
            await this._updater.updateCache(this._configuration.publicKey);
            this._electron.loadURL(this._configuration.applicationStartupURL);
        } catch(error) {
            this._logger.error('Failed to start application!', error);
        }
    }
};