// ============================================================================
// ESC/POS PRINTING via Web Bluetooth API
// ----------------------------------------------------------------------------
// Hanya berjalan di Chrome/Edge desktop & Android (BUKAN Safari/iOS - Web
// Bluetooth belum didukung Apple), dan HARUS diakses lewat HTTPS atau
// localhost (batasan keamanan browser).
//
// Alur: requestDevice() -> connect GATT -> dapatkan characteristic tulis ->
// kirim byte perintah ESC/POS (bukan HTML/teks biasa).
//
// UUID service di bawah ini adalah UUID UMUM yang dipakai banyak printer
// thermal Bluetooth murah (mis. seri "Goojprt", "Xprinter" BT). Jika printer
// Anda tidak terdeteksi, cek manual/spek printer untuk UUID service-nya yang
// tepat dan ganti nilai PRINTER_SERVICE_UUID & PRINTER_CHARACTERISTIC_UUID.
// ============================================================================

const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

// ============================================================================
// PENGATURAN UKURAN CETAK -- ubah nilai di sini untuk menyesuaikan tampilan struk.
// ============================================================================
// Lebar logo = LOGO_WIDTH_RATIO x lebar kertas. 1.0 = selebar kertas (penuh),
// 0.5 = separuh lebar kertas, dst. Perkecil nilainya kalau logo masih terlalu besar.
const LOGO_WIDTH_RATIO = 0.45;

// Ukuran teks nama toko: 1 = normal, 2 = 2x lipat, 3 = 3x lipat, dst (maks. 8).
// STORE_NAME_WIDTH_MULT mengatur lebar, STORE_NAME_HEIGHT_MULT mengatur tinggi.
// Contoh: {width:1, height:1} = ukuran normal (hanya tebal/bold).
//         {width:1, height:2} = tinggi 2x tapi lebar tetap normal (ramping).
//         {width:2, height:2} = 2x lipat di kedua sisi (besar, tampilan lama).
const STORE_NAME_WIDTH_MULT = 1;
const STORE_NAME_HEIGHT_MULT = 1;

let printerDevice = null;
let printerCharacteristic = null;

export function isPrinterConnected() {
  return !!(printerDevice && printerDevice.gatt.connected);
}

export function getPrinterName() {
  return printerDevice?.name || null;
}

// Membuka dialog pemilihan perangkat Bluetooth bawaan browser.
export async function connectPrinter() {
  if (!navigator.bluetooth) {
    throw new Error('Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome/Edge di Desktop atau Android.');
  }

  printerDevice = await navigator.bluetooth.requestDevice({
    filters: [{ services: [PRINTER_SERVICE_UUID] }],
    optionalServices: [PRINTER_SERVICE_UUID],
  });

  const server = await printerDevice.gatt.connect();
  const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
  printerCharacteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);

  printerDevice.addEventListener('gattserverdisconnected', () => {
    printerCharacteristic = null;
  });

  return printerDevice.name;
}

export function disconnectPrinter() {
  if (printerDevice?.gatt.connected) printerDevice.gatt.disconnect();
  printerDevice = null;
  printerCharacteristic = null;
}

/* --------------------------- ESC/POS COMMAND BUILDER --------------------------- */
// Referensi perintah dasar ESC/POS (standar Epson, didukung hampir semua printer thermal):
//   \x1B \x40        -> reset/initialize printer
//   \x1B \x61 \x00/01/02 -> text align: kiri/tengah/kanan
//   \x1B \x45 \x01/00 -> bold on/off
//   \x1D \x21 n       -> ukuran teks: n = (heightMult-1)<<4 | (widthMult-1), lihat textSize()
//   \x0A              -> line feed (ganti baris)
//   \x1D \x56 \x42 \x00 -> potong kertas (partial cut), tidak semua printer mendukung

class EscposBuilder {
  constructor() { this.bytes = []; this._push([0x1B, 0x40]); } // reset

  _push(arr) { this.bytes.push(...arr); return this; }
  _text(str) { this.bytes.push(...new TextEncoder().encode(str)); return this; }

  align(pos) { const map = { left: 0, center: 1, right: 2 }; return this._push([0x1B, 0x61, map[pos] ?? 0]); }
  bold(on) { return this._push([0x1B, 0x45, on ? 1 : 0]); }
  // widthMult & heightMult: 1 (normal) sampai 8 (8x lipat). Ini menggantikan
  // doubleSize(true/false) lama yang selalu mengalikan 2x di kedua sisi.
  textSize(widthMult = 1, heightMult = 1) {
    const w = Math.min(Math.max(widthMult, 1), 8) - 1;
    const h = Math.min(Math.max(heightMult, 1), 8) - 1;
    return this._push([0x1D, 0x21, (h << 4) | w]);
  }
  line(str = '') { return this._text(str + '\n'); }
  feed(n = 1) { return this._push(new Array(n).fill(0x0A)); }
  divider(width = 32) { return this.line('-'.repeat(width)); }
  cut() { return this._push([0x1D, 0x56, 0x42, 0x00]); }

  // Baris dua kolom rata kiri-kanan (mis. "Nama Produk" ... "Rp10.000"), lebar total mengikuti kertas.
  twoCol(left, right, width = 32) {
    const space = Math.max(1, width - left.length - right.length);
    return this.line(left + ' '.repeat(space) + right);
  }

  // Menyisipkan byte mentah (dipakai untuk data bitmap logo) tanpa lewat _text/_push biasa
  raw(uint8arr) {
    for (let i = 0; i < uint8arr.length; i++) this.bytes.push(uint8arr[i]);
    return this;
  }

  toBytes() { return new Uint8Array(this.bytes); }
}

/* --------------------------- CETAK LOGO (GAMBAR/BITMAP) --------------------------- */
// Printer thermal TIDAK bisa mencetak <img> atau file gambar langsung seperti
// browser. Gambar harus diubah dulu menjadi bitmap hitam-putih (1-bit per
// piksel) dan dikirim memakai perintah ESC/POS raster image "GS v 0".
// Alur: base64 -> <canvas> -> ambil piksel -> dithering ke hitam/putih -> pack jadi byte.

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar logo'));
    img.src = src;
  });
}

// Mengubah Data URL logo menjadi bitmap 1-bit siap cetak, dilebarkan/diperkecil
// ke `maxWidthDots` (lebar kertas dalam dot, BUKAN pixel gambar asli).
// Memakai dithering Floyd-Steinberg supaya logo dengan gradasi/anti-alias
// tetap terlihat wajar walau hasil akhirnya cuma hitam-putih murni (tanpa abu-abu).
async function imageToEscposRaster(dataUrl, maxWidthDots) {
  const img = await loadImageElement(dataUrl);
  const width = Math.min(img.width, maxWidthDots);
  const height = Math.max(1, Math.round(img.height * (width / img.width)));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // latar putih dulu, supaya logo transparan (PNG) tidak jadi hitam pekat saat di-threshold
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldVal = gray[idx];
      const newVal = oldVal < 128 ? 0 : 255; // threshold hitam/putih
      const err = oldVal - newVal;
      gray[idx] = newVal;

      // Sebarkan galat pembulatan ke piksel tetangga (Floyd-Steinberg)
      if (x + 1 < width) gray[idx + 1] += err * 7 / 16;
      if (y + 1 < height) {
        if (x > 0) gray[idx + width - 1] += err * 3 / 16;
        gray[idx + width] += err * 5 / 16;
        if (x + 1 < width) gray[idx + width + 1] += err * 1 / 16;
      }

      if (newVal === 0) { // piksel hitam -> nyalakan bit-nya (MSB-first per byte)
        bitmap[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }

  return { width, height, bytesPerRow, bitmap };
}

// Membungkus bitmap hasil imageToEscposRaster() menjadi perintah ESC/POS "GS v 0"
// (raster bit image, mode normal), format: GS v 0 m xL xH yL yH d1...dk
function buildRasterImageCommand({ bytesPerRow, height, bitmap }) {
  const header = new Uint8Array([
    0x1D, 0x76, 0x30, 0x00,
    bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF, // lebar dalam byte (xL, xH)
    height & 0xFF, (height >> 8) & 0xFF,            // tinggi dalam dot (yL, yH)
  ]);
  const full = new Uint8Array(header.length + bitmap.length);
  full.set(header, 0);
  full.set(bitmap, header.length);
  return full;
}

// Menyusun & mengirim struk dalam format ESC/POS berdasarkan lebar kertas (32 kolom
// untuk 58mm, 48 kolom untuk 80mm - perkiraan umum font default printer thermal).
export async function printReceiptESCPOS(transaction, settings) {
  if (!printerCharacteristic) throw new Error('Printer belum terhubung');

  const width = settings?.receipt_width === '58mm' ? 32 : 48;
  // Lebar kertas dalam DOT (bukan kolom teks) untuk cetak bitmap logo -- perkiraan
  // umum printer thermal 203dpi: 58mm ≈ 384 dot, 80mm ≈ 576 dot.
  const dotWidth = settings?.receipt_width === '58mm' ? 384 : 576;
  const b = new EscposBuilder();

  if (settings.logo_base64) {
    try {
      const logoWidthDots = Math.round(dotWidth * LOGO_WIDTH_RATIO);
      const raster = await imageToEscposRaster(settings.logo_base64, logoWidthDots);
      b.align('center').raw(buildRasterImageCommand(raster)).feed(1);
    } catch (err) {
      // Logo gagal diproses (mis. format tidak didukung) -> lanjutkan cetak tanpa logo,
      // jangan sampai seluruh struk gagal cetak hanya karena masalah logo.
      console.warn('Gagal mencetak logo ESC/POS:', err);
    }
  }

  b.align('center').bold(true).textSize(STORE_NAME_WIDTH_MULT, STORE_NAME_HEIGHT_MULT).line(settings.store_name).textSize(1, 1).bold(false);
  if (settings.address) b.line(settings.address);
  if (settings.phone) b.line(settings.phone);
  b.divider(width);

  b.align('left');
  b.line(`No: ${transaction.code}`);
  b.line(new Date(transaction.created_at).toLocaleString('id-ID'));
  b.line(`Kasir: ${transaction.profiles?.full_name || '-'}`);
  if (transaction.customer_name) b.line(`Pelanggan: ${transaction.customer_name}`);
  b.divider(width);

  transaction.transaction_items.forEach(item => {
    b.line(item.product_name);
    b.twoCol(`${item.qty} x ${item.price.toLocaleString('id-ID')}`, (item.qty * item.price).toLocaleString('id-ID'), width);
  });
  b.divider(width);

  b.twoCol('Subtotal', transaction.subtotal.toLocaleString('id-ID'), width);
  if (transaction.discount_amount > 0) b.twoCol(`Diskon (${transaction.discount_percent}%)`, '-' + transaction.discount_amount.toLocaleString('id-ID'), width);
  if (transaction.tax_amount > 0) b.twoCol(`Pajak (${transaction.tax_percent}%)`, transaction.tax_amount.toLocaleString('id-ID'), width);
  b.bold(true);
  b.twoCol('TOTAL', transaction.total.toLocaleString('id-ID'), width);
  b.bold(false);
  b.twoCol('Bayar', transaction.paid.toLocaleString('id-ID'), width);
  b.twoCol('Kembali', transaction.change.toLocaleString('id-ID'), width);
  b.twoCol('Metode', transaction.payment_method === 'qris' ? 'QRIS' : 'Tunai', width);
  b.divider(width);

  b.align('center').line(settings.footer_note || '');
  b.feed(3);
  b.cut();

  await sendBytes(b.toBytes());
}

// Web Bluetooth membatasi ukuran setiap paket tulis (biasanya ~20 byte per write
// tergantung MTU), jadi data dikirim bertahap per potongan kecil.
async function sendBytes(bytes) {
  const CHUNK_SIZE = 180;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    await printerCharacteristic.writeValue(chunk);
  }
}
