import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 9000;
const STORAGE_DIR = path.resolve('tmp/s3-storage');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const parts = pathname.replace(/^\/+/, '').split('/');
  const bucket = parts[0];
  const key = parts.slice(1).join('/');

  // MinIO health check
  if (pathname === '/minio/health/live' || pathname === '/minio/health/ready') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Bucket existence check (HEAD /bucket)
  if (req.method === 'HEAD' && bucket && !key) {
    res.writeHead(200);
    res.end();
    return;
  }

  // Bucket create (PUT /bucket)
  if (req.method === 'PUT' && bucket && !key) {
    const bucketPath = path.join(STORAGE_DIR, bucket);
    fs.mkdirSync(bucketPath, { recursive: true });
    res.writeHead(200);
    res.end();
    return;
  }

  // Object operations
  if (bucket && key) {
    const filePath = path.join(STORAGE_DIR, bucket, key);

    if (req.method === 'PUT') {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const writeStream = fs.createWriteStream(filePath);
      req.pipe(writeStream);
      writeStream.on('finish', () => {
        res.writeHead(200, { ETag: '"local-s3"' });
        res.end();
      });
      writeStream.on('error', (err) => {
        res.writeHead(500);
        res.end(err.message);
      });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/xml' });
        res.end('<Error><Code>NoSuchKey</Code></Error>');
        return;
      }
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size,
        ETag: '"local-s3"',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }

    if (req.method === 'DELETE') {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.writeHead(204);
      res.end();
      return;
    }
  }

  res.writeHead(200);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local S3 Storage ready on http://127.0.0.1:${PORT}`);
});
