#!/usr/bin/env python3
"""Repo-local evidence gate. Python 3.9+, Git, no dependencies."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], stderr=subprocess.DEVNULL, timeout=30)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def local(root, name):
    p = Path(name)
    if p.is_absolute() or '..' in p.parts or not p.parts or p == Path('.'):
        raise ValueError('paths must be relative, nonempty, and contain no ..')
    resolved = (root / p).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError('path escapes repository')
    return resolved


def changed(root, base, card):
    tracked = git(root, 'diff', '--no-renames', '--name-only', '-z', base)
    others = git(root, 'ls-files', '--others', '--exclude-standard', '-z')
    return sorted(set(os.fsdecode(p) for p in (tracked + others).split(b'\0') if p) - {card})


def snapshot(root, base, card):
    # Hash tracked and untracked contents; never persist command output or file contents.
    h = hashlib.sha256(git(root, 'rev-parse', 'HEAD'))
    for name in changed(root, base, card):
        h.update(os.fsencode(name) + b'\0')
        p = root / name
        if p.is_symlink():
            h.update(os.fsencode(os.readlink(p)))
        elif p.is_file():
            with p.open('rb') as f:
                for block in iter(lambda: f.read(65536), b''):
                    h.update(block)
        else:
            h.update(b'<deleted>')
    # Include staged content, file modes, deletions and the pinned task even if unchanged.
    h.update(git(root, 'diff', '--binary', base, '--', '.', ':(exclude)' + card))
    h.update(git(root, 'diff', '--cached', '--binary', base, '--', '.', ':(exclude)' + card))
    return h.hexdigest()


def save(path, data):
    if path.is_symlink():
        raise ValueError('card must not be a symlink')
    fd, name = tempfile.mkstemp(prefix='.finishline-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(data, f, indent=2)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def validate(root, data):
    if data.get('version') != 1:
        raise ValueError('unsupported card version')
    local(root, data['task'])
    if not re.fullmatch(r'[0-9a-f]{64}', data['task_sha256']):
        raise ValueError('invalid task hash')
    if not re.fullmatch(r'[0-9a-f]{40,64}', data['base']):
        raise ValueError('invalid base commit')
    if (not isinstance(data['allow'], list) or not isinstance(data['checks'], list)
            or not 1 <= len(data['allow']) <= 100 or not 1 <= len(data['checks']) <= 20):
        raise ValueError('require 1..100 scope paths and 1..20 acceptance checks')
    for path in data['allow']:
        local(root, path)
    if not isinstance(data['timeout'], int) or not 1 <= data['timeout'] <= 300:
        raise ValueError('timeout must be 1..300 seconds')
    for argv in data['checks']:
        if not isinstance(argv, list) or not argv or not all(isinstance(s, str) and s for s in argv):
            raise ValueError('each check must be a nonempty JSON argv array')


def run_check(root, argv, timeout):
    # No shell. Checks are still arbitrary local code, explicitly opted into by the user.
    with subprocess.Popen(argv, cwd=root, stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, start_new_session=True) as p:
        try:
            code = p.wait(timeout=timeout)
            return {'argv': argv, 'exit': code}
        except subprocess.TimeoutExpired:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            p.wait()
            return {'argv': argv, 'exit': None, 'error': 'timeout'}


def evaluate(root, data, card, execute):
    validate(root, data)
    task = local(root, data['task'])
    content = task.read_bytes()
    items = [(i, m.group(1).lower() == 'x') for i, line in enumerate(content.decode('utf-8').splitlines(), 1)
             if (m := re.match(r'^\s*[-*] \[([ xX])\]\s+\S', line))]
    paths = changed(root, data['base'], card)
    outside = [p for p in paths if not any(p == a.rstrip('/') or p.startswith(a.rstrip('/') + '/') for a in data['allow'])]
    report = {'at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'head': git(root, 'rev-parse', 'HEAD').decode().strip(),
              'task_sha256': digest(content), 'status': 'WAIT', 'reasons': [],
              'evidence': [f"{data['task']}#L{i}" for i, _ in items],
              'changed': paths, 'checks': []}
    if digest(content) != data['task_sha256']:
        # Checkbox progress is permitted; all other task edits require a new card.
        normalized = re.sub(rb'(?m)^(\s*[-*] \[)[ xX](\]\s+)', rb'\1 \2', content)
        if digest(normalized) != data['task_definition_sha256']:
            report['reasons'].append('task definition changed; create a new reviewed card')
    if outside:
        report['reasons'].append('outside scope: ' + ', '.join(outside))
    if report['reasons']:
        report['status'] = 'ANDON'
        return report
    if not items:
        report['reasons'].append('task has no checklist items')
    elif not all(done for _, done in items):
        report['reasons'].append('task checklist is incomplete')
    if execute:
        before = snapshot(root, data['base'], card)
        for argv in data['checks']:
            try:
                result = run_check(root, argv, data['timeout'])
            except OSError:
                result = {'argv': argv, 'exit': None, 'error': 'could not start executable'}
            report['checks'].append(result)
            if result['exit'] != 0:
                report['status'] = 'ANDON'
                report['reasons'].append('acceptance check failed')
                break
        if snapshot(root, data['base'], card) != before or task.read_bytes() != content:
            report['status'] = 'ANDON'
            report['reasons'].append('acceptance checks changed repository evidence; rerun after review')
    else:
        report['reasons'].append('checks not executed; pass --run-checks after reviewing argv')
    if not report['reasons']:
        report['status'] = 'DONE'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--card', default='finishline.json')
    sub = parser.add_subparsers(dest='command', required=True)
    init = sub.add_parser('init')
    init.add_argument('--task', default='task.md')
    init.add_argument('--allow', action='append', required=True)
    init.add_argument('--check', action='append', required=True, help='JSON argv array; never shell text')
    init.add_argument('--timeout', type=int, default=30)
    check = sub.add_parser('check')
    check.add_argument('--run-checks', action='store_true')
    args = parser.parse_args()
    try:
        root = Path(git(Path.cwd(), 'rev-parse', '--show-toplevel').decode().strip()).resolve()
        path = local(root, args.card)
        if path.is_symlink():
            raise ValueError('card must not be a symlink')
        if args.command == 'init':
            if path.exists():
                raise ValueError('card already exists; use --card for a new reviewed contract')
            task = local(root, args.task).read_bytes()
            data = {'version': 1, 'task': local(root, args.task).relative_to(root).as_posix(), 'task_sha256': digest(task),
                    'task_definition_sha256': digest(re.sub(rb'(?m)^(\s*[-*] \[)[ xX](\]\s+)', rb'\1 \2', task)),
                    'base': git(root, 'rev-parse', 'HEAD').decode().strip(),
                    'allow': [Path(a).as_posix() for a in args.allow], 'checks': [json.loads(s) for s in args.check],
                    'timeout': args.timeout, 'runs': []}
            validate(root, data)
            save(path, data)
            print('Created ' + args.card + '; review checks before --run-checks.')
            return 0
        data = json.loads(path.read_text())
        original = path.read_bytes()
        card_name = path.relative_to(root).as_posix()
        report = evaluate(root, data, card_name, args.run_checks)
        if not path.exists() or path.is_symlink() or path.read_bytes() != original:
            report['status'] = 'ANDON'
            report['reasons'].append('acceptance checks changed the card; review before rerunning')
        data['runs'] = (data.get('runs', []) + [report])[-20:]
        save(path, data)
        print(json.dumps(report, indent=2))
        return {'DONE': 0, 'WAIT': 1, 'ANDON': 2}[report['status']]
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as e:
        # Do not echo exception contents: malformed cards/commands can contain secrets.
        print(json.dumps({'status': 'ANDON', 'reasons': ['invalid or unavailable repository/card/task; review configuration'], 'error_type': type(e).__name__}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
