# -*- coding: utf-8 -*-
"""Zszywanie odcinkow BDOT10k w ciagla linie wzdluz istniejacego 'kregoslupa'."""
import json, math, unicodedata, re, pickle

def norm(s):
    if not s: return ""
    s=unicodedata.normalize('NFKD',s.lower()); s=''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9 ]',' ',s.replace('ł','l')).strip()

# aliasy: nazwa w wykazie PZW -> nazwa w BDOT10k (zweryfikowane geometrycznie)
ALIASY={'stobnica':['stopnica'],'wielopolka':['brzeznica']}

def bazowa(nazwa):
    n=re.sub(r'\s*—\s*obw[óo]d.*$','',nazwa)
    n=re.sub(r'\s*—\s*(dolny|dolna|g[óo]rny|g[óo]rna).*$','',n)
    n=re.sub(r'\s*\(obw[óo]d[^)]*\)','',n)
    alt=set()
    m=re.search(r'\(([^)]+)\)',n)
    if m and 'krain' not in m.group(1).lower(): alt.add(norm(m.group(1)))
    n=re.sub(r'\s*\([^)]*\)','',n); n=re.sub(r'\s*—.*$','',n); n=re.sub(r'\s+\d+$','',n).strip()
    b=norm(n); alt.add(b)
    if b.startswith('potok '): alt.add(b[6:])
    for k,v in ALIASY.items():
        if k in alt: alt.update(v)
    return {a for a in alt if a}

def mpd(lat): return (111320.0,111320.0*math.cos(math.radians(lat)))
def sd(p,a,b):
    ky,kx=mpd(p[0]); px,py=p[1]*kx,p[0]*ky; ax,ay=a[1]*kx,a[0]*ky; bx,by=b[1]*kx,b[0]*ky
    dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
    t=0.0 if L==0 else max(0.0,min(1.0,((px-ax)*dx+(py-ay)*dy)/L))
    return math.hypot(px-(ax+t*dx),py-(ay+t*dy)),t
def pozycja(p,spine):
    best=(1e18,0.0)
    for i in range(len(spine)-1):
        d,t=sd(p,spine[i],spine[i+1])
        if d<best[0]: best=(d,i+t)
    return best
def dlugosc(l):
    s=0.0
    for i in range(len(l)-1):
        ky,kx=mpd(l[i][0]); s+=math.hypot((l[i+1][0]-l[i][0])*ky,(l[i+1][1]-l[i][1])*kx)
    return s
def rdp(pts,eps):
    if len(pts)<3: return pts
    dmax,idx=0.0,0
    for i in range(1,len(pts)-1):
        d,_=sd(pts[i],pts[0],pts[-1])
        if d>dmax: dmax,idx=d,i
    if dmax>eps: return rdp(pts[:idx+1],eps)[:-1]+rdp(pts[idx:],eps)
    return [pts[0],pts[-1]]

KOR=250.0; EPS=8.0; SNAP=6
data=json.load(open('/mnt/user-data/uploads/Phishing map Rzeszow/data.json'))
cieki=json.load(open('bdot_cieki.json'))
idx={}
for c in cieki:
    if c.get('n'): idx.setdefault(norm(c['n']),[]).append(c)

def klucz(p): return (round(p[0],SNAP),round(p[1],SNAP))

raport=[]
nowe=[]
for r in data['rivers']:
    spine=[(p[0],p[1]) for p in r['pts']]
    baza=bazowa(r['n'])
    segs=[]
    seen=set()
    for b in baza:
        for c in idx.get(b,[]):
            k=(klucz(c['pts'][0]),klucz(c['pts'][-1]),len(c['pts']))
            if k in seen: continue
            seen.add(k)
            w=[p for p in c['pts'] if pozycja(p,spine)[0]<=KOR]
            if len(w)>=max(2,0.5*len(c['pts'])): segs.append([(p[0],p[1]) for p in c['pts']])
    # uzupelnienie: odcinki bez nazwy (lub o innej nazwie) lezace bardzo blisko kregoslupa
    # — BDOT czesto nie nazywa odcinkow zrodliskowych
    WASKI=80.0
    for c in cieki:
        k=(klucz(c['pts'][0]),klucz(c['pts'][-1]),len(c['pts']))
        if k in seen: continue
        p0=c['pts'][0]; 
        if not (min(p[0] for p in spine)-0.05 <= p0[0] <= max(p[0] for p in spine)+0.05): continue
        if not (min(p[1] for p in spine)-0.05 <= p0[1] <= max(p[1] for p in spine)+0.05): continue
        w=[p for p in c['pts'] if pozycja(p,spine)[0]<=WASKI]
        if len(w)>=max(2,0.7*len(c['pts'])):
            seen.add(k); segs.append([(p[0],p[1]) for p in c['pts']])
    if not segs:
        raport.append(dict(rzeka=r['n'],status='BRAK',segmentow=0)); nowe.append(None); continue
    # --- zszywanie z mostkowaniem przerw (BDOT tnie dane na granicach powiatow) ---
    JOIN=60.0        # m: bezposrednie polaczenie koncowek
    BRIDGE=2500.0    # m: maksymalny przeskok przez przerwe
    info=[]
    for i,s_ in enumerate(segs):
        p0=pozycja(s_[0],spine); p1=pozycja(s_[-1],spine)
        info.append(dict(i=i, a=s_[0], b=s_[-1], pa=p0[1], pb=p1[1]))
    def odl(p,q):
        ky,kx=mpd(p[0]); return math.hypot((q[0]-p[0])*ky,(q[1]-p[1])*kx)
    # start: koncowka najblizsza poczatkowi kregoslupa
    # start moze wypasc w SRODKU odcinka (BDOT nie tnie ciekow na granicach obwodow)
    naj=(1e18,0,0)
    for it in info:
        s_=segs[it['i']]
        for vi,p in enumerate(s_):
            dd=odl(p,spine[0])
            if dd<naj[0]: naj=(dd,it['i'],vi)
    _,si,vi=naj
    s_=segs[si]
    # kierunek: ta czesc odcinka, ktora posuwa sie wzdluz kregoslupa
    przod=s_[vi:]; tyl=s_[:vi+1][::-1]
    def adv(seq):
        if len(seq)<2: return -1e18
        return pozycja(seq[-1],spine)[1]-pozycja(seq[0],spine)[1]
    linia = przod if adv(przod)>=adv(tyl) else tyl
    if len(linia)<2: linia=s_[:]
    uzyte={si}; mostki=0
    while True:
        kon=linia[-1]; poz=pozycja(kon,spine)[1]
        naj=None
        # 1) bezposrednie polaczenie
        for it in info:
            if it['i'] in uzyte: continue
            for koniec,pt in ((0,it['a']),(1,it['b'])):
                d=odl(kon,pt)
                if d<=JOIN:
                    kand2=segs[it['i']][:] if koniec==0 else segs[it['i']][::-1]
                    adv=pozycja(kand2[-1],spine)[1]-poz
                    if adv>-0.2 and (naj is None or adv>naj[0]): naj=(adv,it['i'],kand2,d,False)
        # 2) mostek przez przerwe
        if naj is None:
            best=None
            for it in info:
                if it['i'] in uzyte: continue
                for koniec,pt,poz_far in ((0,it['a'],it['pb']),(1,it['b'],it['pa'])):
                    d=odl(kon,pt)
                    if d>BRIDGE: continue
                    p_here=pozycja(pt,spine)[1]
                    if p_here < poz-0.2: continue
                    if poz_far < p_here-0.2: continue
                    if best is None or d<best[0]:
                        kand2=segs[it['i']][:] if koniec==0 else segs[it['i']][::-1]
                        best=(d,it['i'],kand2)
            if best: naj=(0,best[1],best[2],best[0],True); mostki+=1
        if naj is None: break
        _,j,kand2,dj,czy_most=naj
        uzyte.add(j); linia+=kand2 if czy_most else kand2[1:]
    # przytnij precyzyjnie: od punktu najblizszego poczatkowi kregoslupa do najblizszego koncowi
    def naj_idx(target):
        ky,kx=mpd(target[0]); bi,bd=0,1e18
        for i,p in enumerate(linia):
            d=math.hypot((p[0]-target[0])*ky,(p[1]-target[1])*kx)
            if d<bd: bd,bi=d,i
        return bi
    i0=naj_idx(spine[0]); i1=naj_idx(spine[-1])
    if i0>i1: i0,i1=i1,i0
    linia=linia[i0:i1+1]
    if len(linia)<2:
        raport.append(dict(rzeka=r['n'],status='BRAK_PO_PRZYCIECIU',segmentow=len(segs))); nowe.append(None); continue
    upr=rdp(linia,EPS)
    dl_s,dl_n=dlugosc(spine),dlugosc(upr)
    ky,kx=mpd(spine[0][0])
    d_start=math.hypot((upr[0][0]-spine[0][0])*ky,(upr[0][1]-spine[0][1])*kx)
    d_end=math.hypot((upr[-1][0]-spine[-1][0])*ky,(upr[-1][1]-spine[-1][1])*kx)
    raport.append(dict(rzeka=r["n"],status="OK",segmentow=len(segs),uzytych=len(uzyte),mostki=mostki,
                       pkt_stare=len(spine),pkt_nowe=len(upr),
                       dl_stara_m=round(dl_s),dl_nowa_m=round(dl_n),
                       zmiana_dl_pct=round(100*(dl_n-dl_s)/dl_s,1),
                       konce_m=[round(d_start),round(d_end)]))
    nowe.append([[round(a,6),round(b,6)] for a,b in upr])
    print(f"  {r['n'][:36]:36} seg={len(segs):4d}/{len(uzyte):3d}  pkt {len(spine):4d}->{len(upr):4d}  dl {round(dl_s/1000,1):6.1f}->{round(dl_n/1000,1):6.1f} km ({round(100*(dl_n-dl_s)/dl_s,1):+6.1f}%)  konce {round(d_start):5d}/{round(d_end):5d} m",flush=True)

json.dump(raport,open('rzeki_raport.json','w'),ensure_ascii=False,indent=1)
pickle.dump(nowe,open('rzeki_nowe.pkl','wb'))
ok=sum(1 for x in raport if x['status']=='OK')
print(f"\nOK: {ok}/{len(raport)}")
