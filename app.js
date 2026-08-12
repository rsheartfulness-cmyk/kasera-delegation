const reportColumns = [
  "Flag",
  "Opportunity",
  "Contact Name",
  "Phone Number",
  "City",
  "Salesperson",
  "Stage",
  "Expected Revenue",
  "Tags",
  "Last Activity",
  "Days Since Activity",
  "No. of Messages",
  "Follow-up History (newest first)",
];

const columnRoles = [
  { key: "opportunity", label: "Opportunity", required: true },
  { key: "message", label: "Message", required: true },
  { key: "messageDate", label: "Message Date", required: false },
  { key: "contact", label: "Contact Name", required: false },
  { key: "phone", label: "Phone Number", required: false },
  { key: "city", label: "City", required: false },
  { key: "salesperson", label: "Salesperson", required: false },
  { key: "stage", label: "Stage", required: false },
  { key: "revenue", label: "Expected Revenue", required: false },
  { key: "tags", label: "Tags", required: false },
];

const aliases = {
  opportunity: ["Opportunity", "Lead", "Lead/Opportunity", "Name", "Deal", "Subject"],
  contact: ["Contact Name", "Customer", "Partner", "Customer Name", "Client", "Name"],
  phone: ["Phone", "Phone Number", "Mobile", "Mobile Number", "Telephone", "Contact Number"],
  city: ["City", "Contact/City", "Partner/City", "Location", "Place"],
  salesperson: ["Salesperson", "Sales Person", "User", "Assigned to", "Owner", "Responsible"],
  revenue: ["Expected Revenue", "Expected revenue", "Revenue", "Amount", "Expected Amount"],
  stage: ["Stage", "Stage/Stage Name", "Pipeline Stage", "Status"],
  tags: ["Tags/Tag Name", "Tags", "Tag Name", "Label", "Labels"],
  messageDate: ["Messages/Date", "Messages/Created on", "Messages/Last Updated on", "Date", "Created on", "Updated on"],
  message: ["Messages/Contents", "Messages/Description", "Message", "Contents", "Notes", "Description", "Comment"],
};

const state = {
  rows: [],
  filteredRows: [],
  stats: null,
  sourceName: "",
  rawRows: [],
  headers: [],
  headerIndex: -1,
  mapping: null,
};

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const downloadBtn = document.getElementById("downloadBtn");
const whatsappBtn = document.getElementById("whatsappBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const insightsEl = document.getElementById("insights");
const fileNameEl = document.getElementById("fileName");
const table = document.getElementById("previewTable");
const tbody = table.querySelector("tbody");
const emptyPreview = document.getElementById("emptyPreview");
const mappingPanel = document.getElementById("mappingPanel");
const mappingGrid = document.getElementById("mappingGrid");
const applyMappingBtn = document.getElementById("applyMappingBtn");
const searchInput = document.getElementById("searchInput");
const stageFilter = document.getElementById("stageFilter");
const salespersonFilter = document.getElementById("salespersonFilter");
const flagFilter = document.getElementById("flagFilter");
const staleDaysInput = document.getElementById("staleDaysInput");

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  const file = event.dataTransfer.files[0];
  if (file) handleFile(file);
});
downloadBtn.addEventListener("click", downloadReport);
whatsappBtn.addEventListener("click", copyWhatsappSummary);
resetBtn.addEventListener("click", resetTool);
applyMappingBtn.addEventListener("click", applyManualMapping);
[searchInput, stageFilter, salespersonFilter, flagFilter, staleDaysInput].forEach(control => {
  control.addEventListener("input", () => {
    if (!state.rows.length) return;
    enrichAndRender(state.rows.map(row => ({ ...row })));
  });
});

async function handleFile(file) {
  try {
    if (!window.XLSX) throw new Error("Excel library could not load. Please refresh the page once.");
    if (!/\.xlsx?$/i.test(file.name)) {
      throw new Error("Wrong file type. Please upload an Odoo CRM Excel file (.xlsx or .xls).");
    }

    setStatus("Reading file...", "");
    hideMapping();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("No sheet found in this Excel file.");

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    const headerInfo = detectHeader(rawRows);
    const mapping = suggestMapping(headerInfo.headers);

    state.rawRows = rawRows;
    state.headers = headerInfo.headers;
    state.headerIndex = headerInfo.headerIndex;
    state.sourceName = file.name;
    state.mapping = mapping;
    fileNameEl.textContent = file.name;
    resetBtn.disabled = false;

    if (!hasMinimumMapping(mapping)) {
      showMapping(mapping, headerInfo.headers);
      setStatus("This file looks different. Please map Opportunity and Message columns, then continue.", "warn");
      downloadBtn.disabled = true;
      whatsappBtn.disabled = true;
      return;
    }

    processWithMapping(mapping);
  } catch (error) {
    console.error(error);
    setStatus(`${error.message}<br>Tip: if this is a different export, upload it and use column mapping.`, "bad");
    downloadBtn.disabled = true;
    whatsappBtn.disabled = true;
    resetBtn.disabled = false;
  }
}

function processWithMapping(mapping) {
  const result = cleanLeadRows(state.rawRows, {
    headerIndex: state.headerIndex,
    headers: state.headers,
    mapping,
  });
  state.rows = result.rows;
  enrichAndRender(result.rows);
  hideMapping();
  downloadBtn.disabled = result.rows.length === 0;
  whatsappBtn.disabled = result.rows.length === 0;
  const warning = state.rawRows.length > 10000 ? " Large file detected; use laptop if phone is slow." : "";
  setStatus(`Done. ${state.stats.totalLeads} leads and ${state.stats.totalMessages} messages cleaned.${warning}`, warning ? "warn" : "good");
}

function detectHeader(rawRows) {
  let bestIndex = -1;
  let bestScore = -1;
  rawRows.slice(0, 30).forEach((row, index) => {
    const headers = row.map(value => String(value || "").trim());
    const score = Object.values(suggestMapping(headers)).filter(value => value !== "").length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  if (bestIndex === -1 || bestScore < 2) {
    throw new Error("Could not find a header row. Please upload an export with column names.");
  }
  return {
    headerIndex: bestIndex,
    headers: rawRows[bestIndex].map(value => String(value || "").trim()),
  };
}

function suggestMapping(headers) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping = {};
  columnRoles.forEach(role => {
    mapping[role.key] = "";
    const aliasList = aliases[role.key] || [];
    for (const alias of aliasList) {
      const position = normalizedHeaders.indexOf(normalizeHeader(alias));
      if (position !== -1) {
        mapping[role.key] = headers[position];
        break;
      }
    }
    if (!mapping[role.key]) {
      const fuzzy = findFuzzyHeader(headers, role.key);
      if (fuzzy) mapping[role.key] = fuzzy;
    }
  });
  return mapping;
}

function findFuzzyHeader(headers, key) {
  const terms = {
    opportunity: ["opportunity", "lead", "deal"],
    message: ["message", "content", "note", "comment", "description"],
    messageDate: ["date", "created", "updated"],
    contact: ["contact", "customer", "client"],
    phone: ["phone", "mobile", "telephone"],
    city: ["city", "location", "place"],
    salesperson: ["salesperson", "owner", "assigned", "user"],
    stage: ["stage", "status"],
    revenue: ["revenue", "amount"],
    tags: ["tag", "label"],
  }[key] || [];
  return headers.find(header => terms.some(term => normalizeHeader(header).includes(term))) || "";
}

function hasMinimumMapping(mapping) {
  return Boolean(mapping.opportunity && mapping.message);
}

function showMapping(mapping, headers) {
  mappingGrid.innerHTML = "";
  columnRoles.forEach(role => {
    const row = document.createElement("label");
    row.className = "field-row";
    const select = document.createElement("select");
    select.dataset.role = role.key;
    select.innerHTML = `<option value="">Not available</option>` + headers
      .filter(Boolean)
      .map(header => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`)
      .join("");
    select.value = mapping[role.key] || "";
    row.innerHTML = `<span>${role.label}${role.required ? " *" : ""}</span>`;
    row.appendChild(select);
    mappingGrid.appendChild(row);
  });
  mappingPanel.hidden = false;
}

function hideMapping() {
  mappingPanel.hidden = true;
  mappingGrid.innerHTML = "";
}

function applyManualMapping() {
  const mapping = {};
  mappingGrid.querySelectorAll("select").forEach(select => {
    mapping[select.dataset.role] = select.value;
  });
  if (!hasMinimumMapping(mapping)) {
    setStatus("Please map at least Opportunity and Message columns.", "bad");
    return;
  }
  state.mapping = mapping;
  processWithMapping(mapping);
}

function cleanLeadRows(rawRows, config) {
  const headers = config.headers;
  const mapping = config.mapping;
  const records = rawRows.slice(config.headerIndex + 1).map(row => rowToObject(headers, row));
  const leads = [];
  let current = null;

  for (const record of records) {
    const opportunity = valueByMapping(record, mapping.opportunity);
    const phone = valueByMapping(record, mapping.phone);
    const hasAnyValue = Object.values(record).some(value => String(value || "").trim());
    if (!hasAnyValue) continue;

    if (opportunity) {
      current = {
        opportunity,
        contact: valueByMapping(record, mapping.contact),
        phone,
        city: valueByMapping(record, mapping.city),
        salesperson: valueByMapping(record, mapping.salesperson),
        stage: valueByMapping(record, mapping.stage),
        revenue: parseNumber(valueByMapping(record, mapping.revenue)),
        tags: new Set(splitTags(valueByMapping(record, mapping.tags))),
        messages: [],
      };
      leads.push(current);
    }

    if (!current) continue;
    if (!current.phone && phone) current.phone = phone;
    splitTags(valueByMapping(record, mapping.tags)).forEach(tag => current.tags.add(tag));
    const messageText = cleanMessage(valueByMapping(record, mapping.message));
    const messageDate = parseDate(valueByMapping(record, mapping.messageDate));
    if (messageText) current.messages.push({ date: messageDate, text: messageText });
  }

  const duplicateMap = buildDuplicateMap(leads);
  const rows = leads.map(lead => {
    const messages = lead.messages
      .filter(item => item.text)
      .sort((a, b) => dateTimeValue(b.date) - dateTimeValue(a.date));
    const lastDate = messages.length ? messages[0].date : null;
    const history = messages.map(item => `[${formatDate(item.date)}] ${item.text}`).join("\n");
    const duplicateKey = duplicateLeadKey(lead);
    return {
      flag: "",
      opportunity: lead.opportunity,
      contact: lead.contact,
      phone: lead.phone,
      city: lead.city,
      salesperson: lead.salesperson,
      stage: lead.stage,
      revenue: lead.revenue,
      tags: Array.from(lead.tags).filter(Boolean).join(", "),
      lastActivity: lastDate,
      daysSinceActivity: daysSince(lastDate),
      messageCount: messages.length,
      history,
      isDuplicate: duplicateKey && duplicateMap.get(duplicateKey) > 1,
      isStale: false,
      isHot: false,
      isActive7: false,
    };
  }).sort((a, b) => dateTimeValue(b.lastActivity) - dateTimeValue(a.lastActivity));

  return { rows };
}

function enrichAndRender(baseRows) {
  const staleDays = getStaleDays();
  const rows = baseRows.map(row => {
    const copy = { ...row };
    copy.daysSinceActivity = daysSince(copy.lastActivity);
    copy.isStale = copy.daysSinceActivity !== null && copy.daysSinceActivity >= staleDays;
    copy.isHot = copy.daysSinceActivity !== null && copy.daysSinceActivity <= 7 && copy.messageCount >= 3;
    copy.isActive7 = copy.daysSinceActivity !== null && copy.daysSinceActivity <= 7;
    copy.flag = buildFlag(copy);
    return copy;
  });
  state.rows = rows;
  state.stats = buildStats(rows);
  state.filteredRows = filterRows(rows);
  renderSummary(state.stats);
  renderInsights(state.stats);
  renderFilterOptions(rows);
  renderPreview(state.filteredRows);
}

function buildStats(rows) {
  const dates = rows.flatMap(row => row.lastActivity ? [row.lastActivity] : []);
  return {
    totalLeads: rows.length,
    totalMessages: rows.reduce((sum, row) => sum + row.messageCount, 0),
    firstActivity: dates.length ? formatDate(new Date(Math.min(...dates.map(dateTimeValue)))) : "-",
    lastActivity: dates.length ? formatDate(new Date(Math.max(...dates.map(dateTimeValue)))) : "-",
    staleLeads: rows.filter(row => row.isStale).length,
    hotLeads: rows.filter(row => row.isHot).length,
    duplicateLeads: rows.filter(row => row.isDuplicate).length,
    active7: rows.filter(row => row.isActive7).length,
    stages: countBy(rows, "stage"),
    salespeople: countBy(rows, "salesperson"),
    tags: countTags(rows),
    cities: countBy(rows, "city"),
  };
}

function filterRows(rows) {
  const query = normalizeHeader(searchInput.value);
  const stage = stageFilter.value;
  const salesperson = salespersonFilter.value;
  const flag = flagFilter.value;
  return rows.filter(row => {
    const text = normalizeHeader([row.opportunity, row.contact, row.phone, row.city, row.salesperson, row.stage, row.tags, row.history].join(" "));
    if (query && !text.includes(query)) return false;
    if (stage && row.stage !== stage) return false;
    if (salesperson && row.salesperson !== salesperson) return false;
    if (flag === "stale" && !row.isStale) return false;
    if (flag === "hot" && !row.isHot) return false;
    if (flag === "duplicate" && !row.isDuplicate) return false;
    if (flag === "active7" && !row.isActive7) return false;
    return true;
  });
}

function renderSummary(stats) {
  summaryEl.innerHTML = `
    <div class="metric"><strong>${stats.totalLeads}</strong><span>Total Leads</span></div>
    <div class="metric"><strong>${stats.totalMessages}</strong><span>Total Messages</span></div>
    <div class="metric"><strong>${stats.firstActivity}</strong><span>First Activity</span></div>
    <div class="metric"><strong>${stats.lastActivity}</strong><span>Last Activity</span></div>
    <div class="metric warn"><strong>${stats.staleLeads}</strong><span>Stale Leads</span></div>
    <div class="metric hot"><strong>${stats.hotLeads}</strong><span>Hot Leads</span></div>
    <div class="metric"><strong>${stats.duplicateLeads}</strong><span>Duplicates</span></div>
    <div class="metric good"><strong>${stats.active7}</strong><span>Active 7 Days</span></div>
  `;
}

function renderInsights(stats) {
  insightsEl.innerHTML = `
    ${insightBox("Top Stages", stats.stages)}
    ${insightBox("Top Salespeople", stats.salespeople)}
    ${insightBox("Top Tags", stats.tags)}
  `;
}

function insightBox(title, data) {
  const rows = topEntries(data, 5);
  const items = rows.length ? rows.map(([name, count]) => `<li>${escapeHtml(name)} - ${count}</li>`).join("") : "<li>No data yet</li>";
  return `<div class="insight"><h3>${title}</h3><ol>${items}</ol></div>`;
}

function renderFilterOptions(rows) {
  keepSelectOptions(stageFilter, "All stages", uniqueValues(rows, "stage"));
  keepSelectOptions(salespersonFilter, "All salespeople", uniqueValues(rows, "salesperson"));
}

function keepSelectOptions(select, label, values) {
  const current = select.value;
  select.innerHTML = `<option value="">${label}</option>` + values
    .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
  if (values.includes(current)) select.value = current;
}

function renderPreview(rows) {
  tbody.innerHTML = "";
  rows.slice(0, 50).forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${flagBadges(row)}</td>
      <td>${escapeHtml(row.opportunity)}</td>
      <td>${escapeHtml(row.contact)}</td>
      <td>${escapeHtml(row.phone)}</td>
      <td>${escapeHtml(row.city)}</td>
      <td>${escapeHtml(row.salesperson)}</td>
      <td>${escapeHtml(row.stage)}</td>
      <td>${escapeHtml(formatDate(row.lastActivity))}</td>
      <td>${row.messageCount}</td>
      <td class="history-cell">${escapeHtml(row.history.split("\n").slice(0, 3).join("\n"))}</td>
    `;
    tbody.appendChild(tr);
  });
  table.hidden = rows.length === 0;
  emptyPreview.hidden = rows.length > 0;
  emptyPreview.textContent = state.rows.length ? "No leads match the current filters." : "Cleaned leads will appear here before download.";
}

function flagBadges(row) {
  const badges = [];
  if (row.isHot) badges.push('<span class="badge hot">Hot</span>');
  if (row.isStale) badges.push('<span class="badge stale">Stale</span>');
  if (row.isDuplicate) badges.push('<span class="badge duplicate">Duplicate</span>');
  if (!badges.length) badges.push('<span class="badge">OK</span>');
  return badges.join(" ");
}

function downloadReport() {
  if (!state.rows.length) return;
  const today = formatDate(new Date());
  const reportRows = state.rows.map(row => workbookRow(row));
  const reportAoa = [
    ["KASERA INDUSTRIES - CRM LEAD FOLLOW-UP REPORT"],
    [`Total Leads: ${state.stats.totalLeads}   |   Generated: ${today}   |   Stale Limit: ${getStaleDays()} days`],
    [],
    reportColumns,
    ...reportRows,
  ];

  const summaryAoa = buildSummarySheetRows(today);
  const workbook = XLSX.utils.book_new();
  const reportSheet = XLSX.utils.aoa_to_sheet(reportAoa);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
  styleReportSheet(reportSheet, XLSX.utils.decode_range(reportSheet["!ref"]));
  styleSummarySheet(summarySheet, XLSX.utils.decode_range(summarySheet["!ref"]));
  XLSX.utils.book_append_sheet(workbook, reportSheet, "Lead Report");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.writeFile(workbook, `Kasera_Lead_Report_${today.replace(/-/g, "")}.xlsx`);
  setStatus("Report downloaded with Lead Report and Summary sheets.", "good");
}

function workbookRow(row) {
  return [
    row.flag,
    row.opportunity,
    row.contact,
    row.phone,
    row.city,
    row.salesperson,
    row.stage,
    row.revenue,
    row.tags,
    formatDate(row.lastActivity),
    row.daysSinceActivity ?? "",
    row.messageCount,
    row.history,
  ];
}

function buildSummarySheetRows(today) {
  const rows = [
    ["KASERA INDUSTRIES - LEAD SUMMARY"],
    [`Generated: ${today}`],
    [],
    ["Metric", "Value"],
    ["Total Leads", state.stats.totalLeads],
    ["Total Messages", state.stats.totalMessages],
    ["First Activity", state.stats.firstActivity],
    ["Last Activity", state.stats.lastActivity],
    ["Stale Leads", state.stats.staleLeads],
    ["Hot Leads", state.stats.hotLeads],
    ["Duplicate Leads", state.stats.duplicateLeads],
    ["Active in Last 7 Days", state.stats.active7],
    [],
    ["Stage", "Lead Count"],
    ...topEntries(state.stats.stages, 100),
    [],
    ["Salesperson", "Lead Count"],
    ...topEntries(state.stats.salespeople, 100),
    [],
    ["Tag", "Lead Count"],
    ...topEntries(state.stats.tags, 100),
    [],
    ["City", "Lead Count"],
    ...topEntries(state.stats.cities, 100),
  ];
  return rows;
}

function styleReportSheet(ws, range) {
  ws["!merges"] = [XLSX.utils.decode_range("A1:M1"), XLSX.utils.decode_range("A2:M2")];
  ws["!cols"] = [
    { wch: 18 }, { wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 10 }, { wch: 75 },
  ];
  ws["!autofilter"] = { ref: `A4:M${range.e.r + 1}` };
  ws["!rows"] = Array.from({ length: range.e.r + 1 }, (_, index) => {
    if (index === 0) return { hpt: 24 };
    if (index === 1) return { hpt: 20 };
    if (index === 3) return { hpt: 28 };
    if (index >= 4) return { hpt: 58 };
    return { hpt: 12 };
  });
  applyCellStyle(ws, "A1", titleStyle());
  applyCellStyle(ws, "A2", subtitleStyle());
  for (let column = 0; column <= 12; column += 1) {
    applyCellStyle(ws, XLSX.utils.encode_cell({ r: 3, c: column }), headerStyle());
  }
  for (let row = 4; row <= range.e.r; row += 1) {
    const flag = String(ws[`A${row + 1}`]?.v || "");
    const fill = flag.includes("Stale") ? "FFF7ED" : flag.includes("Hot") ? "FFF1F2" : row % 2 === 1 ? "F8FBFF" : "";
    for (let column = 0; column <= 12; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = ws[address] || { t: "s", v: "" };
      cell.s = bodyStyle(fill, column === 12, column === 7 || column === 10 || column === 11);
      if (column === 7) cell.z = "#,##0";
      ws[address] = cell;
    }
  }
}

function styleSummarySheet(ws, range) {
  ws["!merges"] = [XLSX.utils.decode_range("A1:D1"), XLSX.utils.decode_range("A2:D2")];
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 16 }];
  applyCellStyle(ws, "A1", titleStyle());
  applyCellStyle(ws, "A2", subtitleStyle());
  for (let row = 0; row <= range.e.r; row += 1) {
    const first = String(ws[`A${row + 1}`]?.v || "");
    if (["Metric", "Stage", "Salesperson", "Tag", "City"].includes(first)) {
      for (let col = 0; col <= 1; col += 1) {
        applyCellStyle(ws, XLSX.utils.encode_cell({ r: row, c: col }), headerStyle());
      }
    } else {
      for (let col = 0; col <= 1; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[address]) ws[address].s = bodyStyle(row % 2 ? "F8FBFF" : "", false, col === 1);
      }
    }
  }
}

function titleStyle() {
  return { font: { name: "Arial", sz: 14, bold: true, color: { rgb: "1F4E78" } }, alignment: { vertical: "center" } };
}

function subtitleStyle() {
  return { font: { name: "Arial", sz: 10, color: { rgb: "555555" } }, alignment: { vertical: "center" } };
}

function headerStyle() {
  return {
    font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: thinBorder("B7C9D9"),
  };
}

function bodyStyle(fill, wrap, right) {
  const style = {
    font: { name: "Arial", sz: 10, color: { rgb: "222222" } },
    alignment: { horizontal: right ? "right" : "left", vertical: "top", wrapText: wrap },
    border: thinBorder("D9E1EC"),
  };
  if (fill) style.fill = { patternType: "solid", fgColor: { rgb: fill } };
  return style;
}

function applyCellStyle(ws, address, style) {
  ws[address] = ws[address] || { t: "s", v: "" };
  ws[address].s = style;
}

function thinBorder(color) {
  return {
    top: { style: "thin", color: { rgb: color } },
    bottom: { style: "thin", color: { rgb: color } },
    left: { style: "thin", color: { rgb: color } },
    right: { style: "thin", color: { rgb: color } },
  };
}

async function copyWhatsappSummary() {
  if (!state.stats) return;
  const text = [
    "Kasera CRM Lead Summary",
    `Total Leads: ${state.stats.totalLeads}`,
    `Total Messages: ${state.stats.totalMessages}`,
    `Stale Leads: ${state.stats.staleLeads}`,
    `Hot Leads: ${state.stats.hotLeads}`,
    `Active Last 7 Days: ${state.stats.active7}`,
    `Date Range: ${state.stats.firstActivity} to ${state.stats.lastActivity}`,
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Summary copied. You can paste it in WhatsApp.", "good");
  } catch {
    setStatus(text.replace(/\n/g, "<br>"), "good");
  }
}

function buildFlag(row) {
  const flags = [];
  if (row.isHot) flags.push("Hot");
  if (row.isStale) flags.push("Stale");
  if (row.isDuplicate) flags.push("Duplicate");
  return flags.join(", ") || "OK";
}

function buildDuplicateMap(leads) {
  const map = new Map();
  leads.forEach(lead => {
    const key = duplicateLeadKey(lead);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function duplicateLeadKey(lead) {
  return normalizeHeader([lead.opportunity, lead.contact].filter(Boolean).join("|"));
}

function countBy(rows, key) {
  const counts = {};
  rows.forEach(row => {
    const value = String(row[key] || "Blank").trim() || "Blank";
    counts[value] = (counts[value] || 0) + 1;
  });
  return counts;
}

function countTags(rows) {
  const counts = {};
  rows.forEach(row => {
    splitTags(row.tags).forEach(tag => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });
  return counts;
}

function topEntries(data, limit) {
  return Object.entries(data || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map(row => row[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function valueByMapping(record, headerName) {
  return headerName ? String(record[headerName] ?? "").trim() : "";
}

function rowToObject(headers, row) {
  const object = {};
  headers.forEach((header, position) => {
    object[header] = row[position] ?? "";
  });
  return object;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanMessage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const container = document.createElement("div");
  container.innerHTML = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n");
  return (container.textContent || container.innerText || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitTags(value) {
  return String(value || "").split(/[,;|]/).map(item => item.trim()).filter(Boolean);
}

function parseNumber(value) {
  const clean = String(value || "").replace(/,/g, "").trim();
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text.replace(" ", "T"));
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const parts = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (!parts) return null;
  const day = Number(parts[1]);
  const month = Number(parts[2]) - 1;
  const year = Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]);
  return new Date(year, month, day);
}

function dateTimeValue(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function daysSince(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.floor((startToday - startDate) / 86400000));
}

function getStaleDays() {
  const value = Number(staleDaysInput.value);
  return Number.isFinite(value) && value > 0 ? value : 15;
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()];
  return `${day}-${month}-${date.getFullYear()}`;
}

function resetTool() {
  state.rows = [];
  state.filteredRows = [];
  state.sourceName = "";
  state.stats = null;
  state.rawRows = [];
  state.headers = [];
  state.headerIndex = -1;
  state.mapping = null;
  fileInput.value = "";
  fileNameEl.textContent = "No file selected";
  downloadBtn.disabled = true;
  whatsappBtn.disabled = true;
  resetBtn.disabled = true;
  searchInput.value = "";
  stageFilter.innerHTML = '<option value="">All stages</option>';
  salespersonFilter.innerHTML = '<option value="">All salespeople</option>';
  flagFilter.value = "";
  hideMapping();
  renderSummary({ totalLeads: 0, totalMessages: 0, firstActivity: "-", lastActivity: "-", staleLeads: 0, hotLeads: 0, duplicateLeads: 0, active7: 0 });
  renderInsights({ stages: {}, salespeople: {}, tags: {} });
  renderPreview([]);
  setStatus("Ready. Select the raw Odoo lead export to begin.", "");
}

function setStatus(message, type) {
  statusEl.innerHTML = message;
  statusEl.className = `status ${type || ""}`.trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
