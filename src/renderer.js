let config = {
  adult_ticket_price: 8,
  adult_door_price: 10,
  child_ticket_price: 5,
  child_door_price: 6,
  batch_idle_seconds: 5,
};

let batch = {
  adult_ticket: 0,
  adult_door: 0,
  child_ticket: 0,
  child_door: 0,
};

let saveTimer = null;
let ringTimer = null;
let saveDeadline = 0;
let visitorsTodayCount = 0;
let statsPressTimer = null;

let visitorsChart = null;
let salesChart = null;
let profitChart = null;

let statsSourceFile = 'visits.csv';

const statusEl = document.getElementById('status');
const gridEl = document.getElementById('button-grid');
const statsHoldBarEl = document.getElementById('stats-hold-bar');
const totalVisitorsEl = document.getElementById('total-visitors');
const totalVisitorsTodayEl = document.getElementById('total-visitors-today');
const totalSalesEl = document.getElementById('total-sales');

const statsGroupingEl = document.getElementById('stats-grouping');
const statsGroupingNoteEl = document.getElementById('stats-grouping-note');
const statsFileSelectEl = document.getElementById('stats-file-select');
const statsLoadFileBtnEl = document.getElementById('stats-load-file');
const statsOverwriteActiveBtnEl = document.getElementById('stats-overwrite-active');
const statsAppendActiveBtnEl = document.getElementById('stats-append-active');
const statsResetActiveBtnEl = document.getElementById('stats-reset-active');

function totalVisitors() {
  return batch.adult_ticket + batch.adult_door + batch.child_ticket + batch.child_door;
}

function totalSales() {
  return (
    batch.adult_door * config.adult_door_price +
    batch.child_door * config.child_door_price
  );
}

function updateDisplay() {
  document.getElementById('count-adult_ticket').textContent = String(batch.adult_ticket);
  document.getElementById('count-adult_door').textContent = String(batch.adult_door);
  document.getElementById('count-child_ticket').textContent = String(batch.child_ticket);
  document.getElementById('count-child_door').textContent = String(batch.child_door);

  document.getElementById('batch-ind-adult_ticket').textContent = String(batch.adult_ticket);
  document.getElementById('batch-ind-adult_door').textContent = String(batch.adult_door);
  document.getElementById('batch-ind-child_ticket').textContent = String(batch.child_ticket);
  document.getElementById('batch-ind-child_door').textContent = String(batch.child_door);

  totalVisitorsEl.textContent = `Current Batch Visitors: ${totalVisitors()}`;
  totalVisitorsTodayEl.textContent = `Visitors Today: ${visitorsTodayCount}`;
  totalSalesEl.textContent = `Current Batch Sales: $${totalSales().toFixed(2)}`;
}

function getTodayPrefix() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function refreshVisitorsToday() {
  const rows = await window.trackerApi.readVisits();
  const todayPrefix = getTodayPrefix();
  visitorsTodayCount = rows
    .filter((row) => String(row.timestamp || '').startsWith(todayPrefix))
    .reduce((sum, row) => sum + Number(row.total_visitors || 0), 0);
}

function setRingProgress(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  gridEl.style.setProperty('--ring-progress', clamped.toFixed(4));
}

function getBatchIdleMs() {
  const parsedSeconds = Number(config.batch_idle_seconds);
  const idleSeconds = Number.isFinite(parsedSeconds) ? parsedSeconds : 5;
  return Math.max(1, Math.min(120, Math.round(idleSeconds))) * 1000;
}

function startRingCountdown() {
  const idleMs = getBatchIdleMs();
  saveDeadline = Date.now() + idleMs;
  setRingProgress(1);
  gridEl.classList.add('pending');

  if (ringTimer) {
    clearInterval(ringTimer);
  }

  ringTimer = setInterval(() => {
    const remaining = Math.max(0, saveDeadline - Date.now());
    const progress = remaining / idleMs;
    setRingProgress(progress);
    if (remaining <= 0) {
      clearInterval(ringTimer);
      ringTimer = null;
    }
  }, 40);
}

function stopRingCountdown() {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  setRingProgress(0);
  gridEl.classList.remove('pending');
}

function armSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  const idleSeconds = Math.round(getBatchIdleMs() / 1000);
  statusEl.textContent = `Batch pending save... waiting ${idleSeconds}s of inactivity.`;
  startRingCountdown();

  saveTimer = setTimeout(() => {
    commitBatch();
  }, getBatchIdleMs());
}

function adjustCount(key, delta) {
  const next = Math.max(0, batch[key] + delta);
  batch[key] = next;
  updateDisplay();
  armSaveTimer();
}

function resetBatch() {
  batch = {
    adult_ticket: 0,
    adult_door: 0,
    child_ticket: 0,
    child_door: 0,
  };
  updateDisplay();
}

async function commitBatch() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const visitors = totalVisitors();
  const sales = totalSales();

  if (visitors <= 0) {
    statusEl.textContent = 'No pending batch to save.';
    stopRingCountdown();
    return;
  }

  const timestamp = formatLocalTimestamp(new Date());

  const payload = {
    timestamp,
    adult_ticket_count: batch.adult_ticket,
    adult_door_count: batch.adult_door,
    child_ticket_count: batch.child_ticket,
    child_door_count: batch.child_door,
    adult_ticket_price: Number(config.adult_ticket_price).toFixed(2),
    adult_door_price: Number(config.adult_door_price).toFixed(2),
    child_ticket_price: Number(config.child_ticket_price).toFixed(2),
    child_door_price: Number(config.child_door_price).toFixed(2),
    total_visitors: visitors,
    total_sales: Number(sales).toFixed(2),
  };

  await window.trackerApi.appendVisit(payload);
  visitorsTodayCount += visitors;
  resetBatch();
  stopRingCountdown();
  statusEl.textContent = `Saved batch at ${timestamp}: ${visitors} visitors, $${sales.toFixed(2)}.`;
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');

  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
  if (viewId === 'view-main') {
    document.getElementById('show-main').classList.add('active');
  }
  if (viewId === 'view-config') {
    document.getElementById('show-config').classList.add('active');
  }
}

function fillConfigForm() {
  document.getElementById('cfg-adult_ticket_price').value = Number(config.adult_ticket_price).toFixed(2);
  document.getElementById('cfg-adult_door_price').value = Number(config.adult_door_price).toFixed(2);
  document.getElementById('cfg-child_ticket_price').value = Number(config.child_ticket_price).toFixed(2);
  document.getElementById('cfg-child_door_price').value = Number(config.child_door_price).toFixed(2);
  document.getElementById('cfg-batch_idle_seconds').value = String(Math.round(getBatchIdleMs() / 1000));
}

async function saveConfigFromForm() {
  const next = {
    adult_ticket_price: Number(document.getElementById('cfg-adult_ticket_price').value || 0),
    adult_door_price: Number(document.getElementById('cfg-adult_door_price').value || 0),
    child_ticket_price: Number(document.getElementById('cfg-child_ticket_price').value || 0),
    child_door_price: Number(document.getElementById('cfg-child_door_price').value || 0),
    batch_idle_seconds: Number(document.getElementById('cfg-batch_idle_seconds').value || 0),
  };

  if (
    Number.isNaN(next.adult_ticket_price) || next.adult_ticket_price < 0 ||
    Number.isNaN(next.adult_door_price) || next.adult_door_price < 0 ||
    Number.isNaN(next.child_ticket_price) || next.child_ticket_price < 0 ||
    Number.isNaN(next.child_door_price) || next.child_door_price < 0 ||
    Number.isNaN(next.batch_idle_seconds) || next.batch_idle_seconds < 1
  ) {
    statusEl.textContent = 'Config save failed: prices must be non-negative and delay must be at least 1 second.';
    return;
  }

  config = await window.trackerApi.saveConfig(next);
  updateDisplay();
  fillConfigForm();
  statusEl.textContent = 'Prices updated and saved to config.json.';
}

async function backupAndClearData() {
  const confirmed = window.confirm(
    'Backup and clear active data now?\n\nA timestamped backup CSV will be created, then visits.csv will be reset.'
  );
  if (!confirmed) {
    return;
  }

  const result = await window.trackerApi.backupAndClearData();
  await refreshVisitorsToday();
  updateDisplay();

  if (document.getElementById('view-stats')?.classList.contains('active')) {
    await refreshStatsFileOptions();
    await refreshStats();
  }

  statusEl.textContent = `Data backed up to ${result.backupFileName} and active data cleared.`;
}

function destroyCharts() {
  if (visitorsChart) {
    visitorsChart.destroy();
    visitorsChart = null;
  }
  if (salesChart) {
    salesChart.destroy();
    salesChart = null;
  }
  if (profitChart) {
    profitChart.destroy();
    profitChart = null;
  }
}

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function parseLocalTimestamp(value) {
  const text = String(value || '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  return new Date(year, month, day, hour, minute, second);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function floorToBucket(date, mode) {
  const copy = new Date(date.getTime());

  if (mode === 'day') {
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  if (mode === 'hour') {
    copy.setMinutes(0, 0, 0);
    return copy;
  }

  if (mode === '15m') {
    const minutes = copy.getMinutes();
    copy.setMinutes(Math.floor(minutes / 15) * 15, 0, 0);
    return copy;
  }

  return copy;
}

function formatBucketLabel(date, mode) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());

  if (mode === 'day') {
    return `${year}-${month}-${day}`;
  }

  if (mode === 'hour') {
    return `${year}-${month}-${day} ${hour}:00`;
  }

  if (mode === '15m') {
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function pickAutoGrouping(rowCount) {
  if (rowCount > 600) {
    return 'day';
  }
  if (rowCount > 250) {
    return 'hour';
  }
  if (rowCount > 80) {
    return '15m';
  }
  return 'raw';
}

function getRevenueParts(row) {
  const adultTicketCount = Number(row.adult_ticket_count || 0);
  const adultDoorCount = Number(row.adult_door_count || 0);
  const childTicketCount = Number(row.child_ticket_count || 0);
  const childDoorCount = Number(row.child_door_count || 0);
  const adultTicketPrice = Number(row.adult_ticket_price || 0);
  const adultDoorPrice = Number(row.adult_door_price || 0);
  const childTicketPrice = Number(row.child_ticket_price || 0);
  const childDoorPrice = Number(row.child_door_price || 0);

  return {
    ticket_revenue: adultTicketCount * adultTicketPrice + childTicketCount * childTicketPrice,
    door_revenue: adultDoorCount * adultDoorPrice + childDoorCount * childDoorPrice,
  };
}

function aggregateRows(rows, mode) {
  if (mode === 'raw') {
    return rows.map((row) => ({
      ...row,
      ...getRevenueParts(row),
    }));
  }

  const buckets = new Map();

  rows.forEach((row) => {
    const date = parseLocalTimestamp(row.timestamp);
    if (!date) {
      return;
    }

    const bucketDate = floorToBucket(date, mode);
    const key = bucketDate.getTime();
    if (!buckets.has(key)) {
      buckets.set(key, {
        _date: bucketDate,
        timestamp: formatBucketLabel(bucketDate, mode),
        adult_ticket_count: 0,
        adult_door_count: 0,
        child_ticket_count: 0,
        child_door_count: 0,
        total_visitors: 0,
        total_sales: 0,
        ticket_revenue: 0,
        door_revenue: 0,
      });
    }

    const bucket = buckets.get(key);
    const revenueParts = getRevenueParts(row);
    bucket.adult_ticket_count += Number(row.adult_ticket_count || 0);
    bucket.adult_door_count += Number(row.adult_door_count || 0);
    bucket.child_ticket_count += Number(row.child_ticket_count || 0);
    bucket.child_door_count += Number(row.child_door_count || 0);
    bucket.total_visitors += Number(row.total_visitors || 0);
    bucket.total_sales += Number(row.total_sales || 0);
    bucket.ticket_revenue += revenueParts.ticket_revenue;
    bucket.door_revenue += revenueParts.door_revenue;
  });

  return Array.from(buckets.values())
    .sort((a, b) => a._date - b._date)
    .map((bucket) => {
      const { _date, ...rest } = bucket;
      return rest;
    });
}

function updateStatsSummary(rows) {
  const totals = rows.reduce((acc, row) => {
    const adultTicketCount = Number(row.adult_ticket_count || 0);
    const adultDoorCount = Number(row.adult_door_count || 0);
    const childTicketCount = Number(row.child_ticket_count || 0);
    const childDoorCount = Number(row.child_door_count || 0);
    const visitors = Number(row.total_visitors || 0);

    const revenue = getRevenueParts(row);

    acc.ticketRevenue += revenue.ticket_revenue;
    acc.doorRevenue += revenue.door_revenue;
    acc.totalVisitors += visitors;
    acc.totalBatches += 1;
    acc.adultsTicket += adultTicketCount;
    acc.adultsDoor += adultDoorCount;
    acc.kidsTicket += childTicketCount;
    acc.kidsDoor += childDoorCount;

    if (visitors > acc.peakBatchVisitors) {
      acc.peakBatchVisitors = visitors;
      acc.peakBatchTime = String(row.timestamp || 'N/A');
    }

    const hourKey = String(row.timestamp || '').slice(0, 13);
    if (hourKey.length === 13) {
      acc.hourBuckets[hourKey] = (acc.hourBuckets[hourKey] || 0) + visitors;
    }

    return acc;
  }, {
    ticketRevenue: 0,
    doorRevenue: 0,
    totalVisitors: 0,
    totalBatches: 0,
    adultsTicket: 0,
    adultsDoor: 0,
    kidsTicket: 0,
    kidsDoor: 0,
    peakBatchVisitors: 0,
    peakBatchTime: 'N/A',
    hourBuckets: {},
  });

  let busiestHour = 'N/A';
  let busiestHourVisitors = -1;
  Object.entries(totals.hourBuckets).forEach(([hour, visitors]) => {
    if (visitors > busiestHourVisitors) {
      busiestHourVisitors = visitors;
      busiestHour = `${hour}:00`;
    }
  });

  const overallRevenue = totals.ticketRevenue + totals.doorRevenue;
  const avgBatch = totals.totalBatches > 0 ? (totals.totalVisitors / totals.totalBatches) : 0;
  const adultsTotal = totals.adultsTicket + totals.adultsDoor;
  const kidsTotal = totals.kidsTicket + totals.kidsDoor;

  document.getElementById('stat-door-revenue').textContent = currency(totals.doorRevenue);
  document.getElementById('stat-ticket-revenue').textContent = currency(totals.ticketRevenue);
  document.getElementById('stat-overall-revenue').textContent = currency(overallRevenue);
  document.getElementById('stat-total-visitors').textContent = String(totals.totalVisitors);
  document.getElementById('stat-adults-ticket').textContent = String(totals.adultsTicket);
  document.getElementById('stat-adults-door').textContent = String(totals.adultsDoor);
  document.getElementById('stat-adults-total').textContent = String(adultsTotal);
  document.getElementById('stat-kids-ticket').textContent = String(totals.kidsTicket);
  document.getElementById('stat-kids-door').textContent = String(totals.kidsDoor);
  document.getElementById('stat-kids-total').textContent = String(kidsTotal);
  document.getElementById('stat-total-batches').textContent = String(totals.totalBatches);
  document.getElementById('stat-avg-batch').textContent = avgBatch.toFixed(2);
  document.getElementById('stat-busiest-hour').textContent = busiestHour;
  document.getElementById('stat-peak-batch').textContent = totals.peakBatchVisitors > 0
    ? `${totals.peakBatchVisitors} @ ${totals.peakBatchTime}`
    : 'N/A';
}

async function refreshStatsFileOptions() {
  if (!statsFileSelectEl) {
    return;
  }

  const files = await window.trackerApi.listDataFiles();
  const previous = statsSourceFile;
  statsFileSelectEl.innerHTML = '';

  files.forEach((file) => {
    const option = document.createElement('option');
    option.value = file.name;
    option.textContent = file.isActive ? `${file.name} (active)` : file.name;
    statsFileSelectEl.appendChild(option);
  });

  const availableNames = files.map((f) => f.name);
  if (availableNames.includes(previous)) {
    statsSourceFile = previous;
  } else if (availableNames.includes('visits.csv')) {
    statsSourceFile = 'visits.csv';
  } else if (availableNames.length > 0) {
    statsSourceFile = availableNames[0];
  }

  statsFileSelectEl.value = statsSourceFile;
  const isActiveSelected = statsSourceFile === 'visits.csv';
  if (statsOverwriteActiveBtnEl) {
    statsOverwriteActiveBtnEl.disabled = isActiveSelected;
  }
  if (statsAppendActiveBtnEl) {
    statsAppendActiveBtnEl.disabled = isActiveSelected;
  }
}

async function readStatsRowsFromSelectedSource() {
  if (statsSourceFile === 'visits.csv') {
    return window.trackerApi.readVisits();
  }
  return window.trackerApi.readVisitsFromFile(statsSourceFile);
}

async function loadStatsFromSelectedFile() {
  if (!statsFileSelectEl) {
    return;
  }

  statsSourceFile = statsFileSelectEl.value || 'visits.csv';
  const isActiveSelected = statsSourceFile === 'visits.csv';
  if (statsOverwriteActiveBtnEl) {
    statsOverwriteActiveBtnEl.disabled = isActiveSelected;
  }
  if (statsAppendActiveBtnEl) {
    statsAppendActiveBtnEl.disabled = isActiveSelected;
  }

  await refreshStats();
  statusEl.textContent = statsSourceFile === 'visits.csv'
    ? 'Stats source set to active visits.csv.'
    : `Stats source loaded: ${statsSourceFile} (view only).`;
}

async function overwriteSelectedFileToActiveAndContinue() {
  if (!statsFileSelectEl) {
    return;
  }

  const selected = statsFileSelectEl.value || 'visits.csv';
  if (selected === 'visits.csv') {
    statusEl.textContent = 'Active visits.csv is already selected.';
    return;
  }

  const confirmed = window.confirm(
    `Overwrite active visits.csv with ${selected} and continue appending there?`
  );
  if (!confirmed) {
    return;
  }

  await window.trackerApi.copyFileToActive(selected);
  statsSourceFile = 'visits.csv';
  await refreshVisitorsToday();
  updateDisplay();
  await refreshStatsFileOptions();
  await refreshStats();
  statusEl.textContent = `Overwrote active visits.csv with ${selected}. New entries will append to active data.`;
}

async function appendSelectedFileToActiveAndContinue() {
  if (!statsFileSelectEl) {
    return;
  }

  const selected = statsFileSelectEl.value || 'visits.csv';
  if (selected === 'visits.csv') {
    statusEl.textContent = 'Active visits.csv is already selected.';
    return;
  }

  const confirmed = window.confirm(
    `Append ${selected} rows to active visits.csv and continue appending there?`
  );
  if (!confirmed) {
    return;
  }

  const result = await window.trackerApi.appendFileToActive(selected);
  statsSourceFile = 'visits.csv';
  await refreshVisitorsToday();
  updateDisplay();
  await refreshStatsFileOptions();
  await refreshStats();
  statusEl.textContent = `Appended ${result.appendedRows} rows from ${selected} into active visits.csv.`;
}

async function resetStatsToActiveView() {
  statsSourceFile = 'visits.csv';
  if (statsFileSelectEl) {
    statsFileSelectEl.value = 'visits.csv';
  }
  await refreshStatsFileOptions();
  await refreshStats();
  statusEl.textContent = 'Stats reset to active visits.csv view.';
}

async function refreshStats() {
  const rows = await readStatsRowsFromSelectedSource();
  updateStatsSummary(rows);

  const groupingSelection = statsGroupingEl?.value || 'auto';
  const appliedGrouping = groupingSelection === 'auto'
    ? pickAutoGrouping(rows.length)
    : groupingSelection;
  const chartRows = aggregateRows(rows, appliedGrouping);

  if (statsGroupingNoteEl) {
    const groupingLabel = appliedGrouping === 'raw'
      ? 'Raw (Each Batch)'
      : appliedGrouping === '15m'
        ? '15 Minute'
        : appliedGrouping === 'hour'
          ? 'Hourly'
          : 'Daily';
    const sourceLabel = statsSourceFile === 'visits.csv' ? 'Source: Active' : `Source: ${statsSourceFile}`;
    statsGroupingNoteEl.textContent = `Grouping: ${groupingLabel} · Points: ${chartRows.length} · ${sourceLabel}`;
  }

  const labels = chartRows.map((row) => row.timestamp);
  const visitorsPerBatch = chartRows.map((row) => Number(row.total_visitors || 0));
  const adultTicketPerBatch = chartRows.map((row) => Number(row.adult_ticket_count || 0));
  const adultDoorPerBatch = chartRows.map((row) => Number(row.adult_door_count || 0));
  const childTicketPerBatch = chartRows.map((row) => Number(row.child_ticket_count || 0));
  const childDoorPerBatch = chartRows.map((row) => Number(row.child_door_count || 0));
  const adultsPerBatch = chartRows.map((row) => Number(row.adult_ticket_count || 0) + Number(row.adult_door_count || 0));
  const kidsPerBatch = chartRows.map((row) => Number(row.child_ticket_count || 0) + Number(row.child_door_count || 0));
  const profitPerBatch = chartRows.map((row) => Number(row.ticket_revenue || 0) + Number(row.door_revenue || 0));

  const cumulativeVisitors = [];
  const cumulativeProfit = [];
  let visitorsRunningTotal = 0;
  let profitRunningTotal = 0;

  visitorsPerBatch.forEach((value) => {
    visitorsRunningTotal += value;
    cumulativeVisitors.push(visitorsRunningTotal);
  });

  profitPerBatch.forEach((value) => {
    profitRunningTotal += value;
    cumulativeProfit.push(Number(profitRunningTotal.toFixed(2)));
  });

  destroyCharts();

  visitorsChart = new Chart(document.getElementById('visitors-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Adults per Batch',
          data: adultsPerBatch,
          stack: 'visitors',
          borderColor: '#2e86de',
          backgroundColor: 'rgba(46,134,222,0.6)',
          borderWidth: 1,
        },
        {
          type: 'bar',
          label: 'Kids per Batch',
          data: kidsPerBatch,
          stack: 'visitors',
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39,174,96,0.6)',
          borderWidth: 1,
        },
        {
          label: 'Batch Total Visitors',
          data: visitorsPerBatch,
          borderColor: '#7f8c8d',
          tension: 0.2,
        },
        {
          label: 'Cumulative Visitors',
          data: cumulativeVisitors,
          borderColor: '#1c2430',
          borderDash: [6, 4],
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: { beginAtZero: true, stacked: true },
        x: { ticks: { autoSkip: true, maxTicksLimit: 8 } },
      },
    },
  });

  salesChart = new Chart(document.getElementById('sales-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Adult Ticket',
          data: adultTicketPerBatch,
          borderColor: '#2e86de',
          backgroundColor: 'rgba(46,134,222,0.60)',
          borderWidth: 1,
          stack: 'composition',
        },
        {
          label: 'Adult @ Door',
          data: adultDoorPerBatch,
          borderColor: '#8e44ad',
          backgroundColor: 'rgba(142,68,173,0.60)',
          borderWidth: 1,
          stack: 'composition',
        },
        {
          label: 'Child Ticket',
          data: childTicketPerBatch,
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39,174,96,0.60)',
          borderWidth: 1,
          stack: 'composition',
        },
        {
          label: 'Child @ Door',
          data: childDoorPerBatch,
          borderColor: '#e67e22',
          backgroundColor: 'rgba(230,126,34,0.60)',
          borderWidth: 1,
          stack: 'composition',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: { beginAtZero: true, stacked: true },
        x: { ticks: { autoSkip: true, maxTicksLimit: 8 } },
      },
    },
  });

  profitChart = new Chart(document.getElementById('profit-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Batch Profit',
          data: profitPerBatch,
          borderColor: '#7d3c98',
          backgroundColor: 'rgba(125,60,152,0.45)',
          borderWidth: 1,
        },
        {
          label: 'Cumulative Profit',
          data: cumulativeProfit,
          borderColor: '#1c2430',
          borderDash: [6, 4],
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: { beginAtZero: true },
        x: { ticks: { autoSkip: true, maxTicksLimit: 8 } },
      },
    },
  });
}

function armStatsLongPress() {
  clearStatsLongPress();
  statsHoldBarEl.classList.add('stats-armed');
  statsPressTimer = setTimeout(async () => {
    statsPressTimer = null;
    statsHoldBarEl.classList.remove('stats-armed');
    showView('view-stats');
    await refreshStatsFileOptions();
    await refreshStats();
  }, 2000);
}

function clearStatsLongPress() {
  if (statsPressTimer) {
    clearTimeout(statsPressTimer);
    statsPressTimer = null;
  }
  statsHoldBarEl.classList.remove('stats-armed');
}

function onStatsPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) {
    return;
  }

  if (event.target instanceof Element && event.target.closest('button, .topbar-actions')) {
    clearStatsLongPress();
    return;
  }

  try {
    if (event.pointerId !== undefined) {
      statsHoldBarEl.setPointerCapture(event.pointerId);
    }
  } catch {
  }

  armStatsLongPress();
}

function onStatsPointerUp(event) {
  clearStatsLongPress();
  try {
    if (event.pointerId !== undefined) {
      statsHoldBarEl.releasePointerCapture(event.pointerId);
    }
  } catch {
  }
}

async function toggleFullscreenMode() {
  const isFullscreen = await window.trackerApi.toggleFullscreen();
  document.getElementById('toggle-fullscreen').textContent = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
}

function wireButtons() {
  document.querySelectorAll('button[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      const delta = Number(btn.getAttribute('data-delta') || 0);
      adjustCount(key, delta);
    });
  });

  document.getElementById('force-save').addEventListener('click', () => {
    commitBatch();
  });

  document.getElementById('save-config').addEventListener('click', () => {
    saveConfigFromForm();
  });

  document.getElementById('open-save-location').addEventListener('click', async () => {
    const result = await window.trackerApi.openSaveLocation();
    statusEl.textContent = `Opened save location: ${result.path}`;
  });

  document.getElementById('backup-clear-data').addEventListener('click', async () => {
    await backupAndClearData();
  });

  document.getElementById('show-main').addEventListener('click', () => {
    showView('view-main');
  });

  document.getElementById('show-config').addEventListener('click', () => {
    fillConfigForm();
    showView('view-config');
  });

  document.getElementById('toggle-fullscreen').addEventListener('click', async () => {
    await toggleFullscreenMode();
  });

  statsHoldBarEl.addEventListener('pointerdown', onStatsPointerDown);
  statsHoldBarEl.addEventListener('pointerup', onStatsPointerUp);
  statsHoldBarEl.addEventListener('pointercancel', clearStatsLongPress);
  statsHoldBarEl.addEventListener('lostpointercapture', clearStatsLongPress);

  if (statsGroupingEl) {
    statsGroupingEl.addEventListener('change', async () => {
      if (document.getElementById('view-stats')?.classList.contains('active')) {
        await refreshStats();
      }
    });
  }

  if (statsLoadFileBtnEl) {
    statsLoadFileBtnEl.addEventListener('click', async () => {
      await loadStatsFromSelectedFile();
    });
  }

  if (statsOverwriteActiveBtnEl) {
    statsOverwriteActiveBtnEl.addEventListener('click', async () => {
      await overwriteSelectedFileToActiveAndContinue();
    });
  }

  if (statsAppendActiveBtnEl) {
    statsAppendActiveBtnEl.addEventListener('click', async () => {
      await appendSelectedFileToActiveAndContinue();
    });
  }

  if (statsResetActiveBtnEl) {
    statsResetActiveBtnEl.addEventListener('click', async () => {
      await resetStatsToActiveView();
    });
  }
}

async function init() {
  config = await window.trackerApi.getConfig();
  const isFullscreen = await window.trackerApi.getFullscreen();
  document.getElementById('toggle-fullscreen').textContent = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';

  await refreshVisitorsToday();
  fillConfigForm();
  wireButtons();
  updateDisplay();
}

init();
