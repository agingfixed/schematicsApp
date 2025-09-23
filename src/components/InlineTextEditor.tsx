import React, {
  ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { NodeModel } from '../types/scene';
import { CaretPoint, placeCaretAtPoint } from '../utils/text';
import '../styles/inline-text-editor.css';

interface InlineTextEditorProps {
  node: NodeModel;
  bounds: { x: number; y: number; width: number; height: number } | null;
  isEditing: boolean;
  scale: number;
  entryPoint: CaretPoint | null;
  onCommit: (value: string) => void;
  onCancel: () => void;
  shouldIgnoreBlur?: () => boolean;
}

export interface InlineTextEditorHandle {
  commit: () => void;
  cancel: () => void;
  getElement: () => HTMLDivElement | null;
}

const InlineTextEditorComponent = (
  {
    node,
    bounds,
    isEditing,
    scale,
    entryPoint,
    onCommit,
    onCancel,
    shouldIgnoreBlur
  }: InlineTextEditorProps,
  ref: ForwardedRef<InlineTextEditorHandle>
) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(node.text);
  const isComposingRef = useRef(false);
  const cancelledRef = useRef(false);

  const readCurrentValue = useCallback(() => {
    const element = editorRef.current;
    if (!element) {
      return valueRef.current;
    }
    return element.innerHTML;
  }, []);

  const commitValue = useCallback(() => {
    const text = readCurrentValue();
    valueRef.current = text;
    onCommit(text);
  }, [onCommit, readCurrentValue]);

  const cancelEditing = useCallback(() => {
    cancelledRef.current = true;
    onCancel();
  }, [onCancel]);

  useImperativeHandle(
    ref,
    () => ({
      commit: () => {
        if (isEditing) {
          commitValue();
        }
      },
      cancel: () => {
        if (isEditing) {
          cancelEditing();
        }
      },
      getElement: () => editorRef.current
    }),
    [commitValue, cancelEditing, isEditing]
  );

  useEffect(() => {
    if (!isEditing) {
      valueRef.current = node.text;
      return;
    }

    const element = editorRef.current;
    if (!element) {
      return;
    }

    cancelledRef.current = false;
    isComposingRef.current = false;
    valueRef.current = node.text;
    element.innerHTML = node.text;

    const frame = requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      placeCaretAtPoint(element, entryPoint);
    });

    return () => cancelAnimationFrame(frame);
  }, [isEditing, node.text, entryPoint]);

  if (!isEditing || !bounds) {
    return null;
  }

  const paddingTop = 6 * scale;
  const paddingBottom = 10 * scale;
  const paddingX = 14 * scale;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    padding: `${paddingTop}px ${paddingX}px ${paddingBottom}px`,
    fontSize: node.fontSize * scale,
    fontWeight: node.fontWeight,
    lineHeight: 1.3,
    color: node.textColor,
    textAlign: node.textAlign,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflow: 'hidden',
    background: 'transparent',
    caretColor: node.textColor,
    zIndex: 30
  };

  const handleInput = () => {
    valueRef.current = readCurrentValue();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      if (isComposingRef.current) {
        return;
      }
      event.preventDefault();
      commitValue();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  };

  const handleBlur = () => {
    if (isComposingRef.current || cancelledRef.current) {
      return;
    }
    if (shouldIgnoreBlur?.()) {
      return;
    }
    commitValue();
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    valueRef.current = readCurrentValue();
  };

  return (
    <div
      ref={editorRef}
      className="inline-text-editor"
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    />
  );
};

export const InlineTextEditor = forwardRef(InlineTextEditorComponent);
