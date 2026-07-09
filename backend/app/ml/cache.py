_cache: dict[tuple[int, str], dict] = {}


def set_trained(user_id: int, model_type: str, payload: dict) -> None:
    _cache[(user_id, model_type)] = payload


def get_trained(user_id: int, model_type: str) -> dict | None:
    return _cache.get((user_id, model_type))


def clear_user(user_id: int) -> None:
    for key in [k for k in _cache if k[0] == user_id]:
        del _cache[key]
