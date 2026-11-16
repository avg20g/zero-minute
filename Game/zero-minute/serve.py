#!/usr/bin/env python3
# Development server for Zero Minute. Same as `python3 -m http.server`, except it tells the browser never to keep
# a copy of any file, so a plain refresh always shows the newest version of the game.
#   python3 serve.py [port]        then open http://localhost:8010/play.html
# The port is 8010, not the 8000 used before batch 10, on purpose: browsers that had already stored old copies of the
# files under :8000 kept showing them. A new address has nothing stored, and with no-store nothing ever will be.
import functools, http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'   # keep connections open, so one page load reuses a handful of them

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
root = os.path.dirname(os.path.abspath(__file__))
class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128   # the game is ~35 files requested at once; the default queue of 5 drops some of them
    daemon_threads = True

Server(('127.0.0.1', port), functools.partial(NoCache, directory=root)).serve_forever()
