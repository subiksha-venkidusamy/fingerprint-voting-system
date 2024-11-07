import cv2
import numpy as np
import hashlib
import sys

def process_fingerprint(image_path):
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError(f"Image at {image_path} could not be loaded.")
    _, processed_image = cv2.threshold(image, 128, 255, cv2.THRESH_BINARY)
    return processed_image

def extract_features(image):
    return image.tobytes()

def create_fingerprint_hash(fingerprint_data):
    return hashlib.sha256(fingerprint_data).hexdigest()

def match_fingerprint(image_path, stored_hash):
    processed_image = process_fingerprint(image_path)
    fingerprint_data = extract_features(processed_image)
    fingerprint_hash = create_fingerprint_hash(fingerprint_data)
    if fingerprint_hash == stored_hash:
        print("MATCH")
    else:
        print("NO_MATCH")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python check.py <image_path> <stored_hash>")
        sys.exit(1)
    
    image_path = sys.argv[1] 
    stored_hash = sys.argv[2] 
    try:
        match_fingerprint(image_path, stored_hash)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
