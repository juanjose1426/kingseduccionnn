(function(){
'use strict';
const cfg=window.KS_CONFIG;
const LIVE=Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY);
const K='kingseduccion_prod_v1_';
const local=(name,def)=>{try{let v=localStorage.getItem(K+name);return v===null?def:JSON.parse(v)}catch{return def}};
const save=(name,value)=>localStorage.setItem(K+name,JSON.stringify(value));
const clone=x=>JSON.parse(JSON.stringify(x));
const productsDemo=()=>{let p=local('products',null);if(!Array.isArray(p)){p=clone(window.KS_DEMO_PRODUCTS);save('products',p)}return p};
const client=LIVE && window.supabase?.createClient ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY) : null;
const requireClient=()=>{if(!client) throw Error('No se pudo cargar Supabase. Revisa tu conexión, URL y clave pública.')};
const unpack=(res)=>{if(res.error)throw new Error(res.error.message);return res.data};
const str=v=>String(v??'').trim();
const uid=()=>{const d=local('demo_user',null);return d?.id||''};
const isAdminDemo=()=>local('demo_user',null)?.rol==='ADMIN';
let currentUser=null, currentProfile=null;
async function refresh(){
 if(!LIVE){currentUser=local('demo_user',null);currentProfile=currentUser?{...currentUser,puntos:local('demo_points_'+currentUser.id,0)}:null;return currentProfile}
 requireClient();const {data,error}=await client.auth.getUser();if(error&&!/Auth session missing/i.test(error.message))throw Error(error.message);
 currentUser=data.user||null;currentProfile=null;
 if(currentUser){unpack(await client.rpc('ks_ensure_profile'));currentProfile=unpack(await client.from('ks_profiles').select('*').eq('id',currentUser.id).maybeSingle());if(!currentProfile)currentProfile={id:currentUser.id,rol:'CLIENTE',nombre:currentUser.email||'Cliente',puntos:0,email:currentUser.email}}
 return currentProfile;
}
async function login(email,password){if(!LIVE)throw Error('Usa las opciones de acceso de demostración.');requireClient();unpack(await client.auth.signInWithPassword({email,password}));return refresh()}
async function register(nombre,email,password){if(!LIVE)throw Error('Registro real disponible después de configurar Supabase.');requireClient();return unpack(await client.auth.signUp({email,password,options:{data:{nombre},emailRedirectTo:new URL('cuenta.html',location.href).href}}))}
async function reset(email){if(!LIVE)throw Error('Recuperación disponible al conectar Supabase.');return unpack(await client.auth.resetPasswordForEmail(email,{redirectTo:new URL('recuperar.html?cambio=1',location.href).href}))}
async function newPassword(password){if(!LIVE)throw Error('Conecta Supabase para cambiar contraseñas.');return unpack(await client.auth.updateUser({password}))}
async function logout(){if(LIVE){requireClient();unpack(await client.auth.signOut())}else{localStorage.removeItem(K+'demo_user')} currentUser=null;currentProfile=null}
async function loginDemo(role){if(LIVE)throw Error('Acceso de demostración desactivado con Supabase.');const u=role==='ADMIN'?{id:'demo-admin',nombre:'Administrador de prueba',email:'admin@demostracion.local',rol:'ADMIN'}:{id:'demo-client',nombre:'Cliente de prueba',email:'cliente@demostracion.local',rol:'CLIENTE'};save('demo_user',u);return refresh()}
async function getProducts({admin=false}={}){if(!LIVE)return productsDemo().filter(p=>admin||p.activo!==false);requireClient();const all=[];for(let offset=0;offset<12000;offset+=500){let q=client.from('ks_products').select('*').order('created_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+499);if(!admin)q=q.eq('activo',true);const chunk=unpack(await q);all.push(...chunk);if(chunk.length<500)break}return all}
async function getProduct(id){if(!LIVE)return productsDemo().find(p=>p.id===id)||null;requireClient();return unpack(await client.from('ks_products').select('*').eq('id',id).maybeSingle())}
async function saveProduct(p){if(!LIVE){if(!isAdminDemo())throw Error('Entra como administrador de demostración.');let list=productsDemo(),i=list.findIndex(x=>x.id===p.id);let v={...p,id:p.id||'demo-'+Date.now().toString(36),created_at:p.created_at||new Date().toISOString()};if(i>=0){let prev=list[i];list[i]={...prev,...v};if(Number(prev.stock)!==Number(v.stock))await demoMove(v.id,Number(v.stock)-Number(prev.stock),'AJUSTE MANUAL')}else{list.unshift(v);await demoMove(v.id,Number(v.stock),'ALTA PRODUCTO')}save('products',list);return v}
 requireClient();
 if(currentProfile?.rol!=='ADMIN')throw Error('Esta sesión no tiene permiso ADMIN. Cierra sesión y vuelve a ingresar.');
 const allowed=['sku','nombre','marca','genero','familia','precio','precio_detal','precio_mayor','minimo_mayor','stock','notas','descripcion','ocasion','clima','presentacion_ml','concentracion','imagen_url','activo','destacado'];
 const obj=Object.fromEntries(allowed.filter(k=>k in p).map(k=>[k,p[k]]));
 // IMPORTANTE: UPDATE para productos existentes. UPSERT exige también la ruta INSERT,
 // puede generar fallos confusos en PostgREST y ocultar permisos o conflictos de SKU.
 let row;
 if(p.id){
   row=unpack(await client.from('ks_products').update(obj).eq('id',p.id).select('*').maybeSingle());
   if(!row)throw Error('No se actualizó ninguna fila. Verifica que el producto exista y que la sesión siga autorizada.');
 }else{
   row=unpack(await client.from('ks_products').insert(obj).select('*').single());
   if(!row?.id)throw Error('Supabase no confirmó la creación del perfume.');
 }
 // Una confirmación de éxito solo se muestra tras leer de vuelta desde la base real.
 const saved=await getProduct(row.id);
 if(!saved)throw Error('El producto no pudo verificarse tras guardar. Actualiza el panel.');
 const changedFields=['sku','nombre','marca','genero','familia','precio_detal','precio_mayor','minimo_mayor','stock','notas','descripcion','ocasion','clima','presentacion_ml','concentracion','imagen_url','activo','destacado'];
 for(const field of changedFields){
   if(!(field in obj))continue;
   const exp=obj[field],act=saved[field];
   const norm=v=>v==null?'':typeof v==='boolean'?(v?'true':'false'):String(v).trim();
   if(norm(exp)!==norm(act))throw Error('Supabase no conservó el campo '+field+'. Recarga el panel y comprueba las reglas de la base.');
 }
 return saved;
}
async function importProducts(products,onProgress=()=>{}){
 if(!products.length)return 0;
 if(!LIVE){let done=0;for(const p of products){await saveProduct(p);onProgress(++done)}return done}
 requireClient();if(currentProfile?.rol!=='ADMIN')throw Error('No tienes permisos ADMIN para importar.');
 const columns=['sku','nombre','marca','genero','familia','precio','precio_detal','precio_mayor','minimo_mayor','stock','notas','descripcion','ocasion','clima','presentacion_ml','concentracion','imagen_url','activo','destacado'];
 let done=0;
 for(let i=0;i<products.length;i+=40){
  const batch=products.slice(i,i+40).map(p=>Object.fromEntries(columns.filter(k=>k in p).map(k=>[k,p[k]])));
  const result=unpack(await client.from('ks_products').upsert(batch,{onConflict:'sku'}).select('sku'));
  if(!Array.isArray(result)||result.length!==batch.length)throw Error('Supabase no confirmó todos los registros del lote '+(i/40+1)+'.');
  done+=batch.length;onProgress(done);
 }
 return done;
}
async function savePhoto(file,productId){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Selecciona una imagen JPG, PNG o WebP.');if(file.size>(LIVE?4:1)*1024*1024)throw Error(LIVE?'Máximo 4 MB.':'En la demo, máximo 1 MB (límite del almacenamiento local).');
 if(!LIVE)return await new Promise((resolve,reject)=>{let r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('No se pudo leer la fotografía.'));r.readAsDataURL(file)});
 requireClient();const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' })[file.type];const safeId=String(productId||'nuevo').replace(/[^a-z0-9-]/gi,'');const fileName=`${safeId}/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
 unpack(await client.storage.from('kingseduccion-productos').upload(fileName,file,{contentType:file.type,upsert:false}));return client.storage.from('kingseduccion-productos').getPublicUrl(fileName).data.publicUrl}
async function archive(id,activo){if(!LIVE){if(!isAdminDemo())throw Error('Acceso restringido');let list=productsDemo(),p=list.find(x=>x.id===id);if(p)p.activo=activo;save('products',list);return}
 if(currentProfile?.rol!=='ADMIN')throw Error('No tienes permisos ADMIN.');
 const changed=unpack(await client.from('ks_products').update({activo}).eq('id',id).select('id,activo').maybeSingle());
 if(!changed||changed.activo!==activo)throw Error('No se confirmó el cambio de visibilidad en Supabase.');
 return changed;}
async function favorites(){if(!currentUser)return local('favs_anon',[]);if(!LIVE)return local('favs_'+uid(),[]);return unpack(await client.from('ks_favorites').select('product_id').eq('user_id',currentUser.id)).map(f=>f.product_id)}
async function toggleFavorite(id){if(!currentUser){let l=local('favs_anon',[]);l=l.includes(id)?l.filter(x=>x!==id):[...l,id];save('favs_anon',l);return l}
 if(!LIVE){let key='favs_'+uid(),l=local(key,[]);l=l.includes(id)?l.filter(x=>x!==id):[...l,id];save(key,l);return l}
 let l=await favorites();if(l.includes(id))unpack(await client.from('ks_favorites').delete().eq('user_id',currentUser.id).eq('product_id',id));else unpack(await client.from('ks_favorites').insert({user_id:currentUser.id,product_id:id}));return favorites()}
async function getOrders(all=false){if(!LIVE){let os=local('orders',[]);return all&&isAdminDemo()?os:os.filter(o=>o.user_id===uid())}
 requireClient();let q=client.from('ks_orders').select('*,order_items:ks_order_items(*,products:ks_products(nombre,sku,imagen_url))').order('created_at',{ascending:false}).limit(500);if(!all&&currentUser)q=q.eq('user_id',currentUser.id);return unpack(await q)}
async function getOrder(id){id=String(id||'').trim();if(!id)return null;if(!LIVE)return local('orders',[]).find(o=>o.id===id||o.codigo===id)||null;const code=id.replace(/[^a-z0-9-]/gi,'');if(!code)return null;return unpack(await client.from('ks_orders').select('*,order_items:ks_order_items(*,products:ks_products(nombre,sku,imagen_url))').or(`id.eq.${/^[a-f0-9-]{36}$/i.test(id)?id:'00000000-0000-0000-0000-000000000000'},codigo.eq.${code}`).maybeSingle())}
async function demoMove(productId,delta,motivo){const a=local('movements',[]);a.unshift({id:'mov-'+Date.now()+Math.random(),product_id:productId,cantidad:Number(delta),motivo,created_at:new Date().toISOString()});save('movements',a)}
async function placeOrder(items,contact){if(!currentUser)throw Error('Inicia sesión antes de confirmar tu pedido.');if(!items.length)throw Error('Tu carrito está vacío.');
 if(!LIVE){let list=productsDemo(),total=0,rows=[];for(const i of items){let p=list.find(p=>p.id===i.id&&p.activo);if(!p||p.stock<i.cantidad||i.cantidad<1||i.cantidad>20||!Number.isInteger(i.cantidad)||!(Number(p.precio_detal??p.precio)>0))throw Error('Verifica el inventario: '+(p?.nombre||i.id));rows.push({product_id:p.id,cantidad:i.cantidad,precio_unitario:(Number(p.precio_mayor)>0&&i.cantidad>=Number(p.minimo_mayor||6)?Number(p.precio_mayor):Number(p.precio_detal??p.precio)),subtotal:(Number(p.precio_mayor)>0&&i.cantidad>=Number(p.minimo_mayor||6)?Number(p.precio_mayor):Number(p.precio_detal??p.precio))*i.cantidad,products:{nombre:p.nombre,sku:p.sku}});total+=rows[rows.length-1].subtotal;}
 for(const row of rows){let p=list.find(p=>p.id===row.product_id);p.stock-=row.cantidad;await demoMove(p.id,-row.cantidad,'PEDIDO NUEVO')}save('products',list);
 const order={id:'demo-order-'+Date.now().toString(36),codigo:'KS-'+Date.now().toString(36).toUpperCase(),user_id:currentUser.id,nombre:contact.nombre,telefono:contact.telefono,direccion:contact.direccion,ciudad:contact.ciudad,nota:contact.nota||'',estado:'nuevo',total,order_items:rows,created_at:new Date().toISOString(),paid_at:null};let orders=local('orders',[]);orders.unshift(order);save('orders',orders);return {id:order.id,codigo:order.codigo,total}}
 requireClient();const payload=items.map(i=>({product_id:i.id,cantidad:Number(i.cantidad)}));return unpack(await client.rpc('ks_place_order',{p_items:payload,p_contact:contact}))}
async function updateOrder({id,estado,nota,items}){if(!LIVE){if(!isAdminDemo())throw Error('Acceso restringido');let orders=local('orders',[]),o=orders.find(x=>x.id===id);if(!o)throw Error('Pedido inexistente');let list=productsDemo();
 if(Array.isArray(items)&&items.length){if(o.estado!=='nuevo')throw Error('Solo pueden editarse cantidades de pedidos nuevos.');for(const c of items){let row=o.order_items.find(x=>x.product_id===c.product_id);if(!row)throw Error('Producto no pertenece al pedido');let q=Number(c.cantidad),delta=q-row.cantidad,p=list.find(x=>x.id===c.product_id);if(!Number.isInteger(q)||q<1||q>20||!p||p.stock<delta)throw Error('Cantidad inválida o stock insuficiente');}
 for(const c of items){let row=o.order_items.find(x=>x.product_id===c.product_id),p=list.find(x=>x.id===c.product_id),delta=Number(c.cantidad)-row.cantidad;p.stock-=delta;row.cantidad=Number(c.cantidad);row.subtotal=row.cantidad*row.precio_unitario;if(delta)await demoMove(p.id,-delta,'EDICIÓN PEDIDO')}o.total=o.order_items.reduce((s,x)=>s+x.subtotal,0)}
 if(estado&&estado!==o.estado){if((o.estado==='nuevo'&&['pagado','cancelado'].includes(estado))||(o.estado==='pagado'&&estado==='entregado')){if(estado==='cancelado'){for(const row of o.order_items){let p=list.find(x=>x.id===row.product_id);if(p){p.stock+=row.cantidad;await demoMove(p.id,row.cantidad,'CANCELACIÓN')}}}if(estado==='pagado'){o.paid_at=new Date().toISOString();const key='demo_points_'+o.user_id;save(key,local(key,0)+Math.floor(o.total/1000))}o.estado=estado}else throw Error('Transición de estado no permitida')}
 if(nota!==undefined)o.nota=nota;save('products',list);save('orders',orders);return o}
 requireClient();return unpack(await client.rpc('ks_admin_update_order',{p_order_id:id,p_estado:estado||null,p_nota:nota===undefined?null:nota,p_items:Array.isArray(items)?items:[]}))}
async function getMovements(){if(!LIVE)return local('movements',[]);return unpack(await client.from('ks_inventory_movements').select('*,products:ks_products(nombre,sku)').order('created_at',{ascending:false}).limit(500))}
async function getAdminActivity(){if(!LIVE)return [];return unpack(await client.from('ks_admin_activity').select('tipo,detalle,actor_id,created_at').order('created_at',{ascending:false}).limit(200))}
async function getProfiles(){if(!LIVE)return [{id:'demo-admin',nombre:'Administrador de prueba',email:'admin@demostracion.local',rol:'ADMIN',puntos:0},{id:'demo-client',nombre:'Cliente de prueba',email:'cliente@demostracion.local',rol:'CLIENTE',puntos:local('demo_points_demo-client',0)}];return unpack(await client.from('ks_profiles').select('id,nombre,email,rol,puntos,created_at').order('created_at',{ascending:false}).limit(500))}
window.KS_DB={LIVE,client,refresh,login,register,reset,newPassword,logout,loginDemo,getProducts,getProduct,saveProduct,importProducts,savePhoto,archive,favorites,toggleFavorite,getOrders,getOrder,placeOrder,updateOrder,getMovements,getAdminActivity,getProfiles,get user(){return currentUser},get profile(){return currentProfile}};
})();
