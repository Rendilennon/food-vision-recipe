import io

# pyrefly: ignore[missing-import]
from fastapi import FastAPI, File, UploadFile, Request
# pyrefly: ignore[missing-import]
from fastapi.responses import HTMLResponse
# pyrefly: ignore[missing-import]
from fastapi.staticfiles import StaticFiles
# pyrefly: ignore[missing-import]
from fastapi.templating import Jinja2Templates
# pyrefly: ignore[missing-import]
from PIL import Image
# pyrefly: ignore[missing-import]
from ultralytics import YOLO

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Load model custom
try:
    model = YOLO("model/best (5).pt")
    print("Model Load Successfully")
    print("Daftar Kelas Model:", model.names)  # Cek nama kelas sebenarnya
except Exception as e:
    print(f"Gagal memuat model: {e}")
    model = None

# Mapping nama bahan untuk filter dan label tampilan
INFO_BAHAN = {
    "bawang_putih": {"name": "Bawang Putih"},
    "cabai": {"name": "Cabai"},
    "tomat": {"name": "Tomat"},
}


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/detect")
async def detect_food(file: UploadFile = File(...)):
    if model is None:
        return {"detections": [], "total_items": 0}

    contents = await file.read()
    image = Image.open(io.BytesIO(contents))

    # Prediksi menggunakan YOLO
    results = model(image, conf=0.35)

    detections = []
    total_items = 0

    if len(results) > 0 and results[0].boxes is not None:
        boxes = results[0].boxes
        for box in boxes:
            class_id = int(box.cls[0])
            raw_label = model.names[class_id]

            # Normalisasi label nama kelas
            label = (
                str(raw_label)
                .lower()
                .strip()
                .replace(" ", "_")
                .replace("-", "_")
            )

            confidence = float(box.conf[0])
            xyxy = box.xyxy[0].tolist()

            xmin, ymin, xmax, ymax = (
                int(xyxy[0]),
                int(xyxy[1]),
                int(xyxy[2]),
                int(xyxy[3]),
            )
            width = xmax - xmin
            height = ymax - ymin

            # Jika label terdaftar di INFO_BAHAN
            if label in INFO_BAHAN:
                info = INFO_BAHAN[label]
                total_items += 1

                detections.append(
                    {
                        "label": f"{info['name']} #{total_items}",
                        "raw_class": label,
                        "confidence": f"{confidence * 100:.1f}%",
                        # Format [xmin, ymin, width, height]
                        "box": [xmin, ymin, width, height],
                        # Format [xmin, ymin, xmax, ymax] untuk antisipasi JS yang butuh xyxy
                        "bbox_xyxy": [xmin, ymin, xmax, ymax],
                    }
                )

    return {"detections": detections, "total_items": total_items}