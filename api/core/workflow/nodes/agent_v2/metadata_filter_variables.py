from collections.abc import Iterator, Sequence
from typing import Protocol

from core.rag.entities.metadata_entities import ConditionValue
from graphon.nodes.base.variable_template_parser import extract_selectors_from_template
from graphon.runtime.variable_pool import VARIABLE_PATTERN
from graphon.variables.segments import Segment
from models.agent_config_entities import AgentSoulConfig


class MetadataVariablePool(Protocol):
    def get(self, selector: Sequence[str], /) -> Segment | None: ...


def metadata_filter_variable_selectors(agent_soul: AgentSoulConfig) -> Iterator[list[str]]:
    """References required by enabled manual filters, including list values."""
    for knowledge_set in agent_soul.knowledge.sets:
        filtering = knowledge_set.metadata_filtering
        if filtering.mode != "manual" or filtering.conditions is None:
            continue
        for condition in filtering.conditions.conditions:
            values = [condition.value] if isinstance(condition.value, str) else condition.value
            if not isinstance(values, Sequence):
                continue
            for value in values:
                if isinstance(value, str):
                    for reference in extract_selectors_from_template(value):
                        yield list(reference.value_selector)


def resolve_metadata_filter_value(value: ConditionValue, variable_pool: MetadataVariablePool) -> ConditionValue:
    """Resolve one run's values without modifying the persisted Agent configuration.

    Match native retrieval semantics: a whole scalar reference retains its type;
    interpolated text and elements of string lists remain strings. Missing
    references fail explicitly instead of silently weakening a scope filter.
    """

    def get_segment(selector: str) -> Segment:
        segment = variable_pool.get(selector.split("."))
        if segment is None:
            raise ValueError(f"Agent knowledge metadata filter variable {selector} is not available.")
        return segment

    def resolve_template(template: str) -> str | int | float | None:
        if match := VARIABLE_PATTERN.fullmatch(template):
            resolved = get_segment(match.group(1)).to_object()
            if resolved is None or isinstance(resolved, str | float):
                return resolved
            if isinstance(resolved, int) and not isinstance(resolved, bool):
                return resolved
            return str(resolved)
        return VARIABLE_PATTERN.sub(lambda match: get_segment(match.group(1)).text, template)

    if isinstance(value, str):
        return resolve_template(value)
    if isinstance(value, Sequence):
        return [str(resolve_template(item)) for item in value]
    return value
