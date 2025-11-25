from datetime import date
from collections import defaultdict


class CircularDependencyError(Exception):
    """Raised when circular dependencies are detected."""
    pass


def days_until(due_date):
    """Return number of days until due_date (negative if past)."""
    if not due_date:
        return None
    today = date.today()
    delta = (due_date - today).days
    return delta


def compute_urgency_score(due_date):
    """
    0–10 scale
    - Past due      -> 10
    - Today         -> 9
    - In 1–10 days  -> 8..0
    - No due date   -> 3 (low urgency)
    """
    if not due_date:
        return 3.0

    diff = days_until(due_date)
    if diff is None:
        return 3.0

    if diff < 0:
        return 10.0  # already late
    if diff == 0:
        return 9.0

    capped = min(diff, 10)
    return max(0.0, 10.0 - capped)


def compute_effort_score(estimated_hours):
    """
    Quick wins: lower hours -> higher score
    Example:
    - <=1h  -> 10
    - 2h    -> 8
    - 4h    -> 6
    - 8h    -> 3
    - >8h   -> 1
    """
    if estimated_hours is None:
        estimated_hours = 1.0

    h = float(estimated_hours)
    if h <= 1:
        return 10.0
    if h <= 2:
        return 8.0
    if h <= 4:
        return 6.0
    if h <= 8:
        return 3.0
    return 1.0


def compute_dependency_scores(tasks):
    """
    Dependency score: how many tasks depend on this task.
    Input: list of dict tasks with id + dependencies.
    Return: dict {task_id: dependency_score}
    """
    dependents_count = defaultdict(int)

    # Use id if present, else fallback to index-based ids
    ids = []
    for idx, t in enumerate(tasks):
        task_id = t.get("id") or f"task_{idx}"
        ids.append(task_id)

    id_set = set(ids)

    for idx, t in enumerate(tasks):
        current_id = t.get("id") or f"task_{idx}"
        for dep in t.get("dependencies", []):
            # dep is the id this task depends on -> so dep is "blocking" current
            if dep in id_set:
                dependents_count[dep] += 1

    scores = {task_id: float(dependents_count.get(task_id, 0)) for task_id in ids}
    return scores


def detect_circular_dependencies(tasks):
    """
    Detect cycles using DFS.
    Returns:
        cycles_present: bool
        nodes_in_cycles: set of ids involved in cycles
    """
    # Build graph
    graph = {}
    ids = []

    for idx, t in enumerate(tasks):
        task_id = t.get("id") or f"task_{idx}"
        ids.append(task_id)
        graph[task_id] = set(t.get("dependencies") or [])

    visited = set()
    stack = set()
    in_cycle = set()

    def dfs(node):
        if node in stack:
            # found a back edge -> cycle
            in_cycle.add(node)
            return True
        if node in visited:
            return False

        visited.add(node)
        stack.add(node)
        has_cycle = False
        for neighbor in graph.get(node, []):
            if neighbor in graph:  # only explore known nodes
                if dfs(neighbor):
                    has_cycle = True
                    in_cycle.add(neighbor)
        stack.remove(node)
        return has_cycle

    cycles_present = False
    for node in ids:
        if node not in visited:
            if dfs(node):
                cycles_present = True

    return cycles_present, in_cycle


def compute_task_scores(tasks, strategy="smart_balance"):
    """
    Main scoring entry point.

    tasks: list of validated task dicts
    strategy: "fastest_wins" | "high_impact" | "deadline_driven" | "smart_balance"
    Returns list of (task_dict_with_score_and_explanation)
    """

    # Precompute dependency scores + cycles
    dependency_scores = compute_dependency_scores(tasks)
    cycles_present, nodes_in_cycles = detect_circular_dependencies(tasks)

    scored = []

    for idx, t in enumerate(tasks):
        task_id = t.get("id") or f"task_{idx}"
        title = t.get("title", "")
        due_date = t.get("due_date")
        estimated_hours = t.get("estimated_hours")
        importance = t.get("importance", 5)
        deps = t.get("dependencies", [])

        urgency_score = compute_urgency_score(due_date)
        effort_score = compute_effort_score(estimated_hours)
        importance_score = float(importance)
        dependency_score = dependency_scores.get(task_id, 0.0)

        # base explanation text pieces
        explanation_parts = [
            f"Urgency {urgency_score:.1f} (due_date={due_date})",
            f"Importance {importance_score:.1f}",
            f"Effort score {effort_score:.1f} (estimated_hours={estimated_hours})",
            f"Dependency impact {dependency_score:.1f} (blocks {int(dependency_score)} task(s))",
        ]

        # Strategy-based scoring
        if strategy == "fastest_wins":
            # very high weight on low effort
            score = (
                0.2 * urgency_score +
                0.2 * importance_score +
                0.5 * effort_score +
                0.1 * dependency_score
            )
            explanation_parts.append("Strategy: Fastest Wins (prioritizes low effort tasks).")

        elif strategy == "high_impact":
            score = (
                0.2 * urgency_score +
                0.6 * importance_score +
                0.1 * effort_score +
                0.1 * dependency_score
            )
            explanation_parts.append("Strategy: High Impact (importance over everything).")

        elif strategy == "deadline_driven":
            score = (
                0.6 * urgency_score +
                0.2 * importance_score +
                0.1 * effort_score +
                0.1 * dependency_score
            )
            explanation_parts.append("Strategy: Deadline Driven (due dates dominate).")

        else:  # smart_balance default
            score = (
                0.4 * urgency_score +
                0.35 * importance_score +
                0.15 * effort_score +
                0.10 * dependency_score
            )
            explanation_parts.append("Strategy: Smart Balance (blends urgency, impact, effort, dependencies).")

        # penalty if in cycle
        circular = False
        if cycles_present and task_id in nodes_in_cycles:
            circular = True
            score *= 0.5  # reduce score by 50%
            explanation_parts.append(
                "Warning: This task is part of a circular dependency. Score penalized."
            )

        scored.append({
            **t,
            "id": task_id,
            "priority_score": round(score, 2),
            "strategy": strategy,
            "circular_dependency": circular,
            "explanation": " | ".join(explanation_parts),
        })

    # Sort highest score first
    scored.sort(key=lambda x: x["priority_score"], reverse=True)
    return scored
