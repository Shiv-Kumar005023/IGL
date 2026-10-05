import sys
import os
import json
import cv2
from ultralytics import YOLO

def debug_yolo_phone_pipeline(image_path, model_path="yolov8n.pt", conf=0.10, imgsz=1280):
    print("=" * 80)
    print("=== LAYER 1: MODEL LOAD ===")
    print(f"Loading YOLO Model from path: {model_path}")
    
    try:
        model = YOLO(model_path)
        actual_model_path = getattr(model, 'ckpt_path', model_path)
        print(f"✅ Loaded Model Path/Name: {actual_model_path}")
        print(f"✅ Model Class List (model.names):")
        print(json.dumps(model.names, indent=2))
        
        # Check if phone classes exist in model.names
        phone_class_matches = []
        for class_id, class_name in model.names.items():
            name_lower = str(class_name).lower().strip()
            if any(k in name_lower for k in ['phone', 'cell', 'mobile', 'handphone']):
                phone_class_matches.append((class_id, class_name))
        
        print(f"🔍 Found Phone-related Classes in Model: {phone_class_matches}")
        
    except Exception as e:
        print(f"❌ MODEL LOAD FAILED: {str(e)}")
        return

    print("\n" + "=" * 80)
    print("=== LAYER 2: RAW YOLO DETECTION ===")
    print(f"Running Inference on Image: {image_path}")
    print(f"Inference Parameters: conf={conf}, imgsz={imgsz}")

    if not os.path.exists(image_path):
        print(f"❌ Image path not found: {image_path}")
        return

    results = model.predict(source=image_path, conf=conf, imgsz=imgsz, save=False)
    result = results[0]

    raw_detections = []
    phone_detections = []
    
    boxes = result.boxes
    if boxes is not None and len(boxes) > 0:
        for i, box in enumerate(boxes):
            cls_id = int(box.cls[0].item())
            cls_name = model.names.get(cls_id, str(cls_id))
            score = float(box.conf[0].item())
            xyxy = box.xyxy[0].tolist()
            xywh = box.xywh[0].tolist()
            
            det_info = {
                "idx": i,
                "class_id": cls_id,
                "class_name": cls_name,
                "confidence": round(score, 4),
                "bbox_xyxy": [round(v, 1) for v in xyxy],
                "bbox_xywh": [round(v, 1) for v in xywh]
            }
            raw_detections.append(det_info)
            
            name_lower = cls_name.lower().strip()
            if any(k in name_lower for k in ['phone', 'cell', 'mobile', 'handphone']):
                phone_detections.append(det_info)
                
            print(f"  [{i+1}/{len(boxes)}] Class: '{cls_name}' (ID: {cls_id}) | Conf: {score:.4f} | Box: {[round(v, 1) for v in xyxy]}")
    else:
        print("  ⚠️ Zero detections returned by YOLO at conf=0.10!")

    print(f"\nRaw Total Detections: {len(raw_detections)}")
    print(f"Raw Phone Detections: {len(phone_detections)}")

    print("\n" + "=" * 80)
    print("=== LAYER 3: CLASS FILTER & EVALUATION ===")
    if len(phone_detections) == 0:
        print("❌ MODEL FAILED TO DETECT PHONE")
        print(f"   Model Path: {actual_model_path}")
        print(f"   Model Class List: {list(model.names.values())[:15]}...")
        print(f"   Raw Detections Count: {len(raw_detections)}")
    else:
        print("✅ RAW YOLO DETECTED PHONE SUCCESSFULLY!")
        for pd in phone_detections:
            print(f"   -> DETECTED PHONE: '{pd['class_name']}' (ID: {pd['class_id']}) with {pd['confidence']*100:.1f}% confidence.")

    # Save Annotated Output Image (Requirement 5)
    out_dir = r"c:\Users\acer\.gemini\antigravity-ide\brain\75a6634b-b125-496c-96b9-acc0be049f9e"
    out_path = os.path.join(out_dir, f"annotated_{os.path.basename(image_path)}")
    res_plotted = result.plot()
    cv2.imwrite(out_path, res_plotted)
    print(f"\n📸 Saved Annotated YOLO Output to: {out_path}")

    print("\n" + "=" * 80)
    print("=== FINAL DEBUG DIAGNOSIS ===")
    if len(phone_detections) == 0:
        print("DIAGNOSIS: [MODEL -> RAW DETECTION LAYER FAILING]")
        print("  The YOLO model weights loaded at runtime did not detect the phone in the image.")
    else:
        print("DIAGNOSIS: [RAW YOLO DETECTION SUCCEEDED]")
        print("  Raw YOLO successfully detects the phone. Next step: Ensure API and Frontend receive and render these exact bounding boxes!")
    print("=" * 80)

if __name__ == '__main__':
    img_ear = r"C:\Users\acer\.gemini\antigravity-ide\brain\75a6634b-b125-496c-96b9-acc0be049f9e\phone_near_ear_1791037274007.jpg"
    img_hand = r"C:\Users\acer\.gemini\antigravity-ide\brain\75a6634b-b125-496c-96b9-acc0be049f9e\clear_phone_in_hand_1791037229447.jpg"
    img_desk = r"C:\Users\acer\.gemini\antigravity-ide\brain\75a6634b-b125-496c-96b9-acc0be049f9e\phone_on_desk_1791037294902.jpg"
    img_none = r"C:\Users\acer\.gemini\antigravity-ide\brain\75a6634b-b125-496c-96b9-acc0be049f9e\image_no_phone_1791037320529.jpg"

    print("\n>>> TESTING TEST CASE A: PHONE NEAR EAR <<<")
    debug_yolo_phone_pipeline(img_ear, conf=0.10, imgsz=1280)

    print("\n>>> TESTING TEST CASE B: CLEAR PHONE IN HAND <<<")
    debug_yolo_phone_pipeline(img_hand, conf=0.10, imgsz=1280)

    print("\n>>> TESTING TEST CASE C: PHONE ON DESK <<<")
    debug_yolo_phone_pipeline(img_desk, conf=0.10, imgsz=1280)

    print("\n>>> TESTING TEST CASE D: IMAGE WITH NO PHONE <<<")
    debug_yolo_phone_pipeline(img_none, conf=0.10, imgsz=1280)
