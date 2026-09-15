import {identityGuard} from './buyer-session.js?v=launch-20260915-r14';
export function manualStore(c){
  const {fs,db}=c;
  const ref=p=>fs.doc(db,p);
  return {
    serverTimestamp:()=>fs.serverTimestamp(),
    async get(p){const guard=identityGuard(c);guard();const s=await fs.getDocFromServer(ref(p));guard();return s.exists()?s.data():null;},
    async list(path,filters=[]){const guard=identityGuard(c);guard();const q=fs.query(fs.collection(db,path),...filters.map(([k,op,v])=>fs.where(k,op,v)));const s=await fs.getDocsFromServer(q);guard();return s.docs.map(d=>({...d.data(),id:d.id}));},
    set:async(p,d)=>{const guard=identityGuard(c);guard();await fs.setDoc(ref(p),d);guard();},
    run:fn=>{const guard=identityGuard(c);guard();return fs.runTransaction(db,async tx=>{guard();const result=await fn({get:async p=>{guard();const s=await tx.get(ref(p));guard();return s.exists()?s.data():null;},set:(p,d)=>{guard();tx.set(ref(p),d);},update:(p,d)=>{guard();tx.update(ref(p),d);},delete:p=>{guard();tx.delete(ref(p));}});guard();return result;});}
  };
}
