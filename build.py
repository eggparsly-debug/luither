s=open('app.html').read(); d=open('biquad.js').read()+'\n'+open('synthdsp.js').read()+'\n'+open('ampdsp.js').read()+'\n'+open('dsp.js').read()
for ph in ['/*__BIQUAD__*/','/*__AMPDEFS__*/','/*__AMPUI__*/','/*__INSTDEFS__*/','/*__DSP__*/','/*__SYNTHDEFS__*/','/*__SYNTHUI__*/']: assert ph in s, ph
s=s.replace('/*__INSTDEFS__*/', open('instdefs.js').read()).replace('/*__DSP__*/', d).replace('/*__SYNTHDEFS__*/', open('synthdefs.js').read()).replace('/*__SYNTHUI__*/', open('synthui.js').read()).replace('/*__BIQUAD__*/', open('biquad.js').read()).replace('/*__AMPDEFS__*/', open('ampdefs.js').read()).replace('/*__AMPUI__*/', open('ampui.js').read())
open('luither.html','w').write(s)
print('ok', len(s))
