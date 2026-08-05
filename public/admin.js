const params = new URLSearchParams(window.location.search);
const adminKey = params.get("key") || prompt("Admin key");
const exportButton = document.querySelector("#exportButton");
const resetButton = document.querySelector("#resetButton");
const gates = document.querySelector("#gates");
const autoCorrect = document.querySelector("#autoCorrect");
const teams = document.querySelector("#teams");
const scores = document.querySelector("#scores");
const scoreTable = document.querySelector("#scoreTable");
const submissionFilters = document.querySelector("#submissionFilters");
const submissions = document.querySelector("#submissions");

let latestState = null;
const filters = {
  promptId: "all",
  teamId: "all",
  status: "all",
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

async function adminPost(path, body = {}) {
  latestState = await api(path, {
    method: "POST",
    body: JSON.stringify({ ...body, adminKey }),
  });
  render(latestState);
}

function render(state) {
  latestState = state;

  gates.innerHTML = state.miniPrompts
    .map((prompt) => {
      const gateId = prompt.gateId;
      const checked = state.enabled[gateId] === true;
      return `
        <label class="switch-row">
          <span>
            <strong>${escapeHtml(prompt.label)}</strong>
            <small>${checked ? "Accepting submissions" : "Closed"}</small>
          </span>
          <input type="checkbox" data-gate-id="${gateId}" ${checked ? "checked" : ""}>
        </label>
      `;
    })
    .join("");

  gates.querySelectorAll("[data-gate-id]").forEach((input) => {
    input.addEventListener("change", () => {
      adminPost("/api/admin/toggle", { gateId: input.dataset.gateId, enabled: input.checked });
    });
  });

  autoCorrect.innerHTML = state.prompts
    .map((prompt) => {
      const config = state.autoCorrect[prompt.id] || { enabled: false, answer: "" };
      const aliases = Array.isArray(config.aliases) ? config.aliases.join(", ") : config.answer || "";
      return `
        <div class="auto-correct-row">
          <label>
            ${escapeHtml(prompt.label)}
            <input data-autocorrect-answer="${prompt.id}" maxlength="400" value="${escapeAttribute(aliases)}" placeholder="Accepted answers, comma-separated">
          </label>
          <label class="switch-row compact-switch">
            <span>
              <strong>Auto mark</strong>
              <small>${config.enabled ? "On" : "Off"}</small>
            </span>
            <input type="checkbox" data-autocorrect-enabled="${prompt.id}" ${config.enabled ? "checked" : ""}>
          </label>
        </div>
      `;
    })
    .join("");

  autoCorrect.querySelectorAll("[data-autocorrect-answer]").forEach((input) => {
    input.addEventListener("change", () => {
      const promptId = input.dataset.autocorrectAnswer;
      const checkbox = autoCorrect.querySelector(`[data-autocorrect-enabled="${cssEscape(promptId)}"]`);
      adminPost("/api/admin/autocorrect", { promptId, aliases: splitAliases(input.value), enabled: checkbox?.checked === true });
    });
  });

  autoCorrect.querySelectorAll("[data-autocorrect-enabled]").forEach((input) => {
    input.addEventListener("change", () => {
      const promptId = input.dataset.autocorrectEnabled;
      const answerInput = autoCorrect.querySelector(`[data-autocorrect-answer="${cssEscape(promptId)}"]`);
      adminPost("/api/admin/autocorrect", { promptId, aliases: splitAliases(answerInput?.value || ""), enabled: input.checked });
    });
  });

  teams.innerHTML = state.teams.length
    ? state.teams
        .map((team) => {
          return `
            <div class="team-item">
              <input data-team-name="${team.id}" maxlength="50" value="${escapeAttribute(team.name)}" aria-label="Team name">
              <span>${state.submissions.filter((submission) => submission.teamId === team.id).length} submissions</span>
              <button class="secondary" data-rename-team="${team.id}" type="button">Rename</button>
              <button class="danger" data-remove-team="${team.id}" type="button">Remove</button>
            </div>
          `;
        })
        .join("")
    : "<p class=\"subtle\">No teams yet.</p>";

  teams.querySelectorAll("[data-rename-team]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = teams.querySelector(`[data-team-name="${cssEscape(button.dataset.renameTeam)}"]`);
      adminPost("/api/admin/rename-team", { teamId: button.dataset.renameTeam, name: input?.value || "" });
    });
  });

  teams.querySelectorAll("[data-remove-team]").forEach((button) => {
    button.addEventListener("click", () => {
      if (confirm("Remove this team and all of its submissions?")) {
        adminPost("/api/admin/remove-team", { teamId: button.dataset.removeTeam });
      }
    });
  });

  scores.innerHTML = state.teams.length
    ? state.teams
        .slice()
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .map((team) => `<li><span>${escapeHtml(team.name)}</span><strong>${team.score}</strong></li>`)
        .join("")
    : "<li><span>No scores yet</span><strong>0</strong></li>";

  document.querySelector(".leaderboard-toggle")?.remove();
  scores.insertAdjacentHTML("beforebegin", `
    <label class="switch-row leaderboard-toggle">
      <span>
        <strong>Player leaderboard</strong>
        <small>${state.settings?.showLeaderboard ? "Visible to teams" : "Hidden from teams"}</small>
      </span>
      <input type="checkbox" data-setting="showLeaderboard" ${state.settings?.showLeaderboard ? "checked" : ""}>
    </label>
  `);

  document.querySelector("[data-setting=\"showLeaderboard\"]").addEventListener("change", (event) => {
    adminPost("/api/admin/settings", { showLeaderboard: event.currentTarget.checked });
  });

  const rankedTeams = state.teams.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  scoreTable.innerHTML = state.teams.length
    ? `
      <thead>
        <tr>
          <th>Team</th>
          ${state.prompts.map((prompt) => `<th>${escapeHtml(shortLabel(prompt))}</th>`).join("")}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${rankedTeams
          .map((team) => `
            <tr>
              <td>${escapeHtml(team.name)}</td>
              ${state.prompts.map((prompt) => `<td>${team.questionScores[prompt.id] || 0}</td>`).join("")}
              <td><strong>${team.score}</strong></td>
            </tr>
          `)
          .join("")}
      </tbody>
    `
    : "";

  const promptOrder = new Map(state.prompts.map((prompt, index) => [prompt.id, index]));
  const sortedSubmissions = state.submissions.slice().sort((a, b) => {
    return (promptOrder.get(a.promptId) ?? 999) - (promptOrder.get(b.promptId) ?? 999) || a.createdAt - b.createdAt;
  });

  renderSubmissionFilters(state);
  const filteredSubmissions = sortedSubmissions.filter((submission) => submissionMatchesFilters(submission));
  submissions.innerHTML = sortedSubmissions.length
    ? renderSubmissionsTable(filteredSubmissions, state.prompts)
    : "<p class=\"subtle\">No submissions yet.</p>";

  submissions.querySelectorAll("[data-mark]").forEach((button) => {
    button.addEventListener("click", () => {
      const correct = button.dataset.mark === "correct" ? true : button.dataset.mark === "wrong" ? false : null;
      adminPost("/api/admin/mark", { submissionId: button.dataset.id, correct });
    });
  });

}

function renderSubmissionFilters(state) {
  submissionFilters.innerHTML = `
    <label>
      Prompt
      <select data-filter="promptId">
        <option value="all">All prompts</option>
        ${state.prompts.map((prompt) => `<option value="${escapeAttribute(prompt.id)}" ${filters.promptId === prompt.id ? "selected" : ""}>${escapeHtml(prompt.label)}</option>`).join("")}
      </select>
    </label>
    <label>
      Team
      <select data-filter="teamId">
        <option value="all">All teams</option>
        ${state.teams
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((team) => `<option value="${escapeAttribute(team.id)}" ${filters.teamId === team.id ? "selected" : ""}>${escapeHtml(team.name)}</option>`)
          .join("")}
      </select>
    </label>
    <label>
      Status
      <select data-filter="status">
        <option value="all" ${filters.status === "all" ? "selected" : ""}>All statuses</option>
        <option value="pending" ${filters.status === "pending" ? "selected" : ""}>Pending</option>
        <option value="correct" ${filters.status === "correct" ? "selected" : ""}>Correct</option>
        <option value="wrong" ${filters.status === "wrong" ? "selected" : ""}>Wrong</option>
      </select>
    </label>
    <button type="button" class="secondary" data-clear-filters>Clear</button>
  `;

  submissionFilters.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("change", () => {
      filters[input.dataset.filter] = input.value;
      render(latestState);
    });
  });

  submissionFilters.querySelector("[data-clear-filters]").addEventListener("click", () => {
    filters.promptId = "all";
    filters.teamId = "all";
    filters.status = "all";
    render(latestState);
  });
}

function submissionMatchesFilters(submission) {
  if (filters.promptId !== "all" && submission.promptId !== filters.promptId) return false;
  if (filters.teamId !== "all" && submission.teamId !== filters.teamId) return false;
  if (filters.status !== "all" && submissionStatus(submission) !== filters.status) return false;
  return true;
}

function renderSubmissionsTable(sortedSubmissions, prompts) {
  if (!sortedSubmissions.length) {
    return "<p class=\"subtle\">No submissions match the current filters.</p>";
  }

  return `
    <div class="table-wrap submissions-table-wrap">
      <table class="submissions-table">
        <thead>
          <tr>
            <th>Prompt</th>
            <th>Team</th>
            <th>Answer</th>
            <th>Time</th>
            <th>Status</th>
            <th>Points</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${sortedSubmissions.map((submission) => renderSubmissionRow(submission, prompts)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSubmissionRow(submission, prompts) {
  const prompt = prompts.find((item) => item.id === submission.promptId);
  const status = submissionStatus(submission);
  const label = submission.correct === true ? "Correct" : submission.correct === false ? "Wrong" : "Pending";
  const time = new Date(submission.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `
    <tr>
      <td><strong>${escapeHtml(shortLabel(prompt) || submission.promptId)}</strong></td>
      <td>${escapeHtml(submission.teamName)}</td>
      <td class="submission-answer">${escapeHtml(submission.answer)}</td>
      <td>${time}</td>
      <td><span class="status ${status}">${label}</span></td>
      <td>${submission.points || 0}</td>
      <td>
        <div class="submission-actions">
          <button class="correct" data-mark="correct" data-id="${submission.id}" type="button">Correct</button>
          <button class="wrong" data-mark="wrong" data-id="${submission.id}" type="button">Wrong</button>
          <button class="secondary" data-mark="pending" data-id="${submission.id}" type="button">Pending</button>
        </div>
      </td>
    </tr>
  `;
}

function submissionStatus(submission) {
  if (submission.correct === true) return "correct";
  if (submission.correct === false) return "wrong";
  return "pending";
}

function splitAliases(value) {
  return String(value || "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function shortLabel(prompt) {
  if (!prompt) return "";
  return prompt.label
    .replace("Mini Connect ", "M");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

async function refresh() {
  latestState = await api(`/api/admin/state?adminKey=${encodeURIComponent(adminKey)}`);
  render(latestState);
}

exportButton.addEventListener("click", () => {
  window.location.href = `/api/admin/export?adminKey=${encodeURIComponent(adminKey)}`;
});
resetButton.addEventListener("click", () => {
  if (confirm("Reset all teams and answers?")) {
    adminPost("/api/admin/reset");
  }
});

new EventSource("/events").addEventListener("message", refresh);
refresh().catch((error) => {
  document.body.innerHTML = `<main class="shell"><section class="panel"><h1>Admin error</h1><p>${escapeHtml(error.message)}</p></section></main>`;
});
