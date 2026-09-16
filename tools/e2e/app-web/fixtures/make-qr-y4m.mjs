// Generate a Y4M video fixture containing a Banzami QR, for Chromium
// --use-file-for-fake-video-capture. The QR passes through the real browser
// camera → stream → scanner → decoder → canonical parser (no injection).
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';

const PAYLOAD = process.argv[2] || 'banzami-sandbox://pay/u/ana?amount=500';
const W = 640, H = 480;
const qr = QRCode.create(PAYLOAD, { errorCorrectionLevel: 'M' });
const n = qr.modules.size;
const data = qr.modules.data; // 1 = dark
// scale: fit QR to ~380px, centered, on white, with quiet zone
const scale = Math.floor(380 / n);
const qpx = n * scale;
const ox = Math.floor((W - qpx) / 2), oy = Math.floor((H - qpx) / 2);
const Y = Buffer.alloc(W * H, 255); // white luma
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  if (data[r * n + c]) { // dark module
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const x = ox + c * scale + dx, y = oy + r * scale + dy;
      Y[y * W + x] = 0;
    }
  }
}
const U = Buffer.alloc((W / 2) * (H / 2), 128);
const V = Buffer.alloc((W / 2) * (H / 2), 128);
const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F25:1 Ip A1:1 C420jpeg\n`, 'ascii');
const frame = Buffer.from('FRAME\n', 'ascii');
// A handful of identical frames; Chromium loops the file.
const frames = [];
for (let i = 0; i < 4; i++) frames.push(frame, Y, U, V);
writeFileSync('fixtures/qr.y4m', Buffer.concat([header, ...frames]));
console.log(`wrote fixtures/qr.y4m (${W}x${H}, ${n} modules, scale ${scale}) payload=${PAYLOAD}`);
