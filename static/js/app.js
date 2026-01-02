// DurianLeaf AI - app.js (FINAL: DETECT + HISTORY + EDU + UI THEME)

// ================================================
// DOM (YOLO UI)
// ================================================
const fileInput = document.getElementById("fileInput");
const cameraInput = document.getElementById("cameraInput");
const previewImage = document.getElementById("previewImage");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const bboxCanvas = document.getElementById("bboxCanvas");

const detectButton = document.getElementById("detectButton");
const loadingText = document.getElementById("loadingText");

const resultContainer = document.getElementById("resultContainer");
const dominantLabel = document.getElementById("dominantLabel");
const description = document.getElementById("description");
const inferenceTime = document.getElementById("inferenceTime");
const detectionsList = document.getElementById("detectionsList");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");

const errorContainer = document.getElementById("errorContainer");
const errorMessage = document.getElementById("errorMessage");

const statTotal = document.getElementById("statTotal");
const statHealthy = document.getElementById("statHealthy");
const statPerClass = document.getElementById("statPerClass");

const historyBody = document.getElementById("historyBody");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

// ================================================
// DOM (EDU MODAL) - pastikan ada di index.html
// ================================================
const eduButton = document.getElementById("eduButton");
const eduModal = document.getElementById("eduModal");
const eduBackdrop = document.getElementById("eduBackdrop");
const eduCloseBtn = document.getElementById("eduCloseBtn");
const eduTitle = document.getElementById("eduTitle");
const eduDesc = document.getElementById("eduDesc");
const eduActions = document.getElementById("eduActions");

// ================================================
// DOM (NAV THEME) - pastikan id sesuai index.html
// ================================================
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileMenu = document.getElementById("mobile-menu");
const nav = document.querySelector("nav");

// ================================================
// STATE
// ================================================
let currentFile = null;
let lastDetections = [];
let lastLogId = null;

// ================================================
// HELPERS
// ================================================
function showError(msg) {
  if (!errorContainer || !errorMessage) return;
  errorMessage.textContent = msg;
  errorContainer.classList.remove("hidden");
}

function hideError() {
  if (!errorContainer) return;
  errorContainer.classList.add("hidden");
}

function clearCanvas() {
  const ctx = bboxCanvas?.getContext("2d");
  if (!ctx || !bboxCanvas) return;
  ctx.clearRect(0, 0, bboxCanvas.width, bboxCanvas.height);
}

function clearResult() {
  resultContainer?.classList.add("hidden");
  if (detectionsList) detectionsList.innerHTML = "";
  lastDetections = [];
  lastLogId = null;
  clearCanvas();
  hideError();
}

// ✅ helper untuk set preview pakai URL (dipakai untuk gambar hasil deteksi dari server)
function setPreviewSrc(src) {
  if (!previewImage) return;

  previewImage.onload = () => {
    previewImage.classList.remove("hidden");
    previewPlaceholder?.classList.add("hidden");
    // Karena gambar dari server sudah ada bbox (annotated),
    // kita clear canvas supaya tidak double-box.
    clearCanvas();
  };

  previewImage.src = src;
}

// ================================================
// PREVIEW (local file)
// ================================================
function showPreview(file) {
  const url = URL.createObjectURL(file);
  previewImage.onload = () => {
    previewImage.classList.remove("hidden");
    previewPlaceholder?.classList.add("hidden");
    drawBoxes(); // untuk preview local sebelum deteksi
  };
  previewImage.src = url;
}

// ================================================
// DRAW BBOX (bbox normalized 0-1) - dipakai saat preview local
// ================================================
function drawBoxes() {
  if (!bboxCanvas || !previewImage) return;

  const ctx = bboxCanvas.getContext("2d");
  ctx.clearRect(0, 0, bboxCanvas.width, bboxCanvas.height);

  if (!previewImage.src || !lastDetections?.length) return;

  const wDisp = previewImage.clientWidth;
  const hDisp = previewImage.clientHeight;

  bboxCanvas.width = wDisp;
  bboxCanvas.height = hDisp;

  ctx.font = "13px Inter, Arial, sans-serif";
  ctx.textBaseline = "top";

  lastDetections.forEach((det) => {
    if (!det?.bbox) return;
    const b = det.bbox;

    const x = (b.x_center - b.width / 2) * wDisp;
    const y = (b.y_center - b.height / 2) * hDisp;
    const w = b.width * wDisp;
    const h = b.height * hDisp;

    const label = det.label ?? "obj";
    const conf =
      det.confidence != null ? ` ${(Number(det.confidence) * 100).toFixed(0)}%` : "";
    const text = `${label}${conf}`;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#E11D48";
    ctx.strokeRect(x, y, w, h);

    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, Math.max(0, y - 18), tw + 10, 18);

    ctx.fillStyle = "white";
    ctx.fillText(text, x + 5, Math.max(0, y - 16));
  });
}

window.addEventListener("resize", drawBoxes);

// ================================================
// RENDER RESULTS
// ================================================
function showResults(data) {
  if (!resultContainer) return;
  resultContainer.classList.remove("hidden");

  dominantLabel.textContent = data.dominant_label ?? "-";
  description.textContent = data.description ?? "-";
  inferenceTime.textContent =
    data.inference_time != null ? `Waktu inferensi: ${data.inference_time} detik` : "";

  detectionsList.innerHTML = "";
  (data.detections || []).forEach((d, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${d.label} (confidence: ${d.confidence})`;
    detectionsList.appendChild(li);
  });
}

// ================================================
// API CALLS
// ================================================
async function loadStats() {
  if (!statTotal || !statHealthy || !statPerClass) return;
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();

    statTotal.textContent = data.total_detections ?? 0;
    statHealthy.textContent = data.healthy_count ?? 0;

    statPerClass.innerHTML = "";
    const per = data.per_class || {};
    Object.entries(per).forEach(([label, count]) => {
      const li = document.createElement("li");
      li.textContent = `${label}: ${count}`;
      statPerClass.appendChild(li);
    });
  } catch (e) {
    console.warn("Gagal load stats:", e);
  }
}

async function loadHistory() {
  if (!historyBody) return;
  try {
    const res = await fetch("/api/history");
    const data = await res.json();

    historyBody.innerHTML = "";
    const items = data.history || [];

    items.forEach((item) => {
      const tr = document.createElement("tr");
      const id = item.id;

      tr.classList.add("hover:bg-emerald-50/60", "cursor-pointer");
      tr.innerHTML = `
        <td class="p-2 text-xs">${item.timestamp ?? "-"}</td>
        <td class="p-2 text-xs font-semibold">${item.dominant_label ?? "-"}</td>
        <td class="p-2 text-xs">${item.inference_time ?? "-"} s</td>
        <td class="p-2 text-xs">
          ${
            id
              ? `<button class="text-[11px] px-3 py-1 rounded-full bg-gold/90 hover:bg-gold text-dark font-medium"
                    data-pdf="${id}">PDF</button>`
              : "-"
          }
        </td>
      `;

      // ✅ klik tombol PDF saja (stop propagation biar row click tidak ikut)
      const btn = tr.querySelector("[data-pdf]");
      btn?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        window.open(`/export-pdf/${id}`, "_blank");
      });

      // ✅ klik row: tampilkan gambar hasil deteksi
      if (id) {
        tr.addEventListener("click", () => {
          lastLogId = id; // biar tombol PDF atas juga ikut sesuai pilihan riwayat
          setPreviewSrc(`/image/${id}?t=${Date.now()}`);
        });
      }

      historyBody.appendChild(tr);
    });
  } catch (e) {
    console.warn("Gagal load history:", e);
  }
}

// ================================================
// DETECT EVENTS
// ================================================
fileInput?.addEventListener("change", (e) => {
  currentFile = e.target.files?.[0] || null;
  clearResult();
  if (currentFile) showPreview(currentFile);
});

cameraInput?.addEventListener("change", (e) => {
  currentFile = e.target.files?.[0] || null;
  clearResult();
  if (currentFile) showPreview(currentFile);
});

detectButton?.addEventListener("click", async () => {
  if (!currentFile) {
    showError("Silakan pilih gambar terlebih dahulu.");
    return;
  }

  hideError();
  detectButton.disabled = true;
  loadingText?.classList.remove("hidden");

  const formData = new FormData();
  formData.append("image", currentFile);

  try {
    const res = await fetch("/predict", { method: "POST", body: formData });
    const data = await res.json();

    if (!data.success) {
      showError(data.message || "Gagal mendeteksi.");
      return;
    }

    lastDetections = data.detections || [];
    lastLogId = data.log_id || data.id || null;

    showResults(data);

    // ✅ Setelah deteksi sukses, tampilkan gambar hasil deteksi (annotated) dari server
    if (lastLogId) {
      setPreviewSrc(`/image/${lastLogId}?t=${Date.now()}`);
    } else {
      // fallback: tetap gambar local + canvas bbox
      drawBoxes();
    }

    await loadStats();
    await loadHistory();
  } catch (e) {
    console.error(e);
    showError("Tidak dapat terhubung ke server.");
  } finally {
    loadingText?.classList.add("hidden");
    detectButton.disabled = false;
  }
});

downloadPdfBtn?.addEventListener("click", () => {
  if (!lastLogId) {
    showError("Belum ada data PDF.");
    return;
  }
  window.open(`/export-pdf/${lastLogId}`, "_blank");
});

clearHistoryBtn?.addEventListener("click", async () => {
  try {
    const res = await fetch("/api/clear-history", { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      showError(data.message || "Gagal menghapus riwayat.");
      return;
    }

    // reset UI
    lastLogId = null;
    lastDetections = [];
    clearCanvas();

    await loadStats();
    await loadHistory();
  } catch (e) {
    console.warn(e);
    showError("Gagal menghapus riwayat.");
  }
});

// ================================================
// EDUKASI (MODAL)
// ================================================
const EDU = {
  algal: {
    title: "Algal (Bercak Alga)",
    desc: "Bercak kehijauan/abu kusam seperti kerak tipis di permukaan daun. Muncul saat kelembapan tinggi.",
    actions: [
      "Pangkas tajuk agar sirkulasi udara bagus.",
      "Kurangi kelembapan kebun (bersihkan gulma).",
      "Buang daun parah dan musnahkan.",
      "Jika perlu gunakan tembaga sesuai label setempat."
    ]
  },
  blight: {
    title: "Blight (Hawar/Busuk Daun)",
    desc: "Daun mengering dari tepi, bercak melebar coklat/kehitaman. Cepat menyebar saat lembap.",
    actions: [
      "Buang daun terinfeksi dan serasah basah.",
      "Hindari penyiraman dari atas (overhead).",
      "Perbaiki drainase dan kurangi kelembapan.",
      "Fungisida sesuai rekomendasi setempat bila parah."
    ]
  },
  Lcolletotrichum: {
    title: "Colletotrichum (Antraknosa)",
    desc: "Bercak coklat gelap, kadang melingkar. Mudah menyebar saat musim hujan.",
    actions: [
      "Pangkas bagian terinfeksi dan musnahkan.",
      "Gunakan mulsa untuk mengurangi percikan tanah.",
      "Pemangkasan rutin untuk sirkulasi udara.",
      "Fungisida sesuai label setempat bila perlu."
    ]
  },
  healthy: {
    title: "Healthy (Daun Sehat)",
    desc: "Daun hijau merata, tidak ada gejala penyakit dominan.",
    actions: [
      "Pertahankan sanitasi kebun dan pemangkasan ringan.",
      "Pemupukan seimbang untuk daya tahan tanaman.",
      "Monitoring rutin setelah hujan.",
      "Kontrol hama secara berkala."
    ]
  },
  phomopis: {
    title: "Phomopsis",
    desc: "Bercak nekrotik tidak beraturan, kadang ada pinggiran kuning. Suka daun lembap lama.",
    actions: [
      "Buang daun terinfeksi, jangan ditumpuk di kebun.",
      "Kurangi kelembapan tajuk (pemangkasan).",
      "Hindari luka pada daun saat pemeliharaan.",
      "Fungisida sesuai rekomendasi setempat bila meningkat."
    ]
  },
  rhizoctonia: {
    title: "Rhizoctonia (Busuk Daun)",
    desc: "Bercak besar tidak teratur, daun tampak busuk/layu. Dipicu kelembapan tinggi dan sanitasi buruk.",
    actions: [
      "Bersihkan serasah basah dan buang daun terinfeksi.",
      "Perbaiki drainase dan hindari genangan.",
      "Hindari nitrogen berlebihan.",
      "Fungisida sesuai rekomendasi setempat bila perlu."
    ]
  }
};

function normalizeLabel(label) {
  const l = (label || "").trim();
  const low = l.toLowerCase();

  if (EDU[l]) return l;
  if (EDU[low]) return low;

  if (low.includes("sehat")) return "healthy";
  if (low.includes("alga")) return "algal";
  if (low.includes("blight") || low.includes("hawar")) return "blight";
  if (low.includes("collet")) return "Lcolletotrichum";
  if (low.includes("phom")) return "phomopis";
  if (low.includes("rhizo")) return "rhizoctonia";

  return null;
}

function openEduModal(label) {
  if (!eduModal) return;

  const key = normalizeLabel(label);
  const data = key ? EDU[key] : null;

  eduTitle.textContent = data ? data.title : (label || "Tidak diketahui");
  eduDesc.textContent = data ? data.desc : "Materi edukasi belum tersedia untuk label ini.";

  eduActions.innerHTML = "";
  const actions = data?.actions?.length ? data.actions : ["Belum ada saran penanganan untuk label ini."];
  actions.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    eduActions.appendChild(li);
  });

  eduModal.classList.remove("hidden");
  eduModal.classList.add("flex");
}

function closeEduModal() {
  eduModal?.classList.add("hidden");
  eduModal?.classList.remove("flex");
}

eduButton?.addEventListener("click", () => {
  const label = dominantLabel?.textContent || "";
  if (!label || label === "-") {
    showError("Deteksi dulu supaya edukasi bisa ditampilkan.");
    return;
  }
  openEduModal(label);
});

eduCloseBtn?.addEventListener("click", closeEduModal);
eduBackdrop?.addEventListener("click", closeEduModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEduModal();
});

// ================================================
// UI THEME (MOBILE MENU + SMOOTH SCROLL + NAV SCROLL + FADE + RIPPLE)
// ================================================
document.addEventListener("DOMContentLoaded", () => {
  // Mobile menu toggle
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
      const icon = mobileMenuBtn.querySelector("i");
      if (!icon) return;

      if (mobileMenu.classList.contains("hidden")) {
        icon.classList.remove("fa-times");
        icon.classList.add("fa-bars");
      } else {
        icon.classList.remove("fa-bars");
        icon.classList.add("fa-times");
      }
    });
  }

  // Close mobile menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!mobileMenu || !mobileMenuBtn) return;
    if (mobileMenu.contains(e.target) || mobileMenuBtn.contains(e.target)) return;

    mobileMenu.classList.add("hidden");
    const icon = mobileMenuBtn.querySelector("i");
    icon?.classList.remove("fa-times");
    icon?.classList.add("fa-bars");
  });

  // Smooth scroll for anchor
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (!href || href === "#") return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      const offsetTop = target.offsetTop - 80;
      window.scrollTo({ top: offsetTop, behavior: "smooth" });

      // Close mobile menu
      mobileMenu?.classList.add("hidden");
      const icon = mobileMenuBtn?.querySelector("i");
      icon?.classList.remove("fa-times");
      icon?.classList.add("fa-bars");
    });
  });

  // Navbar effect on scroll (RAPIH + RESET INLINE STYLE)
  const heroSection = document.querySelector("#beranda") || document.querySelector("section");
  const getHeroHeight = () => (heroSection ? heroSection.offsetHeight : 600);

  function setNavLight() {
    if (!nav) return;

    nav.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
    nav.style.backdropFilter = "blur(20px)";
    nav.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.08)";

    document.querySelectorAll(".nav-text").forEach((el) => {
      el.classList.remove("text-white");
      el.classList.add("text-dark");
    });
    document.querySelectorAll(".nav-link").forEach((el) => {
      el.classList.remove("text-white/80");
      el.classList.add("text-muted");
    });
    document.querySelector("#mobile-menu-btn i")?.classList.remove("text-white");
    document.querySelector("#mobile-menu-btn i")?.classList.add("text-dark");
  }

  function resetNavToDefault() {
    if (!nav) return;

    nav.style.backgroundColor = "";
    nav.style.backdropFilter = "";
    nav.style.boxShadow = "";

    document.querySelectorAll(".nav-text").forEach((el) => {
      el.classList.remove("text-dark");
      el.classList.add("text-white");
    });
    document.querySelectorAll(".nav-link").forEach((el) => {
      el.classList.remove("text-muted");
      el.classList.add("text-white/80");
    });
    document.querySelector("#mobile-menu-btn i")?.classList.remove("text-dark");
    document.querySelector("#mobile-menu-btn i")?.classList.add("text-white");
  }

  function updateNavbarOnScroll() {
    const heroHeight = getHeroHeight();
    const currentScroll = window.pageYOffset;

    if (currentScroll > heroHeight - 100) setNavLight();
    else resetNavToDefault();
  }

  window.addEventListener("scroll", updateNavbarOnScroll);
  window.addEventListener("resize", updateNavbarOnScroll);
  updateNavbarOnScroll();

  // Fade-in sections (opsional)
  const observerOptions = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
      fadeObserver.unobserve(entry.target);
    });
  }, observerOptions);

  document.querySelectorAll("section").forEach((section, index) => {
    section.style.opacity = "0";
    section.style.transform = "translateY(30px)";
    section.style.transition = `opacity 0.6s ease ${index * 0.06}s, transform 0.6s ease ${index * 0.06}s`;
    fadeObserver.observe(section);
  });

  // Ripple effect (untuk button dan a)
  document.querySelectorAll("button, a").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement("span");

      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255,255,255,0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
      `;

      this.style.position = "relative";
      this.style.overflow = "hidden";
      this.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });
  });

  // Inject ripple keyframes (sekali)
  if (!document.getElementById("ripple-style")) {
    const style = document.createElement("style");
    style.id = "ripple-style";
    style.textContent = `
      @keyframes ripple { to { transform: scale(4); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }

  // init stats & history
  loadStats();
  loadHistory();

  console.log("%c🌿 DurianLeaf AI", "color:#1B5E3C;font-size:20px;font-weight:bold;");
});

// ================================================
// LIGHTBOX (klik gambar -> full screen)
// ================================================
(function initLightbox() {
  const modal = document.getElementById("lightboxModal");
  const backdrop = document.getElementById("lightboxBackdrop");
  const closeBtn = document.getElementById("lightboxClose");
  const modalImg = document.getElementById("lightboxImage");

  if (!modal || !backdrop || !closeBtn || !modalImg) return;

  modalImg.style.maxWidth = "92vw";
  modalImg.style.maxHeight = "88vh";
  modalImg.style.objectFit = "contain";
  modalImg.style.display = "block";

  let isOpen = false;

  function open(src, altText) {
    modalImg.src = src;
    modalImg.alt = altText || "Gambar";
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    isOpen = true;
  }

  function close() {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    modalImg.src = "";
    isOpen = false;
  }

  document.querySelectorAll("img[data-lightbox]").forEach((img) => {
    img.classList.add("cursor-zoom-in");
    img.addEventListener("click", () => open(img.currentSrc || img.src, img.alt));
  });

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) close();
  });

  function refit() {
    if (!isOpen) return;
    modalImg.style.transform = "translateZ(0)";
    requestAnimationFrame(() => (modalImg.style.transform = ""));
  }
  window.addEventListener("resize", refit);
  window.addEventListener("orientationchange", refit);
})();
