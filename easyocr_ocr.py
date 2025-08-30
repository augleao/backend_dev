import sys
import easyocr

if len(sys.argv) < 2:
    print('Usage: python easyocr_ocr.py <image_path>')
    sys.exit(1)

image_path = sys.argv[1]
reader = easyocr.Reader(['pt', 'en'], gpu=False)
result = reader.readtext(image_path, detail=0)

# Junta as linhas em um único texto
print('\n'.join(result))
