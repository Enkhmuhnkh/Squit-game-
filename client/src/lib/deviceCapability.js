/**
 * Сул төхөөрөмж дээр 3D (three.js) анхнаасаа 2D-гээр нээгдэхийг тодорхойлно.
 * Зөвхөн хэрэглэгч гараар сонгоогүй үед л (localStorage-д хадгалсан утга байхгүй)
 * анхны default-ийг тооцоход ашиглана — гар сонголт үргэлж давамгайлна.
 */
export function detectPreferredView() {
  try {
    const cores = navigator.hardwareConcurrency ?? 8;
    if (cores <= 4) return '2d';

    const mem = navigator.deviceMemory; // зарим browser-д байхгүй — тодорхойгүй бол алгасна
    if (typeof mem === 'number' && mem < 4) return '2d';

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '2d';

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '');
      if (/swiftshader|llvmpipe|software/i.test(renderer)) return '2d';
    }
    return '3d';
  } catch {
    return '3d';
  }
}
