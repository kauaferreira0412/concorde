import { useRef, useState } from "react";

function hasFiles(e) {
  return [...(e.dataTransfer?.types || [])].includes("Files");
}

/** Arrastar e soltar arquivo numa área. Devolve { dragging, dropProps } pra espalhar no elemento. */
export function useFileDrop(onFile, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const dropProps = {
    onDragEnter(e) {
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver(e) {
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(e) {
      if (!enabled || !hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop(e) {
      if (!enabled || !hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
  };

  return { dragging, dropProps };
}
