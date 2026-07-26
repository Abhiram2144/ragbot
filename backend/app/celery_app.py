from celery import Celery

from app.config import settings

celery = Celery(
    "ragbot",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
)

celery.autodiscover_tasks(["app.workers"])
