// Tab-local recovery, scoped to the authenticated admin. Never import an unowned draft.
export function productDrafts(storage,currentUid,owner){
 const key=id=>'kn-product-draft-v1:'+encodeURIComponent(owner)+':'+encodeURIComponent(id);
 const allowed=()=>!!owner&&currentUid()===owner;
 return {
  read(id){if(!allowed())return null;try{const value=JSON.parse(storage.getItem(key(id)));return value?.owner===owner&&value.productId===id?value.state:null;}catch{return null;}},
  write(id,state){if(!allowed())return false;try{storage.setItem(key(id),JSON.stringify({owner,productId:id,savedAt:new Date().toISOString(),state}));return true;}catch{return false;}},
  remove(id){if(allowed())storage.removeItem(key(id));}
 };
}
