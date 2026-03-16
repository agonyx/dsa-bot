import logging
import shutil
import sys
import time


class LiveStats:
    active_instance = None

    def __init__(self, prefix: str, enabled: bool = True, refresh_interval: float = 0.1):
        self.prefix = prefix
        self.enabled = enabled and sys.stdout.isatty()
        self.refresh_interval = refresh_interval
        self.last_render = 0.0
        self.last_line_length = 0

    def clear_line(self):
        if not self.enabled or self.last_line_length == 0:
            return
        sys.stdout.write("\r" + (" " * self.last_line_length) + "\r")
        sys.stdout.flush()

    def render(self, text: str, *, force: bool = False):
        if not self.enabled:
            return

        now = time.monotonic()
        if not force and now - self.last_render < self.refresh_interval:
            return

        width = shutil.get_terminal_size((120, 20)).columns
        line = f"{self.prefix} {text}".strip()
        if len(line) > width - 1:
            line = line[: max(0, width - 4)] + "..."
        padded = line.ljust(self.last_line_length)
        LiveStats.active_instance = self
        sys.stdout.write("\r" + padded)
        sys.stdout.flush()
        self.last_line_length = len(padded)
        self.last_render = now

    def finish(self, text: str = ""):
        if not self.enabled:
            return
        if text:
            self.render(text, force=True)
        sys.stdout.write("\n")
        sys.stdout.flush()
        self.last_line_length = 0
        if LiveStats.active_instance is self:
            LiveStats.active_instance = None


class ProgressAwareStreamHandler(logging.StreamHandler):
    def emit(self, record):
        active = LiveStats.active_instance
        if active is not None:
            active.clear_line()
        super().emit(record)
