"""AI transcript REST endpoints."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/transcripts")
async def get_transcripts(request: Request):
    """Return all buffered AI transcripts (newest last)."""
    store = request.app.state.transcript_store
    return store.get_all()


@router.delete("/transcripts")
async def clear_transcripts(request: Request):
    """Clear the transcript buffer."""
    store = request.app.state.transcript_store
    store.clear()
    return {"status": "cleared"}
