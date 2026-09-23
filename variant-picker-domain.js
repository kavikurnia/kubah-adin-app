import {catalogEstimate} from './catalog-domain.js?v=picker-20260923-r21';

export const primaryPhoto=p=>p.images?.find(i=>i.isPrimary)?.url||p.images?.[0]?.url||'';
export const variantLabel=v=>[v.color,v.size].filter(Boolean).join(' / ')||'Standar';
export const inCart=(cart,pid,vid)=>cart.filter(i=>i.productId===pid&&i.variantId===vid).reduce((n,i)=>n+i.qty,0);
export const remaining=(p,v,cart)=>Math.max(0,Number(v.stock||0)-inCart(cart,p.id,v.id));
export function pickerAxes(p){
 return ['color','size'].map(key=>({key,name:p.variants.find(v=>v[key+'Label'])?.[key+'Label']||(key==='color'?'Warna':'Ukuran'),values:[...new Set(p.variants.map(v=>String(v[key]||'')))]})).filter(a=>a.values.some(Boolean));
}
export function matchingVariants(p,selection){return p.variants.filter(v=>pickerAxes(p).every(a=>selection[a.key]==null||String(v[a.key]||'')===selection[a.key]));}
export function selectedVariant(p,selection){
 if(pickerAxes(p).some(a=>selection[a.key]==null))return null;
 const rows=matchingVariants(p,selection);return rows.length===1?rows[0]:null;
}
export function changeSelection(p,selection,key,value,cart){
 const next={...selection,[key]:value};
 // A colour change keeps a size only while that exact combination is available.
 if(key==='color'&&next.size!=null&&!matchingVariants(p,next).some(v=>remaining(p,v,cart)>0))next.size=null;
 return next;
}
export function optionAvailable(p,key,value,selection,cart){
 const filter=key==='color'?{color:value}:{...selection,[key]:value};
 return matchingVariants(p,filter).some(v=>remaining(p,v,cart)>0);
}
export function mergeSelection(cart,product,rows){
 if(!rows.length)throw Error('Pilih varian dan jumlah terlebih dahulu.');
 const next=cart.map(i=>({...i}));
 for(const {variantId,qty}of rows){
  if(!Number.isSafeInteger(qty)||qty<1||qty>10000)throw Error('Jumlah harus bilangan bulat minimal 1.');
  const variant=product.variants.find(v=>v.id===variantId);if(!variant)throw Error('Varian tidak lagi tersedia.');
  const existing=next.find(i=>i.productId===product.id&&i.variantId===variantId);
  if((existing?.qty||0)+qty>variant.stock)throw Error('Jumlah melebihi stok tersedia untuk '+variantLabel(variant)+'.');
  if(existing)existing.qty+=qty;else next.push({productId:product.id,variantId,qty});
 }
 return next;
}
export function pickerQuote({product,rows,cart,products,mode,settings,rates}){
 const next=mergeSelection(cart,product,rows),quote=catalogEstimate(next,products,mode,settings,rates,true);
 return {cart:next,quote,addedTotal:rows.reduce((sum,r)=>sum+r.qty*quote.items.find(i=>i.productId===product.id&&i.variantId===r.variantId).price,0)};
}
export function pickerRange(p,selection,context){
 const values=matchingVariants(p,selection).filter(v=>remaining(p,v,context.cart)>0).map(v=>{
  try{return pickerQuote({...context,product:p,rows:[{variantId:v.id,qty:1}]}).quote.items.find(i=>i.productId===p.id&&i.variantId===v.id).price;}
  catch{return v.pricing?.retail||p.price;}
 });
 return values.length?{min:Math.min(...values),max:Math.max(...values)}:null;
}
