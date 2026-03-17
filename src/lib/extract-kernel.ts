// Kernel extraction - calls server-side API route
// (NEXT_PUBLIC_ env vars don't work at runtime on Cloud Run, so we use an API route)

export async function extractKernelUpdates(
  userText: string,
  agentText: string,
  currentMemories: string[],
  currentContext: string[]
) {
  try {
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userText,
        agentText,
        currentMemories,
        currentContext,
      }),
    });

    if (!response.ok) {
      throw new Error(`Extraction API failed: ${response.status}`);
    }

    return await response.json();
  } catch (e) {
    console.error('Extraction failed:', e);
    return null;
  }
}
