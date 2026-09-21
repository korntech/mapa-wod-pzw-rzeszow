import json
pw=json.load(open('powiaty.json'))
d=json.load(open('/mnt/user-data/uploads/Phishing map Rzeszow/data.json'))
pts=[(z['p'][0],z['p'][1]) for z in d['zb']]
pts+=[(g['p'][0],g['p'][1]) for g in d['granice']]
for r in d['rivers']: pts+=[(p[0],p[1]) for p in r['pts']]
M=0.02
sel=[]
for p in pw:
    la0,lo0,la1,lo1=p['bbox']
    n=sum(1 for la,lo in pts if la0-M<=la<=la1+M and lo0-M<=lo<=lo1+M)
    if n: sel.append(dict(p,punktow=n))
sel.sort(key=lambda r:-r['punktow'])
json.dump(sel,open('powiaty_sel.json','w'),ensure_ascii=False,indent=1)
print("wybrano powiatow:",len(sel),"| suma trafien:",sum(s['punktow'] for s in sel),"z",len(pts),"punktow")
for s in sel: print(f"  {s['teryt']} {s['nazwa']:32} punktow={s['punktow']}")
