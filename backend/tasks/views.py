import json

from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework import status

from .serializers import TaskSerializer
from .scoring import compute_task_scores

# In-memory state to support /suggest/ endpoint
LAST_ANALYZED_TASKS = []


def _get_strategy_from_request(request):
    strategy = request.GET.get("strategy", "smart_balance").lower()
    allowed = {"fastest_wins", "high_impact", "deadline_driven", "smart_balance"}
    if strategy not in allowed:
        strategy = "smart_balance"
    return strategy


@csrf_exempt
@api_view(["POST"])
def analyze_tasks(request):
    """
    POST /api/tasks/analyze/?strategy=smart_balance
    Body: JSON array of tasks
    """
    try:
        data = request.data  # DRF already parses JSON
        if not isinstance(data, list):
            return JsonResponse(
                {"error": "Expected a JSON array of tasks."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    except Exception:
        return JsonResponse(
            {"error": "Invalid JSON payload."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = TaskSerializer(data=data, many=True)
    if not serializer.is_valid():
        return JsonResponse(
            {"error": "Validation failed.", "details": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tasks = serializer.validated_data
    strategy = _get_strategy_from_request(request)

    scored_tasks = compute_task_scores(tasks, strategy=strategy)

    # store for suggest endpoint
    global LAST_ANALYZED_TASKS
    LAST_ANALYZED_TASKS = scored_tasks

    return JsonResponse(
        {
            "strategy": strategy,
            "count": len(scored_tasks),
            "tasks": scored_tasks,
        },
        status=status.HTTP_200_OK,
        safe=False,
    )


@api_view(["GET"])
def suggest_tasks(request):
    """
    GET /api/tasks/suggest/?strategy=smart_balance
    Returns top 3 tasks from last analyzed batch.
    """
    global LAST_ANALYZED_TASKS
    if not LAST_ANALYZED_TASKS:
        return JsonResponse(
            {
                "error": "No analyzed tasks available. Call /api/tasks/analyze/ first."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    strategy = _get_strategy_from_request(request)

    # If strategy changed, recompute using current strategy
    # using original fields (without explanation/score)
    base_tasks = []
    for t in LAST_ANALYZED_TASKS:
        base_tasks.append({
            "id": t.get("id"),
            "title": t.get("title"),
            "due_date": t.get("due_date"),
            "estimated_hours": t.get("estimated_hours"),
            "importance": t.get("importance"),
            "dependencies": t.get("dependencies", []),
        })

    rescored = compute_task_scores(base_tasks, strategy=strategy)
    top3 = rescored[:3]

    return JsonResponse(
        {
            "strategy": strategy,
            "suggested_count": len(top3),
            "suggested_tasks": top3,
        },
        status=status.HTTP_200_OK,
        safe=False,
    )
