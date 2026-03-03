export async function copyToClipboardSafe(text: string): Promise<boolean> {
    const nav = typeof globalThis !== 'undefined' ? globalThis.navigator : undefined;
    const clipboard = nav?.clipboard;
    const writeText = clipboard?.writeText;

    if (typeof writeText === 'function') {
        try {
            await writeText.call(clipboard, text);
            return true;
        } catch {
            // Fallback below.
        }
    }

    const doc = typeof globalThis !== 'undefined' ? globalThis.document : undefined;
    if (!doc?.body) return false;

    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    doc.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const copied = doc.execCommand('copy');
    doc.body.removeChild(ta);
    return copied;
}
