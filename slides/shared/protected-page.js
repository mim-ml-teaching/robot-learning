// Decrypt on the reader's device. Only the encrypted file is requested from the server.
export function showHTML(html) {
  document.open();
  document.write(html);
  document.close();
}

export function unlockForm(file, prepareHTML = text => text) {
  const form = document.querySelector('form');
  const input = form.querySelector('input[type=password]');
  const button = form.querySelector('button');
  const status = document.querySelector('[role=status]');
  if (!window.crypto?.subtle || !window.DecompressionStream) {
    status.textContent = 'Open this page over HTTPS in a current browser.';
    return;
  }
  button.disabled = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    input.readOnly = true;
    status.textContent = 'Opening…';
    let errorMessage = 'Could not load the file. Check your connection and try again.';
    try {
      const response = await fetch(file, { cache: 'no-cache', credentials: 'omit' });
      if (!response.ok) throw new Error();
      const packet = new Uint8Array(await response.arrayBuffer());
      const password = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(input.value), 'PBKDF2', false, ['deriveKey']
      );
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: packet.subarray(0, 16), iterations: 600000, hash: 'SHA-256' },
        password, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );
      errorMessage = 'Could not unlock the file. Check the password and try again.';
      const gzip = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: packet.subarray(16, 28) }, key, packet.subarray(28)
      );
      errorMessage = 'Could not open the file. Reload the page and try again.';
      const stream = new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'));
      const html = prepareHTML(await new Response(stream).text());
      input.value = '';
      showHTML(html);
    } catch {
      status.textContent = errorMessage;
      button.disabled = false;
      input.readOnly = false;
      input.focus();
      input.select();
    }
  });
}
