#!/usr/bin/env python3
"""Compare archive contents without extraction; compression is platform-specific."""
import hashlib
import io
import stat
import sys
import zipfile


def inventory(source, prefix):
    result = {}
    total = 0
    with zipfile.ZipFile(source) as archive:
        if len(archive.infolist()) > 10000:
            raise ValueError('too many entries')
        for entry in archive.infolist():
            name = entry.filename
            if (not name.startswith(prefix) or '\\' in name or
                    any(part in ('.', '..') for part in name.split('/')) or
                    name in result or entry.flag_bits & 1):
                raise ValueError('invalid entry')
            total += entry.file_size
            if total > 64 * 1024 * 1024 or entry.file_size > 8 * 1024 * 1024:
                raise ValueError('archive too large')
            mode = entry.external_attr >> 16
            data = archive.read(entry)
            result[name] = (entry.is_dir(), stat.S_ISLNK(mode), mode & 0o111,
                            len(data), hashlib.sha256(data).hexdigest())
    if not result:
        raise ValueError('empty archive')
    return result


try:
    expected = sys.stdin.buffer.read(32 * 1024 * 1024 + 1)
    if len(expected) > 32 * 1024 * 1024:
        raise ValueError('expected archive too large')
    if inventory(sys.argv[1], sys.argv[2]) != inventory(io.BytesIO(expected), sys.argv[2]):
        raise ValueError('different source')
except Exception:
    print('Release source archive mismatch.', file=sys.stderr)
    sys.exit(1)
