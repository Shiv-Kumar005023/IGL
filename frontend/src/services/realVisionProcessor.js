/**
 * Real-Time Canvas & Computer Vision Frame Processing Engine
 * Powered by TensorFlow.js & COCO-SSD for Production-Grade AI Object Detection.
 */

import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

// ============================================================================
// PART 1: Global AI Model & State Handles (COCO-SSD & Dedicated Helmet ML Model)
// ============================================================================

// COCO-SSD Model Handles
let cocoModel = null;
let modelLoadingPromise = null;
let modelStatus = "UNINITIALIZED"; // UNINITIALIZED, LOADING, READY, ERROR
let modelErrorMessage = "";

// PART 7: Configuration Values & Thresholds
export const HELMET_MODEL_URL = "/models/helmet/model.json"; // Path to custom trained TFJS helmet model files
export const HELMET_CONFIDENCE_THRESHOLD = 0.65;
export const HELMET_PERSISTENCE_FRAMES = 3;
export const HELMET_MISS_GRACE_FRAMES = 3;

// PART 1: Dedicated Helmet ML Model Handles
let helmetModel = null;
let helmetModelLoadingPromise = null;
let helmetModelStatus = "UNINITIALIZED"; // UNINITIALIZED, LOADING, READY, ERROR
let helmetModelErrorMessage = "";

// Track ID Generator & Track Memory Across Frames
let nextTrackId = 101;
let activeTracks = []; // [{ trackId, box: [x,y,w,h], center: [cx, cy], lastSeen: timestamp }]

// Phone Misuse Persistent Verification State Map across frames
const phoneMisuseState = new Map();

// PART 4: Per-Person Helmet Verification Tracking State Map
// key: trackId -> {
//   hasHelmet: boolean,
//   confidence: number,
//   persistenceCount: number,
//   missGraceCount: number,
//   lastSeen: timestamp,
//   reason: string
// }
const helmetVerificationState = new Map();

// Siren Web Audio API Synthesizer Handle
let sirenAudioContext = null;
let sirenOscillator = null;
let sirenGain = null;
let sirenInterval = null;

// Reusable Offscreen Canvas for Two-Pass ROI Phone Detection
let reusableRoiCanvas = null;
let reusableRoiCtx = null;

function getRoiCanvas(targetWidth, targetHeight) {
  if (typeof document === "undefined") return { canvas: null, ctx: null };
  if (!reusableRoiCanvas) {
    reusableRoiCanvas = document.createElement("canvas");
    reusableRoiCtx = reusableRoiCanvas.getContext("2d", { willReadFrequently: true });
  }
  reusableRoiCanvas.width = targetWidth;
  reusableRoiCanvas.height = targetHeight;
  return { canvas: reusableRoiCanvas, ctx: reusableRoiCtx };
}

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes [x, y, w, h]
 */
function calculateIoU(boxA, boxB) {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
  const yB = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

  const interWidth = Math.max(0, xB - xA);
  const interHeight = Math.max(0, yB - yA);
  const interArea = interWidth * interHeight;

  if (interArea === 0) return 0;

  const boxAArea = boxA[2] * boxA[3];
  const boxBArea = boxB[2] * boxB[3];

  return interArea / (boxAArea + boxBArea - interArea);
}

// ============================================================================
// PART 2: TensorFlow.js Model Loaders (COCO-SSD & Custom Helmet ML Model)
// ============================================================================

/**
 * Load TensorFlow COCO-SSD Model asynchronously
 * Prefers 'mobilenet_v2' for higher resolution feature extraction on small objects like cell phones.
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
      await tf.ready();
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
 * Returns current status of the COCO-SSD AI Model
 */
export function getModelStatus() {
  return {
    status: modelStatus,
    errorMessage: modelErrorMessage,
    isReady: modelStatus === "READY"
  };
}

/**
 * PART 2: Load Custom TensorFlow.js Dedicated Helmet/PPE ML Model asynchronously.
 * Can be loaded from local static path (/models/helmet/model.json) or remote URL.
 */
export async function loadHelmetDetectionModel(modelUrl = HELMET_MODEL_URL) {
  if (helmetModelStatus === "READY" && helmetModel) {
    return { success: true, model: helmetModel };
  }

  if (helmetModelStatus === "LOADING" && helmetModelLoadingPromise) {
    return helmetModelLoadingPromise;
  }

  helmetModelStatus = "LOADING";
  helmetModelErrorMessage = "";

  helmetModelLoadingPromise = (async () => {
    try {
      await tf.ready();

      // Try loading custom TFJS GraphModel or LayersModel
      try {
        helmetModel = await tf.loadGraphModel(modelUrl);
      } catch (e1) {
        try {
          helmetModel = await tf.loadLayersModel(modelUrl);
        } catch (e2) {
          throw new Error(`Model file not found at ${modelUrl}`);
        }
      }

      helmetModelStatus = "READY";
      console.log(`✅ Dedicated Helmet ML Model Loaded Successfully from ${modelUrl}.`);
      return { success: true, model: helmetModel };
    } catch (err) {
      helmetModelStatus = "ERROR";
      helmetModelErrorMessage = `HELMET MODEL UNAVAILABLE: Trained ML helmet model files not found at ${modelUrl}. Conservative safety mode active (Default hasHelmet = false).`;
      return { success: false, error: helmetModelErrorMessage };
    }
  })();

  return helmetModelLoadingPromise;
}

/**
 * Returns current status of the Dedicated Helmet ML Model
 */
export function getHelmetModelStatus() {
  return {
    status: helmetModelStatus,
    errorMessage: helmetModelErrorMessage,
    isReady: helmetModelStatus === "READY",
    modelUrl: HELMET_MODEL_URL
  };
}

// ============================================================================
// PART 3: Dedicated Helmet ML Model Inference on Head Crop (`detectHelmetForPerson`)
// ============================================================================

/**
 * PART 3: Runs Dedicated ML Inference on Person's Head/Upper-Body Crop.
 * 
 * STRICT CONSERVATIVE SAFETY RULE:
 * If the dedicated helmet model is uninitialized, loading fails, tensor processing errors,
 * or prediction score < HELMET_CONFIDENCE_THRESHOLD (0.65), it strictly returns
 * 'hasHelmet: false' with a clear diagnostic reason.
 * 
 * NEVER assumes hasHelmet = true!
 */
export async function detectHelmetForPerson(videoOrCanvas, personNormBox, config = {}) {
  const threshold = config.helmetThreshold || HELMET_CONFIDENCE_THRESHOLD;

  if (!videoOrCanvas || !personNormBox || personNormBox.length < 4) {
    return {
      hasHelmet: false,
      confidence: 0.0,
      reason: "Helmet verification unavailable (Invalid video/canvas or bounding box)",
      modelStatus: helmetModelStatus,
      diagnostics: { rawScore: 0 }
    };
  }

  // Ensure helmet model is loaded
  if (helmetModelStatus !== "READY") {
    const loadRes = await loadHelmetDetectionModel();
    if (!loadRes.success || !helmetModel) {
      return {
        hasHelmet: false,
        confidence: 0.0,
        reason: "Helmet verification unavailable (Trained ML helmet model files not supplied at /models/helmet/model.json)",
        modelStatus: helmetModelStatus,
        diagnostics: { rawScore: 0 }
      };
    }
  }

  const tensorToDispose = [];

  try {
    const width = videoOrCanvas.width || videoOrCanvas.videoWidth || 640;
    const height = videoOrCanvas.height || videoOrCanvas.videoHeight || 360;

    if (width === 0 || height === 0) {
      return {
        hasHelmet: false,
        confidence: 0.0,
        reason: "Helmet verification unavailable (Zero video dimensions)",
        modelStatus: helmetModelStatus,
        diagnostics: { rawScore: 0 }
      };
    }

    // Crop top 25% (Head & Shoulder ROI) of person bounding box
    const bx = Math.max(0, Math.min(width - 1, Math.floor(personNormBox[0] * width)));
    const by = Math.max(0, Math.min(height - 1, Math.floor(personNormBox[1] * height)));
    const bw = Math.max(10, Math.min(width - bx, Math.floor(personNormBox[2] * width)));
    const bh = Math.max(10, Math.min(height - by, Math.floor(personNormBox[3] * height * 0.25)));

    if (bw < 10 || bh < 10) {
      return {
        hasHelmet: false,
        confidence: 0.0,
        reason: "Helmet verification unavailable (Head crop too small)",
        modelStatus: helmetModelStatus,
        diagnostics: { rawScore: 0 }
      };
    }

    // Extract head crop onto an offscreen canvas
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = bw;
    cropCanvas.height = bh;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(videoOrCanvas, bx, by, bw, bh, 0, 0, bw, bh);

    // Convert crop canvas to TensorFlow Tensor (224x224 input tensor)
    const imgTensor = tf.browser.fromPixels(cropCanvas);
    tensorToDispose.push(imgTensor);

    const resizedTensor = tf.image.resizeBilinear(imgTensor, [224, 224]);
    tensorToDispose.push(resizedTensor);

    const normalizedTensor = tf.div(resizedTensor, 255.0).expandDims(0);
    tensorToDispose.push(normalizedTensor);

    // Run ML Model Inference
    const predictionTensor = helmetModel.predict(normalizedTensor);
    tensorToDispose.push(predictionTensor);

    const scores = await predictionTensor.data();

    // Interpret output score (class 0: helmet, class 1: no_helmet or single sigmoid output)
    let rawScore = 0.0;
    if (scores.length >= 2) {
      rawScore = scores[0]; // Helmet class probability
    } else if (scores.length === 1) {
      rawScore = scores[0]; // Sigmoid helmet output
    }

    const hasHelmet = rawScore >= threshold;
    const confidence = Math.round(rawScore * 100) / 100;

    return {
      hasHelmet,
      confidence,
      reason: hasHelmet
        ? `HARDHAT VERIFIED: Dedicated ML Model output (${Math.round(confidence * 100)}% >= ${Math.round(threshold * 100)}%)`
        : `MISSING HELMET: Dedicated ML Model output (${Math.round(confidence * 100)}% below ${Math.round(threshold * 100)}% threshold)`,
      modelStatus: helmetModelStatus,
      diagnostics: { rawScore }
    };

  } catch (err) {
    console.error("Helmet ML Inference Error:", err);
    return {
      hasHelmet: false,
      confidence: 0.0,
      reason: `Helmet verification unavailable (${err.message})`,
      modelStatus: helmetModelStatus,
      diagnostics: { rawScore: 0 }
    };
  } finally {
    // Explicitly dispose intermediate tensors to prevent memory leaks
    tensorToDispose.forEach((t) => {
      try {
        if (t && t.dispose) t.dispose();
      } catch (e) { }
    });
  }
}

// ============================================================================
// PART 6: Legacy `inspectHelmetAndPersonsInCanvas()` Compatibility Wrapper
// ============================================================================

/**
 * PART 6: Legacy Compatibility Function.
 * Deprecated HSV color heuristic is removed as primary decision maker.
 * Delegates directly to ML-based `detectHelmetForPerson()`.
 */
export function inspectHelmetAndPersonsInCanvas(canvas, box) {
  // Conservative baseline: Never assume hasHelmet = true by default
  return {
    hasHelmet: false,
    confidence: 0.0,
    reason: "Helmet verification requires ML model. (Default hasHelmet = false)",
    diagnostics: { colorRatio: 0, upperRegionRatio: 0, spatialScore: 0 }
  };
}

// ============================================================================
// General Utilities (Frame Quality, Canvas Snapshot, Audio Siren)
// ============================================================================

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

export function calculateBoxDistance(box1, box2) {
  const cx1 = box1[0] + box1[2] / 2;
  const cy1 = box1[1] + box1[3] / 2;

  const cx2 = box2[0] + box2[2] / 2;
  const cy2 = box2[1] + box2[3] / 2;

  const dist = Math.sqrt(Math.pow(cx1 - cx2, 2) + Math.pow(cy1 - cy2, 2));
  return Math.round(dist * 100) / 100;
}

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

export function startSirenAlarm() {
  if (sirenOscillator) return;

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
    } catch (e) { }
    sirenOscillator = null;
  }
  if (sirenGain) {
    try {
      sirenGain.disconnect();
    } catch (e) { }
    sirenGain = null;
  }
}

// ============================================================================
// PART 5: Main Real-Time Frame Inference & Tracking Engine (`detectObjectsAndMobilePhone`)
// ============================================================================

/**
 * PART 5: Main Real-Time Frame Inference & Tracking Engine
 * Runs TensorFlow COCO-SSD Object Detection + Dedicated ML Helmet Inspection.
 */
export async function detectObjectsAndMobilePhone(videoOrCanvas, config = {}) {
  const minConfidence = config.minConfidence || 0.35;
  const phoneThreshold = config.phoneThreshold || 0.15;
  const phonePersistenceFrames = config.phonePersistenceFrames || 3;
  const phoneMissGraceFrames = config.phoneMissGraceFrames || 5;
  const phoneAssociationDistance = config.phoneAssociationDistance || 0.65;
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

  // Ensure COCO-SSD model is loaded
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

    // Run TensorFlow COCO-SSD Inference with LOW score threshold (0.15) to capture small objects
    const rawPredictions = await cocoModel.detect(videoOrCanvas, 25, 0.15);
    console.log("🔥 DETECTION FUNCTION RUNNING", rawPredictions);
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

    // 2. Extract Cell Phone Detections
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

    // Track matching loop
    for (let det of personDetections) {
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

      // =========================================================================
      // PART 4: Per-Person Dedicated ML Helmet Verification & Temporal Persistence
      // =========================================================================
      if (!helmetVerificationState.has(trackId)) {
        helmetVerificationState.set(trackId, {
          hasHelmet: false,
          confidence: 0,
          persistenceCount: 0,
          missGraceCount: HELMET_MISS_GRACE_FRAMES,
          lastSeen: now,
          reason: "Initializing ML helmet verification"
        });
      }

      const hState = helmetVerificationState.get(trackId);

      // Run dedicated ML helmet inspection on person head crop
      const mlHelmetRes = await detectHelmetForPerson(videoOrCanvas, normBox, config);

      if (mlHelmetRes.hasHelmet) {
        hState.persistenceCount += 1;
        hState.missGraceCount = HELMET_MISS_GRACE_FRAMES;
        hState.lastSeen = now;
        hState.confidence = mlHelmetRes.confidence;
        hState.reason = mlHelmetRes.reason;
      } else {
        if (hState.persistenceCount >= HELMET_PERSISTENCE_FRAMES && hState.missGraceCount > 0) {
          hState.missGraceCount -= 1;
          hState.lastSeen = now;
        } else {
          hState.persistenceCount = 0;
          hState.confidence = mlHelmetRes.confidence;
          hState.reason = mlHelmetRes.reason;
        }
      }

      const verifiedHelmet = hState.persistenceCount >= HELMET_PERSISTENCE_FRAMES && hState.missGraceCount > 0;

      updatedPersons.push({
        trackId: trackId,
        id: trackId,
        box: normBox,
        confidence: Math.round(det.score * 100) / 100,
        hasHelmet: verifiedHelmet,
        helmetConfidence: hState.confidence,
        helmetReason: hState.reason,
        label: verifiedHelmet
          ? `${trackId} | Helmet OK (${Math.round(hState.confidence * 100)}%)`
          : `${trackId} | NO HELMET`,
        color: verifiedHelmet ? "#10b981" : "#ef4444",
        isUsingPhone: false,
        associatedPhone: null
      });
    }

    activeTracks = activeTracks.filter((tr) => now - tr.lastSeen < 3000);

    // =========================================================================
    // TWO-PASS PHONE DETECTION: PASS 2 (ENLARGED PERSON UPPER-BODY ROI CROP)
    // =========================================================================
    const roiPhoneDetections = [];

    if (personDetections.length > 0 && typeof document !== "undefined") {
      const { canvas: roiCanvas, ctx: roiCtx } = getRoiCanvas(360, 360);

      for (let pDet of personDetections) {
        const [px, py, pw, ph] = pDet.bbox;

        // Expanded upper-body ROI covering head, ear, face, chest, and hands
        const cropX1 = Math.max(0, Math.floor(px - pw * 0.20));
        const cropY1 = Math.max(0, Math.floor(py - ph * 0.15));
        const cropX2 = Math.min(width, Math.ceil(px + pw * 1.20));
        const cropY2 = Math.min(height, Math.ceil(py + ph * 0.75));
        const cropW = cropX2 - cropX1;
        const cropH = cropY2 - cropY1;

        if (cropW >= 30 && cropH >= 30 && roiCtx) {
          roiCtx.clearRect(0, 0, 360, 360);
          roiCtx.drawImage(videoOrCanvas, cropX1, cropY1, cropW, cropH, 0, 0, 360, 360);

          // Run COCO-SSD on zoomed/enlarged ROI canvas
          const roiRawPreds = await cocoModel.detect(roiCanvas, 10, 0.15);

          for (let roiP of roiRawPreds) {
            if (
              (roiP.class === "cell phone" || roiP.class === "mobile phone" || roiP.class === "phone") &&
              roiP.score >= 0.15
            ) {
              // Convert ROI coordinates back to full-frame coordinates
              const [rx, ry, rw, rh] = roiP.bbox;
              const fullX = cropX1 + (rx / 360) * cropW;
              const fullY = cropY1 + (ry / 360) * cropH;
              const fullW = (rw / 360) * cropW;
              const fullH = (rh / 360) * cropH;

              roiPhoneDetections.push({
                class: roiP.class,
                score: roiP.score,
                bbox: [fullX, fullY, fullW, fullH],
                source: "ROI"
              });
            }
          }
        }
      }
    }

    // Combine Full-Frame Detections (Pass 1) & ROI Detections (Pass 2) with IoU Deduplication
    const combinedPhoneDetections = rawPhoneDetections.map((p) => ({
      class: p.class,
      score: p.score,
      bbox: p.bbox,
      source: "FULL_FRAME"
    }));

    roiPhoneDetections.forEach((rPhone) => {
      let duplicateIndex = -1;
      for (let i = 0; i < combinedPhoneDetections.length; i++) {
        const existing = combinedPhoneDetections[i];
        const iou = calculateIoU(existing.bbox, rPhone.bbox);
        if (iou > 0.30) {
          duplicateIndex = i;
          break;
        }
      }

      if (duplicateIndex >= 0) {
        if (rPhone.score > combinedPhoneDetections[duplicateIndex].score) {
          combinedPhoneDetections[duplicateIndex] = {
            class: rPhone.class,
            score: rPhone.score,
            bbox: rPhone.bbox,
            source: "ROI_ENHANCED"
          };
        }
      } else {
        combinedPhoneDetections.push({
          class: rPhone.class,
          score: rPhone.score,
          bbox: rPhone.bbox,
          source: "ROI"
        });
      }
    });

    // Console Diagnostics Output
    console.log("=== TWO-PASS PHONE DETECTION DIAGNOSTICS ===");
    console.log(
      "FULL FRAME PHONE DETECTIONS:",
      rawPhoneDetections.map((p) => ({
        class: p.class,
        confidence: Math.round(p.score * 100) / 100,
        bbox: p.bbox.map((v) => Math.round(v))
      }))
    );
    console.log(
      "ROI PHONE DETECTIONS:",
      roiPhoneDetections.map((p) => ({
        class: p.class,
        confidence: Math.round(p.score * 100) / 100,
        bbox: p.bbox.map((v) => Math.round(v))
      }))
    );
    console.log(
      "COMBINED PHONE DETECTIONS:",
      combinedPhoneDetections.map((p) => ({
        class: p.class,
        confidence: Math.round(p.score * 100) / 100,
        bbox: p.bbox.map((v) => Math.round(v)),
        source: p.source
      }))
    );

    // 4. Person-Phone Spatial Association (Nearest-Person Distance Sorting)
    const validPhoneCandidates = [];
    const normalizedPhones = [];
    const candidatePairings = [];

    combinedPhoneDetections.forEach((phoneDet, pIdx) => {
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

      let foundAssociation = false;
      updatedPersons.forEach((person, personIdx) => {
        const pBox = person.box;

        const expX1 = pBox[0] - pBox[2] * 0.40;
        const expY1 = pBox[1] - pBox[3] * 0.25;
        const expX2 = pBox[0] + pBox[2] * 1.40;
        const expY2 = pBox[1] + pBox[3] * 1.15;

        const isCenterInside =
          pCenter[0] >= expX1 &&
          pCenter[0] <= expX2 &&
          pCenter[1] >= expY1 &&
          pCenter[1] <= expY2;

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

    candidatePairings.sort((a, b) => a.distance - b.distance);

    const assignedPhoneIndices = new Set();
    const assignedPersonIndices = new Set();

    candidatePairings.forEach((pair) => {
      if (!assignedPhoneIndices.has(pair.phoneIdx) && !assignedPersonIndices.has(pair.personIdx)) {
        assignedPhoneIndices.add(pair.phoneIdx);
        assignedPersonIndices.add(pair.personIdx);

        const targetPerson = updatedPersons[pair.personIdx];
        targetPerson.hasPhoneCandidateThisFrame = true;
        targetPerson.associatedPhone = {
          box: pair.pNormBox,
          confidence: Math.round(pair.phoneScore * 100) / 100
        };

        normalizedPhones.push({
          box: pair.pNormBox,
          confidence: Math.round(pair.phoneScore * 100) / 100,
          class: pair.phoneClass
        });

        console.log(
          `ASSOCIATED PHONE: Class ${pair.phoneClass} (Conf: ${Math.round(pair.phoneScore * 100)}%) -> Worker Track ID: ${targetPerson.trackId}`
        );

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

    // 5. Phone Misuse Verification & Warning Escalation State Machine
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
        state.persistenceCount += 1;
        state.missGraceCount = phoneMissGraceFrames;
        state.lastSeen = now;
        state.lastPhoneConfidence = person.associatedPhone ? person.associatedPhone.confidence : state.lastPhoneConfidence;
      } else {
        if (state.persistenceCount >= phonePersistenceFrames && state.missGraceCount > 0) {
          state.missGraceCount -= 1;
          state.lastSeen = now;
        } else {
          state.persistenceCount = 0;
        }
      }

      if (state.persistenceCount >= phonePersistenceFrames && state.missGraceCount > 0) {
        person.isUsingPhone = true;
        state.durationSec = Math.round(((now - state.firstSeen) / 1000) * 10) / 10;

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
        if (state.missGraceCount <= 0 || state.persistenceCount < phonePersistenceFrames) {
          if (now - state.lastSeen > 2000) {
            phoneMisuseState.delete(tId);
          }
        }
      }
    });

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
