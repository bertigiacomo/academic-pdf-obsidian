// Settings-changed notification. Every surface that shows pages (the preview
// pane, the export modal) subscribes; main.ts calls notifySettingsChanged()
// after each save. Replaces the upstream `activeModal?.render()` reach-in.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifySettingsChanged(): void {
  for (const l of Array.from(listeners)) l();
}

export function clearSettingsListeners(): void {
  listeners.clear();
}
