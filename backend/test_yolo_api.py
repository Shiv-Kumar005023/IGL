import requests
import base64
import json

img_path = r"C:\Users\acer\.gemini\antigravity-ide\brain\75a6634b-b125-496c-96b9-acc0be049f9e\phone_near_ear_1791037274007.jpg"

with open(img_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode('utf-8')

print("Sending POST request to http://127.0.0.1:8000/api/yolo/detect (conf=0.10, imgsz=1280)...")
res = requests.post("http://127.0.0.1:8000/api/yolo/detect", json={
    "image_base64": f"data:image/jpeg;base64,{b64}",
    "conf": 0.10,
    "imgsz": 1280
})

print("HTTP Response Code:", res.status_code)
data = res.json()
print("API Response JSON:")
print(json.dumps(data, indent=2))
