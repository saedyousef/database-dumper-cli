import fs from 'fs-extra';
import https from 'https';
import { URL } from 'url';
import path from 'path';

export interface DownloadProgress {
  received: number;
  total?: number;
}

export type ProgressHandler = (progress: DownloadProgress) => void;

const MAX_REDIRECTS = 5;

export async function downloadToFile(urlStr: string, destination: string, onProgress?: ProgressHandler): Promise<void> {
  const dir = path.dirname(destination);
  await fs.ensureDir(dir);
  const url = new URL(urlStr);
  await new Promise<void>((resolve, reject) => {
    const request = (currentUrl: URL, redirects = 0) => {
      const req = https.get(currentUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error('Too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, currentUrl);
          req.destroy();
          request(next, redirects + 1);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers['content-length']);
        let received = 0;
        const file = fs.createWriteStream(destination);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) onProgress({ received, total: Number.isFinite(total) ? total : undefined });
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      });
      req.on('error', reject);
    };
    request(url);
  });
}
