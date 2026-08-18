// Compressão de imagens antes do upload (economiza cota de Storage,
// acelera uploads e evita arquivos acima dos limites das regras).
// Com compressorjs: redimensiona para no máx. 1600px e ajusta a qualidade.
// Somente navegador (canvas); arquivos não-imagem (PDF) passam intactos.
import Compressor from 'compressorjs';

const FORMATOS_COMPRESSIVEIS = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];

function isImageCompressive(file: File): boolean {
  return FORMATOS_COMPRESSIVEIS.includes(file.type);
}

/**
 * Comprime a imagem quando vale a pena (originais > 400 KB ou fotos grandes).
 * Devolve um File novo (mesmo nome, extensão ajustada) ou o original se:
 *  - não for imagem comprimível (PDF, HEIC...)
 *  - o resultado ficar maior que o original
 */
export function comprimirImagem(file: File, maxW: number = 1600, maxH: number = 1600, qualidade: number = 0.72): Promise<File> {
  return new Promise((resolve) => {
    if (!isImageCompressive(file) || file.size <= 0) {
      resolve(file);
      return;
    }
    try {
      new Compressor(file, {
        maxWidth: maxW,
        maxHeight: maxH,
        quality: qualidade,
        convertSize: 400 * 1024, // só converte PNG→JPEG se o original passar de 400KB
        success(resultado) {
          const blob = resultado instanceof Blob ? resultado : file;
          if (blob.size >= file.size) {
            resolve(file); // compressão não ajudou — mantém o original
            return;
          }
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
          const extensaoOk = ['jpg', 'jpeg', 'png'].includes(ext) ? ext : 'jpg';
          resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extensaoOk}`, {
            type: blob.type || 'image/jpeg',
          }));
        },
        error() {
          resolve(file); // nunca bloqueia o upload por causa de compressão
        },
      });
    } catch (e) {
      resolve(file);
    }
  });
}
