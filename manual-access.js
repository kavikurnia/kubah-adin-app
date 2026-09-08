// Role metadata is read from trusted Firestore documents; this never sets token claims.
export function resolveManualAccess(token,record){
  const ok=record===null?token.claims?.role==='admin':record.active===true&&record.role==='admin';
  if(!ok)throw Object.assign(new Error('Izin admin belum tersedia atau telah dicabut.'),{code:'free/permission-denied'});
  return {claims:{role:'admin',superAdmin:record?record.superAdmin===true:token.claims?.superAdmin===true},accessSource:record?'firestore-owner-list':'custom-claim'};
}
export async function manualAccess(c,user){
  if(!user)throw Object.assign(new Error('Silakan masuk.'),{code:'auth/unauthenticated'});
  const token=await user.getIdTokenResult(true);
  const snap=await c.fs.getDocFromServer(c.fs.doc(c.db,'adminUsers',user.uid));
  if(c.a.currentUser?.uid!==user.uid)throw Object.assign(new Error('Sesi berubah. Masuk kembali.'),{code:'auth/unauthenticated'});
  return resolveManualAccess(token,snap.exists()?snap.data():null);
}
