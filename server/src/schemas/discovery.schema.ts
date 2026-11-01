import { z } from 'zod';
import { decodeDiscoveryCursor } from '../utils/discovery-cursor.js';
const numeric=(label:string,min:number,max:number)=>z.string().regex(/^-?\d+(?:\.\d+)?$/,`${label} must be a number`).transform(Number).refine(v=>v>=min&&v<=max,`${label} must be between ${min} and ${max}`);
const optionalText=z.string().trim().min(1).max(100).optional();
const sort=z.enum(['relevance','price_asc','price_desc','nearest']).default('relevance');
export const discoveryQuerySchema=z.object({
  latitude:numeric('latitude',-90,90).optional(), longitude:numeric('longitude',-180,180).optional(), search:z.string().trim().max(200).default(''),
  category:optionalText, brand:optionalText, gender:z.enum(['men','women','unisex','kids']).optional(), size:optionalText,
  sizeSystem:optionalText, color:optionalText, material:optionalText, minPrice:numeric('minPrice',0,10000000).optional(),
  maxPrice:numeric('maxPrice',0,10000000).optional(), availability:z.enum(['true','false']).transform(v=>v==='true').optional(),
  maxDistanceKm:numeric('maxDistanceKm',0.1,50).default(10), sort,
  limit:z.string().regex(/^\d+$/).transform(Number).refine(v=>v>=1&&v<=50,'limit must be between 1 and 50').default(20), cursor:z.string().max(1024).optional(),
}).strict().superRefine((v,c)=>{ if((v.latitude===undefined)!==(v.longitude===undefined)) c.addIssue({code:'custom',path:['latitude'],message:'latitude and longitude must be provided together'}); if(v.minPrice!==undefined&&v.maxPrice!==undefined&&v.minPrice>v.maxPrice)c.addIssue({code:'custom',path:['minPrice'],message:'minPrice must be less than or equal to maxPrice'}); if(v.cursor&&!decodeDiscoveryCursor(v.cursor,v.sort))c.addIssue({code:'custom',path:['cursor'],message:'cursor is malformed or does not match sort'}); }).transform(v=>({...v,cursor:v.cursor?decodeDiscoveryCursor(v.cursor,v.sort)??undefined:undefined}));
export const discoveryLocationSchema=z.object({ latitude:numeric('latitude',-90,90), longitude:numeric('longitude',-180,180), maxDistanceKm:numeric('maxDistanceKm',0.1,50).default(10) }).strict();
export const optionalDiscoveryLocationSchema=z.object({ latitude:numeric('latitude',-90,90).optional(), longitude:numeric('longitude',-180,180).optional(), maxDistanceKm:numeric('maxDistanceKm',0.1,50).default(10) }).strict().superRefine((v,c)=>{if((v.latitude===undefined)!==(v.longitude===undefined))c.addIssue({code:'custom',path:['latitude'],message:'latitude and longitude must be provided together'});});
export const suggestionSchema=optionalDiscoveryLocationSchema.extend({ search:z.string().trim().min(2).max(100), limit:z.string().regex(/^\d+$/).transform(Number).refine(v=>v>=1&&v<=20).default(8) }).strict();
export const discoveryFiltersSchema=z.object({category:optionalText}).strict();
export const positiveIdSchema=z.string().regex(/^[1-9]\d*$/,'id must be a positive integer');
