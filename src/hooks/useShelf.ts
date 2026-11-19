import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ShelfDragPayload, ShelfItem } from "../types/shelf";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface UseShelfResult {
  items: ShelfItem[];
  isDragHovering: boolean;
  dragCount: number;
  picking: boolean;
  pickFiles: () => Promise<void>;
  removeItem: (id: string) => void;
  clearAll: () => void;
  openItem: (path: string) => Promise<void>;
  revealItem: (path: string) => Promise<void>;
  copyItems: (paths: string[]) => Promise<number>;
}

export function useShelf(): UseShelfResult {
  const tauri = isTauriRuntime();
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [isDragHovering, setIsDragHovering] = useState(false);
  const [dragCount, setDragCount] = useState(0);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!tauri) return;

    let unlistenUpdate: (() => void) | undefined;
    let unlistenDrag: (() => void) | undefined;

    invoke<ShelfItem[]>("get_shelf_items")
      .then((loaded) => setItems(loaded))
      .catch(() => {});

    listen<ShelfItem[]>("shelf:update", (event) => {
      setItems(event.payload);
    })
      .then((fn) => {
        unlistenUpdate = fn;
      })
      .catch(() => {});

    listen<ShelfDragPayload>("shelf:drag-hover", (event) => {
      setIsDragHovering(event.payload.hovering);
      setDragCount(event.payload.count);
    })
      .then((fn) => {
        unlistenDrag = fn;
      })
      .catch(() => {});

    return () => {
      if (unlistenUpdate) unlistenUpdate();
      if (unlistenDrag) unlistenDrag();
    };
  }, [tauri]);

  const pickFiles = useCallback(async () => {
    if (!tauri || picking) return;
    setPicking(true);
    try {
      const updated = await invoke<ShelfItem[]>("pick_shelf_files");
      setItems(updated);
    } finally {
      setPicking(false);
    }
  }, [picking, tauri]);

  const removeItem = useCallback(
    (id: string) => {
      if (!tauri) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        return;
      }
      invoke<ShelfItem[]>("remove_shelf_item", { id })
        .then((updated) => setItems(updated))
        .catch(() => {});
    },
    [tauri]
  );

  const clearAll = useCallback(() => {
    if (!tauri) {
      setItems([]);
      return;
    }
    invoke<ShelfItem[]>("clear_shelf")
      .then((updated) => setItems(updated))
      .catch(() => {});
  }, [tauri]);

  const openItem = useCallback(
    async (path: string) => {
      if (!tauri) return;
      await invoke("open_shelf_item", { path });
    },
    [tauri]
  );

  const revealItem = useCallback(
    async (path: string) => {
      if (!tauri) return;
      await invoke("reveal_shelf_item", { path });
    },
    [tauri]
  );

  const copyItems = useCallback(
    async (paths: string[]) => {
      if (!tauri) return paths.length;
      return invoke<number>("copy_shelf_files", { paths });
    },
    [tauri]
  );

  return {
    items,
    isDragHovering,
    dragCount,
    picking,
    pickFiles,
    removeItem,
    clearAll,
    openItem,
    revealItem,
    copyItems,
  };
}
