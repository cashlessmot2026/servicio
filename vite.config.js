import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import zlib from "node:zlib";

// Genera los íconos PNG de la PWA (azul marino con monograma "H" dorado) al compilar.
function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePng(size) {
  const navy = [15, 39, 66], gold = [176, 141, 79];
  const s = size / 512;
  const rects = [[150, 140, 40, 232], [322, 140, 40, 232], [150, 236, 212, 40]];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const inH = rects.some(([rx, ry, rw, rh]) => x >= rx * s && x < (rx + rw) * s && y >= ry * s && y < (ry + rh) * s);
      const c = inH ? gold : navy;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const pwaIcons = () => ({
  name: "pwa-icons",
  generateBundle() {
    for (const size of [192, 512]) {
      this.emitFile({ type: "asset", fileName: `icon-${size}.png`, source: makePng(size) });
    }
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/icon-(192|512)\.png$/.exec(req.url || "");
      if (!m) return next();
      res.setHeader("Content-Type", "image/png");
      res.end(makePng(Number(m[1])));
    });
  },
});

// La app se publica en https://<usuario>.github.io/servicio/
export default defineConfig({ base: "/servicio/", plugins: [react(), pwaIcons()] });
