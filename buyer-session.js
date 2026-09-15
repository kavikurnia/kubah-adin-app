// Account-owned browser drafts. Legacy unowned keys are deliberately not imported:
// their owner cannot be established safely on a shared device.
export function buyerSession(storage){
 let uid,epoch=0;
 const key=(name,owner=uid)=>'kn-buyer-v2:'+encodeURIComponent(owner||'guest')+':'+name;
 const read=(name,fallback,owner=uid)=>{try{return JSON.parse(storage.getItem(key(name,owner)))??fallback;}catch{return fallback;}};
 const write=(name,value)=>storage.setItem(key(name),JSON.stringify(value));
 const remove=name=>storage.removeItem(key(name));
 return {key,read,write,remove,
  activate(next){
   const previous=uid,guestCart=previous===null?read('cart',[]):[];uid=next||null;epoch++;
   if(previous&&uid===null){remove('cart');remove('wish');remove('checkout');remove('intent');}
   if(previous===null&&uid&&guestCart.length&&!read('cart',[]).length){write('cart',guestCart);write('intent',crypto.randomUUID());storage.removeItem(key('cart',null));}
   return {cart:read('cart',[]),wish:read('wish',[]),checkoutDraft:read('checkout',null),intent:read('intent',null)};
  },
  stamp(){const owner=uid,version=epoch;return ()=>owner===uid&&version===epoch;}
 };
}
export function identityGuard(c){
 const user=Object.hasOwn(c,'expectedUser')?c.expectedUser:c.a?.currentUser;
 return ()=>{if(c.a&&c.a.currentUser!==user)throw Object.assign(new Error('Akun atau sesi berubah. Masuk kembali untuk melanjutkan draf akun Anda.'),{code:'auth/session-changed'});};
}
