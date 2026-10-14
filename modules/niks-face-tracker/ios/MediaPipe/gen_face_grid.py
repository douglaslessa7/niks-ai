# Gera o niks_face_grid.json: a grade da malha (quadradinhos regulares sobre a superfície do
# rosto canônico do MediaPipe) amarrada aos triângulos do Face Landmarker por baricêntricas.
import sys, json, numpy as np
from collections import deque
obj, out, step = sys.argv[1], sys.argv[2], float(sys.argv[3]); ZC=-8.0
V=[];F=[]
for l in open(obj):
    p=l.split()
    if not p: continue
    if p[0]=='v': V.append([float(x) for x in p[1:4]])
    elif p[0]=='f': F.append([int(x.split('/')[0])-1 for x in p[1:4]])
V=np.array(V);F=np.array(F)
EYE_L=[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]
EYE_R=[263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]
LIPS=[78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191]
def inpoly(pt, poly):
    x,y=pt; c=False; n=len(poly)
    for i in range(n):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%n]
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: c=not c
    return c
holes=[V[h][:,:2] for h in (EYE_L,EYE_R,LIPS)]
cent=V[F].mean(axis=1)
holeTri=np.array([any(inpoly(c[:2],h) for h in holes) for c in cent])
th=np.arctan2(V[:,0],V[:,2]-ZC); P=np.stack([th*(0-ZC+5),V[:,1]],-1)
us=np.arange(np.floor(P[:,0].min()/step)*step, P[:,0].max()+step, step)
vs=np.arange(np.floor(P[:,1].min()/step)*step, P[:,1].max()+step, step)
T=P[F]
def locate(q):
    a=T[:,0];v0=T[:,1]-a;v1=T[:,2]-a;v2=q-a
    d00=(v0*v0).sum(1);d01=(v0*v1).sum(1);d11=(v1*v1).sum(1);d20=(v2*v0).sum(1);d21=(v2*v1).sum(1)
    den=d00*d11-d01*d01;l1=(d11*d20-d01*d21)/den;l2=(d00*d21-d01*d20)/den;l0=1-l1-l2
    idx=np.nonzero((l0>=-1e-6)&(l1>=-1e-6)&(l2>=-1e-6))[0]
    if len(idx)==0: return None
    t=idx[0]; return int(t),float(l1[t]),float(l2[t])
nodes={}
for i,u in enumerate(us):
    for j,v in enumerate(vs):
        r=locate(np.array([u,v]))
        if r: nodes[(i,j)]=r
present=sorted(k for k,r in nodes.items() if not holeTri[r[0]])
idx={k:n for n,k in enumerate(present)}
def midok(a,b):
    q=(np.array([us[a[0]],vs[a[1]]])+np.array([us[b[0]],vs[b[1]]]))/2
    r=locate(q); return r is not None and not holeTri[r[0]]
edges=[]
for k in present:
    for d in ((1,0),(0,1)):
        n=(k[0]+d[0],k[1]+d[1])
        if n in idx and midok(k,n): edges.append((idx[k],idx[n]))
cells=[]
for (i,j) in present:
    q=[(i,j),(i+1,j),(i+1,j+1),(i,j+1)]
    have=[c for c in q if c in idx]
    if len(have)==4: cells+= [idx[q[0]],idx[q[1]],idx[q[2]], idx[q[0]],idx[q[2]],idx[q[3]]]
    elif len(have)==3: cells+= [idx[c] for c in have]
# esmaecimento: arestas até a borda de FORA (olhos e boca não esmaecem)
adj=[[] for _ in present]
for a,b in edges: adj[a].append(b); adj[b].append(a)
hops=[None]*len(present); dq=deque()
for k in present:
    if any((k[0]+di,k[1]+dj) not in nodes for di,dj in ((1,0),(-1,0),(0,1),(0,-1))):
        hops[idx[k]]=0; dq.append(idx[k])
while dq:
    v=dq.popleft()
    for w in adj[v]:
        if hops[w] is None: hops[w]=hops[v]+1; dq.append(w)
fade=[]
for h in hops:
    x=min(1.0,(3 if h is None else h)/3); fade.append(round(x*x*(3-2*x),4))
def local_y(k):
    t,b1,b2=nodes[k]; f=F[t]; return float((1-b1-b2)*V[f[0],1]+b1*V[f[1],1]+b2*V[f[2],1])
data={
  'note':'Gerado por tools/export.py a partir do canonical_face_model.obj do MediaPipe (Apache 2.0). Passo %.2f cm.'%step,
  'tris':[int(x) for x in F.flatten()],
  'nodeTri':[nodes[k][0] for k in present],
  'nodeB':[round(x,5) for k in present for x in nodes[k][1:]],
  'nodeY':[round(local_y(k),4) for k in present],
  'fade':fade,
  'edges':[x for e in edges for x in e],
  'cells':cells,
}
json.dump(data,open(out,'w'),separators=(',',':'))
print('nodes',len(present),'edges',len(edges),'cells/3',len(cells)//3)
