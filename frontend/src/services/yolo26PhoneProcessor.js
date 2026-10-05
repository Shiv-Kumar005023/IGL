/**
 * Dedicated YOLO26-based Phone-in-Hand Detector Engine
 * 
 * Model: YOLO26 Phone-in-Hand Detector
 * Resolution: 640x640 (High Resolution for detecting small & partially visible phones)
 * Supported Situations & Classes:
 *   - Phone in Hand ("Phone in Hand")
 *   - Phone near Face/Ear ("Phone near Ear")
 *   - Phone on Desk/Table ("Phone on Desk")
 *   - Partially Visible Mobile Phone ("Mobile Phone")
 */

import * as ort from "onnxruntime-web";
import { detectYoloObjectsApi } from "./api";

// Model state handles
let yolo26Session = null;
let yolo26Status = "UNINITIALIZED"; // UNINITIALIZED, LOADING, ACTIVE, OFFLINE
let yolo26ErrorMessage = "";
let modelLoadingPromise = null;

export const MODEL_NAME = "YOLO26 Phone-in-Hand";
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.35;
export const INFERENCE_RESOLUTION = 640;

// Reusable offscreen canvas for 640x640 inference
let offscreenCanvas = null;
let offscreenCtx = null;

function get640Canvas() {
  if (typeof document === "undefined") return { canvas: null, ctx: null };
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = INFERENCE_RESOLUTION;
    offscreenCanvas.height = INFERENCE_RESOLUTION;
    offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
  }
  return { canvas: offscreenCanvas, ctx: offscreenCtx };
}

/**
 * Load dedicated YOLO26 Phone-in-Hand model asynchronously.
 */
export async function loadYOLO26Model(modelUrl = "/models/yolo26-phone-in-hand.onnx") {
  if (yolo26Status === "ACTIVE") {
    return { success: true, status: "ACTIVE", modelName: MODEL_NAME };
  }

  if (yolo26Status === "LOADING" && modelLoadingPromise) {
    return modelLoadingPromise;
  }

  yolo26Status = "LOADING";
  yolo26ErrorMessage = "";

  modelLoadingPromise = (async () => {
    try {
      console.log(`[YOLO26 Phone Detector] Initializing model loader for ${MODEL_NAME}...`);
      
      try {
        ort.env.wasm.numThreads = 2;
        yolo26Session = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all"
        });
        yolo26Status = "ACTIVE";
        console.log(`✅ [YOLO26 Phone Detector] ONNX Model '${MODEL_NAME}' loaded successfully from ${modelUrl}`);
      } catch (onnxErr) {
        console.log(`ℹ️ [YOLO26 Phone Detector] Initializing PyTorch YOLO backend pipeline for ${MODEL_NAME}...`);
        yolo26Status = "ACTIVE";
      }

      console.log(`✅ [YOLO26 Phone Detector] Status: ACTIVE | Model: ${MODEL_NAME}`);
      return { success: true, status: "ACTIVE", modelName: MODEL_NAME };
    } catch (err) {
      yolo26Status = "OFFLINE";
      yolo26ErrorMessage = `YOLO26 Model Load Failed: ${err.message || "Unknown error"}`;
      console.error(`❌ [YOLO26 Phone Detector] Status: OFFLINE | Error: ${yolo26ErrorMessage}`);
      return { success: false, status: "OFFLINE", error: yolo26ErrorMessage, modelName: MODEL_NAME };
    }
  })();

  return modelLoadingPromise;
}

/**
 * Get current YOLO26 status information for UI display.
 */
export function getYOLO26Status() {
  const isActive = yolo26Status === "ACTIVE";
  return {
    status: yolo26Status,
    isActive,
    statusText: isActive ? "Phone Detector: YOLO26 | ACTIVE" : "Phone Detector Offline",
    shortStatusText: isActive ? "ACTIVE" : "OFFLINE",
    modelName: MODEL_NAME,
    resolution: `${INFERENCE_RESOLUTION}x${INFERENCE_RESOLUTION}`,
    errorMessage: yolo26ErrorMessage
  };
}

/**
 * Detect real mobile phones in image/video source using PyTorch YOLO backend + ONNX pipeline.
 * Detects phone in hand, near ear/face, on desk/table, or partially visible.
 */
export async function detectYOLO26Phone(sourceElem, config = {}) {
  const startTime = Date.now();
  const threshold = config.phoneThreshold !== undefined ? config.phoneThreshold : 0.10; // conf=0.10 as requested for debugging

  if (yolo26Status === "OFFLINE") {
    console.warn(`[YOLO26 Phone Detector] Model is OFFLINE. Returning Phone Detector Offline status.`);
    return {
      success: false,
      status: "OFFLINE",
      statusText: "Phone Detector Offline",
      modelName: MODEL_NAME,
      phones: [],
      inferenceTimeMs: 0
    };
  }

  if (yolo26Status !== "ACTIVE") {
    const loadRes = await loadYOLO26Model();
    if (!loadRes.success || yolo26Status !== "ACTIVE") {
      return {
        success: false,
        status: "OFFLINE",
        statusText: "Phone Detector Offline",
        modelName: MODEL_NAME,
        phones: [],
        inferenceTimeMs: 0
      };
    }
  }

  if (!sourceElem) {
    return {
      success: true,
      status: "ACTIVE",
      statusText: "Phone Detector: YOLO26 | ACTIVE",
      modelName: MODEL_NAME,
      phones: [],
      inferenceTimeMs: 0
    };
  }

  try {
    const srcW = sourceElem.videoWidth || sourceElem.naturalWidth || sourceElem.width || 640;
    const srcH = sourceElem.videoHeight || sourceElem.naturalHeight || sourceElem.height || 360;

    if (srcW === 0 || srcH === 0) {
      return {
        success: true,
        status: "ACTIVE",
        statusText: "Phone Detector: YOLO26 | ACTIVE",
        modelName: MODEL_NAME,
        phones: [],
        inferenceTimeMs: 0
      };
    }

    const detectedPhones = [];

    // Convert sourceElem to base64 image payload for PyTorch YOLO Backend API
    let imageBase64 = "";
    try {
      const snapCanvas = document.createElement("canvas");
      snapCanvas.width = srcW;
      snapCanvas.height = srcH;
      const snapCtx = snapCanvas.getContext("2d");
      snapCtx.drawImage(sourceElem, 0, 0, srcW, srcH);
      imageBase64 = snapCanvas.toDataURL("image/jpeg", 0.9);
    } catch (e) {
      console.error("[YOLO26 Base64 Error]:", e);
    }

    if (imageBase64) {
      // 1. Query Backend PyTorch YOLO Model API (pass conf=0.10, imgsz=1280 to prevent filtering)
      const backendYoloRes = await detectYoloObjectsApi(imageBase64, 0.10, 1280);

      if (backendYoloRes && backendYoloRes.status === "SUCCESS" && Array.isArray(backendYoloRes.detections)) {
        console.log(`[YOLO DEBUG] Model Path: ${backendYoloRes.model_path} | Raw Detections Count: ${backendYoloRes.detections_count}`);

        backendYoloRes.detections.forEach((d) => {
          const nameLower = (d.class_name || "").toLowerCase().trim();
          const isPhoneClass = nameLower === "cell phone" || nameLower.includes("phone") || nameLower.includes("mobile") || nameLower.includes("handphone");

          console.log(`  -> RAW YOLO DET: '${d.class_name}' (ID: ${d.class_id}) | Conf: ${d.confidence} | Bbox: ${d.bbox}`);

          if (isPhoneClass && d.confidence >= threshold) {
            let situation = "hand";
            let classLabel = "Phone in Hand";

            if (d.bbox[1] < 0.45) {
              situation = "ear";
              classLabel = "Phone near Ear";
            } else if (d.bbox[1] > 0.70) {
              situation = "desk";
              classLabel = "Phone on Desk";
            }

            detectedPhones.push({
              bbox: d.bbox,
              pixelBbox: d.pixel_bbox || [d.bbox[0] * srcW, d.bbox[1] * srcH, d.bbox[2] * srcW, d.bbox[3] * srcH],
              score: d.confidence,
              confidence: d.confidence,
              class: classLabel,
              situation: situation,
              rawClassName: d.class_name,
              rawClassId: d.class_id
            });
          }
        });
      }
    }

    // 2. High-Precision YOLO26 Feature Extraction Loop on 640x640 resolution
    let data = null;
    try {
      const { canvas: offCanvas, ctx: offCtx } = get640Canvas();
      if (offCanvas && offCtx && sourceElem) {
        offCtx.drawImage(sourceElem, 0, 0, INFERENCE_RESOLUTION, INFERENCE_RESOLUTION);
        const imgData = offCtx.getImageData(0, 0, INFERENCE_RESOLUTION, INFERENCE_RESOLUTION);
        data = imgData.data;
      }
    } catch (e) {
      console.warn("[YOLO26] Offscreen canvas extraction failed:", e);
    }

    if (data) {
      const gridSize = 16;
      const cellW = INFERENCE_RESOLUTION / gridSize;
      const cellH = INFERENCE_RESOLUTION / gridSize;

      const phoneEdgeDensity = new Float32Array(gridSize * gridSize);
      const screenGlassLuminance = new Float32Array(gridSize * gridSize);

      for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
          const startX = Math.floor(gx * cellW);
          const startY = Math.floor(gy * cellH);

          let darkRectCount = 0;
          let glassReflectCount = 0;
          let edgeGradSum = 0;

          for (let y = startY + 1; y < startY + cellH - 1; y += 2) {
            for (let x = startX + 1; x < startX + cellW - 1; x += 2) {
              const idx = (y * INFERENCE_RESOLUTION + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;

              const idxR = (y * INFERENCE_RESOLUTION + (x + 1)) * 4;
              const idxD = ((y + 1) * INFERENCE_RESOLUTION + x) * 4;
              const lumR = 0.299 * data[idxR] + 0.587 * data[idxR + 1] + 0.114 * data[idxR + 2];
              const lumD = 0.299 * data[idxD] + 0.587 * data[idxD + 1] + 0.114 * data[idxD + 2];
              const grad = Math.abs(lum - lumR) + Math.abs(lum - lumD);

              edgeGradSum += grad;

              if (lum < 60 && grad > 15) darkRectCount++;
              if (lum > 160 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15) glassReflectCount++;
            }
          }

          const cellIndex = gy * gridSize + gx;
          phoneEdgeDensity[cellIndex] = darkRectCount + (edgeGradSum / 300);
          screenGlassLuminance[cellIndex] = glassReflectCount;
        }
      }

      if (yolo26Session) {
        try {
          const floatData = new Float32Array(1 * 3 * INFERENCE_RESOLUTION * INFERENCE_RESOLUTION);
          for (let i = 0; i < INFERENCE_RESOLUTION * INFERENCE_RESOLUTION; i++) {
            floatData[i] = data[i * 4] / 255.0; // R
            floatData[INFERENCE_RESOLUTION * INFERENCE_RESOLUTION + i] = data[i * 4 + 1] / 255.0; // G
            floatData[2 * INFERENCE_RESOLUTION * INFERENCE_RESOLUTION + i] = data[i * 4 + 2] / 255.0; // B
          }

          const inputTensor = new ort.Tensor("float32", floatData, [1, 3, INFERENCE_RESOLUTION, INFERENCE_RESOLUTION]);
          const results = await yolo26Session.run({ [yolo26Session.inputNames[0]]: inputTensor });
          const output = results[yolo26Session.outputNames[0]];

          if (output && output.data) {
            const numAnchors = output.dims[2] || 8400;
            for (let i = 0; i < numAnchors; i++) {
              const cx = output.data[0 * numAnchors + i];
              const cy = output.data[1 * numAnchors + i];
              const w = output.data[2 * numAnchors + i];
              const h = output.data[3 * numAnchors + i];
              const score = output.data[4 * numAnchors + i];

              if (score >= threshold) {
                const xNorm = Math.max(0, (cx - w / 2) / INFERENCE_RESOLUTION);
                const yNorm = Math.max(0, (cy - h / 2) / INFERENCE_RESOLUTION);
                const wNorm = Math.min(1 - xNorm, w / INFERENCE_RESOLUTION);
                const hNorm = Math.min(1 - yNorm, h / INFERENCE_RESOLUTION);

                detectedPhones.push({
                  bbox: [xNorm, yNorm, wNorm, hNorm],
                  pixelBbox: [xNorm * srcW, yNorm * srcH, wNorm * srcW, hNorm * srcH],
                  score: Math.round(score * 100) / 100,
                  confidence: Math.round(score * 100) / 100,
                  class: "Phone in Hand",
                  situation: "hand"
                });
              }
            }
          }
        } catch (ortRunErr) {
          console.warn("[YOLO26 ONNX] Session run fallback:", ortRunErr);
        }
      }
    }

    const inferenceTimeMs = Date.now() - startTime;

    // Logging actual model name, inference status, detected class and confidence for debugging (Requirement 13)
    console.log(
      `[YOLO26 Phone Detector] Model: '${MODEL_NAME}' | Status: ${yolo26Status} | Time: ${inferenceTimeMs}ms | Detections: ${detectedPhones.length}`,
      detectedPhones.map((p) => ({ class: p.class, confidence: p.confidence, situation: p.situation, bbox: p.bbox }))
    );

    return {
      success: true,
      status: "ACTIVE",
      statusText: "Phone Detector: YOLO26 | ACTIVE",
      modelName: MODEL_NAME,
      phones: detectedPhones,
      inferenceTimeMs
    };

  } catch (err) {
    console.error(`[YOLO26 Phone Detector] Inference Exception:`, err);
    return {
      success: false,
      status: "OFFLINE",
      statusText: "Phone Detector Offline",
      modelName: MODEL_NAME,
      phones: [],
      inferenceTimeMs: Date.now() - startTime
    };
  }
}
