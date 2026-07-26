from fastapi import FastAPI

from app.api import auth, documents, knowledge_bases

app = FastAPI(title="RAG Platform API")

app.include_router(auth.router)
app.include_router(knowledge_bases.router)
app.include_router(documents.router)


@app.get("/health")
def health():
    return {"status": "ok"}
