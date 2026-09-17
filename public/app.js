let token = localStorage.getItem("token") || "";
let currentUser = JSON.parse(localStorage.getItem("user") || "null");
let currentPage = 1;
let totalPages = 1;
const limit = 10;

function showAlert(msg, isError = false) {
  const alertBox = document.getElementById("alertBox");
  alertBox.textContent = msg;
  alertBox.className = isError ? "alert-error" : "alert-success";
  alertBox.classList.remove("hidden");
  setTimeout(() => alertBox.classList.add("hidden"), 4000);
}

async function handleLogin() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    token = data.token;
    currentUser = data.user;
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(currentUser));
    currentPage = 1;
    renderApp();
  } catch (err) {
    showAlert(err.message, true);
  }
}

function logout() {
  token = "";
  currentUser = null;
  localStorage.clear();
  currentPage = 1;
  renderApp();
}

async function renderApp() {
  const loginSection = document.getElementById("loginSection");
  const dashboardSection = document.getElementById("dashboardSection");
  const userHeader = document.getElementById("userHeader");

  // 1. Guard check: if unauthenticated, show login view and exit
  if (!token || !currentUser) {
    loginSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
    userHeader.classList.add("hidden");
    return;
  }

  // 2. Safe to inspect roles once authenticated
  const isApprover =
    currentUser.role === "HQ_APPROVER" || currentUser.role === "ADMIN";
  const isOfficer = currentUser.role === "FIELD_OFFICER";

  loginSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");
  userHeader.classList.remove("hidden");

  document.getElementById("userBadge").textContent =
    `${currentUser.name} (${currentUser.role})`;

  // 3. Toggle section visibility based on user role
  document
    .getElementById("hqSummaryCard")
    .classList.toggle("hidden", !isApprover);
  document
    .getElementById("createVisitCard")
    .classList.toggle("hidden", !isOfficer);

  // 4. Populate locations for form & filters
  await loadLocations();

  // 5. Populate visits
  await loadVisits();

  if (isApprover) {
    await loadHqSummary();
  }
}

async function loadLocations() {
  try {
    const res = await fetch("/api/locations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const locations = await res.json();
    
    // Populate creation dropdown
    const select = document.getElementById("visitLocation");
    if (select) {
      select.innerHTML = locations
        .map((l) => `<option value="${l.id}">${l.name} (${l.state})</option>`)
        .join("");
    }

    // Populate filter dropdown
    const filterSelect = document.getElementById("filterLocation");
    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML =
        `<option value="">All Locations</option>` +
        locations
          .map((l) => `<option value="${l.id}">${l.name} (${l.state})</option>`)
          .join("");
      filterSelect.value = currentVal;
    }
  } catch (err) {
    console.error("Failed to load locations", err);
  }
}

function onFilterChange() {
  currentPage = 1;
  loadVisits();
}

function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    loadVisits();
  }
}

async function loadVisits() {
  try {
    const statusFilter = document.getElementById("filterStatus")?.value || "";
    const locFilter = document.getElementById("filterLocation")?.value || "";

    const params = new URLSearchParams({
      page: currentPage,
      limit: limit,
    });
    if (statusFilter) params.append("status", statusFilter);
    if (locFilter) params.append("location_id", locFilter);

    const res = await fetch(`/api/visits?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data, pagination } = await res.json();
    const tbody = document.getElementById("visitsTableBody");

    // Update pagination indicators
    currentPage = pagination.page;
    totalPages = pagination.totalPages || 1;
    document.getElementById("pageDisplay").textContent = currentPage;
    document.getElementById("totalPagesDisplay").textContent = totalPages;
    document.getElementById("totalCountDisplay").textContent = pagination.total;

    document.getElementById("prevPageBtn").disabled = currentPage <= 1;
    document.getElementById("nextPageBtn").disabled = currentPage >= totalPages;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 20px;">No visits found matching current filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = data
      .map((v) => {
        let actionButtons = "";
        const isOwner = v.officer_id === currentUser.id;
        const isApprover =
          currentUser.role === "HQ_APPROVER" || currentUser.role === "ADMIN";

        // View Details button always available
        actionButtons += `<button onclick="viewVisitDetails('${v.id}')" class="btn btn-neutral" style="margin-right: 4px; padding: 4px 8px; font-size: 0.75rem;">View</button>`;

        // Creator actions: Submit or Resubmit
        if (isOwner && (v.status === "DRAFT" || v.status === "REJECTED")) {
          actionButtons += `<button onclick="submitVisit('${v.id}')" class="btn btn-primary" style="margin-right: 4px; padding: 4px 8px; font-size: 0.75rem;">Submit</button>`;
        }

        // Approver actions: Cannot approve/reject their own visit (Section 2.3)
        if (isApprover && !isOwner && v.status === "PENDING") {
          actionButtons += `
            <button onclick="promptApprove('${v.id}')" class="btn btn-success" style="margin-right: 4px; padding: 4px 8px; font-size: 0.75rem;">Approve</button>
            <button onclick="promptReject('${v.id}')" class="btn btn-danger" style="margin-right: 4px; padding: 4px 8px; font-size: 0.75rem;">Reject</button>
          `;
        }

        // Creator actions: Complete approved visit
        if (isOwner && v.status === "APPROVED") {
          actionButtons += `<button onclick="completeVisit('${v.id}')" class="btn btn-purple" style="padding: 4px 8px; font-size: 0.75rem;">Complete</button>`;
        }

        return `
        <tr>
          <td><strong>${v.title}</strong></td>
          <td>${v.officer_name}</td>
          <td>${v.location_name}</td>
          <td>${v.planned_date.substring(0, 10)}</td>
          <td>₹${parseFloat(v.estimated_cost).toLocaleString()}</td>
          <td><span class="status-pill status-${v.status}">${v.status}</span></td>
          <td>${actionButtons}</td>
        </tr>
      `;
      })
      .join("");
  } catch (err) {
    showAlert("Failed to fetch visits", true);
  }
}

async function viewVisitDetails(id) {
  try {
    const res = await fetch(`/api/visits/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      return showAlert(err.error || "Failed to load visit details", true);
    }
    const visit = await res.json();

    let decisionsHtml = `<p style="color: #64748b; font-size: 0.85rem;">No decision history recorded yet.</p>`;
    if (visit.decisions && visit.decisions.length > 0) {
      decisionsHtml = visit.decisions
        .map(
          (d) => `
        <div class="timeline-item ${d.action.toLowerCase()}">
          <div style="font-weight: 600; font-size: 0.85rem;">
            ${d.action === "APPROVED" ? "Approved" : "Rejected"} by ${d.approver_name} (${d.approver_email})
          </div>
          <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 4px;">
            ${new Date(d.created_at).toLocaleString()}
          </div>
          <div style="font-size: 0.85rem; background: #f8fafc; padding: 6px 10px; border-radius: 4px; border: 1px solid #e2e8f0;">
            ${d.remarks ? `"${d.remarks}"` : "<em>No remarks provided.</em>"}
          </div>
        </div>
      `
        )
        .join("");
    }

    document.getElementById("modalTitle").textContent = visit.title;
    document.getElementById("modalBody").innerHTML = `
      <div style="margin-bottom: 12px; font-size: 0.875rem;">
        <p><strong>Status:</strong> <span class="status-pill status-${visit.status}">${visit.status}</span></p>
        <p style="margin-top: 4px;"><strong>Location:</strong> ${visit.location_name}</p>
        <p style="margin-top: 4px;"><strong>Planned Date:</strong> ${visit.planned_date.substring(0, 10)}</p>
        <p style="margin-top: 4px;"><strong>Estimated Cost:</strong> ₹${parseFloat(visit.estimated_cost).toLocaleString()}</p>
        <p style="margin-top: 4px;"><strong>Officer:</strong> ${visit.officer_name}</p>
        <p style="margin-top: 6px; padding: 8px; background: #f1f5f9; border-radius: 4px;"><strong>Purpose:</strong> ${visit.purpose}</p>
      </div>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
      <h4 style="margin-bottom: 10px; font-size: 0.9rem;">Decision History & Remarks</h4>
      ${decisionsHtml}
    `;

    document.getElementById("detailModal").classList.remove("hidden");
  } catch (err) {
    showAlert("Failed to view visit details", true);
  }
}

function closeDetailModal() {
  document.getElementById("detailModal").classList.add("hidden");
}

async function handleCreateVisit() {
  const payload = {
    title: document.getElementById("visitTitle").value,
    location_id: document.getElementById("visitLocation").value,
    planned_date: document.getElementById("visitDate").value,
    estimated_cost: document.getElementById("visitCost").value,
    purpose: document.getElementById("visitPurpose").value,
  };

  const res = await fetch("/api/visits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) return showAlert(data.error, true);

  // Clear inputs after successful draft creation
  document.getElementById("visitTitle").value = "";
  document.getElementById("visitDate").value = "";
  document.getElementById("visitCost").value = "";
  document.getElementById("visitPurpose").value = "";

  showAlert("Visit draft created successfully!");
  currentPage = 1;
  loadVisits();
}

async function submitVisit(id) {
  const res = await fetch(`/api/visits/${id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) return showAlert(data.error, true);

  showAlert("Visit submitted to HQ for review!");
  loadVisits();
}

function promptApprove(id) {
  const remarks = prompt("Enter approval remarks (optional):", "");
  if (remarks === null) return; // cancelled
  decideVisit(id, "APPROVED", remarks);
}

function promptReject(id) {
  const remarks = prompt("Enter rejection remark (mandatory):");
  if (remarks === null) return; // cancelled
  if (!remarks.trim()) {
    return showAlert("Remarks are mandatory when rejecting a visit!", true);
  }
  decideVisit(id, "REJECTED", remarks);
}

async function decideVisit(id, action, remarks = "") {
  const res = await fetch(`/api/visits/${id}/decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, remarks }),
  });
  const data = await res.json();
  if (!res.ok) return showAlert(data.error, true);

  showAlert(`Visit ${action.toLowerCase()}!`);
  loadVisits();
  if (currentUser.role !== "FIELD_OFFICER") loadHqSummary();
}

async function completeVisit(id) {
  const res = await fetch(`/api/visits/${id}/complete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) return showAlert(data.error, true);

  showAlert("Visit marked completed!");
  loadVisits();
}

async function loadHqSummary() {
  const res = await fetch("/api/analytics/hq-summary", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) return;

  const kpiContainer = document.getElementById("kpiContainer");
  kpiContainer.innerHTML = Object.entries(data.status_counts)
    .map(
      ([status, count]) => `
    <div class="kpi-card">
      <div class="kpi-title">${status}</div>
      <div class="kpi-value">${count}</div>
    </div>
  `,
    )
    .join("");

  const tbody = document.getElementById("locationSummaryBody");
  tbody.innerHTML = data.locations
    .map(
      (loc) => `
    <tr>
      <td><strong>${loc.location_name}</strong></td>
      <td>${loc.state}</td>
      <td>${loc.total_visits}</td>
      <td>₹${parseFloat(loc.total_planned_cost).toLocaleString()}</td>
    </tr>
  `,
    )
    .join("");
}

renderApp();

