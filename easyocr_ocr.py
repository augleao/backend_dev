
import sys
import easyocr
import os

if len(sys.argv) < 2:
    print('[PYTHON][ERRO] Uso: python easyocr_ocr.py <image_path>')
    sys.exit(1)

image_path = sys.argv[1]
if not os.path.exists(image_path):
    print(f'[PYTHON][ERRO] Arquivo não encontrado: {image_path}')
    sys.exit(2)

try:
    reader = easyocr.Reader(['pt', 'en'], gpu=False)
    result = reader.readtext(image_path, detail=0)
    if not result:
        print('[PYTHON][INFO] EasyOCR não encontrou texto na imagem.')
    else:
        print('\n'.join(result))
except Exception as e:
    print(f'[PYTHON][ERRO] Falha ao rodar EasyOCR: {e}')
    sys.exit(3)
