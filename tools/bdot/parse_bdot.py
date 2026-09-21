"""Parser BDOT10k -> JSON. Warstwy: PTWP (poligony wod), SWRS/SWKN (cieki)."""
import re, json, glob, os, math
from pyproj import Transformer
T = Transformer.from_crs("EPSG:2180","EPSG:4326",always_xy=True)

def coords(posList):
    n=[float(v) for v in posList.split()]
    e,nn=n[0::2],n[1::2]
    lon,lat=T.transform(e,nn)
    return list(zip(lat,lon))

def pola(f):
    d={}
    for k in ('nazwa','rodzaj','x_kod','idIIP'):
        m=re.search(rf'<ot:{k}>([^<]+)</ot:{k}>',f)
        if m: d[k]=m.group(1)
    return d

def area_ha(pts):
    if len(pts)<3: return 0.0
    lat0=sum(p[0] for p in pts)/len(pts)
    k=math.cos(math.radians(lat0))
    a=0.0
    for i in range(len(pts)):
        j=(i+1)%len(pts)
        x1,y1=pts[i][1]*k,pts[i][0]; x2,y2=pts[j][1]*k,pts[j][0]
        a+=x1*y2-x2*y1
    return abs(a)/2*(111320**2)/10000

def parse(path, geom):
    src=open(path,encoding='utf-8',errors='replace').read()
    out=[]
    for f in src.split('<gml:featureMember>')[1:]:
        p=pola(f)
        if geom=='poly':
            m=re.search(r'<gml:exterior>.*?<gml:posList>([^<]+)</gml:posList>',f,re.S)
            if not m: continue
            pts=coords(m.group(1))
            if len(pts)<3: continue
            lat=sum(q[0] for q in pts)/len(pts); lon=sum(q[1] for q in pts)/len(pts)
            out.append(dict(n=p.get('nazwa'),rodzaj=p.get('rodzaj'),lat=round(lat,6),lon=round(lon,6),
                            ha=round(area_ha(pts),3),ring=[[round(a,6),round(b,6)] for a,b in pts]))
        else:
            for m in re.finditer(r'<gml:posList>([^<]+)</gml:posList>',f):
                pts=coords(m.group(1))
                if len(pts)<2: continue
                out.append(dict(n=p.get('nazwa'),rodzaj=p.get('rodzaj'),
                                pts=[[round(a,6),round(b,6)] for a,b in pts]))
    return out

if __name__=='__main__':
    ptwp,ciek=[],[]
    for d in sorted(glob.glob('work/ext/*')):
        t=os.path.basename(d)
        for f in glob.glob(d+'/*OT_PTWP_A.xml'):
            r=parse(f,'poly'); [x.update(teryt=t) for x in r]; ptwp+=r
        for pat in ('*OT_SWRS_L.xml','*OT_SWKN_L.xml'):
            for f in glob.glob(d+'/'+pat):
                r=parse(f,'line'); [x.update(teryt=t) for x in r]; ciek+=r
        print(f"  {t}: ptwp={len([x for x in ptwp if x['teryt']==t]):5d} cieki={len([x for x in ciek if x['teryt']==t]):5d}",flush=True)
    json.dump(ptwp,open('bdot_ptwp.json','w'),ensure_ascii=False)
    json.dump(ciek,open('bdot_cieki.json','w'),ensure_ascii=False)
    print("RAZEM poligony wod:",len(ptwp)," odcinki ciekow:",len(ciek))
    nn=sorted({x['n'] for x in ciek if x['n']})
    print("nazwanych ciekow (unikalnych):",len(nn))
