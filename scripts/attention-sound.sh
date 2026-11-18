#!/bin/sh
# User-requested local sound before a question/wait and when a task finishes.
# Audio respects the Mac's output device and volume; never change those settings.
if [ "$(uname -s)" = Darwin ] && [ -f /System/Library/Sounds/Glass.aiff ]; then
  /usr/bin/afplay /System/Library/Sounds/Glass.aiff >/dev/null 2>&1 || true
fi
