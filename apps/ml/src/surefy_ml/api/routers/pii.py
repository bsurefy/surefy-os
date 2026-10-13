# SPDX-License-Identifier: AGPL-3.0-only
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends

from surefy_ml.api.deps import get_pii_service, require_service_token
from surefy_ml.schemas.common import ErrorEnvelope
from surefy_ml.schemas.pii import DetectPiiResponse, MaskPiiResponse, PiiRequest
from surefy_ml.services.pii_service import PiiService

router = APIRouter(
    prefix="/v1/pii",
    tags=["pii"],
    dependencies=[Depends(require_service_token)],
    responses={status: {"model": ErrorEnvelope} for status in (401, 422, 503, 504)},
)


@router.post("/detect")
async def detect_pii(
    request: PiiRequest, service: Annotated[PiiService, Depends(get_pii_service)]
) -> DetectPiiResponse:
    structlog.contextvars.bind_contextvars(orgId=str(request.org_id))
    return await service.detect(request)


@router.post("/mask")
async def mask_pii(
    request: PiiRequest, service: Annotated[PiiService, Depends(get_pii_service)]
) -> MaskPiiResponse:
    structlog.contextvars.bind_contextvars(orgId=str(request.org_id))
    return await service.mask(request)
