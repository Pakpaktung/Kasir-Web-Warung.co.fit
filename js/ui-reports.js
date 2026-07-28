// ============================================================================
// UI: LAPORAN PENJUALAN (Dashboard Analytics)
// Mengambil transaksi dalam rentang tanggal terpilih, lalu mengagregasi
// (total omzet, jumlah transaksi, produk terlaris) di sisi client, dan
// menggambar grafik tren penjualan harian memakai Chart.js (CDN).
// ============================================================================

import * as api from './api.js';
import { formatRupiah, showToast } from './utils.js';

let chartInstance = null; // simpan referensi agar chart lama dihancurkan sebelum digambar ulang

export async function renderReports() {
  const container = document.getElementById('tab-reports');
  container.innerHTML = `
    <h2 class="text-xl font-bold text-slate-800 mb-4">Laporan Penjualan</h2>

    <div class="flex gap-2 mb-4 overflow-x-auto pb-1">
      ${['today', '7d', '30d', 'month'].map(key => `
        <button data-range="${key}" class="report-range-btn shrink-0 px-4 py-2 rounded-full text-sm font-medium border touch-target
          ${key === 'today' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'}">
          ${{ today: 'Hari Ini', '7d': '7 Hari Terakhir', '30d': '30 Hari Terakhir', month: 'Bulan Ini' }[key]}
        </button>
      `).join('')}
    </div>

    <div id="report-content" class="space-y-4">
      <div class="text-center text-slate-400 py-10 text-sm">Memuat laporan...</div>
    </div>
  `;

  container.querySelectorAll('.report-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.report-range-btn').forEach(b => b.classList.remove('bg-brand-600', 'text-white', 'border-brand-600'));
      btn.classList.add('bg-brand-600', 'text-white', 'border-brand-600');
      loadAndRenderReport(btn.dataset.range);
    });
  });

  loadAndRenderReport('today');
}

function getDateRange(rangeKey) {
  const now = new Date();
  const to = new Date(now);
  let from = new Date(now);

  if (rangeKey === 'today') from.setHours(0, 0, 0, 0);
  else if (rangeKey === '7d') from.setDate(from.getDate() - 6);
  else if (rangeKey === '30d') from.setDate(from.getDate() - 29);
  else if (rangeKey === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { fromISO: from.toISOString(), toISO: to.toISOString(), from, to };
}

async function loadAndRenderReport(rangeKey) {
  const contentEl = document.getElementById('report-content');
  const { fromISO, toISO, from, to } = getDateRange(rangeKey);

  let transactions = [];
  try {
    transactions = await api.fetchTransactionsForReport(fromISO, toISO);
  } catch (err) {
    contentEl.innerHTML = `<div class="text-center text-red-400 py-10 text-sm">Gagal memuat laporan: ${err.message}</div>`;
    return;
  }

  const totalOmzet = transactions.reduce((sum, t) => sum + Number(t.total), 0);
  const jumlahTransaksi = transactions.length;
  const rataRata = jumlahTransaksi ? totalOmzet / jumlahTransaksi : 0;

  // Agregasi produk terlaris berdasarkan total quantity terjual di rentang ini
  const productSales = {};
  transactions.forEach(t => {
    (t.transaction_items || []).forEach(item => {
      if (!productSales[item.product_name]) productSales[item.product_name] = { qty: 0, revenue: 0 };
      productSales[item.product_name].qty += item.qty;
      productSales[item.product_name].revenue += item.qty * Number(item.price);
    });
  });
  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5);

  // Agregasi omzet per hari (untuk grafik tren)
  const dailyMap = {};
  transactions.forEach(t => {
    const day = t.created_at.slice(0, 10); // YYYY-MM-DD
    dailyMap[day] = (dailyMap[day] || 0) + Number(t.total);
  });
  const dayLabels = buildDayLabels(from, to);
  const dailyValues = dayLabels.map(d => dailyMap[d] || 0);

  contentEl.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="bg-white rounded-2xl border border-slate-200 p-4">
        <p class="text-xs text-slate-400 mb-1">Total Omzet</p>
        <p class="text-2xl font-extrabold text-brand-700 font-mono-num">${formatRupiah(totalOmzet)}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4">
        <p class="text-xs text-slate-400 mb-1">Jumlah Transaksi</p>
        <p class="text-2xl font-extrabold text-slate-800 font-mono-num">${jumlahTransaksi}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4">
        <p class="text-xs text-slate-400 mb-1">Rata-rata / Transaksi</p>
        <p class="text-2xl font-extrabold text-slate-800 font-mono-num">${formatRupiah(rataRata)}</p>
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-slate-200 p-4">
      <p class="text-sm font-bold text-slate-700 mb-3">Tren Penjualan</p>
      <div class="h-56"><canvas id="sales-chart"></canvas></div>
    </div>

    <div class="bg-white rounded-2xl border border-slate-200 p-4">
      <p class="text-sm font-bold text-slate-700 mb-3">🏆 Produk Terlaris</p>
      ${topProducts.length === 0 ? `<p class="text-sm text-slate-400 text-center py-4">Belum ada penjualan pada rentang ini.</p>` : `
        <div class="space-y-2">
          ${topProducts.map(([name, d], i) => `
            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-5 h-5 rounded-full bg-brand-50 text-brand-600 text-xs font-bold flex items-center justify-center shrink-0">${i + 1}</span>
                <span class="truncate">${name}</span>
              </div>
              <div class="text-right shrink-0 ml-2">
                <span class="font-mono-num font-semibold">${d.qty} terjual</span>
                <span class="text-xs text-slate-400 block">${formatRupiah(d.revenue)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;

  drawChart(dayLabels, dailyValues);
}

function buildDayLabels(from, to) {
  const labels = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    labels.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
}

function drawChart(labels, values) {
  const canvas = document.getElementById('sales-chart');
  if (!canvas || typeof Chart === 'undefined') return; // Chart.js belum termuat (lihat CDN di index.html)

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels.map(d => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })),
      datasets: [{
        label: 'Omzet',
        data: values,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79,70,229,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: (v) => 'Rp' + (v / 1000) + 'rb' } },
      },
    },
  });
}
