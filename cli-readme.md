# CLI Commands for HakuNeko

This document provides details on command-line interface (CLI) commands available in HakuNeko.

## Update Bookmarks and Download New Chapters

This command allows you to scan all your bookmarked manga, identify any new chapters that have been released since your last check (based on your chaptermarks), and automatically download them.

**Command:**

`--update-bookmarks-and-download-new-chapters`

**Alias:**

`-b`

**Purpose:**

*   Iterates through all manga you have bookmarked.
*   For each bookmarked manga, it checks the source website for the latest list of chapters.
*   Compares this list against your last read/downloaded chapter for that manga (as per your chaptermarks in HakuNeko).
*   Downloads all chapters identified as new.

**How to Use:**

1.  **Build the Application:**
    Before using any CLI commands, ensure you have built the HakuNeko desktop application from the source code. Refer to the main `README.md` or development documentation for instructions on how to build the project (this usually involves steps like `npm install` and then a build script like `npm run build` or `npm run make`).

2.  **Locate the Executable:**
    After a successful build, you will find an executable file for your operating system (e.g., in a `dist`, `out`, or release-specific folder).

3.  **Run from Command Line:**
    Open your terminal (Command Prompt, PowerShell, Terminal, etc.) and navigate to the directory containing the HakuNeko executable, or run it using its full path.

    **Examples:**

    *   If your executable is named `HakuNeko` (or `HakuNeko.exe` on Windows):

        ```bash
        # On Windows
        HakuNeko.exe --update-bookmarks-and-download-new-chapters
        # or using the alias
        HakuNeko.exe -b

        # On macOS or Linux
        ./HakuNeko --update-bookmarks-and-download-new-chapters
        # or using the alias
        ./HakuNeko -b
        ```

    *   Replace `HakuNeko` or `HakuNeko.exe` with the actual name of your built executable if it differs.

    When you run this command, the application will start, perform the update and download tasks in the background, and provide output to the console. Depending on the application's behavior for CLI tasks, it might exit after completion or remain running. The console logs (and any errors) will indicate the progress.
