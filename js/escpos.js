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
//   \x1D \x21 \x11    -> ukuran teks 2x (lebar & tinggi)
//   \x1D \x21 \x00    -> ukuran teks normal
//   \x0A              -> line feed (ganti baris)
//   \x1D \x56 \x42 \x00 -> potong kertas (partial cut), tidak semua printer mendukung

class EscposBuilder {
  constructor() { this.bytes = []; this._push([0x1B, 0x40]); } // reset

  _push(arr) { this.bytes.push(...arr); return this; }
  _text(str) { this.bytes.push(...new TextEncoder().encode(str)); return this; }

  align(pos) { const map = { left: 0, center: 1, right: 2 }; return this._push([0x1B, 0x61, map[pos] ?? 0]); }
  bold(on) { return this._push([0x1B, 0x45, on ? 1 : 0]); }
  doubleSize(on) { return this._push([0x1D, 0x21, on ? 0x11 : 0x00]); }
  line(str = '') { return this._text(str + '\n'); }
  feed(n = 1) { return this._push(new Array(n).fill(0x0A)); }
  divider(width = 32) { return this.line('-'.repeat(width)); }
  cut() { return this._push([0x1D, 0x56, 0x42, 0x00]); }

  // Baris dua kolom rata kiri-kanan (mis. "Nama Produk" ... "Rp10.000"), lebar total mengikuti kertas.
  twoCol(left, right, width = 32) {
    const space = Math.max(1, width - left.length - right.length);
    return this.line(left + ' '.repeat(space) + right);
  }

  toBytes() { return new Uint8Array(this.bytes); }
}

// Menyusun & mengirim struk dalam format ESC/POS berdasarkan lebar kertas (32 kolom
// untuk 58mm, 48 kolom untuk 80mm - perkiraan umum font default printer thermal).
export async function printReceiptESCPOS(transaction, settings) {
  if (!printerCharacteristic) throw new Error('Printer belum terhubung');

  const width = settings?.receipt_width === '58mm' ? 32 : 48;
  const b = new EscposBuilder();

  b.align('center').bold(true).doubleSize(true).line(settings.store_name).doubleSize(false).bold(false);
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
