const input = document.getElementById('url') as HTMLInputElement;
const status = document.getElementById('status')!;

chrome.storage.sync.get('relayUrl').then(({ relayUrl }) => {
  if (typeof relayUrl === 'string') input.value = relayUrl;
});

document.getElementById('save')!.addEventListener('click', async () => {
  await chrome.storage.sync.set({ relayUrl: input.value.trim() });
  status.textContent = 'Saved.';
});
