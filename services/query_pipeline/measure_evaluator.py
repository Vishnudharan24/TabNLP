from __future__ import annotations

from services.measure_engine.evaluator import evaluate_measures as _evaluate_measures


def evaluate_measures(execution_result: dict, normalized_query: dict) -> dict:
    return _evaluate_measures(execution_result, normalized_query)
