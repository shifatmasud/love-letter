# Build a patch for one file from chosen hunks of `git diff -U1 FILE`. usage: pickhunks.py FILE 1,3,4 > p.diff (hunk numbers from 1)
import subprocess, sys
f, keep = sys.argv[1], {int(v) for v in sys.argv[2].split(',') if v}
d = subprocess.run(['git', 'diff', '-U1', f], capture_output=True, text=True).stdout.splitlines(True)
head, hunks, cur = [], [], None
for l in d:
    if l.startswith('@@'):
        cur = [l]; hunks.append(cur)
    elif cur is None: head.append(l)
    else: cur.append(l)
sys.stdout.write(''.join(head) + ''.join(''.join(h) for i, h in enumerate(hunks, 1) if i in keep))
