# Face detection model

`face_detection_yunet_2023mar.onnx` is an optional YuNet face detector used by
`app/services/face.py` when present. If the file is missing, face tracking
falls back to the OpenCV Haar cascade (still functional, slightly less accurate).

- Source: OpenCV Zoo
  https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- License: Apache 2.0
- Size: ~233 KB

To replace or remove it, just add/delete the `.onnx` file; no code change needed.
Set `FACE_MODEL_PATH` to use a model in another location.