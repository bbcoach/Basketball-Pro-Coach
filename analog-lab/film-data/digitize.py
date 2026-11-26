import pdfplumber, re, numpy as np, json, sys
NUM=re.compile(r'^-?\d+(\.\d+)?$')
def fit(pairs):
    p=np.array(pairs,float); A=np.vstack([p[:,0],np.ones(len(p))]).T
    a,b=np.linalg.lstsq(A,p[:,1],rcond=None)[0]; return a,b
def region_for(pg,title):
    ws=pg.extract_words()
    toks=title.split()
    for i,w in enumerate(ws):
        if w['text']==toks[0] and all(i+k<len(ws) and ws[i+k]['text']==t for k,t in enumerate(toks)):
            x0=w['x0']; x1=ws[i+len(toks)-1]['x1']; return (x0+x1)/2, w['bottom'], ws
    return None
def plot_curves(pg,title,col_w=270,h=380):
    r=region_for(pg,title)
    if not r: return None
    cx,top,ws=r
    # Spalte: links oder rechts
    if cx<pg.width/2: xa,xb=0,pg.width/2
    else: xa,xb=pg.width/2,pg.width
    ya,yb=top,top+h
    heads=[w for w in ws if w['text'] in ('Characteristic','Spectral-Dye-Density','Spectral-Sensitivity','Modulation','Spectral','rms','Diffuse','Granularity','Sensitometric','Print') and w['top']>top+20 and xa<=w['x0']<=xb]
    if heads: yb=min(yb,min(w['top'] for w in heads)-2)
    inreg=lambda o:(o['x0']>=xa and o['x1']<=xb and o['top']>=ya and o['bottom']<=yb)
    nums=[w for w in ws if inreg(w) and NUM.match(w['text'])]
    # x-Achse: Zahlen in der untersten Zeile; y-Achse: Zahlen mit gleichem rechten Rand ganz links
    rows={}
    for w in nums: rows.setdefault(round(w['top']),[]).append(w)
    # y-Achse: Gruppe mit gleicher x1 (±2), mind. 3 Werte, am weitesten links
    cols={}
    for w in nums: cols.setdefault(round(w['x1']/3),[]).append(w)
    ycol=min([c for c in cols.values() if len(c)>=3],key=lambda c:np.mean([w['x1'] for w in c]))
    xrow=max([r for r in rows.values() if len(r)>=3],key=lambda r:np.mean([w['top'] for w in r]))
    ya_,yb_=fit([(((w['top']+w['bottom'])/2),float(w['text'])) for w in ycol])
    xa_,xb_=fit([(((w['x0']+w['x1'])/2),float(w['text'])) for w in xrow])
    curves=[]
    for c in pg.curves:
        if not inreg(c): continue
        if c['x1']-c['x0']<60 or len(c['pts'])<8: continue
        pts=np.array([(xa_*x+xb_, ya_*y+yb_) for x,y in c['pts']])   # pts: y von unten
        curves.append(pts)
    return curves
if __name__=='__main__':
    f=sys.argv[1]; pgi=int(sys.argv[2]); title=sys.argv[3]
    pdf=pdfplumber.open(f); pg=pdf.pages[pgi]
    cs=plot_curves(pg,title)
    for c in cs or []:
        print(len(c),'x',c[:,0].min().round(2),c[:,0].max().round(2),'y',c[:,1].min().round(2),c[:,1].max().round(2))
