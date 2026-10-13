# SPDX-License-Identifier: AGPL-3.0-only
"""PiiDetector on Presidio: spaCy for names, pattern recognizers for the structured types."""

import re
from collections.abc import Sequence

from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_analyzer.predefined_recognizers import UkNinoRecognizer

from surefy_ml.pipelines.pii.detector import SUPPORTED_LANGUAGES
from surefy_ml.pipelines.pii.findings import find_custom, resolve_overlaps
from surefy_ml.schemas.pii import CustomPattern, PiiFinding, PiiFindingType, PiiType

# The spaCy model per language, installed with the `pii` extra (no download at request time).
SPACY_MODELS = {"en": "en_core_web_sm"}

STREET_ADDRESS = "STREET_ADDRESS"

# spaCy labels that are not personal data; ignoring them keeps Presidio from warning about each.
IGNORED_NER_LABELS = [
    "CARDINAL",
    "EVENT",
    "LANGUAGE",
    "LAW",
    "MONEY",
    "ORDINAL",
    "PERCENT",
    "PRODUCT",
    "QUANTITY",
    "WORK_OF_ART",
]

# Presidio entity → SurefyOS type. Entities Presidio does not support for a language are skipped.
ENTITIES: dict[PiiType, tuple[str, ...]] = {
    PiiType.PERSON_NAME: ("PERSON",),
    PiiType.EMAIL: ("EMAIL_ADDRESS",),
    PiiType.PHONE: ("PHONE_NUMBER",),
    PiiType.PAYMENT_CARD: ("CREDIT_CARD",),
    PiiType.BANK_ACCOUNT: ("IBAN_CODE", "US_BANK_NUMBER"),
    PiiType.GOVERNMENT_ID: (
        "US_SSN",
        "US_ITIN",
        "US_PASSPORT",
        "US_DRIVER_LICENSE",
        "UK_NHS",
        "UK_NINO",
    ),
    PiiType.ADDRESS: (STREET_ADDRESS,),
}
TYPE_BY_ENTITY = {
    entity: pii_type for pii_type, entities in ENTITIES.items() for entity in entities
}

# Full words end the address; an abbreviation may keep its period ("Main St.").
_STREET_WORDS = (
    "Street|Avenue|Road|Boulevard|Lane|Drive|Court|Way|Place|Square|Terrace|Parkway|Highway"
    "|Close|Crescent"
)
_STREET_ABBREVIATIONS = "St|Ave|Rd|Blvd|Ln|Dr|Ct|Pl|Sq|Ter|Pkwy|Hwy|Cres"
# "221B Baker Street", "1600 Pennsylvania Ave NW", "PO Box 42". Case-sensitive on purpose:
# street names are capitalized, which keeps "5 or more days" out. The score equals a name's, so
# the longer span wins where a street is named after a person.
_STREET_ADDRESS_PATTERNS = (
    Pattern(
        "street address",
        rf"\b\d{{1,5}}[A-Z]?\s+(?:[A-Z][\w'\u2019.-]*\s+){{1,4}}(?:(?:{_STREET_WORDS})\b|(?:{_STREET_ABBREVIATIONS})\b\.?)"
        r"(?:\s+(?:NW|NE|SW|SE|N|S|E|W)\b)?",
        0.85,
    ),
    Pattern("po box", r"\bP\.?\s?O\.?\s?Box\s+\d+\b", 0.85),
)


class PresidioPiiDetector:
    def __init__(self, *, min_score: float, pattern_timeout_seconds: float) -> None:
        self._min_score = min_score
        self._pattern_timeout = pattern_timeout_seconds
        nlp_engine = NlpEngineProvider(
            nlp_configuration={
                "nlp_engine_name": "spacy",
                "models": [
                    {"lang_code": language, "model_name": SPACY_MODELS[language]}
                    for language in SUPPORTED_LANGUAGES
                ],
                "ner_model_configuration": {"labels_to_ignore": IGNORED_NER_LABELS},
            }
        ).create_engine()  # pyright: ignore[reportUnknownMemberType]
        registry = RecognizerRegistry(supported_languages=list(SUPPORTED_LANGUAGES))
        registry.load_predefined_recognizers(languages=list(SUPPORTED_LANGUAGES))
        registry.add_recognizer(UkNinoRecognizer())
        registry.add_recognizer(
            PatternRecognizer(
                supported_entity=STREET_ADDRESS,
                name="StreetAddressRecognizer",
                patterns=list(_STREET_ADDRESS_PATTERNS),
                global_regex_flags=re.MULTILINE,
            )
        )
        self._analyzer = AnalyzerEngine(
            nlp_engine=nlp_engine,
            registry=registry,
            supported_languages=list(SUPPORTED_LANGUAGES),
        )

    def warm_up(self) -> None:
        self._analyzer.analyze(text="Anna Smith lives at 1 Main Street.", language="en")

    def detect(
        self,
        texts: Sequence[str],
        *,
        language: str,
        types: Sequence[PiiType],
        custom_patterns: Sequence[CustomPattern],
    ) -> list[list[PiiFinding]]:
        entities = self._entities(language, types)
        return [
            resolve_overlaps(
                [
                    *self._built_in(text, language, entities),
                    *find_custom(text, custom_patterns, timeout_seconds=self._pattern_timeout),
                ]
            )
            for text in texts
        ]

    def _entities(self, language: str, types: Sequence[PiiType]) -> list[str]:
        supported = set(self._analyzer.get_supported_entities(language=language))
        return [
            entity for pii_type in types for entity in ENTITIES[pii_type] if entity in supported
        ]

    def _built_in(self, text: str, language: str, entities: list[str]) -> list[PiiFinding]:
        if not entities:
            return []
        results = self._analyzer.analyze(
            text=text, language=language, entities=entities, score_threshold=self._min_score
        )
        findings: list[PiiFinding] = []
        for result in results:
            if result.entity_type not in TYPE_BY_ENTITY:
                continue
            # Some patterns include the space before the value; the finding is the value.
            start, end = result.start, result.end
            while start < end and text[start].isspace():
                start += 1
            while end > start and text[end - 1].isspace():
                end -= 1
            if end > start:
                findings.append(
                    PiiFinding(
                        type=PiiFindingType(TYPE_BY_ENTITY[result.entity_type].value),
                        custom_label=None,
                        start=start,
                        end=end,
                        score=min(max(result.score, 0.0), 1.0),
                    )
                )
        return findings
