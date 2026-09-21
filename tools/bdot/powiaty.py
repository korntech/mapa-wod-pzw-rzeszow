import urllib.request, urllib.parse, re, json
from pyproj import Transformer
T = Transformer.from_crs("EPSG:2180","EPSG:4326",always_xy=True)
base="https://mapy.geoportal.gov.pl/wss/service/PZGIK/BDOT/WFS/PobieranieBDOT10k"
q={"service":"WFS","version":"2.0.0","request":"GetFeature","typeNames":"ms:BDOT10k_powiaty","count":"400"}
d=urllib.request.urlopen(base+"?"+urllib.parse.urlencode(q),timeout=180).read().decode('utf-8','replace')
mems=d.split('<wfs:member>')[1:]
# zasieg danych Okregu + margines 0.05 st.
LAT0,LAT1,LON0,LON1 = 49.589,50.540,21.087,22.831
out=[]
for m in mems:
    f=dict(re.findall(r'<ms:([A-Za-z_0-9]+)>([^<]{0,300})</ms:\1>',m))
    env=re.search(r'<gml:lowerCorner>([\d.\s]+)</gml:lowerCorner>\s*<gml:upperCorner>([\d.\s]+)</gml:upperCorner>',m)
    if not env or 'URL_GML' not in f: continue
    lo=[float(v) for v in env.group(1).split()]; up=[float(v) for v in env.group(2).split()]
    # EPSG:2180 -> (easting, northing)? sprawdzimy po wartosciach: easting ~ 100-900k, northing ~ 100-800k
    lon0,lat0=T.transform(lo[1],lo[0]); lon1,lat1=T.transform(up[1],up[0])
    if lat1<LAT0 or lat0>LAT1 or lon1<LON0 or lon0>LON1: continue
    out.append(dict(teryt=f['TERYT'],nazwa=f.get('NAZWA_POWIATU',''),url=f['URL_GML'],
                    akt=f.get('Data_aktualizacji','')[:10],
                    bbox=[round(lat0,3),round(lon0,3),round(lat1,3),round(lon1,3)]))
out.sort(key=lambda r:r['teryt'])
json.dump(out,open('powiaty.json','w'),ensure_ascii=False,indent=1)
print("powiatow w zasiegu:",len(out))
for r in out: print(f"  {r['teryt']}  {r['nazwa']:32} akt.{r['akt']}  {r['bbox']}")
