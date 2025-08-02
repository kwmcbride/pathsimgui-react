from pathlib import Path
import os
import threading
import webview

from time import time

from python.api import Api


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
        try:
            webview.windows[0].evaluate_js('window.pywebview.state && window.pywebview.state.set_ticker("%d")' % time())
        except Exception as e:
            print(f"Ticker update failed: {e}")
        
        try:
            webview.windows[0].evaluate_js('window.pywebview.state && window.pywebview.state.set_name("PathSim GUI with React")')
        except Exception as e:
            print(f"Name update failed: {e}")


if __name__ == '__main__':
    window = webview.create_window('PathSim GUI with React', entry, js_api=Api())
    webview.start(update_ticker, debug=True)

