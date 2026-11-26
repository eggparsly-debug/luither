s=open('app.html').read(); d=open('biquad.js').read()+'\n'+open('synthdsp.js').read()+'\n'+open('ampdsp.js').read()+'\n'+open('dsp.js').read()
for ph in ['/*__BODYGEO__*/','/*__BIQUAD__*/','/*__AMPDEFS__*/','/*__AMPUI__*/','/*__INSTDEFS__*/','/*__DSP__*/','/*__SYNTHDEFS__*/','/*__SYNTHUI__*/']: assert ph in s, ph
s=s.replace('/*__INSTDEFS__*/', open('instdefs.js').read()).replace('/*__DSP__*/', d).replace('/*__SYNTHDEFS__*/', open('synthdefs.js').read()).replace('/*__SYNTHUI__*/', open('synthui.js').read()).replace('/*__BIQUAD__*/', open('biquad.js').read()).replace('/*__BODYGEO__*/', open('bodygeo.js').read()).replace('/*__AMPDEFS__*/', open('ampdefs.js').read()).replace('/*__AMPUI__*/', open('ampui.js').read())
# pure ASCII output: some web views (the plugin's, on Linux) misread UTF-8 from embedded resources.
# JS gets \\uXXXX escapes (valid in strings, regexes, comments and identifiers), CSS gets \\XXXX, HTML gets &#x..;
import re
def esc_js(t): return ''.join(c if ord(c) < 128 else ''.join('\\u%04x' % u for u in (([ord(c)] if ord(c) < 0x10000 else [0xD800 + ((ord(c) - 0x10000) >> 10), 0xDC00 + ((ord(c) - 0x10000) & 0x3FF)]))) for c in t)
def esc_css(t): return ''.join(c if ord(c) < 128 else '\\%x ' % ord(c) for c in t)
def esc_html(t): return ''.join(c if ord(c) < 128 else '&#x%x;' % ord(c) for c in t)
out, pos = [], 0
for m in re.finditer(r'(<script[^>]*>)(.*?)(</script>)|(<style[^>]*>)(.*?)(</style>)', s, re.S):
    out.append(esc_html(s[pos:m.start()]))
    out.append(m.group(1) + esc_js(m.group(2)) + m.group(3) if m.group(1) else m.group(4) + esc_css(m.group(5)) + m.group(6))
    pos = m.end()
out.append(esc_html(s[pos:])); s = ''.join(out)
assert all(ord(c) < 128 for c in s)
open('luither.html','w').write(s)
print('ok', len(s))
