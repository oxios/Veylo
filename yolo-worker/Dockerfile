FROM python:3.11-slim-bookworm

ARG TORCH_VERSION=2.8.0
ARG TORCHVISION_VERSION=0.23.0

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    YOLO_MODEL_PATH=/opt/models/yolo11s.pt \
    YOLO_CONFIG_DIR=/home/yolo/.config/Ultralytics \
    MPLCONFIGDIR=/home/yolo/.cache/matplotlib \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2

RUN apt-get update \
    && apt-get install --no-install-recommends -y libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/worker
COPY requirements.txt ./requirements.txt

RUN python -m pip install --index-url https://download.pytorch.org/whl/cpu \
      "torch==${TORCH_VERSION}" "torchvision==${TORCHVISION_VERSION}" \
    && python -m pip install -r requirements.txt

RUN mkdir -p /opt/models \
    && cd /opt/models \
    && python -c "from ultralytics import YOLO; YOLO('yolo11s.pt', task='detect')" \
    && test -s /opt/models/yolo11s.pt

RUN groupadd --gid 10001 yolo \
    && useradd --uid 10001 --gid yolo --create-home --shell /usr/sbin/nologin yolo \
    && mkdir -p /home/yolo/.config/Ultralytics /home/yolo/.cache/matplotlib \
    && chown -R yolo:yolo /home/yolo

COPY --chown=yolo:yolo app ./app
COPY --chown=yolo:yolo tests ./tests

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
