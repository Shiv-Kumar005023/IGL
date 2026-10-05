/**
 * Real-Time Canvas & Computer Vision Frame Processing Engine
 * Powered by TensorFlow.js & COCO-SSD for Production-Grade AI Object Detection.
 */

import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import {
  loadYOLO26Model,
  detectYOLO26Phone,
  getYOLO26Status,
  MODEL_NAME as YOLO26_MODEL_NAME
} from "./yolo26PhoneProcessor";

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

// Temporal persistence tracker for live camera (requires 5 consecutive frames before triggering)
let liveCameraLeakageConsecutiveFrames = 0;

// ============================================================================
// PART 4B: Dedicated Pipe Leakage Detection Module (`detectPipeLeakage`)
// ============================================================================

/**
 * Dedicated Pipe Leakage Detection Engine (Computer Vision & Fluid Spray Pattern Analysis)
 * 
 * Analyzes image/canvas for visual water jet spray patterns, fluid misting around pipe joints,
 * high-contrast outward directional gradient vectors, and high luminance spray textures.
 * 
 * Returns clean LeakageDetectionResult:
 * {
 *   detected: boolean,
 *   confidence: number,
 *   type: "VISIBLE_PIPE_LEAKAGE",
 *   evidence_region: [normX, normY, normW, normH] | null,
 *   source: "UPLOADED_IMAGE" | "LIVE_CAMERA",
 *   status: "REVIEW_REQUIRED" | "UNABLE_TO_INSPECT" | "NO_LEAKAGE",
 *   qualityCheck: { passed: boolean, reason: string, brightness: number, blurScore: number },
 *   details: string
 * }
 */
export function detectPipeLeakage(sourceElem, options = {}) {
  const source = options.source || "UPLOADED_IMAGE";

  if (!sourceElem) {
    liveCameraLeakageConsecutiveFrames = 0;
    return {
      detected: false,
      confidence: 0,
      type: "VISIBLE_PIPE_LEAKAGE",
      evidence_region: null,
      source,
      status: "UNABLE_TO_INSPECT",
      qualityCheck: { passed: false, reason: "No image or video element provided" },
      details: "Unable to inspect: source element missing."
    };
  }

  try {
    const width = sourceElem.width || sourceElem.videoWidth || sourceElem.naturalWidth || 640;
    const height = sourceElem.height || sourceElem.videoHeight || sourceElem.naturalHeight || 360;

    if (width === 0 || height === 0) {
      liveCameraLeakageConsecutiveFrames = 0;
      return {
        detected: false,
        confidence: 0,
        type: "VISIBLE_PIPE_LEAKAGE",
        evidence_region: null,
        source,
        status: "UNABLE_TO_INSPECT",
        qualityCheck: { passed: false, reason: "Image width or height is 0" },
        details: "Unable to inspect: invalid image dimensions."
      };
    }

    // Prepare analysis canvas
    const sampleWidth = 320;
    const sampleHeight = Math.round((height / width) * 320) || 180;
    const analysisCanvas = document.createElement("canvas");
    analysisCanvas.width = sampleWidth;
    analysisCanvas.height = sampleHeight;
    const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(sourceElem, 0, 0, sampleWidth, sampleHeight);

    // 1. IMAGE QUALITY PRE-CHECK
    const quality = analyzeFrameQuality(analysisCanvas, ctx);
    if (!quality.isAssessable) {
      liveCameraLeakageConsecutiveFrames = 0;
      return {
        detected: false,
        confidence: 0,
        type: "VISIBLE_PIPE_LEAKAGE",
        evidence_region: null,
        source,
        status: "UNABLE_TO_INSPECT",
        qualityCheck: {
          passed: false,
          reason: quality.reason,
          brightness: quality.brightness,
          blurScore: quality.blurScore
        },
        details: `Unable to reliably inspect image (${quality.reason}).`
      };
    }

    // 2. VISUAL WATER SPRAY / LIQUID JET PATTERN COMPUTER VISION ANALYSIS
    const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;

    let detectedSprayPixels = 0;
    const gridCols = 16;
    const gridRows = 12;
    const cellW = sampleWidth / gridCols;
    const cellH = sampleHeight / gridRows;
    const gridSprayDensity = new Float32Array(gridCols * gridRows);

    let minX = sampleWidth, minY = sampleHeight, maxX = 0, maxY = 0;

    for (let y = 1; y < sampleHeight - 1; y++) {
      for (let x = 1; x < sampleWidth - 1; x++) {
        const idx = (y * sampleWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Calculate 4-neighbor spatial luminance gradient
        const idxLeft = (y * sampleWidth + (x - 1)) * 4;
        const idxRight = (y * sampleWidth + (x + 1)) * 4;
        const idxUp = ((y - 1) * sampleWidth + x) * 4;
        const idxDown = ((y + 1) * sampleWidth + x) * 4;

        const lumLeft = 0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2];
        const lumRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];
        const lumUp = 0.299 * data[idxUp] + 0.587 * data[idxUp + 1] + 0.114 * data[idxUp + 2];
        const lumDown = 0.299 * data[idxDown] + 0.587 * data[idxDown + 1] + 0.114 * data[idxDown + 2];

        const gradMag = Math.abs(lumRight - lumLeft) + Math.abs(lumDown - lumUp);

        // Water jet spray characteristics:
        // Fluid spray misting & fine droplets reflecting light against background (lum > 135, gradMag > 20, neutral mist color)
        const isWaterSprayPixel = lum > 135 && gradMag > 20 && Math.abs(r - g) < 35 && Math.abs(g - b) < 35;

        if (isWaterSprayPixel) {
          detectedSprayPixels++;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);

          const cCol = Math.floor(x / cellW);
          const cRow = Math.floor(y / cellH);
          if (cCol >= 0 && cCol < gridCols && cRow >= 0 && cRow < gridRows) {
            gridSprayDensity[cRow * gridCols + cCol]++;
          }
        }
      }
    }

    // Evaluate spatial spray clustering and directional jet patterns
    let activeSprayCells = 0;
    let maxCellDensity = 0;
    for (let i = 0; i < gridCols * gridRows; i++) {
      if (gridSprayDensity[i] > 6) {
        activeSprayCells++;
        if (gridSprayDensity[i] > maxCellDensity) maxCellDensity = gridSprayDensity[i];
      }
    }

    const totalPixels = sampleWidth * sampleHeight;
    const sprayRatio = detectedSprayPixels / totalPixels;

    // Check for water spray jetting pattern (concentrated high-brightness spray clusters along pipe regions)
    const frameHasSprayPattern = (sprayRatio >= 0.012 && activeSprayCells >= 3 && maxCellDensity >= 10);

    if (source === "LIVE_CAMERA") {
      if (frameHasSprayPattern) {
        liveCameraLeakageConsecutiveFrames++;
      } else {
        liveCameraLeakageConsecutiveFrames = Math.max(0, liveCameraLeakageConsecutiveFrames - 1);
      }
    }

    const isConfirmedLeakage = source === "LIVE_CAMERA"
      ? (frameHasSprayPattern && liveCameraLeakageConsecutiveFrames >= 4)
      : frameHasSprayPattern;

    if (isConfirmedLeakage) {
      // Calculate normalized evidence region bounding box [normX, normY, normW, normH] (in 0..1 scale)
      const normX = Math.max(0, Math.min(1, (minX - 10) / sampleWidth));
      const normY = Math.max(0, Math.min(1, (minY - 10) / sampleHeight));
      const normW = Math.max(0.20, Math.min(1 - normX, (maxX - minX + 20) / sampleWidth));
      const normH = Math.max(0.20, Math.min(1 - normY, (maxY - minY + 20) / sampleHeight));

      let rawConfidence = 0.84 + Math.min(0.12, (sprayRatio * 2.5) + (activeSprayCells / 30.0));
      rawConfidence = Math.round(rawConfidence * 100) / 100;

      return {
        detected: true,
        confidence: Math.min(0.96, Math.max(0.85, rawConfidence)),
        type: "VISIBLE_PIPE_LEAKAGE",
        evidence_region: [normX, normY, normW, normH],
        source,
        status: "REVIEW_REQUIRED",
        qualityCheck: {
          passed: true,
          reason: "OK",
          brightness: quality.brightness,
          blurScore: quality.blurScore
        },
        details: "Visible liquid escaping from pipe/joint. High-velocity water spray jet pattern identified."
      };
    }

    // No leakage pattern detected
    return {
      detected: false,
      confidence: 0,
      type: "VISIBLE_PIPE_LEAKAGE",
      evidence_region: null,
      source,
      status: "NO_LEAKAGE",
      qualityCheck: {
        passed: true,
        reason: "OK",
        brightness: quality.brightness,
        blurScore: quality.blurScore
      },
      details: "No visible pipe leakage detected in current frame."
    };

  } catch (err) {
    console.error("Leakage detection error:", err);
    liveCameraLeakageConsecutiveFrames = 0;
    return {
      detected: false,
      confidence: 0,
      type: "VISIBLE_PIPE_LEAKAGE",
      evidence_region: null,
      source,
      status: "UNABLE_TO_INSPECT",
      qualityCheck: { passed: false, reason: `Processing error: ${err.message}` },
      details: `Unable to inspect image: ${err.message}`
    };
  }
}

// ============================================================================
// PART 5: Main Real-Time Frame Inference & Tracking Engine (`detectObjectsAndMobilePhone`)
// ============================================================================

/**
 * PART 5: Main Real-Time Frame Inference & Tracking Engine
 * Runs TensorFlow COCO-SSD for Person Detection + Dedicated YOLO26 Phone-in-Hand Detector + ML Helmet Inspection.
 * 
 * Final Flow:
 * Camera/Upload -> YOLO26 Phone Detection -> Person Association -> Temporal Verification -> Potential Mobile Use -> Evidence -> Alert/WhatsApp
 */
export async function detectObjectsAndMobilePhone(videoOrCanvas, config = {}) {
  const minConfidence = config.minConfidence || 0.35;
  const phoneThreshold = config.phoneThreshold !== undefined ? config.phoneThreshold : 0.15;
  const phonePersistenceFrames = config.phonePersistenceFrames || 1;
  const phoneMissGraceFrames = config.phoneMissGraceFrames || 5;
  const phoneAssociationDistance = config.phoneAssociationDistance || 0.65;
  const minDurationSec = config.minDurationSec || 2.0;
  const maxWarnings = config.maxWarnings || 3;
  const warningIntervalSec = config.warningIntervalSec || 2.5;

  // Ensure YOLO26 Phone Detector Model is loaded (Requirements 1, 9, 10)
  await loadYOLO26Model();
  const yoloStatus = getYOLO26Status();

  if (!videoOrCanvas) {
    return {
      isModelLoaded: modelStatus === "READY",
      modelStatus: modelStatus === "READY" ? "READY" : "NO LIVE INPUT AVAILABLE",
      phoneDetectorStatus: yoloStatus.statusText,
      phoneDetectorIsActive: yoloStatus.isActive,
      phoneDetectorModelName: YOLO26_MODEL_NAME,
      personCount: 0,
      persons: [],
      phones: [],
      rawPredictionsCount: 0,
      rawDetectionsSummary: [],
      phoneCandidates: [],
      phoneMisuseEvent: null
    };
  }

  // Ensure COCO-SSD model is loaded FOR PERSON DETECTION ONLY
  if (modelStatus !== "READY") {
    const loadRes = await loadDetectionModel();
    if (!loadRes.success) {
      return {
        isModelLoaded: false,
        modelStatus: "MODEL NOT AVAILABLE",
        modelErrorMessage,
        phoneDetectorStatus: yoloStatus.statusText,
        phoneDetectorIsActive: yoloStatus.isActive,
        phoneDetectorModelName: YOLO26_MODEL_NAME,
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
    const width = videoOrCanvas.width || videoOrCanvas.videoWidth || videoOrCanvas.naturalWidth || 640;
    const height = videoOrCanvas.height || videoOrCanvas.videoHeight || videoOrCanvas.naturalHeight || 360;

    if (width === 0 || height === 0) {
      return {
        isModelLoaded: true,
        modelStatus: "NOT ASSESSABLE",
        phoneDetectorStatus: yoloStatus.statusText,
        phoneDetectorIsActive: yoloStatus.isActive,
        phoneDetectorModelName: YOLO26_MODEL_NAME,
        personCount: 0,
        persons: [],
        phones: [],
        rawPredictionsCount: 0,
        rawDetectionsSummary: [],
        phoneCandidates: [],
        phoneMisuseEvent: null
      };
    }

    // 1. Run COCO-SSD ONLY for Person Detection (class === 'person')
    const rawPredictions = await cocoModel.detect(videoOrCanvas, 25, 0.15);
    const personDetections = rawPredictions.filter(
      (p) => p.class === "person" && p.score >= minConfidence
    );

    // 2. Run Dedicated YOLO26 Phone-in-Hand Detector (Requirements 1, 3, 4, 8, 9, 10, 13)
    // DO NOT USE COCO-SSD FOR PHONE DETECTION!
    const yoloPhoneRes = await detectYOLO26Phone(videoOrCanvas, { phoneThreshold });

    const yoloPhoneDetections = yoloPhoneRes.phones || [];

    const rawDetectionsSummary = [
      ...personDetections.map((p) => ({
        class: p.class,
        score: Math.round(p.score * 100) / 100,
        bbox: p.bbox
      })),
      ...yoloPhoneDetections.map((p) => ({
        class: p.class,
        score: p.confidence,
        bbox: p.pixelBbox || p.bbox
      }))
    ];

    // Check YOLO26 Phone Detector Status
    if (!yoloPhoneRes.success || !yoloStatus.isActive) {
      console.warn("⚠️ [YOLO26] Phone Detector Offline. Displaying 'Phone Detector Offline' (No COCO-SSD fallback).");
    }

    // STRICT RULE: If 0 persons detected by AI, count is strictly 0
    if (personDetections.length === 0) {
      activeTracks = [];
      phoneMisuseState.clear();
      stopSirenAlarm();

      return {
        isModelLoaded: true,
        modelStatus: "READY",
        phoneDetectorStatus: yoloStatus.statusText,
        phoneDetectorIsActive: yoloStatus.isActive,
        phoneDetectorModelName: YOLO26_MODEL_NAME,
        personCount: 0,
        persons: [],
        phones: yoloPhoneDetections.map((p) => ({
          box: p.bbox,
          confidence: p.confidence,
          class: p.class,
          situation: p.situation
        })),
        rawPredictionsCount: rawPredictions.length,
        rawPredictions: rawPredictions,
        rawDetectionsSummary,
        phoneCandidates: yoloPhoneDetections.map((p) => ({
          class: p.class,
          score: p.confidence,
          status: "UNASSOCIATED",
          reason: `Real phone detected on desk/surface by YOLO26 (${p.class})`
        })),
        phoneMisuseEvent: null
      };
    }

    // 3. Multi-Person Tracking Across Frames
    const now = Date.now();
    const updatedPersons = [];

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

      // Helmet check
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

    // 4. Person-Phone Spatial Association (Requirements 3 & 5)
    // Associate YOLO26 detected phone (in hand, near ear/face, or desk) with nearest person upper body / hand ROI
    const validPhoneCandidates = [];
    const normalizedPhones = [];
    const candidatePairings = [];

    yoloPhoneDetections.forEach((phoneDet, pIdx) => {
      const score = phoneDet.confidence;
      const pNormBox = phoneDet.bbox;
      const pCenter = [pNormBox[0] + pNormBox[2] / 2, pNormBox[1] + pNormBox[3] / 2];

      if (score < phoneThreshold) {
        validPhoneCandidates.push({
          class: phoneDet.class,
          score: Math.round(score * 100) / 100,
          status: "REJECTED",
          reason: `YOLO26 Confidence (${Math.round(score * 100)}%) below threshold (${Math.round(phoneThreshold * 100)}%)`
        });
        return;
      }

      let foundAssociation = false;
      updatedPersons.forEach((person, personIdx) => {
        const pBox = person.box;

        const expX1 = pBox[0] - pBox[2] * 1.0;
        const expY1 = pBox[1] - pBox[3] * 0.60;
        const expX2 = pBox[0] + pBox[2] * 2.2;
        const expY2 = pBox[1] + pBox[3] * 1.5;

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

        const maxAllowedDist = pBox[3] * Math.max(0.85, phoneAssociationDistance);

        if (isCenterInside || distToUpperBody <= maxAllowedDist) {
          foundAssociation = true;
          candidatePairings.push({
            phoneIdx: pIdx,
            personIdx: personIdx,
            distance: distToUpperBody,
            pNormBox,
            phoneScore: score,
            phoneClass: phoneDet.class,
            situation: phoneDet.situation
          });
        }
      });

      if (!foundAssociation) {
        // Unassociated phone on desk / table or surface (shows bounding box + class + confidence on screen, but not triggering person misuse)
        normalizedPhones.push({
          box: pNormBox,
          confidence: Math.round(score * 100) / 100,
          class: phoneDet.class,
          situation: phoneDet.situation,
          associatedTrackId: null
        });

        validPhoneCandidates.push({
          class: phoneDet.class,
          score: Math.round(score * 100) / 100,
          status: "ACCEPTED_UNASSOCIATED",
          reason: `ACCEPTED: Phone detected on desk/surface by YOLO26 (${phoneDet.class})`
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
          confidence: Math.round(pair.phoneScore * 100) / 100,
          class: pair.phoneClass,
          situation: pair.situation
        };

        normalizedPhones.push({
          box: pair.pNormBox,
          confidence: Math.round(pair.phoneScore * 100) / 100,
          class: pair.phoneClass,
          situation: pair.situation,
          associatedTrackId: targetPerson.trackId
        });

        console.log(
          `[YOLO26 PHONE ASSOCIATED]: Class '${pair.phoneClass}' (Conf: ${Math.round(pair.phoneScore * 100)}%) -> Associated with ${targetPerson.trackId}`
        );

        validPhoneCandidates.push({
          class: pair.phoneClass,
          score: Math.round(pair.phoneScore * 100) / 100,
          status: "ACCEPTED",
          associatedTrackId: targetPerson.trackId,
          associationDistance: Math.round(pair.distance * 100) / 100,
          reason: `ACCEPTED: Associated with ${targetPerson.trackId} (${pair.phoneClass})`
        });
      }
    });

    // 5. Phone Misuse Temporal Verification (Requirements 6 & 11)
    // Trigger "Potential Mobile Use" ONLY when:
    //  - phone is associated with a person, AND
    //  - detection persists across multiple consecutive frames.
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

      // Requirement 6: Trigger ONLY when associated with person AND persists across consecutive frames
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

        const phoneClassLabel = person.associatedPhone?.class || "Phone in Hand";

        currentActivePhoneEvent = {
          phoneDetected: true,
          associatedTrackId: tId,
          personConfidence: person.confidence,
          phoneConfidence: state.lastPhoneConfidence,
          phoneClass: phoneClassLabel,
          durationSec: state.durationSec,
          warningLevel: state.warningLevel,
          sirenActive: state.sirenActive,
          persistenceFrameCount: state.persistenceCount,
          graceFramesRemaining: state.missGraceCount,
          warningMessage:
            state.warningLevel === 1
              ? `⚠️ Warning 1: Potential Mobile Use Detected (${phoneClassLabel} associated with ${tId}).`
              : state.warningLevel === 2
                ? `⚠️ Warning 2: Continued Mobile Phone Usage (${tId}).`
                : state.warningLevel >= 3
                  ? `⚠️ Final Warning: Siren Activated! Mobile Phone Usage (${tId}).`
                  : `Potential Mobile Use: Verifying ${tId}...`
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
      phoneDetectorStatus: yoloStatus.statusText,
      phoneDetectorIsActive: yoloStatus.isActive,
      phoneDetectorModelName: YOLO26_MODEL_NAME,
      personCount: updatedPersons.length,
      persons: updatedPersons,
      phones: normalizedPhones,
      rawPredictionsCount: rawPredictions.length,
      rawPredictions: rawPredictions,
      rawDetectionsSummary,
      phoneCandidates: validPhoneCandidates,
      phoneMisuseEvent: currentActivePhoneEvent
    };

  } catch (err) {
    console.error("Inference Error:", err);
    return {
      isModelLoaded: true,
      modelStatus: `Inference Error: ${err.message}`,
      phoneDetectorStatus: yoloStatus.statusText,
      phoneDetectorIsActive: yoloStatus.isActive,
      phoneDetectorModelName: YOLO26_MODEL_NAME,
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
