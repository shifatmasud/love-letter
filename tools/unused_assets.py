#!/usr/bin/env python3
# Lists asset files (tex/, snd/, fonts/) that no code references. A file counts as used when its path or file name appears in
# index.html, js/*.js or vercel.json (assets.js, the stamp list, is ignored), or its bare name appears as a whole string literal.
# Usage: python3 tools/unused_assets.py
import os, re, glob, subprocess
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = ''
for f in ['index.html', 'vercel.json'] + [p for p in glob.glob('js/*.js') if not p.endswith('assets.js')]:
    if os.path.exists(f): src += open(f, encoding='utf-8').read() + '\n'
lits = set(re.findall(r"['\"`]([A-Za-z0-9_\-./]+)['\"`]", src))
files = subprocess.run(['git', 'ls-files', 'tex', 'snd', 'fonts'], capture_output=True, text=True).stdout.split()
total = 0
for f in files:
    base = os.path.basename(f); name = base.rsplit('.', 1)[0]
    if f.endswith('.txt'): continue  # licences ship with their font
    if not (f in src or base in src or name in lits):
        s = os.path.getsize(f); total += s; print(f'UNUSED {f} {s}')
print(f'TOTAL {total}')
