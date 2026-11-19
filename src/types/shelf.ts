export interface ShelfItem {
  id: string;
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  isDir: boolean;
  exists: boolean;
  thumbnail: string | null;
  addedAtMs: number;
}

export interface ShelfDragPayload {
  hovering: boolean;
  count: number;
}
