import { createSupabaseClient } from "./supabaseClient.js";

const config = {
  supabaseUrl:
    window.STATURA_ADMIN_CONFIG?.supabaseUrl ||
    localStorage.getItem("statura.admin.supabaseUrl") ||
    "https://kshjwwuacpxjkoqvosva.supabase.co",
  supabaseAnonKey:
    window.STATURA_ADMIN_CONFIG?.supabaseAnonKey ||
    localStorage.getItem("statura.admin.supabaseAnonKey") ||
    ""
};

const state = {
  client: null,
  session: null,
  profile: null,
  view: "dashboard",
  reportsStatus: "open",
  selectedReport: null,
  selectedThreadId: null
};

const el = {
  authPanel: document.querySelector("#authPanel"),
  contentRoot: document.querySelector("#contentRoot"),
  connectionState: document.querySelector("#connectionState"),
  pageTitle: document.querySelector("#pageTitle"),
  refreshButton: document.querySelector("#refreshButton"),
  signOutButton: document.querySelector("#signOutButton"),
  connectButton: document.querySelector("#connectButton"),
  supabaseUrlInput: document.querySelector("#supabaseUrlInput"),
  supabaseAnonInput: document.querySelector("#supabaseAnonInput"),
  loginInput: document.querySelector("#loginInput"),
  passwordInput: document.querySelector("#passwordInput")
};

el.supabaseUrlInput.value = config.supabaseUrl;
el.supabaseAnonInput.value = config.supabaseAnonKey;

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document
      .querySelectorAll(".nav-item")
      .forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

el.refreshButton.addEventListener("click", () => render());
el.connectButton.addEventListener("click", () => connectAndLogin());
el.signOutButton.addEventListener("click", () => signOut());

boot();

async function boot() {
  try {
    if (!config.supabaseAnonKey) {
      setConnection("Config required", "warning");
      return;
    }
    state.client = await createSupabaseClient(config);
    const { data } = await state.client.auth.getSession();
    state.session = data.session;
    if (state.session) await loadProfile();
    updateAuthVisibility();
    if (state.profile?.role === "admin") render();
  } catch (error) {
    setConnection(error.message, "danger");
  }
}

async function connectAndLogin() {
  const supabaseUrl = el.supabaseUrlInput.value.trim();
  const supabaseAnonKey = el.supabaseAnonInput.value.trim();
  const login = el.loginInput.value.trim();
  const password = el.passwordInput.value;
  if (!supabaseUrl || !supabaseAnonKey || !login || !password) {
    toast("Fill all fields before signing in", "warning");
    return;
  }

  localStorage.setItem("statura.admin.supabaseUrl", supabaseUrl);
  localStorage.setItem("statura.admin.supabaseAnonKey", supabaseAnonKey);
  state.client = await createSupabaseClient({ supabaseUrl, supabaseAnonKey });

  const payload = login.includes("@")
    ? { email: login, password }
    : { phone: login, password };
  const { data, error } = await state.client.auth.signInWithPassword(payload);
  if (error) {
    toast(error.message, "danger");
    return;
  }
  state.session = data.session;
  await loadProfile();
  updateAuthVisibility();
  render();
}

async function signOut() {
  if (state.client) await state.client.auth.signOut();
  state.session = null;
  state.profile = null;
  updateAuthVisibility();
  setConnection("Signed out", "neutral");
}

async function loadProfile() {
  const user = state.session?.user;
  if (!user) return;
  const { data, error } = await state.client
    .from("profiles")
    .select("id, name, phone, role, created_at")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  state.profile = data;
  if (data.role !== "admin") {
    setConnection("Signed in user is not admin", "danger");
    return;
  }
    setConnection(`Admin: ${data.name || data.phone || data.id}`, "success");
}

function updateAuthVisibility() {
  const adminReady = state.session && state.profile?.role === "admin";
  el.authPanel.hidden = adminReady;
  el.contentRoot.hidden = !adminReady;
  el.signOutButton.hidden = !state.session;
}

async function render() {
  if (!state.client || state.profile?.role !== "admin") {
    updateAuthVisibility();
    return;
  }
  const title = {
    dashboard: "Dashboard",
    reports: "Reports",
    content: "Trainer content",
    messages: "Chat messages",
    aichats: "AI conversations",
    users: "Users",
    audit: "Audit log"
  }[state.view];
  el.pageTitle.textContent = title;
  el.contentRoot.innerHTML = document.querySelector("#loadingTemplate").innerHTML;

  try {
    if (state.view === "dashboard") await renderDashboard();
    if (state.view === "reports") await renderReports();
    if (state.view === "content") await renderTrainerContent();
    if (state.view === "messages") await renderMessages();
    if (state.view === "aichats") await renderAiChats();
    if (state.view === "users") await renderUsers();
    if (state.view === "audit") await renderAudit();
  } catch (error) {
    el.contentRoot.innerHTML = stateBlock("Could not load data", error.message);
  }
}

async function renderDashboard() {
  const [reports, messages, content, audit, profiles] = await Promise.all([
    countRows("content_reports", [["status", "eq", "open"]]),
    countRows("chat_messages", [["moderation_status", "in", ["flagged", "hidden"]]]),
    countRows("trainer_content", [["moderation_status", "in", ["flagged", "hidden"]]]),
    listRows("moderation_actions", "created_at", 8),
    listRows("profiles", "created_at", 8)
  ]);

  el.contentRoot.innerHTML = `
    <div class="metrics">
      ${metric("Open reports", reports, "warning")}
      ${metric("Flagged messages", messages, "danger")}
      ${metric("Flagged content", content, "danger")}
      ${metric("Recent users", profiles.length, "neutral")}
    </div>
    <div class="grid two">
      <section class="panel">
        <div class="panel-header"><h2>Recent moderation actions</h2></div>
        ${audit.length ? audit.map(actionRow).join("") : empty("No actions yet")}
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Newest profiles</h2></div>
        ${profiles.map(userRow).join("")}
      </section>
    </div>
  `;
}

async function renderReports() {
  const reports = await fetchReports(state.reportsStatus);
  el.contentRoot.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Moderation queue</p>
          <h2>${capitalize(state.reportsStatus)} reports</h2>
        </div>
        <div class="segmented">
          ${["open", "reviewing", "resolved", "dismissed"]
            .map(
              (status) =>
                `<button class="${state.reportsStatus === status ? "active" : ""}" data-status="${status}">${status}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="split">
        <div class="list">${reports.length ? reports.map(reportRow).join("") : empty("No reports in this state")}</div>
        <div class="detail" id="reportDetail">${empty("Select a report to inspect target data")}</div>
      </div>
    </section>
  `;

  el.contentRoot.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportsStatus = button.dataset.status;
      state.selectedReport = null;
      renderReports();
    });
  });
  el.contentRoot.querySelectorAll("[data-report-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedReport = reports.find((report) => report.id === button.dataset.reportId);
      await renderReportDetail();
    });
  });
}

async function renderReportDetail() {
  const report = state.selectedReport;
  const detail = el.contentRoot.querySelector("#reportDetail");
  if (!report) return;
  const target = await loadTarget(report);
  detail.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">${report.target_type}</p>
        <h2>${report.reason}</h2>
      </div>
      ${badge(report.status)}
    </div>
    <dl class="facts">
      <div><dt>Target ID</dt><dd>${escapeHtml(report.target_id)}</dd></div>
      <div><dt>Reporter</dt><dd>${escapeHtml(report.reporter_id)}</dd></div>
      <div><dt>Created</dt><dd>${formatDate(report.created_at)}</dd></div>
      <div><dt>Note</dt><dd>${escapeHtml(report.note || "No note")}</dd></div>
    </dl>
    <pre class="json">${escapeHtml(JSON.stringify(target, null, 2))}</pre>
    <div class="actions">
      ${report.target_type === "chat_message" || report.target_type === "trainer_content"
        ? `<button class="danger" data-action="hide">Hide target</button>
           <button class="danger soft" data-action="remove">Remove target</button>
           <button class="secondary" data-action="restore">Restore target</button>`
        : ""}
      <button class="secondary" data-action="resolve_report">Resolve</button>
      <button class="ghost" data-action="dismiss_report">Dismiss</button>
    </div>
  `;
  detail.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => moderateReport(report.id, button.dataset.action));
  });
}

async function renderTrainerContent() {
  const rows = await state.client
    .from("trainer_content")
    .select("id, trainer_id, kind, title, visibility, moderation_status, usage_count, moderation_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(80);
  if (rows.error) throw rows.error;
  el.contentRoot.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">UGC library</p>
          <h2>Trainer content</h2>
        </div>
        ${badge(rows.data.length)}
      </div>
      <div class="content-list">
        ${rows.data.length ? rows.data.map(contentModerationRow).join("") : empty("No trainer content")}
      </div>
    </section>
  `;
  bindTargetActions();
}

async function renderMessages() {
  await renderThreadConsole({ onlyAi: false });
}

async function renderAiChats() {
  await renderThreadConsole({ onlyAi: true });
}

async function renderUsers() {
  const rows = await state.client
    .from("profiles")
    .select("id, name, phone, role, moderation_status, moderation_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(80);
  if (rows.error) throw rows.error;
  el.contentRoot.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Account enforcement</p>
          <h2>Users</h2>
        </div>
        ${badge(rows.data.length)}
      </div>
      <div class="content-list">
        ${rows.data.length ? rows.data.map(userModerationRow).join("") : empty("No users")}
      </div>
    </section>
  `;
  el.contentRoot.querySelectorAll("[data-user-status]").forEach((button) => {
    button.addEventListener("click", () =>
      setUserStatus(button.dataset.userId, button.dataset.userStatus)
    );
  });
}

async function renderThreadConsole({ onlyAi }) {
  const { data, error } = await state.client.rpc("admin_chat_threads_overview");
  if (error) throw error;
  const aiAudit = onlyAi ? await fetchAiAudit() : [];
  const threads = (data || []).filter((thread) => !onlyAi || thread.is_ai);
  const selected =
    threads.find((thread) => thread.id === state.selectedThreadId) ||
    threads[0] ||
    null;
  state.selectedThreadId = selected?.id || null;

  el.contentRoot.innerHTML = `
    ${
      onlyAi
        ? `<section class="panel">
            <div class="panel-header">
              <div>
                <p class="eyebrow">Generation audit</p>
                <h2>AI audit trail</h2>
              </div>
              ${badge(`${aiAudit.length} records`)}
            </div>
            <div class="ai-audit-list">
              ${aiAudit.length ? aiAudit.map(aiAuditRow).join("") : empty("No AI interactions recorded yet")}
            </div>
          </section>`
        : ""
    }
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">${onlyAi ? "AI supervision" : "Support review"}</p>
          <h2>${onlyAi ? "AI conversations" : "Chat messages"}</h2>
        </div>
        ${badge(`${threads.length} threads`)}
      </div>
      <div class="split">
        <div class="list thread-list">
          ${threads.length ? threads.map(threadRow).join("") : empty("No threads")}
        </div>
        <div class="detail" id="threadDetail">${empty("Select a thread")}</div>
      </div>
    </section>
  `;

  el.contentRoot.querySelectorAll("[data-thread-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedThreadId = button.dataset.threadId;
      await renderThreadDetail();
    });
  });

  if (selected) await renderThreadDetail();
}

async function fetchAiAudit() {
  const { data, error } = await state.client.rpc("admin_ai_interactions_overview", {
    p_limit: 50
  });
  if (error) {
    return [];
  }
  return data || [];
}

async function renderThreadDetail() {
  const detail = el.contentRoot.querySelector("#threadDetail");
  if (!detail || !state.selectedThreadId) return;
  detail.innerHTML = document.querySelector("#loadingTemplate").innerHTML;
  const { data, error } = await state.client.rpc("admin_chat_thread_detail", {
    p_thread_id: state.selectedThreadId
  });
  if (error) throw error;
  if (data?.error) {
    detail.innerHTML = stateBlock("Could not load thread", data.error);
    return;
  }
  const messages = data.messages || [];
  detail.innerHTML = `
    <div class="thread-context">
      <div>
        <p class="eyebrow">Client</p>
        <strong>${personLabel(data.client)}</strong>
        <span>${escapeHtml(data.client?.phone || data.client?.id || "")}</span>
      </div>
      <div>
        <p class="eyebrow">Trainer</p>
        <strong>${personLabel(data.trainer)}</strong>
        <span>${escapeHtml(data.trainer?.phone || data.trainer?.id || "Generic AI")}</span>
      </div>
      <div>
        <p class="eyebrow">Mode</p>
        ${badge(data.thread?.is_ai ? "AI assistant" : "Human chat")}
      </div>
    </div>
    <div class="message-list">
      ${messages.length ? messages.map(messageModerationRow).join("") : empty("No messages")}
    </div>
  `;
  bindTargetActions();
}

async function renderAudit() {
  const rows = await listRows("moderation_actions", "created_at", 100);
  el.contentRoot.innerHTML = tablePanel("Audit log", rows, [
    "action",
    "target_type",
    "target_id",
    "admin_id",
    "reason",
    "created_at"
  ]);
}

async function moderateReport(reportId, action) {
  const reason = prompt("Reason for audit log", "Moderated from Statura Admin");
  if (reason === null) return;
  const { error } = await state.client.rpc("admin_moderate_report", {
    p_report_id: reportId,
    p_action: action,
    p_reason: reason
  });
  if (error) {
    toast(error.message, "danger");
    return;
  }
  toast("Moderation action applied", "success");
  await renderReports();
}

async function moderateTarget(targetType, targetId, action) {
  const reason = prompt("Reason for audit log", "Moderated from Statura Admin");
  if (reason === null) return;
  const { error } = await state.client.rpc("admin_moderate_target", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_action: action,
    p_reason: reason
  });
  if (error) {
    toast(error.message, "danger");
    return;
  }
  toast("Target moderation updated", "success");
  if (state.view === "content") await renderTrainerContent();
  if (state.view === "messages" || state.view === "aichats") await renderThreadDetail();
}

async function setUserStatus(userId, status) {
  const reason = prompt("Reason for account audit log", "Account moderation from Statura Admin");
  if (reason === null) return;
  const { error } = await state.client.rpc("admin_set_user_moderation_status", {
    p_user_id: userId,
    p_status: status,
    p_reason: reason
  });
  if (error) {
    toast(error.message, "danger");
    return;
  }
  toast(`User marked ${status}`, "success");
  await renderUsers();
}

function bindTargetActions() {
  el.contentRoot.querySelectorAll("[data-target-action]").forEach((button) => {
    button.addEventListener("click", () =>
      moderateTarget(
        button.dataset.targetType,
        button.dataset.targetId,
        button.dataset.targetAction
      )
    );
  });
}

async function fetchReports(status) {
  const { data, error } = await state.client
    .from("content_reports")
    .select("id, reporter_id, target_type, target_id, reason, note, status, created_at, resolved_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

async function loadTarget(report) {
  const table = {
    chat_message: "chat_messages",
    trainer_content: "trainer_content",
    profile: "profiles",
    review: "reviews"
  }[report.target_type];
  if (!table) return { error: "Unknown target type" };
  const { data, error } = await state.client
    .from(table)
    .select("*")
    .eq("id", report.target_id)
    .maybeSingle();
  return error ? { error: error.message } : data || { missing: true };
}

async function countRows(table, filters = []) {
  let query = state.client.from(table).select("id", { count: "exact", head: true });
  query = applyFilters(query, filters);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function listRows(table, orderBy, limit) {
  const { data, error } = await state.client
    .from(table)
    .select("*")
    .order(orderBy, { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

function applyFilters(query, filters) {
  return filters.reduce((acc, [column, op, value]) => {
    if (op === "eq") return acc.eq(column, value);
    if (op === "in") return acc.in(column, value);
    return acc;
  }, query);
}

function reportRow(report) {
  return `
    <button class="row-card" data-report-id="${report.id}">
      <span>${escapeHtml(report.reason)}</span>
      <small>${escapeHtml(report.target_type)} · ${formatDate(report.created_at)}</small>
    </button>
  `;
}

function actionRow(action) {
  return `
    <div class="data-row">
      <div>
        <strong>${escapeHtml(action.action)}</strong>
        <span>${escapeHtml(action.target_type)} · ${escapeHtml(action.target_id)}</span>
      </div>
      <time>${formatDate(action.created_at)}</time>
    </div>
  `;
}

function userRow(user) {
  return `
    <div class="data-row">
      <div>
        <strong>${escapeHtml(user.name || user.phone || user.id)}</strong>
        <span>${escapeHtml(user.role || "unknown")}</span>
      </div>
      <time>${formatDate(user.created_at)}</time>
    </div>
  `;
}

function userModerationRow(user) {
  const status = user.moderation_status || "active";
  return `
    <article class="content-row">
      <div>
        <div class="message-meta">
          <strong>${escapeHtml(user.name || user.phone || user.id)}</strong>
          ${badge(user.role || "unknown")}
          ${badge(status)}
        </div>
        <small>${escapeHtml(user.phone || "")} · ${escapeHtml(user.id)} · ${formatDate(user.created_at)}</small>
        ${user.moderation_reason ? `<p>${escapeHtml(user.moderation_reason)}</p>` : ""}
      </div>
      <div class="actions">
        <button class="secondary" data-user-id="${user.id}" data-user-status="restricted">Restrict</button>
        <button class="danger" data-user-id="${user.id}" data-user-status="suspended">Suspend</button>
        ${status !== "active" ? `<button class="ghost" data-user-id="${user.id}" data-user-status="active">Restore</button>` : ""}
      </div>
    </article>
  `;
}

function threadRow(thread) {
  const client = thread.client_name || thread.client_phone || thread.client_id;
  const trainer = thread.trainer_name || thread.trainer_phone || thread.trainer_id || "Generic AI";
  return `
    <button class="row-card thread-card ${state.selectedThreadId === thread.id ? "selected" : ""}" data-thread-id="${thread.id}">
      <span>${escapeHtml(client)} → ${escapeHtml(thread.is_ai ? "AI assistant" : trainer)}</span>
      <small>
        ${thread.messages_count || 0} messages ·
        ${thread.flagged_count || 0} flagged ·
        ${thread.hidden_count || 0} hidden ·
        ${formatDate(thread.last_message_at)}
      </small>
      <em>${escapeHtml(thread.last_message_text || "No messages yet")}</em>
    </button>
  `;
}

function messageModerationRow(message) {
  const canRestore = message.moderation_status !== "active";
  return `
    <article class="message-row ${escapeHtml(message.sender_kind || "")}">
      <div class="message-meta">
        <strong>${escapeHtml(message.sender_kind || "unknown")}</strong>
        ${badge(message.moderation_status || "active")}
        ${message.ai_generated ? badge("AI") : ""}
        <time>${formatDate(message.created_at)}</time>
      </div>
      <p>${escapeHtml(message.text || `[${message.kind || "message"}]`)}</p>
      ${message.moderation_reason ? `<small>${escapeHtml(message.moderation_reason)}</small>` : ""}
      <div class="actions">
        <button class="secondary" data-target-type="chat_message" data-target-id="${message.id}" data-target-action="flag">Flag</button>
        <button class="danger soft" data-target-type="chat_message" data-target-id="${message.id}" data-target-action="hide">Hide</button>
        <button class="danger" data-target-type="chat_message" data-target-id="${message.id}" data-target-action="remove">Remove</button>
        ${canRestore ? `<button class="ghost" data-target-type="chat_message" data-target-id="${message.id}" data-target-action="restore">Restore</button>` : ""}
      </div>
    </article>
  `;
}

function aiAuditRow(row) {
  const client = row.client_name || row.client_phone || row.client_id;
  const trainer = row.trainer_name || row.trainer_phone || row.trainer_id || "Generic AI";
  const contentIds = Array.isArray(row.trainer_content_ids)
    ? row.trainer_content_ids.filter(Boolean)
    : [];
  return `
    <article class="ai-audit-row">
      <div class="message-meta">
        <strong>${escapeHtml(client)} → ${escapeHtml(trainer)}</strong>
        ${badge(row.intent || "generic")}
        <time>${formatDate(row.created_at)}</time>
      </div>
      <div class="audit-copy">
        <p><span>User</span>${escapeHtml(row.user_text || "")}</p>
        <p><span>AI</span>${escapeHtml(row.assistant_text || "")}</p>
      </div>
      <small>
        Thread ${escapeHtml(row.thread_id)} · response ${escapeHtml(row.response_message_id || "n/a")}
        ${contentIds.length ? ` · content ${contentIds.map(escapeHtml).join(", ")}` : ""}
      </small>
    </article>
  `;
}

function contentModerationRow(item) {
  const canRestore = item.moderation_status !== "active";
  return `
    <article class="content-row">
      <div>
        <div class="message-meta">
          <strong>${escapeHtml(item.title || "Untitled")}</strong>
          ${badge(item.kind || "content")}
          ${badge(item.visibility || "visibility")}
          ${badge(item.moderation_status || "active")}
        </div>
        <small>Trainer ${escapeHtml(item.trainer_id)} · used ${escapeHtml(item.usage_count || 0)} · ${formatDate(item.created_at)}</small>
        ${item.moderation_reason ? `<p>${escapeHtml(item.moderation_reason)}</p>` : ""}
      </div>
      <div class="actions">
        <button class="secondary" data-target-type="trainer_content" data-target-id="${item.id}" data-target-action="flag">Flag</button>
        <button class="danger soft" data-target-type="trainer_content" data-target-id="${item.id}" data-target-action="hide">Hide</button>
        <button class="danger" data-target-type="trainer_content" data-target-id="${item.id}" data-target-action="remove">Remove</button>
        ${canRestore ? `<button class="ghost" data-target-type="trainer_content" data-target-id="${item.id}" data-target-action="restore">Restore</button>` : ""}
      </div>
    </article>
  `;
}

function personLabel(person) {
  if (!person) return "Unknown";
  return escapeHtml(person.name || person.phone || person.id || "Unknown");
}

function tablePanel(title, rows, columns) {
  return `
    <section class="panel">
      <div class="panel-header"><h2>${title}</h2>${badge(`${rows.length}`)}</div>
      <div class="table-wrap">
        <table>
          <thead><tr>${columns.map((col) => `<th>${col}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows
              .map(
                (row) =>
                  `<tr>${columns
                    .map((col) => `<td>${escapeHtml(formatValue(row[col]))}</td>`)
                    .join("")}</tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function metric(label, value, tone) {
  return `
    <article class="metric ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function badge(text) {
  return `<span class="badge neutral">${escapeHtml(String(text))}</span>`;
}

function empty(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function stateBlock(title, body) {
  return `<div class="state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></div>`;
}

function setConnection(text, tone) {
  el.connectionState.textContent = text;
  el.connectionState.dataset.tone = tone;
}

function toast(text, tone = "neutral") {
  setConnection(text, tone);
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
