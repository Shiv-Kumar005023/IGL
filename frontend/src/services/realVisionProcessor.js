/**
 * Real-Time Canvas & Computer Vision Frame Processing Engine
 * Powered by TensorFlow.js & COCO-SSD for Production-Grade AI Object Detection.
 */

import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

// Global AI Model & State Handles
let cocoModel = null;
let modelLoadingPromise = null;
let modelStatus = "UNINITIALIZED"; // UNINITIALIZED, LOADING, READY, ERROR
let modelErrorMessage = "";

// Track ID Generator & Track Memory Across Frames
let nextTrackId = 101;
let activeTracks = []; // [{ trackId, box: [x,y,w,h], center: [cx, cy], lastSeen: timestamp }]

// // NEW & IMPROVED: Phone Misuse Persistent Verification State Map across frames
// key: trackId -> {
//   firstSeen: timestamp,
//   lastSeen: timestamp,
//   durationSec: number,
//   warningLevel: number,
//   sirenActive: boolean,
//   lastWarningTime: timestamp,
//   lastPhoneConfidence: number,
//   persistenceCount: number, // consecutive frames with phone candidate
//   missGraceCount: number    // grace frames for temporary 1-2 frame missed detections
// }
const phoneMisuseState = new Map();

// Siren Web Audio API Synthesizer Handle
let sirenAudioContext = null;
let sirenOscillator = null;
let sirenGain = null;
let sirenInterval = null;

/**
 * Load TensorFlow COCO-SSD Model asynchronously
 * // IMPROVED: Prefers 'mobilenet_v2' for higher resolution feature extraction on small objects like cell phones.
 */
export async function loadDetectionModel() {
  if (modelStatus === "READY" && cocoModel) {
    return { success: true, model: cocoModel };
  }

  if (modelStatus === "LOADING" && modelLoadingPromise) {
    return modelLoadingPromise;
  }

  modelStatus = "LOADING";
  modelErrorMessage = "";

  modelLoadingPromise = (async () => {
    try {
      // Ensure TF backend is initialized
      await tf.ready();
      
      // // IMPROVED: Load COCO-SSD MobileNetV2 model for improved small object resolution
      try {
        cocoModel = await cocoSsd.load({
          base: "mobilenet_v2"
        });
      } catch (e) {
        console.warn("Falling back to lite_mobilenet_v2:", e);
        cocoModel = await cocoSsd.load({
          base: "lite_mobilenet_v2"
        });
      }

      modelStatus = "READY";
      console.log("✅ TensorFlow COCO-SSD Object Detection Model Loaded Successfully.");
      return { success: true, model: cocoModel };
    } catch (err) {
      modelStatus = "ERROR";
      modelErrorMessage = `AI MODEL UNAVAILABLE: ${err.message || "Failed to load TensorFlow model"}`;
      console.error("❌ COCO-SSD Model Load Error:", err);
      return { success: false, error: modelErrorMessage };
    }
  })();

  return modelLoadingPromise;
}

/**
 * Returns current status of the AI Model
 */
export function getModelStatus() {
  return {
    status: modelStatus,
    errorMessage: modelErrorMessage,
    isReady: modelStatus === "READY"
  };
}

/**
 * Frame Quality & Assessability Analyzer (Pitch Dark / Severe Blur / Occlusion)
 */
export function analyzeFrameQuality(canvas, ctx) {
  if (!canvas || !ctx) {
    return { isAssessable: false, brightness: 0, blurScore: 0, reason: "Canvas context uninitialized" };
  }

  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) {
    return { isAssessable: false, brightness: 0, blurScore: 0, reason: "Zero width/height video stream" };
  }

  try {
    const sampleWidth = Math.min(width, 160);
    const sampleHeight = Math.min(height, 120);

    const offCanvas = document.createElement("canvas");
    offCanvas.width = sampleWidth;
    offCanvas.height = sampleHeight;
    const offCtx = offCanvas.getContext("2d");
    offCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);

    const imgData = offCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;

    let totalLum = 0;
    const gray = new Float32Array(sampleWidth * sampleHeight);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[j] = lum;
      totalLum += lum;
    }

    const avgBrightness = totalLum / (sampleWidth * sampleHeight);

    let sumGrad = 0;
    let sumGradSq = 0;
    const count = (sampleWidth - 2) * (sampleHeight - 2);

    for (let y = 1; y < sampleHeight - 1; y++) {
      for (let x = 1; x < sampleWidth - 1; x++) {
        const idx = y * sampleWidth + x;
        const val =
          gray[idx - sampleWidth] +
          gray[idx + sampleWidth] +
          gray[idx - 1] +
          gray[idx + 1] -
          4 * gray[idx];

        sumGrad += val;
        sumGradSq += val * val;
      }
    }

    const meanGrad = sumGrad / count;
    const blurScore = (sumGradSq / count) - (meanGrad * meanGrad);

    if (avgBrightness < 25.0) {
      return {
        isAssessable: false,
        brightness: Math.round(avgBrightness),
        blurScore: Math.round(blurScore),
        reason: `NOT ASSESSABLE: Environment pitch dark (Brightness: ${Math.round(avgBrightness)}/255)`
      };
    }

    if (blurScore < 12.0) {
      return {
        isAssessable: false,
        brightness: Math.round(avgBrightness),
        blurScore: Math.round(blurScore),
        reason: `NOT ASSESSABLE: Camera lens obstructed / severe blur (Blur Score: ${Math.round(blurScore)})`
      };
    }

    return {
      isAssessable: true,
      brightness: Math.round(avgBrightness),
      blurScore: Math.round(blurScore),
      reason: "OK"
    };

  } catch (err) {
    return { isAssessable: false, brightness: 0, blurScore: 0, reason: `Frame processing error: ${err.message}` };
  }
}

/**
 * Checks if point (x, y) in 0-1 normalized coordinates is inside a polygon ROI
 */
export function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculates Euclidean distance between two center points [x, y, w, h] (normalized 0-1)
 */
export function calculateBoxDistance(box1, box2) {
  const cx1 = box1[0] + box1[2] / 2;
  const cy1 = box1[1] + box1[3] / 2;

  const cx2 = box2[0] + box2[2] / 2;
  const cy2 = box2[1] + box2[3] / 2;

  const dist = Math.sqrt(Math.pow(cx1 - cx2, 2) + Math.pow(cy1 - cy2, 2));
  return Math.round(dist * 100) / 100;
}

/**
 * Extracts average color feature vector from target bounding box on canvas
 */
export function extractBoxFeatureVector(canvas, box) {
  if (!canvas) return { r_avg: 128, g_avg: 128, b_avg: 128 };
  try {
    const ctx = canvas.getContext("2d");
    const bx = Math.max(0, Math.floor(box[0] * canvas.width));
    const by = Math.max(0, Math.floor(box[1] * canvas.height));
    const bw = Math.max(10, Math.floor(box[2] * canvas.width));
    const bh = Math.max(10, Math.floor(box[3] * canvas.height));

    const imgData = ctx.getImageData(bx, by, bw, bh);
    const data = imgData.data;

    let rSum = 0, gSum = 0, bSum = 0;
    const pixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
    }

    return {
      r_avg: Math.round(rSum / pixels),
      g_avg: Math.round(gSum / pixels),
      b_avg: Math.round(bSum / pixels)
    };
  } catch (err) {
    return { r_avg: 120, g_avg: 120, b_avg: 120 };
  }
}

/**
 * Captures live Base64 JPEG frame snapshot from canvas with burnt-in metadata text stamp
 */
export function captureCanvasSnapshot(canvas, overlayText = "") {
  if (!canvas) return "";
  try {
    const snapCanvas = document.createElement("canvas");
    snapCanvas.width = canvas.width || 640;
    snapCanvas.height = canvas.height || 360;
    const snapCtx = snapCanvas.getContext("2d");

    snapCtx.drawImage(canvas, 0, 0, snapCanvas.width, snapCanvas.height);

    snapCtx.fillStyle = "rgba(15, 23, 42, 0.88)";
    snapCtx.fillRect(10, snapCanvas.height - 42, snapCanvas.width - 20, 32);
    snapCtx.fillStyle = "#ef4444";
    snapCtx.font = "bold 13px 'JetBrains Mono', monospace";
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    snapCtx.fillText(`[EVIDENCE SNAPSHOT] ${timestamp} | ${overlayText}`, 20, snapCanvas.height - 20);

    return snapCanvas.toDataURL("image/jpeg", 0.85);
  } catch (e) {
    return "";
  }
}

/**
 * // FIX & IMPROVED: Strict & Conservative Computer Vision Hardhat Inspection Algorithm.
 * 
 * PRODUCTION LIMITATION NOTICE:
 * Standard COCO-SSD object detection models (MobileNet) do NOT contain a custom 'hardhat' / 'safety helmet' class.
 * Reliable production-grade PPE helmet verification requires a fine-tuned ML model (e.g. YOLOv8 / Faster R-CNN)
 * trained specifically on industrial hardhat datasets.
 * 
 * This classical computer-vision heuristic is designed to be STRICT & CONSERVATIVE:
 * - It strictly prefers 'hasHelmet: false' when visual evidence is uncertain.
 * - It analyzes a smaller, head-dome focused ROI (top 16% of person box) to prevent hair/clothes interference.
 * - It enforces multi-attribute checks: Plastic HSV Saturation, Top-Region Concentration, and Spatial Clustered Pixel Density.
 */
export function inspectHelmetAndPersonsInCanvas(canvas, box) {
  // // FIX: Conservative Rule - Never assume helmet = true when canvas or box is uninitialized
  if (!canvas || !box || box.length < 4) {
    return {
      hasHelmet: false,
      confidence: 0.50,
      reason: "MISSING HELMET: Canvas or bounding box uninitialized",
      diagnostics: { colorRatio: 0, upperRegionRatio: 0, spatialScore: 0 }
    };
  }

  try {
    const ctx = canvas.getContext("2d");
    const width = canvas.width || 640;
    const height = canvas.height || 360;

    if (width === 0 || height === 0) {
      return {
        hasHelmet: false,
        confidence: 0.50,
        reason: "MISSING HELMET: Zero canvas dimensions",
        diagnostics: { colorRatio: 0, upperRegionRatio: 0, spatialScore: 0 }
      };
    }

    // // FIX: Clamp bounding-box coordinates to prevent getImageData invalid arguments
    const bx = Math.max(0, Math.min(width - 1, Math.floor(box[0] * width)));
    const by = Math.max(0, Math.min(height - 1, Math.floor(box[1] * height)));
    const bw = Math.max(10, Math.min(width - bx, Math.floor(box[2] * width)));
    const personH = Math.floor(box[3] * height);

    // // IMPROVED: Analyze smaller, head-dome focused ROI (top 16% of person box instead of top 25%)
    const hh = Math.max(8, Math.min(height - by, Math.floor(personH * 0.16)));

    if (bw < 8 || hh < 8) {
      return {
        hasHelmet: false,
        confidence: 0.55,
        reason: "MISSING HELMET: Head ROI too small for visual verification",
        diagnostics: { colorRatio: 0, upperRegionRatio: 0, spatialScore: 0 }
      };
    }

    const imgData = ctx.getImageData(bx, by, bw, hh);
    const data = imgData.data;
    const totalPixels = bw * hh;

    if (totalPixels === 0) {
      return {
        hasHelmet: false,
        confidence: 0.50,
        reason: "MISSING HELMET: Zero pixel head ROI",
        diagnostics: { colorRatio: 0, upperRegionRatio: 0, spatialScore: 0 }
      };
    }

    // // NEW: Configurable Conservative Heuristic Thresholds
    const helmetColorRatioThreshold = 0.30;     // At least 30% of head dome must be hardhat plastic color
    const helmetUpperRegionThreshold = 0.45;    // At least 45% of hardhat pixels must be in top half of head ROI
    const spatialClusterThreshold = 0.25;        // At least 25% contiguous cluster density

    let hardhatPixelCount = 0;
    let upperHalfHardhatPixels = 0;
    const midY = Math.floor(hh / 2);

    // Grid map for 2x2 contiguous spatial clustering test
    const grid = new Uint8Array(bw * hh);

    let idx = 0;
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < bw; x++) {
        const pIdx = (y * bw + x) * 4;
        const r = data[pIdx];
        const g = data[pIdx + 1];
        const b = data[pIdx + 2];

        // RGB to HSV
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;

        let h = 0;
        if (d !== 0) {
          if (max === r) h = ((g - b) / d) % 6;
          else if (max === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
          h = Math.round(h * 60);
          if (h < 0) h += 360;
        }

        const s = max === 0 ? 0 : d / max;
        const v = max / 255;

        // Hardhat Plastic Reflection Thresholds (Yellow/Orange, Red, White/Blue)
        const isYellowOrange = h >= 15 && h <= 55 && s > 0.40 && v > 0.45;
        const isRedHelmet = (h <= 12 || h >= 348) && s > 0.50 && v > 0.40;
        const isWhiteBlueHelmet = (h >= 180 && h <= 240 && s > 0.35) || (s < 0.12 && v > 0.82);

        if (isYellowOrange || isRedHelmet || isWhiteBlueHelmet) {
          hardhatPixelCount++;
          grid[idx] = 1;
          if (y < midY) {
            upperHalfHardhatPixels++;
          }
        }
        idx++;
      }
    }

    // 1. Overall Hardhat Color Ratio
    const colorRatio = Math.round((hardhatPixelCount / totalPixels) * 100) / 100;

    // 2. Upper Region Concentration (Hardhat plastic is concentrated on the top dome)
    const upperRegionRatio = hardhatPixelCount > 0
      ? Math.round((upperHalfHardhatPixels / hardhatPixelCount) * 100) / 100
      : 0;

    // 3. Spatial Clustered Density Test (Filtering out isolated random noise pixels)
    let clusteredPixels = 0;
    for (let y = 0; y < hh - 1; y++) {
      for (let x = 0; x < bw - 1; x++) {
        const i = y * bw + x;
        if (grid[i] === 1 && (grid[i + 1] === 1 || grid[i + bw] === 1)) {
          clusteredPixels++;
        }
      }
    }
    const spatialScore = Math.round((clusteredPixels / totalPixels) * 100) / 100;

    // // IMPROVED: CONSERVATIVE DECISION LOGIC - Requires ALL 3 criteria to be satisfied
    const passesColor = colorRatio >= helmetColorRatioThreshold;
    const passesUpperRegion = upperRegionRatio >= helmetUpperRegionThreshold;
    const passesSpatialCluster = spatialScore >= spatialClusterThreshold;

    const hasHelmet = passesColor && passesUpperRegion && passesSpatialCluster;

    // // FIX: Realistic confidence calculation reflecting heuristic evidence (not fake 0.98)
    const confidence = hasHelmet
      ? Math.min(0.88, Math.round((0.65 + colorRatio * 0.25) * 100) / 100)
      : Math.min(0.85, Math.round((0.60 + (1 - colorRatio) * 0.25) * 100) / 100);

    const reason = hasHelmet
      ? "HARDHAT DETECTED: Strong helmet-like visual evidence"
      : "MISSING HELMET: No sufficient helmet evidence";

    return {
      hasHelmet,
      confidence,
      reason,
      diagnostics: {
        colorRatio,
        upperRegionRatio,
        spatialScore
      }
    };

  } catch (err) {
    // // FIX: CONSERVATIVE RULE - On error, NEVER assume helmet = true
    return {
      hasHelmet: false,
      confidence: 0.50,
      reason: `Helmet detection unavailable (${err.message})`,
      diagnostics: { colorRatio: 0, upperRegionRatio: 0, spatialScore: 0 }
    };
  }
}

/**
 * Siren Escalation Audio Player (Web Audio API Synthesizer)
 */
export function startSirenAlarm() {
  if (sirenOscillator) return; // Already sounding

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!sirenAudioContext || sirenAudioContext.state === "closed") {
      sirenAudioContext = new AudioCtx();
    }
    if (sirenAudioContext.state === "suspended") {
      sirenAudioContext.resume();
    }

    sirenOscillator = sirenAudioContext.createOscillator();
    sirenGain = sirenAudioContext.createGain();

    sirenOscillator.type = "sawtooth";
    sirenOscillator.frequency.setValueAtTime(600, sirenAudioContext.currentTime);

    sirenGain.gain.setValueAtTime(0.3, sirenAudioContext.currentTime);

    sirenOscillator.connect(sirenGain);
    sirenGain.connect(sirenAudioContext.destination);
    sirenOscillator.start();

    let highPitch = true;
    sirenInterval = setInterval(() => {
      if (sirenOscillator && sirenAudioContext && sirenAudioContext.state === "running") {
        const now = sirenAudioContext.currentTime;
        sirenOscillator.frequency.cancelScheduledValues(now);
        sirenOscillator.frequency.exponentialRampToValueAtTime(highPitch ? 1200 : 600, now + 0.35);
        highPitch = !highPitch;
      }
    }, 400);

  } catch (e) {
    console.error("Siren audio trigger failed:", e);
  }
}

export function stopSirenAlarm() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  if (sirenOscillator) {
    try {
      sirenOscillator.stop();
      sirenOscillator.disconnect();
    } catch (e) {}
    sirenOscillator = null;
  }
  if (sirenGain) {
    try {
      sirenGain.disconnect();
    } catch (e) {}
    sirenGain = null;
  }
}

/**
 * Main Real-Time Frame Inference & Tracking Engine
 * // IMPROVED: Multi-Stage Phone Detection, Spatial Upper-Body Association, Frame Persistence, and Grace Period.
 */
export async function detectObjectsAndMobilePhone(videoOrCanvas, config = {}) {
  // Configurable thresholds & parameters with sensible defaults
  const minConfidence = config.minConfidence || 0.35;
  const phoneThreshold = config.phoneThreshold || 0.15; // Low score threshold specifically for small cell phone bounding boxes
  const phonePersistenceFrames = config.phonePersistenceFrames || 3; // // NEW: Minimum consecutive frames required
  const phoneMissGraceFrames = config.phoneMissGraceFrames || 5;       // // NEW: Grace period frames before resetting state
  const phoneAssociationDistance = config.phoneAssociationDistance || 0.65; // // NEW: Upper body distance factor
  const minDurationSec = config.minDurationSec || 2.0;
  const maxWarnings = config.maxWarnings || 3;
  const warningIntervalSec = config.warningIntervalSec || 2.5;

  if (!videoOrCanvas) {
    return {
      isModelLoaded: modelStatus === "READY",
      modelStatus: modelStatus === "READY" ? "READY" : "NO LIVE INPUT AVAILABLE",
      personCount: 0,
      persons: [],
      phones: [],
      rawPredictionsCount: 0,
      rawDetectionsSummary: [],
      phoneCandidates: [],
      phoneMisuseEvent: null
    };
  }

  // Ensure model is loaded
  if (modelStatus !== "READY") {
    const loadRes = await loadDetectionModel();
    if (!loadRes.success) {
      return {
        isModelLoaded: false,
        modelStatus: "MODEL NOT AVAILABLE",
        modelErrorMessage,
        personCount: 0,
        persons: [],
        phones: [],
        rawPredictionsCount: 0,
        rawDetectionsSummary: [],
        phoneCandidates: [],
        phoneMisuseEvent: null
      };
    }
  }

  try {
    const width = videoOrCanvas.width || videoOrCanvas.videoWidth || 640;
    const height = videoOrCanvas.height || videoOrCanvas.videoHeight || 360;

    if (width === 0 || height === 0) {
      return {
        isModelLoaded: true,
        modelStatus: "NOT ASSESSABLE",
        personCount: 0,
        persons: [],
        phones: [],
        rawPredictionsCount: 0,
        rawDetectionsSummary: [],
        phoneCandidates: [],
        phoneMisuseEvent: null
      };
    }

    // // IMPROVED: Run TensorFlow COCO-SSD Inference with LOW score threshold (0.15) to capture small objects (cell phones)
    const rawPredictions = await cocoModel.detect(videoOrCanvas, 25, 0.15);

    // // NEW: Console Debug Logging for Verification
    console.log(
      "ALL AI DETECTIONS:",
      rawPredictions.map((p) => ({
        class: p.class,
        score: Math.round(p.score * 100) / 100,
        bbox: p.bbox
      }))
    );

    console.log(
      "PHONE CANDIDATES:",
      rawPredictions.filter((p) => p.class === "cell phone")
    );

    // 1. Extract Person Detections (class === 'person')
    const personDetections = rawPredictions.filter(
      (p) => p.class === "person" && p.score >= minConfidence
    );

    // 2. // IMPROVED: Multi-Stage Extraction & Validation of Cell Phone Candidates
    const rawPhoneDetections = rawPredictions.filter(
      (p) => p.class === "cell phone" || p.class === "mobile phone" || p.class === "phone"
    );

    const rawDetectionsSummary = rawPredictions.map((p) => ({
      class: p.class,
      score: Math.round(p.score * 100) / 100
    }));

    // STRICT RULE: If 0 persons detected by AI, count is strictly 0!
    if (personDetections.length === 0) {
      activeTracks = [];
      phoneMisuseState.clear();
      stopSirenAlarm();

      return {
        isModelLoaded: true,
        modelStatus: "READY",
        personCount: 0,
        persons: [],
        phones: [],
        rawPredictionsCount: rawPredictions.length,
        rawDetectionsSummary,
        phoneCandidates: rawPhoneDetections.map((p) => ({
          class: p.class,
          score: Math.round(p.score * 100) / 100,
          status: "REJECTED",
          reason: "No person detected in frame"
        })),
        phoneMisuseEvent: null
      };
    }

    // 3. Multi-Person Tracking Across Frames
    const now = Date.now();
    const updatedPersons = [];

    personDetections.forEach((det) => {
      const normBox = [
        Math.max(0, det.bbox[0] / width),
        Math.max(0, det.bbox[1] / height),
        Math.min(1, det.bbox[2] / width),
        Math.min(1, det.bbox[3] / height)
      ];

      const center = [normBox[0] + normBox[2] / 2, normBox[1] + normBox[3] / 2];

      let matchedTrack = null;
      let minDistance = 0.25;

      activeTracks.forEach((tr) => {
        const d = Math.sqrt(Math.pow(tr.center[0] - center[0], 2) + Math.pow(tr.center[1] - center[1], 2));
        if (d < minDistance) {
          minDistance = d;
          matchedTrack = tr;
        }
      });

      let trackId;
      if (matchedTrack) {
        trackId = matchedTrack.trackId;
        matchedTrack.box = normBox;
        matchedTrack.center = center;
        matchedTrack.lastSeen = now;
      } else {
        trackId = `TRK-P${nextTrackId++}`;
        const newTrack = { trackId, box: normBox, center, lastSeen: now };
        activeTracks.push(newTrack);
      }

      const helmetCheck = inspectHelmetAndPersonsInCanvas(videoOrCanvas, normBox);

      updatedPersons.push({
        trackId: trackId,
        id: trackId,
        box: normBox,
        confidence: Math.round(det.score * 100) / 100,
        hasHelmet: helmetCheck.hasHelmet,
        label: `${trackId} | Person (${Math.round(det.score * 100)}%)`,
        color: helmetCheck.hasHelmet ? "#10b981" : "#ef4444",
        isUsingPhone: false,
        associatedPhone: null
      });
    });

    activeTracks = activeTracks.filter((tr) => now - tr.lastSeen < 3000);

    // 4. // IMPROVED & FIX: Robust Person-Phone Spatial Association (No Duplicate Multi-Person Assignment)
    const validPhoneCandidates = [];
    const normalizedPhones = [];

    // Map candidate pairings to assign each phone ONLY to its nearest spatially compatible person
    const candidatePairings = []; // [{ phoneIndex, personIndex, distance, phoneNormBox, phoneScore, class }]

    rawPhoneDetections.forEach((phoneDet, pIdx) => {
      const score = phoneDet.score;
      const pNormBox = [
        Math.max(0, phoneDet.bbox[0] / width),
        Math.max(0, phoneDet.bbox[1] / height),
        Math.min(1, phoneDet.bbox[2] / width),
        Math.min(1, phoneDet.bbox[3] / height)
      ];

      const pCenter = [pNormBox[0] + pNormBox[2] / 2, pNormBox[1] + pNormBox[3] / 2];

      if (score < phoneThreshold) {
        validPhoneCandidates.push({
          class: phoneDet.class,
          score: Math.round(score * 100) / 100,
          status: "REJECTED",
          reason: `Confidence (${Math.round(score * 100)}%) below threshold (${Math.round(phoneThreshold * 100)}%)`
        });
        return;
      }

      // Check spatial relationship against all detected persons
      let foundAssociation = false;
      updatedPersons.forEach((person, personIdx) => {
        const pBox = person.box;

        // Expanded upper-body ROI (Head, Ear, Chest, Hands)
        const expX1 = pBox[0] - pBox[2] * 0.40;
        const expY1 = pBox[1] - pBox[3] * 0.25;
        const expX2 = pBox[0] + pBox[2] * 1.40;
        const expY2 = pBox[1] + pBox[3] * 1.15;

        const isCenterInside =
          pCenter[0] >= expX1 &&
          pCenter[0] <= expX2 &&
          pCenter[1] >= expY1 &&
          pCenter[1] <= expY2;

        // Distance to upper-body center [x + w/2, y + h*0.35]
        const upperBodyCenter = [pBox[0] + pBox[2] / 2, pBox[1] + pBox[3] * 0.35];
        const distToUpperBody = Math.sqrt(
          Math.pow(pCenter[0] - upperBodyCenter[0], 2) +
          Math.pow(pCenter[1] - upperBodyCenter[1], 2)
        );

        const maxAllowedDist = pBox[3] * phoneAssociationDistance;

        if (isCenterInside || distToUpperBody <= maxAllowedDist) {
          foundAssociation = true;
          candidatePairings.push({
            phoneIdx: pIdx,
            personIdx: personIdx,
            distance: distToUpperBody,
            pNormBox,
            phoneScore: score,
            phoneClass: phoneDet.class
          });
        }
      });

      if (!foundAssociation) {
        validPhoneCandidates.push({
          class: phoneDet.class,
          score: Math.round(score * 100) / 100,
          status: "REJECTED",
          reason: "Phone detected but unassociated (too far from any person upper-body ROI)"
        });
      }
    });

    // Sort pairings by distance to assign phone to the nearest/most spatially compatible person
    candidatePairings.sort((a, b) => a.distance - b.distance);

    const assignedPhoneIndices = new Set();
    const assignedPersonIndices = new Set();

    candidatePairings.forEach((pair) => {
      if (!assignedPhoneIndices.has(pair.phoneIdx) && !assignedPersonIndices.has(pair.personIdx)) {
        assignedPhoneIndices.add(pair.phoneIdx);
        assignedPersonIndices.add(pair.personIdx);

        const targetPerson = updatedPersons[pair.personIdx];
        targetPerson.hasPhoneCandidateThisFrame = true; // Temporary flag for frame-level persistence
        targetPerson.associatedPhone = {
          box: pair.pNormBox,
          confidence: Math.round(pair.phoneScore * 100) / 100
        };

        normalizedPhones.push({
          box: pair.pNormBox,
          confidence: Math.round(pair.phoneScore * 100) / 100,
          class: pair.phoneClass
        });

        validPhoneCandidates.push({
          class: pair.phoneClass,
          score: Math.round(pair.phoneScore * 100) / 100,
          status: "ACCEPTED",
          associatedTrackId: targetPerson.trackId,
          associationDistance: Math.round(pair.distance * 100) / 100,
          reason: `ACCEPTED: Associated with ${targetPerson.trackId} (Upper body dist: ${Math.round(pair.distance * 100) / 100})`
        });
      }
    });

    // 5. // NEW & IMPROVED: Frame-Level Persistence, Miss Grace Period, and Siren Escalation State Machine
    let currentActivePhoneEvent = null;
    let globalSirenNeeded = false;

    updatedPersons.forEach((person) => {
      const tId = person.trackId;

      if (!phoneMisuseState.has(tId)) {
        phoneMisuseState.set(tId, {
          firstSeen: now,
          lastSeen: now,
          durationSec: 0,
          warningLevel: 0,
          sirenActive: false,
          lastWarningTime: now,
          lastPhoneConfidence: 0.85,
          persistenceCount: 0,
          missGraceCount: phoneMissGraceFrames
        });
      }

      const state = phoneMisuseState.get(tId);

      if (person.hasPhoneCandidateThisFrame) {
        // // NEW: Increment persistence counter on real detection frame
        state.persistenceCount += 1;
        state.missGraceCount = phoneMissGraceFrames; // Reset grace frames
        state.lastSeen = now;
        state.lastPhoneConfidence = person.associatedPhone ? person.associatedPhone.confidence : state.lastPhoneConfidence;
      } else {
        // // NEW: Handle temporary missed detection grace period
        if (state.persistenceCount >= phonePersistenceFrames && state.missGraceCount > 0) {
          state.missGraceCount -= 1; // Decrement grace counter
          state.lastSeen = now;     // Maintain last seen timestamp during grace period
        } else {
          // Grace expired or persistence threshold never reached -> reset track state
          state.persistenceCount = 0;
        }
      }

      // // NEW: Set person.isUsingPhone ONLY when persistence threshold is met or within grace period
      if (state.persistenceCount >= phonePersistenceFrames && state.missGraceCount > 0) {
        person.isUsingPhone = true;

        state.durationSec = Math.round(((now - state.firstSeen) / 1000) * 10) / 10;

        // // FIX: Warning & Siren Escalation Logic
        if (state.durationSec >= minDurationSec) {
          if (state.warningLevel === 0) {
            state.warningLevel = 1;
            state.lastWarningTime = now;
          } else if (state.warningLevel === 1 && (now - state.lastWarningTime) / 1000 >= warningIntervalSec) {
            state.warningLevel = 2;
            state.lastWarningTime = now;
          } else if (state.warningLevel === 2 && (now - state.lastWarningTime) / 1000 >= warningIntervalSec) {
            state.warningLevel = 3;
            state.lastWarningTime = now;
          } else if (state.warningLevel >= maxWarnings) {
            // // FIX: Ensure sirenActive becomes true reliably when maxWarnings reached!
            state.sirenActive = true;
          }
        }

        if (state.sirenActive) {
          globalSirenNeeded = true;
        }

        currentActivePhoneEvent = {
          phoneDetected: true,
          associatedTrackId: tId,
          personConfidence: person.confidence,
          phoneConfidence: state.lastPhoneConfidence,
          durationSec: state.durationSec,
          warningLevel: state.warningLevel,
          sirenActive: state.sirenActive,
          persistenceFrameCount: state.persistenceCount,
          graceFramesRemaining: state.missGraceCount,
          warningMessage:
            state.warningLevel === 1
              ? "⚠️ Warning 1: Mobile phone usage detected. Please stop phone usage."
              : state.warningLevel === 2
              ? "⚠️ Warning 2: Continued mobile phone usage detected."
              : state.warningLevel >= 3
              ? "⚠️ Final Warning: Siren Activated! Please stop mobile phone usage immediately."
              : "Detecting phone interaction..."
        };

      } else {
        person.isUsingPhone = false;
        // If grace period has fully expired and no phone detection, clean up state
        if (state.missGraceCount <= 0 || state.persistenceCount < phonePersistenceFrames) {
          if (now - state.lastSeen > 2000) {
            phoneMisuseState.delete(tId);
          }
        }
      }
    });

    // Handle siren audio toggle
    if (globalSirenNeeded) {
      startSirenAlarm();
    } else {
      stopSirenAlarm();
    }

    return {
      isModelLoaded: true,
      modelStatus: "READY",
      personCount: updatedPersons.length,
      persons: updatedPersons,
      phones: normalizedPhones,
      rawPredictionsCount: rawPredictions.length,
      rawDetectionsSummary,
      phoneCandidates: validPhoneCandidates,
      phoneMisuseEvent: currentActivePhoneEvent
    };

  } catch (err) {
    console.error("Inference Error:", err);
    return {
      isModelLoaded: true,
      modelStatus: `Inference Error: ${err.message}`,
      personCount: 0,
      persons: [],
      phones: [],
      rawPredictionsCount: 0,
      rawDetectionsSummary: [],
      phoneCandidates: [],
      phoneMisuseEvent: null
    };
  }
}
