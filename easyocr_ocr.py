
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


import sys
import os
import easyocr

def main():
    print(f'[PYTHON][INFO] Iniciando OCR para: {sys.argv[1] if len(sys.argv) > 1 else "(sem argumento)"}')
    if len(sys.argv) < 2:
        print('[PYTHON][ERRO] Caminho da imagem não fornecido.')
        sys.exit(1)
    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        print(f'[PYTHON][ERRO] Arquivo não encontrado: {image_path}')
        sys.exit(1)
    try:
        reader = easyocr.Reader(['pt', 'en'], gpu=False)
        result = reader.readtext(image_path, detail=0, paragraph=True)
        if not result or not any(line.strip() for line in result):
            print('[PYTHON][INFO] Nenhum texto encontrado pela EasyOCR.')
        else:
            print('[PYTHON][INFO] Texto encontrado pela EasyOCR:')
            print('\n'.join(result))
    except Exception as e:
        print(f'[PYTHON][ERRO] Exceção no EasyOCR: {e}')
        sys.exit(1)
    print('[PYTHON][INFO] Fim do script easyocr_ocr.py')

if __name__ == '__main__':
    main()
