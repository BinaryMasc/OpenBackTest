import { useRef, useCallback, useState } from 'react';
import type { Chart, Overlay, OverlayCreate } from 'klinecharts';

interface HistoryAction {
  type: 'ADD' | 'REMOVE';
  overlayId: string;
  config: OverlayCreate;
}

export function useUndoRedo() {
  const undoStack = useRef<HistoryAction[]>([]);
  const redoStack = useRef<HistoryAction[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const recordAction = useCallback((action: HistoryAction) => {
    undoStack.current.push(action);
    redoStack.current = [];
    if (undoStack.current.length > 50) undoStack.current.shift();
    updateFlags();
  }, [updateFlags]);

  const recordAdd = useCallback((overlay: Overlay) => {
    recordAction({
      type: 'ADD',
      overlayId: overlay.id,
      config: {
        name: overlay.name,
        id: overlay.id,
        groupId: overlay.groupId,
        points: overlay.points,
        styles: overlay.styles,
      },
    });
  }, [recordAction]);

  const recordRemove = useCallback((overlay: Overlay) => {
    recordAction({
      type: 'REMOVE',
      overlayId: overlay.id,
      config: {
        name: overlay.name,
        id: overlay.id,
        groupId: overlay.groupId,
        points: overlay.points,
        styles: overlay.styles,
      },
    });
  }, [recordAction]);

  const undo = useCallback((chart: Chart | null, onOverlayDeselected?: (id: string) => void) => {
    const action = undoStack.current.pop();
    if (!action || !chart) return;
    redoStack.current.push(action);
    if (action.type === 'ADD') {
      chart.removeOverlay({ id: action.overlayId });
      onOverlayDeselected?.(action.overlayId);
    } else if (action.type === 'REMOVE') {
      chart.createOverlay(action.config);
    }
    updateFlags();
  }, [updateFlags]);

  const redo = useCallback((chart: Chart | null, onOverlaySelected?: (overlay: Overlay) => void) => {
    const action = redoStack.current.pop();
    if (!action || !chart) return;
    undoStack.current.push(action);
    if (action.type === 'ADD') {
      chart.createOverlay(action.config);
      const overlay = chart.getOverlayById(action.overlayId);
      if (overlay) onOverlaySelected?.(overlay);
    } else if (action.type === 'REMOVE') {
      chart.removeOverlay({ id: action.overlayId });
    }
    updateFlags();
  }, [updateFlags]);

  return { undo, redo, recordAdd, recordRemove, canUndo, canRedo };
}
