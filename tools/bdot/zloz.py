# -*- coding: utf-8 -*-
import json, pickle, math, datetime
stare=json.load(open('/mnt/user-data/uploads/Phishing map Rzeszow/data.json'))
nowe_geom=pickle.load(open('rzeki_nowe.pkl','rb'))
rap=json.load(open('rzeki_raport.json'))
kand=json.load(open('kandydaci_zbiorniki.json'))

out={}
# --- RZEKI ---
rivers=[]
for r,geom,rr in zip(stare['rivers'],nowe_geom,rap):
    n=dict(r)
    if geom and len(geom)>=2:
        n['pts']=geom
        n['src']='bdot10k'
    else:
        n['src']='osm'
    rivers.append(n)
out['rivers']=rivers

# --- ZBIORNIKI ---
idx={w['nazwa']:w for w in kand['wyniki']}
zb=[]; przesuniete=0
for z in stare['zb']:
    n=dict(z)
    w=idx.get(z['n'])
    if w and w['klasa']=='pewne' and w['kandydaci']:
        k=w['kandydaci'][0]
        n['p']=[round(k['lat'],5),round(k['lon'],5)]
        n['a']=0
        n['src']='bdot10k'
        przesuniete+=1
    elif w and w['klasa']=='do_wyboru':
        n['src']='wykaz'; n['kand']=len(w['kandydaci'])
    zb.append(n)
out['zb']=zb
out['granice']=stare['granice']
out['meta']={
 'zrodla':{
   'tresc':'Wykaz wód PZW Okręgu w Rzeszowie 2026',
   'geometria':'BDOT10k — Główny Urząd Geodezji i Kartografii (PZGiK)',
   'geokodowanie':'UUG — Uniwersalna Usługa Geokodowania, GUGiK',
   'podklad':'Usługi WMTS Geoportalu (GUGiK)'},
 'aktualizacja_geometrii':datetime.date.today().isoformat(),
 'powiatow_bdot':23,
 'uwaga':'Dane przestrzenne pochodzą z PZGiK — bezpłatne do ponownego wykorzystania, wymagane podanie źródła.'
}
json.dump(out,open('data_nowe.json','w'),ensure_ascii=False,separators=(',',':'))

# --- plik kandydatow dla panelu operatora (odchudzony) ---
lekki={'meta':kand['meta'],'wyniki':[]}
for w in kand['wyniki']:
    if w['klasa']=='pewne': continue
    lekki['wyniki'].append({'nazwa':w['nazwa'],'klasa':w['klasa'],'ha_wykaz':w.get('ha_wykaz'),
      'obecna':w['obecna_pozycja'],
      'kandydaci':[{k:v for k,v in c.items() if k!='ring'} for c in w['kandydaci']]})
json.dump(lekki,open('kandydaci_panel.json','w'),ensure_ascii=False,separators=(',',':'))

import os
print("data_nowe.json:", round(os.path.getsize('data_nowe.json')/1024,1),"KB  (stary:",round(os.path.getsize('/mnt/user-data/uploads/Phishing map Rzeszow/data.json')/1024,1),"KB)")
print("kandydaci_panel.json:", round(os.path.getsize('kandydaci_panel.json')/1024,1),"KB")
print("zbiornikow przesunietych automatycznie:",przesuniete)
print("rzek z geometria BDOT:",sum(1 for r in rivers if r['src']=='bdot10k'))
print("wierzcholkow rzek: stare",sum(len(r['pts']) for r in stare['rivers']),"-> nowe",sum(len(r['pts']) for r in rivers))
print("przyblizonych (a=1) pozostalo:",sum(1 for z in zb if z.get('a')==1))
