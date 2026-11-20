import math
import uuid
from pathlib import PurePosixPath
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from psycopg.rows import dict_row

from app.auth import Actor, current_actor, require_role

router = APIRouter(prefix="/api/analysis-requests", tags=["analysis requests"])
MAX_UPLOAD_BYTES = 500 * 1024 * 1024
MAX_FILES_PER_REQUEST = 10
UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024


WORKSPACE_SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS analysis_requests (
      request_id UUID PRIMARY KEY,
      client_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      question TEXT NOT NULL,
      dataset_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined')),
      analyst_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS analysis_request_files (
      file_id UUID PRIMARY KEY,
      request_id UUID NOT NULL REFERENCES analysis_requests(request_id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes > 0),
      size_bytes BIGINT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'uploaded')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'analysis_request_files'
          AND column_name = 'object_key'
      ) THEN
        ALTER TABLE analysis_request_files ALTER COLUMN object_key DROP NOT NULL;
      END IF;
    END $$
    """,
    """
    CREATE TABLE IF NOT EXISTS analysis_request_file_chunks (
      file_id UUID NOT NULL REFERENCES analysis_request_files(file_id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
      chunk_data BYTEA NOT NULL,
      PRIMARY KEY (file_id, chunk_index)
    )
    """,
    """
    UPDATE analysis_request_files f
    SET status = 'pending', size_bytes = NULL
    WHERE f.status = 'uploaded'
      AND NOT EXISTS (
        SELECT 1 FROM analysis_request_file_chunks c WHERE c.file_id = f.file_id
      )
    """,
    """
    CREATE INDEX IF NOT EXISTS analysis_requests_client_created_idx
      ON analysis_requests (client_user_id, created_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS analysis_requests_status_created_idx
      ON analysis_requests (status, created_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS analysis_request_files_request_idx
      ON analysis_request_files (request_id, created_at)
    """,
)


def ensure_workspace_schema(pool):
    with pool.connection() as connection:
        with connection.transaction():
            for statement in WORKSPACE_SCHEMA:
                connection.execute(statement)


class CreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    question: str = Field(min_length=5, max_length=5000)
    dataset_name: str = Field(default="Client upload", min_length=1, max_length=160)

    @field_validator("title", "question", "dataset_name", mode="before")
    @classmethod
    def require_non_whitespace(cls, value: str) -> str:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                raise ValueError("This field cannot be blank.")
        return value


class CreateUpload(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)


class DecideRequest(BaseModel):
    decision: Literal["accepted", "declined"]


class CompleteUpload(BaseModel):
    file_id: uuid.UUID


def validate_upload(filename: str, size_bytes: int) -> tuple[str, str]:
    cleaned = PurePosixPath(filename.replace("\\", "/")).name.strip()
    if not cleaned or cleaned in (".", ".."):
        raise HTTPException(status_code=422, detail="Provide a valid file name.")
    if any(ord(character) < 32 or ord(character) == 127 for character in cleaned):
        raise HTTPException(status_code=422, detail="File name contains invalid characters.")
    extension = PurePosixPath(cleaned).suffix.lower()
    content_type = {".csv": "text/csv", ".zip": "application/zip"}.get(extension)
    if content_type is None:
        raise HTTPException(
            status_code=415, detail="Only CSV and ZIP files can be attached."
        )
    if size_bytes <= 0 or size_bytes > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413, detail="Each file must be between 1 byte and 500 MB."
        )
    return cleaned, content_type


def _pool(request: Request):
    return request.app.state.db_pool


def _request_row(connection, request_id: uuid.UUID, lock: bool = False):
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            SELECT request_id, client_user_id, title, question, dataset_name,
                   status, analyst_user_id, created_at, updated_at
            FROM analysis_requests WHERE request_id = %s
            """ + (" FOR UPDATE" if lock else ""),
            (request_id,),
        )
        return cursor.fetchone()


def _authorized_request(
    connection, request_id: uuid.UUID, actor: Actor, lock: bool = False
):
    row = _request_row(connection, request_id, lock)
    if row is None:
        raise HTTPException(status_code=404, detail="Analysis request not found.")
    if actor["role"] == "client" and row["client_user_id"] != actor["user_id"]:
        raise HTTPException(status_code=404, detail="Analysis request not found.")
    return row


def expected_chunk_bytes(file_size: int, chunk_index: int) -> int:
    chunk_count = math.ceil(file_size / UPLOAD_CHUNK_BYTES)
    if chunk_index < 0 or chunk_index >= chunk_count:
        raise HTTPException(
            status_code=416, detail="Chunk index is outside the declared file size."
        )
    return min(UPLOAD_CHUNK_BYTES, file_size - chunk_index * UPLOAD_CHUNK_BYTES)


def _serialize_request(row):
    result = dict(row)
    result["request_id"] = str(result["request_id"])
    result["created_at"] = result["created_at"].isoformat()
    result["updated_at"] = result["updated_at"].isoformat()
    result["files"] = []
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
def create_request(
    body: CreateRequest,
    request: Request,
    actor: Actor = Depends(require_role("client")),
):
    request_id = uuid.uuid4()
    with _pool(request).connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                INSERT INTO analysis_requests
                  (request_id, client_user_id, title, question, dataset_name)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING request_id, client_user_id, title, question, dataset_name,
                          status, analyst_user_id, created_at, updated_at
                """,
                (
                    request_id,
                    actor["user_id"],
                    body.title.strip(),
                    body.question.strip(),
                    body.dataset_name.strip(),
                ),
            )
            row = cursor.fetchone()
    return _serialize_request(row)


@router.get("")
def list_requests(request: Request, actor: Actor = Depends(current_actor)):
    with _pool(request).connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            if actor["role"] == "analyst":
                cursor.execute(
                    """
                    SELECT request_id, client_user_id, title, question, dataset_name,
                           status, analyst_user_id, created_at, updated_at
                    FROM analysis_requests
                    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,
                             created_at DESC
                    """
                )
            else:
                cursor.execute(
                    """
                    SELECT request_id, client_user_id, title, question, dataset_name,
                           status, analyst_user_id, created_at, updated_at
                    FROM analysis_requests
                    WHERE client_user_id = %s
                    ORDER BY created_at DESC
                    """,
                    (actor["user_id"],),
                )
            rows = cursor.fetchall()

        requests = [_serialize_request(row) for row in rows]
        request_ids = [row["request_id"] for row in rows]
        if request_ids:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT file_id, request_id, filename, content_type, size_bytes, status
                    FROM analysis_request_files
                    WHERE request_id = ANY(%s)
                    ORDER BY created_at
                    """,
                    (request_ids,),
                )
                files = cursor.fetchall()
            request_by_id = {row["request_id"]: row for row in requests}
            for file_row in files:
                request_by_id[str(file_row["request_id"])]["files"].append(
                    {
                        "file_id": str(file_row["file_id"]),
                        "filename": file_row["filename"],
                        "content_type": file_row["content_type"],
                        "size_bytes": file_row["size_bytes"],
                        "status": file_row["status"],
                    }
                )
    return {"requests": requests}


@router.post("/{request_id}/uploads", status_code=status.HTTP_201_CREATED)
def create_upload(
    request_id: uuid.UUID,
    body: CreateUpload,
    request: Request,
    actor: Actor = Depends(require_role("client")),
):
    filename, content_type = validate_upload(body.filename, body.size_bytes)
    file_id = uuid.uuid4()
    with _pool(request).connection() as connection:
        with connection.transaction():
            row = _authorized_request(connection, request_id, actor, lock=True)
            if row["status"] != "pending":
                raise HTTPException(
                    status_code=409, detail="Files can only be added to pending requests."
                )
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) FROM analysis_request_files WHERE request_id = %s",
                    (request_id,),
                )
                file_count = cursor.fetchone()[0]
                if file_count >= MAX_FILES_PER_REQUEST:
                    raise HTTPException(
                        status_code=409, detail="A request can have at most 10 files."
                    )
                cursor.execute(
                    """
                    INSERT INTO analysis_request_files
                      (file_id, request_id, filename, content_type, expected_size_bytes)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        file_id,
                        request_id,
                        filename,
                        content_type,
                        body.size_bytes,
                    ),
                )
    return {
        "file_id": str(file_id),
        "chunk_size": UPLOAD_CHUNK_BYTES,
        "chunk_count": math.ceil(body.size_bytes / UPLOAD_CHUNK_BYTES),
    }


@router.put(
    "/{request_id}/uploads/{file_id}/chunks/{chunk_index}",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/octet-stream": {
                    "schema": {"type": "string", "format": "binary"}
                }
            },
        }
    },
)
async def upload_chunk(
    request_id: uuid.UUID,
    file_id: uuid.UUID,
    chunk_index: int,
    request: Request,
    actor: Actor = Depends(require_role("client")),
):
    with _pool(request).connection() as connection:
        row = _authorized_request(connection, request_id, actor)
        if row["status"] == "declined":
            raise HTTPException(status_code=409, detail="This request was declined.")
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT expected_size_bytes, status
                FROM analysis_request_files
                WHERE request_id = %s AND file_id = %s
                """,
                (request_id, file_id),
            )
            file_row = cursor.fetchone()
    if file_row is None:
        raise HTTPException(status_code=404, detail="Upload not found.")
    if file_row["status"] == "uploaded":
        raise HTTPException(status_code=409, detail="This file is already complete.")

    expected_size = int(file_row["expected_size_bytes"])
    expected_chunk_size = expected_chunk_bytes(expected_size, chunk_index)
    chunk_data = bytearray()
    async for body_chunk in request.stream():
        if len(chunk_data) + len(body_chunk) > expected_chunk_size:
            raise HTTPException(status_code=413, detail="Upload chunk is too large.")
        chunk_data.extend(body_chunk)
    if len(chunk_data) != expected_chunk_size:
        raise HTTPException(status_code=400, detail="Upload chunk size is incomplete.")

    with _pool(request).connection() as connection:
        with connection.transaction():
            row = _authorized_request(connection, request_id, actor, lock=True)
            if row["status"] == "declined":
                raise HTTPException(status_code=409, detail="This request was declined.")
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT status FROM analysis_request_files
                    WHERE request_id = %s AND file_id = %s
                    FOR UPDATE
                    """,
                    (request_id, file_id),
                )
                current = cursor.fetchone()
                if current is None:
                    raise HTTPException(status_code=404, detail="Upload not found.")
                if current[0] != "pending":
                    raise HTTPException(status_code=409, detail="This file is already complete.")
                cursor.execute(
                    """
                    INSERT INTO analysis_request_file_chunks (file_id, chunk_index, chunk_data)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (file_id, chunk_index)
                    DO UPDATE SET chunk_data = EXCLUDED.chunk_data
                    """,
                    (file_id, chunk_index, bytes(chunk_data)),
                )
    return {"file_id": str(file_id), "chunk_index": chunk_index, "status": "stored"}


@router.post("/{request_id}/uploads/complete")
def complete_upload(
    request_id: uuid.UUID,
    body: CompleteUpload,
    request: Request,
    actor: Actor = Depends(current_actor),
):
    with _pool(request).connection() as connection:
        with connection.transaction():
            authorized = _authorized_request(connection, request_id, actor, lock=True)
            if authorized["status"] == "declined":
                raise HTTPException(status_code=409, detail="This request was declined.")
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT expected_size_bytes, status
                    FROM analysis_request_files
                    WHERE request_id = %s AND file_id = %s
                    FOR UPDATE
                    """,
                    (request_id, body.file_id),
                )
                file_row = cursor.fetchone()
                if file_row is None:
                    raise HTTPException(status_code=404, detail="Uploaded file not found.")
                if file_row["status"] == "uploaded":
                    return {"file_id": str(body.file_id), "status": "uploaded"}

                expected_size = int(file_row["expected_size_bytes"])
                expected_chunks = math.ceil(expected_size / UPLOAD_CHUNK_BYTES)
                cursor.execute(
                    """
                    SELECT COUNT(*) AS chunk_count,
                           COALESCE(SUM(octet_length(chunk_data)), 0) AS total_bytes,
                           MIN(chunk_index) AS first_index,
                           MAX(chunk_index) AS last_index
                    FROM analysis_request_file_chunks
                    WHERE file_id = %s
                    """,
                    (body.file_id,),
                )
                chunks = cursor.fetchone()
                if (
                    chunks["chunk_count"] != expected_chunks
                    or chunks["total_bytes"] != expected_size
                    or chunks["first_index"] != 0
                    or chunks["last_index"] != expected_chunks - 1
                ):
                    raise HTTPException(
                        status_code=409, detail="The file is missing one or more upload chunks."
                    )
                cursor.execute(
                    """
                    UPDATE analysis_request_files
                    SET status = 'uploaded', size_bytes = %s
                    WHERE request_id = %s AND file_id = %s AND status = 'pending'
                    """,
                    (expected_size, request_id, body.file_id),
                )
    return {"file_id": str(body.file_id), "status": "uploaded"}


def _file_chunks(pool, file_id: uuid.UUID):
    with pool.connection() as connection:
        with connection.transaction():
            with connection.cursor(name=f"download_{uuid.uuid4().hex}") as cursor:
                cursor.execute(
                    """
                    SELECT chunk_data
                    FROM analysis_request_file_chunks
                    WHERE file_id = %s
                    ORDER BY chunk_index
                    """,
                    (file_id,),
                )
                for (chunk,) in cursor:
                    yield bytes(chunk)


@router.get("/{request_id}/uploads/{file_id}/download")
def download_upload(
    request_id: uuid.UUID,
    file_id: uuid.UUID,
    request: Request,
    actor: Actor = Depends(current_actor),
):
    with _pool(request).connection() as connection:
        _authorized_request(connection, request_id, actor)
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT filename, content_type, size_bytes
                FROM analysis_request_files
                WHERE request_id = %s AND file_id = %s AND status = 'uploaded'
                """,
                (request_id, file_id),
            )
            file_row = cursor.fetchone()
    if file_row is None:
        raise HTTPException(status_code=404, detail="Uploaded file not found.")
    filename = quote(file_row["filename"])
    return StreamingResponse(
        _file_chunks(_pool(request), file_id),
        media_type=file_row["content_type"],
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
            "Content-Length": str(file_row["size_bytes"]),
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{request_id}/decision")
def decide_request(
    request_id: uuid.UUID,
    body: DecideRequest,
    request: Request,
    actor: Actor = Depends(require_role("analyst")),
):
    with _pool(request).connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                UPDATE analysis_requests
                SET status = %s, analyst_user_id = %s, updated_at = NOW()
                WHERE request_id = %s AND status = 'pending'
                RETURNING request_id, client_user_id, title, question, dataset_name,
                          status, analyst_user_id, created_at, updated_at
                """,
                (body.decision, actor["user_id"], request_id),
            )
            row = cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=409,
            detail="Request was not found or has already been decided.",
        )
    return _serialize_request(row)
