from pathlib import Path
import os
import threading
import webview

from time import time


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


def get_entrypoint():
    def exists(path):
        return os.path.exists(os.path.join(os.path.dirname(__file__), path))

    if exists('../gui/index.html'): # unfrozen development
        return '../gui/index.html'

    if exists('../Resources/gui/index.html'): # frozen py2app
        return '../Resources/gui/index.html'

    if exists('./gui/index.html'):
        return './gui/index.html'

    raise Exception('No index.html found')


def set_interval(interval):
    def decorator(function):
        def wrapper(*args, **kwargs):
            stopped = threading.Event()

            def loop(): # executed in another thread
                while not stopped.wait(interval): # until stopped
                    function(*args, **kwargs)

            t = threading.Thread(target=loop)
            t.daemon = True # stop if the program exits
            t.start()
            return stopped
        return wrapper
    return decorator



entry = get_entrypoint()

@set_interval(1)
def update_ticker():
    if len(webview.windows) > 0:
        webview.windows[0].evaluate_js('window.pywebview.state && window.pywebview.state.set_ticker("%d")' % time())


if __name__ == '__main__':
    window = webview.create_window('pywebview-react boilerplate', entry, js_api=Api())
    webview.start(update_ticker, debug=True)
