/**
 * Modular Industrial Packaging Quality Inspection Engine
 * 
 * ARCHITECTURE DESIGN:
 * Modular pipeline structured for seamless replacement of simulated inspection stream
 * with real 3D Depth / Vision Camera feed & custom TensorRT/PyTorch/TFJS ML models:
 * 
 * Camera Stream -> Bottle Detector -> Inspection Zone -> Fill-Level Model -> Cap Defect Model -> Body Anomaly Model -> Quality Decision -> Ejector/Dashboard
 */

// Simulated Bottle Inspection State
export const CAP_STATUS = {
  PASS: "PASS",
  MISSING: "MISSING",
  MISALIGNED: "MISALIGNED",
  DAMAGED: "DAMAGED"
};

export const FILL_LEVEL_STATUS = {
  PASS: "PASS",
  LOW: "LOW FILL",
  HIGH: "HIGH FILL"
};

export const BOTTLE_BODY_STATUS = {
  PASS: "PASS",
  SURFACE_DEFECT: "SURFACE DEFECT",
  SHAPE_ANOMALY: "SHAPE ANOMALY"
};

export const OVERALL_RESULT = {
  PASS: "PASS",
  REJECT: "REJECT"
};

// Initial Seed Inspection Log
const SEED_LOG = [
  {
    id: "BTL-9840",
    time: "13:12:05",
    fillPercentage: 92,
    fillStatus: FILL_LEVEL_STATUS.PASS,
    capStatus: CAP_STATUS.PASS,
    bottleStatus: BOTTLE_BODY_STATUS.PASS,
    overallResult: OVERALL_RESULT.PASS,
    confidence: 0.98,
    ejected: false
  },
  {
    id: "BTL-9839",
    time: "13:12:02",
    fillPercentage: 71,
    fillStatus: FILL_LEVEL_STATUS.LOW,
    capStatus: CAP_STATUS.PASS,
    bottleStatus: BOTTLE_BODY_STATUS.PASS,
    overallResult: OVERALL_RESULT.REJECT,
    confidence: 0.96,
    ejected: true
  },
  {
    id: "BTL-9838",
    time: "13:11:59",
    fillPercentage: 91,
    fillStatus: FILL_LEVEL_STATUS.PASS,
    capStatus: CAP_STATUS.MISSING,
    bottleStatus: BOTTLE_BODY_STATUS.PASS,
    overallResult: OVERALL_RESULT.REJECT,
    confidence: 0.99,
    ejected: true
  },
  {
    id: "BTL-9837",
    time: "13:11:56",
    fillPercentage: 89,
    fillStatus: FILL_LEVEL_STATUS.PASS,
    capStatus: CAP_STATUS.PASS,
    bottleStatus: BOTTLE_BODY_STATUS.PASS,
    overallResult: OVERALL_RESULT.PASS,
    confidence: 0.97,
    ejected: false
  },
  {
    id: "BTL-9836",
    time: "13:11:53",
    fillPercentage: 94,
    fillStatus: FILL_LEVEL_STATUS.PASS,
    capStatus: CAP_STATUS.PASS,
    bottleStatus: BOTTLE_BODY_STATUS.SURFACE_DEFECT,
    overallResult: OVERALL_RESULT.REJECT,
    confidence: 0.93,
    ejected: true
  }
];

let bottleCounter = 9841;

/**
 * Generate a single inspection result (simulated or hooks to ML inference output)
 * @param {boolean} forceDefect - Optionally force a specific defect for UI testing
 */
export function inspectBottle(forceDefectType = null) {
  const bottleId = `BTL-${bottleCounter++}`;
  const time = new Date().toLocaleTimeString();

  let fillPercentage = Math.floor(Math.random() * 8) + 88; // 88% - 95% (Normal range)
  let fillStatus = FILL_LEVEL_STATUS.PASS;
  let capStatus = CAP_STATUS.PASS;
  let bottleStatus = BOTTLE_BODY_STATUS.PASS;
  let confidence = Math.round((0.92 + Math.random() * 0.07) * 100) / 100;

  // Decide if this bottle has a defect (~15% baseline defect rate for realistic testing)
  const isDefective = forceDefectType || Math.random() < 0.15;

  if (isDefective) {
    const defectChoice = forceDefectType || (Math.random() < 0.4 ? "LOW_FILL" : Math.random() < 0.7 ? "CAP" : "BODY");

    if (defectChoice === "LOW_FILL") {
      fillPercentage = Math.floor(Math.random() * 15) + 62; // 62% - 77% (Low fill)
      fillStatus = FILL_LEVEL_STATUS.LOW;
    } else if (defectChoice === "HIGH_FILL") {
      fillPercentage = Math.floor(Math.random() * 4) + 98; // 98% - 100% (High fill)
      fillStatus = FILL_LEVEL_STATUS.HIGH;
    } else if (defectChoice === "CAP") {
      const capSubChoices = [CAP_STATUS.MISSING, CAP_STATUS.MISALIGNED, CAP_STATUS.DAMAGED];
      capStatus = capSubChoices[Math.floor(Math.random() * capSubChoices.length)];
    } else if (defectChoice === "BODY") {
      bottleStatus = Math.random() < 0.6 ? BOTTLE_BODY_STATUS.SURFACE_DEFECT : BOTTLE_BODY_STATUS.SHAPE_ANOMALY;
    }
  }

  // OVERALL QUALITY DECISION
  const overallResult =
    fillStatus === FILL_LEVEL_STATUS.PASS &&
    capStatus === CAP_STATUS.PASS &&
    bottleStatus === BOTTLE_BODY_STATUS.PASS
      ? OVERALL_RESULT.PASS
      : OVERALL_RESULT.REJECT;

  return {
    id: bottleId,
    time,
    fillPercentage,
    fillStatus,
    capStatus,
    bottleStatus,
    overallResult,
    confidence,
    ejected: overallResult === OVERALL_RESULT.REJECT
  };
}

/**
 * Get initial state for Packaging Dashboard
 */
export function getInitialPackagingState() {
  return {
    conveyorStatus: "RUNNING", // RUNNING, PAUSED, ERROR
    conveyorSpeedHz: 45, // Conveyor belt speed metric
    cameraStatus: "3D VISION READY",
    aiModelStatus: "PROTOTYPE PIPELINE ACTIVE",
    isHardwareConnected: false,
    totalInspected: 142,
    totalPassed: 124,
    totalDefective: 18,
    defectBreakdown: {
      capDefects: 7,
      lowFillDefects: 6,
      bottleDefects: 4,
      otherDefects: 1
    },
    recentLogs: [...SEED_LOG],
    activeBottle: SEED_LOG[0]
  };
}
