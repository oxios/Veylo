FROM python:3.11-slim-bookworm

# cpu = small CPU-only torch; cu128 = CUDA 12.8 wheels for NVIDIA GPUs (needs the NVIDIA container toolkit).
ARG TORCH_VARIANT=cpu
ARG TORCH_VERSION=2.8.0
ARG TORCHVISION_VERSION=0.23.0

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10 \
    YOLO_CONFIG_DIR=/home/node/.config/Ultralytics \
    MPLCONFIGDIR=/home/node/.cache/matplotlib \
    OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp|timeout;10000000" \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility,video \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2

# ffmpeg: probing cameras, snapshots, live publishing to the hub, archive clips.
RUN apt-get update \
    && apt-get install --no-install-recommends -y libgomp1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/node
COPY requirements.txt ./requirements.txt

# The pip cache mount keeps the multi-GB torch wheels on the build host (never in the image), so a rebuild after
# BuildKit evicted this layer installs from the local cache instead of downloading again.
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    python -m pip install --index-url "https://download.pytorch.org/whl/${TORCH_VARIANT}" \
      "torch==${TORCH_VERSION}" "torchvision==${TORCHVISION_VERSION}" \
    && python -m pip install -r requirements.txt

# ONNX Runtime for the ReID model. The GPU build must match torch's CUDA 12 (onnxruntime-gpu 1.23+ needs CUDA 13).
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    if [ "${TORCH_VARIANT}" = "cpu" ]; then RUNTIME="onnxruntime==1.22.0"; else RUNTIME="onnxruntime-gpu==1.22.0"; fi \
    && python -m pip install "${RUNTIME}" "onnx==1.19.1"

# Models are declared after the heavy layers: choosing another model must not reinstall torch.
# Detector (yolo11s on CPU, yolo11m on GPU), person re-identification (appearance vectors for "the same guest
# again today") and SAM 2 (outlining furniture in the markup editor).
ARG YOLO_MODEL=yolo11s.pt
ARG REID_MODEL=yolo26s-reid.onnx
ARG SAM_MODEL=sam2.1_b.pt
ENV YOLO_MODEL_PATH=/opt/models/${YOLO_MODEL} \
    REID_MODEL_PATH=/opt/models/${REID_MODEL} \
    SAM_MODEL_PATH=/opt/models/${SAM_MODEL}

RUN mkdir -p /opt/models \
    && cd /opt/models \
    && python -c "from ultralytics import YOLO; YOLO('${YOLO_MODEL}', task='detect')" \
    && test -s /opt/models/${YOLO_MODEL} \
    && python -c "from ultralytics.utils.downloads import attempt_download_asset; attempt_download_asset('${REID_MODEL}')" \
    && test -s /opt/models/${REID_MODEL} \
    && python -c "from ultralytics import SAM; SAM('${SAM_MODEL}')" \
    && test -s /opt/models/${SAM_MODEL}

# uid 1000 matches node-mediamtx file ownership expectations and the API image's `node` user.
RUN groupadd --gid 1000 node \
    && useradd --uid 1000 --gid node --create-home --shell /usr/sbin/nologin node \
    && mkdir -p /home/node/.config/Ultralytics /home/node/.cache/matplotlib /recordings /tmp/venueflow \
    && chown -R node:node /home/node /recordings /tmp/venueflow /opt/models

COPY --chown=node:node app ./app
COPY --chown=node:node tests ./tests

USER 1000:1000

HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=4 \
  CMD ["python", "-c", "import os, sys, time; sys.exit(0 if time.time() - os.path.getmtime('/tmp/camera-node-heartbeat') < 60 else 1)"]

CMD ["python", "-m", "app.agent"]
