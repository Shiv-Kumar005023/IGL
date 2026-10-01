import math
import json
import base64

# Try importing numpy and cv2 if installed
try:
    import numpy as np
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

def assess_frame_quality(image_bytes):
    """
    Real quality assessment: measures brightness and blur score on actual frame bytes.
    Returns: { 'is_assessable': bool, 'brightness': float, 'blur_score': float, 'reason': str }
    """
    if not HAS_CV2 or not image_bytes:
        return {
            'is_assessable': False,
            'brightness': 0.0,
            'blur_score': 0.0,
            'reason': "CV2 processing module uninitialized"
        }

    try:
        # Decode image from bytes
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {
                'is_assessable': False,
                'brightness': 0.0,
                'blur_score': 0.0,
                'reason': "Corrupted or unreadable frame stream"
            }

        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 1. Mean brightness (0-255)
        brightness = float(np.mean(gray))

        # 2. Blur variance via Laplacian (higher = sharp, lower = blurry)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # Quality thresholds
        if brightness < 30.0:
            return {
                'is_assessable': False,
                'brightness': round(brightness, 1),
                'blur_score': round(blur_score, 1),
                'reason': f"NOT ASSESSABLE: Extremely dark environment (Brightness: {round(brightness, 1)}/255)"
            }
        
        if blur_score < 40.0:
            return {
                'is_assessable': False,
                'brightness': round(brightness, 1),
                'blur_score': round(blur_score, 1),
                'reason': f"NOT ASSESSABLE: Severe lens blur / camera occlusion (Blur score: {round(blur_score, 1)}/1000)"
            }

        return {
            'is_assessable': True,
            'brightness': round(brightness, 1),
            'blur_score': round(blur_score, 1),
            'reason': "OK"
        }

    except Exception as e:
        return {
            'is_assessable': False,
            'brightness': 0.0,
            'blur_score': 0.0,
            'reason': f"NOT ASSESSABLE: Frame processing error ({str(e)})"
        }

def is_point_in_polygon(point, polygon):
    """
    Ray-casting algorithm to test if point (x, y) is inside a polygon [(x1, y1), (x2, y2), ...]
    """
    x, y = point
    n = len(polygon)
    inside = False

    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y

    return inside

def calculate_distance(box1, box2):
    """
    Calculates distance between center points of two bounding boxes [x, y, w, h] (normalized 0-1)
    """
    cx1 = box1[0] + box1[2] / 2.0
    cy1 = box1[1] + box1[3] / 2.0

    cx2 = box2[0] + box2[2] / 2.0
    cy2 = box2[1] + box2[3] / 2.0

    dist = math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2)
    return round(dist, 4)
