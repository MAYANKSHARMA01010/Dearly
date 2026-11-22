import {randomUUID} from 'node:crypto';
// A single POST, never a network retry. Server journals the UUID for reconciliation.
export async function runOperations({baseUrl,maintenanceToken,monitoringToken,mode='both',fetcher=fetch,runId=randomUUID(),report=()=>{}}){
 const url=new URL(baseUrl);
 if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw Error('INVALID_CONFIGURATION');
 if(!['both','maintenance','monitor'].includes(mode))throw Error('INVALID_CONFIGURATION');
 const summary={maintenance:'not-requested',backend:'not-requested',waha:'not-requested'};
 async function call(path,token,method){
  if(!/^[a-f0-9]{64}$/.test(token??''))throw Error('MISSING_CONFIGURATION');
  const response=await fetcher(new URL(path,url),{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json','X-Operations-Run':runId}:{})},...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(180000),redirect:'error'});
  // Never log response bodies: provider or proxy failures may contain private data.
  if(!response.ok)throw Error(response.status===409?'OPERATIONS_BUSY':'OPERATIONS_UNAVAILABLE');
  const value=await response.json();if(value.success!==true || !value.data)throw Error('INVALID_RESPONSE');return value.data;
 }
 if(mode!=='monitor'){const run=await call('/internal/operations/maintenance',maintenanceToken,'POST');if(run.id!==runId || run.state!=='SUCCEEDED')throw Error('MAINTENANCE_NOT_CONFIRMED');summary.maintenance='succeeded';}
 if(mode!=='maintenance'){
  const result=await call('/internal/operations/status',monitoringToken,'GET');
  summary.backend=result.backend?.database==='ready' && result.backend?.worker==='running' && result.backend?.queueHealthy!==false?'ready':'unavailable';
  summary.waha=result.waha?.status==='READY'?'ready':'unavailable';
  if(summary.backend!=='ready' || summary.waha!=='ready'){report(summary);throw Error('MONITOR_DEGRADED');}
 }
 return summary;
}
if(import.meta.url===new URL(process.argv[1],'file:').href){
 runOperations({baseUrl:process.env.OPERATIONS_API_URL,maintenanceToken:process.env.OPERATIONS_TOKEN,monitoringToken:process.env.MONITORING_TOKEN,mode:process.env.OPERATIONS_MODE??'both',report:result=>console.log(JSON.stringify(result))})
 .then(result=>console.log(JSON.stringify(result)))
 .catch(error=>{const safe=new Set(['INVALID_CONFIGURATION','MISSING_CONFIGURATION','OPERATIONS_BUSY','OPERATIONS_UNAVAILABLE','INVALID_RESPONSE','MAINTENANCE_NOT_CONFIRMED','MONITOR_DEGRADED']);console.error(safe.has(error.message)?error.message:'OPERATIONS_REQUEST_FAILED');process.exitCode=1;});
}
