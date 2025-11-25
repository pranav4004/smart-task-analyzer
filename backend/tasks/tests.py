from django.test import TestCase
from datetime import date, timedelta

from .scoring import compute_task_scores, compute_urgency_score, compute_effort_score


class ScoringTests(TestCase):
    def test_urgency_past_due_is_high(self):
        yesterday = date.today() - timedelta(days=1)
        score = compute_urgency_score(yesterday)
        self.assertEqual(score, 10.0)

    def test_effort_quick_win_high_score(self):
        score = compute_effort_score(0.5)
        self.assertEqual(score, 10.0)

    def test_smart_balance_orders_high_importance_first(self):
        today = date.today()
        tasks = [
            {
                "id": "t1",
                "title": "Low importance",
                "due_date": today,
                "estimated_hours": 2,
                "importance": 3,
                "dependencies": [],
            },
            {
                "id": "t2",
                "title": "High importance",
                "due_date": today,
                "estimated_hours": 2,
                "importance": 9,
                "dependencies": [],
            },
        ]

        scored = compute_task_scores(tasks, strategy="smart_balance")
        # highest score first
        self.assertEqual(scored[0]["id"], "t2")
