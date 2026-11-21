import * as FS from 'expo-file-system/legacy';
import {File,Paths} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import {prepareCipherCache} from '../cache/encryption.js';
import {createMediaRepository,migrateMedia} from './mediaRepository.js';
import {createPersistentMedia} from './mediaCache.js';
import {ApiError} from '../../api/client.js';
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
const extensions=/** @type {Record<string,string>} */({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/webm':'webm','application/pdf':'pdf','text/plain':'txt'});
/** @param {{directory?:string,keyName?:string}} [config] */
export function createNativeMediaCache({directory='dearly-downloads-v1',keyName='dearly.media.keys.v1'}={}){
 const root=`${FS.cacheDirectory}${directory}/`,playback=`${FS.cacheDirectory}${directory}-playback/`,temporary=`${FS.cacheDirectory}dearly-media/`;
 const database='index.db';
 const cipherPath=(/** @type {string} */ name)=>{if(!/^[a-f0-9]{64}\.enc(?:\.part)?$/.test(name))throw Error('Invalid private media file');return root+name;};
 const remove=async(/** @type {string} */ file)=>{
  const uri=file.includes('/')?file:cipherPath(file);
  if(!uri.startsWith(playback) && !uri.startsWith(temporary) && !uri.startsWith(root))throw Error('Invalid media cleanup path');
  await FS.deleteAsync(uri,{idempotent:true});
 };
 async function initialize(){
  if(!FS.cacheDirectory)throw new ApiError('Private media storage is unavailable.','configuration');
  await FS.makeDirectoryAsync(root,{intermediates:true});await FS.makeDirectoryAsync(playback,{intermediates:true});
 }
 async function verify(/** @type {Uint8Array} */ bytes,/** @type {string} */ digest,/** @type {number} */ size){
  if(bytes.length!==size)throw new ApiError('Downloaded file size could not be confirmed.','invalid_response');
  const actual=Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(bytes))),b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==digest)throw new ApiError('Downloaded file could not be verified. Open it again.','invalid_response');
 }
 const media=createPersistentMedia({
  async open(){
   await initialize();
   const db=await SQLite.openDatabaseAsync(database,{useNewConnection:true},root);
   try{
    const saved=await SecureStore.getItemAsync(keyName,options);
    const keys=saved?JSON.parse(saved):{sql:Array.from(await Crypto.getRandomBytesAsync(32),b=>b.toString(16).padStart(2,'0')).join(''),files:await (await Crypto.AESEncryptionKey.generate()).encoded('hex')};
    if(!/^[a-f0-9]{64}$/.test(keys.sql) || !/^[a-f0-9]{64}$/.test(keys.files))throw Error('Invalid media key');
    if(!saved)await SecureStore.setItemAsync(keyName,JSON.stringify(keys),options);
    await prepareCipherCache(db,{readKey:async()=>keys.sql,writeKey:async()=>{},randomKey:async()=>keys.sql},migrateMedia);
    const aes=await Crypto.AESEncryptionKey.import(keys.files,'hex');
    return{repository:createMediaRepository(db),close:()=>db.closeAsync(),
     async seal(source,target,digest,size){
      const part=cipherPath(target+'.part');
      try{const bytes=await new File(source).bytes();await verify(bytes,digest,size);
       const sealed=await Crypto.aesEncryptAsync(bytes,aes);const combined=await sealed.combined('bytes');
       await new File(part).write(combined);await FS.moveAsync({from:part,to:cipherPath(target)});return combined.length;
      }finally{await FS.deleteAsync(part,{idempotent:true});}
     },
     async unseal(source,target,digest,size){
      const encoded=await new File(cipherPath(source)).bytes();
      const bytes=await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(encoded),aes);
      await verify(bytes,digest,size);await new File(target).write(bytes);
     },
    };
   }catch{await db.closeAsync().catch(()=>{});throw new ApiError('Downloaded media storage is unavailable. Clear downloaded media in Settings and try again.','configuration');}
  },
  async destroy(){await SecureStore.deleteItemAsync(keyName,options);await FS.deleteAsync(root,{idempotent:true});await FS.deleteAsync(playback,{idempotent:true});},
  exists:async name=>(await FS.getInfoAsync(cipherPath(name))).exists,
  remove,
  async files(){await initialize();return(await FS.readDirectoryAsync(root)).filter(n=>/^[a-f0-9]{64}\.enc(?:\.part)?$/.test(n));},
  async playback(){await initialize();return(await FS.readDirectoryAsync(playback)).map(n=>playback+n);},
  space:async()=>Paths.availableDiskSpace,
  key:value=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value),
  temporary:mime=>playback+Crypto.randomUUID()+'.'+(extensions[mime]??'bin'),
 });
 return {...media,async initialize(){await initialize();for(const file of await FS.readDirectoryAsync(playback))await FS.deleteAsync(playback+file,{idempotent:true});}};
}
export const persistentMedia=createNativeMediaCache();
