# server/action_registry.py
from typing import Callable, Dict, Any

ActionFn = Callable[..., dict]
_REGISTRY: Dict[str, ActionFn] = {}

def action(verb: str):
    """Decorator to register an action verb."""
    def wrap(fn: ActionFn) -> ActionFn:
        _REGISTRY[verb] = fn
        return fn
    return wrap

def get_action(verb: str) -> ActionFn | None:
    return _REGISTRY.get(verb)

def list_actions() -> list[str]:
    return sorted(_REGISTRY.keys())