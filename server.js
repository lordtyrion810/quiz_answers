const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4317);
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_KEY = process.env.ADMIN_KEY || "house";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, "submissions.json");

const miniPrompts = [
  {
    id: "m1",
    section: "mini",
    gateId: "m1",
    label: "Mini Connect 1",
    clues: ["Freddie Mercury", "Bruno Mars", "Venus Williams"],
    answer: "Planets",
    maxPoints: 10,
    scoring: "ranked",
  },
  {
    id: "m2",
    section: "mini",
    gateId: "m2",
    label: "Mini Connect 2",
    clues: ["firewater", "boos / booze", "spirits"],
    answer: "Alcohol",
    maxPoints: 10,
    scoring: "ranked",
  },
  {
    id: "m3",
    section: "mini",
    gateId: "m3",
    label: "Mini Connect 3",
    clues: ["Deadpool", "Al-Qaeda", "Bohemian Rhapsody"],
    answer: "TBD - club-specific connect",
    maxPoints: 10,
    scoring: "ranked",
  },
  {
    id: "m4",
    section: "mini",
    gateId: "m4",
    label: "Mini Connect 4",
    clues: ["Jaguar", "Ferrari horse", "Lamborghini bull"],
    answer: "Car logo animals",
    maxPoints: 10,
    scoring: "ranked",
  },
  {
    id: "m5",
    section: "mini",
    gateId: "m5",
    label: "Mini Connect 5",
    clues: ["Apple", "Pixel", "Galaxy"],
    answer: "Phone brands / phone lines",
    maxPoints: 10,
    scoring: "ranked",
  },
  {
    id: "m6",
    section: "mini",
    gateId: "m6",
    label: "Mini Connect 6",
    clues: ["Delta Air Lines", "Omega watch", "Alpha symbol"],
    answer: "Greek letters",
    maxPoints: 10,
    scoring: "ranked",
  },
  {
    id: "m7",
    section: "mini",
    gateId: "m7",
    label: "Mini Connect 7",
    clues: ["Iron Man", "Silver Surfer", "Goldfinger"],
    answer: "Chemical elements",
    maxPoints: 10,
    scoring: "ranked",
  },
  {
    id: "m8",
    section: "mini",
    gateId: "m8",
    label: "Mini Connect 8",
    clues: ["Downtown", "Open Tap", "Beerlin"],
    answer: "Pubs in South Point Mall, Gurgaon",
    maxPoints: 10,
    scoring: "ranked",
  },
];

const prompts = [...miniPrompts];
const defaultEnabled = {
  m1: false,
  m2: false,
  m3: false,
  m4: false,
  m5: false,
  m6: false,
  m7: false,
  m8: false,
};

const state = {
  enabled: { ...defaultEnabled },
  teams: [],
  submissions: [],
};

function loadState() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    state.enabled = { ...defaultEnabled };
    for (const gateId of Object.keys(defaultEnabled)) {
      if (saved.enabled && typeof saved.enabled[gateId] === "boolean") {
        state.enabled[gateId] = saved.enabled[gateId];
      }
    }
    state.teams = Array.isArray(saved.teams) ? saved.teams : [];
    state.submissions = Array.isArray(saved.submissions)
      ? saved.submissions.map(migrateSubmission).filter((submission) => isKnownPrompt(submission.promptId))
      : [];
  } catch (error) {
    console.warn(`Could not load saved data: ${error.message}`);
  }
}

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify({
    savedAt: new Date().toISOString(),
    enabled: state.enabled,
    teams: state.teams,
    submissions: state.submissions,
  }, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

const clients = new Set();

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getQuestion(id) {
  return prompts.find((prompt) => prompt.id === id) || prompts.find((prompt) => prompt.id === `m${Number(id)}`) || miniPrompts[0];
}

function migrateSubmission(submission) {
  if (submission.promptId) return submission;
  const prompt = getQuestion(submission.questionId);
  return {
    ...submission,
    promptId: prompt.id,
    questionId: prompt.id,
    phase: submission.phase || "before",
  };
}

function isKnownPrompt(promptId) {
  return prompts.some((prompt) => prompt.id === promptId);
}

function computeScores() {
  const scoredSubmissionIds = new Map();
  const teamScores = new Map(state.teams.map((team) => [team.id, 0]));
  const questionScoresByTeam = new Map(state.teams.map((team) => [team.id, {}]));

  for (const prompt of prompts) {
    const earliestCorrectByTeam = new Map();
    state.submissions
      .filter((submission) => submission.promptId === prompt.id && submission.correct === true)
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((submission) => {
        if (!earliestCorrectByTeam.has(submission.teamId)) {
          earliestCorrectByTeam.set(submission.teamId, submission);
        }
      });

    Array.from(earliestCorrectByTeam.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((submission, index) => {
        const points = prompt.scoring === "ranked"
          ? Math.max(0, prompt.maxPoints - index)
          : prompt.maxPoints;
        scoredSubmissionIds.set(submission.id, points);
        teamScores.set(submission.teamId, (teamScores.get(submission.teamId) || 0) + points);
        questionScoresByTeam.get(submission.teamId)[prompt.id] = points;
      });
  }

  return { scoredSubmissionIds, teamScores, questionScoresByTeam };
}

function publicState(teamId) {
  return {
    enabled: state.enabled,
    miniPrompts,
    prompts,
    team: state.teams.find((team) => team.id === teamId) || null,
    teamSubmissions: state.submissions
      .filter((submission) => submission.teamId === teamId)
  };
}

function adminState() {
  const scores = computeScores();
  return {
    ...publicState(null),
    adminKey: ADMIN_KEY,
    miniPrompts,
    prompts,
    teams: state.teams.map((team) => ({
      ...team,
      score: scores.teamScores.get(team.id) || 0,
      questionScores: scores.questionScoresByTeam.get(team.id) || {},
    })),
    submissions: state.submissions.map((submission) => ({
      ...submission,
      teamName: state.teams.find((team) => team.id === submission.teamId)?.name || "Unknown",
      points: scores.scoredSubmissionIds.get(submission.id) || 0,
    })),
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function broadcast() {
  const payload = `data: ${JSON.stringify({ type: "state" })}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function requireAdmin(body, res) {
  if (body.adminKey !== ADMIN_KEY) {
    sendJson(res, 403, { error: "Bad admin key" });
    return false;
  }
  return true;
}

function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 400, { error: "Bad path" });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath);
    const type =
      ext === ".html" ? "text/html" :
      ext === ".css" ? "text/css" :
      ext === ".js" ? "text/javascript" :
      "application/octet-stream";

    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, publicState(url.searchParams.get("teamId")));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/state") {
      if (url.searchParams.get("adminKey") !== ADMIN_KEY) {
        sendJson(res, 403, { error: "Bad admin key" });
        return;
      }
      sendJson(res, 200, adminState());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/export") {
      if (url.searchParams.get("adminKey") !== ADMIN_KEY) {
        sendJson(res, 403, { error: "Bad admin key" });
        return;
      }
      const scores = computeScores();
      const rows = [
        ["prompt", "phase", "team", "answer", "status", "points", "timestamp_iso"],
        ...state.submissions.map((submission) => {
          const teamName = state.teams.find((team) => team.id === submission.teamId)?.name || "Unknown";
          const status = submission.correct === true ? "correct" : submission.correct === false ? "wrong" : "pending";
          return [
            submission.promptId,
            submission.phase || "before",
            teamName,
            submission.answer,
            status,
            scores.scoredSubmissionIds.get(submission.id) || 0,
            new Date(submission.createdAt).toISOString(),
          ];
        }),
      ];
      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=\"mini-connect-submissions.csv\"",
      });
      res.end(csv);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/join") {
      const body = await readBody(req);
      const name = String(body.name || "").trim().slice(0, 50);
      if (!name) {
        sendJson(res, 400, { error: "Team name required" });
        return;
      }
      const existing = state.teams.find((team) => normalize(team.name) === normalize(name));
      const team = existing || { id: crypto.randomUUID(), name };
      if (!existing) state.teams.push(team);
      saveState();
      broadcast();
      sendJson(res, 200, { team, state: publicState(team.id) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/submit") {
      const body = await readBody(req);
      const team = state.teams.find((item) => item.id === body.teamId);
      if (!team) {
        sendJson(res, 400, { error: "Join first" });
        return;
      }
      const answer = String(body.answer || "").trim().slice(0, 200);
      if (!answer) {
        sendJson(res, 400, { error: "Answer required" });
        return;
      }
      const prompt = getQuestion(body.promptId || body.questionId);
      const phase = "mini";
      const gateId = prompt.gateId;
      if (!state.enabled[gateId]) {
        sendJson(res, 403, { error: "Submissions are closed for this section" });
        return;
      }
      const submission = {
        id: crypto.randomUUID(),
        teamId: team.id,
        promptId: prompt.id,
        questionId: prompt.id,
        phase,
        answer,
        normalizedAnswer: normalize(answer),
        correct: null,
        createdAt: Date.now(),
      };
      state.submissions.push(submission);
      saveState();
      broadcast();
      sendJson(res, 200, { submission, state: publicState(team.id) });
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/admin/")) {
      const body = await readBody(req);
      if (!requireAdmin(body, res)) return;

      if (url.pathname === "/api/admin/question") {
        sendJson(res, 410, { error: "Question control is no longer used" });
        return;
      } else if (url.pathname === "/api/admin/open") {
        sendJson(res, 410, { error: "Open/close is no longer used" });
        return;
      } else if (url.pathname === "/api/admin/close") {
        sendJson(res, 410, { error: "Open/close is no longer used" });
        return;
      } else if (url.pathname === "/api/admin/mark") {
        const submission = state.submissions.find((item) => item.id === body.submissionId);
        if (!submission) {
          sendJson(res, 404, { error: "Submission not found" });
          return;
        }
        submission.correct = body.correct === true ? true : body.correct === false ? false : null;
      } else if (url.pathname === "/api/admin/toggle") {
        const gateId = String(body.gateId || "");
        if (!Object.prototype.hasOwnProperty.call(defaultEnabled, gateId)) {
          sendJson(res, 400, { error: "Bad round id" });
          return;
        }
        state.enabled[gateId] = body.enabled === true;
      } else if (url.pathname === "/api/admin/remove-team") {
        const teamId = String(body.teamId || "");
        state.teams = state.teams.filter((team) => team.id !== teamId);
        state.submissions = state.submissions.filter((submission) => submission.teamId !== teamId);
      } else if (url.pathname === "/api/admin/reset") {
        state.enabled = { ...defaultEnabled };
        state.teams = [];
        state.submissions = [];
      } else {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      saveState();
      broadcast();
      sendJson(res, 200, adminState());
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

loadState();

server.listen(PORT, HOST, () => {
  console.log(`Mini Connect site running at http://${HOST}:${PORT}`);
  console.log(`Admin page: http://localhost:${PORT}/admin.html?key=${ADMIN_KEY}`);
  console.log(`Saving submissions to ${DATA_FILE}`);
});
