from flask import Flask, render_template, request, jsonify, send_file, session
from ultralytics import YOLO
from PIL import Image, ImageEnhance
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

import io
import os
import time
import json
import secrets
import shutil
from datetime import datetime


# ============================================================
# FLASK APP
# ============================================================
app = Flask(__name__)

# Secret key untuk session (wajib agar riwayat per user/browser bisa jalan)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))

# Batasi ukuran upload (opsional tapi aman)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}


# ============================================================
# PATH
# ============================================================
MODEL_PATH = "models/durianlast_yolo.pt"
IMAGES_DIR = "detected_images"   # akan dibuat subfolder per user/browser
LOG_DIR = "logs"                # log per user/browser: logs/detections_<sid>.json

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)


# ============================================================
# LOAD YOLO MODEL
# ============================================================
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Model tidak ditemukan: {MODEL_PATH}")

print(f"[INIT] Memuat model dari: {MODEL_PATH}")
model = YOLO(MODEL_PATH)
print("[INIT] Model berhasil dimuat.")


# ============================================================
# 6 KELAS SESUAI DATASET
# ============================================================
CLASS_NAMES = {
    0: "algal",
    1: "blight",
    2: "Lcolletotrichum",
    3: "healthy",
    4: "phomopis",
    5: "rhizoctonia",
}

CLASS_DESC = {
    "Algal": "Penyakit akibat alga yang menyebabkan bercak kehijauan/abu kusam.",
    "Blight": "Daun mengering dari tepi, bercak melebar coklat/kehitaman.",
    "Lcolletotrichum": "Bercak coklat gelap, kadang melingkar, disebabkan jamur Colletotrichum.",
    "Healthy": "Daun berwarna hijau merata, tidak ada bercak atau gejala penyakit.",
    "Phomopis": "Bercak nekrotik tidak beraturan dengan pinggiran kuning (halo).",
    "Rhizoctonia": "Busuk daun disebabkan jamur Rhizoctonia, bercak besar dan tidak teratur.",
}


# ============================================================
# SESSION HELPERS (agar riwayat beda tiap user/browser)
# ============================================================
def get_session_id():
    """
    Membuat SID unik per user/browser (tersimpan di cookie session).
    Tanpa login, tapi tetap bisa beda riwayat antar user.
    """
    if "sid" not in session:
        session["sid"] = secrets.token_hex(16)
    return session["sid"]

def get_log_path():
    return os.path.join(LOG_DIR, f"detections_{get_session_id()}.json")

def get_user_images_dir():
    return os.path.join(IMAGES_DIR, get_session_id())


@app.before_request
def ensure_sid():
    # memastikan sid selalu ada sebelum route manapun jalan
    get_session_id()


# ============================================================
# LOG SYSTEM (PER SESSION)
# ============================================================
def load_logs():
    path = get_log_path()
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def save_logs(records):
    path = get_log_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

def add_log(record):
    logs = load_logs()
    logs.append(record)
    save_logs(logs)


# ============================================================
# PAGES
# ============================================================
@app.route("/")
def index():
    return render_template("index.html")

# Kalau memang kamu sudah tidak pakai halaman lain, boleh hapus route ini
@app.route("/profil")
def profil():
    return render_template("profil.html")

@app.route("/riwayat")
def riwayat():
    return render_template("riwayat.html")

@app.route("/tentang")
def tentang():
    return render_template("tentang.html")


# ============================================================
# API: PREDICT
# ============================================================
@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"success": False, "message": "File gambar tidak dikirim."}), 400

    file = request.files["image"]
    filename = (file.filename or "").lower()
    ext = os.path.splitext(filename)[1]
    if ext not in ALLOWED_EXT:
        return jsonify({"success": False, "message": "Format file harus JPG/PNG/WEBP."}), 400

    try:
        img_bytes = file.read()
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        W, H = img.size

        # enhancement ringan
        img_enh = ImageEnhance.Contrast(img).enhance(1.1)
        img_enh = ImageEnhance.Color(img_enh).enhance(1.05)

        # inference
        t0 = time.time()
        results = model(img_enh, imgsz=640, conf=0.20, verbose=False)
        infer_time = round(time.time() - t0, 3)
        r = results[0]

        if r.boxes is None or len(r.boxes) == 0:
            return jsonify({
                "success": True,
                "dominant_label": "Tidak terdeteksi",
                "detections": [],
                "description": "Model tidak mendeteksi objek pada gambar.",
                "image_width": W,
                "image_height": H,
                "inference_time": infer_time
            })

        detections = []
        MIN_AREA = 0.003   # 0.3% area gambar
        MIN_CONF = 0.20

        for box in r.boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            x, y, w, h = box.xywhn[0].tolist()
            area = w * h

            if area < MIN_AREA:
                continue
            if conf < MIN_CONF:
                continue

            label = CLASS_NAMES.get(cls_id, f"class_{cls_id}")

            detections.append({
                "class_id": cls_id,
                "confidence": round(conf, 3),
                "label": label,
                "bbox": {
                    "x_center": float(x),
                    "y_center": float(y),
                    "width": float(w),
                    "height": float(h),
                }
            })

        if len(detections) == 0:
            return jsonify({
                "success": True,
                "dominant_label": "Tidak terdeteksi",
                "detections": [],
                "description": "Objek terdeteksi sangat lemah/kecil sehingga difilter.",
                "image_width": W,
                "image_height": H,
                "inference_time": infer_time
            })

        dominant = max(detections, key=lambda d: d["confidence"])
        label = dominant["label"]
        desc = CLASS_DESC.get(label, "Deskripsi belum tersedia.")

        # simpan image & log (PER SESSION)
        det_id = str(time.time_ns())
        user_img_dir = get_user_images_dir()
        os.makedirs(user_img_dir, exist_ok=True)

        img_path = os.path.join(user_img_dir, f"{det_id}.jpg")

        # Simpan gambar HASIL DETEKSI (dengan bbox)
        # Ultralytics r.plot() mengembalikan numpy array BGR
        annotated = r.plot()
        annotated_rgb = annotated[..., ::-1]  # BGR -> RGB
        Image.fromarray(annotated_rgb).save(img_path, "JPEG", quality=92)

        add_log({
            "id": det_id,
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "dominant_label": label,
            "description": desc,
            "detections": detections,
            "inference_time": infer_time,
            "image_path": img_path
        })

        return jsonify({
            "success": True,
            "dominant_label": label,
            "description": desc,
            "detections": detections,
            "image_width": W,
            "image_height": H,
            "inference_time": infer_time,
            "log_id": det_id
        })

    except Exception as e:
        print("[ERROR /predict]:", e)
        return jsonify({"success": False, "message": "Kesalahan server."}), 500


# ============================================================
# API: HISTORY (PER SESSION)
# ============================================================
@app.route("/api/history", methods=["GET"])
def api_history():
    logs = load_logs()[::-1]  # terbaru di atas
    return jsonify({"success": True, "history": logs})

@app.route("/api/clear-history", methods=["POST"])
def api_clear_history():
    # hapus log user ini saja
    save_logs([])

    # hapus gambar user ini saja
    user_img_dir = get_user_images_dir()
    if os.path.exists(user_img_dir):
        shutil.rmtree(user_img_dir, ignore_errors=True)

    return jsonify({"success": True, "message": "Riwayat berhasil dihapus (khusus user ini)."})


# ============================================================
# API: STATS (PER SESSION)
# ============================================================
@app.route("/api/stats", methods=["GET"])
def api_stats():
    logs = load_logs()

    per_class = {name: 0 for name in CLASS_NAMES.values()}
    total = len(logs)

    for log in logs:
        lbl = log.get("dominant_label")
        if lbl in per_class:
            per_class[lbl] += 1

    healthy_count = per_class.get("healthy", 0)

    return jsonify({
        "success": True,
        "total_detections": total,
        "per_class": per_class,
        "healthy_count": healthy_count,
    })


# ============================================================
# EXPORT PDF (PER SESSION)
# ============================================================
@app.route("/export-pdf/<det_id>", methods=["GET"])
def export_pdf(det_id):
    logs = load_logs()  # hanya logs milik user ini
    data = next((x for x in logs if x.get("id") == det_id), None)
    if data is None:
        return "Data tidak ditemukan", 404

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    y = page_h - 50

    p.setFont("Helvetica-Bold", 16)
    p.drawString(50, y, "Laporan Deteksi Daun Durian")
    y -= 30

    p.setFont("Helvetica", 11)
    p.drawString(50, y, f"ID: {data.get('id','-')}")
    y -= 15
    p.drawString(50, y, f"Waktu: {data.get('timestamp','-')}")
    y -= 15
    p.drawString(50, y, f"Hasil: {data.get('dominant_label','-')}")
    y -= 15
    p.drawString(50, y, f"Inferensi: {data.get('inference_time','-')} detik")
    y -= 20

    img_path = data.get("image_path")
    if img_path and os.path.exists(img_path):
        try:
            from PIL import Image as PILImage
            im = PILImage.open(img_path)
            iw, ih = im.size

            max_w = page_w - 100
            max_h = 260
            scale = min(max_w / iw, max_h / ih)

            new_w = iw * scale
            new_h = ih * scale

            p.drawImage(img_path, 50, y - new_h, width=new_w, height=new_h)
            y -= new_h + 20
        except Exception as e:
            print("[WARN] Gagal add image ke PDF:", e)

    p.setFont("Helvetica-Bold", 12)
    p.drawString(50, y, "Deskripsi:")
    y -= 16

    p.setFont("Helvetica", 10)
    desc = data.get("description", "-")
    lines = simpleSplit(str(desc), "Helvetica", 10, page_w - 100)
    text = p.beginText(50, y)
    for line in lines:
        text.textLine(line)
    p.drawText(text)

    p.setFont("Helvetica-Oblique", 9)
    p.setFillGray(0.5)
    p.drawString(page_w - 200, 30, "Generated by DurianLeaf AI")

    p.save()
    buffer.seek(0)

    return send_file(buffer, download_name=f"laporan_{det_id}.pdf", as_attachment=True)


# ============================================================
# ✅ SERVE IMAGE HASIL DETEKSI (PER SESSION)
# ============================================================
@app.route("/image/<det_id>", methods=["GET"])
def get_image(det_id):
    # hanya boleh akses gambar yang ada di log session user ini
    logs = load_logs()
    data = next((x for x in logs if x.get("id") == det_id), None)
    if data is None:
        return "Data tidak ditemukan", 404

    img_path = data.get("image_path")
    if not img_path or not os.path.exists(img_path):
        return "Gambar tidak ditemukan", 404

    return send_file(img_path, mimetype="image/jpeg")


# ============================================================
# RUN
# ============================================================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
