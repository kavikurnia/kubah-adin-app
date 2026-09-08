export function manualStore({fs,db}){
  const ref=p=>fs.doc(db,p);
  return {
    async get(p){const s=await fs.getDocFromServer(ref(p));return s.exists()?s.data():null;},
    async list(path,filters=[]){const q=fs.query(fs.collection(db,path),...filters.map(([k,op,v])=>fs.where(k,op,v)));const s=await fs.getDocsFromServer(q);return s.docs.map(d=>({...d.data(),id:d.id}));},
    set:(p,d)=>fs.setDoc(ref(p),d),
    run:fn=>fs.runTransaction(db,tx=>fn({get:async p=>{const s=await tx.get(ref(p));return s.exists()?s.data():null;},set:(p,d)=>tx.set(ref(p),d),update:(p,d)=>tx.update(ref(p),d),delete:p=>tx.delete(ref(p))}))
  };
}
