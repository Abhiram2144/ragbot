from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str
    stream: bool = False


class AnswerSource(BaseModel):
    marker: str
    document_id: str
    chunk_text: str


class AnswerResponse(BaseModel):
    answer: str
    sources: list[AnswerSource]
