import {
  persistenceMode,
  observeSession,
  signIn,
  signOutUser,
  loadSavedData,
  saveImportedData,
  createEmployeeAccount,
  activateInitialAdmin,
} from "./firebase-store.js?v=20260812";

const reportColumns = [
  "Flag",
  "Lead ID",
  "Opportunity",
  "Contact Name",
  "Phone Number",
  "City",
  "Salesperson",
  "Stage",
  "Tags",
  "Conversation Status",
  "Sales Signal",
  "Next Action",
  "Follow-up Date",
  "Follow-up State",
  "Last Activity",
  "Days Since Activity",
  "Meaningful Messages",
  "Follow-up History (newest first)",
];

const columnRoles = [
  { key: "leadId", label: "Lead ID", required: true },
  { key: "messageId", label: "Message ID", required: true },
  { key: "opportunity", label: "Opportunity / Lead Name", required: false },
  { key: "message", label: "Message Body", required: false },
  { key: "messageDate", label: "Message Date", required: false },
  { key: "messageType", label: "Message Type", required: false },
  { key: "messageAuthor", label: "Message Author", required: false },
  { key: "contact", label: "Contact Name", required: false },
  { key: "phone", label: "Phone Number", required: false },
  { key: "city", label: "City", required: false },
  { key: "salesperson", label: "Lead Owner", required: false },
  { key: "stage", label: "Stage", required: false },
  { key: "revenue", label: "Expected Revenue", required: false },
  { key: "tags", label: "Tags", required: false },
];

const aliases = {
  leadId: ["id", "Lead ID", "Lead/ID", "Opportunity ID", "crm.lead/id"],
  messageId: ["message_ids/id", "Messages/ID", "Message ID", "mail.message/id"],
  opportunity: ["name", "Opportunity", "Lead", "Lead/Opportunity", "Deal", "Subject"],
  message: ["message_ids/body", "Messages/Contents", "Messages/Description", "Message", "Contents", "Notes", "Description", "Comment"],
  messageDate: ["message_ids/create_date", "Messages/Date", "Messages/Created on", "Message Date", "Created on"],
  messageType: ["message_ids/message_type", "Messages/Message Type", "Message Type", "Type"],
  messageAuthor: ["message_ids/author_id/name", "Messages/Author", "Message Author", "Author"],
  contact: ["contact_name", "Contact Name", "Customer", "Partner", "Customer Name", "Client"],
  phone: ["phone_mobile_search", "Phone", "Phone Number", "Mobile", "Mobile Number", "Telephone", "Contact Number"],
  city: ["city", "City", "Contact/City", "Partner/City", "Location", "Place"],
  salesperson: ["user_id", "Salesperson", "Sales Person", "User", "Assigned to", "Owner", "Responsible"],
  revenue: ["expected_revenue", "Expected Revenue", "Revenue", "Amount", "Expected Amount"],
  stage: ["stage_id", "Stage", "Stage/Stage Name", "Pipeline Stage", "Status"],
  tags: ["tag_ids/name", "Tags/Tag Name", "Tags", "Tag Name", "Label", "Labels"],
};

const state = {
  leads: [],
  messages: [],
  imports: [],
  users: [],
  profile: null,
  sourceName: "",
  rawRows: [],
  headers: [],
  headerIndex: -1,
  mapping: null,
  pending: null,
  viewRows: [],
  filteredRows: [],
  stats: emptyStats(),
  user: null,
  dataReady: false,
};

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const saveImportBtn = document.getElementById("saveImportBtn");
const downloadBtn = document.getElementById("downloadBtn");
const whatsappBtn = document.getElementById("whatsappBtn");
const loadSavedBtn = document.getElementById("loadSavedBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const insightsEl = document.getElementById("insights");
const periodCaption = document.getElementById("periodCaption");
const fileNameEl = document.getElementById("fileName");
const privacyNote = document.getElementById("privacyNote");
const accountPanel = document.getElementById("accountPanel");
const accessGate = document.getElementById("accessGate");
const appMain = document.getElementById("appMain");
const table = document.getElementById("previewTable");
const tbody = table.querySelector("tbody");
const emptyPreview = document.getElementById("emptyPreview");
const mappingPanel = document.getElementById("mappingPanel");
const mappingGrid = document.getElementById("mappingGrid");
const applyMappingBtn = document.getElementById("applyMappingBtn");
const searchInput = document.getElementById("searchInput");
const monthFilter = document.getElementById("monthFilter");
const dayFilter = document.getElementById("dayFilter");
const stageFilter = document.getElementById("stageFilter");
const salespersonFilter = document.getElementById("salespersonFilter");
const tagFilter = document.getElementById("tagFilter");
const conversationFilter = document.getElementById("conversationFilter");
const flagFilter = document.getElementById("flagFilter");
const staleDaysInput = document.getElementById("staleDaysInput");

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});
dropzone.addEventListener("dragover", event => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
dropzone.addEventListener("drop", event => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  if (event.dataTransfer.files.length) handleFile(event.dataTransfer.files[0]);
});
saveImportBtn.addEventListener("click", savePendingImport);
downloadBtn.addEventListener("click", downloadReport);
whatsappBtn.addEventListener("click", copyWhatsappSummary);
loadSavedBtn.addEventListener("click", () => loadHistory(true));
resetBtn.addEventListener("click", resetPreview);
applyMappingBtn.addEventListener("click", applyManualMapping);
[searchInput, monthFilter, dayFilter, stageFilter, salespersonFilter, tagFilter, conversationFilter, flagFilter, staleDaysInput].forEach(control => {
  control.addEventListener("input", renderCurrentData);
  control.addEventListener("change", renderCurrentData);
});
monthFilter.addEventListener("change", () => {
  if (monthFilter.value && dayFilter.value) {
    dayFilter.value = "";
    renderCurrentData();
  }
});
dayFilter.addEventListener("change", () => {
  if (dayFilter.value && monthFilter.value) {
    monthFilter.value = "";
    renderCurrentData();
  }
});

startApplication();

function startApplication() {
  renderAccount();
  updatePersistenceNote();
  if (persistenceMode === "local") {
    loadHistory(false);
    return;
  }
  observeSession(async user => {
    state.user = user;
    state.profile = null;
    state.users = [];
    renderAccount();
    if (user) await loadHistory(false);
    else {
      state.leads = [];
      state.messages = [];
      state.imports = [];
      state.dataReady = false;
      renderCurrentData();
    }
  });
}

function updatePersistenceNote() {
  privacyNote.textContent = persistenceMode === "firebase"
    ? "Firebase cloud storage enabled. Admins see all reports; employees see only their assigned leads."
    : "Local-browser mode. History is saved on this device; add Firebase configuration to share it permanently.";
}

function renderAccount() {
  syncAccessGate();
  if (persistenceMode === "local") {
    accountPanel.innerHTML = "<strong>Local administrator mode</strong><br>Use Firebase to create employee logins and enforce access to their own reports.";
    return;
  }
  if (state.user) {
    const profile = state.profile;
    if (!profile) {
      accountPanel.innerHTML = "<strong>Login needs activation</strong><br>" + escapeHtml(state.user.email || "Signed-in user") +
        "<br>Your administrator must create this tracker profile." +
        '<div class="actions"><button id="signOutBtn" class="secondary">Sign Out</button></div>';
    } else {
      accountPanel.innerHTML = "<strong>Cloud storage connected</strong><br>" +
        escapeHtml(profile.displayName || state.user.email || "Signed-in user") + " · " +
        '<span class="badge">' + escapeHtml(profile.role === "admin" ? "Admin" : "Employee") + "</span><br>" +
        (profile.role === "admin"
          ? "You can view all saved lead data and reports."
          : "You can upload an Odoo file, but only your assigned Odoo leads and reports are visible.") +
        renderUserManagement() +
        '<div class="actions"><button id="signOutBtn" class="secondary">Sign Out</button></div>';
    }
    document.getElementById("signOutBtn").addEventListener("click", async () => {
      await signOutUser();
    });
    const createUserForm = document.getElementById("createUserForm");
    if (createUserForm) createUserForm.addEventListener("submit", createUserFromForm);
    return;
  }
  accountPanel.innerHTML = '<strong>Firebase sign-in required</strong><br>Use the single administrator account created in Firebase Authentication.' +
    '<form id="signInForm" class="auth-fields"><input id="emailInput" type="email" autocomplete="email" placeholder="Email" required>' +
    '<input id="passwordInput" type="password" autocomplete="current-password" placeholder="Password" required>' +
    '<button type="submit">Sign In</button></form>';
  document.getElementById("signInForm").addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    try {
      setStatus("Signing in...", "");
      await signIn(email, password);
    } catch (error) {
      setStatus(error.message || "Could not sign in.", "bad");
    }
  });
}

function syncAccessGate() {
  if (persistenceMode === "local" || (state.user && state.profile)) {
    accessGate.hidden = true;
    appMain.hidden = false;
    return;
  }

  appMain.hidden = true;
  accessGate.hidden = false;
  if (!state.user) {
    accessGate.innerHTML =
      '<span class="eyebrow">Secure access</span><h2>Sign in to Kasera Lead Tracker</h2>' +
      '<p>Only administrator-created employee accounts can view reports or import company CRM data.</p>' +
      '<form id="gateSignInForm" class="auth-fields"><input id="gateEmailInput" type="email" autocomplete="email" placeholder="Email" required>' +
      '<input id="gatePasswordInput" type="password" autocomplete="current-password" placeholder="Password" required>' +
      '<button type="submit">Sign In</button></form>';
    document.getElementById("gateSignInForm").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        setStatus("Signing in...", "");
        await signIn(document.getElementById("gateEmailInput").value.trim(), document.getElementById("gatePasswordInput").value);
      } catch (error) {
        setStatus(error.message || "Could not sign in.", "bad");
      }
    });
    return;
  }

  accessGate.innerHTML =
    '<span class="eyebrow">Profile activation</span><h2>Login needs activation</h2>' +
    '<p>' + escapeHtml(state.user.email || "Signed-in user") + ' is signed in, but does not yet have access to Kasera CRM data.</p>' +
    '<p>Only the approved first admin can activate the portal. All employees must later be created by the admin from the portal.</p>' +
    '<div class="actions"><button id="activateAdminBtn">Activate first admin</button><button id="gateSignOutBtn" class="secondary">Sign Out</button></div>';
  document.getElementById("activateAdminBtn").addEventListener("click", activateAdminFromPortal);
  document.getElementById("gateSignOutBtn").addEventListener("click", signOutUser);
}

async function activateAdminFromPortal() {
  const button = document.getElementById("activateAdminBtn");
  try {
    button.disabled = true;
    button.textContent = "Activating...";
    await activateInitialAdmin();
    await loadHistory(true);
    setStatus("Administrator profile activated. You can now create employees from User management.", "good");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not activate this administrator account.", "bad");
    if (button) {
      button.disabled = false;
      button.textContent = "Activate first admin";
    }
  }
}

function renderUserManagement() {
  if (!isAdmin()) return "";
  const users = state.users
    .sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)))
    .map(user => "<li>" + escapeHtml(user.displayName || user.email || "Unnamed user") + " — " +
      escapeHtml(user.role || "employee") + " — " + escapeHtml((user.odooUserIds || []).join(", ") || "No Odoo ID mapped") + "</li>")
    .join("");
  return '<details class="auth-fields"><summary><strong>User management</strong></summary>' +
    '<form id="createUserForm" class="auth-fields">' +
    '<input id="newUserName" placeholder="Employee name" required>' +
    '<input id="newUserEmail" type="email" placeholder="Employee login email" required>' +
    '<input id="newUserPassword" type="password" minlength="8" placeholder="Temporary password (min. 8 characters)" required>' +
    '<input id="newUserOdooIds" placeholder="Odoo user_id email(s), separated by commas" required>' +
    '<button type="submit">Create Employee Login</button></form>' +
    "<strong>Current users</strong><ol>" + (users || "<li>No user profiles loaded yet.</li>") + "</ol></details>";
}

async function createUserFromForm(event) {
  event.preventDefault();
  try {
    const displayName = document.getElementById("newUserName").value.trim();
    const email = document.getElementById("newUserEmail").value.trim().toLowerCase();
    const password = document.getElementById("newUserPassword").value;
    const odooUserIds = splitTags(document.getElementById("newUserOdooIds").value).map(normalizeOdooUserId);
    if (!odooUserIds.length) throw new Error("Enter at least one Odoo user_id email.");
    setStatus("Creating employee login...", "");
    await createEmployeeAccount({ displayName, email, password, odooUserIds });
    await loadHistory(false);
    setStatus("Employee login created and linked to the selected Odoo user ID.", "good");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not create the employee login.", "bad");
  }
}

async function loadHistory(announce) {
  try {
    if (persistenceMode === "firebase" && !state.user) {
      setStatus("Sign in to load the saved cloud history.", "warn");
      return;
    }
    if (announce) setStatus("Loading saved history...", "");
    const data = await loadSavedData();
    state.leads = Array.isArray(data.leads) ? data.leads : [];
    state.messages = Array.isArray(data.messages) ? data.messages : [];
    state.imports = Array.isArray(data.imports) ? data.imports : [];
    state.users = Array.isArray(data.users) ? data.users : [];
    state.profile = data.profile || null;
    state.dataReady = true;
    renderAccount();
    renderCurrentData();
    if (announce) setStatus(savedHistoryMessage(), "good");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load saved history.", "bad");
  }
}

function savedHistoryMessage() {
  return "Loaded " + state.leads.length + " leads, " + state.messages.length + " message records, and " + state.imports.length + " saved imports.";
}

async function handleFile(file) {
  try {
    if (!window.XLSX) throw new Error("Excel library could not load. Refresh the page once.");
    if (!/\.xlsx?$/i.test(file.name)) throw new Error("Please upload an Odoo CRM Excel file (.xlsx or .xls).");
    if (persistenceMode === "firebase" && !state.user) throw new Error("Sign in to Firebase before preparing an import.");
    if (!state.dataReady) await loadHistory(false);

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
      setStatus("Map the Lead ID and Message ID columns before importing.", "warn");
      return;
    }
    prepareImport(mapping);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not read the file.", "bad");
  }
}

function detectHeader(rawRows) {
  let bestIndex = -1;
  let bestScore = -1;
  rawRows.slice(0, 30).forEach((row, index) => {
    const headers = row.map(value => String(value || "").trim());
    const score = Object.values(suggestMapping(headers)).filter(Boolean).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  if (bestIndex === -1 || bestScore < 2) throw new Error("Could not find a header row with Odoo column names.");
  return { headerIndex: bestIndex, headers: rawRows[bestIndex].map(value => String(value || "").trim()) };
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
    if (!mapping[role.key]) mapping[role.key] = findFuzzyHeader(headers, role.key);
  });
  return mapping;
}

function findFuzzyHeader(headers, key) {
  if (key === "tags") {
    return headers.find(header => /(^|[/_\s])tags?($|[/_\s])/i.test(String(header || ""))) || "";
  }
  const terms = {
    leadId: ["lead id", "opportunity id", "crm lead"],
    messageId: ["message id", "mail message"],
    opportunity: ["opportunity", "lead", "deal", "subject", "name"],
    message: ["message", "content", "note", "comment", "description", "body"],
    messageDate: ["message date", "created", "date"],
    messageType: ["message type", "type"],
    messageAuthor: ["message author", "author"],
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
  return Boolean(mapping.leadId && mapping.messageId);
}

function showMapping(mapping, headers) {
  mappingGrid.innerHTML = "";
  columnRoles.forEach(role => {
    const row = document.createElement("label");
    row.className = "field-row";
    const select = document.createElement("select");
    select.dataset.role = role.key;
    select.innerHTML = '<option value="">Not available</option>' + headers.filter(Boolean)
      .map(header => '<option value="' + escapeHtml(header) + '">' + escapeHtml(header) + "</option>")
      .join("");
    select.value = mapping[role.key] || "";
    row.innerHTML = "<span>" + role.label + (role.required ? " *" : "") + "</span>";
    row.appendChild(select);
    mappingGrid.appendChild(row);
  });
  mappingPanel.hidden = false;
}

function hideMapping() {
  mappingPanel.hidden = true;
}

function applyManualMapping() {
  const mapping = {};
  mappingGrid.querySelectorAll("select").forEach(select => {
    mapping[select.dataset.role] = select.value;
  });
  if (!hasMinimumMapping(mapping)) {
    setStatus("Please map both Lead ID and Message ID.", "bad");
    return;
  }
  state.mapping = mapping;
  prepareImport(mapping);
}

function prepareImport(mapping) {
  const imported = parseOdooExport(state.rawRows, {
    headerIndex: state.headerIndex,
    headers: state.headers,
    mapping,
  });
  const parsed = restrictImportToCurrentUser(imported);
  const existingMessageIds = new Set(state.messages.map(item => item.sourceMessageId));
  const existingLeadIds = new Set(state.leads.map(item => item.sourceLeadId));
  const existingLeadsById = new Map(state.leads.map(lead => [lead.sourceLeadId, lead]));
  const messageIdsInThisUpload = new Set();
  const importMessages = imported.messages.filter(message => {
    if (messageIdsInThisUpload.has(message.sourceMessageId)) return false;
    messageIdsInThisUpload.add(message.sourceMessageId);
    return true;
  });
  const visibleMessageIds = new Set(parsed.messages.map(message => message.sourceMessageId));
  const newMessages = importMessages.filter(message =>
    visibleMessageIds.has(message.sourceMessageId) && !existingMessageIds.has(message.sourceMessageId)
  );
  const mergedLeads = mergeLeads(state.leads, parsed.leads);
  const mergedMessages = state.messages.concat(newMessages);
  const leadUpdateCount = parsed.leads.filter(lead => {
    const existing = existingLeadsById.get(lead.sourceLeadId);
    return existing && leadHasChanged(existing, lead);
  }).length;
  state.pending = {
    parsedLeads: parsed.leads,
    importLeads: imported.leads,
    importMessages,
    newMessages,
    mergedLeads,
    mergedMessages,
    skippedDuplicateMessages: parsed.messages.length - newMessages.length,
    newLeadCount: parsed.leads.filter(lead => !existingLeadIds.has(lead.sourceLeadId)).length,
    leadUpdateCount,
    totalRows: parsed.totalRows,
    excludedLeadCount: parsed.excludedLeadCount || 0,
  };
  hideMapping();
  renderDataset(mergedLeads, mergedMessages);
  const hasChanges = isAdmin()
    ? Boolean(newMessages.length || state.pending.newLeadCount || leadUpdateCount)
    : Boolean(importMessages.length || imported.leads.length);
  saveImportBtn.disabled = !hasChanges;
  downloadBtn.disabled = state.viewRows.length === 0;
  whatsappBtn.disabled = state.viewRows.length === 0;
  const importMessage = hasChanges
    ? "Import preview ready: " + state.pending.newLeadCount + " new leads, " + newMessages.length +
      " new message records, " + leadUpdateCount + " lead updates, and " +
      state.pending.skippedDuplicateMessages + " already-saved message records."
    : "This file is already saved. All " + state.pending.skippedDuplicateMessages + " Message IDs and lead details match the existing history.";
  setStatus(importMessage +
    (state.pending.excludedLeadCount
      ? " This preview is limited to your assigned leads. The complete file will be securely processed for the admin report."
      : "") +
    (!mapping.tags
      ? " Tags are not in this Odoo file, so no tag report can be generated. In Odoo export the Tags field (usually tag_ids/name) and upload again; existing saved tags will stay unchanged."
      : ""),
    hasChanges ? "good" : "warn");
}

function parseOdooExport(rawRows, config) {
  const records = rawRows.slice(config.headerIndex + 1).map(row => rowToObject(config.headers, row));
  const leadMap = new Map();
  const messages = [];
  let activeLead = null;
  let usableRows = 0;

  records.forEach(record => {
    const hasAnyValue = Object.values(record).some(value => String(value || "").trim());
    if (!hasAnyValue) return;
    const sourceLeadId = valueByMapping(record, config.mapping.leadId);
    if (sourceLeadId) {
      const prior = leadMap.get(sourceLeadId);
      activeLead = {
        sourceLeadId,
        opportunity: valueByMapping(record, config.mapping.opportunity),
        contact: valueByMapping(record, config.mapping.contact),
        phone: valueByMapping(record, config.mapping.phone),
        city: valueByMapping(record, config.mapping.city),
        salesperson: valueByMapping(record, config.mapping.salesperson),
        stage: valueByMapping(record, config.mapping.stage),
        revenue: parseNumber(valueByMapping(record, config.mapping.revenue)),
        tags: config.mapping.tags ? splitTags(valueByMapping(record, config.mapping.tags)) : (prior?.tags || []),
        tagsProvided: Boolean(config.mapping.tags),
        lastImportedAt: new Date().toISOString(),
      };
      activeLead.ownerOdooIds = [normalizeOdooUserId(activeLead.salesperson)].filter(Boolean);
      leadMap.set(sourceLeadId, activeLead);
    }
    if (!activeLead) return;
    const sourceMessageId = valueByMapping(record, config.mapping.messageId);
    if (!sourceMessageId) return;
    usableRows += 1;
    const text = cleanMessage(valueByMapping(record, config.mapping.message));
    const type = valueByMapping(record, config.mapping.messageType) || "Unknown";
    const createdAt = toIsoDate(valueByMapping(record, config.mapping.messageDate));
    const author = valueByMapping(record, config.mapping.messageAuthor);
    const analysis = analyseConversation(text, type);
    messages.push({
      sourceMessageId,
      sourceLeadId: activeLead.sourceLeadId,
      ownerOdooIds: activeLead.ownerOdooIds,
      body: text,
      messageType: type,
      author,
      createdAt,
      analysis,
      importedAt: new Date().toISOString(),
    });
  });
  return { leads: Array.from(leadMap.values()), messages, totalRows: usableRows };
}

function restrictImportToCurrentUser(parsed) {
  if (isAdmin() || persistenceMode === "local") return parsed;
  const allowedOdooIds = new Set((state.profile?.odooUserIds || []).map(normalizeOdooUserId).filter(Boolean));
  const allowedLeads = parsed.leads.filter(lead => (lead.ownerOdooIds || []).some(owner => allowedOdooIds.has(normalizeOdooUserId(owner))));
  const allowedLeadIds = new Set(allowedLeads.map(lead => lead.sourceLeadId));
  return {
    ...parsed,
    leads: allowedLeads,
    messages: parsed.messages.filter(message => allowedLeadIds.has(message.sourceLeadId)),
    excludedLeadCount: parsed.leads.length - allowedLeads.length,
  };
}

function mergeLeads(existingLeads, importedLeads) {
  const merged = new Map(existingLeads.map(lead => [lead.sourceLeadId, lead]));
  importedLeads.forEach(incoming => {
    const previous = merged.get(incoming.sourceLeadId) || {};
    merged.set(incoming.sourceLeadId, {
      sourceLeadId: incoming.sourceLeadId,
      opportunity: incoming.opportunity || previous.opportunity || "",
      contact: incoming.contact || previous.contact || "",
      phone: incoming.phone || previous.phone || "",
      city: incoming.city || previous.city || "",
      salesperson: incoming.salesperson || previous.salesperson || "",
      stage: incoming.stage || previous.stage || "",
      revenue: incoming.revenue || previous.revenue || 0,
      tags: incoming.tagsProvided ? incoming.tags : (previous.tags || []),
      ownerOdooIds: incoming.ownerOdooIds?.length ? incoming.ownerOdooIds : (previous.ownerOdooIds || []),
      lastImportedAt: incoming.lastImportedAt,
    });
  });
  return Array.from(merged.values());
}

function leadHasChanged(existing, incoming) {
  const fields = ["opportunity", "contact", "phone", "city", "salesperson", "stage", "revenue"];
  if (fields.some(field => String(existing[field] || "") !== String(incoming[field] || ""))) return true;
  if (incoming.tagsProvided) {
    const existingTags = splitTags(existing.tags).sort().join("|");
    const incomingTags = splitTags(incoming.tags).sort().join("|");
    if (existingTags !== incomingTags) return true;
  }
  return splitTags(existing.ownerOdooIds).sort().join("|") !== splitTags(incoming.ownerOdooIds).sort().join("|");
}

function analyseConversation(text, type, createdAt) {
  const normal = normalizeText(text);
  const typeNormal = normalizeText(type);
  const empty = { status: "Empty", meaningful: false, interested: false, salesSignal: "None", nextAction: "", followUpDate: "", confidence: "High" };
  if (!text) return empty;
  if (typeNormal.includes("system")) return { ...empty, status: "System" };
  if (isAutomatedAcknowledgement(normal) || normal.includes("lead enrichment")) return { ...empty, status: "Automated" };

  const followUpDate = extractFollowUpDate(normal, createdAt);
  const hasDetailsSent = /(details? (send|sent|diya)|send details|catalog|brochure|quotation send|send quotation)/.test(normal);
  const hasScheduledVisit = /(aaj|kal|parso|today|tomorrow|next|after|baad|week|month|season|winter|summer|diwali|deewali|chathh|taarikh|tarikh|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|mon|sun).*(visit|aayenge|aane|connect|call|lene)|(?:visit|aayenge|aane|connect|call|lene).*(aaj|kal|parso|today|tomorrow|next|after|baad|week|month|season|winter|summer|diwali|deewali|chathh|taarikh|tarikh|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|mon|sun)/.test(normal);
  const hasCompletedVisit = /(visit (kiye|kiye hai|krke|karke|kr chuke|jaa chuke)|aaye hue|aa chuke)/.test(normal);
  const hasFinancialPause = /(paise? ka problem|paisa.*problem|finance|loan|emi)/.test(normal);
  const hasFuturePlan = /(next season|winter|summer|season aane|plan.*(lene|purchase)|lene ka)/.test(normal);
  const hasCallback = (!hasCompletedVisit || hasFuturePlan) && (/(call ?back|callback|next season|next month|next week|plan (kar|kr)|plan hoga|soch kr|time milega|busy.*free|baad plan|inform karenge|inform krenge|khud.*call)/.test(normal) || Boolean(followUpDate) || hasScheduledVisit);
  const hasStrongInterest = /(interested|intrested|quotation|quote|price|rate|lena hai|lene ka|purchase karenge|finance|loan|emi|[0-9]+\s*(pc|pcs|piece|counter|liter)|visit (kiye|kiye hai|krke|karke|kr chuke|jaa chuke)|aa rahe|meeting|demo)/.test(normal);

  if (/(purchased|purchase done|purchased done|purchasing done|order booked|order confirm|converted|sold|booking done)/.test(normal)) {
    return conversationResult("Converted", false, "Won", "Record sale / hand over to fulfilment", "", "High");
  }
  if (/(not interested|no requirement|no requirment|not require|not needed|requirement nahi|requirment nahi|abhi .*requirement nahi|abhi .*recuriment nahi|nahi lena|nhi lena|third party|wrong number|invalid number|behave not good)/.test(normal) && !hasFinancialPause) {
    return conversationResult("Not interested", false, "Low", "Close or archive unless the customer contacts again", "", "High");
  }
  if (/(call.*not (receive|received|connect)|not (receive|received)|not pick|\bn\s*\.?\s*r\s*\.?\b|switch(?:ed)? off|not reachable|incoming not available|call (nahi|nhi) receive)/.test(normal)) {
    return conversationResult("Not connected", false, "None", "Try contact again", "", "High");
  }
  if (hasCallback) {
    return conversationResult("Callback", hasStrongInterest || hasScheduledVisit, hasStrongInterest ? "High" : "Possible", followUpDate ? "Contact on the planned date" : "Schedule the next follow-up", followUpDate, followUpDate ? "High" : "Review");
  }
  if (hasStrongInterest) {
    return conversationResult("Interested", true, "High", "Prioritise sales follow-up", "", "High");
  }
  if (hasDetailsSent) {
    return conversationResult("Follow-up sent", false, "Warm", "Confirm the customer received the details", "", "High");
  }
  if (/(whatsapp.*baat|baat.*whatsapp|store.*baat|number diye)/.test(normal)) {
    return conversationResult("Needs review", false, "Possible", "Read the note and set a follow-up", "", "Review");
  }
  return conversationResult("Needs review", false, "Unknown", "Read and label manually", "", "Review");
}

function conversationResult(status, interested, salesSignal, nextAction, followUpDate, confidence) {
  return { status, meaningful: true, interested, salesSignal, nextAction, followUpDate, confidence };
}

function extractFollowUpDate(text, createdAt) {
  const base = parseDate(createdAt);
  if (!base) return "";
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const relative = text.match(/(?:^|\s)(?:after\s*)?(\d+(?:\.\d+)?)\s*(?:-|to|ya|yaa)?\s*(\d+(?:\.\d+)?)?\s*(din|day|days|week|weeks|month|months)\s*(?:me|baad|later|ke andar|ke baad)?/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[3];
    if (/week/.test(unit)) date.setDate(date.getDate() + amount * 7);
    else if (/month/.test(unit)) {
      if (Number.isInteger(amount)) date.setMonth(date.getMonth() + amount);
      else date.setDate(date.getDate() + Math.round(amount * 30));
    }
    else date.setDate(date.getDate() + amount);
    return date.toISOString();
  }
  if (/\b(aaj|today)\b/.test(text)) return date.toISOString();
  if (/\b(kal|tomorrow)\b/.test(text)) { date.setDate(date.getDate() + 1); return date.toISOString(); }
  if (/\b(parso|day after tomorrow)\b/.test(text)) { date.setDate(date.getDate() + 2); return date.toISOString(); }
  if (/next week/.test(text)) { date.setDate(date.getDate() + 7); return date.toISOString(); }
  if (/next month/.test(text)) { date.setMonth(date.getMonth() + 1); return date.toISOString(); }
  if (/(?:this|es|is) week/.test(text)) { date.setDate(date.getDate() + 7); return date.toISOString(); }
  if (/end of month/.test(text)) return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString();
  const weekdays = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const weekday = text.match(/\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/);
  if (weekday) {
    const targetDay = weekdays[weekday[1]];
    const daysAhead = (targetDay - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysAhead);
    return date.toISOString();
  }
  const monthNames = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const namedDate = text.match(/\b(\d{1,2})\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (namedDate) {
    const named = new Date(date.getFullYear(), monthNames[namedDate[2]], Number(namedDate[1]));
    if (named.getTime() < date.getTime() - 86400000) named.setFullYear(named.getFullYear() + 1);
    return named.toISOString();
  }
  const monthOnly = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(?:me|tk|tak|mein)?\b/);
  if (monthOnly) {
    const named = new Date(date.getFullYear(), monthNames[monthOnly[1]], 1);
    if (named.getMonth() < date.getMonth()) named.setFullYear(named.getFullYear() + 1);
    return named.toISOString();
  }
  return "";
}

function isAutomatedAcknowledgement(text) {
  return text.includes("thank you for reaching out") && text.includes("call you back shortly");
}

function renderCurrentData() {
  const leads = state.pending ? state.pending.mergedLeads : state.leads;
  const messages = state.pending ? state.pending.mergedMessages : state.messages;
  renderDataset(leads, messages);
}

function renderDataset(leads, messages) {
  const rows = buildViewRows(leads, messages, selectedPeriodRange());
  state.viewRows = rows;
  state.stats = buildStats(rows);
  state.filteredRows = filterRows(rows);
  renderSummary(state.stats);
  renderInsights(state.stats);
  renderFilterOptions(rows);
  renderPreview(state.filteredRows);
  const enabled = rows.length > 0;
  downloadBtn.disabled = !enabled;
  whatsappBtn.disabled = !enabled;
}

function selectedPeriodRange() {
  if (dayFilter.value) {
    const parts = dayFilter.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) return null;
    const start = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    const end = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + 1);
    return {
      start,
      end,
      label: start.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      fileKey: dayFilter.value.replace(/-/g, ""),
    };
  }
  const value = monthFilter.value;
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  const end = new Date(Number(match[1]), Number(match[2]), 1);
  return {
    start,
    end,
    label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    fileKey: monthFilter.value.replace("-", ""),
  };
}

function buildViewRows(leads, messages, period) {
  const messagesByLead = new Map();
  messages.forEach(message => {
    if (!messagesByLead.has(message.sourceLeadId)) messagesByLead.set(message.sourceLeadId, []);
    messagesByLead.get(message.sourceLeadId).push(message);
  });
  return leads.map(lead => {
    const allMessages = (messagesByLead.get(lead.sourceLeadId) || []).map(message => ({
      ...message,
      // Reanalyse saved history so improvements to the rules also correct old imports.
      analysis: analyseConversation(message.body, message.messageType, message.createdAt),
    }))
      .sort((a, b) => eventDateValue(b.createdAt) - eventDateValue(a.createdAt));
    const asOfMessages = period ? allMessages.filter(message => eventDateValue(message.createdAt) < period.end.getTime()) : allMessages;
    const periodMessages = period
      ? asOfMessages.filter(message => eventDateValue(message.createdAt) >= period.start.getTime())
      : asOfMessages;
    const meaningfulAsOf = asOfMessages.filter(message => message.analysis?.meaningful);
    const meaningfulPeriod = periodMessages.filter(message => message.analysis?.meaningful);
    if (period && !meaningfulPeriod.length) return null;
    const latest = meaningfulAsOf[0] || null;
    const currentStatus = latest?.analysis?.status || "No conversation";
    const followUpDate = latest?.analysis?.followUpDate || "";
    const followUpState = getFollowUpState(followUpDate);
    const historyEvents = (period ? meaningfulPeriod : meaningfulAsOf).slice(0, 100);
    const lastActivity = latest?.createdAt || "";
    const days = daysSince(lastActivity);
    const isStale = days !== null && days >= getStaleDays();
    const isActive7 = days !== null && days <= 7;
    return {
      sourceLeadId: lead.sourceLeadId,
      opportunity: lead.opportunity || "",
      contact: lead.contact || "",
      phone: lead.phone || "",
      city: lead.city || "",
      salesperson: lead.salesperson || "Unassigned",
      stage: lead.stage || "Blank",
      revenue: Number(lead.revenue || 0),
      tags: Array.isArray(lead.tags) ? lead.tags : splitTags(lead.tags),
      conversationStatus: currentStatus,
      interested: Boolean(latest?.analysis?.interested),
      salesSignal: latest?.analysis?.salesSignal || "None",
      nextAction: latest?.analysis?.nextAction || "",
      followUpDate,
      followUpState,
      lastActivity,
      daysSinceActivity: days,
      messageCount: meaningfulPeriod.length,
      allMessageCount: allMessages.length,
      history: historyEvents.map(message => "[" + formatDate(message.createdAt) + "] " + message.analysis.status + " — " + message.body).join("\n"),
      isStale,
      isActive7,
      isDueToday: followUpState === "Due today",
      isOverdue: followUpState === "Overdue",
      periodFirstActivity: meaningfulPeriod.length ? meaningfulPeriod[meaningfulPeriod.length - 1].createdAt : "",
    };
  }).filter(Boolean).sort((a, b) => eventDateValue(b.lastActivity) - eventDateValue(a.lastActivity));
}

function buildStats(rows) {
  const dates = rows.flatMap(row => row.lastActivity ? [row.lastActivity] : []);
  return {
    totalLeads: rows.length,
    totalMessages: rows.reduce((sum, row) => sum + row.messageCount, 0),
    firstActivity: dates.length ? formatDate(new Date(Math.min(...dates.map(eventDateValue)))) : "-",
    lastActivity: dates.length ? formatDate(new Date(Math.max(...dates.map(eventDateValue)))) : "-",
    interested: rows.filter(row => row.interested).length,
    callback: rows.filter(row => row.conversationStatus === "Callback").length,
    notConnected: rows.filter(row => row.conversationStatus === "Not connected").length,
    dueToday: rows.filter(row => row.isDueToday).length,
    overdue: rows.filter(row => row.isOverdue).length,
    needsReview: rows.filter(row => row.conversationStatus === "Needs review").length,
    staleLeads: rows.filter(row => row.isStale).length,
    stages: countBy(rows, "stage"),
    salespeople: countBy(rows, "salesperson"),
    tags: countTags(rows),
    statuses: countBy(rows, "conversationStatus"),
  };
}

function filterRows(rows) {
  const query = normalizeText(searchInput.value);
  const stage = stageFilter.value;
  const salesperson = salespersonFilter.value;
  const tag = tagFilter.value;
  const conversation = conversationFilter.value;
  const flag = flagFilter.value;
  return rows.filter(row => {
    const text = normalizeText([
      row.sourceLeadId, row.opportunity, row.contact, row.phone, row.city, row.salesperson,
      row.stage, row.tags.join(" "), row.conversationStatus, row.salesSignal, row.nextAction, row.followUpState, row.history,
    ].join(" "));
    if (query && !text.includes(query)) return false;
    if (stage && row.stage !== stage) return false;
    if (salesperson && row.salesperson !== salesperson) return false;
    if (tag && !row.tags.includes(tag)) return false;
    if (conversation && row.conversationStatus !== conversation) return false;
    if (flag === "stale" && !row.isStale) return false;
    if (flag === "active7" && !row.isActive7) return false;
    if (flag === "dueToday" && !row.isDueToday) return false;
    if (flag === "overdue" && !row.isOverdue) return false;
    if (flag === "interested" && !row.interested) return false;
    if (flag === "review" && row.conversationStatus !== "Needs review") return false;
    return true;
  });
}

function renderSummary(stats) {
  const period = selectedPeriodRange();
  const leadLabel = period ? "Leads active in " + period.label : "Total Leads";
  const messageLabel = period ? "Messages in " + period.label : "Meaningful Messages";
  periodCaption.textContent = period ? period.label : "All saved history";
  summaryEl.innerHTML =
    metric(stats.totalLeads, leadLabel, "") +
    metric(stats.totalMessages, messageLabel, "") +
    metric(stats.firstActivity, "First Activity", "") +
    metric(stats.lastActivity, "Last Activity", "") +
    metric(stats.interested, "Interested", "good") +
    metric(stats.callback, "Callback", "warn") +
    metric(stats.dueToday, "Follow-up due today", "warn") +
    metric(stats.overdue, "Overdue follow-ups", "warn") +
    metric(stats.notConnected, "Not Connected", "") +
    metric(stats.needsReview, "Needs review", "") +
    metric(stats.staleLeads, "Stale Leads", "warn");
}

function metric(value, label, variant) {
  return '<div class="metric ' + variant + '"><strong>' + escapeHtml(value) + "</strong><span>" + escapeHtml(label) + "</span></div>";
}

function renderInsights(stats) {
  insightsEl.innerHTML =
    insightBox("Top Stages", stats.stages) +
    insightBox("Employee Activity", stats.salespeople) +
    insightBox("Top Tags", stats.tags) +
    insightBox("Conversation Outcomes", stats.statuses);
}

function insightBox(title, data) {
  const entries = topEntries(data, 5);
  const items = entries.length
    ? entries.map(entry => "<li>" + escapeHtml(entry[0]) + " - " + entry[1] + "</li>").join("")
    : "<li>No data yet</li>";
  return '<div class="insight"><h3>' + escapeHtml(title) + "</h3><ol>" + items + "</ol></div>";
}

function renderFilterOptions(rows) {
  keepSelectOptions(stageFilter, "All stages", uniqueValues(rows, "stage"));
  keepSelectOptions(salespersonFilter, "All salespeople", uniqueValues(rows, "salesperson"));
  keepSelectOptions(tagFilter, "All tags", Array.from(new Set(rows.flatMap(row => row.tags))).filter(Boolean).sort());
  keepSelectOptions(conversationFilter, "All conversation statuses", uniqueValues(rows, "conversationStatus"));
}

function keepSelectOptions(select, label, values) {
  const current = select.value;
  select.innerHTML = '<option value="">' + escapeHtml(label) + "</option>" + values
    .map(value => '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>")
    .join("");
  if (values.includes(current)) select.value = current;
}

function renderPreview(rows) {
  tbody.innerHTML = "";
  rows.slice(0, 100).forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + flagBadges(row) + "</td>" +
      "<td>" + escapeHtml(row.opportunity) + "</td>" +
      "<td>" + escapeHtml(row.contact) + "</td>" +
      "<td>" + escapeHtml(row.phone) + "</td>" +
      "<td>" + escapeHtml(row.city) + "</td>" +
      "<td>" + escapeHtml(row.salesperson) + "</td>" +
      "<td>" + escapeHtml(row.stage) + "</td>" +
      "<td>" + statusPill(row.conversationStatus) + "</td>" +
      "<td>" + escapeHtml(row.salesSignal) + "</td>" +
      "<td>" + escapeHtml(row.nextAction) + "</td>" +
      "<td>" + escapeHtml(formatFollowUp(row)) + "</td>" +
      "<td>" + escapeHtml(row.tags.join(", ")) + "</td>" +
      "<td>" + escapeHtml(formatDate(row.lastActivity)) + "</td>" +
      "<td>" + row.messageCount + "</td>" +
      '<td class="history-cell">' + escapeHtml(row.history.split("\n").slice(0, 3).join("\n")) + "</td>";
    tbody.appendChild(tr);
  });
  table.hidden = rows.length === 0;
  emptyPreview.hidden = rows.length > 0;
  emptyPreview.textContent = state.viewRows.length
    ? "No leads match the current filters."
    : "Upload an Odoo export or load saved history to see the tracker.";
}

function statusPill(status) {
  return '<span class="status-pill ' + statusClass(status) + '">' + escapeHtml(status) + "</span>";
}

function statusClass(status) {
  return normalizeText(status).replace(/\s+/g, "-");
}

function flagBadges(row) {
  const badges = [];
  if (row.isStale) badges.push('<span class="badge stale">Stale</span>');
  if (row.isActive7) badges.push('<span class="badge hot">Active 7 Days</span>');
  if (row.isDueToday) badges.push('<span class="badge hot">Due today</span>');
  if (row.isOverdue) badges.push('<span class="badge stale">Overdue</span>');
  return badges.length ? badges.join(" ") : '<span class="badge">OK</span>';
}

async function savePendingImport() {
  if (!state.pending) return;
  try {
    if (persistenceMode === "firebase" && !state.user) throw new Error("Sign in before saving.");
    setStatus("Saving import history...", "");
    const importRecord = {
      id: "import_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      sourceName: state.sourceName,
      importedAt: new Date().toISOString(),
      totalRows: state.pending.totalRows,
      newLeadCount: state.pending.newLeadCount,
    newMessageCount: state.pending.importMessages.length,
      skippedDuplicateMessages: state.pending.skippedDuplicateMessages,
      storageMode: persistenceMode,
      uploadedByUid: state.user?.uid || "local",
      uploadedByEmail: state.user?.email || "Local admin",
    };
    const upsertLeads = mergeLeads(state.leads, state.pending.parsedLeads);
    const saveResult = await saveImportedData({
      leads: persistenceMode === "firebase"
        ? state.pending.importLeads
        : upsertLeads.filter(lead => state.pending.parsedLeads.some(item => item.sourceLeadId === lead.sourceLeadId)),
      newMessages: persistenceMode === "firebase" ? state.pending.importMessages : state.pending.newMessages,
      importRecord,
    });
    if (persistenceMode === "firebase") {
      state.pending = null;
      saveImportBtn.disabled = true;
      await loadHistory(false);
      setStatus(
        "Saved permanently. Added " + Number(saveResult.newMessageCount || 0) + " new messages; " +
        Number(saveResult.skippedDuplicateMessages || 0) + " existing Message IDs were ignored.",
        "good"
      );
      return;
    }
    state.leads = state.pending.mergedLeads;
    state.messages = state.pending.mergedMessages;
    state.imports = [importRecord].concat(state.imports);
    state.pending = null;
    state.dataReady = true;
    saveImportBtn.disabled = true;
    renderCurrentData();
    setStatus(
      "Saved permanently. Added " + importRecord.newMessageCount + " new messages; " +
      importRecord.skippedDuplicateMessages + " existing Message IDs were ignored.",
      "good"
    );
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not save the import.", "bad");
  }
}

function downloadReport() {
  const rows = state.filteredRows;
  if (!rows.length || !window.XLSX) return;
  const period = selectedPeriodRange();
  const periodLabel = period ? period.label : "All saved history";
  const reportRows = rows.map(workbookRow);
  const reportAoa = [
    ["KASERA INDUSTRIES - CRM LEAD TRACKER"],
    ["Period: " + periodLabel + "   |   Leads: " + rows.length + "   |   Generated: " + formatDate(new Date())],
    [],
    reportColumns,
  ].concat(reportRows);
  const summaryAoa = buildSummarySheetRows(periodLabel);
  const workbook = XLSX.utils.book_new();
  const reportSheet = XLSX.utils.aoa_to_sheet(reportAoa);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
  styleReportSheet(reportSheet, XLSX.utils.decode_range(reportSheet["!ref"]));
  styleSummarySheet(summarySheet, XLSX.utils.decode_range(summarySheet["!ref"]));
  XLSX.utils.book_append_sheet(workbook, reportSheet, "Lead Report");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Monthly Summary");
  XLSX.writeFile(workbook, "Kasera_Lead_Tracker_" + (period?.fileKey || "All_History") + ".xlsx");
  setStatus("Report downloaded.", "good");
}

function workbookRow(row) {
  return [
    buildFlag(row),
    row.sourceLeadId,
    row.opportunity,
    row.contact,
    row.phone,
    row.city,
    row.salesperson,
    row.stage,
    row.tags.join(", "),
    row.conversationStatus,
    row.salesSignal,
    row.nextAction,
    formatDate(row.followUpDate),
    row.followUpState,
    formatDate(row.lastActivity),
    row.daysSinceActivity === null ? "" : row.daysSinceActivity,
    row.messageCount,
    row.history,
  ];
}

function buildSummarySheetRows(periodLabel) {
  return [
    ["KASERA INDUSTRIES - LEAD TRACKER SUMMARY"],
    ["Period: " + periodLabel + " | Generated: " + formatDate(new Date())],
    [],
    ["Metric", "Value"],
    ["Active Leads", state.stats.totalLeads],
    ["Meaningful Messages", state.stats.totalMessages],
    ["Interested Leads", state.stats.interested],
    ["Callback Leads", state.stats.callback],
    ["Follow-up Due Today", state.stats.dueToday],
    ["Overdue Follow-ups", state.stats.overdue],
    ["Not Connected", state.stats.notConnected],
    ["Needs Review", state.stats.needsReview],
    ["Stale Leads", state.stats.staleLeads],
    ["First Activity", state.stats.firstActivity],
    ["Last Activity", state.stats.lastActivity],
    [],
    ["Employee", "Lead Count"],
  ].concat(topEntries(state.stats.salespeople, 100), [
    [],
    ["Tag", "Lead Count"],
  ], topEntries(state.stats.tags, 100), [
    [],
    ["Conversation Status", "Lead Count"],
  ], topEntries(state.stats.statuses, 100), [
    [],
    ["Stage", "Lead Count"],
  ], topEntries(state.stats.stages, 100));
}

function styleReportSheet(ws, range) {
  ws["!merges"] = [XLSX.utils.decode_range("A1:R1"), XLSX.utils.decode_range("A2:R2")];
  ws["!cols"] = [
    { wch: 15 }, { wch: 33 }, { wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 25 },
    { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 75 },
  ];
  ws["!autofilter"] = { ref: "A4:R" + (range.e.r + 1) };
  ws["!rows"] = Array.from({ length: range.e.r + 1 }, (_, index) => {
    if (index === 0) return { hpt: 24 };
    if (index === 1) return { hpt: 20 };
    if (index === 3) return { hpt: 28 };
    return index >= 4 ? { hpt: 58 } : { hpt: 12 };
  });
  applyCellStyle(ws, "A1", titleStyle());
  applyCellStyle(ws, "A2", subtitleStyle());
  for (let column = 0; column <= 17; column += 1) {
    applyCellStyle(ws, XLSX.utils.encode_cell({ r: 3, c: column }), headerStyle());
  }
  for (let row = 4; row <= range.e.r; row += 1) {
    const flag = String(ws["A" + (row + 1)]?.v || "");
    const fill = flag.includes("Stale") ? "FFF7ED" : row % 2 === 1 ? "F8FBFF" : "";
    for (let column = 0; column <= 13; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = ws[address] || { t: "s", v: "" };
      cell.s = bodyStyle(fill, column === 13, column === 11 || column === 12);
      ws[address] = cell;
    }
  }
}

function styleSummarySheet(ws, range) {
  ws["!merges"] = [XLSX.utils.decode_range("A1:D1"), XLSX.utils.decode_range("A2:D2")];
  ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
  applyCellStyle(ws, "A1", titleStyle());
  applyCellStyle(ws, "A2", subtitleStyle());
  for (let row = 0; row <= range.e.r; row += 1) {
    const first = String(ws["A" + (row + 1)]?.v || "");
    if (["Metric", "Employee", "Tag", "Conversation Status", "Stage"].includes(first)) {
      applyCellStyle(ws, XLSX.utils.encode_cell({ r: row, c: 0 }), headerStyle());
      applyCellStyle(ws, XLSX.utils.encode_cell({ r: row, c: 1 }), headerStyle());
    } else {
      for (let column = 0; column <= 1; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        if (ws[address]) ws[address].s = bodyStyle(row % 2 ? "F8FBFF" : "", false, column === 1);
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
  const period = selectedPeriodRange();
  const text = [
    "Kasera CRM Lead Summary",
    "Period: " + (period ? period.label : "All history"),
    "Total Leads: " + state.stats.totalLeads,
    "Meaningful Messages: " + state.stats.totalMessages,
    "Interested: " + state.stats.interested,
    "Callback: " + state.stats.callback,
    "Follow-up due today: " + state.stats.dueToday,
    "Overdue follow-ups: " + state.stats.overdue,
    "Not Connected: " + state.stats.notConnected,
    "Needs review: " + state.stats.needsReview,
    "Stale Leads: " + state.stats.staleLeads,
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Summary copied. You can paste it in WhatsApp.", "good");
  } catch {
    setStatus(text, "good");
  }
}

function buildFlag(row) {
  const flags = [];
  if (row.isStale) flags.push("Stale");
  if (row.isActive7) flags.push("Active 7 Days");
  if (row.isDueToday) flags.push("Due today");
  if (row.isOverdue) flags.push("Overdue");
  return flags.join(", ") || "OK";
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
    row.tags.forEach(tag => {
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

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeOdooUserId(value) {
  return String(value || "").trim().toLowerCase();
}

function isAdmin() {
  return persistenceMode === "local" || state.profile?.role === "admin";
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
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
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
  return new Date(Number(parts[3].length === 2 ? "20" + parts[3] : parts[3]), Number(parts[2]) - 1, Number(parts[1]));
}

function toIsoDate(value) {
  const date = parseDate(value);
  return date ? date.toISOString() : "";
}

function eventDateValue(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function daysSince(value) {
  const time = eventDateValue(value);
  if (!time) return null;
  const date = new Date(time);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.floor((startToday - startDate) / 86400000));
}

function getFollowUpState(value) {
  const time = eventDateValue(value);
  if (!time) return "Not scheduled";
  const dueDate = new Date(time);
  const today = new Date();
  const startDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const difference = Math.round((startDue - startToday) / 86400000);
  if (difference < 0) return "Overdue";
  if (difference === 0) return "Due today";
  if (difference <= 7) return "Due in " + difference + " day" + (difference === 1 ? "" : "s");
  return "Scheduled";
}

function formatFollowUp(row) {
  if (!row.followUpDate) return "Not scheduled";
  return formatDate(row.followUpDate) + " · " + row.followUpState;
}

function getStaleDays() {
  const value = Number(staleDaysInput.value);
  return Number.isFinite(value) && value > 0 ? value : 15;
}

function formatDate(value) {
  const time = eventDateValue(value);
  if (!time) return "";
  const date = new Date(time);
  const day = String(date.getDate()).padStart(2, "0");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()];
  return day + "-" + month + "-" + date.getFullYear();
}

function resetPreview() {
  state.pending = null;
  state.sourceName = "";
  state.rawRows = [];
  state.headers = [];
  state.headerIndex = -1;
  state.mapping = null;
  fileInput.value = "";
  fileNameEl.textContent = state.leads.length ? "Showing saved history" : "No file selected";
  saveImportBtn.disabled = true;
  resetBtn.disabled = !state.leads.length;
  hideMapping();
  renderCurrentData();
  setStatus(state.leads.length ? savedHistoryMessage() : "Ready. Select the raw Odoo lead export to begin.", "");
}

function emptyStats() {
  return {
    totalLeads: 0,
    totalMessages: 0,
    firstActivity: "-",
    lastActivity: "-",
    interested: 0,
    callback: 0,
    notConnected: 0,
    staleLeads: 0,
    stages: {},
    salespeople: {},
    tags: {},
    statuses: {},
  };
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = ("status " + (type || "")).trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
