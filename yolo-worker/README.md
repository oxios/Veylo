# VenueFlow local YOLO worker

CPU-only FastAPI service used by the local Docker Compose stack. It loads the official
`yolo11s.pt` weights during the image build, warms the model before becoming healthy,
and exposes:

- `GET /health`
- `POST /detect` with a JPG, PNG, or WebP in multipart field `image` or `frame`
- `POST /video/frame` with an AVI in multipart field `video`; it returns a JPEG
  and video/frame metadata in `X-Video-*` and `X-Frame-*` headers

The detection response uses percentage coordinates (`x`, `y`, `width`, `height`) and
the `label` / `confidence` fields expected by the VenueFlow Node adapter. The worker
does not persist uploaded images or videos. AVI uploads are streamed to a private
temporary file and removed before the request completes.

## Configuration

Environment variables include `YOLO_CONFIDENCE`, `YOLO_IOU`, `YOLO_IMAGE_SIZE`,
`YOLO_MAX_DETECTIONS`, `YOLO_MAX_UPLOAD_BYTES`, `YOLO_MAX_IMAGE_PIXELS`,
`YOLO_MAX_VIDEO_UPLOAD_BYTES`, `YOLO_MAX_VIDEO_PIXELS`,
`YOLO_MAX_VIDEO_DURATION_SECONDS`, `YOLO_VIDEO_JPEG_QUALITY`,
`YOLO_TORCH_THREADS`, and optional `YOLO_API_KEY`.

## License notice

This local development worker installs the Ultralytics package and uses Ultralytics
YOLO11 weights. Ultralytics documents its open-source code and models under the
GNU Affero General Public License v3.0 (AGPL-3.0), with a separate Enterprise License
available for use that does not meet AGPL obligations. Treat this worker as a local
development runtime only until the project's distribution, network-use, and source
availability obligations have been reviewed. Production or proprietary deployment
requires an explicit licensing decision; removing this notice does not remove those
obligations.

Official licensing guidance: https://docs.ultralytics.com/help/contributing/#open-sourcing-your-yolo-project-under-agpl-30
