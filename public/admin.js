const params = new URLSearchParams(window.location.search);
const adminKey = params.get("key") || prompt("Admin key");
const exportButton = document.querySelector("#exportButton");
const resetButton = document.querySelector("#resetButton");
const gates = document.querySelector("#gates");
const teams = document.querySelector("#teams");
const scores = document.querySelector("#scores");
const scoreTable = document.querySelector("#scoreTable");
const submissions = document.querySelector("#submissions");

let latestState = null;

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

  teams.innerHTML = state.teams.length
    ? state.teams
        .map((team) => {
          return `
            <div class="team-item">
              <strong>${escapeHtml(team.name)}</strong>
              <span>${state.submissions.filter((submission) => submission.teamId === team.id).length} submissions</span>
              <button class="danger" data-remove-team="${team.id}" type="button">Remove</button>
            </div>
          `;
        })
        .join("")
    : "<p class=\"subtle\">No teams yet.</p>";

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

  submissions.innerHTML = sortedSubmissions.length
    ? sortedSubmissions.map((submission) => renderSubmission(submission, state.prompts)).join("")
    : "<p class=\"subtle\">No submissions yet.</p>";

  submissions.querySelectorAll("[data-mark]").forEach((button) => {
    button.addEventListener("click", () => {
      const correct = button.dataset.mark === "correct" ? true : button.dataset.mark === "wrong" ? false : null;
      adminPost("/api/admin/mark", { submissionId: button.dataset.id, correct });
    });
  });

}

function renderSubmission(submission, prompts) {
  const prompt = prompts.find((item) => item.id === submission.promptId);
  const status = submission.correct === true ? "correct" : submission.correct === false ? "wrong" : "pending";
  const label = submission.correct === true ? `Correct, ${submission.points} pts` : submission.correct === false ? "Wrong" : "Pending";
  const time = new Date(submission.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `
    <div class="submission">
      <div><strong>${escapeHtml(shortLabel(prompt) || submission.promptId)}</strong></div>
      <div><strong>${escapeHtml(submission.teamName)}</strong></div>
      <div class="submission-answer">${escapeHtml(submission.answer)}</div>
      <div>${time}</div>
      <div class="status ${status}">${label}</div>
      <button class="correct" data-mark="correct" data-id="${submission.id}" type="button">Correct</button>
      <button class="wrong" data-mark="wrong" data-id="${submission.id}" type="button">Wrong</button>
    </div>
  `;
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
