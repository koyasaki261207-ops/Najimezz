import { useRef, useState, type MouseEvent, type WheelEvent } from "react";
import {
  Check,
  Copy,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Inbox,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { UseShelfResult } from "../hooks/useShelf";
import type { ShelfItem } from "../types/shelf";

interface ShelfPageProps {
  shelfCtrl: UseShelfResult;
  onNotify: (message: string) => void;
}

function formatFileSize(bytes: number, isDir: boolean): string {
  if (isDir) return "Folder";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function renderFileIcon(item: ShelfItem) {
  if (item.isDir) {
    return <Folder color="#F59E0B" size={22} strokeWidth={1.9} />;
  }
  switch (item.extension) {
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "gif":
    case "bmp":
    case "svg":
    case "ico":
      return <FileImage color="#38BDF8" size={22} strokeWidth={1.9} />;
    case "mp3":
    case "wav":
    case "flac":
    case "ogg":
    case "m4a":
      return <FileAudio color="#F472B6" size={22} strokeWidth={1.9} />;
    case "mp4":
    case "mkv":
    case "mov":
    case "avi":
    case "webm":
      return <FileVideo color="#A78BFA" size={22} strokeWidth={1.9} />;
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return <FileArchive color="#FB923C" size={22} strokeWidth={1.9} />;
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "rs":
    case "py":
    case "cpp":
    case "c":
    case "h":
    case "html":
    case "css":
    case "json":
    case "toml":
      return <FileCode color="#34D399" size={22} strokeWidth={1.9} />;
    case "pdf":
    case "doc":
    case "docx":
    case "txt":
    case "md":
    case "xlsx":
    case "pptx":
      return <FileText color="#60A5FA" size={22} strokeWidth={1.9} />;
    default:
      return <File color="#CBD5E1" size={22} strokeWidth={1.9} />;
  }
}

export function ShelfPage({ shelfCtrl, onNotify }: ShelfPageProps) {
  const {
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
  } = shelfCtrl;

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleStripWheel = (event: WheelEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    if (container.scrollWidth > container.clientWidth) {
      event.stopPropagation();
      container.scrollLeft += event.deltaY !== 0 ? event.deltaY : event.deltaX;
    }
  };

  const handleOpen = (item: ShelfItem) => {
    openItem(item.path).catch((err) => {
      onNotify(typeof err === "string" ? err : "Could not open file");
    });
  };

  const handleCopySingle = (event: MouseEvent, item: ShelfItem) => {
    event.stopPropagation();
    copyItems([item.path])
      .then(() => {
        setCopiedId(item.id);
        onNotify(`Copied "${item.name}" — Ctrl+V to paste`);
        window.setTimeout(() => {
          setCopiedId((curr) => (curr === item.id ? null : curr));
        }, 1400);
      })
      .catch((err) => {
        onNotify(typeof err === "string" ? err : "Failed to copy file");
      });
  };

  const handleCopyAll = () => {
    const paths = items.filter((item) => item.exists).map((item) => item.path);
    if (paths.length === 0) return;
    copyItems(paths)
      .then((count) => {
        setCopiedAll(true);
        onNotify(`Copied ${count} file${count > 1 ? "s" : ""} — Ctrl+V to paste`);
        window.setTimeout(() => setCopiedAll(false), 1400);
      })
      .catch((err) => {
        onNotify(typeof err === "string" ? err : "Failed to copy files");
      });
  };

  const handleReveal = (event: MouseEvent, item: ShelfItem) => {
    event.stopPropagation();
    revealItem(item.path).catch((err) => {
      onNotify(typeof err === "string" ? err : "Could not locate file");
    });
  };

  const handleRemove = (event: MouseEvent, id: string) => {
    event.stopPropagation();
    removeItem(id);
  };

  if (items.length === 0) {
    return (
      <button
        type="button"
        className={`shelf-dropzone ${isDragHovering ? "is-drag-over" : ""}`}
        disabled={picking}
        onClick={() => {
          pickFiles().catch(() => {});
        }}
      >
        <Inbox className="shelf-dropzone-icon" size={24} strokeWidth={1.9} />
        <span className="shelf-dropzone-title">
          {isDragHovering
            ? dragCount > 1
              ? `Release to add ${dragCount} items`
              : "Release to drop on Shelf"
            : "Drop files here"}
        </span>
        <span className="shelf-dropzone-sub">
          Click to browse · click item to open or copy
        </span>
      </button>
    );
  }

  return (
    <div className={`shelf-page ${isDragHovering ? "is-drag-over" : ""}`}>
      <div className="shelf-toolbar">
        <span className="shelf-count">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>

        <div className="shelf-toolbar-actions">
          <button
            type="button"
            className="shelf-tool-btn"
            disabled={picking}
            title="Add files"
            onClick={() => {
              pickFiles().catch(() => {});
            }}
          >
            <Plus size={11} strokeWidth={2.4} />
            <span>Add</span>
          </button>

          <button
            type="button"
            className={`shelf-tool-btn ${copiedAll ? "is-success" : ""}`}
            title="Copy all files to clipboard (Ctrl+V anywhere)"
            onClick={handleCopyAll}
          >
            {copiedAll ? (
              <Check size={11} strokeWidth={2.4} />
            ) : (
              <Copy size={11} strokeWidth={2.2} />
            )}
            <span>{copiedAll ? "Copied" : "Copy all"}</span>
          </button>

          <button
            type="button"
            className="shelf-tool-btn shelf-tool-btn-danger"
            title="Clear shelf"
            aria-label="Clear shelf"
            onClick={clearAll}
          >
            <Trash2 size={11} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="shelf-cards-row"
        onWheel={handleStripWheel}
      >
        {items.map((item) => {
          const isCopied = copiedId === item.id;
          return (
            <div
              key={item.id}
              className={`shelf-card ${!item.exists ? "is-missing" : ""}`}
              title={`${item.name}\n${item.path}\nClick to open`}
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpen(item);
                }
              }}
            >
              <div className="shelf-card-actions">
                <button
                  type="button"
                  className={`shelf-card-btn ${isCopied ? "is-copied" : ""}`}
                  title="Copy file (Ctrl+V to paste)"
                  aria-label={`Copy ${item.name}`}
                  onClick={(e) => handleCopySingle(e, item)}
                >
                  {isCopied ? (
                    <Check size={10} strokeWidth={2.5} />
                  ) : (
                    <Copy size={10} strokeWidth={2.2} />
                  )}
                </button>
                <button
                  type="button"
                  className="shelf-card-btn"
                  title="Show in Explorer"
                  aria-label={`Reveal ${item.name} in Explorer`}
                  onClick={(e) => handleReveal(e, item)}
                >
                  <FolderOpen size={10} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className="shelf-card-btn shelf-card-btn-remove"
                  title="Remove from Shelf"
                  aria-label={`Remove ${item.name}`}
                  onClick={(e) => handleRemove(e, item.id)}
                >
                  <X size={10} strokeWidth={2.4} />
                </button>
              </div>

              <div className="shelf-card-thumb">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.name} />
                ) : (
                  renderFileIcon(item)
                )}
              </div>

              <div className="shelf-card-name">{item.name}</div>
              <div className="shelf-card-size">
                {item.exists ? formatFileSize(item.sizeBytes, item.isDir) : "Missing"}
              </div>
            </div>
          );
        })}
      </div>

      {isDragHovering && (
        <div className="shelf-drag-overlay">
          <Inbox size={20} strokeWidth={2} />
          <span>
            {dragCount > 1
              ? `Drop to add ${dragCount} files`
              : "Drop to add to Shelf"}
          </span>
        </div>
      )}
    </div>
  );
}
