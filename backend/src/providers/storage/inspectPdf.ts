import { Worker } from 'node:worker_threads';
// Parsing untrusted PDF objects is isolated from the HTTP event loop and bounded
// in memory/time. Worker output is discarded so parser warnings cannot log content.
export function inspectPdf(bytes: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    const worker = new Worker(`
      const {parentPort,workerData}=require('node:worker_threads');
      const {PDFDocument}=require(workerData.library);
      PDFDocument.load(workerData.bytes,{throwOnInvalidObject:true,updateMetadata:false})
        .then(pdf=>parentPort.postMessage(!pdf.isEncrypted&&pdf.getPageCount()>0&&pdf.getPageCount()<=100))
        .catch(()=>parentPort.postMessage(false));
    `, { eval: true, stdout: true, stderr: true, workerData: { bytes, library: require.resolve('pdf-lib') }, resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 4 } });
    worker.stdout?.resume(); worker.stderr?.resume(); let done = false;
    const finish = (valid: boolean) => { if (done) return; done = true; clearTimeout(timer); void worker.terminate(); resolve(valid); };
    const timer = setTimeout(() => finish(false), 5000); timer.unref();
    worker.once('message', (valid: unknown) => finish(valid === true)); worker.once('error', () => finish(false)); worker.once('exit', () => finish(false));
  });
}
