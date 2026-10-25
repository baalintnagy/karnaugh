export async function copyText(source, focusTarget) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(source);
    copied = true;
  } catch {
    const field = document.createElement('textarea');
    field.value = source;
    field.setAttribute('aria-hidden', 'true');
    field.style.cssText = 'position:fixed;left:-9999px';
    document.body.append(field);
    field.select();
    try {
      copied = document.execCommand('copy');
    } catch {
    } finally {
      field.remove();
      focusTarget.focus();
    }
  }
  return copied;
}

export function downloadSvg(svg, filename) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
