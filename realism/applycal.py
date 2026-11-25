import re, subprocess, json
for it in range(3):
    out = subprocess.run(['node', 'qa.js', 'cal'], capture_output=True, text=True).stdout
    vals = dict((m.group(1).strip(), float(m.group(3))) for m in re.finditer(r'^(.+?)\s+truePk (-?[\d.]+) .*master ([\d.]+)', out, re.M))
    pks = dict((m.group(1).strip(), float(m.group(2))) for m in re.finditer(r'^(.+?)\s+truePk (-?[\d.]+)', out, re.M))
    src = open('instdefs.js').read(); m = re.search(r'const CAL = (\{.*?\});', src); cal = json.loads(m.group(1))
    cal.update({k: round(v, 3) for k, v in vals.items()})
    src = src[:m.start(1)] + json.dumps(cal, ensure_ascii=False) + src[m.end(1):]; open('instdefs.js', 'w').write(src)
    print('iter', it, 'worst peak dev', max(abs(p + 3) for p in pks.values()))
