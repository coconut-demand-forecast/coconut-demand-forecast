from collections import OrderedDict
from typing import Optional

# Each entry holds a trained model plus its full records_df — on Render's
# free-tier instance (512MB) this cache alone caused an OOM restart after a
# single heavy test session trained many location/model combinations, since
# nothing was ever evicted. Bounded to the most recently used entries so
# memory stays flat no matter how many locations/models get trained over
# the process's uptime.
MAX_CACHE_ENTRIES = 12

_cache: "OrderedDict[tuple[int, Optional[str], str], dict]" = OrderedDict()


def set_trained(user_id: int, location: Optional[str], model_type: str, payload: dict) -> None:
    key = (user_id, location, model_type)
    _cache[key] = payload
    _cache.move_to_end(key)
    while len(_cache) > MAX_CACHE_ENTRIES:
        _cache.popitem(last=False)


def get_trained(user_id: int, location: Optional[str], model_type: str) -> dict | None:
    key = (user_id, location, model_type)
    payload = _cache.get(key)
    if payload is not None:
        _cache.move_to_end(key)
    return payload


def clear_user(user_id: int) -> None:
    for key in [k for k in _cache if k[0] == user_id]:
        del _cache[key]
