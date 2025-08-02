from pathlib import Path
import os

import webview


class Api:
    def fullscreen(self):
        webview.windows[0].toggle_fullscreen()


    def save_content(self, content):
        filename = webview.windows[0].create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename='untitled.txt'
        )
        print(f"[DEBUG] Dialog returned: {filename}")

        if not filename:
            print("[ERROR] No filename selected.")
            return

        # Handle both string and list return types
        if isinstance(filename, list):
            filepath = Path(filename[0])
        else:
            filepath = Path(filename)

        # Check for invalid paths
        if str(filepath) == '/' or str(filepath) == '':
            print("[ERROR] Invalid filename selected.")
            return

        try:
            with filepath.open('w') as f:
                f.write(content)
            print(f"[INFO] Successfully saved to {filepath}")
        except Exception as e:
            print(f"[ERROR] Failed to save file: {e}")


    def ls(self):
        return os.listdir('.')