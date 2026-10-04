# SPDX-License-Identifier: AGPL-3.0-only
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends

from surefy_ml.api.deps import get_documents_service, require_service_token
from surefy_ml.schemas.common import ErrorEnvelope
from surefy_ml.schemas.documents import ParsedDocument, ParseDocumentRequest
from surefy_ml.services.documents_service import DocumentsService

router = APIRouter(
    prefix="/v1/documents",
    tags=["documents"],
    dependencies=[Depends(require_service_token)],
    responses={status: {"model": ErrorEnvelope} for status in (401, 413, 422, 502, 503, 504)},
)


@router.post("/parse")
async def parse_document(
    request: ParseDocumentRequest,
    service: Annotated[DocumentsService, Depends(get_documents_service)],
) -> ParsedDocument:
    structlog.contextvars.bind_contextvars(orgId=str(request.org_id))
    return await service.parse(request)
