import { pool } from '../db/pool.js';
import type { DiscoveryItem, DiscoveryQuery } from '../types/discovery.types.js';
type Row={ product_id:string; name:string; brand:string; category:string; description:string; image_url:string|null; variant_id:string; sku:string; gender:string|null; size:string|null; size_system:string|null; color:string|null; color_code:string|null; material:string|null; fit:string|null; style:string|null; attributes:Record<string,unknown>; store_id:string; store_name:string; distance_km:string; price:string; stock_quantity:number; relevance:number; sort_key:string };
const distance=(lat:string,lng:string,alias='s')=>`2*6371*ASIN(SQRT(LEAST(1.0,GREATEST(0.0,POWER(SIN(RADIANS(${alias}.latitude::double precision-${lat}::double precision)/2),2)+COS(RADIANS(${lat}::double precision))*COS(RADIANS(${alias}.latitude::double precision))*POWER(SIN(RADIANS(${alias}.longitude::double precision-${lng}::double precision)/2),2)))))`;
const like=(v:string)=>`%${v.replace(/[\\%_]/g,'\\$&')}%`;
// Common catalogue vocabulary used to segment concatenated queries. Spaced
// queries do not depend on this list; it is only needed for forms such as
// "redkurta" or "cottonshirt" where terms originate in different fields.
const SEARCH_TERMS=['sunglasses','headphones','backpack','wallet','black','white','ivory','brown','green','red','blue','navy','yellow','orange','pink','purple','grey','gray','beige','maroon','cotton','linen','denim','leather','suede','synthetic','blend','stretch','sneaker','sneakers','shoes','shoe','sandals','formal','casual','shirt','tshirt','dress','jeans','trousers','kurta','kurtas','ethnic','wear','bag','bags','handbag','watch','watches','belt','belts','tee','slim','card','essential','oversized','graphic','straight','fit','festive','classic','everyday','premium','men','women','womens','unisex','accessories','fashion','lifestyle','wallets','tops','bottoms','jacket','hoodie','scarf','cap','ring','necklace','earrings'];
function searchTokens(value:string){
  const normalized=value.toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\bt\s+shirt\b/g,'tshirt').trim();
  const parts=normalized.split(/\s+/).filter(Boolean);
  const out:string[]=[];
  for(const part of parts){
    if(part==='blak') { out.push('black'); continue; }
    if(part==='cotn') { out.push('cotton'); continue; }
    let rest=part;
    while(rest){
      const match=SEARCH_TERMS.filter(term=>rest.startsWith(term)).sort((a,b)=>b.length-a.length)[0];
      if(!match){ if(rest.length >= 2) out.push(rest); break; }
      out.push(match==='tee'?'tshirt':match); rest=rest.slice(match.length);
    }
  }
  return [...new Set(out)];
}
const searchableFields=(alias:string)=>[
  `${alias}.name`,`${alias}.description`,`${alias}.brand`,`${alias}.category`,
  `v.sku`,`v.color`,`v.size`,`v.material`,`v.fit`,`v.style`,`v.attributes::text`,
].map((field)=>`regexp_replace(lower(coalesce(${field},'')),'[^a-z0-9]','','g')`);
const spacedFields=(alias:string)=>[
  `${alias}.name`,`${alias}.description`,`${alias}.brand`,`${alias}.category`,
  `v.sku`,`v.color`,`v.size`,`v.material`,`v.fit`,`v.style`,`v.attributes::text`,
].map((field)=>`regexp_replace(lower(coalesce(${field},'')),'[^a-z0-9]+',' ','g')`);
const normalizedDoc=(alias:string)=>`concat_ws(' ',${searchableFields(alias).join(',')})`;
const spacedDoc=(alias:string)=>`regexp_replace(concat_ws(' ',${spacedFields(alias).join(',')}),'(^| )t[ ]+shirt( |$)','\\1tshirt\\2','gi')`;
const tokenDocument=(alias:string,placeholder:string,threshold:string)=>{
  const fields=searchableFields(alias);
  const exact=`(${spacedDoc(alias)} ~* ('(^| )'||${placeholder}||'( |$)') OR (${placeholder}='tshirt' AND ${spacedDoc(alias)} ~* '(^| )t[ ]*shirt( |$)'))`;
  const fuzzy=`EXISTS (SELECT 1 FROM regexp_split_to_table(${spacedDoc(alias)},'\\s+') AS term WHERE length(term)>=length(${placeholder}) AND similarity(term,${placeholder}) >= ${threshold})`;
  return `(${exact} OR ${fuzzy})`;
};
function map(r:Row):DiscoveryItem { return { product:{id:r.product_id,name:r.name,brand:r.brand,category:r.category,description:r.description,images:r.image_url?[r.image_url]:[]}, variant:{id:r.variant_id,sku:r.sku,attributes:{...r.attributes,...Object.fromEntries(Object.entries({gender:r.gender,size:r.size,sizeSystem:r.size_system,color:r.color,colorCode:r.color_code,material:r.material,fit:r.fit,style:r.style}).filter(([,v])=>v!==null))}}, fulfilment:r.store_id?{storeId:r.store_id,storeName:r.store_name,distanceKm:Number(Number(r.distance_km).toFixed(2))}:null, inventory:r.store_id?{price:Number(r.price),availableQuantity:r.stock_quantity,inStock:r.stock_quantity>0}:null }; }
export async function searchDiscovery(q:DiscoveryQuery) {
  if (q.latitude === undefined || q.longitude === undefined) {
    const values: unknown[] = [];
    const where = ['v.is_active'];
    const add = (sql:string,val:unknown) => { values.push(val); where.push(sql.replace('?',`$${values.length}`)); };
    if (q.search) {
      const compact = `%${q.search.trim().replace(/[^a-z0-9]/gi,'').toLowerCase()}%`; values.push(compact); const p=`$${values.length}`;
      const tokens=searchTokens(q.search); const clauses=tokens.map((token)=>{ values.push(token); const t=`$${values.length}`; values.push(token.length<=3?0.7:0.35); return tokenDocument('p',t,`$${values.length}`); });
      where.push(`(${normalizedDoc('p')} LIKE ${p}${clauses.length?` OR (${clauses.join(' AND ')})`:''})`);
    }
    if(q.category){values.push(q.category);where.push(`(c.slug=$${values.length} OR c.parent_id=(SELECT id FROM categories WHERE slug=$${values.length}))`);} if(q.brand)add('p.brand=?',q.brand); if(q.gender)add('v.gender=?',q.gender); if(q.size)add('v.size=?',q.size); if(q.sizeSystem)add('v.size_system=?',q.sizeSystem); if(q.color)add('v.color=?',q.color); if(q.material)add('v.material=?',q.material); if(q.minPrice!==undefined)add('p.price>=?',q.minPrice); if(q.maxPrice!==undefined)add('p.price<=?',q.maxPrice);
    const key=q.sort==='price_asc'||q.sort==='price_desc'?'p.price':'p.name'; const dir=q.sort==='price_desc'?'DESC':'ASC'; let cursor=''; if(q.cursor){values.push(q.cursor.key,q.cursor.productId);cursor=` AND (${key} ${dir==='ASC'?'>':'<'} $${values.length-1} OR (${key}=$${values.length-1} AND p.id>$${values.length}))`;}
    values.push(q.limit+1);
    const globalCursor=cursor.replace(key,'sort_key').replace(/p\.id/g,'product_id');
    const rows=(await pool.query<Row>(`WITH ranked AS (SELECT p.id::text product_id,p.name,p.brand,p.category,p.description,p.image_url,v.id::text variant_id,v.sku,v.gender,v.size,v.size_system,v.color,v.color_code,v.material,v.fit,v.style,v.attributes,NULL::text store_id,NULL::text store_name,NULL::text distance_km,NULL::text price,0::int stock_quantity,0::numeric relevance,${key}::text sort_key,ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY ${key} ${dir},v.id ASC) product_rank FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')}) SELECT * FROM ranked WHERE product_rank=1${globalCursor} ORDER BY sort_key ${dir},product_id::bigint ASC LIMIT $${values.length}`,values)).rows;
    return rows.map(r=>({item:map(r),key:Number(r.sort_key)||0,productId:r.product_id}));
  }
  const vals:unknown[]=[q.latitude,q.longitude,q.maxDistanceKm]; const where=['v.is_active','s.is_active','i.is_available','i.stock_quantity>0',`d.distance_km<=s.delivery_radius_km`,`d.distance_km<=$3`];
  const add=(sql:string,val:unknown)=>{vals.push(val);where.push(sql.replace('?',`$${vals.length}`));};
  let exactSearchPlaceholder='';
  if(q.search){
    const raw = q.search.trim().replace(/\s+/g,' ');
    const rawPlaceholder = `$${vals.length+1}`;
    vals.push(like(raw));
    const tokens=searchTokens(q.search);
    vals.push(`%${raw.replace(/[^a-z0-9]/gi,'').toLowerCase()}%`);
    const normalizedPlaceholder=`$${vals.length}`;
    const tokenClauses=tokens.map((token)=>{ vals.push(token); const p=`$${vals.length}`; vals.push(token.length<=3?0.7:0.35); const threshold=`$${vals.length}`; return tokenDocument('p',p,threshold); });
    where.push(`(${normalizedDoc('p')} LIKE ${normalizedPlaceholder} OR ${tokenClauses.join(' AND ')})`);
    exactSearchPlaceholder=rawPlaceholder;
  }
  if(q.category){vals.push(q.category);where.push(`(c.slug=$${vals.length} OR c.parent_id=(SELECT id FROM categories WHERE slug=$${vals.length}))`);} if(q.brand)add('p.brand=?',q.brand); if(q.gender)add('v.gender=?',q.gender); if(q.size)add('v.size=?',q.size); if(q.sizeSystem)add('v.size_system=?',q.sizeSystem); if(q.color)add('v.color=?',q.color); if(q.material)add('v.material=?',q.material); if(q.minPrice!==undefined)add('i.selling_price>=?',q.minPrice); if(q.maxPrice!==undefined)add('i.selling_price<=?',q.maxPrice); if(q.availability===false) where.push('FALSE');
  const relevance=q.search?`CASE WHEN LOWER(p.name)=LOWER(${exactSearchPlaceholder}) THEN 100 WHEN p.name ILIKE ${exactSearchPlaceholder} ESCAPE '\\' THEN 80 WHEN v.sku ILIKE ${exactSearchPlaceholder} ESCAPE '\\' THEN 70 WHEN p.brand ILIKE ${exactSearchPlaceholder} ESCAPE '\\' THEN 60 ELSE 40 END`:'0';
  const key=q.sort==='price_asc'||q.sort==='price_desc'?'price':q.sort==='nearest'?'distance_km':'relevance'; const dir=q.sort==='price_desc'||q.sort==='relevance'?'DESC':'ASC';
  let cursorPredicate='';
  if(q.cursor){vals.push(q.cursor.key,q.cursor.productId);const a=`$${vals.length-1}`,b=`$${vals.length}`; cursorPredicate=` AND (${key} ${dir==='ASC'?'>':'<'} ${a} OR (${key}=${a} AND product_id::bigint>${b}::bigint))`;}
  vals.push(q.limit+1);
  const sql=`WITH raw AS (SELECT p.id::text product_id,p.name,p.brand,p.category,p.description,p.image_url,v.id::text variant_id,v.sku,v.gender,v.size,v.size_system,v.color,v.color_code,v.material,v.fit,v.style,v.attributes,s.id::text store_id,s.name store_name,d.distance_km,i.selling_price price,i.stock_quantity,${relevance} relevance FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id JOIN store_inventory i ON i.variant_id=v.id JOIN stores s ON s.id=i.store_id CROSS JOIN LATERAL(SELECT ${distance('$1','$2')} distance_km)d WHERE ${where.join(' AND ')}), stores_ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY variant_id ORDER BY distance_km,price,store_id::bigint) rn FROM raw), products_ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY product_id ORDER BY ${key} ${dir},variant_id::bigint) prn,${key}::text sort_key FROM stores_ranked WHERE rn=1) SELECT * FROM products_ranked WHERE prn=1${cursorPredicate} ORDER BY ${key} ${dir},product_id::bigint ASC LIMIT $${vals.length}`;
  const rows=(await pool.query<Row>(sql,vals)).rows; return rows.map(r=>({item:map(r),key:Number(r.sort_key),productId:r.product_id}));
}
export async function getDiscoveryProduct(id:string,latitude:number,longitude:number,maxDistance:number){ const d=distance('$2','$3'); const result=await pool.query<Row>(`SELECT p.id::text product_id,p.name,p.brand,p.category,p.description,p.image_url,v.id::text variant_id,v.sku,v.gender,v.size,v.size_system,v.color,v.color_code,v.material,v.fit,v.style,v.attributes,f.store_id::text,f.store_name,f.distance_km::text,f.price::text,f.stock_quantity,0 relevance,'0' sort_key FROM products p JOIN product_variants v ON v.product_id=p.id AND v.is_active LEFT JOIN LATERAL(SELECT s.id store_id,s.name store_name,${d} distance_km,i.selling_price price,i.stock_quantity FROM store_inventory i JOIN stores s ON s.id=i.store_id WHERE i.variant_id=v.id AND i.is_available AND i.stock_quantity>0 AND s.is_active AND ${d}<=s.delivery_radius_km AND ${d}<=$4 ORDER BY distance_km,i.selling_price,s.id LIMIT 1)f ON TRUE WHERE p.id=$1 ORDER BY v.id`,[id,latitude,longitude,maxDistance]); return result.rows; }
export async function getDiscoveryProductGlobal(id:string){ return (await pool.query<Row>(`SELECT p.id::text product_id,p.name,p.brand,p.category,p.description,p.image_url,v.id::text variant_id,v.sku,v.gender,v.size,v.size_system,v.color,v.color_code,v.material,v.fit,v.style,v.attributes,NULL::text store_id,NULL::text store_name,NULL::text distance_km,NULL::text price,0::int stock_quantity,0 relevance,'0' sort_key FROM products p JOIN product_variants v ON v.product_id=p.id AND v.is_active WHERE p.id=$1 ORDER BY v.id`,[id])).rows; }
export async function listCategories(){ return (await pool.query(`SELECT id::text,parent_id::text,slug,name FROM categories WHERE is_active ORDER BY sort_order,id`)).rows; }
export async function suggestions(search:string,limit:number,latitude:number|undefined,longitude:number|undefined,maxDistance:number){
  const d=distance('$3','$4');
  const raw=search.trim().replace(/\s+/g,' ');
  const values:unknown[]=[like(raw),limit,latitude,longitude,maxDistance];
  const tokens=searchTokens(search);
  values[0]=`%${raw.replace(/[^a-z0-9]/gi,'').toLowerCase()}%`;
  const tokenClauses=tokens.map((token)=>{ values.push(token); const p=`$${values.length}`; values.push(token.length<=3?0.7:0.35); return tokenDocument('p',p,`$${values.length}`); });
  if (latitude === undefined || longitude === undefined) {
    const globalValues: unknown[] = [values[0], values[1]];
    const globalTokenClauses = tokens.map((token) => { globalValues.push(token); const p = `$${globalValues.length}`; globalValues.push(token.length <= 3 ? 0.7 : 0.35); return tokenDocument('p', p, `$${globalValues.length}`); });
    return (await pool.query<{id:string;name:string;brand:string}>(`SELECT p.id::text,p.name,p.brand FROM products p JOIN product_variants v ON v.product_id=p.id WHERE v.is_active AND (${normalizedDoc('p')} LIKE $1 OR ${globalTokenClauses.join(' AND ')}) GROUP BY p.id,p.name,p.brand,p.category ORDER BY CASE WHEN p.name ILIKE $1 THEN 0 WHEN p.brand ILIKE $1 THEN 1 WHEN p.category ILIKE $1 THEN 2 ELSE 3 END,p.id LIMIT $2`,globalValues)).rows;
  }
  return (await pool.query<{id:string;name:string;brand:string}>(`SELECT p.id::text,p.name,p.brand FROM products p JOIN product_variants v ON v.product_id=p.id JOIN store_inventory i ON i.variant_id=v.id JOIN stores s ON s.id=i.store_id WHERE v.is_active AND i.is_available AND i.stock_quantity>0 AND s.is_active AND ${d}<=s.delivery_radius_km AND ${d}<=$5 AND (${normalizedDoc('p')} LIKE $1 OR ${tokenClauses.join(' AND ')}) GROUP BY p.id,p.name,p.brand,p.category ORDER BY CASE WHEN p.name ILIKE $1 THEN 0 WHEN p.brand ILIKE $1 THEN 1 WHEN p.category ILIKE $1 THEN 2 ELSE 3 END,p.id LIMIT $2`,values)).rows;
}
export async function variantStores(variantId:string,lat:number,lng:number,max:number){const d=distance('$2','$3');return (await pool.query(`SELECT s.id::text store_id,s.name store_name,ROUND((${d})::numeric,2)::float8 distance_km,i.selling_price::float8 price,i.stock_quantity FROM store_inventory i JOIN stores s ON s.id=i.store_id WHERE i.variant_id=$1 AND i.is_available AND i.stock_quantity>0 AND s.is_active AND ${d}<=s.delivery_radius_km AND ${d}<=$4 ORDER BY distance_km,price,s.id`,[variantId,lat,lng,max])).rows;}
export async function filterOptions(category?:string){const values:unknown[]=[];const condition=category?`WHERE (c.slug=$1 OR c.parent_id=(SELECT id FROM categories WHERE slug=$1))`:'';if(category)values.push(category);return (await pool.query(`WITH eligible AS (SELECT DISTINCT p.brand,v.gender,v.size,v.size_system,v.color,v.material FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN categories c ON c.id=p.category_id ${condition}) SELECT ARRAY(SELECT DISTINCT brand FROM eligible ORDER BY brand) brands,ARRAY(SELECT DISTINCT gender FROM eligible WHERE gender IS NOT NULL ORDER BY gender) genders,ARRAY(SELECT DISTINCT size FROM eligible WHERE size IS NOT NULL ORDER BY size) sizes,ARRAY(SELECT DISTINCT size_system FROM eligible WHERE size_system IS NOT NULL ORDER BY size_system) size_systems,ARRAY(SELECT DISTINCT color FROM eligible WHERE color IS NOT NULL ORDER BY color) colors,ARRAY(SELECT DISTINCT material FROM eligible WHERE material IS NOT NULL ORDER BY material) materials`,values)).rows[0];}
