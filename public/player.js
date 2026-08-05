const joinCard = document.querySelector("#joinCard");
const playCard = document.querySelector("#playCard");
const historyCard = document.querySelector("#historyCard");
const joinForm = document.querySelector("#joinForm");
const teamNameInput = document.querySelector("#teamName");
const teamLabel = document.querySelector("#teamLabel");
const questionForms = document.querySelector("#questionForms");
const message = document.querySelector("#message");
const leaderboardCard = document.querySelector("#leaderboardCard");
const leaderboard = document.querySelector("#leaderboard");
const history = document.querySelector("#history");

let teamId = localStorage.getItem("miniConnectTeamId");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function render(state) {
  const prompts = state.miniPrompts;
  if (state.team) {
    joinCard.classList.add("hidden");
    playCard.classList.remove("hidden");
    historyCard.classList.remove("hidden");
    teamLabel.textContent = state.team.name;
  } else {
    joinCard.classList.remove("hidden");
    playCard.classList.add("hidden");
    leaderboardCard.classList.add("hidden");
    historyCard.classList.add("hidden");
  }

  const drafts = new Map(
    Array.from(questionForms.querySelectorAll("form")).map((form) => [
      form.dataset.promptId,
      form.querySelector("input")?.value || "",
    ])
  );
  questionForms.innerHTML = prompts
    .map((prompt, index) => {
      const isOpen = state.enabled[prompt.gateId] === true;
      const existingSubmission = state.teamSubmissions.find((submission) => submission.promptId === prompt.id);
      const isCorrect = existingSubmission?.correct === true;
      const isMarked = existingSubmission?.correct === true || existingSubmission?.correct === false;
      const hasSubmission = Boolean(existingSubmission);
      const canEdit = isOpen && hasSubmission && !isMarked;
      const canSubmit = isOpen && (!hasSubmission || canEdit);
      const draft = drafts.get(prompt.id) || existingSubmission?.answer || "";
      return `
        <form class="answer-form question-form tile-${(index % 4) + 1} ${canSubmit ? "" : "disabled-tile"}" data-prompt-id="${prompt.id}" data-is-update="${canEdit ? "true" : "false"}">
          <label>
            ${escapeHtml(prompt.label)}
            <input maxlength="200" value="${escapeAttribute(canSubmit ? draft : "")}" placeholder="${answerPlaceholder(isOpen, hasSubmission, isCorrect)}" ${canSubmit ? "" : "disabled"} required>
          </label>
          <button type="submit" ${canSubmit ? "" : "disabled"}>${buttonLabel(hasSubmission, canEdit, isCorrect)}</button>
        </form>
      `;
    })
    .join("");

  questionForms.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", submitAnswer);
  });

  if (state.team && state.settings?.showLeaderboard === true) {
    leaderboardCard.classList.remove("hidden");
    leaderboard.innerHTML = state.leaderboard.length
      ? state.leaderboard
          .map((team) => `<li><span>${escapeHtml(team.name)}</span><strong>${team.score}</strong></li>`)
          .join("")
      : "<li><span>No scores yet</span><strong>0</strong></li>";
  } else {
    leaderboardCard.classList.add("hidden");
    leaderboard.innerHTML = "";
  }

  history.innerHTML = state.teamSubmissions.length
    ? state.teamSubmissions
        .filter((submission) => prompts.some((prompt) => prompt.id === submission.promptId))
        .slice()
        .reverse()
        .map((submission) => {
          const prompt = prompts.find((item) => item.id === submission.promptId);
          const status = submission.correct === true ? "correct" : submission.correct === false ? "wrong" : "pending";
          const label = submission.correct === true ? "Correct" : submission.correct === false ? "Wrong" : "Received";
          const time = new Date(submission.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          return `<div class="history-item"><strong>${escapeHtml(prompt?.label || submission.promptId)}:</strong> ${escapeHtml(submission.answer)} <span class="status ${status}">${label}</span><div class="subtle">${time}</div></div>`;
        })
        .join("")
    : "<p class=\"subtle\">No answers submitted yet.</p>";
}

async function refresh() {
  const state = await api(`/api/state${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`);
  render(state);
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

function answerPlaceholder(isOpen, hasSubmission, isCorrect) {
  if (isCorrect) return "Correct";
  if (hasSubmission) return "Submitted";
  return isOpen ? "Type your answer" : "Closed by host";
}

function buttonLabel(hasSubmission, canEdit, isCorrect) {
  if (isCorrect) return "Correct";
  if (canEdit) return "Update";
  return hasSubmission ? "Submitted" : "Submit";
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  try {
    const data = await api("/api/join", {
      method: "POST",
      body: JSON.stringify({ name: teamNameInput.value }),
    });
    teamId = data.team.id;
    localStorage.setItem("miniConnectTeamId", teamId);
    render(data.state);
  } catch (error) {
    message.textContent = error.message;
  }
});

async function submitAnswer(event) {
  event.preventDefault();
  message.textContent = "";
  const form = event.currentTarget;
  const input = form.querySelector("input");
  try {
    const data = await api("/api/submit", {
      method: "POST",
      body: JSON.stringify({ teamId, promptId: form.dataset.promptId, answer: input.value }),
    });
    input.value = "";
    message.textContent = data.updated ? "Updated." : "Submitted.";
    render(data.state);
  } catch (error) {
    message.textContent = error.message;
  }
}

new EventSource("/events").addEventListener("message", refresh);
refresh();
