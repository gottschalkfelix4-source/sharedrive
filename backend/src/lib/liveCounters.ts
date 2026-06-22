let activeDownloads = 0

export function incrementDownloads(): void { activeDownloads++ }
export function decrementDownloads(): void { activeDownloads = Math.max(0, activeDownloads - 1) }
export function getActiveDownloads(): number { return activeDownloads }
