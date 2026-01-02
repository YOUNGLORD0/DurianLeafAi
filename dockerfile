FROM python:3.11-slim

# Install library OS yang sering dibutuhkan OpenCV/Ultralytics
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements dulu biar layer cache enak
COPY requirements.txt /app/requirements.txt

# Upgrade pip + install deps
RUN pip install --no-cache-dir -U pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy semua file project
COPY . /app

# Hugging Face Spaces umumnya pakai port 7860
EXPOSE 7860

# Jalankan dengan gunicorn (lebih stabil dari app.run)
CMD ["gunicorn", "-b", "0.0.0.0:7860", "app:app", "--timeout", "180"]
