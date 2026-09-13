import {RETURN_REASONS,LEGACY_REASONS} from './return-domain.js?v=kebijakan-20260913-r9';
import {check,id,cartInput,str} from './manual-domain.js?v=katalog-pembeli-20260909-r7';
export function buyerFilePath(uid,orderId,sha,mime){const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[mime];check(/^[A-Za-z0-9_-]{1,128}$/.test(uid)&&/^[A-Za-z0-9_-]{1,128}$/.test(orderId)&&/^[a-f0-9]{64}$/.test(sha)&&ext,'Identitas bukti tidak valid.');return `buyer/${uid}/${orderId}/claim/${sha}.${ext}`;}
export function claimEvidence(files=[],uid,orderId){check(Array.isArray(files)&&files.length<=3,'Maksimal 3 bukti.');check(new Set(files.map(f=>f.objectName)).size===files.length,'Bukti duplikat.');return files.map(f=>{
 check(f&&Number.isInteger(f.size)&&f.size>0&&f.size<=2097152,'Bukti maksimal 2 MB.');
 const old=buyerFilePath(uid,orderId,f.sha256,f.mime);
 if(f.requestId){check(/^CR-[a-f0-9]{40}$/.test(f.requestId)&&Number.isInteger(f.revision)&&f.revision>0&&f.buyerId===uid&&f.orderId===orderId&&typeof f.uploadedAt==='string'&&Number.isFinite(Date.parse(f.uploadedAt)),'Metadata bukti tidak sesuai.');check(f.objectName===old.replace('/claim/','/claim/'+f.requestId+'/r'+f.revision+'/'),'Bukti bukan milik pengajuan ini.');return {objectName:f.objectName,sha256:f.sha256,size:f.size,mime:f.mime,requestId:f.requestId,revision:f.revision,buyerId:uid,orderId,uploadedAt:f.uploadedAt};}
 check(f.objectName===old,'Bukti bukan milik pembeli/pesanan ini.');return {objectName:f.objectName,sha256:f.sha256,size:f.size,mime:f.mime};
 });}
export function claimInput(d,o,uid){
 check(o?.customerId===uid&&['dikirim','selesai'].includes(o.status),'Komplain tersedia untuk pesanan Anda setelah dikirim.');
 const items=cartInput(d.items);check(items.length===1,'Ajukan satu barang per pengajuan agar pemeriksaan jelas.');const x=items[0],orderItemIndex=o.items.findIndex(i=>i.productId===x.productId&&i.variantId===x.variantId),line=o.items[orderItemIndex];
 check(line&&x.qty<=line.qty,'Barang/jumlah komplain tidak sesuai pesanan.');check(x.qty+(o.claimedQuantities?.[x.productId+'_'+x.variantId]||0)<=line.qty,'Jumlah barang sudah diajukan sebelumnya.');
 const reason=str(d.reason,100,true);check([...RETURN_REASONS,...LEGACY_REASONS].includes(reason),'Alasan tidak valid.');
 return {orderId:id(d.orderId),items,orderItemIndex,reason,description:str(d.description,3000,true),evidence:claimEvidence(d.evidence,uid,d.orderId)};
}
