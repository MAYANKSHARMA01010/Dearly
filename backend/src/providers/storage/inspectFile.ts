import { open, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectPdf } from './inspectPdf';
import { ApiError } from '../../utils/ApiError';
const execute = promisify(execFile);
const invalid = () => new ApiError(415, 'ATTACHMENT_TYPE', 'File contents or media limits do not match the selected type.');

export function signatureMatches(data: Buffer, mime: string) {
  if (mime === 'image/png') return data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mime === 'image/webp') return data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (['video/mp4', 'video/quicktime', 'audio/mp4'].includes(mime)) return data.toString('ascii', 4, 8) === 'ftyp';
  if (['video/webm', 'audio/webm'].includes(mime)) return data.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'));
  if (mime === 'audio/wav') return data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE';
  if (mime === 'audio/mpeg') return data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
  if (mime === 'application/pdf') return data.toString('ascii', 0, 5) === '%PDF-';
  return mime === 'text/plain';
}

async function inspectContents(path: string, mime: string, ffprobe: string) {
  const handle = await open(path, 'r');
  const head = Buffer.alloc(32);
  try { await handle.read(head, 0, 32, 0); } finally { await handle.close(); }
  if (!signatureMatches(head, mime)) throw invalid();
  if (mime === 'text/plain' || mime === 'application/pdf') {
    const body = await readFile(path); // Documents alone are bounded to 1/20 MiB.
    if (mime === 'application/pdf') {
      if (!body.subarray(-1024).includes(Buffer.from('%%EOF')) || !await inspectPdf(body)) throw invalid();
    } else {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
        if ([...text].some((char) => { const code = char.charCodeAt(0); return (code < 32 && ![9, 10, 13].includes(code)) || code === 127; })) throw invalid();
      } catch { throw invalid(); }
    }
    return;
  }
  let stdout: string;
  try {
    ({ stdout } = await execute(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist',
      'mov,mp4,m4a,3gp,3g2,mj2,mp3,wav,matroska,webm,png_pipe,jpeg_pipe,webp_pipe,image2',
      '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,duration', '-of', 'json', path],
    { timeout: 10000, maxBuffer: 65536, encoding: 'utf8' }));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') throw new ApiError(503, 'MEDIA_UNAVAILABLE', 'Media validation is unavailable.');
    throw invalid();
  }
  let info: { streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string }[]; format?: { duration?: string } };
  try { info = JSON.parse(stdout) as typeof info; } catch { throw invalid(); }
  const streams = info.streams ?? []; const videos = streams.filter((s) => s.codec_type === 'video'); const audios = streams.filter((s) => s.codec_type === 'audio');
  if (mime.startsWith('image/')) {
    const codec = { 'image/jpeg': 'mjpeg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    const image = videos[0];
    if (videos.length !== 1 || audios.length || !image || image.codec_name !== codec || !image.width || !image.height || image.width > 8192 || image.height > 8192 || image.width * image.height > 20000000) throw invalid();
    return;
  }
  const duration = Number(info.format?.duration ?? streams[0]?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > (mime.startsWith('video/') ? 120 : 300)) throw invalid();
  if (mime.startsWith('audio/')) {
    if (videos.length || audios.length !== 1 || !['aac', 'mp3', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'opus', 'vorbis'].includes(audios[0].codec_name ?? '')) throw invalid();
  } else {
    const video = videos[0];
    if (videos.length !== 1 || !video || !['h264', 'hevc', 'vp8', 'vp9', 'av1'].includes(video.codec_name ?? '') || !video.width || !video.height || video.width > 4096 || video.height > 4096 || video.width * video.height > 10000000) throw invalid();
    if (audios.length > 1 || audios.some((s) => !['aac', 'mp3', 'opus', 'vorbis'].includes(s.codec_name ?? ''))) throw invalid();
  }
}


let activeInspections = 0;
export async function inspectFile(path: string, mime: string, ffprobe: string) {
  if (activeInspections >= 2) throw new ApiError(503, 'MEDIA_UNAVAILABLE', 'Media validation is busy. Try again shortly.');
  activeInspections++;
  try { await inspectContents(path, mime, ffprobe); }
  finally { activeInspections--; }
}
