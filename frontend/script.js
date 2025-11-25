// === Config ===
const API_BASE = "http://127.0.0.1:8000/api/tasks";

// === Local state ===
let tasks = [];
let analyzedTasks = [];
let suggestions = [];
let autoIdCounter = 1;

// === DOM references ===
const strategySelect = document.getElementById("strategy-select");
const analyzeBtn = document.getElementById("analyze-btn");
const suggestBtn = document.getElementById("suggest-btn");
const statusText = document.getElementById("status-text");

const taskIdInput = document.getElementById("task-id");
const taskTitleInput = document.getElementById("task-title");
const taskDueInput = document.getElementById("task-due");
const taskHoursInput = document.getElementById("task-hours");
const taskImportanceInput = document.getElementById("task-importance");
const taskDepsInput = document.getElementById("task-deps");
const addTaskBtn = document.getElementById("add-task-btn");

const tasksTbody = document.getElementById("tasks-tbody");
const noTasksText = document.getElementById("no-tasks-text");

const tasksJsonTextarea = document.getElementById("tasks-json");
const loadJsonBtn = document.getElementById("load-json-btn");
const exportJsonBtn = document.getElementById("export-json-btn");

const resultsTbody = document.getElementById("results-tbody");
const noResultsText = document.getElementById("no-results-text");
const strategyBadge = document.getElementById("strategy-badge");

const suggestionsList = document.getElementById("suggestions-list");
const noSuggestionsText = document.getElementById("no-suggestions-text");

const dependencyGraphDiv = document.getElementById("dependency-graph");

const matrixIU = document.getElementById("matrix-iu");
const matrixINU = document.getElementById("matrix-inu");
const matrixNIU = document.getElementById("matrix-niu");
const matrixNINU = document.getElementById("matrix-ninu");

// === Helpers ===

function setStatus(message, type = "info") {
  statusText.textContent = message;
  if (!message) return;
}

function getCurrentStrategy() {
  return strategySelect.value;
}

function getPriorityLevel(score) {
  if (score >= 8) return "high";
  if (score >= 5) return "medium";
  return "low";
}

function formatDate(d) {
  if (!d) return "-";
  return d;
}

// === Task list management ===

function renderTasksTable() {
  tasksTbody.innerHTML = "";

  if (!tasks.length) {
    noTasksText.style.display = "block";
    return;
  }

  noTasksText.style.display = "none";

  tasks.forEach((t, index) => {
    const tr = document.createElement("tr");

    const depsDisplay = (t.dependencies || []).join(", ");

    tr.innerHTML = `
      <td>${t.id || "-"}</td>
      <td>${t.title || "-"}</td>
      <td>${formatDate(t.due_date)}</td>
      <td>${t.estimated_hours ?? "-"}</td>
      <td>${t.importance}</td>
      <td>${depsDisplay}</td>
      <td><button class="btn small ghost remove-btn" data-index="${index}">Remove</button></td>
    `;

    tasksTbody.appendChild(tr);
  });

  // Attach remove handlers
  document.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.getAttribute("data-index"), 10);
      tasks.splice(index, 1);
      renderTasksTable();
    });
  });
}

function handleAddTask() {
  const title = taskTitleInput.value.trim();
  const importance = parseInt(taskImportanceInput.value, 10);

  if (!title) {
    alert("Please enter a task title.");
    return;
  }
  if (Number.isNaN(importance) || importance < 1 || importance > 10) {
    alert("Importance must be a number between 1 and 10.");
    return;
  }

  let id = taskIdInput.value.trim();
  if (!id) {
    id = `T${autoIdCounter++}`;
  }

  const due = taskDueInput.value ? taskDueInput.value : null;
  const hoursRaw = taskHoursInput.value;
  const hours = hoursRaw === "" ? null : parseFloat(hoursRaw);

  const depsRaw = taskDepsInput.value.trim();
  const deps = depsRaw ? depsRaw.split(",").map(d => d.trim()).filter(Boolean) : [];

  const task = {
    id,
    title,
    due_date: due,
    estimated_hours: hours,
    importance,
    dependencies: deps,
  };

  tasks.push(task);
  resetTaskForm();
  renderTasksTable();
}

function resetTaskForm() {
  taskIdInput.value = "";
  taskTitleInput.value = "";
  taskDueInput.value = "";
  taskHoursInput.value = "";
  taskImportanceInput.value = 5;
  taskDepsInput.value = "";
}

// === JSON bulk load/export ===

function handleLoadJson() {
  const text = tasksJsonTextarea.value.trim();
  if (!text) {
    alert("Please paste a JSON array first.");
    return;
  }

  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) {
      alert("JSON must be an array of tasks.");
      return;
    }
    tasks = arr;
    // adjust autoIdCounter to avoid collisions
    autoIdCounter = tasks.length + 1;
    renderTasksTable();
    setStatus(`Loaded ${tasks.length} tasks from JSON.`);
  } catch (err) {
    console.error(err);
    alert("Invalid JSON: " + err.message);
  }
}

function handleExportJson() {
  if (!tasks.length) {
    alert("No tasks to export.");
    return;
  }
  tasksJsonTextarea.value = JSON.stringify(tasks, null, 2);
  setStatus("Exported current tasks to JSON area.");
}

// === API calls ===

async function handleAnalyze() {
  if (!tasks.length) {
    alert("Add at least one task before analyzing.");
    return;
  }

  const strategy = getCurrentStrategy();
  setStatus("Analyzing tasks...");

  try {
    const res = await fetch(`${API_BASE}/analyze/?strategy=${strategy}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tasks),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error(errData);
      throw new Error(errData.error || "API error");
    }

    const data = await res.json();
    analyzedTasks = data.tasks || [];
    renderResultsTable(strategy);
    renderVisualizations();
    setStatus(`Analysis complete. Strategy: ${strategy}.`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to analyze tasks: " + err.message);
    alert("Analyze error: " + err.message);
  }
}

async function handleSuggest() {
  const strategy = getCurrentStrategy();
  setStatus("Fetching top 3 suggestions...");

  try {
    const res = await fetch(`${API_BASE}/suggest/?strategy=${strategy}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "API error");
    }

    suggestions = data.suggested_tasks || [];
    renderSuggestions(strategy);
    setStatus(`Suggestions updated (strategy: ${strategy}).`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to get suggestions: " + err.message);
    alert("Suggest error: " + err.message);
  }
}

// === Results rendering ===

function renderResultsTable(strategy) {
  resultsTbody.innerHTML = "";

  if (!analyzedTasks.length) {
    noResultsText.style.display = "block";
    strategyBadge.textContent = "";
    return;
  }

  noResultsText.style.display = "none";

  const strategyLabel = {
    smart_balance: "Smart Balance",
    fastest_wins: "Fastest Wins",
    high_impact: "High Impact",
    deadline_driven: "Deadline Driven",
  }[strategy] || strategy;

  strategyBadge.textContent = `Strategy: ${strategyLabel}`;

  analyzedTasks.forEach(task => {
    const tr = document.createElement("tr");
    const priorityLevel = getPriorityLevel(task.priority_score);

    const priorityLabel = priorityLevel.charAt(0).toUpperCase() + priorityLevel.slice(1);

    const priorityClass = `priority-badge ${priorityLevel}`;

    const cycle = task.circular_dependency ? `<span class="cycle-badge">Cycle</span>` : "-";

    tr.innerHTML = `
      <td>${task.priority_score.toFixed ? task.priority_score.toFixed(2) : task.priority_score}</td>
      <td><span class="${priorityClass}">${priorityLabel}</span></td>
      <td>${task.title}</td>
      <td>${formatDate(task.due_date)}</td>
      <td>${task.estimated_hours ?? "-"}</td>
      <td>${task.importance}</td>
      <td>${cycle}</td>
    `;

    tr.title = task.explanation || "";
    resultsTbody.appendChild(tr);
  });
}

function renderSuggestions(strategy) {
  suggestionsList.innerHTML = "";

  if (!suggestions.length) {
    noSuggestionsText.style.display = "block";
    return;
  }
  noSuggestionsText.style.display = "none";

  suggestions.forEach((task, idx) => {
    const li = document.createElement("li");
    li.className = "suggestion-item";

    const priorityLevel = getPriorityLevel(task.priority_score);
    const priorityLabel = priorityLevel.charAt(0).toUpperCase() + priorityLevel.slice(1);

    li.innerHTML = `
      <div class="suggestion-item-title">
        #${idx + 1} · ${task.title}
      </div>
      <div class="suggestion-meta">
        Score: ${task.priority_score} · Importance: ${task.importance} · Due: ${formatDate(task.due_date)} · Priority: ${priorityLabel}
      </div>
    `;

    suggestionsList.appendChild(li);
  });
}

// === Visualization ===

// recompute urgency on frontend (similar to backend) for Eisenhower matrix
function computeUrgencyScoreFrontend(dueDateStr) {
  if (!dueDateStr) return 3;
  const today = new Date();
  const due = new Date(dueDateStr);
  // strip time
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 10;
  if (diffDays === 0) return 9;
  const capped = Math.min(diffDays, 10);
  return Math.max(0, 10 - capped);
}

function renderDependencyGraph() {
  dependencyGraphDiv.innerHTML = "";

  if (!analyzedTasks.length) {
    dependencyGraphDiv.innerHTML = `<p class="empty-text">Run analysis to see dependency graph.</p>`;
    return;
  }

  const rows = [];

  analyzedTasks.forEach(task => {
    const id = task.id;
    const deps = task.dependencies || [];
    if (!deps.length) {
      rows.push(`<div class="dep-row"><span class="dep-node">${id}</span><span>• no dependencies</span></div>`);
    } else {
      deps.forEach(dep => {
        rows.push(`
          <div class="dep-row">
            <span class="dep-node">${dep}</span>
            <span>→</span>
            <span class="dep-node">${id}</span>
          </div>
        `);
      });
    }
  });

  dependencyGraphDiv.innerHTML = rows.join("");
}

function clearMatrix() {
  [matrixIU, matrixINU, matrixNIU, matrixNINU].forEach(el => {
    el.innerHTML = "";
  });
}

function renderEisenhowerMatrix() {
  clearMatrix();

  if (!analyzedTasks.length) return;

  analyzedTasks.forEach(task => {
    const importance = task.importance || 5;
    const urgency = computeUrgencyScoreFrontend(task.due_date);

    const important = importance >= 7;
    const urgent = urgency >= 7;

    const itemHtml = `<li>• ${task.title}</li>`;

    if (important && urgent) {
      matrixIU.innerHTML += itemHtml;
    } else if (important && !urgent) {
      matrixINU.innerHTML += itemHtml;
    } else if (!important && urgent) {
      matrixNIU.innerHTML += itemHtml;
    } else {
      matrixNINU.innerHTML += itemHtml;
    }
  });
}

function renderVisualizations() {
  renderDependencyGraph();
  renderEisenhowerMatrix();
}

// === Event listeners ===

addTaskBtn.addEventListener("click", handleAddTask);
loadJsonBtn.addEventListener("click", handleLoadJson);
exportJsonBtn.addEventListener("click", handleExportJson);

analyzeBtn.addEventListener("click", handleAnalyze);
suggestBtn.addEventListener("click", handleSuggest);

// Also re-render visualizations when changing strategy & we already have analyzed data
strategySelect.addEventListener("change", () => {
  if (analyzedTasks.length) {
    // Just update strategy text; the analysis itself is bound to last call
    renderVisualizations();
  }
});

// Initial
renderTasksTable();
renderResultsTable(getCurrentStrategy());
renderVisualizations();
