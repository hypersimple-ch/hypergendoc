const PDF_OBJECT_URL_TTL_MS = 60_000;

export function openTemporaryPdf(
  previewWindow: Window,
  bytes: ArrayBuffer,
  schedule: (callback: () => void, delay: number) => unknown = (
    callback,
    delay,
  ) => window.setTimeout(callback, delay),
) {
  const objectUrl = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" }),
  );
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(objectUrl);
  };
  previewWindow.addEventListener?.("load", revoke, { once: true });
  schedule(revoke, PDF_OBJECT_URL_TTL_MS);
  previewWindow.opener = null;
  previewWindow.location.replace(objectUrl);
  return objectUrl;
}
