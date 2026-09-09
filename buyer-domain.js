import {check,id,cartInput,str} from './manual-domain.js?v=katalog-pembeli-20260909-r7';
export function buyerFilePath(uid,orderId,sha,mime){const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[mime];check(/^[A-Za-z0-9_-]{1,128}$/.test(uid)&&/^[A-Za-z0-9_-]{1,128}$/.test(orderId)&&/^[a-f0-9]{64}$/.test(sha)&&ext,'Identitas bukti tidak valid.');return `buyer/${uid}/${orderId}/claim/${sha}.${ext}`;}
export function claimEvidence(files=[],uid,orderId){check(Array.isArray(files)&&files.length<=3,'Maksimal 3 bukti.');return files.map(f=>{check(f&&Number.isInteger(f.size)&&f.size>0&&f.size<=2097152,'Bukti maksimal 2 MB.');check(f.objectName===buyerFilePath(uid,orderId,f.sha256,f.mime),'Bukti bukan milik pembeli/pesanan ini.');return {objectName:f.objectName,sha256:f.sha256,size:f.size,mime:f.mime};});}
export function claimInput(d,o,uid){
 check(o?.customerId===uid&&['dikirim','selesai'].includes(o.status),'Komplain tersedia untuk pesanan Anda setelah dikirim.');
 const items=cartInput(d.items);check(items.length===1,'Ajukan satu barang per pengajuan agar pemeriksaan jelas.');const x=items[0],orderItemIndex=o.items.findIndex(i=>i.productId===x.productId&&i.variantId===x.variantId),line=o.items[orderItemIndex];
 check(line&&x.qty<=line.qty,'Barang/jumlah komplain tidak sesuai pesanan.');check(x.qty+(o.claimedQuantities?.[x.productId+'_'+x.variantId]||0)<=line.qty,'Jumlah barang sudah diajukan sebelumnya.');
 const reason=str(d.reason,100,true);check(['Barang salah','Varian salah','Jumlah kurang','Barang rusak','Barang belum diterima','Lainnya'].includes(reason),'Alasan tidak valid.');
 return {orderId:id(d.orderId),items,orderItemIndex,reason,description:str(d.description,3000,true),evidence:claimEvidence(d.evidence,uid,d.orderId)};
}
